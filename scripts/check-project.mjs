import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];

function collectFiles(directory, extension) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return collectFiles(path, extension);
    return extname(entry.name) === extension ? [path] : [];
  });
}

function fail(message) {
  failures.push(message);
}

const JavaScriptFiles = [
  ...collectFiles(join(projectRoot, 'js'), '.js'),
  join(projectRoot, 'sw.js')
];

for (const file of JavaScriptFiles) {
  const result = spawnSync(process.execPath, ['--check', file], {
    cwd: projectRoot,
    encoding: 'utf8'
  });
  if (result.status !== 0) {
    fail(`JavaScript syntax: ${relative(projectRoot, file)}\n${result.stderr.trim()}`);
  }
}

const htmlPath = join(projectRoot, 'index.html');
const html = readFileSync(htmlPath, 'utf8');
const ids = [...html.matchAll(/\bid\s*=\s*["']([^"']+)["']/g)].map(match => match[1]);
const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
if (duplicateIds.length) fail(`Duplicate HTML ids: ${duplicateIds.join(', ')}`);

const localReferences = [...html.matchAll(/\b(?:href|src)\s*=\s*["']([^"']+)["']/g)]
  .map(match => match[1])
  .filter(reference =>
    reference
    && !reference.startsWith('#')
    && !reference.startsWith('data:')
    && !reference.startsWith('blob:')
    && !reference.startsWith('mailto:')
    && !reference.startsWith('tel:')
    && !/^https?:\/\//i.test(reference)
  );

for (const reference of localReferences) {
  const cleanReference = reference.split(/[?#]/, 1)[0].replace(/^\.\//, '');
  const target = join(projectRoot, cleanReference);
  if (!existsSync(target) || !statSync(target).isFile()) {
    fail(`Missing local asset referenced by index.html: ${reference}`);
  }
}

const manifestPath = join(projectRoot, 'manifest.webmanifest');
let manifest;
try {
  manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
} catch (error) {
  fail(`Invalid manifest.webmanifest JSON: ${error.message}`);
}

for (const icon of manifest?.icons || []) {
  const target = join(projectRoot, String(icon.src || '').replace(/^\.\//, ''));
  if (!existsSync(target)) fail(`Missing manifest icon: ${icon.src}`);
}

const serviceWorker = readFileSync(join(projectRoot, 'sw.js'), 'utf8');
const appShellMatch = serviceWorker.match(/const APP_SHELL\s*=\s*\[([\s\S]*?)\];/);
if (!appShellMatch) {
  fail('Unable to find the service worker APP_SHELL list.');
} else {
  const appShellAssets = [...appShellMatch[1].matchAll(/['"]([^'"]+)['"]/g)]
    .map(match => match[1])
    .filter(asset => asset !== './');

  for (const asset of appShellAssets) {
    const target = join(projectRoot, asset.replace(/^\.\//, ''));
    if (!existsSync(target)) fail(`Missing service worker app-shell asset: ${asset}`);
  }
}

if (!html.includes('Content-Security-Policy')) {
  fail('index.html must define a Content Security Policy.');
}

if (failures.length) {
  console.error(`Project checks failed (${failures.length}):`);
  failures.forEach((message, index) => console.error(`\n${index + 1}. ${message}`));
  process.exit(1);
}

console.log(`Project checks passed: ${JavaScriptFiles.length} JavaScript files, ${localReferences.length} local references.`);

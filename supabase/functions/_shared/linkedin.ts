export const LINKEDIN_SCOPES = "openid profile w_member_social";

export class HttpError extends Error {
  status: number;
  code: string;

  constructor(status: number, message: string, code = "") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function corsHeaders(methods = "GET, POST, DELETE, OPTIONS") {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": methods,
    "Content-Type": "application/json",
  };
}

export function json(body: Record<string, unknown>, status = 200, headers = corsHeaders()) {
  return new Response(JSON.stringify(body), { status, headers });
}

export function redirect(location: string) {
  return new Response(null, {
    status: 302,
    headers: {
      Location: location,
      "Cache-Control": "no-store",
    },
  });
}

export function requiredEnv(name: string) {
  const value = Deno.env.get(name)?.trim();
  if (!value) {
    throw new HttpError(500, `Missing ${name}`, "missing_server_config");
  }
  return value;
}

export function getSupabaseUrl() {
  return requiredEnv("SUPABASE_URL").replace(/\/+$/, "");
}

export function getLinkedInRedirectUri() {
  return Deno.env.get("LINKEDIN_REDIRECT_URI")?.trim()
    || `${getSupabaseUrl()}/functions/v1/linkedin-oauth-callback`;
}

export async function requireUser(req: Request) {
  const authorization = req.headers.get("authorization") || "";
  if (!authorization.toLowerCase().startsWith("bearer ")) {
    throw new HttpError(401, "Authentication is required", "auth_required");
  }

  const response = await fetch(`${getSupabaseUrl()}/auth/v1/user`, {
    headers: {
      apikey: requiredEnv("SUPABASE_ANON_KEY"),
      authorization,
    },
  });

  if (!response.ok) {
    throw new HttpError(401, "Invalid Supabase session", "invalid_session");
  }

  const user = await response.json();
  if (!user?.id) {
    throw new HttpError(401, "Invalid Supabase user", "invalid_user");
  }

  return { user, authorization };
}

export async function serviceFetch(path: string, init: RequestInit = {}) {
  const serviceKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const headers = new Headers(init.headers || {});
  headers.set("apikey", serviceKey);
  headers.set("Authorization", `Bearer ${serviceKey}`);

  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  return fetch(`${getSupabaseUrl()}/rest/v1/${path}`, {
    ...init,
    headers,
  });
}

export async function serviceJson<T>(path: string, init: RequestInit = {}) {
  const response = await serviceFetch(path, init);
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    console.log("SUPABASE_SERVICE_ERROR:", response.status, text);
    throw new HttpError(500, "Supabase service request failed", "supabase_service_failed");
  }

  if (response.status === 204) return null as T;
  const text = await response.text();
  return (text ? JSON.parse(text) : null) as T;
}

export function createStateToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

export async function sha256Hex(value: string) {
  const input = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", input);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function resolveAppUrl(requestedUrl = "") {
  const allowed = getAllowedAppUrls();
  const normalized = normalizeAppUrl(requestedUrl);
  if (normalized && allowed.some((url) => sameAppUrl(url, normalized))) {
    return normalized;
  }

  return allowed[0];
}

export function buildAppRedirect(appUrl: string, params: Record<string, string>) {
  const target = normalizeAppUrl(appUrl) || getAllowedAppUrls()[0];
  const query = new URLSearchParams(params).toString();
  return `${target}#/settings${query ? `?${query}` : ""}`;
}

export function handleError(error: unknown, headers = corsHeaders()) {
  console.log("LINKEDIN_FUNCTION_ERROR:", error instanceof Error ? error.message : error);
  if (error instanceof HttpError) {
    return json({ error: error.message, code: error.code }, error.status, headers);
  }
  return json({ error: "Unexpected server error", code: "unexpected_error" }, 500, headers);
}

export function hasScope(scope: string, expected: string) {
  return String(scope || "").split(/[,\s]+/).includes(expected);
}

export function isExpired(expiresAt = "") {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() <= Date.now() + 60_000;
}

function getAllowedAppUrls() {
  const configured = Deno.env.get("LINKEDIN_ALLOWED_APP_URLS")
    || Deno.env.get("APP_URL")
    || "";
  const defaults = [
    "https://anasaldahdoh2005-commits.github.io/DevLog-AI/",
    "http://localhost:3000/",
    "http://127.0.0.1:3000/",
  ];

  const values = configured
    .split(",")
    .map((value) => normalizeAppUrl(value))
    .filter(Boolean);

  return [...values, ...defaults].filter((value, index, list) => list.indexOf(value) === index);
}

function normalizeAppUrl(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return "";

  try {
    const url = new URL(raw);
    if (!["http:", "https:"].includes(url.protocol)) return "";
    url.hash = "";
    url.search = "";
    if (!url.pathname.endsWith("/")) {
      url.pathname = `${url.pathname}/`;
    }
    return url.toString();
  } catch {
    return "";
  }
}

function sameAppUrl(a: string, b: string) {
  return trimTrailingSlash(a) === trimTrailingSlash(b);
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function base64Url(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

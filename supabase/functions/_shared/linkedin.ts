import { createClient } from "npm:@supabase/supabase-js@2";

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
      apikey: getSupabasePublishableKey(),
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

let adminClient: ReturnType<typeof createClient> | null = null;

function getAdminClient() {
  if (!adminClient) {
    adminClient = createClient(getSupabaseUrl(), getSupabaseSecretKey(), {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }
  return adminClient;
}

function getSupabasePublishableKey() {
  return getNamedKey("SUPABASE_PUBLISHABLE_KEYS")
    || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")?.trim()
    || requiredEnv("SUPABASE_ANON_KEY");
}

function getSupabaseSecretKey() {
  return getNamedKey("SUPABASE_SECRET_KEYS")
    || Deno.env.get("SUPABASE_SECRET_KEY")?.trim()
    || requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
}

function getNamedKey(environmentName: string) {
  const raw = Deno.env.get(environmentName)?.trim();
  if (!raw) return "";

  try {
    const keys = JSON.parse(raw) as Record<string, string>;
    return String(keys.default || Object.values(keys)[0] || "").trim();
  } catch {
    return "";
  }
}

export async function insertOAuthState(row: Record<string, unknown>) {
  const { error } = await getAdminClient().from("linkedin_oauth_states").insert(row);
  assertAdminResult(error, "insert_oauth_state");
}

export async function getOAuthState<T>(stateHash: string) {
  const { data, error } = await getAdminClient()
    .from("linkedin_oauth_states")
    .select("user_id,app_url,expires_at")
    .eq("state_hash", stateHash)
    .maybeSingle();
  assertAdminResult(error, "get_oauth_state");
  return (data || null) as T | null;
}

export async function deleteOAuthState(stateHash: string) {
  const { error } = await getAdminClient()
    .from("linkedin_oauth_states")
    .delete()
    .eq("state_hash", stateHash);
  assertAdminResult(error, "delete_oauth_state");
}

export async function upsertLinkedInAccount(row: Record<string, unknown>) {
  const { error } = await getAdminClient()
    .from("linkedin_accounts")
    .upsert(row, { onConflict: "user_id" });
  assertAdminResult(error, "upsert_linkedin_account");
}

export async function getLinkedInAccount<T>(userId: string, columns: string) {
  const { data, error } = await getAdminClient()
    .from("linkedin_accounts")
    .select(columns)
    .eq("user_id", userId)
    .maybeSingle();
  assertAdminResult(error, "get_linkedin_account");
  return (data || null) as T | null;
}

export async function deleteLinkedInAccount(userId: string) {
  const { error } = await getAdminClient()
    .from("linkedin_accounts")
    .delete()
    .eq("user_id", userId);
  assertAdminResult(error, "delete_linkedin_account");
}

function assertAdminResult(error: { message?: string; code?: string } | null, operation: string) {
  if (!error) return;
  console.log("SUPABASE_ADMIN_ERROR:", operation, error.code || "", error.message || "");
  throw new HttpError(500, "Supabase service request failed", "supabase_service_failed");
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

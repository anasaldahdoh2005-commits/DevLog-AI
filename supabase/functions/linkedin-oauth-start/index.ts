import {
  corsHeaders,
  createStateToken,
  getLinkedInRedirectUri,
  handleError,
  insertOAuthState,
  json,
  LINKEDIN_SCOPES,
  requireUser,
  requiredCredentialEnv,
  resolveAppUrl,
  sha256Hex,
} from "../_shared/linkedin.ts";

Deno.serve(async (req) => {
  const headers = corsHeaders("POST, OPTIONS");

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed", code: "method_not_allowed" }, 405, headers);
  }

  try {
    const { user } = await requireUser(req);
    const body = await req.json().catch(() => ({}));
    const appUrl = resolveAppUrl(body?.app_url);
    const state = createStateToken();
    const stateHash = await sha256Hex(state);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    await insertOAuthState({
      state_hash: stateHash,
      user_id: user.id,
      app_url: appUrl,
      expires_at: expiresAt,
    });

    const authorizationUrl = new URL("https://www.linkedin.com/oauth/v2/authorization");
    authorizationUrl.searchParams.set("response_type", "code");
    authorizationUrl.searchParams.set("client_id", requiredCredentialEnv("LINKEDIN_CLIENT_ID"));
    authorizationUrl.searchParams.set("redirect_uri", getLinkedInRedirectUri());
    authorizationUrl.searchParams.set("scope", LINKEDIN_SCOPES);
    authorizationUrl.searchParams.set("state", state);

    return json({
      authorization_url: authorizationUrl.toString(),
      redirect_uri: getLinkedInRedirectUri(),
      scopes: LINKEDIN_SCOPES.split(" "),
    }, 200, headers);
  } catch (error) {
    return handleError(error, headers);
  }
});

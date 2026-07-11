import {
  buildAppRedirect,
  deleteOAuthState,
  getLinkedInRedirectUri,
  getOAuthState,
  handleError,
  hasScope,
  HttpError,
  LINKEDIN_SCOPES,
  redirect,
  requiredEnv,
  resolveAppUrl,
  sha256Hex,
  upsertLinkedInAccount,
} from "../_shared/linkedin.ts";

type OAuthStateRow = {
  user_id: string;
  app_url: string;
  expires_at: string;
};

type LinkedInTokenResponse = {
  access_token?: string;
  expires_in?: number;
  scope?: string;
};

type LinkedInUserInfo = {
  sub?: string;
  name?: string;
  picture?: string;
};

Deno.serve(async (req) => {
  const requestUrl = new URL(req.url);
  const fallbackAppUrl = resolveAppUrl("");
  let redirectAppUrl = fallbackAppUrl;

  try {
    const error = requestUrl.searchParams.get("error");
    if (error) {
      return redirect(buildAppRedirect(fallbackAppUrl, {
        linkedin: "error",
        reason: error.slice(0, 80),
      }));
    }

    const code = requestUrl.searchParams.get("code") || "";
    const state = requestUrl.searchParams.get("state") || "";
    if (!code || !state) {
      return redirect(buildAppRedirect(fallbackAppUrl, {
        linkedin: "error",
        reason: "missing_oauth_params",
      }));
    }

    const stateHash = await sha256Hex(state);
    const stateRow = await getOAuthState<OAuthStateRow>(stateHash);
    const appUrl = resolveAppUrl(stateRow?.app_url || "");
    redirectAppUrl = appUrl;

    if (!stateRow || new Date(stateRow.expires_at).getTime() <= Date.now()) {
      return redirect(buildAppRedirect(appUrl, {
        linkedin: "error",
        reason: "expired_state",
      }));
    }

    assertLinkedInConfig();
    await deleteOAuthState(stateHash);

    const token = await exchangeCodeForToken(code);
    if (!token.access_token) {
      throw new HttpError(502, "LinkedIn did not return an access token", "linkedin_token_missing");
    }

    const profile = await getLinkedInUserInfo(token.access_token);
    const linkedinSub = String(profile.sub || "").trim();
    if (!linkedinSub) {
      throw new HttpError(502, "LinkedIn did not return a member id", "linkedin_member_missing");
    }

    const scope = token.scope || LINKEDIN_SCOPES;
    if (!hasScope(scope, "w_member_social")) {
      throw new HttpError(403, "LinkedIn permission w_member_social is required", "linkedin_scope_missing");
    }

    const now = new Date();
    const expiresAt = token.expires_in
      ? new Date(now.getTime() + Number(token.expires_in) * 1000).toISOString()
      : null;

    try {
      await upsertLinkedInAccount({
        user_id: stateRow.user_id,
        linkedin_sub: linkedinSub,
        author_urn: `urn:li:person:${linkedinSub}`,
        display_name: String(profile.name || "").slice(0, 160),
        picture_url: String(profile.picture || "").slice(0, 500),
        access_token: token.access_token,
        scope,
        expires_at: expiresAt,
        connected_at: now.toISOString(),
        updated_at: now.toISOString(),
      });
    } catch (error) {
      console.log("LINKEDIN_ACCOUNT_SAVE_ERROR:", error instanceof Error ? error.message : error);
      throw new HttpError(500, "LinkedIn account save failed", "linkedin_account_save_failed");
    }

    return redirect(buildAppRedirect(appUrl, { linkedin: "connected" }));
  } catch (error) {
    const response = handleError(error);
    const payload = await response.json().catch(() => ({ code: "unexpected_error" }));
    return redirect(buildAppRedirect(redirectAppUrl, {
      linkedin: "error",
      reason: String(payload?.code || "unexpected_error"),
    }));
  }
});

function assertLinkedInConfig() {
  const clientIdConfigured = Boolean(Deno.env.get("LINKEDIN_CLIENT_ID")?.trim());
  const clientSecretConfigured = Boolean(Deno.env.get("LINKEDIN_CLIENT_SECRET")?.trim());
  console.log("LINKEDIN_CONFIG_STATUS:", JSON.stringify({
    client_id: clientIdConfigured,
    client_secret: clientSecretConfigured,
    redirect_uri: Boolean(Deno.env.get("LINKEDIN_REDIRECT_URI")?.trim()),
  }));

  const missing = [
    !clientIdConfigured ? "LINKEDIN_CLIENT_ID" : "",
    !clientSecretConfigured ? "LINKEDIN_CLIENT_SECRET" : "",
  ].filter(Boolean);
  if (missing.length) {
    throw new HttpError(500, `Missing LinkedIn configuration: ${missing.join(", ")}`, "linkedin_config_missing");
  }
}

async function exchangeCodeForToken(code: string) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: getLinkedInRedirectUri(),
    client_id: requiredEnv("LINKEDIN_CLIENT_ID"),
    client_secret: requiredEnv("LINKEDIN_CLIENT_SECRET"),
  });

  const response = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!response.ok) {
    console.log("LINKEDIN_TOKEN_ERROR:", response.status);
    throw new HttpError(502, "LinkedIn token exchange failed", "linkedin_token_failed");
  }

  return await response.json() as LinkedInTokenResponse;
}

async function getLinkedInUserInfo(accessToken: string) {
  const response = await fetch("https://api.linkedin.com/v2/userinfo", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    console.log("LINKEDIN_USERINFO_ERROR:", response.status);
    throw new HttpError(502, "LinkedIn profile lookup failed", "linkedin_userinfo_failed");
  }

  return await response.json() as LinkedInUserInfo;
}

import {
  buildAppRedirect,
  getLinkedInRedirectUri,
  handleError,
  hasScope,
  HttpError,
  LINKEDIN_SCOPES,
  redirect,
  requiredEnv,
  resolveAppUrl,
  serviceJson,
  sha256Hex,
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
    const rows = await serviceJson<OAuthStateRow[]>(
      `linkedin_oauth_states?select=user_id,app_url,expires_at&state_hash=eq.${encodeURIComponent(stateHash)}&limit=1`,
    );
    const stateRow = rows?.[0];
    const appUrl = resolveAppUrl(stateRow?.app_url || "");

    if (!stateRow || new Date(stateRow.expires_at).getTime() <= Date.now()) {
      return redirect(buildAppRedirect(appUrl, {
        linkedin: "error",
        reason: "expired_state",
      }));
    }

    await serviceJson(
      `linkedin_oauth_states?state_hash=eq.${encodeURIComponent(stateHash)}`,
      { method: "DELETE" },
    );

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

    await serviceJson("linkedin_accounts?on_conflict=user_id", {
      method: "POST",
      headers: {
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify({
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
      }),
    });

    return redirect(buildAppRedirect(appUrl, { linkedin: "connected" }));
  } catch (error) {
    const response = handleError(error);
    const payload = await response.json().catch(() => ({ code: "unexpected_error" }));
    return redirect(buildAppRedirect(fallbackAppUrl, {
      linkedin: "error",
      reason: String(payload?.code || "unexpected_error"),
    }));
  }
});

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
    const text = await response.text().catch(() => "");
    console.log("LINKEDIN_TOKEN_ERROR:", response.status, text);
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
    const text = await response.text().catch(() => "");
    console.log("LINKEDIN_USERINFO_ERROR:", response.status, text);
    throw new HttpError(502, "LinkedIn profile lookup failed", "linkedin_userinfo_failed");
  }

  return await response.json() as LinkedInUserInfo;
}

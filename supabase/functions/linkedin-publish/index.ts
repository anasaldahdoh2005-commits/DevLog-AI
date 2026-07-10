import {
  corsHeaders,
  handleError,
  hasScope,
  HttpError,
  isExpired,
  json,
  requireUser,
  serviceJson,
} from "../_shared/linkedin.ts";

type LinkedInAccountRow = {
  author_urn: string;
  access_token: string;
  scope: string;
  expires_at: string | null;
};

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
    const text = String(body?.text || "").trim();
    const visibility = body?.visibility === "CONNECTIONS" ? "CONNECTIONS" : "PUBLIC";

    if (!text) {
      throw new HttpError(400, "Post text is required", "post_text_required");
    }

    if (text.length > 3000) {
      throw new HttpError(400, "LinkedIn posts must be 3000 characters or less", "post_text_too_long");
    }

    const rows = await serviceJson<LinkedInAccountRow[]>(
      `linkedin_accounts?select=author_urn,access_token,scope,expires_at&user_id=eq.${encodeURIComponent(user.id)}&limit=1`,
    );
    const account = rows?.[0];

    if (!account) {
      throw new HttpError(409, "LinkedIn account is not connected", "linkedin_not_connected");
    }

    if (isExpired(account.expires_at || "")) {
      throw new HttpError(409, "LinkedIn session expired. Reconnect LinkedIn.", "linkedin_reconnect_required");
    }

    if (!hasScope(account.scope, "w_member_social")) {
      throw new HttpError(403, "LinkedIn permission w_member_social is required", "linkedin_scope_missing");
    }

    const response = await fetch("https://api.linkedin.com/v2/ugcPosts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${account.access_token}`,
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify({
        author: account.author_urn,
        lifecycleState: "PUBLISHED",
        specificContent: {
          "com.linkedin.ugc.ShareContent": {
            shareCommentary: { text },
            shareMediaCategory: "NONE",
          },
        },
        visibility: {
          "com.linkedin.ugc.MemberNetworkVisibility": visibility,
        },
      }),
    });

    if (!response.ok) {
      const responseText = await response.text().catch(() => "");
      console.log("LINKEDIN_PUBLISH_ERROR:", response.status, responseText);
      throw mapLinkedInPublishError(response.status);
    }

    const postId = response.headers.get("x-restli-id") || "";

    return json({
      ok: true,
      id: postId,
      post_url: postId ? `https://www.linkedin.com/feed/update/${postId}/` : "",
    }, 200, headers);
  } catch (error) {
    return handleError(error, headers);
  }
});

function mapLinkedInPublishError(status: number) {
  if (status === 401) {
    return new HttpError(409, "LinkedIn session expired. Reconnect LinkedIn.", "linkedin_reconnect_required");
  }

  if (status === 403) {
    return new HttpError(403, "LinkedIn permission w_member_social is required", "linkedin_scope_missing");
  }

  if (status === 429) {
    return new HttpError(429, "LinkedIn rate limit reached. Try again later.", "linkedin_rate_limited");
  }

  return new HttpError(502, "LinkedIn publish request failed", "linkedin_publish_failed");
}

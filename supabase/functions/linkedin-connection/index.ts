import {
  corsHeaders,
  deleteLinkedInAccount,
  getLinkedInAccount,
  handleError,
  hasScope,
  isExpired,
  json,
  requireUser,
} from "../_shared/linkedin.ts";

type LinkedInAccountRow = {
  linkedin_sub: string;
  author_urn: string;
  display_name: string;
  picture_url: string;
  scope: string;
  expires_at: string | null;
  connected_at: string;
  updated_at: string;
};

Deno.serve(async (req) => {
  const headers = corsHeaders("GET, DELETE, OPTIONS");

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  if (!["GET", "DELETE"].includes(req.method)) {
    return json({ error: "Method not allowed", code: "method_not_allowed" }, 405, headers);
  }

  try {
    const { user } = await requireUser(req);

    if (req.method === "DELETE") {
      await deleteLinkedInAccount(user.id);

      return json({ connected: false }, 200, headers);
    }

    const account = await getLinkedInAccount<LinkedInAccountRow>(
      user.id,
      "linkedin_sub,author_urn,display_name,picture_url,scope,expires_at,connected_at,updated_at",
    );

    if (!account) {
      return json({ connected: false }, 200, headers);
    }

    const expired = isExpired(account.expires_at || "");
    const canPost = hasScope(account.scope, "w_member_social") && !expired;

    return json({
      connected: true,
      can_post: canPost,
      needs_reconnect: !canPost,
      reason: expired ? "expired" : canPost ? "" : "missing_scope",
      linkedin_sub: account.linkedin_sub,
      display_name: account.display_name,
      picture_url: account.picture_url,
      scope: account.scope,
      expires_at: account.expires_at,
      connected_at: account.connected_at,
      updated_at: account.updated_at,
    }, 200, headers);
  } catch (error) {
    return handleError(error, headers);
  }
});

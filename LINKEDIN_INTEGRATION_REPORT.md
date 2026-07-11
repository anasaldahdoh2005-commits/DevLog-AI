# LinkedIn Integration Report

## What changed

- Added a real LinkedIn OAuth flow through Supabase Edge Functions.
- Added secure server-side token storage in `public.linkedin_accounts`.
- Added temporary OAuth state storage in `public.linkedin_oauth_states`.
- Replaced the LinkedIn publish action so it calls LinkedIn's current official `Posts API` (`/rest/posts`).
- Kept a fallback: if API publishing fails, DevLog AI copies the post text and opens LinkedIn manually.
- Added a LinkedIn connection card in Settings with connect, reconnect, and disconnect controls.

## New Supabase Edge Functions

- `linkedin-oauth-start`: creates a CSRF state and returns the LinkedIn authorization URL.
- `linkedin-oauth-callback`: exchanges LinkedIn's authorization code for an access token and stores it server-side.
- `linkedin-connection`: reads or deletes the current user's LinkedIn connection status.
- `linkedin-publish`: posts text to LinkedIn through `POST https://api.linkedin.com/v2/ugcPosts`.

## Required Supabase secrets

Set these before deploying or using the integration:

```bash
supabase secrets set LINKEDIN_CLIENT_ID="your-linkedin-client-id"
supabase secrets set LINKEDIN_CLIENT_SECRET="your-linkedin-client-secret"
supabase secrets set LINKEDIN_REDIRECT_URI="https://hhjppsogkzxiobbbcxic.supabase.co/functions/v1/linkedin-oauth-callback"
supabase secrets set LINKEDIN_ALLOWED_APP_URLS="https://anasaldahdoh2005-commits.github.io/DevLog-AI/,http://localhost:3000/,http://127.0.0.1:3000/"
supabase secrets set LINKEDIN_VERSION="202605"
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` must also be available to Edge Functions.

## LinkedIn Developer Portal setup

1. Create or open the LinkedIn app used by DevLog AI.
2. Enable the LinkedIn products/scopes that provide `openid`, `profile`, and `w_member_social`.
3. Add this authorized redirect URL exactly:

```text
https://hhjppsogkzxiobbbcxic.supabase.co/functions/v1/linkedin-oauth-callback
```

4. Use the generated Client ID and Client Secret as Supabase secrets.

## Deploy checklist

```bash
supabase db push
supabase functions deploy linkedin-oauth-start
supabase functions deploy linkedin-oauth-callback
supabase functions deploy linkedin-connection
supabase functions deploy linkedin-publish
```

## Notes

- The implementation publishes text posts. The previous UI also only sent text to LinkedIn.
- `LINKEDIN_VERSION` is configurable because LinkedIn requires a version header for the Posts API.
- Image publishing can be added later through LinkedIn's asset upload flow. It should use controlled Supabase Storage paths or a strict allow-list, not arbitrary user-submitted URLs, to avoid SSRF and unintended data exfiltration risks.
- The old `linkedin.com/feed/?shareActive=true&text=...` path is no longer the primary path because mobile apps/deep links can ignore the `text` parameter.

## References

- LinkedIn Share API: https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/share-on-linkedin
- LinkedIn OAuth: https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow
- LinkedIn OpenID Connect userinfo: https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2

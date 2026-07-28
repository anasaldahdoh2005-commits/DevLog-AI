# DevLog AI code review

Review date: 2026-07-28

## Scope

The review covered the static frontend, authentication and routing, Supabase data
access and RLS migrations, storage uploads, Edge Functions, LinkedIn OAuth
scaffolding, AI quota enforcement, PWA caching, accessibility, privacy,
maintainability, and automated checks.

## High-priority findings addressed

| Area | Finding | Resolution |
| --- | --- | --- |
| AI quota | Authenticated clients could discover a claim ID and call the refund RPC themselves, allowing the daily quota to be bypassed. | The refund RPC now accepts only `service_role`, claim IDs are no longer readable through RLS, and the Edge Function uses the server-only role for refunds. |
| Storage | Images were uploaded before AI generation and could remain orphaned when generation or saving failed. Deleting a log did not delete its images. | Uploads now happen only while saving, partial uploads are rolled back, replaced images are removed, and deleting a log removes owned storage objects. |
| Editing | Saving a regenerated post for an existing log did not persist edits to the original achievement text. | The update now includes the edited content and handles image replacement as one data-layer workflow. |
| Realtime | Realtime code existed but was never initialized and was not scoped to the signed-in user. | The subscription now follows authentication changes, filters by user ID, and is removed on logout or account change. |
| PWA | Navigation responses containing OAuth or recovery query parameters could be cached by their sensitive URL. Updates also forced open tabs to reload, risking unsaved work. | Navigation content is cached only under the canonical app-shell key, and activation no longer forces a page reload. |
| PWA routes | Notification clicks resolved to the domain root instead of the GitHub Pages repository scope. | Notification URLs now resolve from the service-worker scope. |
| Privacy | Dashboard and profile caches containing private data were kept in persistent local storage after logout. | Private caches use session storage and are cleared on logout; “clear local data” now removes all DevLog keys from both storage areas. |
| Notifications | Reminders were enabled by default and could request permission without a user gesture. | Reminders are opt-in, permission is requested only from the settings interaction, and scheduling requires an existing grant. |
| Frontend security | The application had no Content Security Policy and loaded Supabase twice. | A restrictive CSP and referrer policy were added, and the redundant classic Supabase script was removed. |
| Regression safety | The repository had no repeatable project check or CI workflow. | `npm test` now validates syntax and static assets; GitHub Actions runs it on pushes and pull requests. |

## Remaining risks and recommended next work

1. **End-to-end coverage:** Authentication, RLS, Storage, Gemini, OAuth, and the
   fourth-request quota behavior still require integration tests against a
   dedicated Supabase test project. Static checks cannot prove deployed policies.
2. **Frontend module size:** `js/ui.js` still owns several unrelated UI features.
   Split authentication forms, log editor/history, settings, reminders, and
   publishing into feature modules as the product grows.
3. **Offline dependency:** The frontend imports Supabase from jsDelivr, so a first
   load and some offline restarts depend on that CDN. A build step that bundles and
   pins browser dependencies would make the PWA more reproducible.
4. **Remote artwork:** Landing-page illustrations are served by an external MGX
   CDN. Store release assets in the repository or a controlled production bucket
   to prevent broken images and reduce third-party availability risk.
5. **Provider lifecycle:** Gemini model names and LinkedIn API versions will
   eventually expire. Track them as scheduled maintenance and test before changing
   production versions.
6. **Direct LinkedIn publishing:** OAuth and publishing Edge Functions remain in
   the repository, but the current reviewed UI deliberately uses manual sharing.
   Re-enable direct publishing only after LinkedIn app approval, privacy review,
   and end-to-end tests.
7. **Observability:** Edge Functions currently use platform logs only. Add
   structured request IDs, latency metrics, quota/refund counters, and alerts
   without logging post content or access tokens.
8. **Abuse controls:** The three-generation account quota limits normal usage but
   does not prevent automated account creation. Enable Supabase CAPTCHA, email
   verification, and provider-level budget alerts before wider public launch.

## Deployment checklist

1. Run `npm ci` and `npm test`.
2. Apply Supabase migrations with `npx supabase db push`.
3. Deploy `generate-post` and any LinkedIn functions that changed.
4. Test sign-in, password recovery, log create/edit/delete, image replacement,
   the daily AI quota, logout, and offline navigation with a test account.
5. Confirm GitHub Actions passes before merging to `main`.

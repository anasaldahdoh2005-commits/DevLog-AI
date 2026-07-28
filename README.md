# DevLog AI

DevLog AI is an Arabic-first progressive web application for documenting daily achievements and turning them into ready-to-publish social posts with AI.

## Project links

- Application: https://anasaldahdoh2005-commits.github.io/DevLog-AI/
- Repository: https://github.com/anasaldahdoh2005-commits/DevLog-AI

## Table of contents

- [Main features](#main-features)
- [Application workflow](#application-workflow)
- [Technology](#technology)
- [System architecture](#system-architecture)
- [Project structure](#project-structure)
- [Design patterns](#design-patterns-used)
- [Security and configuration](#security-and-configuration)
- [Using the application](#using-the-application)
- [Local setup](#local-setup)
- [Daily AI limit](#daily-ai-limit)
- [Testing and verification](#testing-and-verification)
- [Deployment](#deployment)

## Main features

- Email sign-up, sign-in, sign-out, password recovery, and session handling with Supabase Auth.
- Protected dashboard, history, and settings routes.
- Create, read, update, delete, search, and filter achievement logs.
- Upload achievement images and user avatars to private Supabase Storage buckets.
- Generate Arabic posts for LinkedIn, X, and Instagram through a Supabase Edge Function and Gemini.
- Six writing styles: professional, friendly, motivational, technical, short, and storytelling.
- Server-enforced limit of three successful AI generations per user per UTC day.
- Row Level Security policies that isolate each user's logs, profile, usage, and files.
- Manual LinkedIn and X sharing from the reviewed post.
- Optional server-side LinkedIn OAuth functions kept as an integration scaffold; the current UI does not enable direct publishing.
- PWA installation, service worker caching, dark mode, and daily reminders.

## Application workflow

1. The user creates an account or signs in.
2. The user records an achievement and may attach images.
3. The user selects LinkedIn, X, or Instagram and chooses a writing style.
4. The application sends the authenticated request to the `generate-post` Edge Function.
5. The server verifies the daily limit and sends the prompt to Gemini.
6. The generated post is returned to the application and can be edited, copied, saved, or published through the supported integration.
7. Saved achievements remain available in the history page for searching, filtering, editing, and deletion.

## Technology

- HTML5, CSS3, and vanilla JavaScript ES modules
- Supabase Auth, PostgreSQL, Row Level Security, Storage, Realtime, and Edge Functions
- Deno/TypeScript for server-side functions
- Gemini API for post generation
- GitHub Pages for the static frontend

## System architecture

```text
Browser / PWA
  |-- Supabase Auth -------- User authentication and sessions
  |-- PostgreSQL + RLS ----- Logs, profiles, and AI usage
  |-- Supabase Storage ----- Achievement images and avatars
  |-- Supabase Realtime ---- Live log updates
  `-- Edge Functions
        |-- Gemini API ----- AI post generation
        `-- LinkedIn API --- Optional OAuth publishing
```

## Project structure

```text
.
|-- css/
|   `-- style.css
|-- imges/
|-- js/
|   |-- ai.js
|   |-- auth.js
|   |-- db.js
|   |-- linkedin.js
|   |-- router.js
|   |-- script.js
|   |-- store.js
|   |-- supabase.js
|   `-- ui.js
|-- supabase/
|   |-- functions/
|   |   |-- generate-post/
|   |   |-- linkedin-connection/
|   |   |-- linkedin-oauth-callback/
|   |   |-- linkedin-oauth-start/
|   |   `-- linkedin-publish/
|   |-- migrations/
|   `-- config.toml
|-- index.html
|-- manifest.webmanifest
|-- sw.js
|-- package.json
`-- README.md
```

## Security and configuration

The browser may use only the Supabase project URL and a public publishable/anonymous key. This key is not an administrator secret; security is enforced by authentication and RLS. Never place the service-role key, Gemini key, LinkedIn client secret, or access tokens in frontend files or Git.

Configure server-only values as Supabase secrets:

```bash
supabase secrets set GEMINI_API_KEY="YOUR_GEMINI_KEY"
supabase secrets set LINKEDIN_CLIENT_ID="YOUR_LINKEDIN_CLIENT_ID"
supabase secrets set LINKEDIN_CLIENT_SECRET="YOUR_LINKEDIN_CLIENT_SECRET"
supabase secrets set LINKEDIN_ALLOWED_APP_URLS="http://localhost:3000/,https://YOUR_USER.github.io/YOUR_REPOSITORY/"
```

When documenting the connection code in screenshots, mask both the project URL and public publishable key to avoid exposing project identifiers in the report.

## Local setup

1. Install the Supabase CLI dependency:

   ```bash
   npm install
   ```

2. Create or link a Supabase project, then apply the migrations:

   ```bash
   npx supabase login
   npx supabase link --project-ref YOUR_PROJECT_REF
   npx supabase db push
   ```

3. Configure the Edge Function secrets shown above.

4. Deploy the functions:

   ```bash
   npx supabase functions deploy generate-post
   npx supabase functions deploy linkedin-connection
   npx supabase functions deploy linkedin-oauth-start
   npx supabase functions deploy linkedin-oauth-callback
   npx supabase functions deploy linkedin-publish
   ```

5. Put the Supabase URL and public publishable key in `js/supabase.js`, then serve the project through a local web server:

   ```bash
   python -m http.server 3000
   ```

6. Open `http://localhost:3000/`.

After pulling database or Edge Function changes, apply migrations before deploying
the functions. The migration order matters because the AI refund RPC is restricted
to the server role.

## Daily AI limit

The `generate-post` Edge Function reserves a usage slot through the `claim_daily_ai_generation_v2` PostgreSQL function before calling Gemini. The function serializes concurrent claims per user, rejects the fourth successful generation with HTTP 429, and releases the reserved slot if the provider call fails. The daily window resets at 00:00 UTC.

## Design patterns used

- **Singleton and Module:** `js/supabase.js` creates and exports one shared Supabase client.
- **Repository / Data Access Layer:** `js/db.js` centralizes persistence and hides Supabase and local-storage details from the UI.
- **Observer:** authentication events and custom page-change events notify interested UI code when application state changes.
- **Strategy:** the AI Edge Function selects platform and writing-style instruction sets at runtime.

## Using the application

1. Open the [deployed application](https://anasaldahdoh2005-commits.github.io/DevLog-AI/).
2. Create an account and confirm the email address if confirmation is enabled.
3. Sign in and add an achievement from the dashboard.
4. Save the achievement directly or select a platform and writing style to generate a post.
5. Review the generated post, then copy, save, or publish it through an available integration.
6. Use the history page to search, filter, edit, or delete saved achievements.
7. Use the settings page to update the profile, enable dark mode, configure reminders, or install the PWA.

## Testing and verification

The following checks cover the application's main functional and security paths:

| Test | Expected behavior |
| --- | --- |
| JavaScript syntax | All frontend modules and the service worker pass `node --check`. |
| Local assets | Every local `src` and `href` reference resolves to an existing project file. |
| Invalid login | Incorrect credentials are rejected and dashboard access remains blocked. |
| Valid login | Correct credentials create a session and open the dashboard. |
| Achievement saving | A valid achievement is saved and displayed in history. |
| AI generation | A relevant post is generated for the selected platform and style. |
| Generated post saving | Generated content is saved with its platform and writing style. |
| Daily AI limit | Three successful generations are allowed; the fourth is rejected with HTTP 429. |
| Search and filters | Only achievements matching the keyword and selected filters are shown. |
| Edit and delete | Saved achievements can be updated and removed. |
| Logout and route protection | Logout ends the session and protected routes redirect to authentication. |

Run the repository checks locally with:

```bash
npm test
```

The check validates JavaScript syntax, duplicate HTML IDs, local asset references,
the web manifest, the service-worker app shell, and the presence of a Content
Security Policy. GitHub Actions runs the same check for pushes and pull requests.
End-to-end tests that create accounts, save data, call Gemini, and verify the
fourth-request limit should be performed with dedicated test accounts before final
submission.

## Deployment

The static frontend is deployed with GitHub Pages:

- Live application: https://anasaldahdoh2005-commits.github.io/DevLog-AI/
- Source repository: https://github.com/anasaldahdoh2005-commits/DevLog-AI

Supabase hosts authentication, the PostgreSQL database, private Storage buckets, Row Level Security policies, and Edge Functions. Sensitive API credentials are stored only as Supabase server secrets.

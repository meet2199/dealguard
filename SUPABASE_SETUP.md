# Connect DealGuard to Supabase

This is the only manual platform setup required for Phase 2.1.

## A. Create the project

1. Sign in to Supabase and create a new project.
2. Wait until the database is ready.
3. Open **SQL Editor**.
4. Create a new query.
5. Paste the entire contents of:

   `supabase/setup_fresh_project.sql`

6. Run it once.

For a project where `001_initial_schema.sql` has already been run, run only:

`supabase/migrations/002_onboarding_and_security.sql`

## B. Copy the two public connection values

From the project's **Connect** dialog / API settings, copy:

- Project URL
- Publishable key (`sb_publishable_...`)

Do **not** put a service-role/secret key into a `NEXT_PUBLIC_...` variable.

Create `.env.local` in the project root:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_KEY
```

Restart the dev server after saving the file.

## C. Configure Auth URLs

During local development use:

- Site URL: `http://localhost:3000`
- Redirect URL: `http://localhost:3000/auth/callback`

When the production app is deployed, also add:

- `https://YOUR-DOMAIN.com/auth/callback`

## D. Email/password test

1. Start the app with `npm run dev`.
2. Open `/signup`.
3. Create a test account.
4. If email confirmation is enabled, click the Supabase confirmation email.
5. You should land on `/onboarding`.
6. Complete onboarding.
7. Add a deal.
8. Sign out and back in.
9. Confirm the deal is still there.

## E. Google login (optional for now)

Email/password auth is sufficient for the beta. Google can be enabled later under **Authentication → Providers → Google**. Add its OAuth client ID/secret and make sure the callback URL shown by Supabase is configured in Google Cloud.

## Security checks

Phase 2.1:

- uses cookie-based Supabase SSR auth
- verifies auth in the Next.js proxy
- redirects signed-out users away from protected workspace routes
- uses PostgreSQL Row Level Security
- removes `anon` access to private creator workspace tables
- explicitly grants required CRUD operations to `authenticated`
- scopes creator records by the authenticated user ID

Never ship a service-role key to the browser.

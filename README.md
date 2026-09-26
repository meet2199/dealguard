# DealGuard — Phase 3

DealGuard is a responsive creator deal, money and content-rights tracker. This build is connected to the dedicated DealGuard Supabase project and includes the Phase 3 server-side reminder engine.

## What is included

- Next.js 16 + TypeScript responsive web app.
- Mobile bottom navigation, touch-friendly deal cards and forms.
- Desktop sidebar, tables and two-column workspace.
- Supabase email/password + Google-ready authentication flow.
- First-login creator onboarding.
- Creator-isolated RLS policies.
- Brands, deals, deliverables, payments, usage rights and reminders.
- Money Watch and Rights Watch.
- Phase 3 reminder queue and Settings controls.
- Payment reminders: -3 days, due day, +1 and +7 overdue.
- Rights reminders: -30, -14 and -7 days.
- Deliverable reminders: -3 and -1 days.
- Supabase Edge Function worker + 15-minute cron schedule.
- Retry tracking and email on/off preference.

## Connected Supabase project

The `.env.local` supplied with this private project contains only the DealGuard project URL and a **publishable** browser key. It does not contain a service-role key, database password, cron secret or email API key.

## Run locally

```bash
npm install
npm run dev
```

Production check:

```bash
npm run build
```

### Why ChatGPT could not run `npm install` here

The coding workspace used to prepare this project could not reach the npm registry; even `npm view next version` timed out. Therefore `npm run build` never reached the compilation stage in that workspace. This is a package-download/network limitation, not a reported Next.js build failure. The project structure and TypeScript/TSX parsing were checked separately.

## Phase 3 email delivery

The scheduling backend is live and verified. To send actual emails, connect a Resend account and store its API key in Supabase Vault as `resend_api_key`. See `docs/PHASE3.md`.

## Important files

- `app/dashboard/page.tsx` — live creator workspace loader.
- `components/dealguard-app.tsx` — responsive dashboard + Phase 3 controls.
- `supabase/migrations/003_phase3_reminder_engine.sql` — reminder queue/triggers.
- `supabase/migrations/004_schedule_phase3_reminder_worker.sql` — scheduled worker.
- `supabase/functions/process-reminders/index.ts` — email worker.
- `docs/PHASE3.md` — Phase 3 architecture and verification.

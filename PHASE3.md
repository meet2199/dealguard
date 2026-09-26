# DealGuard Phase 3 — Reminder Automation

Phase 3 adds server-side reminders that do not depend on the creator keeping the browser open.

## Live backend status

The connected DealGuard Supabase project already has:

- `notification_preferences` with Row Level Security.
- Reminder queue fields for status, attempts, source object and delivery metadata.
- Payment reminder triggers: 3 days before, due day, 1 day overdue, 7 days overdue.
- Usage-right reminder triggers: 30, 14 and 7 days before expiry.
- Deliverable reminder triggers: 3 and 1 days before due date.
- `process-reminders` Edge Function deployed.
- A private random cron secret stored only in Supabase Vault.
- `pg_cron` + `pg_net` invoking the worker every 15 minutes.
- Retry protection (maximum 3 delivery attempts).
- User-level email on/off preference.

A manual server invocation has returned HTTP 200. Supabase Security Advisor reports no security findings.

## Email delivery provider

The worker is ready for Resend, but the live project intentionally does not contain a Resend API key yet. Until one is stored in Vault, the worker safely returns `configured: false` and sends nothing.

Expected Vault secrets:

- `resend_api_key` — required.
- `resend_from_email` — optional after a sending domain is verified. If omitted, the worker uses Resend's onboarding sender for initial account-owner testing.

Never put these secrets in `.env.local`, source control, or browser code.

## Mobile / desktop behavior

Settings now shows the Phase 3 queue status, queued/retry counts, the next reminder date, and a touch-friendly email reminder toggle. Mobile uses the existing one-column settings layout; desktop uses the two-column workspace.

## Verification after the first real user signs up

1. Complete onboarding so the user's timezone is stored.
2. Create a deal with future content, payment and usage-right dates.
3. Open Settings and confirm reminders are queued.
4. Check `reminders` in Supabase: rows should be scheduled at 09:00 in the creator's timezone.
5. After Resend is connected, make a test reminder due and confirm it becomes `sent` with a provider message id.

# DealGuard deployment

## Vercel environment variables

Set these for Production, Preview, and Development:

- `NEXT_PUBLIC_SUPABASE_URL` = the DealGuard Supabase project URL
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` = the DealGuard publishable key

Do not add the Resend API key to Vercel. It is stored in Supabase Vault and used only by the reminder worker.

## After the first Vercel deployment

1. Copy the final `https://<project>.vercel.app` URL.
2. In Supabase Auth URL configuration, set the Site URL to that production URL.
3. Add `https://<project>.vercel.app/auth/callback` to allowed redirect URLs.
4. Create a real account and complete onboarding.
5. Add a test deal, payment, deliverable, and usage-right expiry.
6. Verify reminder creation and test delivery.

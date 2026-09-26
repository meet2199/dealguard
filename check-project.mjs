import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const required = [
  "app/auth/callback/route.ts",
  "app/auth/confirm/route.ts",
  "app/onboarding/page.tsx",
  "components/onboarding-form.tsx",
  "lib/supabase/client.ts",
  "lib/supabase/server.ts",
  "lib/supabase/proxy.ts",
  "supabase/migrations/001_initial_schema.sql",
  "supabase/migrations/002_onboarding_and_security.sql",
  "supabase/migrations/003_phase3_reminder_engine.sql",
  "supabase/migrations/004_schedule_phase3_reminder_worker.sql",
  "supabase/functions/process-reminders/index.ts",
  "docs/PHASE3.md",
];

let failed = false;
for (const item of required) {
  const ok = fs.existsSync(path.join(root, item));
  console.log(`${ok ? "✓" : "✗"} ${item}`);
  if (!ok) failed = true;
}

const envPath = path.join(root, ".env.local");
if (!fs.existsSync(envPath)) {
  console.log("! .env.local not found — app will stay in demo mode.");
} else {
  const env = fs.readFileSync(envPath, "utf8");
  const hasUrl = /NEXT_PUBLIC_SUPABASE_URL=https:\/\/.+\.supabase\.co/.test(env);
  const hasKey = /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_.+/.test(env);
  console.log(`${hasUrl ? "✓" : "✗"} Supabase project URL`);
  console.log(`${hasKey ? "✓" : "✗"} Supabase publishable key`);
  if (!hasUrl || !hasKey) failed = true;
}

if (failed) process.exitCode = 1;
else console.log("DealGuard Phase 3 project structure looks ready.");

"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type ProfileDefaults = {
  fullName: string;
  country: string;
  currency: string;
  creatorCategory: string;
  mainPlatform: string;
  dealsPerMonth: string;
};

const CURRENCIES = ["USD", "EUR", "GBP", "INR", "CAD", "AUD"];
const PLATFORMS = ["Instagram", "TikTok", "YouTube", "LinkedIn", "Twitch", "Other"];
const CATEGORIES = ["UGC Creator", "Lifestyle", "Beauty", "Fashion", "Tech", "Gaming", "Fitness", "Food", "Travel", "Education", "Other"];
const DEAL_RANGES = ["0–2", "3–5", "6–10", "11–20", "20+"];

export default function OnboardingForm({ userId, defaults }: { userId: string; defaults: ProfileDefaults }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const fullName = String(form.get("fullName") || "").trim();
    const country = String(form.get("country") || "").trim();
    const defaultCurrency = String(form.get("currency") || "USD");
    const creatorCategory = String(form.get("creatorCategory") || "");
    const mainPlatform = String(form.get("mainPlatform") || "");
    const dealsPerMonth = String(form.get("dealsPerMonth") || "");
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

    setSaving(true);
    setMessage("");

    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: fullName,
        country: country || null,
        default_currency: defaultCurrency,
        creator_category: creatorCategory || null,
        main_platform: mainPlatform || null,
        deals_per_month: dealsPerMonth || null,
        timezone,
        onboarding_completed: true,
      })
      .eq("id", userId);

    if (error) {
      setMessage(error.message);
      setSaving(false);
      return;
    }

    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <main className="onboarding-page">
      <section className="onboarding-shell">
        <aside className="onboarding-summary">
          <div className="logo-lockup light onboarding-logo">
            <span className="logo-mark">DG</span>
            <span>
              <strong>DealGuard</strong>
              <small>Creator money & rights</small>
            </span>
          </div>
          <div>
            <span className="auth-kicker">60-SECOND SETUP</span>
            <h1>Set up your creator workspace.</h1>
            <p>We use these details to format money, deadlines and reminders correctly. You can change them later.</p>
          </div>
          <div className="onboarding-promise-grid">
            <article><b>01</b><span><strong>Money Watch</strong><small>See what brands owe you.</small></span></article>
            <article><b>02</b><span><strong>Rights Watch</strong><small>Catch expiring usage rights.</small></span></article>
            <article><b>03</b><span><strong>Deadline Watch</strong><small>Keep deliverables on schedule.</small></span></article>
          </div>
        </aside>

        <section className="onboarding-form-card">
          <div className="onboarding-mobile-brand">
            <span className="logo-mark">DG</span>
            <strong>DealGuard</strong>
          </div>
          <span className="eyebrow">PERSONALIZE DEALGUARD</span>
          <h2>Tell us about your creator business</h2>
          <p className="auth-lead">No public profile is created. These settings are only for your private workspace.</p>

          <form className="onboarding-form" onSubmit={submit}>
            <div className="onboarding-grid">
              <label className="field span-2">
                <span>Your name</span>
                <input name="fullName" defaultValue={defaults.fullName} required placeholder="e.g. Sarah Jones" />
              </label>

              <label className="field">
                <span>Creator type</span>
                <select name="creatorCategory" defaultValue={defaults.creatorCategory || "UGC Creator"}>
                  {CATEGORIES.map((item) => <option key={item}>{item}</option>)}
                </select>
              </label>

              <label className="field">
                <span>Main platform</span>
                <select name="mainPlatform" defaultValue={defaults.mainPlatform || "Instagram"}>
                  {PLATFORMS.map((item) => <option key={item}>{item}</option>)}
                </select>
              </label>

              <label className="field">
                <span>Country</span>
                <input name="country" defaultValue={defaults.country} placeholder="e.g. United States" />
              </label>

              <label className="field">
                <span>Default currency</span>
                <select name="currency" defaultValue={defaults.currency || "USD"}>
                  {CURRENCIES.map((item) => <option key={item}>{item}</option>)}
                </select>
              </label>

              <div className="field span-2">
                <span>How many paid collaborations do you usually manage per month?</span>
                <div className="deal-range-grid">
                  {DEAL_RANGES.map((item) => (
                    <label className="range-choice" key={item}>
                      <input
                        type="radio"
                        name="dealsPerMonth"
                        value={item}
                        defaultChecked={(defaults.dealsPerMonth || "0–2") === item}
                      />
                      <span>{item}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {message && <div className="form-message">{message}</div>}

            <div className="onboarding-footer">
              <small>Your timezone will be detected automatically for deadline reminders.</small>
              <button className="button primary" disabled={saving}>
                {saving ? "Saving…" : "Open my workspace →"}
              </button>
            </div>
          </form>
        </section>
      </section>
    </main>
  );
}

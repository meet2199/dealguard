"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Props = { mode: "login" | "signup"; configured: boolean };

export default function AuthCard({ mode, configured }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const supabase = useMemo(() => (configured ? createClient() : null), [configured]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") || "").trim();
    const password = String(form.get("password") || "");
    const fullName = String(form.get("name") || "").trim();

    setLoading(true);
    setMessage("");

    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setMessage(error.message);
      else {
        router.replace("/dashboard");
        router.refresh();
      }
    } else {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName },
          emailRedirectTo: `${window.location.origin}/auth/callback?next=/onboarding`,
        },
      });
      if (error) {
        setMessage(error.message);
      } else if (data.session) {
        router.replace("/onboarding");
        router.refresh();
      } else {
        setMessage("Account created. Check your email to confirm your account.");
      }
    }
    setLoading(false);
  }

  async function googleLogin() {
    if (!supabase) return;
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback?next=/onboarding` },
    });
    if (error) {
      setMessage(error.message);
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-brand-panel">
        <div className="auth-brand-inner">
          <div className="logo-lockup light">
            <span className="logo-mark">DG</span>
            <span>
              <strong>DealGuard</strong>
              <small>Creator money & rights</small>
            </span>
          </div>
          <div className="auth-copy">
            <span className="auth-kicker">BUILT FOR CREATOR BUSINESS</span>
            <h1>Protect every dollar behind your brand deals.</h1>
            <p>One workspace for deliverables, payment deadlines, usage rights and renewal opportunities.</p>
          </div>
          <div className="auth-mini-card">
            <span>Money Watch</span>
            <strong>$3,650 waiting on brands</strong>
            <small>1 overdue payment · 2 rights expiries this month</small>
          </div>
        </div>
      </section>

      <section className="auth-form-panel">
        <div className="auth-form-wrap">
          <div className="mobile-auth-logo">
            <span className="logo-mark">DG</span>
            <strong>DealGuard</strong>
          </div>
          <span className="eyebrow">{mode === "login" ? "WELCOME BACK" : "START YOUR WORKSPACE"}</span>
          <h2>{mode === "login" ? "Sign in to DealGuard" : "Create your creator account"}</h2>
          <p className="auth-lead">
            {mode === "login" ? "Your deals, money and rights in one place." : "Start free and add your first brand deal in under a minute."}
          </p>

          {!configured ? (
            <div className="demo-login-card">
              <strong>Demo mode is active</strong>
              <p>Supabase keys are not configured yet. You can still use the complete responsive dashboard with local demo data.</p>
              <Link href="/dashboard" className="button primary wide">Open demo dashboard</Link>
            </div>
          ) : (
            <>
              <button className="button google wide" onClick={googleLogin} disabled={loading}>
                <span className="google-dot">G</span> Continue with Google
              </button>
              <div className="auth-divider"><span>or</span></div>
              <form onSubmit={submit} className="auth-form">
                {mode === "signup" && (
                  <label>
                    <span>Name</span>
                    <input name="name" autoComplete="name" required placeholder="Your name" />
                  </label>
                )}
                <label>
                  <span>Email</span>
                  <input name="email" type="email" autoComplete="email" required placeholder="you@example.com" />
                </label>
                <label>
                  <span>Password</span>
                  <input name="password" type="password" minLength={8} autoComplete={mode === "login" ? "current-password" : "new-password"} required placeholder="At least 8 characters" />
                </label>
                {message && <div className="form-message">{message}</div>}
                <button className="button primary wide" disabled={loading}>
                  {loading ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
                </button>
              </form>
            </>
          )}

          <p className="auth-switch">
            {mode === "login" ? "New to DealGuard?" : "Already have an account?"}{" "}
            <Link href={mode === "login" ? "/signup" : "/login"}>{mode === "login" ? "Create account" : "Sign in"}</Link>
          </p>
        </div>
      </section>
    </main>
  );
}

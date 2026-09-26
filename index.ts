import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.117.1";
import postgres from "npm:postgres@3.4.7";

const url = Deno.env.get("SUPABASE_URL") || "";
const raw = Deno.env.get("SUPABASE_SECRET_KEYS") || "{}";
let key = "";
try { key = JSON.parse(raw).default || ""; } catch {}
key ||= Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const sql = postgres(Deno.env.get("SUPABASE_DB_URL") || "", { prepare: false, max: 1 });

async function secret(name: string) {
  const rows = await sql<{ decrypted_secret: string }[]>`
    select decrypted_secret from vault.decrypted_secrets
    where name=${name} order by created_at desc limit 1
  `;
  return rows[0]?.decrypted_secret || "";
}

function cash(n: number, c: string) {
  try { return new Intl.NumberFormat("en-US", { style: "currency", currency: c || "USD", maximumFractionDigits: 0 }).format(n || 0); }
  catch { return `${c || "USD"} ${Math.round(n || 0)}`; }
}
function niceDate(d: string | null) {
  if (!d) return "Not set";
  return new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}
function html(subject: string, message: string, action: string) {
  return `<div style="background:#f8fafc;padding:28px;font-family:Arial,sans-serif"><div style="max-width:600px;margin:auto;background:white;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0"><div style="background:#0f172a;color:white;padding:20px 24px"><small style="color:#a5b4fc;font-weight:700">DEALGUARD</small><h2 style="margin:8px 0 0">${subject}</h2></div><div style="padding:24px;color:#334155;line-height:1.6"><p>${message}</p><div style="margin-top:18px;padding:14px;background:#f8fafc;border-radius:10px"><b>Next action:</b> ${action}</div><p style="font-size:12px;color:#94a3b8;margin-top:22px">Email reminders are enabled in your DealGuard workspace.</p></div></div></div>`;
}

async function context(r: any) {
  if (!r.deal_id) return null;
  const { data: deal } = await admin.from("deals").select("campaign_name,deal_value,currency,brands(name,contact_email)").eq("id", r.deal_id).maybeSingle();
  if (!deal) return null;
  const rel: any = Array.isArray((deal as any).brands) ? (deal as any).brands[0] : (deal as any).brands;
  let src: any = null;
  if (r.source_type === "payment") ({ data: src } = await admin.from("payments").select("amount,currency,due_date,status").eq("id", r.source_id).maybeSingle());
  if (r.source_type === "usage_right") ({ data: src } = await admin.from("usage_rights").select("usage_type,end_date").eq("id", r.source_id).maybeSingle());
  if (r.source_type === "deliverable") ({ data: src } = await admin.from("deliverables").select("deliverable_type,due_date,status,platform").eq("id", r.source_id).maybeSingle());
  return { deal: deal as any, brand: rel?.name || "Brand", contact: rel?.contact_email || "", src };
}

function compose(r: any, c: any) {
  if (!c) return { skip: "Missing deal context" };
  const brand = c.brand, campaign = c.deal.campaign_name || "collaboration", s = c.src;
  if (r.reminder_type.startsWith("payment_")) {
    if (!s || s.status === "Paid") return { skip: "Payment already paid" };
    const amount = cash(Number(s.amount || c.deal.deal_value || 0), s.currency || c.deal.currency || "USD");
    let subject = `${brand} payment reminder`;
    if (r.reminder_type === "payment_due_3") subject = `${brand} payment is due in 3 days`;
    if (r.reminder_type === "payment_due_0") subject = `${brand} payment is due today`;
    if (r.reminder_type === "payment_overdue_1") subject = `${brand} payment is 1 day overdue`;
    if (r.reminder_type === "payment_overdue_7") subject = `${brand} payment is 7 days overdue`;
    if (r.reminder_type === "payment_overdue_now") subject = `${brand} payment is overdue`;
    const message = `${amount} for ${campaign}. Due date: ${niceDate(s.due_date)}.`;
    const action = `Check the invoice and follow up with ${brand}${c.contact ? ` at ${c.contact}` : ""}.`;
    return { subject, text: `${subject}\n\n${message}\n\nNext action: ${action}`, html: html(subject, message, action) };
  }
  if (r.reminder_type.startsWith("rights_expiry_")) {
    if (!s?.end_date || new Date(`${s.end_date}T23:59:59Z`).getTime() < Date.now()) return { skip: "Rights already expired" };
    const days = r.reminder_type.split("_").pop();
    const subject = `${brand} usage rights expire in ${days} days`;
    const message = `${s.usage_type || "Usage rights"} for ${campaign} end on ${niceDate(s.end_date)}.`;
    const action = `Review renewal pricing and contact ${brand} before the usage window ends.`;
    return { subject, text: `${subject}\n\n${message}\n\nNext action: ${action}`, html: html(subject, message, action) };
  }
  if (r.reminder_type.startsWith("deliverable_due_")) {
    if (!s?.due_date || ["complete","completed","published"].includes(String(s.status || "").toLowerCase())) return { skip: "Deliverable complete" };
    const days = r.reminder_type.split("_").pop();
    const subject = `${brand} deliverable is due in ${days} day${days === "1" ? "" : "s"}`;
    const message = `${s.deliverable_type || "Creator content"} for ${campaign} is due ${niceDate(s.due_date)}.`;
    const action = "Finish the deliverable, confirm approvals, and update the brand if timing changes.";
    return { subject, text: `${subject}\n\n${message}\n\nNext action: ${action}`, html: html(subject, message, action) };
  }
  return { skip: "Unknown reminder type" };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return Response.json({ error: "POST required" }, { status: 405 });
  try {
    const expected = await secret("dealguard_cron_secret");
    if (!expected || req.headers.get("x-dealguard-cron") !== expected) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const resendKey = await secret("resend_api_key");
    if (!resendKey) return Response.json({ ok: true, configured: false, message: "Email provider not connected" });
    const from = (await secret("resend_from_email")) || "DealGuard <onboarding@resend.dev>";
    const { data: due, error } = await admin.from("reminders").select("id,user_id,deal_id,reminder_type,reminder_at,source_type,source_id,attempts").in("status", ["pending","failed"]).lte("reminder_at", new Date().toISOString()).lt("attempts", 3).order("reminder_at").limit(25);
    if (error) throw error;
    let sent=0, skipped=0, failed=0;
    for (const r of due || []) {
      const { data: claim } = await admin.from("reminders").update({ status:"processing", attempts:(r.attempts||0)+1, last_error:null }).eq("id", r.id).in("status", ["pending","failed"]).select("id").maybeSingle();
      if (!claim) continue;
      try {
        const { data: pref } = await admin.from("notification_preferences").select("email_enabled").eq("user_id", r.user_id).maybeSingle();
        if (pref?.email_enabled === false) {
          await admin.from("reminders").update({ status:"skipped", processed_at:new Date().toISOString(), last_error:"Email reminders disabled" }).eq("id", r.id); skipped++; continue;
        }
        const { data: u, error: ue } = await admin.auth.admin.getUserById(r.user_id);
        if (ue || !u.user?.email) throw new Error(ue?.message || "Creator email missing");
        const mail: any = compose(r, await context(r));
        if (mail.skip) { await admin.from("reminders").update({ status:"skipped", processed_at:new Date().toISOString(), last_error:mail.skip }).eq("id", r.id); skipped++; continue; }
        const res = await fetch("https://api.resend.com/emails", { method:"POST", headers:{ Authorization:`Bearer ${resendKey}`, "Content-Type":"application/json" }, body:JSON.stringify({ from, to:[u.user.email], subject:mail.subject, html:mail.html, text:mail.text, headers:{ "X-DealGuard-Reminder":r.id } }) });
        const body: any = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body?.message || `Resend HTTP ${res.status}`);
        await admin.from("reminders").update({ status:"sent", sent_at:new Date().toISOString(), processed_at:new Date().toISOString(), provider_message_id:body?.id || null, last_error:null }).eq("id", r.id); sent++;
      } catch (e) {
        await admin.from("reminders").update({ status:"failed", processed_at:new Date().toISOString(), last_error:(e instanceof Error ? e.message : String(e)).slice(0,1000) }).eq("id", r.id); failed++;
      }
    }
    return Response.json({ ok:true, configured:true, scanned:(due||[]).length, sent, skipped, failed });
  } catch (e) {
    console.error(e); return Response.json({ error:e instanceof Error ? e.message : "Worker error" }, { status:500 });
  } finally { await sql.end({ timeout:1 }).catch(() => undefined); }
});

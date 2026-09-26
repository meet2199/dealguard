"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { AppUser, Deal, DealStatus, NewDealInput, NotificationPreferences, PaymentStatus, ReminderSummary } from "@/lib/types";

type View = "dashboard" | "deals" | "payments" | "rights" | "calendar" | "settings";

type Props = {
  initialDeals: Deal[];
  user: AppUser;
  supabaseEnabled: boolean;
  initialPreferences: NotificationPreferences;
  initialReminderSummary: ReminderSummary;
};

const NAV: { id: View; label: string; icon: string }[] = [
  { id: "dashboard", label: "Home", icon: "⌂" },
  { id: "deals", label: "Deals", icon: "▣" },
  { id: "payments", label: "Money", icon: "◫" },
  { id: "rights", label: "Rights", icon: "◎" },
  { id: "calendar", label: "Calendar", icon: "□" },
];

const STATUS_OPTIONS: DealStatus[] = [
  "Lead",
  "Negotiating",
  "Confirmed",
  "Content Due",
  "Submitted",
  "Published",
  "Payment Pending",
  "Paid",
  "Completed",
];

const DEMO_KEY = "dealguard-phase2-demo-deals";

function parseDate(date: string) {
  return new Date(`${date}T12:00:00`);
}

function daysUntil(date: string) {
  const now = new Date();
  now.setHours(12, 0, 0, 0);
  return Math.ceil((parseDate(date).getTime() - now.getTime()) / 86400000);
}

function humanDate(date: string, short = false) {
  if (!date) return "—";
  return parseDate(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(short ? {} : { year: "numeric" }),
  });
}

function formatMoney(value: number, currency = "USD") {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `$${Math.round(value).toLocaleString()}`;
  }
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function effectivePaymentStatus(deal: Deal): PaymentStatus {
  if (deal.paymentStatus === "Paid" || deal.status === "Paid" || deal.status === "Completed") return "Paid";
  if (daysUntil(deal.paymentDue) < 0) return "Overdue";
  return deal.paymentStatus;
}

function statusTone(status: DealStatus) {
  if (status === "Paid" || status === "Completed") return "green";
  if (status === "Payment Pending" || status === "Content Due") return "amber";
  if (["Published", "Submitted", "Confirmed"].includes(status)) return "blue";
  return "purple";
}

function paymentTone(status: PaymentStatus) {
  if (status === "Paid") return "green";
  if (status === "Overdue") return "red";
  return "amber";
}

export default function DealGuardApp({ initialDeals, user, supabaseEnabled, initialPreferences, initialReminderSummary }: Props) {
  const router = useRouter();
  const supabase = useMemo(() => (supabaseEnabled ? createClient() : null), [supabaseEnabled]);
  const [view, setView] = useState<View>("dashboard");
  const [deals, setDeals] = useState<Deal[]>(initialDeals);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("All");
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [preferences, setPreferences] = useState<NotificationPreferences>(initialPreferences);
  const [reminderSummary, setReminderSummary] = useState<ReminderSummary>(initialReminderSummary);
  const [preferenceSaving, setPreferenceSaving] = useState(false);

  useEffect(() => {
    if (!supabaseEnabled) {
      const saved = localStorage.getItem(DEMO_KEY);
      if (saved) {
        try {
          const parsed = JSON.parse(saved) as Deal[];
          if (Array.isArray(parsed) && parsed.length) setDeals(parsed);
        } catch {
          // Keep seeded data if local demo data is malformed.
        }
      }
    }
  }, [supabaseEnabled]);

  useEffect(() => {
    if (!supabaseEnabled) localStorage.setItem(DEMO_KEY, JSON.stringify(deals));
  }, [deals, supabaseEnabled]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const selectedDeal = deals.find((d) => d.id === selectedId) ?? null;
  const defaultCurrency = deals[0]?.currency || "USD";

  const totals = useMemo(() => {
    const active = deals.filter((d) => !["Paid", "Completed"].includes(d.status));
    const unpaid = deals.filter((d) => effectivePaymentStatus(d) !== "Paid");
    const overdue = unpaid.filter((d) => effectivePaymentStatus(d) === "Overdue");
    const dueSoon = unpaid.filter((d) => daysUntil(d.paymentDue) >= 0 && daysUntil(d.paymentDue) <= 30);
    const rightsSoon = deals.filter((d) => daysUntil(d.rightsEnd) >= 0 && daysUntil(d.rightsEnd) <= 30);
    return {
      totalValue: deals.reduce((s, d) => s + d.value, 0),
      active,
      unpaid,
      overdue,
      dueSoon,
      rightsSoon,
    };
  }, [deals]);

  async function refreshReminderSummary() {
    if (!supabase || !supabaseEnabled) return;
    const { data } = await supabase
      .from("reminders")
      .select("status,reminder_at")
      .in("status", ["pending", "failed"])
      .order("reminder_at", { ascending: true })
      .limit(100);
    if (!data) return;
    const pending = data.filter((row) => row.status === "pending");
    setReminderSummary({
      pendingCount: pending.length,
      failedCount: data.filter((row) => row.status === "failed").length,
      nextReminderAt: pending[0]?.reminder_at,
    });
  }

  function navigate(next: View) {
    setSelectedId(null);
    setView(next);
    if (next === "settings") void refreshReminderSummary();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function createDeal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const input: NewDealInput = {
      brand: String(form.get("brand") || "").trim(),
      campaign: String(form.get("campaign") || "").trim(),
      value: Number(form.get("value") || 0),
      currency: String(form.get("currency") || "USD"),
      status: String(form.get("status") || "Confirmed") as DealStatus,
      platform: String(form.get("platform") || "Instagram"),
      dueDate: String(form.get("dueDate") || ""),
      paymentDue: String(form.get("paymentDue") || ""),
      rightsEnd: String(form.get("rightsEnd") || ""),
      deliverable: String(form.get("deliverable") || "").trim(),
      email: String(form.get("email") || "").trim(),
      notes: String(form.get("notes") || "").trim(),
      paymentTerms: String(form.get("paymentTerms") || "Net 30"),
      rightsType: String(form.get("rightsType") || "Organic"),
    };

    setSaving(true);
    try {
      if (!supabase || !supabaseEnabled) {
        const created: Deal = {
          id: `demo-${Date.now()}`,
          ...input,
          paymentStatus: daysUntil(input.paymentDue) < 0 ? "Overdue" : "Pending",
          rightsType: input.rightsType || "Organic",
          createdAt: new Date().toISOString(),
        };
        setDeals((prev) => [created, ...prev]);
        setModalOpen(false);
        setToast("Deal created in demo mode");
        formElement.reset();
        return;
      }

      let brandId: string | undefined;
      const { data: existingBrand } = await supabase
        .from("brands")
        .select("id")
        .eq("user_id", user.id)
        .ilike("name", input.brand)
        .limit(1)
        .maybeSingle();

      if (existingBrand?.id) {
        brandId = existingBrand.id;
        if (input.email) {
          await supabase.from("brands").update({ contact_email: input.email }).eq("id", brandId);
        }
      } else {
        const { data: brand, error: brandError } = await supabase
          .from("brands")
          .insert({ user_id: user.id, name: input.brand, contact_email: input.email || null })
          .select("id")
          .single();
        if (brandError) throw brandError;
        brandId = brand.id;
      }

      const { data: dealRow, error: dealError } = await supabase
        .from("deals")
        .insert({
          user_id: user.id,
          brand_id: brandId,
          campaign_name: input.campaign,
          deal_value: input.value,
          currency: input.currency,
          status: input.status,
          platform: input.platform,
          notes: input.notes || null,
        })
        .select("id, created_at")
        .single();
      if (dealError) throw dealError;

      const [deliverableResult, paymentResult, rightsResult] = await Promise.all([
        supabase.from("deliverables").insert({
          deal_id: dealRow.id,
          platform: input.platform,
          deliverable_type: input.deliverable,
          due_date: input.dueDate,
          status: "Pending",
        }),
        supabase.from("payments").insert({
          deal_id: dealRow.id,
          amount: input.value,
          currency: input.currency,
          payment_terms: input.paymentTerms,
          due_date: input.paymentDue,
          status: "Pending",
        }),
        supabase.from("usage_rights").insert({
          deal_id: dealRow.id,
          usage_type: input.rightsType || "Organic",
          start_date: new Date().toISOString().slice(0, 10),
          end_date: input.rightsEnd,
          territory: "Worldwide",
        }),
      ]);

      const childError = deliverableResult.error || paymentResult.error || rightsResult.error;
      if (childError) throw childError;

      const created: Deal = {
        id: dealRow.id,
        brandId,
        brand: input.brand,
        campaign: input.campaign,
        value: input.value,
        currency: input.currency,
        status: input.status,
        platform: input.platform,
        dueDate: input.dueDate,
        paymentDue: input.paymentDue,
        paymentStatus: "Pending",
        rightsEnd: input.rightsEnd,
        rightsType: input.rightsType || "Organic",
        deliverable: input.deliverable,
        email: input.email,
        notes: input.notes,
        createdAt: dealRow.created_at,
      };

      setDeals((prev) => [created, ...prev]);
      await refreshReminderSummary();
      setModalOpen(false);
      setToast("Deal saved — reminders queued automatically");
      formElement.reset();
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Could not create deal");
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(dealId: string, status: DealStatus) {
    const old = deals;
    setDeals((prev) =>
      prev.map((d) =>
        d.id === dealId
          ? { ...d, status, paymentStatus: status === "Paid" ? "Paid" : d.paymentStatus }
          : d
      )
    );

    if (!supabase || !supabaseEnabled) {
      setToast(`Moved to ${status}`);
      return;
    }

    const { error } = await supabase.from("deals").update({ status }).eq("id", dealId);
    if (!error && status === "Paid") {
      await supabase.from("payments").update({ status: "Paid", paid_date: new Date().toISOString().slice(0, 10) }).eq("deal_id", dealId);
    }
    if (error) {
      setDeals(old);
      setToast(error.message);
    } else {
      setToast(`Moved to ${status}`);
    }
  }

  async function setEmailReminders(enabled: boolean) {
    const previous = preferences;
    setPreferences((current) => ({ ...current, emailEnabled: enabled }));

    if (!supabase || !supabaseEnabled) {
      setToast(enabled ? "Demo email reminders enabled" : "Demo email reminders paused");
      return;
    }

    setPreferenceSaving(true);
    const { error } = await supabase
      .from("notification_preferences")
      .update({ email_enabled: enabled })
      .eq("user_id", user.id);
    setPreferenceSaving(false);

    if (error) {
      setPreferences(previous);
      setToast(error.message);
    } else {
      setToast(enabled ? "Email reminders enabled" : "Email reminders paused");
      router.refresh();
    }
  }

  async function signOut() {
    if (!supabase || !supabaseEnabled) {
      router.push("/login");
      return;
    }
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  function resetDemo() {
    if (supabaseEnabled) return;
    localStorage.removeItem(DEMO_KEY);
    setDeals(initialDeals);
    setSelectedId(null);
    setToast("Demo data reset");
  }

  const pageTitle = selectedDeal
    ? selectedDeal.brand
    : view === "dashboard"
      ? `Good ${greeting()}, ${user.name.split(" ")[0]}`
      : ({ deals: "Brand deals", payments: "Money Watch", rights: "Rights Watch", calendar: "Calendar", settings: "Settings" } as Record<string, string>)[view];

  const eyebrow = selectedDeal
    ? "DEAL DETAILS"
    : ({ dashboard: "OVERVIEW", deals: "PIPELINE", payments: "RECEIVABLES", rights: "CONTENT RIGHTS", calendar: "IMPORTANT DATES", settings: "WORKSPACE" } as Record<View, string>)[view];

  return (
    <div className="app-frame">
      <aside className="desktop-sidebar">
        <div className="logo-lockup">
          <span className="logo-mark">DG</span>
          <span>
            <strong>DealGuard</strong>
            <small>Creator money & rights</small>
          </span>
        </div>

        <nav className="sidebar-nav">
          {NAV.map((item) => (
            <button key={item.id} className={`nav-button ${view === item.id && !selectedDeal ? "active" : ""}`} onClick={() => navigate(item.id)}>
              <span className="nav-icon">{item.icon}</span>
              {item.label === "Home" ? "Dashboard" : item.label}
            </button>
          ))}
        </nav>

        <div className="sidebar-spacer" />
        <div className="plan-card">
          <span>BETA WORKSPACE</span>
          <strong>{totals.active.length} active deals</strong>
          <div className="plan-progress"><i style={{ width: `${Math.min(100, (totals.active.length / 10) * 100)}%` }} /></div>
          <small>Free during private beta</small>
        </div>
        <button className={`nav-button ${view === "settings" ? "active" : ""}`} onClick={() => navigate("settings")}>
          <span className="nav-icon">⚙</span> Settings
        </button>
        <button className="profile-button" onClick={() => navigate("settings")}>
          <span className="avatar">{initials(user.name)}</span>
          <span className="profile-copy"><strong>{user.name}</strong><small>{user.email}</small></span>
        </button>
      </aside>

      <main className="main-area">
        <header className="app-topbar">
          <div className="mobile-brand"><span className="logo-mark">DG</span><strong>DealGuard</strong></div>
          <div className="page-heading">
            {selectedDeal && <button className="back-button" onClick={() => setSelectedId(null)}>← Back</button>}
            <span className="eyebrow">{eyebrow}</span>
            <h1>{pageTitle}</h1>
          </div>
          <div className="topbar-actions">
            {!supabaseEnabled && <button className="button secondary desktop-only" onClick={resetDemo}>Reset demo</button>}
            <button className="button primary" onClick={() => setModalOpen(true)}><span>＋</span><span className="add-label">Add deal</span></button>
          </div>
        </header>

        {!supabaseEnabled && (
          <div className="demo-banner">
            <span><strong>Demo mode:</strong> the interface is fully interactive, but data is stored only in this browser until Supabase is connected.</span>
            <a href="#setup" onClick={(e) => { e.preventDefault(); navigate("settings"); }}>Connect backend</a>
          </div>
        )}

        <section className="workspace">
          {selectedDeal ? (
            <DealDetail deal={selectedDeal} onStatus={changeStatus} />
          ) : view === "dashboard" ? (
            <Dashboard deals={deals} currency={defaultCurrency} totals={totals} onOpen={setSelectedId} onNavigate={navigate} />
          ) : view === "deals" ? (
            <DealsView deals={deals} filter={filter} setFilter={setFilter} search={search} setSearch={setSearch} onOpen={setSelectedId} />
          ) : view === "payments" ? (
            <PaymentsView deals={deals} currency={defaultCurrency} automationEnabled={preferences.emailEnabled} />
          ) : view === "rights" ? (
            <RightsView deals={deals} />
          ) : view === "calendar" ? (
            <CalendarView deals={deals} />
          ) : (
            <SettingsView
              user={user}
              supabaseEnabled={supabaseEnabled}
              preferences={preferences}
              reminderSummary={reminderSummary}
              preferenceSaving={preferenceSaving}
              onToggleEmail={setEmailReminders}
              onSignOut={signOut}
              onReset={resetDemo}
            />
          )}
        </section>
      </main>

      <nav className="mobile-bottom-nav" aria-label="Primary navigation">
        {NAV.map((item) => (
          <button key={item.id} className={view === item.id && !selectedDeal ? "active" : ""} onClick={() => navigate(item.id)}>
            <span>{item.icon}</span>
            <small>{item.label}</small>
          </button>
        ))}
      </nav>

      {modalOpen && (
        <AddDealModal onClose={() => setModalOpen(false)} onSubmit={createDeal} saving={saving} />
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}

function Dashboard({ deals, currency, totals, onOpen, onNavigate }: {
  deals: Deal[];
  currency: string;
  totals: ReturnType<typeof makeTotalsPlaceholder>;
  onOpen: (id: string) => void;
  onNavigate: (v: View) => void;
}) {
  const urgent = [
    ...totals.overdue.map((d) => ({ id: d.id, tone: "red", title: `${d.brand} payment overdue`, sub: `${Math.abs(daysUntil(d.paymentDue))} days overdue`, right: formatMoney(d.value, d.currency) })),
    ...deals.filter((d) => daysUntil(d.rightsEnd) >= 0 && daysUntil(d.rightsEnd) <= 14).map((d) => ({ id: d.id, tone: "amber", title: `${d.brand} rights expiring`, sub: `${daysUntil(d.rightsEnd)} days remaining`, right: "Renewal" })),
    ...deals.filter((d) => daysUntil(d.dueDate) >= 0 && daysUntil(d.dueDate) <= 3).map((d) => ({ id: d.id, tone: "blue", title: `${d.brand} deliverable due`, sub: `${humanDate(d.dueDate)} · ${d.deliverable}`, right: "Content" })),
  ].slice(0, 6);

  const upcoming = deals
    .flatMap((d) => [
      { id: `${d.id}-payment`, dealId: d.id, date: d.paymentDue, label: `${d.brand} payment`, kind: "Payment" },
      { id: `${d.id}-rights`, dealId: d.id, date: d.rightsEnd, label: `${d.brand} rights expire`, kind: "Rights" },
      { id: `${d.id}-content`, dealId: d.id, date: d.dueDate, label: `${d.brand} content due`, kind: "Content" },
    ])
    .filter((x) => daysUntil(x.date) >= 0)
    .sort((a, b) => parseDate(a.date).getTime() - parseDate(b.date).getTime())
    .slice(0, 6);

  return (
    <>
      <div className="metric-grid">
        <Metric label="Total deal value" value={formatMoney(totals.totalValue, currency)} foot={`Across ${deals.length} collaborations`} icon="◈" />
        <Metric label="Awaiting payment" value={formatMoney(totals.unpaid.reduce((s: number, d: Deal) => s + d.value, 0), currency)} foot="Money still moving toward you" icon="◫" />
        <Metric label="Overdue" value={formatMoney(totals.overdue.reduce((s: number, d: Deal) => s + d.value, 0), currency)} foot={`${totals.overdue.length} payment${totals.overdue.length === 1 ? "" : "s"} need attention`} icon="!" danger />
        <Metric label="Active deals" value={String(totals.active.length)} foot={`${new Set(totals.active.map((d: Deal) => d.brand)).size} active brands`} icon="▣" />
      </div>

      <div className="dashboard-grid">
        <Panel title="Needs attention" subtitle="Money, content and rights that need action now." action="View deals" onAction={() => onNavigate("deals")}>
          <div className="stack-list">
            {urgent.length ? urgent.map((item) => (
              <button className="attention-row" key={`${item.id}-${item.title}`} onClick={() => onOpen(item.id)}>
                <i className={`signal ${item.tone}`} />
                <span className="row-copy"><strong>{item.title}</strong><small>{item.sub}</small></span>
                <b>{item.right}</b>
              </button>
            )) : <EmptyState title="Nothing urgent" text="You are caught up for now." />}
          </div>
        </Panel>

        <Panel title="Upcoming" subtitle="Your next important dates">
          <div className="stack-list compact">
            {upcoming.map((item) => (
              <button className="upcoming-row" key={item.id} onClick={() => onOpen(item.dealId)}>
                <span className="date-tile"><b>{parseDate(item.date).getDate()}</b><small>{parseDate(item.date).toLocaleDateString("en-US", { month: "short" })}</small></span>
                <span className="row-copy"><strong>{item.label}</strong><small>{humanDate(item.date)}</small></span>
                <Pill tone={item.kind === "Payment" ? "red" : item.kind === "Rights" ? "amber" : "blue"}>{item.kind}</Pill>
              </button>
            ))}
          </div>
        </Panel>
      </div>

      <Panel title="Recent deals" subtitle="Your collaboration pipeline at a glance." action="Open pipeline" onAction={() => onNavigate("deals")} className="recent-panel">
        <DealTable deals={deals.slice(0, 5)} onOpen={onOpen} />
      </Panel>
    </>
  );
}

// This function exists only so Dashboard's prop can share the inferred totals shape without duplicating a large inline type.
function makeTotalsPlaceholder() {
  return {
    totalValue: 0,
    active: [] as Deal[],
    unpaid: [] as Deal[],
    overdue: [] as Deal[],
    dueSoon: [] as Deal[],
    rightsSoon: [] as Deal[],
  };
}

function Metric({ label, value, foot, icon, danger = false }: { label: string; value: string; foot: string; icon: string; danger?: boolean }) {
  return (
    <article className="metric-card">
      <div className="metric-head"><span>{label}</span><i>{icon}</i></div>
      <strong className={danger ? "danger-text" : ""}>{value}</strong>
      <small>{foot}</small>
    </article>
  );
}

function Panel({ title, subtitle, action, onAction, className = "", children }: { title: string; subtitle?: string; action?: string; onAction?: () => void; className?: string; children: React.ReactNode }) {
  return (
    <section className={`panel ${className}`}>
      <div className="panel-head">
        <div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
        {action && <button className="text-button" onClick={onAction}>{action} →</button>}
      </div>
      {children}
    </section>
  );
}

function DealsView({ deals, filter, setFilter, search, setSearch, onOpen }: { deals: Deal[]; filter: string; setFilter: (v: string) => void; search: string; setSearch: (v: string) => void; onOpen: (id: string) => void }) {
  const filters = ["All", "Lead", "Negotiating", "Confirmed", "Content Due", "Published", "Payment Pending", "Paid"];
  const filtered = deals.filter((d) => {
    const stage = filter === "All" || d.status === filter;
    const query = `${d.brand} ${d.campaign} ${d.platform}`.toLowerCase();
    return stage && query.includes(search.toLowerCase());
  });

  return (
    <>
      <div className="section-heading">
        <div><h2>Your collaboration pipeline</h2><p>From first conversation through payment and rights expiry.</p></div>
        <label className="search-box"><span>⌕</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search brand or campaign" /></label>
      </div>
      <div className="filter-scroll" aria-label="Deal filters">
        {filters.map((item) => <button key={item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>{item}</button>)}
      </div>
      <Panel title={`${filtered.length} deal${filtered.length === 1 ? "" : "s"}`} subtitle={filter === "All" ? "All stages" : filter}>
        {filtered.length ? <DealTable deals={filtered} onOpen={onOpen} /> : <EmptyState title="No matching deals" text="Try a different stage or search term." />}
      </Panel>
    </>
  );
}

function DealTable({ deals, onOpen }: { deals: Deal[]; onOpen: (id: string) => void }) {
  return (
    <>
      <div className="desktop-deal-table">
        <table>
          <thead><tr><th>BRAND / CAMPAIGN</th><th>VALUE</th><th>STATUS</th><th>CONTENT DUE</th><th>PAYMENT</th><th>RIGHTS END</th></tr></thead>
          <tbody>
            {deals.map((d) => (
              <tr key={d.id} onClick={() => onOpen(d.id)}>
                <td><BrandCell deal={d} /></td>
                <td><strong>{formatMoney(d.value, d.currency)}</strong></td>
                <td><Pill tone={statusTone(d.status)}>{d.status}</Pill></td>
                <td>{humanDate(d.dueDate, true)}</td>
                <td className={effectivePaymentStatus(d) === "Overdue" ? "danger-text" : ""}>{humanDate(d.paymentDue, true)}</td>
                <td>{humanDate(d.rightsEnd, true)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mobile-deal-list">
        {deals.map((d) => (
          <button className="deal-mobile-card" key={d.id} onClick={() => onOpen(d.id)}>
            <div className="mobile-card-head"><BrandCell deal={d} /><Pill tone={statusTone(d.status)}>{d.status}</Pill></div>
            <div className="mobile-card-value">{formatMoney(d.value, d.currency)}</div>
            <div className="mobile-card-dates">
              <span><small>Content</small><strong>{humanDate(d.dueDate, true)}</strong></span>
              <span><small>Payment</small><strong className={effectivePaymentStatus(d) === "Overdue" ? "danger-text" : ""}>{humanDate(d.paymentDue, true)}</strong></span>
              <span><small>Rights</small><strong>{humanDate(d.rightsEnd, true)}</strong></span>
            </div>
          </button>
        ))}
      </div>
    </>
  );
}

function BrandCell({ deal }: { deal: Deal }) {
  return (
    <span className="brand-cell">
      <i className="brand-avatar">{initials(deal.brand)}</i>
      <span><strong>{deal.brand}</strong><small>{deal.campaign}</small></span>
    </span>
  );
}

function PaymentsView({ deals, currency, automationEnabled }: { deals: Deal[]; currency: string; automationEnabled: boolean }) {
  const open = deals.filter((d) => effectivePaymentStatus(d) !== "Paid");
  const overdue = open.filter((d) => effectivePaymentStatus(d) === "Overdue");
  const due30 = open.filter((d) => daysUntil(d.paymentDue) >= 0 && daysUntil(d.paymentDue) <= 30);
  const totalOpen = open.reduce((s, d) => s + d.value, 0);

  return (
    <>
      <section className="money-hero">
        <div><span>CREATOR RECEIVABLES</span><h2>{formatMoney(totalOpen, currency)}</h2><p>Money still moving toward you.</p></div>
        <div className="money-hero-stats">
          <span><small>OVERDUE</small><strong>{formatMoney(overdue.reduce((s, d) => s + d.value, 0), currency)}</strong></span>
          <span><small>DUE NEXT 30 DAYS</small><strong>{formatMoney(due30.reduce((s, d) => s + d.value, 0), currency)}</strong></span>
        </div>
      </section>
      <div className="two-column-grid">
        <Panel title="Needs follow-up" subtitle="Prioritize overdue money first.">
          <div className="stack-list">
            {[...overdue, ...open.filter((d) => !overdue.includes(d))].map((d) => {
              const status = effectivePaymentStatus(d);
              const mailto = `mailto:${encodeURIComponent(d.email || "")}?subject=${encodeURIComponent(`Payment follow-up — ${d.campaign}`)}&body=${encodeURIComponent(`Hi,\n\nJust following up on the ${formatMoney(d.value, d.currency)} payment for ${d.campaign}. The payment due date is ${humanDate(d.paymentDue)}.\n\nThank you.`)}`;
              return (
                <article className="money-row" key={d.id}>
                  <BrandCell deal={d} />
                  <span className="money-row-main"><strong>{formatMoney(d.value, d.currency)}</strong><small>Due {humanDate(d.paymentDue)} · {daysUntil(d.paymentDue) < 0 ? `${Math.abs(daysUntil(d.paymentDue))} days late` : `${daysUntil(d.paymentDue)} days`}</small></span>
                  <Pill tone={paymentTone(status)}>{status}</Pill>
                  {d.email && <a className="mini-action" href={mailto}>Draft follow-up</a>}
                </article>
              );
            })}
            {!open.length && <EmptyState title="Nothing outstanding" text="All tracked payments are marked paid." />}
          </div>
        </Panel>
        <Panel title="Payment rhythm" subtitle="A simple health check for your receivables.">
          <div className="health-list">
            <HealthLine label="Paid / complete" value={deals.filter((d) => effectivePaymentStatus(d) === "Paid").length} total={Math.max(deals.length, 1)} tone="green" />
            <HealthLine label="Pending" value={open.filter((d) => effectivePaymentStatus(d) === "Pending").length} total={Math.max(deals.length, 1)} tone="amber" />
            <HealthLine label="Overdue" value={overdue.length} total={Math.max(deals.length, 1)} tone="red" />
          </div>
          <div className="tip-box"><strong>{automationEnabled ? "Money Watch scheduling is active" : "Money Watch is paused"}</strong><p>{automationEnabled ? "DealGuard queues reminders 3 days before payment, on the due date, then 1 and 7 days after overdue. Email delivery starts once the email provider is connected." : "Turn email reminders back on in Settings when you want DealGuard to notify you automatically."}</p></div>
        </Panel>
      </div>
    </>
  );
}

function HealthLine({ label, value, total, tone }: { label: string; value: number; total: number; tone: string }) {
  return <div className="health-line"><div><span>{label}</span><strong>{value}</strong></div><i><b className={tone} style={{ width: `${Math.max(4, (value / total) * 100)}%` }} /></i></div>;
}

function RightsView({ deals }: { deals: Deal[] }) {
  const sorted = [...deals].sort((a, b) => parseDate(a.rightsEnd).getTime() - parseDate(b.rightsEnd).getTime());
  const active = sorted.filter((d) => daysUntil(d.rightsEnd) >= 0);
  const expired = sorted.filter((d) => daysUntil(d.rightsEnd) < 0);

  return (
    <>
      <div className="rights-summary-grid">
        <SummaryTile label="Expiring in 30 days" value={active.filter((d) => daysUntil(d.rightsEnd) <= 30).length} text="Potential renewal conversations" tone="amber" />
        <SummaryTile label="Active rights" value={active.length} text="Content currently licensed" tone="blue" />
        <SummaryTile label="Expired" value={expired.length} text="Review brand usage if still live" tone="red" />
      </div>
      <Panel title="Rights Watch" subtitle="A deal is not finished just because the invoice was paid.">
        <div className="rights-list">
          {sorted.map((d) => {
            const days = daysUntil(d.rightsEnd);
            return (
              <article className="rights-card" key={d.id}>
                <div className="rights-card-top"><BrandCell deal={d} /><Pill tone={days < 0 ? "red" : days <= 14 ? "amber" : "green"}>{days < 0 ? "Expired" : `${days} days left`}</Pill></div>
                <div className="rights-card-body">
                  <span><small>Usage</small><strong>{d.rightsType}</strong></span>
                  <span><small>Ends</small><strong>{humanDate(d.rightsEnd)}</strong></span>
                  <span><small>Deal value</small><strong>{formatMoney(d.value, d.currency)}</strong></span>
                </div>
                <div className="rights-action-copy">{days < 0 ? "Check whether the brand is still using the content." : days <= 14 ? "Good time to open a renewal conversation." : "No action needed yet."}</div>
              </article>
            );
          })}
        </div>
      </Panel>
    </>
  );
}

function SummaryTile({ label, value, text, tone }: { label: string; value: number; text: string; tone: string }) {
  return <article className={`summary-tile ${tone}`}><span>{label}</span><strong>{value}</strong><small>{text}</small></article>;
}

function CalendarView({ deals }: { deals: Deal[] }) {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const first = new Date(year, month, 1);
  const days = new Date(year, month + 1, 0).getDate();
  const offset = first.getDay();
  const events = deals.flatMap((d) => [
    { id: `${d.id}-content`, dealId: d.id, date: d.dueDate, label: `${d.brand} content`, kind: "content" },
    { id: `${d.id}-payment`, dealId: d.id, date: d.paymentDue, label: `${d.brand} payment`, kind: "payment" },
    { id: `${d.id}-rights`, dealId: d.id, date: d.rightsEnd, label: `${d.brand} rights`, kind: "rights" },
  ]);
  const upcoming = [...events].filter((e) => daysUntil(e.date) >= 0).sort((a, b) => parseDate(a.date).getTime() - parseDate(b.date).getTime()).slice(0, 30);

  return (
    <Panel title={today.toLocaleDateString("en-US", { month: "long", year: "numeric" })} subtitle="Content, payment and rights deadlines in one view.">
      <div className="calendar-desktop">
        <div className="calendar-grid calendar-labels">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <span key={d}>{d}</span>)}</div>
        <div className="calendar-grid">
          {Array.from({ length: offset }, (_, i) => <div className="calendar-day muted" key={`blank-${i}`} />)}
          {Array.from({ length: days }, (_, i) => i + 1).map((day) => {
            const iso = new Date(year, month, day, 12).toISOString().slice(0, 10);
            const dayEvents = events.filter((e) => e.date === iso);
            return <div className={`calendar-day ${day === today.getDate() ? "today" : ""}`} key={day}><b>{day}</b>{dayEvents.slice(0, 3).map((e) => <span className={`calendar-event ${e.kind}`} key={e.id}>{e.label}</span>)}{dayEvents.length > 3 && <small>+{dayEvents.length - 3} more</small>}</div>;
          })}
        </div>
      </div>
      <div className="calendar-mobile-agenda">
        {upcoming.map((e) => <article key={e.id}><span className="agenda-date"><b>{parseDate(e.date).getDate()}</b><small>{parseDate(e.date).toLocaleDateString("en-US", { month: "short" })}</small></span><span className="row-copy"><strong>{e.label}</strong><small>{humanDate(e.date)}</small></span><Pill tone={e.kind === "payment" ? "red" : e.kind === "rights" ? "amber" : "blue"}>{e.kind}</Pill></article>)}
      </div>
    </Panel>
  );
}

function SettingsView({
  user,
  supabaseEnabled,
  preferences,
  reminderSummary,
  preferenceSaving,
  onToggleEmail,
  onSignOut,
  onReset,
}: {
  user: AppUser;
  supabaseEnabled: boolean;
  preferences: NotificationPreferences;
  reminderSummary: ReminderSummary;
  preferenceSaving: boolean;
  onToggleEmail: (enabled: boolean) => void;
  onSignOut: () => void;
  onReset: () => void;
}) {
  const nextLabel = reminderSummary.nextReminderAt
    ? new Date(reminderSummary.nextReminderAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : "Nothing queued yet";

  return (
    <div className="settings-layout" id="setup">
      <Panel title="Creator profile" subtitle="Workspace identity used across your deal dashboard.">
        <div className="profile-settings"><span className="avatar large">{initials(user.name)}</span><div><strong>{user.name}</strong><p>{user.email}</p></div></div>
      </Panel>
      <Panel title="Backend status" subtitle="Live DealGuard infrastructure">
        <div className="connection-status"><i className={supabaseEnabled ? "connected" : "demo"} /><div><strong>{supabaseEnabled ? "Supabase connected" : "Demo mode"}</strong><p>{supabaseEnabled ? "Authentication, creator-owned rows, reminder triggers and scheduled processing are active." : "The demo stays local until Supabase is configured."}</p></div></div>
        {!supabaseEnabled && <button className="button secondary" onClick={onReset}>Reset local demo data</button>}
      </Panel>
      <Panel title="Email automation" subtitle="Phase 3 reminder engine">
        <div className="automation-master">
          <div>
            <span className={`automation-dot ${preferences.emailEnabled ? "active" : "paused"}`} />
            <div><strong>{preferences.emailEnabled ? "Reminder queue enabled" : "Reminder queue paused"}</strong><small>The worker checks every 15 minutes. Email delivery requires the connected email provider.</small></div>
          </div>
          <button
            type="button"
            className={`toggle-switch ${preferences.emailEnabled ? "on" : ""}`}
            role="switch"
            aria-checked={preferences.emailEnabled}
            aria-label="Email reminders"
            disabled={preferenceSaving}
            onClick={() => onToggleEmail(!preferences.emailEnabled)}
          ><i /></button>
        </div>
        <div className="automation-stats">
          <span><small>QUEUED</small><strong>{reminderSummary.pendingCount}</strong></span>
          <span><small>FAILED / RETRY</small><strong>{reminderSummary.failedCount}</strong></span>
          <span><small>NEXT REMINDER</small><strong>{nextLabel}</strong></span>
        </div>
      </Panel>
      <Panel title="Reminder schedule" subtitle="Default protection windows for every new deal.">
        <div className="setting-lines automation-lines">
          <span><div><strong>Payment reminders</strong><small>{preferences.paymentDueDays.join(" / ")} days before-or-on due date; overdue follow-up after {preferences.paymentOverdueDays.join(" / ")} days.</small></div><em className="live-tag">LIVE</em></span>
          <span><div><strong>Rights expiry alerts</strong><small>{preferences.rightsExpiryDays.join(" / ")} days before usage rights end.</small></div><em className="live-tag">LIVE</em></span>
          <span><div><strong>Content deadlines</strong><small>{preferences.deliverableDueDays.join(" / ")} days before deliverables are due.</small></div><em className="live-tag">LIVE</em></span>
        </div>
      </Panel>
      <Panel title="Account" subtitle="Manage your workspace session.">
        <button className="button danger-outline" onClick={onSignOut}>{supabaseEnabled ? "Sign out" : "Exit demo"}</button>
      </Panel>
    </div>
  );
}

function DealDetail({ deal, onStatus }: { deal: Deal; onStatus: (id: string, status: DealStatus) => void }) {
  const payStatus = effectivePaymentStatus(deal);
  const rightsDays = daysUntil(deal.rightsEnd);
  return (
    <div className="detail-grid">
      <div>
        <section className="detail-hero">
          <div className="detail-hero-head"><div><span>{deal.platform.toUpperCase()}</span><h2>{deal.campaign}</h2><p>{deal.brand}</p></div><Pill tone={statusTone(deal.status)}>{deal.status}</Pill></div>
          <strong className="detail-value">{formatMoney(deal.value, deal.currency)}</strong>
          <small>Tracked deal value</small>
        </section>
        <Panel title="Deal timeline" subtitle="Core dates that move this collaboration forward.">
          <div className="detail-kv-grid">
            <KV label="Deliverable" value={deal.deliverable} />
            <KV label="Content due" value={humanDate(deal.dueDate)} />
            <KV label="Payment due" value={humanDate(deal.paymentDue)} danger={payStatus === "Overdue"} />
            <KV label="Rights end" value={humanDate(deal.rightsEnd)} danger={rightsDays < 0} />
          </div>
        </Panel>
        <Panel title="Notes" subtitle="Campaign context and follow-up information." className="detail-notes-panel">
          <p className="deal-notes">{deal.notes || "No notes added yet."}</p>
        </Panel>
      </div>
      <div className="detail-side">
        <Panel title="Next action" subtitle="The one thing that deserves attention.">
          <NextAction deal={deal} />
        </Panel>
        <Panel title="Status" subtitle="Keep the pipeline current.">
          <label className="field"><span>Deal stage</span><select value={deal.status} onChange={(e) => onStatus(deal.id, e.target.value as DealStatus)}>{STATUS_OPTIONS.map((s) => <option key={s}>{s}</option>)}</select></label>
        </Panel>
        <Panel title="Payment" subtitle="What the brand still owes you.">
          <div className="detail-info-line"><span>Status</span><Pill tone={paymentTone(payStatus)}>{payStatus}</Pill></div>
          <div className="detail-info-line"><span>Amount</span><strong>{formatMoney(deal.value, deal.currency)}</strong></div>
          <div className="detail-info-line"><span>Due</span><strong>{humanDate(deal.paymentDue)}</strong></div>
        </Panel>
        <Panel title="Usage rights" subtitle="Keep tracking after publication.">
          <div className="detail-info-line"><span>Type</span><strong>{deal.rightsType}</strong></div>
          <div className="detail-info-line"><span>Ends</span><strong>{humanDate(deal.rightsEnd)}</strong></div>
          <div className="detail-info-line"><span>Window</span><Pill tone={rightsDays < 0 ? "red" : rightsDays <= 14 ? "amber" : "green"}>{rightsDays < 0 ? "Expired" : `${rightsDays} days left`}</Pill></div>
        </Panel>
      </div>
    </div>
  );
}

function NextAction({ deal }: { deal: Deal }) {
  const pay = effectivePaymentStatus(deal);
  const rightsDays = daysUntil(deal.rightsEnd);
  const contentDays = daysUntil(deal.dueDate);
  let title = "Deal looks healthy";
  let text = "No urgent action is required today.";
  let tone = "green";
  if (pay === "Overdue") { title = "Follow up on payment"; text = `${formatMoney(deal.value, deal.currency)} is ${Math.abs(daysUntil(deal.paymentDue))} days overdue.`; tone = "red"; }
  else if (rightsDays >= 0 && rightsDays <= 14) { title = "Open a renewal conversation"; text = `Usage rights expire in ${rightsDays} days.`; tone = "amber"; }
  else if (contentDays >= 0 && contentDays <= 3) { title = "Finish the deliverable"; text = `${deal.deliverable} is due ${contentDays === 0 ? "today" : `in ${contentDays} days`}.`; tone = "blue"; }
  return <div className={`next-action ${tone}`}><span>!</span><div><strong>{title}</strong><p>{text}</p></div></div>;
}

function KV({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) {
  return <div className="kv"><small>{label}</small><strong className={danger ? "danger-text" : ""}>{value}</strong></div>;
}

function Pill({ tone, children }: { tone: string; children: React.ReactNode }) {
  return <span className={`pill ${tone}`}>{children}</span>;
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return <div className="empty-state"><span>✓</span><strong>{title}</strong><p>{text}</p></div>;
}

function AddDealModal({ onClose, onSubmit, saving }: { onClose: () => void; onSubmit: (e: FormEvent<HTMLFormElement>) => void; saving: boolean }) {
  const in30 = new Date(); in30.setDate(in30.getDate() + 30);
  const in60 = new Date(); in60.setDate(in60.getDate() + 60);
  const in14 = new Date(); in14.setDate(in14.getDate() + 14);
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  return (
    <div className="modal-overlay" role="presentation" onMouseDown={(e) => { if (e.currentTarget === e.target) onClose(); }}>
      <div className="modal-sheet" role="dialog" aria-modal="true" aria-labelledby="new-deal-title">
        <div className="modal-head"><div><span className="eyebrow">NEW COLLABORATION</span><h2 id="new-deal-title">Add brand deal</h2><p>Track the money and rights from day one.</p></div><button className="modal-close" onClick={onClose} aria-label="Close">×</button></div>
        <form className="deal-form" onSubmit={onSubmit}>
          <div className="form-section"><h3>Deal</h3><div className="form-grid">
            <label className="field"><span>Brand *</span><input name="brand" required placeholder="e.g. Nike" autoFocus /></label>
            <label className="field"><span>Campaign *</span><input name="campaign" required placeholder="e.g. Fall running launch" /></label>
            <label className="field"><span>Deal value *</span><input name="value" type="number" min="0" step="0.01" required placeholder="1500" /></label>
            <label className="field"><span>Currency</span><select name="currency" defaultValue="USD"><option>USD</option><option>EUR</option><option>GBP</option><option>INR</option><option>CAD</option><option>AUD</option></select></label>
            <label className="field"><span>Stage</span><select name="status" defaultValue="Confirmed">{STATUS_OPTIONS.map((s) => <option key={s}>{s}</option>)}</select></label>
            <label className="field"><span>Platform</span><select name="platform" defaultValue="Instagram"><option>Instagram</option><option>TikTok</option><option>YouTube</option><option>UGC</option><option>Multi-platform</option><option>Podcast</option></select></label>
          </div></div>
          <div className="form-section"><h3>Deliverable & money</h3><div className="form-grid">
            <label className="field span-2"><span>Deliverable *</span><input name="deliverable" required placeholder="1 Reel + 3 Stories" /></label>
            <label className="field"><span>Content due *</span><input name="dueDate" type="date" defaultValue={iso(in14)} required /></label>
            <label className="field"><span>Payment due *</span><input name="paymentDue" type="date" defaultValue={iso(in30)} required /></label>
            <label className="field"><span>Payment terms</span><select name="paymentTerms" defaultValue="Net 30"><option>On delivery</option><option>Net 15</option><option>Net 30</option><option>Net 45</option><option>Net 60</option><option>Custom</option></select></label>
            <label className="field"><span>Contact email</span><input name="email" type="email" placeholder="brand@example.com" /></label>
          </div></div>
          <div className="form-section"><h3>Usage rights</h3><div className="form-grid">
            <label className="field"><span>Rights type</span><select name="rightsType" defaultValue="Paid social"><option>Organic</option><option>Paid social</option><option>Organic + paid</option><option>Whitelisting</option><option>Website / digital</option><option>Custom</option></select></label>
            <label className="field"><span>Rights end *</span><input name="rightsEnd" type="date" defaultValue={iso(in60)} required /></label>
            <label className="field span-2"><span>Notes</span><textarea name="notes" rows={3} placeholder="Approval requirements, exclusivity, renewal notes…" /></label>
          </div></div>
          <div className="modal-actions"><button className="button secondary" type="button" onClick={onClose}>Cancel</button><button className="button primary" disabled={saving}>{saving ? "Saving…" : "Create deal"}</button></div>
        </form>
      </div>
    </div>
  );
}

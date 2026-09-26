-- DealGuard Phase 2 — initial creator workspace schema
-- Run this in the Supabase SQL editor for a new project.

create extension if not exists pgcrypto;

create type public.deal_status as enum (
  'Lead', 'Negotiating', 'Confirmed', 'Content Due', 'Submitted',
  'Published', 'Payment Pending', 'Paid', 'Completed'
);

create type public.payment_status as enum ('Pending', 'Partially Paid', 'Paid', 'Overdue');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  country text,
  default_currency text not null default 'USD',
  timezone text not null default 'UTC',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.brands (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  contact_name text,
  contact_email text,
  website text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, name)
);

create table public.deals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  campaign_name text not null,
  deal_value numeric(12,2) not null default 0 check (deal_value >= 0),
  currency text not null default 'USD',
  status public.deal_status not null default 'Lead',
  platform text,
  start_date date,
  publish_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.deliverables (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals(id) on delete cascade,
  platform text,
  deliverable_type text not null,
  due_date date,
  publish_date date,
  status text not null default 'Pending',
  content_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals(id) on delete cascade,
  amount numeric(12,2) not null default 0 check (amount >= 0),
  currency text not null default 'USD',
  invoice_number text,
  invoice_date date,
  payment_terms text,
  due_date date,
  paid_date date,
  status public.payment_status not null default 'Pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.usage_rights (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals(id) on delete cascade,
  usage_type text not null default 'Organic',
  start_date date,
  end_date date,
  territory text,
  platform text,
  renewal_price numeric(12,2),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.exclusivities (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals(id) on delete cascade,
  category text,
  start_date date,
  end_date date,
  notes text,
  created_at timestamptz not null default now()
);

create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  deal_id uuid references public.deals(id) on delete cascade,
  reminder_type text not null,
  reminder_at timestamptz not null,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index deals_user_id_idx on public.deals(user_id);
create index deals_status_idx on public.deals(status);
create index brands_user_id_idx on public.brands(user_id);
create index deliverables_deal_id_idx on public.deliverables(deal_id);
create index deliverables_due_date_idx on public.deliverables(due_date);
create index payments_deal_id_idx on public.payments(deal_id);
create index payments_due_date_idx on public.payments(due_date);
create index usage_rights_deal_id_idx on public.usage_rights(deal_id);
create index usage_rights_end_date_idx on public.usage_rights(end_date);
create index reminders_user_time_idx on public.reminders(user_id, reminder_at);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger brands_set_updated_at before update on public.brands for each row execute function public.set_updated_at();
create trigger deals_set_updated_at before update on public.deals for each row execute function public.set_updated_at();
create trigger deliverables_set_updated_at before update on public.deliverables for each row execute function public.set_updated_at();
create trigger payments_set_updated_at before update on public.payments for each row execute function public.set_updated_at();
create trigger usage_rights_set_updated_at before update on public.usage_rights for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email, ''), '@', 1)),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.brands enable row level security;
alter table public.deals enable row level security;
alter table public.deliverables enable row level security;
alter table public.payments enable row level security;
alter table public.usage_rights enable row level security;
alter table public.exclusivities enable row level security;
alter table public.reminders enable row level security;

create policy "profiles_select_own" on public.profiles for select using (auth.uid() = id);
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

create policy "brands_select_own" on public.brands for select using (auth.uid() = user_id);
create policy "brands_insert_own" on public.brands for insert with check (auth.uid() = user_id);
create policy "brands_update_own" on public.brands for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "brands_delete_own" on public.brands for delete using (auth.uid() = user_id);

create policy "deals_select_own" on public.deals for select using (auth.uid() = user_id);
create policy "deals_insert_own" on public.deals for insert with check (auth.uid() = user_id);
create policy "deals_update_own" on public.deals for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "deals_delete_own" on public.deals for delete using (auth.uid() = user_id);

create policy "deliverables_select_own" on public.deliverables for select using (
  exists (select 1 from public.deals d where d.id = deliverables.deal_id and d.user_id = auth.uid())
);
create policy "deliverables_insert_own" on public.deliverables for insert with check (
  exists (select 1 from public.deals d where d.id = deliverables.deal_id and d.user_id = auth.uid())
);
create policy "deliverables_update_own" on public.deliverables for update using (
  exists (select 1 from public.deals d where d.id = deliverables.deal_id and d.user_id = auth.uid())
) with check (
  exists (select 1 from public.deals d where d.id = deliverables.deal_id and d.user_id = auth.uid())
);
create policy "deliverables_delete_own" on public.deliverables for delete using (
  exists (select 1 from public.deals d where d.id = deliverables.deal_id and d.user_id = auth.uid())
);

create policy "payments_select_own" on public.payments for select using (
  exists (select 1 from public.deals d where d.id = payments.deal_id and d.user_id = auth.uid())
);
create policy "payments_insert_own" on public.payments for insert with check (
  exists (select 1 from public.deals d where d.id = payments.deal_id and d.user_id = auth.uid())
);
create policy "payments_update_own" on public.payments for update using (
  exists (select 1 from public.deals d where d.id = payments.deal_id and d.user_id = auth.uid())
) with check (
  exists (select 1 from public.deals d where d.id = payments.deal_id and d.user_id = auth.uid())
);
create policy "payments_delete_own" on public.payments for delete using (
  exists (select 1 from public.deals d where d.id = payments.deal_id and d.user_id = auth.uid())
);

create policy "rights_select_own" on public.usage_rights for select using (
  exists (select 1 from public.deals d where d.id = usage_rights.deal_id and d.user_id = auth.uid())
);
create policy "rights_insert_own" on public.usage_rights for insert with check (
  exists (select 1 from public.deals d where d.id = usage_rights.deal_id and d.user_id = auth.uid())
);
create policy "rights_update_own" on public.usage_rights for update using (
  exists (select 1 from public.deals d where d.id = usage_rights.deal_id and d.user_id = auth.uid())
) with check (
  exists (select 1 from public.deals d where d.id = usage_rights.deal_id and d.user_id = auth.uid())
);
create policy "rights_delete_own" on public.usage_rights for delete using (
  exists (select 1 from public.deals d where d.id = usage_rights.deal_id and d.user_id = auth.uid())
);

create policy "exclusivities_select_own" on public.exclusivities for select using (
  exists (select 1 from public.deals d where d.id = exclusivities.deal_id and d.user_id = auth.uid())
);
create policy "exclusivities_insert_own" on public.exclusivities for insert with check (
  exists (select 1 from public.deals d where d.id = exclusivities.deal_id and d.user_id = auth.uid())
);
create policy "exclusivities_update_own" on public.exclusivities for update using (
  exists (select 1 from public.deals d where d.id = exclusivities.deal_id and d.user_id = auth.uid())
) with check (
  exists (select 1 from public.deals d where d.id = exclusivities.deal_id and d.user_id = auth.uid())
);
create policy "exclusivities_delete_own" on public.exclusivities for delete using (
  exists (select 1 from public.deals d where d.id = exclusivities.deal_id and d.user_id = auth.uid())
);

create policy "reminders_select_own" on public.reminders for select using (auth.uid() = user_id);
create policy "reminders_insert_own" on public.reminders for insert with check (auth.uid() = user_id);
create policy "reminders_update_own" on public.reminders for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "reminders_delete_own" on public.reminders for delete using (auth.uid() = user_id);
-- DealGuard Phase 2.1 — creator onboarding + RLS hardening
-- Run after 001_initial_schema.sql.

alter table public.profiles
  add column if not exists creator_category text,
  add column if not exists main_platform text,
  add column if not exists deals_per_month text,
  add column if not exists onboarding_completed boolean not null default false;

-- Explicit grants: signed-out visitors should not access creator workspace tables.
revoke all on table public.profiles from anon;
revoke all on table public.brands from anon;
revoke all on table public.deals from anon;
revoke all on table public.deliverables from anon;
revoke all on table public.payments from anon;
revoke all on table public.usage_rights from anon;
revoke all on table public.exclusivities from anon;
revoke all on table public.reminders from anon;

grant select, update on table public.profiles to authenticated;
grant select, insert, update, delete on table public.brands to authenticated;
grant select, insert, update, delete on table public.deals to authenticated;
grant select, insert, update, delete on table public.deliverables to authenticated;
grant select, insert, update, delete on table public.payments to authenticated;
grant select, insert, update, delete on table public.usage_rights to authenticated;
grant select, insert, update, delete on table public.exclusivities to authenticated;
grant select, insert, update, delete on table public.reminders to authenticated;

-- Re-create policies with an explicit authenticated role and cached auth.uid() lookup.
drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id);
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

drop policy if exists "brands_select_own" on public.brands;
drop policy if exists "brands_insert_own" on public.brands;
drop policy if exists "brands_update_own" on public.brands;
drop policy if exists "brands_delete_own" on public.brands;
create policy "brands_select_own" on public.brands for select to authenticated using ((select auth.uid()) = user_id);
create policy "brands_insert_own" on public.brands for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "brands_update_own" on public.brands for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "brands_delete_own" on public.brands for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "deals_select_own" on public.deals;
drop policy if exists "deals_insert_own" on public.deals;
drop policy if exists "deals_update_own" on public.deals;
drop policy if exists "deals_delete_own" on public.deals;
create policy "deals_select_own" on public.deals for select to authenticated using ((select auth.uid()) = user_id);
create policy "deals_insert_own" on public.deals for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "deals_update_own" on public.deals for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "deals_delete_own" on public.deals for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "deliverables_select_own" on public.deliverables;
drop policy if exists "deliverables_insert_own" on public.deliverables;
drop policy if exists "deliverables_update_own" on public.deliverables;
drop policy if exists "deliverables_delete_own" on public.deliverables;
create policy "deliverables_select_own" on public.deliverables for select to authenticated using (
  exists (select 1 from public.deals d where d.id = deliverables.deal_id and d.user_id = (select auth.uid()))
);
create policy "deliverables_insert_own" on public.deliverables for insert to authenticated with check (
  exists (select 1 from public.deals d where d.id = deliverables.deal_id and d.user_id = (select auth.uid()))
);
create policy "deliverables_update_own" on public.deliverables for update to authenticated using (
  exists (select 1 from public.deals d where d.id = deliverables.deal_id and d.user_id = (select auth.uid()))
) with check (
  exists (select 1 from public.deals d where d.id = deliverables.deal_id and d.user_id = (select auth.uid()))
);
create policy "deliverables_delete_own" on public.deliverables for delete to authenticated using (
  exists (select 1 from public.deals d where d.id = deliverables.deal_id and d.user_id = (select auth.uid()))
);

drop policy if exists "payments_select_own" on public.payments;
drop policy if exists "payments_insert_own" on public.payments;
drop policy if exists "payments_update_own" on public.payments;
drop policy if exists "payments_delete_own" on public.payments;
create policy "payments_select_own" on public.payments for select to authenticated using (
  exists (select 1 from public.deals d where d.id = payments.deal_id and d.user_id = (select auth.uid()))
);
create policy "payments_insert_own" on public.payments for insert to authenticated with check (
  exists (select 1 from public.deals d where d.id = payments.deal_id and d.user_id = (select auth.uid()))
);
create policy "payments_update_own" on public.payments for update to authenticated using (
  exists (select 1 from public.deals d where d.id = payments.deal_id and d.user_id = (select auth.uid()))
) with check (
  exists (select 1 from public.deals d where d.id = payments.deal_id and d.user_id = (select auth.uid()))
);
create policy "payments_delete_own" on public.payments for delete to authenticated using (
  exists (select 1 from public.deals d where d.id = payments.deal_id and d.user_id = (select auth.uid()))
);

drop policy if exists "rights_select_own" on public.usage_rights;
drop policy if exists "rights_insert_own" on public.usage_rights;
drop policy if exists "rights_update_own" on public.usage_rights;
drop policy if exists "rights_delete_own" on public.usage_rights;
create policy "rights_select_own" on public.usage_rights for select to authenticated using (
  exists (select 1 from public.deals d where d.id = usage_rights.deal_id and d.user_id = (select auth.uid()))
);
create policy "rights_insert_own" on public.usage_rights for insert to authenticated with check (
  exists (select 1 from public.deals d where d.id = usage_rights.deal_id and d.user_id = (select auth.uid()))
);
create policy "rights_update_own" on public.usage_rights for update to authenticated using (
  exists (select 1 from public.deals d where d.id = usage_rights.deal_id and d.user_id = (select auth.uid()))
) with check (
  exists (select 1 from public.deals d where d.id = usage_rights.deal_id and d.user_id = (select auth.uid()))
);
create policy "rights_delete_own" on public.usage_rights for delete to authenticated using (
  exists (select 1 from public.deals d where d.id = usage_rights.deal_id and d.user_id = (select auth.uid()))
);

drop policy if exists "exclusivities_select_own" on public.exclusivities;
drop policy if exists "exclusivities_insert_own" on public.exclusivities;
drop policy if exists "exclusivities_update_own" on public.exclusivities;
drop policy if exists "exclusivities_delete_own" on public.exclusivities;
create policy "exclusivities_select_own" on public.exclusivities for select to authenticated using (
  exists (select 1 from public.deals d where d.id = exclusivities.deal_id and d.user_id = (select auth.uid()))
);
create policy "exclusivities_insert_own" on public.exclusivities for insert to authenticated with check (
  exists (select 1 from public.deals d where d.id = exclusivities.deal_id and d.user_id = (select auth.uid()))
);
create policy "exclusivities_update_own" on public.exclusivities for update to authenticated using (
  exists (select 1 from public.deals d where d.id = exclusivities.deal_id and d.user_id = (select auth.uid()))
) with check (
  exists (select 1 from public.deals d where d.id = exclusivities.deal_id and d.user_id = (select auth.uid()))
);
create policy "exclusivities_delete_own" on public.exclusivities for delete to authenticated using (
  exists (select 1 from public.deals d where d.id = exclusivities.deal_id and d.user_id = (select auth.uid()))
);

drop policy if exists "reminders_select_own" on public.reminders;
drop policy if exists "reminders_insert_own" on public.reminders;
drop policy if exists "reminders_update_own" on public.reminders;
drop policy if exists "reminders_delete_own" on public.reminders;
create policy "reminders_select_own" on public.reminders for select to authenticated using ((select auth.uid()) = user_id);
create policy "reminders_insert_own" on public.reminders for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "reminders_update_own" on public.reminders for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "reminders_delete_own" on public.reminders for delete to authenticated using ((select auth.uid()) = user_id);

-- FK indexes added on live project
create index if not exists deals_brand_id_idx on public.deals(brand_id);
create index if not exists exclusivities_deal_id_idx on public.exclusivities(deal_id);
create index if not exists reminders_deal_id_idx on public.reminders(deal_id);

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

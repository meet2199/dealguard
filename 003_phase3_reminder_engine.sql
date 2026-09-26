-- DealGuard Phase 3: automatic reminder queue and user notification preferences.
-- This migration is already applied to the connected DealGuard Supabase project.

create table if not exists public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email_enabled boolean not null default true,
  payment_due_days integer[] not null default array[3,0],
  payment_overdue_days integer[] not null default array[1,7],
  rights_expiry_days integer[] not null default array[30,14,7],
  deliverable_due_days integer[] not null default array[3,1],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.notification_preferences enable row level security;
revoke all on public.notification_preferences from anon;
grant select, update on public.notification_preferences to authenticated;

drop policy if exists notification_preferences_select_own on public.notification_preferences;
drop policy if exists notification_preferences_update_own on public.notification_preferences;
create policy notification_preferences_select_own on public.notification_preferences
for select to authenticated using ((select auth.uid()) = user_id);
create policy notification_preferences_update_own on public.notification_preferences
for update to authenticated using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop trigger if exists notification_preferences_set_updated_at on public.notification_preferences;
create trigger notification_preferences_set_updated_at
before update on public.notification_preferences
for each row execute function public.set_updated_at();

alter table public.reminders
  add column if not exists source_type text,
  add column if not exists source_id uuid,
  add column if not exists status text not null default 'pending',
  add column if not exists attempts integer not null default 0,
  add column if not exists last_error text,
  add column if not exists provider_message_id text,
  add column if not exists processed_at timestamptz;

do $$ begin
  alter table public.reminders add constraint reminders_status_check
    check (status in ('pending','processing','sent','failed','skipped'));
exception when duplicate_object then null; end $$;

create index if not exists reminders_due_queue_idx on public.reminders(status, reminder_at)
where status in ('pending','failed');
create index if not exists reminders_source_idx on public.reminders(source_type, source_id);
create unique index if not exists reminders_unique_source_type
on public.reminders(source_type, source_id, reminder_type) where source_id is not null;

insert into public.notification_preferences (user_id)
select id from auth.users on conflict (user_id) do nothing;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email,''),'@',1)),
    new.raw_user_meta_data ->> 'avatar_url'
  ) on conflict (id) do nothing;

  insert into public.notification_preferences (user_id)
  values (new.id) on conflict (user_id) do nothing;
  return new;
end;
$$;
revoke all on function public.handle_new_user() from public, anon, authenticated;

create or replace function public.local_reminder_time(p_user_id uuid, p_date date)
returns timestamptz language sql stable security invoker set search_path = ''
as $$
  select (p_date::timestamp + time '09:00') at time zone coalesce(
    (select p.timezone from public.profiles p where p.id = p_user_id), 'UTC'
  );
$$;
revoke all on function public.local_reminder_time(uuid,date) from public, anon;
grant execute on function public.local_reminder_time(uuid,date) to authenticated, service_role;

create or replace function public.sync_payment_reminders()
returns trigger language plpgsql security invoker set search_path = ''
as $$
declare
  v_user_id uuid;
  v_due date;
  v_at timestamptz;
begin
  select d.user_id into v_user_id from public.deals d where d.id = new.deal_id;
  delete from public.reminders where source_type='payment' and source_id=new.id and status in ('pending','failed','processing');
  if new.status='Paid' or new.due_date is null or v_user_id is null then return new; end if;
  v_due := new.due_date;

  if v_due >= current_date then
    v_at := public.local_reminder_time(v_user_id, v_due - 3);
    if v_at > now() then
      insert into public.reminders(user_id,deal_id,reminder_type,reminder_at,source_type,source_id)
      values(v_user_id,new.deal_id,'payment_due_3',v_at,'payment',new.id) on conflict do nothing;
    end if;
    v_at := public.local_reminder_time(v_user_id, v_due);
    if v_at > now() then
      insert into public.reminders(user_id,deal_id,reminder_type,reminder_at,source_type,source_id)
      values(v_user_id,new.deal_id,'payment_due_0',v_at,'payment',new.id) on conflict do nothing;
    end if;
  else
    insert into public.reminders(user_id,deal_id,reminder_type,reminder_at,source_type,source_id)
    values(v_user_id,new.deal_id,'payment_overdue_now',now(),'payment',new.id) on conflict do nothing;
  end if;

  v_at := public.local_reminder_time(v_user_id, v_due + 1);
  if v_at > now() then
    insert into public.reminders(user_id,deal_id,reminder_type,reminder_at,source_type,source_id)
    values(v_user_id,new.deal_id,'payment_overdue_1',v_at,'payment',new.id) on conflict do nothing;
  end if;
  v_at := public.local_reminder_time(v_user_id, v_due + 7);
  if v_at > now() then
    insert into public.reminders(user_id,deal_id,reminder_type,reminder_at,source_type,source_id)
    values(v_user_id,new.deal_id,'payment_overdue_7',v_at,'payment',new.id) on conflict do nothing;
  end if;
  return new;
end;
$$;

create or replace function public.sync_rights_reminders()
returns trigger language plpgsql security invoker set search_path = ''
as $$
declare
  v_user_id uuid;
  v_days integer;
  v_at timestamptz;
begin
  select d.user_id into v_user_id from public.deals d where d.id = new.deal_id;
  delete from public.reminders where source_type='usage_right' and source_id=new.id and status in ('pending','failed','processing');
  if new.end_date is null or v_user_id is null or new.end_date < current_date then return new; end if;
  foreach v_days in array array[30,14,7] loop
    v_at := public.local_reminder_time(v_user_id, new.end_date - v_days);
    if v_at > now() then
      insert into public.reminders(user_id,deal_id,reminder_type,reminder_at,source_type,source_id)
      values(v_user_id,new.deal_id,'rights_expiry_'||v_days::text,v_at,'usage_right',new.id) on conflict do nothing;
    end if;
  end loop;
  return new;
end;
$$;

create or replace function public.sync_deliverable_reminders()
returns trigger language plpgsql security invoker set search_path = ''
as $$
declare
  v_user_id uuid;
  v_days integer;
  v_at timestamptz;
begin
  select d.user_id into v_user_id from public.deals d where d.id = new.deal_id;
  delete from public.reminders where source_type='deliverable' and source_id=new.id and status in ('pending','failed','processing');
  if new.due_date is null or v_user_id is null or lower(coalesce(new.status,'')) in ('complete','completed','published') then return new; end if;
  foreach v_days in array array[3,1] loop
    v_at := public.local_reminder_time(v_user_id, new.due_date - v_days);
    if v_at > now() then
      insert into public.reminders(user_id,deal_id,reminder_type,reminder_at,source_type,source_id)
      values(v_user_id,new.deal_id,'deliverable_due_'||v_days::text,v_at,'deliverable',new.id) on conflict do nothing;
    end if;
  end loop;
  return new;
end;
$$;

revoke all on function public.sync_payment_reminders() from public, anon;
revoke all on function public.sync_rights_reminders() from public, anon;
revoke all on function public.sync_deliverable_reminders() from public, anon;

drop trigger if exists payments_sync_reminders on public.payments;
create trigger payments_sync_reminders after insert or update of due_date,status on public.payments
for each row execute function public.sync_payment_reminders();
drop trigger if exists usage_rights_sync_reminders on public.usage_rights;
create trigger usage_rights_sync_reminders after insert or update of end_date on public.usage_rights
for each row execute function public.sync_rights_reminders();
drop trigger if exists deliverables_sync_reminders on public.deliverables;
create trigger deliverables_sync_reminders after insert or update of due_date,status on public.deliverables
for each row execute function public.sync_deliverable_reminders();

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

do $$
declare
  v_secret text;
begin
  if not exists (select 1 from vault.decrypted_secrets where name='dealguard_cron_secret') then
    v_secret := encode(extensions.gen_random_bytes(32), 'hex');
    perform vault.create_secret(v_secret, 'dealguard_cron_secret', 'Secret used to authorize DealGuard reminder cron calls');
  end if;
end $$;

-- Never print or commit the generated cron secret. It stays in Supabase Vault.

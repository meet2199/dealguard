-- Schedule the deployed `process-reminders` Edge Function every 15 minutes.
-- Requires a Vault secret named dealguard_cron_secret.

do $$
declare
  v_jobid bigint;
begin
  select jobid into v_jobid from cron.job where jobname='dealguard-process-reminders' limit 1;
  if v_jobid is not null then perform cron.unschedule(v_jobid); end if;
end $$;

select cron.schedule(
  'dealguard-process-reminders',
  '*/15 * * * *',
  $job$
  select net.http_post(
    url := 'https://vkhphpdwjgomfqktkalk.supabase.co/functions/v1/process-reminders',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-dealguard-cron', (
        select decrypted_secret from vault.decrypted_secrets
        where name='dealguard_cron_secret' order by created_at desc limit 1
      )
    ),
    body := jsonb_build_object('source','cron','time',now()),
    timeout_milliseconds := 10000
  );
  $job$
);

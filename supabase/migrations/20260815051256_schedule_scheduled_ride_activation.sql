do $block$
declare
  v_token text := encode(extensions.gen_random_bytes(32), 'hex');
  v_command text;
  v_job record;
begin
  insert into private.internal_scheduler_secrets(name, token_hash, rotated_at)
  values (
    'scheduled_ride_activation',
    encode(extensions.digest(convert_to(v_token, 'UTF8'), 'sha256'), 'hex'),
    clock_timestamp()
  )
  on conflict (name) do update
    set token_hash = excluded.token_hash,
        rotated_at = excluded.rotated_at;

  for v_job in
    select j.jobid from cron.job j where j.jobname = 'apois-scheduled-rides-activation'
  loop
    perform cron.unschedule(v_job.jobid);
  end loop;

  v_command := format(
    $cmd$select net.http_post(
      url := 'https://vqtucstyduxrqjgyigfk.supabase.co/functions/v1/activate-scheduled-rides',
      body := '{"source":"pg_cron"}'::jsonb,
      headers := jsonb_build_object(
        'content-type', 'application/json',
        'x-apois-scheduler-token', %L
      ),
      timeout_milliseconds := 10000
    );$cmd$,
    v_token
  );

  perform cron.schedule(
    'apois-scheduled-rides-activation',
    '* * * * *',
    v_command
  );
end;
$block$;

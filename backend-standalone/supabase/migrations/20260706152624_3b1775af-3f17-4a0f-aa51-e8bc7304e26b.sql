DO $$
DECLARE
  v_job_id bigint;
BEGIN
  FOR v_job_id IN
    SELECT jobid
    FROM cron.job
    WHERE jobname = 'renew-driver-subscriptions-daily'
  LOOP
    PERFORM cron.unschedule(v_job_id);
  END LOOP;
END
$$;
SELECT cron.schedule(
  'renew-driver-subscriptions-daily',
  '0 9 * * *',
  $$
  SELECT net.http_post(
    url := 'https://movvi-backend-standalone.onrender.com/api/public/hooks/renew-driver-subscriptions',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer CHANGE_ME"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

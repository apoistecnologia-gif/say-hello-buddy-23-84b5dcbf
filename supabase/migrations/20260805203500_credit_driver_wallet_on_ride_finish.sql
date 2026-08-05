-- Credita automaticamente a carteira quando uma corrida entra em estado finalizada.
-- A restrição única por (ride_id, type) torna o processamento idempotente.

create or replace function public.handle_completed_ride_driver_credit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_amount numeric(12,2);
begin
  if new.status::text <> 'finalizada'
     or old.status::text = 'finalizada'
     or new.driver_id is null then
    return new;
  end if;

  v_amount := coalesce(new.final_price, new.estimated_price, 0);
  if v_amount <= 0 then
    raise exception 'invalid_completed_ride_amount';
  end if;

  perform public.credit_driver_completed_ride(new.id, new.driver_id, v_amount);
  return new;
end;
$$;

drop trigger if exists trg_credit_driver_wallet_on_ride_finish on public.rides;
create trigger trg_credit_driver_wallet_on_ride_finish
after update of status on public.rides
for each row
when (new.status::text = 'finalizada' and old.status::text is distinct from 'finalizada')
execute function public.handle_completed_ride_driver_credit();

revoke all on function public.handle_completed_ride_driver_credit() from public, anon, authenticated;

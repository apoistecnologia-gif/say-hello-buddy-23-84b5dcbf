-- Server-side financial guard. Client values are never authoritative.
-- Canonical Woovi fee contract: 0.80%, minimum R$0.50, maximum R$5.00.
-- These values are intentionally fixed in code + SQL for the same release.
-- Any future commercial-plan change must update both implementations together.

create or replace function private.calculate_pix_processing_fee_cents(_fare_cents bigint)
returns bigint
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  v_fare bigint := greatest(_fare_cents, 0);
  v_fee bigint := 50;
  v_next bigint;
  i integer;
begin
  for i in 1..16 loop
    v_next := least(500::bigint, greatest(50::bigint, ceil(((v_fare + v_fee)::numeric * 80) / 10000)::bigint));
    if v_next = v_fee then return v_fee; end if;
    v_fee := v_next;
  end loop;
  return v_fee;
end;
$$;

revoke all on function private.calculate_pix_processing_fee_cents(bigint) from public, anon, authenticated;
grant execute on function private.calculate_pix_processing_fee_cents(bigint) to service_role;

create or replace function private.enforce_ride_payment_breakdown()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fare_cents bigint;
begin
  if new.estimated_price is null or new.estimated_price < 0 then
    return new;
  end if;

  v_fare_cents := round(new.estimated_price * 100)::bigint;

  if lower(coalesce(new.payment_method,'')) = 'pix' then
    new.processing_fee_cents := private.calculate_pix_processing_fee_cents(v_fare_cents);
    new.passenger_charge_cents := v_fare_cents + new.processing_fee_cents;
    new.payment_provider := 'woovi';
  else
    new.processing_fee_cents := 0;
    new.passenger_charge_cents := v_fare_cents;
    if tg_op = 'INSERT' and new.payment_provider = 'woovi' then
      new.payment_provider := null;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_ride_payment_breakdown() from public, anon, authenticated;

drop trigger if exists trg_enforce_ride_payment_breakdown on public.rides;
create trigger trg_enforce_ride_payment_breakdown
before insert or update of estimated_price, payment_method on public.rides
for each row execute function private.enforce_ride_payment_breakdown();

comment on function private.enforce_ride_payment_breakdown() is
  'Server authority for passenger Pix total. For Pix: passenger total = ride fare + Taxa de processamento; driver fare is unchanged; provider is Woovi.';

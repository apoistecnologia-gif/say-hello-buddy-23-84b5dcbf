-- APOIS Corridas — staged electronic-payment cutover.
-- Applying schema must not itself switch production traffic. New Pix rides and
-- new Pix payment attempts use the configured provider switch; existing rows
-- and already provider-bound rides are preserved.

create or replace function private.enforce_ride_payment_breakdown()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fare_cents bigint;
  v_preserve_existing_provider boolean := false;
  v_target_provider text := 'asaas';
begin
  if new.estimated_price is null or new.estimated_price<0 then return new; end if;
  v_fare_cents := round(new.estimated_price*100)::bigint;

  if lower(coalesce(new.payment_method,''))='pix' then
    if tg_op='UPDATE' then
      v_preserve_existing_provider := lower(coalesce(old.payment_provider,'')) in ('asaas','woovi')
        and (old.provider_payment_id is not null or old.payment_status='paid');
    end if;

    if v_preserve_existing_provider then
      new.payment_provider := lower(old.payment_provider);
      if lower(old.payment_provider)='woovi' then
        new.processing_fee_cents := coalesce(old.processing_fee_cents,private.calculate_pix_processing_fee_cents(v_fare_cents));
        new.passenger_charge_cents := coalesce(old.passenger_charge_cents,v_fare_cents+new.processing_fee_cents);
      else
        new.processing_fee_cents := 0;
        new.passenger_charge_cents := v_fare_cents;
      end if;
      return new;
    end if;

    select lower(coalesce(value #>> '{}','asaas')) into v_target_provider
    from public.app_settings
    where key='finance.target_electronic_payment_provider';
    v_target_provider := coalesce(v_target_provider,'asaas');

    if v_target_provider='woovi' then
      new.processing_fee_cents := private.calculate_pix_processing_fee_cents(v_fare_cents);
      new.passenger_charge_cents := v_fare_cents+new.processing_fee_cents;
      new.payment_provider := 'woovi';
    elsif v_target_provider='asaas' then
      new.processing_fee_cents := 0;
      new.passenger_charge_cents := v_fare_cents;
      new.payment_provider := 'asaas';
    else
      raise exception 'electronic_payment_provider_not_supported' using errcode='55000';
    end if;
  else
    new.processing_fee_cents := 0;
    new.passenger_charge_cents := v_fare_cents;
    if tg_op='INSERT' then new.payment_provider := null; end if;
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_ride_payment_breakdown() from public,anon,authenticated;

comment on function private.enforce_ride_payment_breakdown() is
  'Server-authoritative fare/payment breakdown gated by finance.target_electronic_payment_provider for staged Asaas->Woovi cutover.';

-- Stop an old client/function from creating a fresh payment attempt with the
-- inactive provider after cutover (and stop Woovi from creating attempts before
-- the switch). Existing payment rows are untouched because this trigger runs on
-- INSERT only.
create or replace function private.enforce_new_ride_pix_provider()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target_provider text := 'asaas';
  v_ride_provider text;
begin
  select lower(coalesce(value #>> '{}','asaas')) into v_target_provider
  from public.app_settings
  where key='finance.target_electronic_payment_provider';
  v_target_provider := coalesce(v_target_provider,'asaas');

  if v_target_provider not in ('asaas','woovi') then
    raise exception 'electronic_payment_provider_not_supported' using errcode='55000';
  end if;

  if lower(coalesce(new.provider,'')) <> v_target_provider then
    raise exception 'electronic_payment_provider_not_active' using errcode='55000';
  end if;

  select lower(coalesce(r.payment_provider,'')) into v_ride_provider
  from public.rides r
  where r.id=new.ride_id;

  if v_ride_provider is null or v_ride_provider='' then
    raise exception 'ride_payment_provider_missing' using errcode='55000';
  end if;

  if v_ride_provider <> lower(new.provider) then
    raise exception 'ride_payment_provider_mismatch' using errcode='55000';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_new_ride_pix_provider() from public,anon,authenticated;

drop trigger if exists trg_enforce_new_ride_pix_provider on public.ride_pix_payments;
create trigger trg_enforce_new_ride_pix_provider
before insert on public.ride_pix_payments
for each row execute function private.enforce_new_ride_pix_provider();

comment on function private.enforce_new_ride_pix_provider() is
  'Prevents fresh ride Pix payment attempts from bypassing the configured Asaas/Woovi cutover switch.';

-- Endurece a liquidação da corrida: o aplicativo do motorista não define livremente
-- o valor final e corridas pagas em dinheiro não geram crédito duplicado na carteira.

create or replace function public.enforce_completed_ride_amount()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status::text = 'finalizada'
     and old.status::text is distinct from 'finalizada' then
    -- Enquanto não houver recálculo fiscalizado no backend, o valor final é o preço
    -- já persistido pelo servidor. Qualquer valor enviado pelo cliente é descartado.
    new.final_price := coalesce(old.final_price, old.estimated_price);

    if new.final_price is null or new.final_price <= 0 then
      raise exception 'invalid_completed_ride_amount';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_completed_ride_amount on public.rides;
create trigger trg_enforce_completed_ride_amount
before update of status, final_price on public.rides
for each row
execute function public.enforce_completed_ride_amount();

revoke all on function public.enforce_completed_ride_amount() from public, anon, authenticated;

create or replace function public.handle_completed_ride_driver_credit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_amount numeric(12,2);
  v_payment_method text;
begin
  if new.status::text <> 'finalizada'
     or old.status::text = 'finalizada'
     or new.driver_id is null then
    return new;
  end if;

  v_payment_method := lower(trim(coalesce(new.payment_method, '')));

  -- Dinheiro é recebido diretamente pelo motorista e não deve virar saldo
  -- adicional na carteira, evitando pagamento em duplicidade.
  if v_payment_method in ('cash', 'dinheiro') then
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

revoke all on function public.handle_completed_ride_driver_credit() from public, anon, authenticated;

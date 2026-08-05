-- Permite que eventos do Mercado Pago que falharam sejam reenviados e processados novamente.
-- O webhook usa event_key único para idempotência. Quando um processamento termina em "failed",
-- liberamos a chave original sem apagar o histórico da tentativa que falhou.

create or replace function public.release_failed_payment_webhook_event_key()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'failed' and old.status is distinct from 'failed' then
    new.event_key := new.event_key || ':failed:' || new.id::text;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_release_failed_payment_webhook_event_key
on public.payment_webhook_receipts;

create trigger trg_release_failed_payment_webhook_event_key
before update of status on public.payment_webhook_receipts
for each row
when (new.status = 'failed' and old.status is distinct from 'failed')
execute function public.release_failed_payment_webhook_event_key();

comment on function public.release_failed_payment_webhook_event_key() is
  'Preserva recibos de webhook com falha e libera a event_key original para retentativa do Mercado Pago.';

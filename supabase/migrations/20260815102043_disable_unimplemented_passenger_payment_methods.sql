update public.payment_methods
set is_active = false,
    updated_at = now()
where code in ('credit','debit','wallet')
  and is_active is distinct from false;

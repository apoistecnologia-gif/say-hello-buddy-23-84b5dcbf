-- Contrato compartilhado APOIS Passageiro ↔ Motorista.
-- A implementação efetiva desta migration foi aplicada no Supabase oficial.
-- Mantemos o registro no repositório do Passageiro para evitar drift de schema.

alter table public.rides
  add column if not exists queued_after_ride_id uuid references public.rides(id) on delete set null,
  add column if not exists queued_at timestamptz;

insert into public.app_settings(key, value, description, updated_at)
values ('ride.next_offer_max_distance_km','5'::jsonb,'Distância máxima em km para oferecer uma próxima corrida a motorista que já está em viagem.',now())
on conflict (key) do nothing;

create unique index if not exists rides_one_queued_per_driver_idx
  on public.rides(driver_id)
  where queued_after_ride_id is not null and status='procurar_motorista' and driver_id is not null;
create index if not exists rides_queued_after_idx
  on public.rides(queued_after_ride_id, queued_at)
  where queued_after_ride_id is not null;

-- As funções append_nearby_busy_driver_candidates, driver_accept_ride e
-- driver_finish_ride pertencem ao contrato operacional compartilhado e estão
-- versionadas integralmente no repositório do APOIS Motorista, que é a fonte
-- canônica para o lifecycle do motorista.

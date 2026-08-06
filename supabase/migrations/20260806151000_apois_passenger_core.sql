-- Núcleo operacional do APOIS Passageiro no Supabase compartilhado com o site.

create table if not exists public.ride_categories (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code in ('carros','motos','fretes','guincho','envios')),
  name text not null,
  description text,
  icon text,
  image_url text,
  capacity_label text,
  eta_label text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tariff_rules (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.ride_categories(id) on delete cascade,
  city text not null default 'default',
  base_fare numeric(10,2) not null default 0 check (base_fare >= 0),
  min_fare numeric(10,2) not null default 0 check (min_fare >= 0),
  per_km numeric(10,2) not null default 0 check (per_km >= 0),
  per_min numeric(10,2) not null default 0 check (per_min >= 0),
  stop_fee numeric(10,2) not null default 0 check (stop_fee >= 0),
  fixed_fee numeric(10,2) not null default 0 check (fixed_fee >= 0),
  dynamic_multiplier numeric(6,3) not null default 1 check (dynamic_multiplier > 0),
  is_active boolean not null default true,
  valid_from timestamptz,
  valid_to timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(category_id, city)
);

create table if not exists public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code in ('pix','credit','debit','cash','wallet','credit_card','debit_card')),
  name text not null,
  description text,
  icon text,
  requires_balance boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.drivers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.users(id) on delete cascade,
  name text,
  email text,
  phone text,
  category text,
  vehicle_plate text,
  vehicle_model text,
  vehicle_color text,
  photo_url text,
  approval_status text not null default 'pendente',
  subscription_status text not null default 'teste',
  is_online boolean not null default false,
  rating numeric(3,2),
  total_ratings integer not null default 0,
  current_lat numeric(10,8),
  current_lng numeric(11,8),
  current_heading numeric,
  last_location_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rides (
  id uuid primary key default gen_random_uuid(),
  passenger_id uuid not null references public.users(id),
  driver_id uuid references public.drivers(id),
  accepted_driver_id uuid references public.drivers(id),
  category text not null check (category in ('carros','motos','fretes','guincho','envios')),
  status text not null default 'procurar_motorista' check (status in (
    'agendada','procurar_motorista','motorista_a_caminho','motorista_chegou',
    'em_viagem','finalizada','cancelada_passageiro','cancelada_motorista','expired'
  )),
  origin jsonb not null,
  destination jsonb not null,
  intermediates jsonb not null default '[]'::jsonb,
  origin_name text not null,
  destination_name text not null,
  origin_lat numeric(10,8) not null,
  origin_lng numeric(11,8) not null,
  destination_lat numeric(10,8) not null,
  destination_lng numeric(11,8) not null,
  encoded_polyline text,
  estimated_price numeric(10,2) not null check (estimated_price >= 0),
  final_price numeric(10,2),
  distance_km numeric(10,2),
  duration_min numeric(10,2),
  payment_method text not null,
  service_details jsonb,
  request_key uuid not null unique,
  candidate_driver_ids uuid[] not null default '{}',
  offered_driver_ids uuid[] not null default '{}',
  rejected_driver_ids uuid[] not null default '{}',
  current_offer_driver_id uuid,
  dispatch_attempts integer not null default 0,
  request_expires_at timestamptz,
  search_expires_at timestamptz,
  scheduled_for timestamptz,
  security_code text,
  driver_name text,
  driver_photo text,
  driver_phone text,
  driver_vehicle_model text,
  driver_vehicle_color text,
  driver_vehicle_plate text,
  driver_rating numeric(3,2),
  driver_latitude numeric(10,8),
  driver_longitude numeric(11,8),
  driver_heading numeric,
  passenger_rating numeric(2,1),
  passenger_rating_comment text,
  share_token uuid unique,
  cancellation_fee numeric(10,2),
  cancellation_reason text,
  cancelled_by text,
  accepted_at timestamptz,
  driver_arrived_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists rides_passenger_created_idx on public.rides(passenger_id, created_at desc);
create index if not exists rides_active_passenger_idx on public.rides(passenger_id, status)
  where status in ('agendada','procurar_motorista','motorista_a_caminho','motorista_chegou','em_viagem');
create index if not exists rides_driver_active_idx on public.rides(driver_id, status)
  where driver_id is not null and status in ('motorista_a_caminho','motorista_chegou','em_viagem');

create table if not exists public.cancellation_fees (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid references public.rides(id),
  passenger_id uuid not null references public.users(id),
  amount numeric(10,2) not null check (amount > 0),
  reason text,
  status text not null default 'pending' check (status in ('pending','open','unpaid','processing','paid','cancelled','failed')),
  provider text,
  provider_payment_id text,
  qr_code text,
  qr_code_base64 text,
  ticket_url text,
  expires_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cancellation_fees_passenger_status_idx
  on public.cancellation_fees(passenger_id, status, created_at);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  title text not null,
  body text,
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_created_idx
  on public.notifications(user_id, created_at desc);

create table if not exists public.user_notification_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  token text not null,
  platform text not null check (platform in ('android','ios','web')),
  device_id text,
  permission_status text,
  is_active boolean not null default true,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, token)
);

create table if not exists public.passenger_support_tickets (
  id uuid primary key default gen_random_uuid(),
  protocol text not null unique,
  passenger_id uuid not null references public.users(id),
  ride_id uuid references public.rides(id),
  category text not null,
  subject text not null,
  message text not null,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ride_categories enable row level security;
alter table public.tariff_rules enable row level security;
alter table public.payment_methods enable row level security;
alter table public.drivers enable row level security;
alter table public.rides enable row level security;
alter table public.cancellation_fees enable row level security;
alter table public.notifications enable row level security;
alter table public.user_notification_tokens enable row level security;
alter table public.passenger_support_tickets enable row level security;

drop policy if exists ride_categories_authenticated_read on public.ride_categories;
create policy ride_categories_authenticated_read on public.ride_categories
for select to authenticated using (is_active);

drop policy if exists tariff_rules_authenticated_read on public.tariff_rules;
create policy tariff_rules_authenticated_read on public.tariff_rules
for select to authenticated using (is_active);

drop policy if exists payment_methods_authenticated_read on public.payment_methods;
create policy payment_methods_authenticated_read on public.payment_methods
for select to authenticated using (is_active);

drop policy if exists rides_passenger_read_own on public.rides;
create policy rides_passenger_read_own on public.rides
for select to authenticated using (passenger_id = public.mobility_user_id());

drop policy if exists cancellation_fees_passenger_read_own on public.cancellation_fees;
create policy cancellation_fees_passenger_read_own on public.cancellation_fees
for select to authenticated using (passenger_id = public.mobility_user_id());

drop policy if exists notifications_manage_own on public.notifications;
create policy notifications_manage_own on public.notifications
for select to authenticated using (user_id = public.mobility_user_id());

drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications
for update to authenticated using (user_id = public.mobility_user_id())
with check (user_id = public.mobility_user_id());

drop policy if exists notification_tokens_manage_own on public.user_notification_tokens;
create policy notification_tokens_manage_own on public.user_notification_tokens
for all to authenticated using (user_id = public.mobility_user_id())
with check (user_id = public.mobility_user_id());

drop policy if exists support_tickets_read_own on public.passenger_support_tickets;
create policy support_tickets_read_own on public.passenger_support_tickets
for select to authenticated using (passenger_id = public.mobility_user_id());

grant select on public.ride_categories, public.tariff_rules, public.payment_methods to authenticated;
grant select on public.rides, public.cancellation_fees to authenticated;
grant select, update on public.notifications to authenticated;
grant select, insert, update, delete on public.user_notification_tokens to authenticated;
grant select on public.passenger_support_tickets to authenticated;

insert into public.ride_categories(code,name,description,icon,capacity_label,sort_order,is_active)
values
 ('carros','Carro','Conforto para o dia a dia','car','Até 4 passageiros',10,true),
 ('motos','Moto','Mais agilidade no trajeto','bike','1 passageiro',20,true),
 ('fretes','Fretes e Mudanças','Transporte de volumes e mudanças','truck','Conforme o serviço',30,true),
 ('guincho','Guincho','Assistência para seu veículo','tow-truck','Conforme o veículo',40,true),
 ('envios','Envios','Entrega rápida de objetos','package','Objetos permitidos',50,true)
on conflict(code) do update set
 name=excluded.name, description=excluded.description, icon=excluded.icon,
 capacity_label=excluded.capacity_label, sort_order=excluded.sort_order, is_active=true,
 updated_at=now();

insert into public.payment_methods(code,name,description,icon,requires_balance,sort_order,is_active)
values
 ('pix','Pix','Pagamento instantâneo','qr-code',false,10,true),
 ('credit','Cartão de crédito','Pague com cartão de crédito','credit-card',false,20,true),
 ('debit','Cartão de débito','Pague com cartão de débito','credit-card',false,30,true),
 ('cash','Dinheiro','Pague diretamente ao motorista','banknote',false,40,true),
 ('wallet','Carteira APOIS','Use seu saldo disponível','wallet',true,50,true)
on conflict(code) do update set
 name=excluded.name, description=excluded.description, icon=excluded.icon,
 requires_balance=excluded.requires_balance, sort_order=excluded.sort_order,
 is_active=excluded.is_active, updated_at=now();

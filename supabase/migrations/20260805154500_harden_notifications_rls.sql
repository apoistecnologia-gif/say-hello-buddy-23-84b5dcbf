alter table public.notifications enable row level security;

revoke insert, delete on table public.notifications from authenticated;

drop policy if exists notifications_owner_select_restrictive on public.notifications;
create policy notifications_owner_select_restrictive
on public.notifications
as restrictive
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists notifications_owner_update_restrictive on public.notifications;
create policy notifications_owner_update_restrictive
on public.notifications
as restrictive
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

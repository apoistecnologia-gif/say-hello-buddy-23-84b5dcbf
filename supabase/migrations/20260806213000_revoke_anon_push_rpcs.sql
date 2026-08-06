-- APOIS Passageiro — remove execução anônima residual das RPCs de token push.

begin;

revoke all on function public.register_notification_token(text, text, text, text) from public;
revoke all on function public.register_notification_token(text, text, text, text) from anon;
revoke all on function public.register_notification_token(text, text, text, text) from authenticated;

revoke all on function public.deactivate_notification_token(text) from public;
revoke all on function public.deactivate_notification_token(text) from anon;
revoke all on function public.deactivate_notification_token(text) from authenticated;

grant execute on function public.register_notification_token(text, text, text, text) to authenticated;
grant execute on function public.deactivate_notification_token(text) to authenticated;

commit;

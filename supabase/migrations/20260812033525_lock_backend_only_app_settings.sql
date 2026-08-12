-- app_settings has an explicit authenticated ALL policy with false/false.
-- Make that deny-by-default intent effective at the privilege layer too.
revoke insert, update, delete on table public.app_settings from anon, authenticated;

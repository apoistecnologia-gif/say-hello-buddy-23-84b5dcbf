CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.generate_share_token()
RETURNS text
LANGUAGE sql
SET search_path = public, extensions
AS $function$
  SELECT lower(replace(replace(encode(extensions.gen_random_bytes(9), 'base64'), '/', '_'), '+', '-'));
$function$;
# Segurança das migrations Supabase

Migrations de produção não podem usar nomes ou rotinas de diagnóstico destrutivas, como `kill_*`, nem remover tabelas críticas (`users`, `user_roles`, `passenger_wallets`).

Arquivos temporários de investigação devem ficar fora de `supabase/migrations` e nunca integrar o fluxo de deploy.

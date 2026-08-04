# MOVVI Backend Standalone

Backend TanStack Start **server-only** apontado ao novo Supabase
`wqbtnfbvqtkyywfcqjwa`. Serve exclusivamente as Server Functions e Server
Routes que os APKs Passageiro/Motorista consomem, além de webhooks
públicos (`/api/public/hooks/*`).

**Não tem UI**, **não substitui o painel admin** e **não roda o app
React** — é só backend.

## Endpoints expostos

- `POST /_serverFn/<hash>` — Server Functions RPC (TanStack)
  - `driverAuth.*` (login/cadastro motorista)
  - `driverDocuments.*` / `driverDocs.*` (upload docs)
  - `geocode.*` (autocomplete/reverse geocode Google)
  - `routes.*` (roteamento + preço)
  - `payments/subscription.*` (assinatura MP)
- `POST /api/public/hooks/activate-scheduled-rides` — cron `pg_cron`
- `POST /api/public/hooks/renew-driver-subscriptions` — cron `pg_cron`
- `GET  /api/public/health` — healthcheck

## Passos para publicar

### 1. Ambiente local

```bash
cp .env.example .env
# preencher todas as chaves (SUPABASE_URL, SERVICE_ROLE_KEY, PUBLISHABLE_KEY,
# CRON_SECRET, MERCADOPAGO_*, GOOGLE_MAPS_*)
npm install
```

### 2. Validar paridade do Supabase novo

```bash
node scripts/verify-parity.mjs
```

Corrigir tabelas/RPCs/buckets faltantes no dashboard do Supabase antes de
prosseguir.

### 3. Deploy das Edge Functions no novo Supabase

```bash
supabase login
supabase link --project-ref wqbtnfbvqtkyywfcqjwa
supabase functions deploy approve-driver-and-create-mercadopago-subscription
supabase functions deploy create-my-mercadopago-subscription
supabase functions deploy create-cancellation-fee-charge
supabase functions deploy regenerate-driver-mercadopago-charge
supabase functions deploy mercadopago-webhook       # verify_jwt=false
supabase functions deploy dispatch-broadcast-test
supabase functions deploy request-driver-payout
```

Configurar os secrets no dashboard: `MERCADOPAGO_ACCESS_TOKEN`,
`MERCADOPAGO_WEBHOOK_SECRET`, `MERCADOPAGO_BASE_URL`, `CRON_SECRET`,
`SUPABASE_SERVICE_ROLE_KEY`.

### 4. Deploy do backend TanStack (agnóstico)

**Opção A — Vercel (Node runtime):**

```bash
npm i -g vercel
vercel link
vercel env add SUPABASE_URL production   # (repetir para todas as vars do .env)
vercel deploy --prod
```

**Opção B — Cloudflare Workers:**

```bash
npm i -g wrangler
# adicionar wrangler.toml apontando para .output/server; ver docs TanStack Start.
wrangler deploy
```

**Opção C — Node self-hosted (Fly.io / Railway / VPS):**

```bash
npm run build
node .output/server/index.mjs   # porta padrão 3000
```

Publicar atrás de HTTPS (Caddy/Nginx/Cloudflare Tunnel).

### 5. Configurar CRON no Supabase novo

No SQL Editor:

```sql
select cron.schedule(
  'activate_scheduled_rides', '* * * * *',
  $$ select net.http_post(
    url:='https://SUA-URL/api/public/hooks/activate-scheduled-rides',
    headers:=jsonb_build_object('authorization','Bearer <CRON_SECRET>')
  ); $$
);
select cron.schedule(
  'renew_driver_subscriptions', '0 * * * *',
  $$ select net.http_post(
    url:='https://SUA-URL/api/public/hooks/renew-driver-subscriptions',
    headers:=jsonb_build_object('authorization','Bearer <CRON_SECRET>')
  ); $$
);
```

### 6. Configurar Auth do Supabase novo

- Providers → habilitar **Email/Password** e **Google** (client id/secret).
- URL de redirect: as URLs finais dos APKs / painel admin.
- Trigger `handle_new_user` em `auth.users` (já parte do schema exportado).
- Templates de e-mail — copiar do projeto antigo se aplicável.

### 7. Teste de fumaça antes de promover

```bash
curl https://SUA-URL/api/public/health
# deve retornar { ok: true, env: { supabaseUrl: true, ... } }
```

Testar um cadastro/login de motorista end-to-end via APK apontando
temporariamente para essa URL.

### 8. Só depois: troca de MOBILE_REMOTE_BASE nos APKs

Peça no chat da Lovable a troca de `MOBILE_REMOTE_BASE` (arquivo
`src/lib/mobileFetchProxy.ts`) e `.env.mobile` para a URL final.

## Observação sobre Google Maps

Os arquivos `geocode.functions.ts` e `routes.functions.ts` fazem fallback
via `https://connector-gateway.lovable.dev/google_maps`. Fora do host
Lovable esse gateway pode não estar acessível — nesse caso, defina
`GOOGLE_MAPS_PLATFORM_API_KEY` no `.env` para que o código chame a API
oficial diretamente (`https://maps.googleapis.com`), que é o caminho já
implementado como fallback.

## O que este projeto NÃO faz

- Não hospeda UI React (APKs continuam sendo empacotados no projeto Lovable).
- Não substitui o painel admin (use o `movvi-admin-standalone`).
- Não altera `mobileFetchProxy` — a troca só é feita depois desse backend
  publicado e testado.

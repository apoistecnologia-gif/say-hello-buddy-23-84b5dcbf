# Higiene de configuração

O frontend Vite expõe variáveis `VITE_*` no bundle final. Por isso, somente configuração pública pode usar esse prefixo.

## Configuração pública do frontend

Use valores locais reais apenas em arquivos `.env*` ignorados pelo Git. O repositório mantém somente `.env.example` com placeholders.

- `VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co`
- `VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_PUBLIC_KEY`
- `VITE_SUPABASE_PROJECT_ID=YOUR_PROJECT_ID`
- `VITE_APOIS_API_URL=https://YOUR_PROJECT.supabase.co/functions/v1`
- `VITE_GOOGLE_MAPS_API_KEY=YOUR_BROWSER_RESTRICTED_MAPS_KEY`

`VITE_SUPABASE_URL` e a publishable/anon key do Supabase são dados públicos do cliente e não devem ser classificados automaticamente como secrets. Chaves de Maps usadas no browser também devem ser tratadas como credenciais públicas restritas por aplicação/domínio no provedor.

## Credenciais privilegiadas

As seguintes classes nunca devem ser colocadas em `VITE_*`, no frontend, em `.env` versionado, exemplos com valores reais, documentação ou arquivos de configuração commitados:

- `SUPABASE_SERVICE_ROLE_KEY=<SERVER_SECRET_FROM_PROVIDER>`
- `SUPABASE_PRIVATE_KEY=<SERVER_SECRET_FROM_PROVIDER>`
- `MERCADOPAGO_ACCESS_TOKEN=<SERVER_SECRET_FROM_PROVIDER>`
- `ASAAS_API_KEY=<SERVER_SECRET_FROM_PROVIDER>`
- `PAGBANK_TOKEN=<SERVER_SECRET_FROM_PROVIDER>`
- `OPENPIX_APP_ID=<SERVER_SECRET_FROM_PROVIDER>`
- `SAFE2PAY_TOKEN=<SERVER_SECRET_FROM_PROVIDER>`
- `CLIENT_SECRET=<SERVER_SECRET_FROM_PROVIDER>`
- qualquer private key, access token ou credencial financeira equivalente

Esses valores pertencem ao ambiente server-side/secret manager do provedor correspondente. O repositório pode referenciar apenas os nomes das variáveis.

## Auditoria

Execute:

```sh
bun run audit:secrets
```

O gate rejeita `.env` real rastreado, private keys, tokens privilegiados conhecidos e atribuições literais para nomes de credenciais sensíveis. O workflow de validação executa esse gate antes de typecheck/build.

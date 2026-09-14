# Higiene de configuração

O frontend Vite expõe variáveis `VITE_*` no bundle final. Somente configuração pública deve usar esse prefixo.

## Configuração pública do Passageiro

O repositório mantém `.env.example` apenas com placeholders. Valores reais devem existir somente em arquivos locais ignorados ou no ambiente de CI/deploy.

- `VITE_SUPABASE_URL=https://your-project-ref.supabase.co`
- `VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxx`
- `VITE_SUPABASE_PROJECT_ID=your-project-ref`
- `VITE_APOIS_API_URL=https://your-project-ref.supabase.co/functions/v1`
- `VITE_GOOGLE_MAPS_API_KEY=your-browser-maps-key`

`VITE_SUPABASE_URL` e a publishable/anon key são configuração pública do cliente e não são classificadas automaticamente como secrets. Chaves de Maps usadas no browser devem ser restritas no provedor por aplicação/domínio/API.

## Credenciais privilegiadas

Nunca coloque valores reais destas classes em `VITE_*`, frontend, documentação ou arquivos versionados:

- `SUPABASE_SERVICE_ROLE_KEY=<SERVER_SECRET_FROM_PROVIDER>`
- `SUPABASE_PRIVATE_KEY=<SERVER_SECRET_FROM_PROVIDER>`
- `MERCADOPAGO_ACCESS_TOKEN=<SERVER_SECRET_FROM_PROVIDER>`
- `ASAAS_API_KEY=<SERVER_SECRET_FROM_PROVIDER>`
- `PAGBANK_TOKEN=<SERVER_SECRET_FROM_PROVIDER>`
- `OPENPIX_APP_ID=<SERVER_SECRET_FROM_PROVIDER>`
- `SAFE2PAY_TOKEN=<SERVER_SECRET_FROM_PROVIDER>`
- `CLIENT_SECRET=<SERVER_SECRET_FROM_PROVIDER>`
- private keys, access tokens e credenciais financeiras equivalentes

Esses valores pertencem ao ambiente server-side/secret manager correspondente. O repositório pode referenciar apenas os nomes das variáveis ou placeholders explícitos.

## Auditoria

Execute `bun run audit:secrets`. O gate rejeita `.env` real rastreado, private keys, tokens privilegiados conhecidos, nomes perigosos em `VITE_*` e atribuições literais para credenciais sensíveis.

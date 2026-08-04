# Consolidação da fonte — APOIS/MOVVI backend

Data da consolidação: 01/08/2026.

Base usada: `movvi-backend-auditado-trabalho`, onde foram executados os comandos e aplicadas as correções recentes.

Este pacote consolida as alterações dentro de uma única fonte limpa. Foram removidos apenas itens que não devem fazer parte de uma entrega de código-fonte:

- `.git/`;
- `node_modules/`;
- `dist/` e `.output/`;
- arquivo `.env` com segredos;
- `supabase/.temp/`;
- função temporária `diagnose-google-key`;
- backups `*.backup*` e arquivos `*.corrompido*`;
- logs locais.

Foram preservados o código-fonte, `package.json`, `package-lock.json`, `.env.example`, as migrations e as Edge Functions válidas.

Validações realizadas durante a consolidação:

- verificação de codificação UTF-8: aprovada;
- invariantes críticas de lançamento: aprovadas;
- TypeScript (`tsc --noEmit`): aprovado.

A função `supabase/functions/request-ride/index.ts` desta entrega é a versão consolidada que contém:

- geração automática de `request_key` quando o aplicativo não envia UUID;
- uso da chave Google válida armazenada em `GOOGLE_MAPS_PLATFORM_API_KEY`/`GOOGLE_MAPS_API_KEY`;
- reaproveitamento de corrida ativa em tentativas repetidas.

A execução real no aplicativo ainda deve ser validada ponta a ponta antes do lançamento definitivo.

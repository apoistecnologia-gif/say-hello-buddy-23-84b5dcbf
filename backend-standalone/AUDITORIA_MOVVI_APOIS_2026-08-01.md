# Auditoria técnica MOVVI / APOIS VAMO
Data: 01/08/2026

## Escopo auditado

- `movvi-backend(11).zip`
- `movvi-backend-publicacao.zip`
- `movvi motorista(18).zip`
- `movvi passageiro(12).zip`
- `movvi-admin(5).zip`

## Resumo executivo

A falha de aceite não é causada por um único botão. A base enviada contém versões diferentes do mesmo fluxo, colunas usadas pelo backend sem migration correspondente, artefatos Android desatualizados e substituições globais que enfraqueceram filtros de propriedade da corrida.

A causa mais provável do erro atual `Não foi possível atualizar a corrida` é objetiva:

- o backend de publicação atualiza e consulta `rides.queued_after_ride_id` e `rides.queued_at`;
- essas duas colunas não aparecem no `types.ts`;
- nenhuma das 93 migrations do backend enviado cria essas colunas;
- o bloco de aceite grava ambas as colunas, mesmo quando o valor é `null`.

Assim, o PostgREST pode rejeitar o `UPDATE` inteiro por coluna inexistente/schema cache, deixando `driver_id` e `accepted_driver_id` nulos.

## Achados críticos — P0

### P0-01 — Backend principal corrompido

O arquivo abaixo no ZIP `movvi-backend(11).zip` tem apenas 490 bytes e contém somente um fragmento solto de `if (input.action === "accept")`:

`src/routes/api/driver/rides/action.ts`

Ele não contém imports, rota, autenticação nem demais ações. Esse ZIP não pode ser considerado uma fonte íntegra para publicação.

**Decisão:** o backend canônico deve ser derivado de `movvi-backend-publicacao.zip`.

### P0-02 — Colunas de fila usadas no código, mas inexistentes no schema enviado

O backend de publicação usa:

- `queued_after_ride_id`
- `queued_at`

nos fluxos:

- aceitar corrida;
- conferir corrida enfileirada;
- promover próxima corrida;
- chegar ao passageiro.

Nenhuma migration enviada cria essas colunas e os tipos gerados também não as possuem.

**Efeito:** aceite pode falhar no `UPDATE` antes de preencher `driver_id`.

**Correção preparada:** migration `20260801113000_fix_driver_accept_reject_queue.sql`.

### P0-03 — APK Android e fonte atual não correspondem

No ZIP do motorista:

- `android/app/src/main/assets/public/index.html` aponta para `index.mobile-CYKgdnzu.js`;
- `dist/client/index.html` aponta para `index.mobile-C9EGfMrT.js`;
- existem 45 arquivos `index.mobile-*.js` espalhados em artefatos antigos.

O APK/log enviado executava o bundle `CYKgdnzu`, enquanto a fonte atual já contém outro fluxo de aceite.

**Efeito:** comandos eram aplicados na fonte, mas o celular continuava executando código antigo.

**Correção:** o pacote auditado não inclui a pasta `android/` ativa nem `dist/`; deve-se executar `npm run build:motorista` e `npm run sync:motorista`, que recriam `android/` a partir de `android-motorista/`.

### P0-04 — Fluxo de aceite dividido em dois sistemas

Na fonte atual do motorista:

- aceitar usa RPC Supabase `accept_ride_as_driver`;
- rejeitar, status, cancelar e demais ações usam `/api/driver/rides/action` no Render.

No APK antigo, aceitar também usava o Render.

**Efeito:** regras, logs e resultados diferem conforme o APK instalado.

**Correção preparada:** aceitar e rejeitar passam pelo mesmo endpoint do backend.

### P0-05 — Filtros de propriedade foram ampliados incorretamente

O backend de publicação contém sete ocorrências de:

`driver_id IS NULL OR driver_id = motorista`

em ações que exigem que a corrida pertença ao motorista, incluindo:

- chegar;
- cancelar;
- confirmar pagamento;
- avaliar passageiro;
- buscar corrida ativa.

Isso permite que uma corrida sem motorista seja confundida com corrida do usuário e pode atualizar registros indevidos.

**Correção preparada:** todos esses pontos voltam a exigir `driver_id = driverUserId`.

### P0-06 — Rejeição otimista sem rollback

O app remove a oferta da tela antes da confirmação do backend. Em caso de erro, apenas registra no console e não restaura a chamada.

**Efeito:** estado local e banco divergem; a oferta pode reaparecer pelo Realtime e a segunda ação falhar.

**Correção preparada:** restaurar a oferta e exibir a mensagem real quando o backend recusar.

### P0-07 — Erro real ocultado por mensagem genérica

`callDriverAction` descartava respostas não JSON e substituía o erro por:

`Não foi possível atualizar a corrida.`

**Correção preparada:** leitura do corpo bruto, tentativa de JSON e log do status/código/mensagem.

### P0-08 — Chave Google Routes bloqueada é um erro separado

Os logs comprovam:

- `403 API_KEY_SERVICE_BLOCKED`
- `Routes.ComputeRoutes`
- fallback local também `REQUEST_DENIED`

Esse erro acontece quando o app começa a calcular a rota após o estado otimista. Ele não é, sozinho, a causa do banco manter `driver_id = NULL`, mas quebra a navegação.

**Correção preparada no código:** variável exclusiva `GOOGLE_ROUTES_API_KEY` e erro identificável `GOOGLE_ROUTES_KEY_BLOCKED`.

**Correção externa obrigatória:** criar chave de servidor com Routes API habilitada, faturamento ativo e restrição de API compatível. A chave Android/Web não deve ser reutilizada no Render.

### P0-09 — Assinatura tem múltiplas fontes de verdade

O despacho e o backend exigem:

- status ativo;
- `paid_at` preenchido;
- `period_end` futuro.

Já a função pública antiga validava apenas status/período. O cadastro do motorista podia mostrar `active` sem existir assinatura paga canônica.

**Correção preparada:** alinhar a função pública e converter somente direitos legados que já estavam ativos e com validade futura.

## Achados altos — P1

### P1-01 — Tipos Supabase desatualizados

Os tipos enviados não incluem campos já usados pelo código/migrations:

- `service_details`
- `search_expires_at`
- `dispatch_attempts`
- `queued_after_ride_id`
- `queued_at`

Foram preparados tipos corrigidos para backend, motorista e passageiro.

### P1-02 — Projeto do passageiro contém outro projeto inteiro

`movvi passageiro(12).zip` contém uma pasta completa `movvi-android-motorista/`, além de vários backups, `.output`, arquivos temporários e versões alternativas de telas.

**Risco:** editar/compilar a cópia errada, exatamente como ocorreu com o backend.

### P1-03 — Painel enviado é somente build compilado

`movvi-admin(5).zip` contém milhares de bundles e cópias de `dist`, mas não uma árvore-fonte clara em `src/`.

É possível verificar rotas e strings, mas não fazer uma correção segura e sustentável do painel sem o fonte do admin.

### P1-04 — Codificação quebrada

Há ocorrências de texto corrompido como:

- `n?o`
- `Sess?o`
- sequências `Ã`, `â`

inclusive em mensagens de erro e arquivos usados no mobile.

O projeto já possui verificador de encoding no backend, mas os apps ainda carregam muitos arquivos históricos corrompidos.

### P1-05 — Artefatos e backups dentro dos projetos

Os ZIPs incluem:

- `node_modules`;
- builds antigos;
- backups de arquivos;
- múltiplos bundles hash;
- diretórios intermediários do Gradle;
- cópias de projetos.

Isso aumenta o ZIP, dificulta auditoria e permite compilar código diferente do fonte aparente.

## Arquivos corrigidos nesta entrega

Backend:

- `src/routes/api/driver/rides/action.ts`
- `src/routes/api/driver/routes/compute.ts`
- `src/routes/api/passenger/routes/compute.ts`
- `supabase/functions/request-ride/index.ts`
- `src/integrations/supabase/types.ts`
- `.env.example`
- nova migration SQL

Motorista:

- `src/routes/motorista.app.tsx`
- `src/integrations/supabase/types.ts`

## Validação executada

Os arquivos TypeScript/TSX alterados foram analisados com o compilador TypeScript em modo de transpilação e não apresentaram erro de sintaxe.

Não foi possível validar chamadas reais ao Supabase/Render sem acesso às credenciais e ao banco de produção. A migration deve ser aplicada antes de publicar o backend corrigido.

## Ordem correta de implantação

1. Aplicar a migration SQL no Supabase.
2. Publicar o backend auditado no GitHub/Render.
3. Configurar `GOOGLE_ROUTES_API_KEY` no Render e no Supabase Edge Functions.
4. Compilar e sincronizar o app motorista auditado.
5. Instalar o APK novo.
6. Testar: online → receber → aceitar → passageiro atualizar → rota.

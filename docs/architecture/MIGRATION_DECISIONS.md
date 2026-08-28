# APOIS Corridas — Migration Decisions

Este documento registra divergências encontradas durante a consolidação do APOIS Corridas. O critério é sempre comparar implementação, integração com o schema vivo, segurança e capacidade de teste antes de decidir o que manter, migrar ou remover.

## FIN-001 — Carteira do motorista e settlement de corrida

### A — migrations legadas de 2026-08-05

Arquivos analisados:

- `supabase/migrations/20260805203000_driver_wallet_ride_credit.sql`
- `supabase/migrations/20260805203500_credit_driver_wallet_on_ride_finish.sql`
- `supabase/migrations/20260805204500_harden_driver_ride_settlement.sql`

Elas criavam um contrato de carteira diferente do banco oficial atual, incluindo colunas como `id`, `pending_balance`, `ride_id`, `type`, `status` e `metadata` que não correspondem ao schema vivo.

**Decisão: REMOVER DO CAMINHO DE MIGRAÇÃO / NÃO APLICAR EM PRODUÇÃO.**

Motivo: reaplicar esses arquivos sobre o banco oficial causaria drift de schema e poderia quebrar o ledger canônico já instalado.

### B — `apois_driver_wallet_core` aplicado no Supabase oficial

Contrato vivo confirmado:

- `driver_wallets(driver_id, balance, available_balance, ...)`
- `driver_wallet_transactions(driver_id, amount, direction, source, source_id, ...)`
- idempotência por `unique(driver_id, source, source_id)`
- crédito de multa de cancelamento já integrado ao ledger
- RLS para leitura da própria carteira do motorista

**Decisão: MANTER.**

Motivo: é o schema realmente aplicado e integrado ao Supabase oficial e possui contrato de idempotência compatível com o restante do sistema atual.

### C — settlement canônico compatível com o banco vivo

Migration:

- `supabase/migrations/20260809205000_canonical_ride_settlement.sql`

A nova tabela `ride_settlements` é aditiva e registra server-side o estado financeiro da corrida concluída sem redefinir o ledger existente.

Campos financeiros cuja regra comercial ainda não está documentada (`platform_fee`, `driver_earning`, `payment_provider_fee`, descontos e divisão por origem do saldo) permanecem nulos até uma confirmação real do backend/provedor. Nenhum valor é inventado.

Pagamentos eletrônicos (`pix`, crédito e débito) entram como pendentes e **não** geram crédito na carteira apenas porque a corrida foi finalizada. A confirmação precisa vir do fluxo gateway → webhook → backend, conforme a arquitetura definida no PROMPT APOIS MOBILE.

**Decisão: MIGRAR para este modelo e integrá-lo ao fluxo de pagamento.**

### Estado após a decisão

- corrida finalizada gera `ride_settlements` de forma idempotente;
- recibo do Passageiro recebe o settlement pelo RPC autenticado `get_passenger_ride_receipt`;
- PIX de teste já concluído foi retroativamente registrado como `awaiting_payment / pending`, sem falso crédito na carteira;
- `driver_wallet_transactions` continua sem crédito de corrida eletrônica enquanto não houver confirmação real do pagamento;
- próximo passo financeiro é mapear Mercado Pago x Asaas e ligar a confirmação do gateway ao settlement e ao ledger canônico, sem inventar comissão ou taxa.

## Escopo

Este documento pertence somente ao **APOIS Corridas**. O repositório **APOIS ENTREGAS não deve ser alterado por estas decisões**.

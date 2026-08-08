# APOIS Passageiro — Backend Authority

Este branch pertence ao **APOIS CORRIDAS**.

O Passageiro não possui mais uma implementação própria de redispatch. A antiga `supabase/functions/process-ride-dispatch/index.ts` foi removida porque divergia da política canônica e chegava a classificar `nenhum motorista disponível` como cancelamento do Passageiro.

## Autoridade canônica

- Core Ride / Fare Engine / Dispatch Engine: `franciel046631/movvi-go-connect`, branch `fix/apois-corridas-consolidacao` durante a consolidação.
- Supabase oficial homologado: `vqtucstyduxrqjgyigfk`.
- Dispatch canônico: `dispatch-ride`.
- Redispatch scheduler/wrapper: `process-ride-dispatch`, delegando ao `dispatch-ride` e sem política paralela.

## Regra

Não recriar lógica de elegibilidade de Motorista neste repositório.
O Passageiro solicita a corrida e consome o estado do backend; não é autoridade de preço, status, dispatch ou pagamento.

`franciel046631/apois-entregas` está fora do escopo e não deve ser utilizado como fonte de schema ou backend.

# APOIS Corridas — Modelo Canônico de Identidade

Este documento registra o modelo de identidade efetivamente adotado pelo **APOIS Corridas** e confirmado no schema vivo do Supabase oficial `vqtucstyduxrqjgyigfk`.

Ele existe para eliminar a divergência histórica entre `auth.users.id`, `public.users.id`, `drivers.id`, `drivers.user_id`, `rides.passenger_id` e `rides.driver_id`.

## Regra canônica

### 1. Identidade autenticada

`auth.users.id`

É a identidade global mantida pelo Supabase Auth. Ela é usada para autenticação, sessão, JWT, recuperação de senha e resolução inicial do usuário autenticado.

Ela **não deve ser comparada diretamente** com `rides.passenger_id` nem com `rides.driver_id`.

### 2. Pessoa/usuário de domínio

`public.users.id`

É a identidade de domínio da pessoa dentro do APOIS Corridas.

Relação canônica:

```text
auth.users.id
    ↓
public.users.auth_user_id  UNIQUE/FK
public.users.id
```

FK confirmada no banco oficial:

```text
users.auth_user_id → auth.users.id ON DELETE CASCADE
```

A resolução autenticada padrão deve ser:

```text
auth.uid()
→ public.users.auth_user_id
→ public.users.id
```

A função `public.mobility_user_id()` centraliza essa resolução quando aplicável.

### 3. Entidade Motorista

`public.drivers.id`

É o UUID da entidade motorista.

`public.drivers.user_id` referencia a pessoa de domínio:

```text
public.drivers.user_id → public.users.id ON DELETE CASCADE
```

Logo:

```text
auth.users.id
→ users.auth_user_id
→ users.id
→ drivers.user_id
→ drivers.id
```

### 4. Passageiro de uma corrida

`public.rides.passenger_id`

Referencia:

```text
rides.passenger_id → public.users.id
```

Portanto é incorreto fazer:

```ts
.eq("passenger_id", authUser.id)
```

sem antes resolver o `public.users.id` correspondente.

### 5. Motorista de uma corrida

`public.rides.driver_id`

Referencia:

```text
rides.driver_id → public.drivers.id
```

`public.rides.accepted_driver_id` também referencia `public.drivers.id`.

Portanto é incorreto fazer:

```ts
.eq("driver_id", authUser.id)
```

ou gravar `auth.users.id` em `rides.driver_id`.

### 6. Próxima corrida reservada

`public.rides.queued_after_ride_id`

Referencia outra corrida:

```text
rides.queued_after_ride_id → rides.id ON DELETE SET NULL
```

Isso não altera o modelo de identidade do motorista: a corrida reservada continua usando `rides.driver_id → drivers.id`.

## Invariantes obrigatórias

1. `auth.users.id` é identidade de autenticação.
2. `public.users.id` é identidade da pessoa de domínio.
3. `public.drivers.id` é identidade da entidade motorista.
4. `drivers.user_id` guarda `public.users.id`, nunca `auth.users.id`.
5. `rides.passenger_id` guarda `public.users.id`.
6. `rides.driver_id` guarda `public.drivers.id`.
7. `rides.accepted_driver_id` guarda `public.drivers.id`.
8. RLS/RPCs devem resolver a sessão autenticada antes de comparar entidades de domínio.
9. Frontend não pode assumir que UUIDs de camadas diferentes são intercambiáveis só porque todos possuem o tipo `uuid`.
10. Novos contratos devem nomear explicitamente `authUserId`, `userId`/`passengerId` e `driverId` quando mais de uma dessas identidades estiver em escopo.

## Padrões de implementação

### Passageiro autenticado

Preferir RPC/RLS baseado em `public.mobility_user_id()` ou resolver:

```text
auth.uid() → users.auth_user_id → users.id
```

### Motorista autenticado

Resolver:

```text
auth.uid()
→ users.auth_user_id
→ users.id
→ drivers.user_id
→ drivers.id
```

Operações críticas de corrida devem permanecer em RPCs transacionais no backend, como `driver_accept_ride`, `driver_start_ride` e `driver_finish_ride`.

## Anti-padrões proibidos

- comparar `rides.driver_id` com `auth.uid()`;
- comparar `rides.passenger_id` com `auth.uid()`;
- preencher `drivers.user_id` com `auth.uid()`;
- usar `users.auth_user_id` quando a FK da entidade espera `users.id`;
- permitir que uma Edge Function com service role ignore a identidade de domínio já resolvida por RPC canônico;
- duplicar tabelas ou colunas apenas para contornar a diferença entre identidade de autenticação e identidade de domínio.

## Compatibilidade e migração

Código legado que ainda faça comparação direta entre `auth.users.id` e `rides.driver_id`/`rides.passenger_id` deve ser tratado como incompatível e migrado para este modelo. Não criar uma segunda representação para manter o código antigo funcionando.

## Fonte de verdade

Este documento descreve as FKs existentes no Supabase oficial e é a referência arquitetural para Passageiro, Motorista, Admin, Edge Functions, RLS, types e testes do **APOIS Corridas**.

**Não se aplica ao APOIS Entregas.**

# APOIS Passageiro — Fase 9 Mobile Release

> Produto: **APOIS CORRIDAS / Passageiro**. APOIS Entregas está fora do escopo.

## Estado

A configuração Android do Passageiro já passou pelo workflow técnico da Fase 9, porém **a publicação ainda não está liberada**.

Evidências:

- workflow técnico `APOIS Corridas — Passenger Phase 9 Release`;
- run verde anterior: `31286532212`;
- o AAB produzido nesse run foi inspecionado posteriormente e estava **não assinado**;
- o workflow de release foi endurecido para não aceitar AAB não assinado e para não construir release com domínio `.example`;
- o contrato `tests/mobile/passenger-phase9-contract.mjs` agora bloqueia regressão para URL fictícia e exige o gate de assinatura.

## Entradas externas confirmadas pelo gate

Run `31289771141` verificou as entradas do repositório sem expor valores.

Presentes:

- `GOOGLE_MAPS_WEB_API_KEY`;
- `GOOGLE_MAPS_ANDROID_API_KEY`.

Ausentes:

- repository variable `APOIS_PASSENGER_PUBLIC_URL`;
- secret `APOIS_UPLOAD_KEYSTORE_BASE64`;
- secret `APOIS_UPLOAD_KEY_ALIAS`;
- secret `APOIS_UPLOAD_STORE_PASSWORD`;
- secret `APOIS_UPLOAD_KEY_PASSWORD`.

## URL pública

`VITE_PUBLIC_APP_URL` não pode apontar para `.example`, localhost ou endereço fictício em release. O workflow agora recebe a URL real de `vars.APOIS_PASSENGER_PUBLIC_URL`, valida HTTPS e só depois executa o build.

Essa URL é necessária para superfícies públicas como compartilhamento seguro de corrida. Nenhum domínio foi inventado no código.

## Assinatura Android

O Gradle já está preparado para receber a chave de upload externamente. O workflow agora:

1. exige as quatro entradas de assinatura;
2. decodifica o keystore em arquivo temporário do runner;
3. valida alias/keystore com `keytool`;
4. executa `bundleRelease`;
5. verifica o AAB com `jarsigner`;
6. só então publica o artefato do workflow.

Nenhum keystore, senha ou segredo foi versionado.

## O que continua pendente antes da Play Store

- configurar a URL pública HTTPS real;
- configurar a chave de upload do Google Play nos GitHub Actions secrets;
- gerar AAB assinado e validar fingerprint;
- conferir Play App Signing e fingerprints Firebase/Google;
- confirmar URLs públicas de Termos e Privacidade;
- preencher Data Safety;
- executar E2E físico Passageiro ↔ Motorista, incluindo push, PIN, corrida, settlement, avaliação, segurança, rede e recuperação de senha.

PR #7 permanece DRAFT e não deve ser mesclado até os gates finais.

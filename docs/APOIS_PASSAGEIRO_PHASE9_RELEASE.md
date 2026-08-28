# APOIS Passageiro — Fase 9 Mobile Release

> Produto: **APOIS CORRIDAS / Passageiro**. APOIS Entregas está fora do escopo.

## Estado

A configuração Android do Passageiro já passou pelos gates técnicos da Fase 9 e o P0 de identidade visual nativa foi corrigido e validado. **A publicação ainda não está liberada**.

Evidências:

- workflow técnico `APOIS Corridas — Passenger Phase 9 Release`;
- run verde anterior: `31286532212`;
- o AAB produzido nesse run foi inspecionado posteriormente e estava **não assinado**;
- o workflow de release foi endurecido para não aceitar AAB não assinado e para não construir release com domínio `.example`;
- o contrato `tests/mobile/passenger-phase9-contract.mjs` bloqueia regressão para URL fictícia, exige o gate de assinatura e agora também bloqueia regressão para os recursos nativos padrão do Capacitor.

## P0 — identidade visual nativa Android

O APK técnico anterior ainda empacotava launcher e splash padrão do Capacitor. Esse P0 foi corrigido sem alterar backend, banco de dados ou contratos de corrida.

Estado validado:

- commit canônico da correção: `3753087cf5cfd81bfe08521bbf69e01fd10b8251`;
- launcher adaptativo e fallback passam a usar a marca oficial APOIS em fundo preto;
- splash pré-Android 12 e Android 12+ usam identidade APOIS/preto;
- ícone de notificação FCM passou a usar um recurso monocromático dedicado `ic_stat_apois_notification`;
- bitmaps antigos de launcher/splash do Capacitor foram removidos da árvore Android;
- contrato da Fase 9 verifica a marca nativa e impede a volta dos recursos padrão antigos;
- validação isolada de empacotamento: run `31293700335`, **success**;
- validação canônica do PR #7 após a promoção da correção: run `31293968209`, **success**;
- o artefato canônico `APOIS-Passageiro-Homologacao` foi extraído e inspecionado: não contém `ic_launcher.png`, `ic_launcher_round.png`, `ic_launcher_foreground.png` ou `splash.png` antigos do Capacitor; contém a marca APOIS nativa esperada.

Esse gate fecha o problema de branding nativo do Passageiro, mas **não transforma o APK em release de produção nem conclui a homologação física**.

## Entradas externas confirmadas pelo gate

Run `31290025340` verificou as entradas do repositório sem expor valores.

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

`VITE_PUBLIC_APP_URL` não pode apontar para `.example`, localhost ou endereço fictício em release. O workflow recebe a URL real de `vars.APOIS_PASSENGER_PUBLIC_URL`, valida HTTPS e só depois executa o build.

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
- executar E2E físico Passageiro ↔ Motorista, incluindo push em foreground/background/app encerrado, PIN, rota, corrida, settlement, avaliação, segurança, perda/retorno de rede e recuperação de senha.

PR #7 permanece DRAFT e não deve ser mesclado até os gates finais.

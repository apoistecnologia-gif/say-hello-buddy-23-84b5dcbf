# APOIS Passageiro — Data Safety (fonte de verdade)

Atualizado em: 11/08/2026
Package: `com.apois.passageiro`

Este documento é a fonte de verdade para preencher a seção **Segurança dos dados / Data Safety** da Google Play. Ele deve ser confrontado com o AAB final antes de cada envio.

## Respostas gerais

- O app coleta ou transmite dados do usuário: **Sim**.
- Os dados são criptografados em trânsito: **Sim**, por HTTPS/TLS nos serviços utilizados.
- O usuário pode solicitar exclusão da conta e dos dados associados: **Sim**.
- Exclusão dentro do app: **Sim**.
- Solicitação externa: `https://apoisbrasil.com.br/excluir-conta`.
- Política pública: `https://apoisbrasil.com.br/privacidade`.
- Venda de dados pessoais: **Não**.

> Para “compartilhamento”, aplicar a definição da Google Play. Processamento por fornecedor exclusivamente em nome da APOIS, sob a exceção de prestador de serviço, não deve ser marcado automaticamente como compartilhamento. Revalidar contratos e SDKs antes do envio.

## Tipos de dados

| Categoria Google Play | Coletado | Compartilhado* | Obrigatório | Finalidades principais |
|---|---:|---:|---:|---|
| Informações pessoais — Nome | Sim | Não | Sim | Conta, operação, segurança, suporte |
| Informações pessoais — E-mail | Sim | Não | Conforme cadastro | Autenticação, recuperação, suporte |
| Informações pessoais — Telefone | Sim | Não | Conforme cadastro | Conta, segurança, comunicação |
| IDs do usuário | Sim | Não | Sim | Autenticação, vínculo de dados e corridas |
| Localização aproximada | Sim | Não | Funcional | Embarque, mapa, rotas e segurança |
| Localização precisa | Sim | Não | Funcional | Embarque, mapa, acompanhamento da corrida e segurança |
| Atividade no app — interações | Sim | Não | Automático/funcional | Operação do mapa e funcionamento do app |
| Atividade no app — histórico de pesquisa/endereço | Sim | Não | Opcional/funcional | Sugestões de destino, recentes e favoritos |
| Fotos | Sim, se usuário enviar foto de perfil | Não | Opcional | Perfil |
| Mensagens/conteúdo enviado pelo usuário | Sim | Não | Opcional | Atendimento e suporte |
| Informações financeiras — histórico de compras/transações | Sim, quando aplicável | Não* | Funcional | Pagamentos, multas, comprovantes e conciliação |
| Avaliações e feedback | Sim | Não | Opcional | Qualidade, confiança e segurança |
| IDs do dispositivo/outros IDs | Sim | Não* | Automático | Push, Firebase Installations, segurança e operação dos SDKs |
| Diagnóstico — informações de falhas | Sim | Não* | Automático | Estabilidade e diagnóstico dos SDKs, inclusive Google Maps |
| Diagnóstico — desempenho/outros diagnósticos | Sim | Não* | Automático | Métricas técnicas e confiabilidade |

\* Validar a definição de compartilhamento no formulário final conforme o papel contratual de Google/Firebase, processador de pagamentos e demais operadores.

## SDKs e operadores que precisam ser considerados

- Supabase (Auth, banco, Edge Functions, Storage, Realtime quando aplicável).
- Google Maps / Google Places.
- Firebase Cloud Messaging / Firebase Installations.
- Capacitor Android.
- Capacitor Geolocation.
- Capacitor Push Notifications.
- Processador de pagamentos configurado na versão final.

## Observações sobre Google Maps

O Data Safety deve contemplar dados técnicos processados automaticamente pelos SDKs de mapas, incluindo, conforme documentação do fornecedor e configuração efetiva: endereço IP, identificadores pseudônimos/SDK, metadados do dispositivo, métricas técnicas, informações de falhas e interações com o mapa.

## Exclusão e retenção

A exclusão da conta remove ou anonimiza dados pessoais conforme o fluxo `delete-my-account`. Registros que precisem ser preservados por obrigação legal, financeira, segurança, prevenção a fraude, auditoria ou exercício regular de direitos podem ser retidos pelo período necessário, com minimização/anonimização quando aplicável.

## Gate antes do envio

Antes de preencher/enviar o formulário no Play Console:

1. inspecionar o `AndroidManifest` mesclado do AAB final;
2. listar SDKs realmente empacotados;
3. verificar se algum novo SDK adicionou categoria de dados;
4. confirmar URLs públicas de privacidade e exclusão;
5. confirmar que a resposta “usuário pode solicitar exclusão” está marcada como **Sim**;
6. comparar este documento com a Política de Privacidade vigente.

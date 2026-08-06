# Configuração do Firebase / FCM — APOIS Passageiro

Este guia contém **exatamente** o que você precisa fazer para habilitar as notificações
push em dispositivo real. Nenhum destes passos pode ser feito pelo agente, porque
envolve credenciais reais da sua conta Google.

Identificadores obrigatórios (não altere):

| Item | Valor |
| --- | --- |
| Package / applicationId Android | `com.apois.passageiro` |
| Canal de notificação Android | `apois_rides` |
| API de envio | FCM HTTP v1 |
| Segredo no Lovable Cloud | `FIREBASE_SERVICE_ACCOUNT_B64` |

---

## 1. Criar (ou escolher) o projeto Firebase

1. Acesse <https://console.firebase.google.com>.
2. Clique em **Adicionar projeto** e use um nome como `APOIS`.
3. O Google Analytics é opcional — pode desativar.
4. Aguarde a criação e entre no projeto.

> Se você já tem um projeto Firebase do ecossistema APOIS, use **o mesmo** para
> passageiro, motorista e admin. Um único service account atende todos os apps.

## 2. Cadastrar o app Android

1. No painel do projeto, clique no ícone do **Android** (Adicionar app).
2. Em **Nome do pacote Android**, digite exatamente:

   ```
   com.apois.passageiro
   ```

3. Apelido do app: `APOIS Passageiro` (livre).
4. **SHA-1**: não é necessário para push. Deixe em branco (só é exigido para login Google).
5. Clique em **Registrar app**.

## 3. Baixar o `google-services.json`

1. Ainda no assistente, clique em **Fazer download de google-services.json**.
2. Coloque o arquivo exatamente em:

   ```
   android/app/google-services.json
   ```

3. Não renomeie e não edite o conteúdo.
4. O restante do assistente (passos de Gradle) **já está pronto no repositório** —
   pode clicar em "Próxima / Continuar no console" sem alterar nada.

> O arquivo contém identificadores do projeto, não uma chave privada. Ainda assim,
> trate-o como configuração do app e não o publique fora do repositório privado.

## 4. Ativar a API de mensagens

1. No console Firebase: **Configurações do projeto → Cloud Messaging**.
2. Confirme que **Firebase Cloud Messaging API (V1)** está **Ativada**.
3. Ignore a "Legacy Cloud Messaging API" — o backend usa apenas a V1.

## 5. Gerar a service account (chave privada)

1. **Configurações do projeto → Contas de serviço**.
2. Clique em **Gerar nova chave privada** → **Gerar chave**.
3. Um arquivo `.json` será baixado. **Ele é secreto** — nunca o coloque no
   repositório, no chat nem em prints.

## 6. Converter o JSON em Base64

O backend espera o JSON inteiro codificado em Base64, em **uma única linha**.

**Linux / macOS:**

```bash
base64 -w 0 caminho/para/sua-service-account.json > fcm.b64
```

(No macOS, se `-w` não existir: `base64 -i sua-service-account.json | tr -d '\n' > fcm.b64`)

**Windows (PowerShell):**

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\caminho\sua-service-account.json")) | Set-Content fcm.b64
```

Abra `fcm.b64` e copie **todo o conteúdo**, sem quebras de linha e sem espaços.

## 7. Cadastrar o segredo no Lovable Cloud

1. No projeto Lovable, abra **Project Settings → Secrets**.
2. Crie/atualize o segredo com o nome exato:

   ```
   FIREBASE_SERVICE_ACCOUNT_B64
   ```

3. Cole o conteúdo Base64 como valor e salve.
4. Apague o arquivo `fcm.b64` e o `.json` baixado do seu computador depois.

> Se o segredo já existir (é o caso deste projeto), confirme que ele pertence ao
> **mesmo** projeto Firebase onde você registrou `com.apois.passageiro`. Tokens
> gerados por um projeto Firebase são rejeitados por outro.

## 8. Sincronizar e compilar o app

Após colocar o `google-services.json` no lugar:

```bash
bun install
bun run build
npx cap sync android
npx cap open android      # abre o Android Studio
```

No Android Studio, rode o app no seu aparelho (Infinix) com **Run ▶**.
O plugin `com.google.gms.google-services` é aplicado automaticamente assim que o
`google-services.json` existir.

## 9. Verificar a prontidão (sem enviar notificação)

**Configuração local (não mostra segredos):**

```bash
node scripts/push-readiness.mjs
```

**Backend (somente administrador ou service role), não envia nada:**

```bash
POST /functions/v1/send-ride-push
{ "event": "diagnostics.readiness" }
```

Resposta esperada quando tudo estiver pronto:

```json
{
  "ok": true,
  "mode": "readiness",
  "firebase_secret_present": true,
  "service_account_parsable": true,
  "service_account_fields": { "project_id": true, "client_email": true, "private_key_pkcs8": true },
  "android_channel_id": "apois_rides",
  "active_device_tokens": 1
}
```

## 10. Primeiro teste real

1. Instale o app no Infinix e faça login.
2. Aceite o pedido de permissão de notificações (Android 13+).
3. Rode o diagnóstico acima: `active_device_tokens` deve ser **≥ 1**.
4. Dispare um evento real de corrida (ex.: um motorista aceitar a corrida) — o
   backend envia `ride.accepted` para o passageiro.
5. Ao tocar na notificação, o app deve abrir a tela da corrida.

---

## Solução de problemas

| Sintoma | Causa provável |
| --- | --- |
| `firebase_secret_present: false` | `FIREBASE_SERVICE_ACCOUNT_B64` não cadastrado |
| `service_account_parsable: false` | Base64 com quebras de linha ou JSON incompleto |
| `active_device_tokens: 0` | App não instalado/logado, ou permissão negada no aparelho |
| Erro 404/UNREGISTERED no FCM | Token de outro projeto Firebase; o backend desativa o token automaticamente |
| Notificação chega sem som | Canal `apois_rides` foi criado antes com outra configuração — desinstale e reinstale o app |
| Nada acontece no navegador | Esperado: push nativo não existe em web/preview |

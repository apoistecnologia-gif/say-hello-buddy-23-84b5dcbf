# Configuração de Chaves do Google Maps

Para que o mapa funcione corretamente no Android e no Web Preview, siga as instruções abaixo.

## Android

A chave de API para o Android é injetada durante o build via `manifestPlaceholders`. Ela NÃO deve ser gravada no `AndroidManifest.xml` nem em arquivos versionados.

1. No diretório `android/`, crie ou edite o arquivo `local.properties` (este arquivo já está no `.gitignore`).
2. Adicione a seguinte linha:
   ```properties
   GOOGLE_MAPS_API_KEY=SUA_CHAVE_ANDROID_AQUI
   ```
3. O build do Gradle lerá este valor e o injetará no `AndroidManifest.xml`.
4. Se a chave estiver ausente, o build falhará com uma mensagem de erro clara.

## Web (Preview)

A chave para o navegador é lida de variáveis de ambiente do Vite.

1. Crie ou edite o arquivo `.env.local` na raiz do projeto.
2. Adicione:
   ```env
   VITE_GOOGLE_MAPS_API_KEY=SUA_CHAVE_WEB_AQUI
   ```

## Backend (Geocoding)

A URL do backend da APOIS deve ser configurada para que a geocodificação funcione.

1. No arquivo `.env.local`, adicione:
   ```env
   VITE_APOIS_API_URL=https://api.apois.com.br
   ```

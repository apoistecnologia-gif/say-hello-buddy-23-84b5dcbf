# Configuração do Google Places

Este documento descreve como configurar a integração segura e moderna com a Google Places JavaScript API no aplicativo APOIS Passageiro.

## 1. APIs Necessárias

No [Google Cloud Console](https://console.cloud.google.com/), certifique-se de que as seguintes APIs estão habilitadas para o seu projeto:

*   **Maps JavaScript API** (Necessária para carregar o SDK no frontend)
*   **Places API (New)** (Necessária para as funcionalidades modernas de Autocomplete e Place Details)

## 2. Variável de Ambiente

O aplicativo utiliza a seguinte variável de ambiente no arquivo `.env`:

```env
VITE_GOOGLE_MAPS_API_KEY=SUA_CHAVE_WEB_AQUI
```

**Nota:** Esta é uma chave pública destinada ao uso no cliente (frontend). Não utilize chaves de servidor (Web Service) aqui.

## 3. Restrição de Chave Web

Para segurança, sua chave web **deve** possuir restrições de origem (HTTP Referrers):

### Origem de Preview (Lovable)
*   `https://*.lovable.app/*`
*   `http://localhost:8080/*` (Para desenvolvimento local)

### Origem do Capacitor (Android)
O Capacitor utiliza uma origem local no WebView. Dependendo da configuração em `capacitor.config.ts`, você deve autorizar:
*   `http://localhost/*` (Padrão Android)
*   `capacitor://localhost/*` (Alternativo)

## 4. Diferença entre Chaves

| Característica | Chave Web (VITE) | Chave Android (Nativa) |
| :--- | :--- | :--- |
| **Uso** | JavaScript SDK, Places Library | Maps SDK for Android |
| **Configuração** | `src/services/google/google-maps-loader.ts` | `local.properties` -> `AndroidManifest.xml` |
| **Segurança** | Restrição por Domínio/Referrer | Restrição por Certificado (SHA-1) e Package Name |
| **Biblioteca** | `google.maps.importLibrary("places")` | `@capacitor/google-maps` |

## 5. Verificação de Configuração

### Verificar Chamadas REST
O projeto **não utiliza** chamadas REST diretas para `places.googleapis.com` ou `maps.googleapis.com/maps/api/place`.
Para verificar, use:
```bash
grep -r "places.googleapis.com" src
```

### Testar Autocomplete
1. Abra a rota `/buscar-destino`.
2. Digite ao menos 3 caracteres.
3. Verifique no console do navegador se as requisições estão sendo feitas via SDK do Google (não via fetch/XHR direto para endpoints REST).

## 6. Implementação Técnica

*   **Loader Único:** Gerenciado por `src/services/google/google-maps-loader.ts`.
*   **Autocomplete:** Utiliza `AutocompleteSuggestion.fetchAutocompleteSuggestions`.
*   **Place Details:** Utiliza `place.fetchFields` com máscara de campos otimizada.
*   **Sessão:** Utiliza `AutocompleteSessionToken` para agrupar busca e detalhes em uma única cobrança de sessão.
*   **Filtro Geográfico:** Restrito ao Brasil (`region: "BR"`, `includedRegionCodes: ["br"]`).
*   **Bias:** Utiliza a localização real do `LocationProvider` para priorizar resultados próximos ao passageiro.

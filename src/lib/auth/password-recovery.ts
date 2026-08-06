const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0"]);

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/#\/?$/, "").replace(/\/+$/, "");
}

function resolvePublicAppBaseUrl(): string | null {
  const configuredBase = String(import.meta.env["VITE_PUBLIC_APP_URL"] ?? "").trim();
  if (configuredBase) return normalizeBaseUrl(configuredBase);

  if (typeof window === "undefined") return null;

  const isPublicWebOrigin =
    ["http:", "https:"].includes(window.location.protocol) &&
    !LOCAL_HOSTS.has(window.location.hostname);

  if (!isPublicWebOrigin) return null;

  return normalizeBaseUrl(`${window.location.origin}${window.location.pathname}`);
}

/**
 * Retorna um endereço público para o fluxo de redefinição de senha.
 * No APK/localhost, omite o redirect para impedir links de e-mail apontando
 * para endereços locais que não podem ser abertos fora do dispositivo.
 */
export function getPasswordRecoveryRedirectTo(): string | undefined {
  const baseUrl = resolvePublicAppBaseUrl();
  return baseUrl ? `${baseUrl}/#/redefinir-senha` : undefined;
}

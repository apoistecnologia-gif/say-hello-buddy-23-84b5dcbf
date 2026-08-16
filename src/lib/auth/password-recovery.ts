import { Capacitor } from "@capacitor/core";
import { NATIVE_PASSWORD_RECOVERY_REDIRECT } from "./native-password-recovery";

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
 * No APK, retorna o esquema nativo registrado no Android. Na web pública,
 * retorna a rota hash da aplicação. Nunca envia e-mails para localhost.
 */
export function getPasswordRecoveryRedirectTo(): string | undefined {
  if (Capacitor.isNativePlatform()) return NATIVE_PASSWORD_RECOVERY_REDIRECT;

  const baseUrl = resolvePublicAppBaseUrl();
  return baseUrl ? `${baseUrl}/#/redefinir-senha` : undefined;
}

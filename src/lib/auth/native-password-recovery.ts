import { App, type URLOpenListenerEvent } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";

export const NATIVE_PASSWORD_RECOVERY_REDIRECT =
  "apoispassageiro://auth/redefinir-senha";

type RecoveryResult =
  | { handled: false }
  | { handled: true; success: true }
  | { handled: true; success: false; reason: string };

type RecoveryCallbacks = {
  onReady: () => void | Promise<void>;
  onError: (reason: string) => void | Promise<void>;
};

function readAuthParameters(url: URL): URLSearchParams {
  const parameters = new URLSearchParams(url.search);
  const hash = url.hash.replace(/^#/, "");

  if (hash) {
    const hashParameters = new URLSearchParams(hash);
    hashParameters.forEach((value, key) => {
      if (!parameters.has(key)) parameters.set(key, value);
    });
  }

  return parameters;
}

function isPasswordRecoveryUrl(url: URL): boolean {
  return (
    url.protocol === "apoispassageiro:" &&
    url.hostname === "auth" &&
    url.pathname.replace(/\/+$/, "") === "/redefinir-senha"
  );
}

/**
 * Consome somente links de recuperação pertencentes ao APOIS Passageiro.
 * Tokens e códigos nunca são registrados em logs.
 */
export async function consumeNativePasswordRecoveryUrl(
  rawUrl: string,
): Promise<RecoveryResult> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { handled: false };
  }

  if (!isPasswordRecoveryUrl(url)) return { handled: false };

  const parameters = readAuthParameters(url);
  const providerError =
    parameters.get("error_description") || parameters.get("error");
  if (providerError) {
    return { handled: true, success: false, reason: "recovery_link_rejected" };
  }

  const code = parameters.get("code");
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    return error
      ? { handled: true, success: false, reason: "recovery_code_invalid" }
      : { handled: true, success: true };
  }

  const accessToken = parameters.get("access_token");
  const refreshToken = parameters.get("refresh_token");
  const type = parameters.get("type");

  if (accessToken && refreshToken && (!type || type === "recovery")) {
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    return error
      ? { handled: true, success: false, reason: "recovery_session_invalid" }
      : { handled: true, success: true };
  }

  return { handled: true, success: false, reason: "recovery_credentials_missing" };
}

export async function registerNativePasswordRecoveryHandler({
  onReady,
  onError,
}: RecoveryCallbacks): Promise<() => Promise<void>> {
  if (!Capacitor.isNativePlatform()) return async () => undefined;

  let lastHandledUrl: string | null = null;

  const handle = async ({ url }: URLOpenListenerEvent) => {
    if (!url || url === lastHandledUrl) return;

    const result = await consumeNativePasswordRecoveryUrl(url);
    if (!result.handled) return;

    lastHandledUrl = url;
    if (result.success) await onReady();
    else await onError(result.reason);
  };

  const listener = await App.addListener("appUrlOpen", (event) => {
    void handle(event);
  });

  const launchUrl = await App.getLaunchUrl();
  if (launchUrl?.url) await handle({ url: launchUrl.url });

  return async () => {
    await listener.remove();
  };
}

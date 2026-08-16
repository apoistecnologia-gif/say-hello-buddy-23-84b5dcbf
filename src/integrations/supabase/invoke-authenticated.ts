import { supabase } from "./client";

type InvokeOptions = NonNullable<Parameters<typeof supabase.functions.invoke>[1]>;

function responseStatus(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const context = (error as { context?: unknown }).context;
  if (!context || typeof context !== "object") return null;
  const status = (context as { status?: unknown }).status;
  return typeof status === "number" ? status : null;
}

async function clearInvalidLocalSession(): Promise<void> {
  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch (error) {
    console.warn("[SupabaseAuth] Could not clear invalid local session", error);
  }
}

async function refreshAccessToken(): Promise<string> {
  const { data, error } = await supabase.auth.refreshSession();
  const token = data.session?.access_token;

  if (error || !token) {
    await clearInvalidLocalSession();
    throw new Error("Sua sessão expirou. Entre novamente.");
  }

  return token;
}

/**
 * Invokes an authenticated Edge Function and repairs the common mobile case
 * where localStorage still contains a JWT whose server-side auth session was
 * already revoked. A single refresh/retry is allowed; repeated 401s invalidate
 * the local session so authenticated routes return the passenger to login.
 */
export async function invokeAuthenticatedFunction<T = unknown>(
  functionName: string,
  options: InvokeOptions = {},
) {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session?.access_token) {
    await clearInvalidLocalSession();
    throw new Error("Sua sessão expirou. Entre novamente.");
  }

  const invokeWithToken = (accessToken: string) =>
    supabase.functions.invoke<T>(functionName, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${accessToken}`,
      },
    });

  const firstAttempt = await invokeWithToken(session.access_token);
  if (responseStatus(firstAttempt.error) !== 401) return firstAttempt;

  console.warn(`[SupabaseAuth] ${functionName} returned 401; refreshing session once`);
  const refreshedToken = await refreshAccessToken();
  const retry = await invokeWithToken(refreshedToken);

  if (responseStatus(retry.error) === 401) {
    await clearInvalidLocalSession();
    throw new Error("Sua sessão expirou. Entre novamente.");
  }

  return retry;
}

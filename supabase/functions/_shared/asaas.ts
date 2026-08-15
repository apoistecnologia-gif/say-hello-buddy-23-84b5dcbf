const environment = (Deno.env.get("ASAAS_ENVIRONMENT") ?? "production").trim().toLowerCase();
const rootApiKey = Deno.env.get("ASAAS_API_KEY")?.trim() ?? "";

export const ASAAS_BASE_URL =
  environment === "sandbox" ? "https://api-sandbox.asaas.com/v3" : "https://api.asaas.com/v3";
export const ASAAS_ENVIRONMENT = environment === "sandbox" ? "sandbox" : "production";

export function asaasConfigured() {
  return rootApiKey.length > 20;
}

export function rootAsaasApiKey() {
  if (!asaasConfigured()) throw new Error("ASAAS_API_KEY_MISSING");
  return rootApiKey;
}

export async function asaasFetch<T>(
  path: string,
  init: RequestInit = {},
  apiKey: string = rootAsaasApiKey(),
): Promise<T> {
  const response = await fetch(`${ASAAS_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "User-Agent": `APOIS-Corridas/1.0 (${ASAAS_ENVIRONMENT}; Supabase Edge)`,
      access_token: apiKey,
      ...(init.headers ?? {}),
    },
  });
  const raw = await response.text();
  let body: unknown = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = raw;
  }
  if (!response.ok) {
    throw new Error(
      `ASAAS_HTTP_${response.status}:${(typeof body === "string" ? body : JSON.stringify(body)).slice(0, 500)}`,
    );
  }
  return body as T;
}

export function onlyDigits(value: unknown) {
  return String(value ?? "").replace(/\D/g, "");
}

export type AsaasPixQr = {
  encodedImage?: string;
  payload?: string;
  expirationDate?: string;
};

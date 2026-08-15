const environment = (Deno.env.get("PAGBANK_ENVIRONMENT") ?? "sandbox").trim().toLowerCase();
const accessToken = Deno.env.get("PAGBANK_ACCESS_TOKEN")?.trim() ?? "";

export const PAGBANK_ENVIRONMENT = environment === "production" ? "production" : "sandbox";
export const PAGBANK_BASE_URL = PAGBANK_ENVIRONMENT === "production"
  ? "https://api.pagseguro.com"
  : "https://sandbox.api.pagseguro.com";

export function pagbankConfigured(): boolean {
  return accessToken.length > 20;
}

export function pagbankAccessToken(): string {
  if (!pagbankConfigured()) throw new Error("PAGBANK_ACCESS_TOKEN_MISSING");
  return accessToken;
}

export async function pagbankFetch<T>(pathOrUrl: string, init: RequestInit = {}): Promise<T> {
  const url = /^https:\/\//i.test(pathOrUrl) ? pathOrUrl : `${PAGBANK_BASE_URL}${pathOrUrl}`;
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${pagbankAccessToken()}`,
      Accept: "application/json",
      "Content-Type": "application/json",
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
    const detail = typeof body === "string" ? body : JSON.stringify(body);
    throw new Error(`PAGBANK_HTTP_${response.status}:${detail.slice(0, 800)}`);
  }
  return body as T;
}

export async function pagbankFetchText(pathOrUrl: string): Promise<string> {
  const response = await fetch(pathOrUrl, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${pagbankAccessToken()}`,
      Accept: "text/plain",
    },
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(`PAGBANK_HTTP_${response.status}:${raw.slice(0, 500)}`);
  return raw;
}

export function onlyDigits(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "");
}

export async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function secureEqualHex(a: string, b: string): boolean {
  const left = a.trim().toLowerCase();
  const right = b.trim().toLowerCase();
  if (left.length !== right.length || left.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
}

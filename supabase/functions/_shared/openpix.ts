export type OpenPixEnvironment = "sandbox" | "production";

export type OpenPixCharge = {
  correlationID: string;
  value: number;
  status?: string;
  identifier?: string;
  paymentLinkID?: string;
  brCode?: string;
  qrCodeImage?: string;
  expiresIn?: number;
  expiresDate?: string;
  [key: string]: unknown;
};

export type OpenPixSubAccount = {
  name?: string;
  pixKey?: string;
  balance?: number;
  withdrawBlocked?: boolean;
  [key: string]: unknown;
};

function requireEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`${name}_missing`);
  return value;
}

export function openPixBaseUrl(): string {
  const explicit = Deno.env.get("OPENPIX_API_URL")?.trim();
  if (explicit) return explicit.replace(/\/$/, "");

  const environment = (Deno.env.get("OPENPIX_ENVIRONMENT") ?? "sandbox").trim().toLowerCase();
  return environment === "production"
    ? "https://api.openpix.com.br"
    : "https://api.woovi-sandbox.com";
}

function headers(): HeadersInit {
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    Authorization: requireEnv("OPENPIX_APP_ID"),
  };
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${openPixBaseUrl()}${path}`, {
    ...init,
    headers: { ...headers(), ...(init.headers ?? {}) },
  });

  const raw = await response.text();
  let body: unknown = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = raw;
  }

  if (!response.ok) {
    const detail = typeof body === "string" ? body.slice(0, 600) : JSON.stringify(body).slice(0, 600);
    throw new Error(`openpix_http_${response.status}:${detail}`);
  }

  return body as T;
}

export async function createOpenPixCharge(input: {
  correlationID: string;
  valueCents: number;
  comment: string;
  customer?: {
    name?: string | null;
    taxID?: string | null;
    email?: string | null;
    phone?: string | null;
  };
}): Promise<OpenPixCharge> {
  if (!input.correlationID.trim()) throw new Error("openpix_correlation_id_required");
  if (!Number.isInteger(input.valueCents) || input.valueCents <= 0) {
    throw new Error("openpix_invalid_charge_value");
  }

  const customer = input.customer
    ? Object.fromEntries(Object.entries(input.customer).filter(([, value]) => typeof value === "string" && value.trim()))
    : undefined;

  const body = await request<{ charge?: OpenPixCharge }>("/api/v1/charge", {
    method: "POST",
    body: JSON.stringify({
      correlationID: input.correlationID,
      value: input.valueCents,
      comment: input.comment,
      ...(customer && Object.keys(customer).length >= 2 ? { customer } : {}),
    }),
  });

  if (!body?.charge) throw new Error("openpix_charge_missing");
  return body.charge;
}

export async function getOpenPixCharge(correlationID: string): Promise<OpenPixCharge> {
  if (!correlationID.trim()) throw new Error("openpix_correlation_id_required");
  const body = await request<{ charge?: OpenPixCharge }>(
    `/api/v1/charge/${encodeURIComponent(correlationID)}`,
    { method: "GET" },
  );
  if (!body?.charge) throw new Error("openpix_charge_missing");
  return body.charge;
}

export async function createOpenPixSubAccount(input: {
  name: string;
  pixKey: string;
}): Promise<OpenPixSubAccount> {
  const body = await request<{ SubAccount?: OpenPixSubAccount }>("/api/v1/subaccount", {
    method: "POST",
    body: JSON.stringify({ name: input.name, pixKey: input.pixKey }),
  });
  if (!body?.SubAccount) throw new Error("openpix_subaccount_missing");
  return body.SubAccount;
}

export async function getOpenPixSubAccount(pixKey: string): Promise<OpenPixSubAccount> {
  const body = await request<{ SubAccount?: OpenPixSubAccount }>(
    `/api/v1/subaccount/${encodeURIComponent(pixKey)}`,
    { method: "GET" },
  );
  if (!body?.SubAccount) throw new Error("openpix_subaccount_missing");
  return body.SubAccount;
}

export async function creditOpenPixSubAccount(input: {
  pixKey: string;
  valueCents: number;
  description?: string;
}): Promise<unknown> {
  if (!Number.isInteger(input.valueCents) || input.valueCents <= 0) {
    throw new Error("openpix_invalid_credit_value");
  }
  return request(`/api/v1/subaccount/${encodeURIComponent(input.pixKey)}/credit`, {
    method: "POST",
    body: JSON.stringify({
      value: input.valueCents,
      ...(input.description ? { description: input.description } : {}),
    }),
  });
}

export async function withdrawOpenPixSubAccount(input: {
  pixKey: string;
  valueCents?: number;
}): Promise<unknown> {
  if (input.valueCents !== undefined && (!Number.isInteger(input.valueCents) || input.valueCents <= 0)) {
    throw new Error("openpix_invalid_withdraw_value");
  }
  return request(`/api/v1/subaccount/${encodeURIComponent(input.pixKey)}/withdraw`, {
    method: "POST",
    body: JSON.stringify(input.valueCents === undefined ? {} : { value: input.valueCents }),
  });
}

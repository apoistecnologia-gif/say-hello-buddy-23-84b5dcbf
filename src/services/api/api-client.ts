import { supabase } from "@/integrations/supabase/client";

export interface ApiRequestOptions {
  timeout?: number;
  signal?: AbortSignal;
}

type ApiErrorPayload = {
  error?: string;
};

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

function resolveFunctionsBaseUrl(): string {
  const configuredApiUrl = import.meta.env["VITE_APOIS_API_URL"];
  const supabaseUrl = import.meta.env["VITE_SUPABASE_URL"];

  if (typeof configuredApiUrl === "string" && configuredApiUrl.trim().length > 0) {
    return normalizeBaseUrl(configuredApiUrl.trim());
  }

  if (typeof supabaseUrl === "string" && supabaseUrl.trim().length > 0) {
    return `${normalizeBaseUrl(supabaseUrl.trim())}/functions/v1`;
  }

  return import.meta.env.DEV ? "http://localhost:3000" : "";
}

function readApiError(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const error = (payload as ApiErrorPayload).error;
  return typeof error === "string" && error.trim().length > 0 ? error : undefined;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : Boolean(
        error &&
          typeof error === "object" &&
          "name" in error &&
          (error as { name?: unknown }).name === "AbortError",
      );
}

export class ApiClient {
  private static instance: ApiClient;
  private readonly baseUrl: string;

  private constructor() {
    this.baseUrl = resolveFunctionsBaseUrl();
  }

  public static getInstance(): ApiClient {
    if (!ApiClient.instance) {
      ApiClient.instance = new ApiClient();
    }
    return ApiClient.instance;
  }

  public async post<T>(
    path: string,
    body: unknown,
    options?: ApiRequestOptions,
  ): Promise<T> {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      throw new Error("authentication_required");
    }

    if (!this.baseUrl && !path.startsWith("http")) {
      throw new Error("api_configuration_missing");
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), options?.timeout ?? 15000);
    const abortFromCaller = () => controller.abort();

    options?.signal?.addEventListener("abort", abortFromCaller, { once: true });

    try {
      const targetUrl = path.startsWith("http")
        ? path
        : `${this.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;

      const response = await fetch(targetUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (response.status === 401) {
        throw new Error("authentication_required");
      }

      if (response.status === 429) {
        throw new Error("rate_limited");
      }

      const result: unknown = await response.json();

      if (!response.ok) {
        throw new Error(readApiError(result) ?? "service_unavailable");
      }

      return result as T;
    } catch (error: unknown) {
      if (isAbortError(error)) {
        throw new Error(options?.signal?.aborted ? "request_cancelled" : "request_timeout");
      }

      throw error;
    } finally {
      clearTimeout(timeoutId);
      options?.signal?.removeEventListener("abort", abortFromCaller);
    }
  }
}

export const apiClient = ApiClient.getInstance();

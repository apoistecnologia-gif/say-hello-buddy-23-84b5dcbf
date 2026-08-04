import { supabase } from "@/integrations/supabase/client";

export interface ApiRequestOptions {
  timeout?: number;
  signal?: AbortSignal;
}

export class ApiClient {
  private static instance: ApiClient;
  private baseUrl: string;

  private constructor() {
    this.baseUrl = import.meta.env['VITE_APOIS_API_URL'] || '';
  }

  public static getInstance(): ApiClient {
    if (!ApiClient.instance) {
      ApiClient.instance = new ApiClient();
    }
    return ApiClient.instance;
  }

  public async post<T>(path: string, body: any, options?: ApiRequestOptions): Promise<T> {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      throw new Error('authentication_required');
    }

    if (!this.baseUrl && !path.startsWith('http')) {
      console.warn('VITE_APOIS_API_URL not configured');
      throw new Error('geocode_configuration_missing');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), options?.timeout || 15000);
    
    if (options?.signal) {
      options.signal.addEventListener('abort', () => {
        clearTimeout(timeoutId);
        controller.abort();
      });
    }

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.status === 401) {
        throw new Error('authentication_required');
      }

      if (response.status === 429) {
        throw new Error('geocode_rate_limited');
      }

      if (!response.ok) {
        throw new Error('geocode_service_unavailable');
      }

      const result = await response.json();
      return result as T;
    } catch (error: any) {
      clearTimeout(timeoutId);
      
      if (error.name === 'AbortError') {
        throw new Error(options?.signal?.aborted ? 'geocode_cancelled' : 'geocode_timeout');
      }
      
      throw error;
    }
  }
}

export const apiClient = ApiClient.getInstance();

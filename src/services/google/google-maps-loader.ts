import { PLACES_CONFIG } from "../places/places-config";

const SCRIPT_ID = "apois-google-maps-js";

type GoogleWindow = Window & {
  google?: { maps?: { importLibrary?: (name: string) => Promise<unknown> } };
  gm_authFailure?: () => void;
};

/** Loads Google Maps JavaScript API once and exposes importLibrary safely. */
class GoogleMapsLoader {
  private static instance: GoogleMapsLoader;
  private loadPromise: Promise<void> | null = null;

  private constructor() {}

  public static getInstance(): GoogleMapsLoader {
    if (!GoogleMapsLoader.instance) GoogleMapsLoader.instance = new GoogleMapsLoader();
    return GoogleMapsLoader.instance;
  }

  public async load(): Promise<void> {
    const googleWindow = window as GoogleWindow;
    if (googleWindow.google?.maps?.importLibrary) return;
    if (this.loadPromise) return this.loadPromise;

    const rawApiKey = import.meta.env["VITE_GOOGLE_MAPS_API_KEY"];
    if (typeof rawApiKey !== "string" || rawApiKey.trim().length === 0) {
      console.error("[GoogleMapsLoader] VITE_GOOGLE_MAPS_API_KEY is missing or empty");
      throw new Error("api_key_empty");
    }
    const apiKey = rawApiKey.trim();

    this.loadPromise = new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeoutId);
        if (error) {
          this.loadPromise = null;
          reject(error);
        } else {
          resolve();
        }
      };

      const timeoutId = window.setTimeout(
        () => finish(new Error("maps_timeout")),
        Math.max(PLACES_CONFIG.TIMEOUT_MS, 15000),
      );

      const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
      if (existing) {
        existing.addEventListener(
          "load",
          () => {
            googleWindow.google?.maps?.importLibrary
              ? finish()
              : finish(new Error("maps_api_unavailable"));
          },
          { once: true },
        );
        existing.addEventListener(
          "error",
          () => finish(new Error("maps_script_failed")),
          { once: true },
        );
        return;
      }

      const script = document.createElement("script");
      script.id = SCRIPT_ID;
      script.async = true;
      script.defer = true;
      script.src =
        "https://maps.googleapis.com/maps/api/js?" +
        new URLSearchParams({
          key: apiKey,
          v: "weekly",
          loading: "async",
          libraries: "places,marker",
          auth_referrer_policy: "origin",
        }).toString();
      script.onload = () => {
        googleWindow.google?.maps?.importLibrary
          ? finish()
          : finish(new Error("maps_api_unavailable"));
      };
      script.onerror = () => finish(new Error("maps_script_failed"));
      document.head.appendChild(script);
    });

    return this.loadPromise;
  }

  public async importLibrary(name: string): Promise<unknown> {
    await this.load();
    const importLibrary = (window as GoogleWindow).google?.maps?.importLibrary;
    if (!importLibrary) throw new Error("maps_api_unavailable");
    return importLibrary(name);
  }

  public reset(): void {
    this.loadPromise = null;
    document.getElementById(SCRIPT_ID)?.remove();
  }
}

export const googleMapsLoader = GoogleMapsLoader.getInstance();

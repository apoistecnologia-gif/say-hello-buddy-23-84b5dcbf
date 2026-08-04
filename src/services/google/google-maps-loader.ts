import { PLACES_CONFIG } from '../services/places/places-config';

/**
 * Carregador centralizado para a Google Maps JavaScript API.
 * Garante que a biblioteca seja carregada apenas uma vez e reutiliza a Promise.
 */
class GoogleMapsLoader {
  private static instance: GoogleMapsLoader;
  private loadPromise: Promise<void> | null = null;
  private timeoutId: NodeJS.Timeout | null = null;

  private constructor() {}

  public static getInstance(): GoogleMapsLoader {
    if (!GoogleMapsLoader.instance) {
      GoogleMapsLoader.instance = new GoogleMapsLoader();
    }
    return GoogleMapsLoader.instance;
  }

  /**
   * Carrega a biblioteca Google Maps JS com os módulos necessários.
   * Utiliza a estratégia moderna de importLibrary.
   */
  public async load(): Promise<void> {
    if (this.loadPromise) {
      return this.loadPromise;
    }

    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      console.error('VITE_GOOGLE_MAPS_API_KEY is not defined');
      throw new Error('places_configuration_missing');
    }

    this.loadPromise = new Promise((resolve, reject) => {
      // Timeout lógico para carregamento
      this.timeoutId = setTimeout(() => {
        this.loadPromise = null;
        reject(new Error('places_timeout'));
      }, PLACES_CONFIG.TIMEOUT_MS);

      // Verificação de script já existente (prevenção contra duplicados)
      if ((window as any).google?.maps?.importLibrary) {
        this.clearTimer();
        resolve();
        return;
      }

      // Injeta o bootstrap loader moderno do Google Maps
      // Baseado no snippet oficial do Google Maps JavaScript API
      (function(g: any, apiKey: string) {
        var h: any, a: any, k: any, p = "The Google Maps JavaScript API", c = "google", l = "importLibrary", q = "__ib__", m = document, b = window;
        // @ts-ignore
        b = b[c] || (b[c] = {});
        // @ts-ignore
        var d = b.maps || (b.maps = {}), r = new Set(), e = new URLSearchParams(), u = () => h || (h = new Promise(async (f, n) => {
          await (a = m.createElement("script"));
          e.set("libraries", [...r] + "");
          for (k in g) e.set(k.replace(/[A-Z]/g, (t: string) => "_" + t[0].toLowerCase()), g[k]);
          e.set("callback", c + ".maps." + q);
          a.src = `https://maps.googleapis.com/maps/api/js?` + e;
          // @ts-ignore
          d[q] = f;
          a.onerror = () => h = n(Error(p + " could not load."));
          m.head.append(a);
        }));
        // @ts-ignore
        d[l] = async (f: any, ...n: any) => r.add(f) && u().then(() => d[l](f, ...n));
      })({
        key: apiKey,
        v: "weekly",
      }, apiKey);

      // Aguarda a disponibilidade do importLibrary
      const checkInterval = setInterval(() => {
        if ((window as any).google?.maps?.importLibrary) {
          clearInterval(checkInterval);
          this.clearTimer();
          resolve();
        }
      }, 100);
    });

    return this.loadPromise;
  }

  private clearTimer() {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }

  /**
   * Importa uma biblioteca específica do Google Maps.
   */
  public async importLibrary(name: string): Promise<any> {
    await this.load();
    return (window as any).google.maps.importLibrary(name);
  }
}

export const googleMapsLoader = GoogleMapsLoader.getInstance();

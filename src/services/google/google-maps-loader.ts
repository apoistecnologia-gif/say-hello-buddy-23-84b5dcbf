import { PLACES_CONFIG } from '../places/places-config';

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

    const apiKey = import.meta.env['VITE_GOOGLE_MAPS_API_KEY'];
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
      if ((window as { google: any }).google?.maps?.importLibrary) {
        this.clearTimer();
        resolve();
        return;
      }

      // Injeta o bootstrap loader moderno do Google Maps
      // @ts-ignore
      (function(g, apiKey){var h,a,k,p="The Google Maps JavaScript API",c="google",l="importLibrary",q="__ib__",m=document,b=window;b=b[c]||(b[c]={});var d=b.maps||(b.maps={}),r=new Set,e=new URLSearchParams,u=()=>h||(h=new Promise(async(f,n)=>{await(a=m.createElement("script"));e.set("libraries",[...r]+"");for(k in g)e.set(k.replace(/[A-Z]/g,t=>"_"+t[0].toLowerCase()),g[k]);e.set("callback",c+".maps."+q);a.src=`https://maps.googleapis.com/maps/api/js?`+e;d[q]=f;a.onerror=()=>h=n(Error(p+" could not load."));m.head.append(a)}));d[l]=async(f,...n)=>r.add(f)&&u().then(()=>d[l](f,...n))})({
        key: apiKey,
        v: "weekly",
      }, apiKey);

      const checkInterval = setInterval(() => {
        const maps = (window as { google: any }).google?.maps;
        if (maps && typeof maps.importLibrary === 'function') {
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
    return (window as { google: any }).google.maps.importLibrary(name);
  }
}

export const googleMapsLoader = GoogleMapsLoader.getInstance();

import { LocationData } from "@/hooks/use-location";

// Simple caching mechanism
const cache: Record<string, { address: string; timestamp: number }> = {};
const CACHE_DURATION = 1000 * 60 * 5; // 5 minutes

export const getReverseGeocoding = async (location: LocationData): Promise<string> => {
  const cacheKey = `${location.latitude.toFixed(3)},${location.longitude.toFixed(3)}`;

  if (cache[cacheKey] && Date.now() - cache[cacheKey].timestamp < CACHE_DURATION) {
    return cache[cacheKey].address;
  }

  try {
    // Call the APOIS backend geocoding endpoint
    // We assume the backend handles the Google Maps API internally to avoid exposing keys
    // Use a geocodificação do geocodingService que já está mais completa
    const { geocodingService } = await import("../services/geocoding/geocoding-service");
    if (import.meta.env.DEV) {
      console.log("[geocoding] Calling geocodingService.resolvePickupAddress...");
    }
    const result = await geocodingService.resolvePickupAddress({
      lat: location.latitude,
      lng: location.longitude,
    });

    // Constrói o endereço completo (Rua, Bairro, Cidade) conforme solicitado
    const addr = result.address || result.label;

    cache[cacheKey] = { address: addr, timestamp: Date.now() };
    return addr;
  } catch (error: any) {
    console.error("Geocoding failed:", error);
    throw error; // Re-throw to be handled by the hook
  }
};

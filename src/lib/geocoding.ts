import { LocationData } from "@/hooks/use-location";

// Simple caching mechanism
const cache: Record<string, { address: string; timestamp: number }> = {};
const CACHE_DURATION = 1000 * 60 * 5; // 5 minutes

export const getReverseGeocoding = async (location: LocationData): Promise<string> => {
  const cacheKey = `${location.latitude.toFixed(3)},${location.longitude.toFixed(3)}`;
  
  if (cache[cacheKey] && (Date.now() - cache[cacheKey].timestamp < CACHE_DURATION)) {
    return cache[cacheKey].address;
  }

  try {
    // Call the APOIS backend geocoding endpoint
    // We assume the backend handles the Google Maps API internally to avoid exposing keys
    const response = await fetch(`/api/geocoding/reverse?lat=${location.latitude}&lng=${location.longitude}`);
    if (!response.ok) throw new Error("Failed to fetch address");
    
    const data = await response.json();
    const address = data.formatted_address || "Sua localização atual";
    
    cache[cacheKey] = { address, timestamp: Date.now() };
    return address;
  } catch (error) {
    console.error("Geocoding failed:", error);
    return "Sua localização atual";
  }
};

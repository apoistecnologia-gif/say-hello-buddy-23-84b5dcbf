export interface LatLng {
  lat: number;
  lng: number;
}

export function isValidLatLng(point: any): point is LatLng {
  return (
    point &&
    typeof point.lat === "number" &&
    typeof point.lng === "number" &&
    point.lat >= -90 &&
    point.lat <= 90 &&
    point.lng >= -180 &&
    point.lng <= 180
  );
}

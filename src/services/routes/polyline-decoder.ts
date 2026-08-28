import { RouteCoordinates } from "@/types/routes";

/**
 * Custom Polyline Decoder for Google Encoded Polyline algorithm
 */
export class PolylineDecoder {
  public static decode(encoded: string): RouteCoordinates[] {
    if (!encoded) return [];

    let index = 0;
    const len = encoded.length;
    let lat = 0;
    let lng = 0;
    const points: RouteCoordinates[] = [];

    // Protect against infinite loop from corrupted input
    let iterations = 0;
    const maxIterations = len * 10;

    while (index < len) {
      if (iterations++ > maxIterations) {
        throw new Error("route_invalid_polyline");
      }

      let b: number;
      let shift = 0;
      let result = 0;
      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20 && index < len);
      const dlat = result & 1 ? ~(result >> 1) : result >> 1;
      lat += dlat;

      shift = 0;
      result = 0;
      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20 && index < len);
      const dlng = result & 1 ? ~(result >> 1) : result >> 1;
      lng += dlng;

      const point: RouteCoordinates = {
        lat: lat / 1e5,
        lng: lng / 1e5,
      };

      if (point.lat < -90 || point.lat > 90 || point.lng < -180 || point.lng > 180) {
        throw new Error("route_invalid_polyline");
      }

      points.push(point);
    }

    if (points.length < 2) {
      throw new Error("route_invalid_polyline");
    }

    return points;
  }
}

export const decodePolyline = (encoded: string): RouteCoordinates[] =>
  PolylineDecoder.decode(encoded);

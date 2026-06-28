/**
 * Routing service using Open Source Routing Machine (OSRM)
 * Free public API for turn-by-turn directions
 */

import axios from "axios";
import type { MapRoute, RouteResult } from "./types";

const OSRM_BASE_URL = "https://router.project-osrm.org/route/v1";

type TravelMode = "driving" | "walking" | "cycling";

/**
 * Map travel mode from AI to OSRM profile
 */
function getTravelProfile(
  mode: string | undefined
): TravelMode {
  const modeStr = (mode || "DRIVING").toUpperCase();
  switch (modeStr) {
    case "WALKING":
      return "walking";
    case "BICYCLING":
      return "cycling";
    case "TRANSIT":
      return "driving"; // OSRM doesn't have transit, default to driving
    case "DRIVING":
    default:
      return "driving";
  }
}

class RoutingService {
  /**
   * Calculate route between two locations
   * @param originName - Origin location name (will be geocoded)
   * @param destinationName - Destination location name (will be geocoded)
   * @param travelMode - Travel mode: DRIVING, WALKING, BICYCLING, or TRANSIT
   * @returns Route with geometry and metadata
   */
  async getRoute(
    originName: string,
    destinationName: string,
    travelMode: string | undefined
  ): Promise<MapRoute> {
    try {
      // Import geocoder here to avoid circular dependencies
      const { geocoder } = await import("./Geocoder");

      // Geocode sequentially so Nominatim's public service policy is respected.
      const originResults = await geocoder.search(originName, 1);
      const destResults = await geocoder.search(destinationName, 1);

      if (!originResults.length || !destResults.length) {
        throw new Error("ROUTE_UNAVAILABLE");
      }

      const origin = originResults[0];
      const destination = destResults[0];

      // Get travel profile
      const profile = getTravelProfile(travelMode);

      // Request route from OSRM
      // OSRM uses [lon, lat] format
      const routeUrl = `${OSRM_BASE_URL}/${profile}/${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}`;

      const response = await axios.get<RouteResult>(routeUrl, {
        params: {
          overview: "full", // Return full route geometry
          geometries: "geojson",
          steps: true, // Include turn-by-turn steps
          annotations: "duration,distance", // Include segment metadata
        },
        timeout: 10000,
      });

      if (response.data.code !== "Ok" || response.data.routes.length === 0) {
        throw new Error("ROUTE_UNAVAILABLE");
      }

      const route = response.data.routes[0];

      // Extract geometry (array of [lon, lat] pairs)
      const geometry = route.geometry.coordinates || [];

      // Calculate totals
      const totalDistance = route.distance; // meters
      const totalDuration = route.duration; // seconds

      // Format distances and durations for display
      const distanceKm = (totalDistance / 1000).toFixed(1);
      const distanceMiles = (totalDistance / 1609.34).toFixed(1);
      const distanceText = `${distanceMiles} mi (${distanceKm} km)`;

      const hours = Math.floor(totalDuration / 3600);
      const minutes = Math.round((totalDuration % 3600) / 60);
      const durationText =
        hours > 0 ? `${hours}h ${minutes}m` : `${minutes} min`;

      return {
        waypoints: [origin, destination],
        distance: totalDistance,
        duration: totalDuration,
        geometry,
        distanceText,
        durationText,
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.code === "ECONNABORTED") {
          throw new Error("ROUTE_UNAVAILABLE");
        }
      }
      throw new Error("ROUTE_UNAVAILABLE");
    }
  }
}

export const router = new RoutingService();

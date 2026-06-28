/**
 * Geocoding service using OpenStreetMap Nominatim API
 * Implements rate limiting to respect Nominatim usage policy
 * (1 request per second max)
 */

import axios from "axios";
import type { GeocodeResult, ReverseGeocodeResult, MapLocation } from "./types";

const NOMINATIM_BASE_URL = "https://nominatim.openstreetmap.org";
const MIN_REQUEST_INTERVAL = 1200; // 1.2 seconds to be safe (1 req/sec limit)

class GeocoderService {
  private lastRequestTime: number = 0;
  private requestQueue: Promise<void> = Promise.resolve();

  /**
   * Search for locations by query
   * @param query - Search query (e.g., "coffee shops near Seattle")
   * @param limit - Maximum number of results
   * @returns Array of geocoding results
   */
  async search(query: string, limit: number = 8): Promise<MapLocation[]> {
    try {
      await this.throttle();

      const response = await axios.get<GeocodeResult[]>(`${NOMINATIM_BASE_URL}/search`, {
        params: {
          q: query,
          format: "json",
          limit,
          // Accept various result types
          addressdetails: 1,
        },
        timeout: 8000,
      });

      if (!Array.isArray(response.data)) {
        throw new Error("Invalid response format from Nominatim");
      }

      return response.data.map((result: GeocodeResult) => ({
        id: String(result.osm_id ?? result.place_id ?? `${result.lat},${result.lon}`),
        name: result.name || result.display_name.split(",")[0],
        latitude: parseFloat(result.lat),
        longitude: parseFloat(result.lon),
        address: result.display_name,
        type: result.type,
      }));
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 429) {
          throw new Error("SEARCH_UNAVAILABLE");
        }
        if (error.code === "ECONNABORTED") {
          throw new Error("SEARCH_UNAVAILABLE");
        }
      }
      throw new Error("SEARCH_UNAVAILABLE");
    }
  }

  /**
   * Reverse geocode coordinates to get address
   * @param latitude - Latitude coordinate
   * @param longitude - Longitude coordinate
   * @returns Address and location data
   */
  async reverseGeocode(
    latitude: number,
    longitude: number
  ): Promise<ReverseGeocodeResult> {
    try {
      await this.throttle();

      const response = await axios.get<ReverseGeocodeResult>(`${NOMINATIM_BASE_URL}/reverse`, {
        params: {
          lat: latitude,
          lon: longitude,
          format: "json",
        },
        timeout: 8000,
      });

      return {
        address: response.data.address || {},
        lat: response.data.lat,
        lon: response.data.lon,
        display_name: response.data.display_name,
      };
    } catch (error) {
      throw new Error("SEARCH_UNAVAILABLE");
    }
  }

  /**
   * Implement rate limiting: max 1 request per second
   * Adds delay if needed to respect Nominatim ToS
   */
  private async throttle(): Promise<void> {
    this.requestQueue = this.requestQueue.then(async () => {
      const now = Date.now();
      const timeSinceLastRequest = now - this.lastRequestTime;

      if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
        const delay = MIN_REQUEST_INTERVAL - timeSinceLastRequest;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      this.lastRequestTime = Date.now();
    });

    await this.requestQueue;
  }
}

export const geocoder = new GeocoderService();

/**
 * Type definitions for OpenStreetMap + Leaflet infrastructure
 * Supports geocoding via Nominatim and routing via OSRM
 */

/**
 * Geocoding result from Nominatim
 */
export interface GeocodeResult {
  osm_id?: number;
  place_id?: number;
  name?: string;
  display_name: string;
  lat: string;
  lon: string;
  type?: string;
  importance?: number;
  address?: {
    [key: string]: string;
  };
}

/**
 * Nominatim reverse geocoding result
 */
export interface ReverseGeocodeResult {
  address: {
    [key: string]: string;
  };
  lat: string;
  lon: string;
  display_name: string;
}

/**
 * Route instruction from OSRM
 */
export interface RouteStep {
  distance: number;
  duration: number;
  name: string;
}

/**
 * Complete route result from OSRM
 */
export interface RouteResult {
  code: string;
  message?: string;
  routes: Array<{
    geometry: {
      coordinates: [number, number][];
      type: "LineString";
    };
    legs: Array<{
      steps: RouteStep[];
      distance: number;
      duration: number;
    }>;
    distance: number;
    duration: number;
  }>;
  waypoints: Array<{
    hint: string;
    distance: number;
    name: string;
    location: [number, number];
  }>;
}

/**
 * Simplified location marker for map display
 */
export interface MapLocation {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  address: string;
  type?: string;
}

/**
 * Route with formatted metadata
 */
export interface MapRoute {
  waypoints: MapLocation[];
  distance: number; // in meters
  duration: number; // in seconds
  geometry: [number, number][]; // [lon, lat] pairs
  distanceText: string;
  durationText: string;
}

/**
 * Geocoding service response wrapper
 */
export interface GeocodingResponse {
  results: GeocodeResult[];
  query: string;
}

/**
 * Error wrapper for consistent error handling
 */
export interface MapError {
  code: "NO_RESULTS" | "GEOCODING_ERROR" | "ROUTING_ERROR";
  message: string;
}

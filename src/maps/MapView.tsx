import React, { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline } from "react-leaflet";
import L from "leaflet";
import { useMap } from "react-leaflet";
import { MapPin, Loader2, AlertCircle } from "lucide-react";
import { geocoder } from "./Geocoder";
import { router } from "./Routing";
import type { MapLocation, MapRoute, MapError } from "./types";
import {
  createMapIcon,
  DEFAULT_MAP_CENTER,
  DEFAULT_MAP_ZOOM,
  OSM_ATTRIBUTION,
  OSM_TILE_URL,
} from "./MapProvider";

interface MapViewProps {
  type: "search" | "directions" | "none";
  query?: string;
  directions?: {
    origin: string;
    destination: string;
    travelMode?: string;
  };
}

interface MapBoundsControllerProps {
  locations: MapLocation[];
  route: MapRoute | null;
}

const SEARCH_ERROR: MapError = {
  code: "NO_RESULTS",
  message: "No locations found.",
};

const ROUTE_ERROR: MapError = {
  code: "ROUTING_ERROR",
  message: "No route found.",
};

const toLatLng = (location: MapLocation): [number, number] => [
  location.latitude,
  location.longitude,
];

const MapBoundsController: React.FC<MapBoundsControllerProps> = ({ locations, route }) => {
  const map = useMap();

  useEffect(() => {
    if (route && route.geometry.length > 0) {
      const routeBounds = L.latLngBounds(
        route.geometry.map(([longitude, latitude]) => [latitude, longitude])
      );
      map.fitBounds(routeBounds, { padding: [28, 28], maxZoom: 15 });
      return;
    }

    if (locations.length > 1) {
      const markerBounds = L.latLngBounds(locations.map(toLatLng));
      map.fitBounds(markerBounds, { padding: [28, 28], maxZoom: 15 });
      return;
    }

    if (locations.length === 1) {
      map.flyTo(toLatLng(locations[0]), 15, { duration: 0.8 });
    }
  }, [locations, map, route]);

  return null;
};

export const MapView: React.FC<MapViewProps> = ({ type, query, directions }) => {
  const [locations, setLocations] = useState<MapLocation[]>([]);
  const [route, setRoute] = useState<MapRoute | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<MapError | null>(null);
  const icons = useMemo(
    () => ({
      primary: createMapIcon("#dc2626"),
      secondary: createMapIcon("#f97316"),
      origin: createMapIcon("#16a34a"),
      destination: createMapIcon("#dc2626"),
    }),
    []
  );

  useEffect(() => {
    if (type !== "search" || !query) {
      setLocations([]);
      setError(null);
      return;
    }

    let isCurrent = true;

    const performSearch = async () => {
      setLoading(true);
      setError(null);
      setRoute(null);
      try {
        const results = await geocoder.search(query, 8);
        if (!isCurrent) {
          return;
        }

        if (results.length === 0) {
          setError(SEARCH_ERROR);
          setLocations([]);
        } else {
          setLocations(results);
        }
      } catch {
        if (!isCurrent) {
          return;
        }
        setError(SEARCH_ERROR);
        setLocations([]);
      } finally {
        if (isCurrent) {
          setLoading(false);
        }
      }
    };

    performSearch();

    return () => {
      isCurrent = false;
    };
  }, [type, query]);

  useEffect(() => {
    if (type !== "directions" || !directions) {
      setRoute(null);
      setError(null);
      return;
    }

    let isCurrent = true;

    const calculateRoute = async () => {
      setLoading(true);
      setError(null);
      setLocations([]);
      try {
        const calculatedRoute = await router.getRoute(
          directions.origin,
          directions.destination,
          directions.travelMode
        );

        if (!isCurrent) {
          return;
        }

        setRoute(calculatedRoute);
      } catch {
        if (!isCurrent) {
          return;
        }
        setError(ROUTE_ERROR);
        setRoute(null);
      } finally {
        if (isCurrent) {
          setLoading(false);
        }
      }
    };

    calculateRoute();

    return () => {
      isCurrent = false;
    };
  }, [type, directions]);

  return (
    <div className="w-full h-[260px] md:h-[300px] rounded-lg overflow-hidden border border-zinc-800 bg-zinc-950 my-2 relative shadow-[0_18px_60px_rgba(0,0,0,0.35)]">
      {loading && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-40 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="w-5 h-5 text-red-500 animate-spin" />
            <span className="text-xs text-zinc-400">
              {type === "search" ? "Searching locations..." : "Calculating route..."}
            </span>
          </div>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 flex items-center justify-center z-40 bg-black/70 backdrop-blur-sm">
          <div className="bg-zinc-950 border border-red-950/40 rounded-lg p-4 max-w-xs mx-2 text-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              <AlertCircle className="w-4 h-4 text-red-500" />
              <h4 className="text-red-500 font-bold text-xs">
                {error.code === "NO_RESULTS" ? "No Results" : "Error"}
              </h4>
            </div>
            <p className="text-[11px] text-zinc-400">{error.message}</p>
          </div>
        </div>
      )}

      <MapContainer
        center={DEFAULT_MAP_CENTER}
        zoom={DEFAULT_MAP_ZOOM}
        style={{ width: "100%", height: "100%" }}
        className="z-0"
        attributionControl={true}
        preferCanvas={true}
      >
        <TileLayer
          url={OSM_TILE_URL}
          attribution={OSM_ATTRIBUTION}
          maxZoom={19}
        />
        <MapBoundsController locations={locations} route={route} />

        {type === "search" &&
          locations.map((location, idx) => (
            <Marker
              key={location.id}
              position={[location.latitude, location.longitude]}
              icon={idx === 0 ? icons.primary : icons.secondary}
            >
              <Popup>
                <div className="font-sans text-zinc-900">
                  <h5 className="font-bold text-sm">{location.name}</h5>
                  <p className="text-xs text-zinc-600 mt-1">{location.address}</p>
                </div>
              </Popup>
            </Marker>
          ))}

        {type === "directions" && route && (
          <>
            <Polyline
              positions={route.geometry.map((coord) => [coord[1], coord[0]])}
              color="#ef4444"
              weight={5}
              opacity={0.9}
              dashArray="5, 5"
            />

            {/* Origin marker */}
            <Marker
              position={[
                route.waypoints[0].latitude,
                route.waypoints[0].longitude,
              ]}
              icon={icons.origin}
            >
              <Popup>
                <div className="font-sans text-zinc-900">
                  <h5 className="font-bold text-sm">Origin</h5>
                  <p className="text-xs text-zinc-600 mt-1">
                    {route.waypoints[0].name}
                  </p>
                </div>
              </Popup>
            </Marker>

            {/* Destination marker */}
            <Marker
              position={[
                route.waypoints[1].latitude,
                route.waypoints[1].longitude,
              ]}
              icon={icons.destination}
            >
              <Popup>
                <div className="font-sans text-zinc-900">
                  <h5 className="font-bold text-sm">Destination</h5>
                  <p className="text-xs text-zinc-600 mt-1">
                    {route.waypoints[1].name}
                  </p>
                </div>
              </Popup>
            </Marker>
          </>
        )}
      </MapContainer>

      {/* Floating route info for directions */}
      {type === "directions" && route && !loading && (
        <div className="absolute bottom-3 left-3 right-3 bg-zinc-950/95 border border-red-500/30 p-2.5 rounded-lg flex items-center justify-between shadow-lg font-sans backdrop-blur z-30">
          <div className="flex items-center gap-1.5 text-xs text-white font-medium">
            <MapPin className="w-4 h-4 text-red-500 animate-pulse" />
            <span>Route Details</span>
          </div>
          <div className="flex gap-4 text-[11px] text-zinc-300">
            <div>
              <span className="text-zinc-500 block uppercase text-[9px] font-mono tracking-wider">
                Distance
              </span>
              <span className="font-bold text-white">{route.distanceText}</span>
            </div>
            <div>
              <span className="text-zinc-500 block uppercase text-[9px] font-mono tracking-wider">
                Duration
              </span>
              <span className="font-bold text-red-400">{route.durationText}</span>
            </div>
          </div>
        </div>
      )}

      {/* Result count for search */}
      {type === "search" && locations.length > 0 && !loading && (
        <div className="absolute top-3 left-3 bg-zinc-950/90 border border-zinc-850 px-2 py-1.5 rounded-md text-[10px] font-sans text-white flex items-center gap-1.5 backdrop-blur shadow z-30">
          <MapPin className="w-3.5 h-3.5 text-red-500" />
          <span>Found {locations.length} places</span>
        </div>
      )}
    </div>
  );
};

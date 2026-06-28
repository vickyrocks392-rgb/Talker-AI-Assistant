# Talker AI Maps

Talker AI uses OpenStreetMap, Leaflet, Nominatim, and OSRM for map search and directions. The map feature does not require paid services or map API keys.

## Architecture

```
src/components/InteractiveMap.tsx
  lazy-loads src/maps/MapView.tsx only when mapAction.type is not "none"

src/maps/
  MapProvider.ts  shared tile, attribution, default view, and marker icon setup
  MapView.tsx     React Leaflet rendering, loading states, markers, bounds, routes
  Geocoder.ts     Nominatim location search with serialized rate limiting
  Routing.ts      OSRM route lookup after geocoding origin and destination
  types.ts        map, geocoding, and routing interfaces
```

The AI backend contract remains unchanged. The frontend consumes:

```ts
{
  type: "search" | "directions" | "none";
  query?: string;
  directions?: {
    origin: string;
    destination: string;
    travelMode?: string;
  };
}
```

## Search

For `mapAction.type === "search"`, `MapView` sends the query to Nominatim:

```text
https://nominatim.openstreetmap.org/search
```

Results are converted into `MapLocation` objects, displayed as Leaflet markers, and the map fits the result bounds. If nothing is found, the UI shows:

```text
No locations found.
```

## Directions

For `mapAction.type === "directions"`, `Routing.ts` geocodes the origin and destination sequentially, then calls OSRM:

```text
https://router.project-osrm.org/route/v1
```

The route response is rendered as a Leaflet polyline with origin and destination markers. The overlay displays formatted distance and estimated duration.

## Why OpenStreetMap

OpenStreetMap keeps the local assistant simple to run: no map billing account, no browser SDK key, and no vendor-specific map setup. Leaflet provides a small, mature rendering layer, while Nominatim and OSRM cover the app's current search and directions needs.

## Performance Notes

- `InteractiveMap` uses `React.lazy`, so Leaflet initializes only when a map response is present.
- The map instance is reused while results/routes update.
- `MapBoundsController` fits bounds after searches and routes instead of remounting the map.
- Geocoding requests are serialized with a delay to respect Nominatim public service limits.

## Future Improvements

- Add a small server-side geocoding cache for repeated queries.
- Support a self-hosted Nominatim or Photon endpoint for heavier production traffic.
- Support a self-hosted OSRM profile for private routing and custom travel modes.
- Add route step summaries if the chat UI later needs turn-by-turn instructions.

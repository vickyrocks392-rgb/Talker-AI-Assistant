import L from "leaflet";

export const DEFAULT_MAP_CENTER: [number, number] = [20.5937, 78.9629];
export const DEFAULT_MAP_ZOOM = 5;

export const OSM_TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
export const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

export function createMapIcon(color: string): L.DivIcon {
  return L.divIcon({
    className: "talker-map-marker",
    html: `
      <span style="
        --marker-color: ${color};
        display: block;
        width: 28px;
        height: 28px;
        border-radius: 999px 999px 999px 4px;
        background: var(--marker-color);
        border: 3px solid white;
        box-shadow: 0 10px 24px rgba(0,0,0,0.32);
        transform: rotate(-45deg);
      ">
        <span style="
          display: block;
          width: 8px;
          height: 8px;
          margin: 7px;
          border-radius: 999px;
          background: white;
        "></span>
      </span>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -28],
  });
}

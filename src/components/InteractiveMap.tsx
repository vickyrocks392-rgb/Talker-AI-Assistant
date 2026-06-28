import React, { Suspense, lazy } from "react";

const MapView = lazy(() =>
  import("../maps/MapView").then((module) => ({ default: module.MapView }))
);

interface InteractiveMapProps {
  type: "search" | "directions" | "none";
  query?: string;
  directions?: {
    origin: string;
    destination: string;
    travelMode?: string;
  };
}

export const InteractiveMap: React.FC<InteractiveMapProps> = ({ type, query, directions }) => {
  // Don't render map for "none" type
  if (type === "none") {
    return null;
  }

  return (
    <Suspense
      fallback={
        <div className="w-full h-[260px] md:h-[300px] rounded-lg overflow-hidden border border-zinc-800 bg-zinc-950 my-2 flex items-center justify-center">
          <div className="text-zinc-400 text-sm">Loading map...</div>
        </div>
      }
    >
      <MapView type={type} query={query} directions={directions} />
    </Suspense>
  );
};

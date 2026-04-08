export type RouteLineStringCoords = [number, number][];

export type RouteCoordinatesFeatureCollection = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    geometry: {
      type: "LineString";
      coordinates: [number, number][];
    };
    properties: Record<string, unknown>;
  }>;
};

export function lineStringToFeatureCollection(
  coordinates: RouteLineStringCoords
): RouteCoordinatesFeatureCollection {
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: { type: "LineString", coordinates },
        properties: {},
      },
    ],
  };
}

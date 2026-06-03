import React, { useMemo } from "react";
import { PointAnnotation } from "@maplibre/maplibre-react-native";
import { useTranslation } from "react-i18next";
import type { PlaceForMap } from "../../api/places";
import { clusterPlaceMarkers } from "../../utils/placeMarkerClustering";
import {
  shouldShowPlaceLabel,
  shouldShowPlacePin,
} from "../../utils/mapPlaceMarkerPolicy";
import MapPin, { type MapPinCategory } from "./MapPin";
import PlaceClusterMarker from "./PlaceClusterMarker";

export type PlaceIconSpec = {
  type: string;
  color: string;
  iconName?: string;
};

type Props = {
  places: PlaceForMap[];
  currentZoom: number;
  anchorLatitude: number;
  selectedPlace: PlaceForMap | null;
  getPlaceIcon: (place: PlaceForMap) => PlaceIconSpec;
  getPlaceName: (place: PlaceForMap) => string;
  onPlaceTap: (place: PlaceForMap) => void;
  onClusterTap: (lat: number, lon: number) => void;
  /**
   * Regular Home: place pins use MapLibre `onSelected` (Pressable does not receive
   * touches inside PointAnnotation). Clusters use Pressable to avoid spurious
   * `onSelected` → camera zoom during marker rebuilds.
   */
  useRegularHomeTapSplit?: boolean;
};

/**
 * Renders place pins / clusters for home maps. Keeps `PointAnnotation` + React
 * children (Fabric-safe) while applying zoom tiers and JS clustering.
 */
export default function HomeMapPlaceMarkers({
  places,
  currentZoom,
  anchorLatitude,
  selectedPlace,
  getPlaceIcon,
  getPlaceName,
  onPlaceTap,
  onClusterTap,
  useRegularHomeTapSplit = false,
}: Props) {
  const { t } = useTranslation();

  const items = useMemo(
    () =>
      clusterPlaceMarkers(
        places,
        currentZoom,
        anchorLatitude,
        selectedPlace?.id ?? null
      ),
    [places, currentZoom, anchorLatitude, selectedPlace?.id]
  );

  return (
    <>
      {items.map((item) => {
        if (item.type === "cluster") {
          const hasSelectedInside =
            selectedPlace != null &&
            item.places.some((p) => p.id === selectedPlace.id);
          return (
            <PointAnnotation
              key={item.id}
              id={item.id}
              coordinate={[item.lon, item.lat]}
              anchor={{ x: 0.5, y: 0.5 }}
              onSelected={
                useRegularHomeTapSplit
                  ? undefined
                  : () => onClusterTap(item.lat, item.lon)
              }
            >
              <PlaceClusterMarker
                count={item.places.length}
                emphasized={hasSelectedInside}
                onPress={
                  useRegularHomeTapSplit
                    ? () => onClusterTap(item.lat, item.lon)
                    : undefined
                }
                accessibilityLabel={
                  t("map_place_cluster_label", { count: item.places.length }) ||
                  `${item.places.length} places`
                }
              />
            </PointAnnotation>
          );
        }

        const place = item.place;
        const isSelected = selectedPlace?.id === place.id;
        // Regular Home: only `place_selected_*` — never stack a second pin at the same place.
        if (
          useRegularHomeTapSplit &&
          isSelected &&
          item.id !== `place_selected_${place.id}`
        ) {
          return null;
        }
        if (!shouldShowPlacePin(place, currentZoom, isSelected)) {
          return null;
        }

        const placeIcon = getPlaceIcon(place);
        const category: MapPinCategory =
          place.place_type === "BUSINESS"
            ? "business"
            : ((placeIcon.type as MapPinCategory) ?? "default");

        return (
          <PointAnnotation
            key={item.id}
            id={item.id}
            coordinate={[item.lon, item.lat]}
            anchor={{ x: 0.5, y: 1 }}
            onSelected={() => onPlaceTap(place)}
          >
            <MapPin
              category={category}
              colorOverride={placeIcon.color}
              selected={isSelected}
              zoom={currentZoom}
              label={getPlaceName(place)}
              showLabel={shouldShowPlaceLabel(place, currentZoom, isSelected)}
            />
          </PointAnnotation>
        );
      })}
    </>
  );
}

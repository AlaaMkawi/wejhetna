import React, { forwardRef, memo, useCallback, useEffect, useRef } from "react";
import { Platform, View, type StyleProp, type ViewStyle } from "react-native";
import { useIsFocused, useNavigation } from "@react-navigation/native";
import { MapView, type MapViewRef } from "@maplibre/maplibre-react-native";
import { MapReadyProvider } from "./MapReadyProvider";
import {
  releaseMapOverlays,
  suppressMapOverlays,
} from "./mapOverlayStore";
import {
  resetMapAnnotationsReadyForPlatform,
  setMapAnnotationsReady,
} from "./mapReadyStore";

type MapViewProps = React.ComponentProps<typeof MapView>;

export type FocusedMapViewProps = MapViewProps & {
  /** Shown while the screen is off-screen (keeps layout, no native map). */
  placeholderStyle?: StyleProp<ViewStyle>;
};

const IOS_MAP_READY_FALLBACK_MS = 1200;

/** True when this screen and all parent navigators are focused (stack-safe). */
function useIsMapScreenVisible(): boolean {
  const isFocused = useIsFocused();
  const navigation = useNavigation();

  let nav: ReturnType<typeof useNavigation> | undefined = navigation;
  while (nav) {
    if (typeof nav.isFocused === "function" && !nav.isFocused()) {
      return false;
    }
    nav = nav.getParent?.() as typeof navigation | undefined;
  }
  return isFocused;
}

/**
 * MapLibre MapView that mounts only while the hosting screen is focused.
 *
 * On iOS Fabric, keeping a tab's MapView alive under a stack-pushed map screen
 * (e.g. Home → RouteDetails) causes "mount already mounted" / "recycle mounted view"
 * crashes in RCTComponentViewRegistry. Unmounting when unfocused ensures one MLNMapView
 * tree owns the native annotation views at a time.
 */
const FocusedMapViewInner = forwardRef<MapViewRef, FocusedMapViewProps>(
  function FocusedMapView(
    {
      style,
      placeholderStyle,
      children,
      onDidFinishLoadingMap,
      onDidFinishRenderingMap,
      onDidFinishLoadingStyle,
      ...rest
    },
    ref
  ) {
    const isVisible = useIsMapScreenVisible();
    const readyFallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const markMapReady = useCallback(() => {
      setMapAnnotationsReady(true);
    }, []);

    const clearReadyFallback = useCallback(() => {
      if (readyFallbackRef.current != null) {
        clearTimeout(readyFallbackRef.current);
        readyFallbackRef.current = null;
      }
    }, []);

    useEffect(() => {
      clearReadyFallback();
      if (!isVisible) {
        if (Platform.OS === "ios") {
          suppressMapOverlays();
        }
        resetMapAnnotationsReadyForPlatform();
        return;
      }
      if (Platform.OS === "ios") {
        releaseMapOverlays();
        setMapAnnotationsReady(false);
        readyFallbackRef.current = setTimeout(() => {
          setMapAnnotationsReady(true);
        }, IOS_MAP_READY_FALLBACK_MS);
      } else {
        setMapAnnotationsReady(true);
      }
      return clearReadyFallback;
    }, [isVisible, clearReadyFallback]);

    const handleDidFinishLoadingMap = useCallback(() => {
      clearReadyFallback();
      markMapReady();
      onDidFinishLoadingMap?.();
    }, [clearReadyFallback, markMapReady, onDidFinishLoadingMap]);

    const handleDidFinishRenderingMap = useCallback(() => {
      clearReadyFallback();
      markMapReady();
      onDidFinishRenderingMap?.();
    }, [clearReadyFallback, markMapReady, onDidFinishRenderingMap]);

    const handleDidFinishLoadingStyle = useCallback(() => {
      clearReadyFallback();
      markMapReady();
      onDidFinishLoadingStyle?.();
    }, [clearReadyFallback, markMapReady, onDidFinishLoadingStyle]);

    if (!isVisible) {
      return <View style={[style, placeholderStyle]} />;
    }

    return (
      <MapReadyProvider>
        <MapView
          ref={ref}
          style={style}
          {...rest}
          onDidFinishLoadingMap={handleDidFinishLoadingMap}
          onDidFinishRenderingMap={handleDidFinishRenderingMap}
          onDidFinishLoadingStyle={handleDidFinishLoadingStyle}
        >
          {children}
        </MapView>
      </MapReadyProvider>
    );
  }
);

export const FocusedMapView = memo(FocusedMapViewInner);

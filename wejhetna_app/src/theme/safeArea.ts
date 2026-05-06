import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * Use for scroll/list `contentContainerStyle` padding: fixed clearance (e.g. tab bar)
 * plus the device’s bottom safe inset (gesture / nav bar) so the last item stays above
 * the system area.
 */
export function useListBottomPad(base: number): number {
  const { bottom } = useSafeAreaInsets();
  return base + bottom;
}

/**
 * Extra distance from the bottom of the view for `position: "absolute"` controls on
 * map screens (pick-destination FAB, etc.).
 */
export function useOverlayBottomOffset(base: number): number {
  const { bottom } = useSafeAreaInsets();
  return base + bottom;
}

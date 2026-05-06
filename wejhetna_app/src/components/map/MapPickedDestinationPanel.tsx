import React from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import { useTranslation } from "react-i18next";

const TEAL = "#0f5b63";

type Props = {
  /** Show/hide the panel. Caller is responsible for clearing the picked pin on dismiss. */
  visible: boolean;
  /** Called when the user taps the close (x) button. */
  onDismiss: () => void;
  /** "Start navigation" tap — opens the existing route preview/live nav flow. */
  onStartNavigation: () => void;
  /** "Ride with driver" tap — same entry point used for known places. */
  onRideWithDriver: () => void;
  /** Show spinner instead of the navigation icon while route preview is loading. */
  navigationLoading?: boolean;
  /** Show spinner instead of the driver icon while nearby drivers are being fetched. */
  rideWithDriverLoading?: boolean;
  /** When true, the ride-with-driver button is rendered muted (e.g., active ride blocking). */
  rideWithDriverMuted?: boolean;
};

/**
 * Compact bottom panel shown when the user has chosen a random point on the map
 * (long-press or "tap to pick destination" mode). Mirrors the action footer of the
 * known-place details bottom sheet (`Start navigation` + `Ride with driver`) but
 * intentionally keeps the chrome minimal because a picked point has no name,
 * description, photos, etc. The displayed label is intentionally user-facing
 * ("Selected destination") — never raw lat/lon.
 */
export function MapPickedDestinationPanel({
  visible,
  onDismiss,
  onStartNavigation,
  onRideWithDriver,
  navigationLoading = false,
  rideWithDriverLoading = false,
  rideWithDriverMuted = false,
}: Props) {
  const { t } = useTranslation();
  if (!visible) return null;

  return (
    <View style={styles.wrapper} pointerEvents="box-none">
      <View style={styles.card}>
        <View style={styles.header}>
          <View style={styles.titleBlock}>
            <View style={styles.iconBadge}>
              <Ionicons name="location" size={20} color="#fff" />
            </View>
            <View style={styles.titleTextBlock}>
              <Text style={styles.title} numberOfLines={1}>
                {t("map_picked_destination_panel_title")}
              </Text>
              <Text style={styles.subtitle} numberOfLines={1}>
                {t("map_picked_destination_panel_subtitle")}
              </Text>
            </View>
          </View>
          <TouchableOpacity
            onPress={onDismiss}
            style={styles.closeBtn}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={t("close") || "Close"}
          >
            <Ionicons name="close" size={22} color="#222" />
          </TouchableOpacity>
        </View>

        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.actionPrimary, navigationLoading && styles.actionDisabled]}
            onPress={onStartNavigation}
            disabled={navigationLoading || rideWithDriverLoading}
            activeOpacity={0.85}
          >
            {navigationLoading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Ionicons name="navigate-outline" size={18} color="#fff" />
                <Text style={styles.actionPrimaryText} numberOfLines={1}>
                  {t("start_navigation")}
                </Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.actionSecondary,
              rideWithDriverMuted && styles.actionSecondaryMuted,
              rideWithDriverLoading && styles.actionDisabled,
            ]}
            onPress={onRideWithDriver}
            disabled={rideWithDriverLoading || navigationLoading}
            activeOpacity={0.85}
          >
            {rideWithDriverLoading ? (
              <ActivityIndicator color={TEAL} size="small" />
            ) : (
              <>
                <Ionicons
                  name="car-sport"
                  size={18}
                  color={rideWithDriverMuted ? "#999" : TEAL}
                />
                <Text
                  style={[
                    styles.actionSecondaryText,
                    rideWithDriverMuted && styles.actionSecondaryTextMuted,
                  ]}
                  numberOfLines={1}
                >
                  {t("ride_with_driver_button")}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 110,
    paddingHorizontal: 14,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  titleBlock: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    paddingRight: 8,
  },
  iconBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: TEAL,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  titleTextBlock: { flex: 1 },
  title: { fontSize: 15, fontWeight: "700", color: "#111" },
  subtitle: { fontSize: 12, color: "#666", marginTop: 2 },
  closeBtn: { padding: 4 },
  actionRow: { flexDirection: "row", gap: 8 },
  actionPrimary: {
    flex: 1,
    backgroundColor: TEAL,
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  actionPrimaryText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
  actionSecondary: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: TEAL,
    paddingVertical: 9.5,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  actionSecondaryMuted: { borderColor: "#bbb" },
  actionSecondaryText: { color: TEAL, fontSize: 14, fontWeight: "700" },
  actionSecondaryTextMuted: { color: "#888" },
  actionDisabled: { opacity: 0.7 },
});

export default MapPickedDestinationPanel;

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useTranslation } from "react-i18next";
import Ionicons from "react-native-vector-icons/Ionicons";
import type { NearbyDriver } from "../../api/rides";
import { Colors, Radius, Shadow, Spacing, Typography } from "../../theme";
import { formatDistance } from "../../utils/formatDistance";

// Keeping a local alias for the teal so existing visual hierarchy is preserved
// while all new surfaces/borders/text follow the central theme tokens.
const BRAND = Colors.primary;
const BRAND_SOFT = Colors.primarySoft;
const ACCENT = Colors.accent;

export type DriverInfoPopupProps = {
  visible: boolean;
  driver: NearbyDriver | null;
  destinationText: string | null;
  distanceKm: number | null;
  sending: boolean;
  errorHint?: string | null;
  /** Upper-bound, matches the passengers control elsewhere in the app. */
  maxPassengers?: number;
  /** Optional initial passenger count (defaults to 1). */
  initialPassengers?: number;
  onClose: () => void;
  onSendRequest: (payload: { passengers: number }) => void;
};

/**
 * Compact, centered driver info popup shown when a nearby driver marker is tapped.
 * Rebuilt to replace the old full-form modal — destination + pickup are already set
 * before this popup opens, so here we only surface identity, trust signals
 * (rating + vehicle), and the send-request CTA.
 */
export function DriverInfoPopup({
  visible,
  driver,
  destinationText,
  distanceKm,
  sending,
  errorHint,
  maxPassengers = 12,
  initialPassengers = 1,
  onClose,
  onSendRequest,
}: DriverInfoPopupProps) {
  const { t } = useTranslation();
  const [passengers, setPassengers] = useState(initialPassengers);

  // Scale/fade animation for the card — subtle pop so the user sees the popup
  // anchor to the tapped driver marker visually.
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setPassengers(initialPassengers);
      anim.setValue(0);
      Animated.timing(anim, {
        toValue: 1,
        duration: 180,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }
  }, [visible, initialPassengers, anim]);

  const scale = anim.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] });
  const opacity = anim;

  const ratingAvg = Number(driver?.rating_avg ?? 0);
  const ratingCount = Number(driver?.rating_count ?? 0);
  const hasRating = ratingCount > 0 && ratingAvg > 0;

  const carSubtitle = useMemo(() => {
    if (!driver) return "";
    const parts: string[] = [];
    if (driver.car_type) parts.push(String(driver.car_type));
    if (driver.production_year) parts.push(String(driver.production_year));
    return parts.join(" · ");
  }, [driver]);

  const plate = driver?.plate_number ?? null;

  // Clean "2.4 km" / "850 m" style formatting (no misleading "0 km" for short
  // distances). Unit translation is handled inside the formatter.
  const distanceDisplay = useMemo(() => {
    const value =
      distanceKm != null && Number.isFinite(distanceKm)
        ? distanceKm
        : driver?.distance_km;
    return formatDistance(value, { t });
  }, [distanceKm, driver, t]);

  if (!driver) {
    return null;
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Animated.View
          style={[
            styles.cardWrap,
            { transform: [{ scale }], opacity },
          ]}
        >
          {/* Inner Pressable blocks overlay tap-through. */}
          <Pressable onPress={() => {}} style={styles.card}>
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={onClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel={t("close") || "Close"}
            >
              <Ionicons name="close" size={20} color={Colors.textSecondary} />
            </TouchableOpacity>

            <View style={styles.headerRow}>
              <View style={styles.avatar}>
                <Ionicons name="person" size={26} color={BRAND} />
              </View>
              <View style={styles.headerText}>
                <Text style={styles.name} numberOfLines={1}>
                  {driver.full_name || driver.username}
                </Text>
                <Text style={styles.username} numberOfLines={1}>
                  @{driver.username}
                </Text>
              </View>
            </View>

            <View style={styles.ratingRow}>
              <Ionicons
                name={hasRating ? "star" : "star-outline"}
                size={16}
                color={hasRating ? ACCENT : Colors.textMuted}
              />
              <Text style={styles.ratingValue}>
                {hasRating ? ratingAvg.toFixed(1) : t("ride_rating_none") || "—"}
              </Text>
              <Text style={styles.ratingCount}>
                {hasRating
                  ? `(${ratingCount} ${t("ride_rating_count_suffix") || "ratings"})`
                  : t("ride_rating_no_reviews") || "No reviews yet"}
              </Text>
            </View>

            {(carSubtitle || plate) && (
              <View style={styles.infoRow}>
                <Ionicons name="car-sport" size={16} color={BRAND} />
                <Text style={styles.infoText} numberOfLines={1}>
                  {carSubtitle || t("ride_vehicle") || "Vehicle"}
                  {plate ? `  ·  ${plate}` : ""}
                </Text>
              </View>
            )}

            {distanceDisplay ? (
              <View style={styles.infoRow}>
                <Ionicons name="navigate" size={16} color={BRAND} />
                <Text style={styles.infoText}>
                  {distanceDisplay.text} {t("ride_away") || "away"}
                </Text>
              </View>
            ) : null}

            {destinationText ? (
              <View style={styles.infoRow}>
                <Ionicons name="flag" size={16} color={BRAND} />
                <Text style={styles.infoText} numberOfLines={2}>
                  {destinationText}
                </Text>
              </View>
            ) : null}

            <View style={styles.passengerRow}>
              <Text style={styles.passengerLabel}>
                {t("ride_number_of_people") || "Passengers"}
              </Text>
              <View style={styles.passengerControls}>
                <TouchableOpacity
                  style={[styles.passengerBtn, passengers <= 1 && styles.passengerBtnDisabled]}
                  onPress={() => setPassengers((p) => Math.max(1, p - 1))}
                  disabled={passengers <= 1}
                >
                  <Ionicons
                    name="remove"
                    size={18}
                    color={passengers <= 1 ? Colors.textMuted : BRAND}
                  />
                </TouchableOpacity>
                <Text style={styles.passengerCount}>{passengers}</Text>
                <TouchableOpacity
                  style={[
                    styles.passengerBtn,
                    passengers >= maxPassengers && styles.passengerBtnDisabled,
                  ]}
                  onPress={() => setPassengers((p) => Math.min(maxPassengers, p + 1))}
                  disabled={passengers >= maxPassengers}
                >
                  <Ionicons
                    name="add"
                    size={18}
                    color={passengers >= maxPassengers ? Colors.textMuted : BRAND}
                  />
                </TouchableOpacity>
              </View>
            </View>

            {errorHint ? (
              <Text style={styles.errorText} numberOfLines={3}>
                {errorHint}
              </Text>
            ) : null}

            <TouchableOpacity
              style={[styles.sendBtn, sending && styles.sendBtnDisabled]}
              onPress={() => onSendRequest({ passengers })}
              disabled={sending}
              activeOpacity={0.85}
            >
              {sending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="paper-plane" size={16} color="#fff" />
                  <Text style={styles.sendBtnText}>
                    {t("ride_send_request") || "Send Request"}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: Colors.overlay,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.xxl,
  },
  cardWrap: {
    width: "100%",
    maxWidth: 380,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xxl,
    padding: Spacing.xl,
    ...Shadow.float,
  },
  closeBtn: {
    position: "absolute",
    top: Spacing.sm + 2,
    right: Spacing.sm + 2,
    width: 32,
    height: 32,
    borderRadius: Radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.surfaceMuted,
    borderWidth: 1,
    borderColor: Colors.border,
    zIndex: 2,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingRight: 36,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: Radius.pill,
    backgroundColor: BRAND_SOFT,
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontSize: Typography.sizeLg,
    fontWeight: Typography.weightBold,
    color: Colors.text,
  },
  username: {
    marginTop: 2,
    fontSize: Typography.sizeSm + 1,
    color: Colors.textSecondary,
  },
  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: Spacing.lg - 2,
  },
  ratingValue: {
    fontSize: Typography.sizeMd,
    fontWeight: Typography.weightBold,
    color: Colors.text,
  },
  ratingCount: {
    fontSize: Typography.sizeSm + 1,
    color: Colors.textSecondary,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginTop: Spacing.sm + 2,
  },
  infoText: {
    flex: 1,
    fontSize: Typography.sizeBase,
    color: Colors.textSecondary,
  },
  passengerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: Spacing.lg,
    paddingTop: Spacing.md + 2,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.divider,
  },
  passengerLabel: {
    fontSize: Typography.sizeBase,
    color: Colors.text,
    fontWeight: Typography.weightSemibold,
  },
  passengerControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm + 2,
  },
  passengerBtn: {
    width: 34,
    height: 34,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.surface,
  },
  passengerBtnDisabled: {
    backgroundColor: Colors.surfaceMuted,
  },
  passengerCount: {
    fontSize: Typography.sizeMd + 1,
    fontWeight: Typography.weightBold,
    color: Colors.text,
    minWidth: 20,
    textAlign: "center",
  },
  errorText: {
    marginTop: Spacing.sm + 2,
    fontSize: Typography.sizeSm,
    color: Colors.danger,
  },
  sendBtn: {
    marginTop: Spacing.lg,
    height: 48,
    borderRadius: Radius.lg,
    backgroundColor: BRAND,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    ...Shadow.soft,
  },
  sendBtnDisabled: {
    opacity: 0.7,
  },
  sendBtnText: {
    color: Colors.textInverse,
    fontSize: Typography.sizeMd,
    fontWeight: Typography.weightBold,
  },
});

export default DriverInfoPopup;

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useTranslation } from "react-i18next";
import Ionicons from "react-native-vector-icons/Ionicons";
import type { NearbyDriver } from "../../api/rides";

const TEAL = "#0f5b63";
const TEAL_SOFT = "#e6f2f3";
const MUTED = "#6b7280";
const GOLD = "#f5a623";
const DANGER = "#c5322a";
const BORDER = "#e5e7eb";
const CARD = "#ffffff";

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

  const distanceLabel = useMemo(() => {
    const value =
      distanceKm != null && Number.isFinite(distanceKm)
        ? distanceKm
        : driver?.distance_km;
    if (value == null || !Number.isFinite(Number(value))) return null;
    return Number(value).toFixed(value < 1 ? 2 : 1);
  }, [distanceKm, driver]);

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
              <Ionicons name="close" size={20} color="#374151" />
            </TouchableOpacity>

            <View style={styles.headerRow}>
              <View style={styles.avatar}>
                <Ionicons name="person" size={26} color={TEAL} />
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
                color={hasRating ? GOLD : MUTED}
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
                <Ionicons name="car-sport" size={16} color={TEAL} />
                <Text style={styles.infoText} numberOfLines={1}>
                  {carSubtitle || t("ride_vehicle") || "Vehicle"}
                  {plate ? `  ·  ${plate}` : ""}
                </Text>
              </View>
            )}

            {distanceLabel && (
              <View style={styles.infoRow}>
                <Ionicons name="navigate" size={16} color={TEAL} />
                <Text style={styles.infoText}>
                  {distanceLabel} {t("ride_km") || "km"} {t("ride_away") || "away"}
                </Text>
              </View>
            )}

            {destinationText ? (
              <View style={styles.infoRow}>
                <Ionicons name="flag" size={16} color={TEAL} />
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
                  <Ionicons name="remove" size={18} color={passengers <= 1 ? "#9ca3af" : TEAL} />
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
                    color={passengers >= maxPassengers ? "#9ca3af" : TEAL}
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
    backgroundColor: "rgba(17, 24, 39, 0.45)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  cardWrap: {
    width: "100%",
    maxWidth: 380,
  },
  card: {
    backgroundColor: CARD,
    borderRadius: 20,
    padding: 18,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.18,
        shadowRadius: 18,
      },
      android: { elevation: 10 },
      default: {},
    }),
  },
  closeBtn: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f3f4f6",
    zIndex: 2,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingRight: 36,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: TEAL_SOFT,
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontSize: 17,
    fontWeight: "700",
    color: "#111827",
  },
  username: {
    marginTop: 2,
    fontSize: 13,
    color: MUTED,
  },
  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 14,
  },
  ratingValue: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
  },
  ratingCount: {
    fontSize: 13,
    color: MUTED,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: "#374151",
  },
  passengerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: BORDER,
  },
  passengerLabel: {
    fontSize: 14,
    color: "#374151",
    fontWeight: "600",
  },
  passengerControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  passengerBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  passengerBtnDisabled: {
    backgroundColor: "#f9fafb",
  },
  passengerCount: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
    minWidth: 20,
    textAlign: "center",
  },
  errorText: {
    marginTop: 10,
    fontSize: 12,
    color: DANGER,
  },
  sendBtn: {
    marginTop: 16,
    height: 48,
    borderRadius: 12,
    backgroundColor: TEAL,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  sendBtnDisabled: {
    opacity: 0.7,
  },
  sendBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
});

export default DriverInfoPopup;

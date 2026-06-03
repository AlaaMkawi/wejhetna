import React from "react";
import {
  ActivityIndicator,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import { useTranslation } from "react-i18next";
import { placeDetailsActionButtonStyles as styles } from "./placeDetailsActionButtonStyles";

export type PlaceDetailsActionButtonsProps = {
  /** When false, nav/ride row is hidden (e.g. free map pick without a place sheet). */
  hasDestination: boolean;
  showRideWithDriver?: boolean;
  routeLoading?: boolean;
  rideWithDriverLoading?: boolean;
  rideWithDriverMuted?: boolean;
  isPlaceSaved?: boolean;
  savingPlace?: boolean;
  canSave?: boolean;
  onShare?: () => void;
  onToggleSave?: () => void;
  onStartNavigation: () => void;
  onRideWithDriver?: () => void;
};

/**
 * Unified action footer for known-place bottom sheets (Regular / Driver / Business Owner / Admin).
 * Visual styles match RegularHomeScreen pre-unification (`placeDetailsActionButtonStyles`).
 */
export function PlaceDetailsActionButtons({
  hasDestination,
  showRideWithDriver = true,
  routeLoading = false,
  rideWithDriverLoading = false,
  rideWithDriverMuted = false,
  isPlaceSaved = false,
  savingPlace = false,
  canSave = true,
  onShare,
  onToggleSave,
  onStartNavigation,
  onRideWithDriver,
}: PlaceDetailsActionButtonsProps) {
  const { t } = useTranslation();

  return (
    <View style={styles.actionButtonsBlock}>
      <View style={styles.actionButtonsRowTop}>
        <TouchableOpacity style={styles.actionButtonSecondary} onPress={onShare} activeOpacity={0.85}>
          <Ionicons name="share-outline" size={20} color="#0f5b63" />
          <Text style={styles.actionButtonSecondaryText}>
            {t("share") || "שיתוף"}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionButtonSecondary}
          onPress={onToggleSave}
          disabled={savingPlace || !canSave}
          activeOpacity={0.85}
        >
          <Ionicons
            name={isPlaceSaved ? "bookmark" : "bookmark-outline"}
            size={20}
            color="#0f5b63"
          />
          <Text style={styles.actionButtonSecondaryText}>
            {isPlaceSaved ? t("saved") || "שמור" : t("save") || "שמירה"}
          </Text>
        </TouchableOpacity>
      </View>

      {hasDestination &&
        (showRideWithDriver && onRideWithDriver ? (
          <View style={styles.actionButtonsRowNavRide}>
            <TouchableOpacity
              style={[styles.actionButtonPrimary, styles.actionButtonPrimarySplit]}
              onPress={onStartNavigation}
              disabled={routeLoading || rideWithDriverLoading}
              activeOpacity={0.85}
            >
              {routeLoading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="navigate-outline" size={20} color="#FFFFFF" />
                  <Text
                    style={[styles.actionButtonPrimaryText, styles.actionButtonCtaLabel]}
                  >
                    {t("start_navigation") || "Start Navigation"}
                  </Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.actionButtonRideWithDriver,
                styles.actionButtonPrimarySplit,
                rideWithDriverMuted && styles.actionButtonRideWithDriverMuted,
              ]}
              onPress={onRideWithDriver}
              disabled={rideWithDriverLoading}
              activeOpacity={0.85}
            >
              {rideWithDriverLoading ? (
                <ActivityIndicator size="small" color="#0f5b63" />
              ) : (
                <>
                  <Ionicons
                    name="car-sport"
                    size={20}
                    color={rideWithDriverMuted ? "#999" : "#0f5b63"}
                  />
                  <Text
                    style={[
                      styles.actionButtonRideWithDriverText,
                      rideWithDriverMuted && styles.actionButtonRideWithDriverTextMuted,
                      styles.actionButtonCtaLabel,
                    ]}
                  >
                    {t("ride_with_driver_button")}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.actionButtonPrimaryFull}
            onPress={onStartNavigation}
            disabled={routeLoading}
            activeOpacity={0.85}
          >
            {routeLoading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="navigate-outline" size={20} color="#FFFFFF" />
                <Text style={styles.actionButtonPrimaryText}>
                  {t("start_navigation") || "Start Navigation"}
                </Text>
              </>
            )}
          </TouchableOpacity>
        ))}
    </View>
  );
}

import { StyleSheet } from "react-native";

/**
 * Action footer styles copied from RegularHomeScreen (pre-unification).
 * Do not change without matching Regular — shared across all role Home maps.
 */
export const placeDetailsActionButtonStyles = StyleSheet.create({
  actionButtonsBlock: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 10,
  },
  actionButtonsRowTop: {
    flexDirection: "row",
    gap: 8,
  },
  actionButtonsRowNavRide: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 8,
    width: "100%",
  },
  actionButtonSecondary: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F2F2F7",
    borderRadius: 24,
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 8,
    minHeight: 48,
  },
  actionButtonSecondaryText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0f5b63",
    textAlign: "center",
    flexShrink: 1,
  },
  actionButtonPrimary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0f5b63",
    borderRadius: 24,
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 8,
    minHeight: 50,
  },
  actionButtonPrimaryFull: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0f5b63",
    borderRadius: 24,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 8,
    width: "100%",
  },
  actionButtonPrimaryText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
    textAlign: "center",
    flexShrink: 1,
  },
  actionButtonPrimarySplit: {
    flex: 1,
    minWidth: 0,
  },
  actionButtonCtaLabel: {
    textAlign: "center",
    flexShrink: 1,
  },
  actionButtonRideWithDriver: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    borderRadius: 24,
    paddingVertical: 12,
    paddingHorizontal: 10,
    gap: 8,
    borderWidth: 2,
    borderColor: "#0f5b63",
    minHeight: 50,
  },
  actionButtonRideWithDriverText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0f5b63",
    textAlign: "center",
    flexShrink: 1,
  },
  actionButtonRideWithDriverMuted: {
    borderColor: "#c4c4c4",
    backgroundColor: "#f4f4f4",
    opacity: 0.92,
  },
  actionButtonRideWithDriverTextMuted: {
    color: "#888",
  },
});

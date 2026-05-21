import { StyleSheet } from "react-native";

const TEAL = "#0f5b63";
const DANGER = "#DC3545";

/**
 * Compact management actions for place details sheets (edit / delete).
 * Typography and radii align with `placeDetailsActionButtonStyles` (Regular baseline).
 */
export const placeDetailsManageActionStyles = StyleSheet.create({
  block: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 20,
    gap: 8,
  },
  row: {
    flexDirection: "row",
    gap: 8,
  },
  buttonBase: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 24,
    paddingVertical: 9,
    paddingHorizontal: 12,
    gap: 6,
    minHeight: 40,
  },
  editButton: {
    backgroundColor: "#F2F2F7",
    borderWidth: 1.5,
    borderColor: TEAL,
  },
  editButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: TEAL,
    textAlign: "center",
    flexShrink: 1,
  },
  deleteButton: {
    backgroundColor: "#FFF5F5",
    borderWidth: 1.5,
    borderColor: DANGER,
  },
  deleteButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: DANGER,
    textAlign: "center",
    flexShrink: 1,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  infoBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#e8f4f6",
    padding: 10,
    borderRadius: 12,
    gap: 8,
    borderLeftWidth: 4,
    borderLeftColor: TEAL,
  },
  infoBannerText: {
    flex: 1,
    fontSize: 13,
    color: "#0f5b63",
    lineHeight: 18,
  },
});

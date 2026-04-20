import { Dimensions, Platform, StyleSheet, TextStyle } from "react-native";

const SCREEN_WIDTH = Dimensions.get("window").width;

/** Reference: terracotta active state */
export const TAB_ACTIVE = "#C65C3D";
/** Reference: iOS-style inactive gray */
export const TAB_INACTIVE = "#8E8E93";

export const TAB_BAR_BG = "#FFFFFF";
/** Thin divider between content and tab bar (reference: light gray hairline) */
export const TAB_BAR_TOP_BORDER = "#E5E5EA";

export const TAB_ICON_SIZE = 24;

/** Reference: ~10–11pt labels */
export const TAB_LABEL_FONT_SIZE = 10;
export const TAB_LABEL_ACTIVE_WEIGHT: TextStyle["fontWeight"] = "700";
export const TAB_LABEL_INACTIVE_WEIGHT: TextStyle["fontWeight"] = "400";

/** Gap between icon and label (reference ~4–6px) */
export const TAB_ICON_LABEL_GAP = 5;

/** Vertical padding inside the bar (reference: comfortable top/bottom) */
export const TAB_BAR_PADDING_TOP = 10;
export const TAB_BAR_PADDING_BOTTOM = 6;

/** Reference: flat bar — no floating radius, no drop shadow */
export const TAB_BAR_RADIUS = 0;

/** Content row minimum height (icons + labels); safe area is added separately */
export const TAB_BAR_ROW_MIN_HEIGHT = 52;

export const tabBarLayout = StyleSheet.create({
  outer: {
    position: "absolute" as const,
    bottom: 0,
    left: 0,
    right: 0,
    width: SCREEN_WIDTH,
    backgroundColor: TAB_BAR_BG,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: TAB_BAR_TOP_BORDER,
    ...Platform.select({
      ios: {
        shadowOpacity: 0,
        shadowRadius: 0,
        shadowOffset: { width: 0, height: 0 },
      },
      android: {
        elevation: 0,
      },
      default: {},
    }),
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    minHeight: TAB_BAR_ROW_MIN_HEIGHT,
    paddingTop: TAB_BAR_PADDING_TOP,
    paddingBottom: TAB_BAR_PADDING_BOTTOM,
    paddingHorizontal: 0,
  },
  tabPressable: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-start",
  },
  iconBox: {
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    marginTop: TAB_ICON_LABEL_GAP,
    fontSize: TAB_LABEL_FONT_SIZE,
    textAlign: "center",
    width: "100%",
    paddingHorizontal: 2,
  },
  labelActive: {
    fontWeight: TAB_LABEL_ACTIVE_WEIGHT,
    color: TAB_ACTIVE,
  },
  labelInactive: {
    fontWeight: TAB_LABEL_INACTIVE_WEIGHT,
    color: TAB_INACTIVE,
  },
});

export type TabBarLabelKey =
  | "tab_map"
  | "tab_transport"
  | "tab_community"
  | "tab_profile"
  | "tab_my_business"
  | "tab_driver_requests"
  | "tab_admin_tools"
  | "tab_admin_users"
  | "tab_admin_new_users";

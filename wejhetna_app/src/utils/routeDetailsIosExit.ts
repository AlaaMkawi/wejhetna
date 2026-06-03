import AsyncStorage from "@react-native-async-storage/async-storage";
import { CommonActions } from "@react-navigation/native";
import type { NavigationProp } from "@react-navigation/native";
import type { RootStackParamList } from "../navigation/types";
import { Platform } from "react-native";
import { releaseMapOverlays } from "../components/map/mapOverlayStore";
import { logRouteDetailsMapExit } from "./routeDetailsMapExit";

export type HomeRootRoute = "UserTabs" | "AdminTabs";

export async function resolveHomeRootRoute(): Promise<HomeRootRoute> {
  try {
    const role = await AsyncStorage.getItem("userRole");
    return role === "ADMIN" ? "AdminTabs" : "UserTabs";
  } catch {
    return "UserTabs";
  }
}

/**
 * iOS: replace stack with Home tabs — avoids goBack() pop animation racing two MapLibre trees.
 */
export function dispatchIosResetToHomeMap(
  navigation: NavigationProp<RootStackParamList>,
  homeRoute: HomeRootRoute
): void {
  if (Platform.OS !== "ios") {
    return;
  }
  releaseMapOverlays();
  logRouteDetailsMapExit("resetToHome", { homeRoute });
  navigation.dispatch(
    CommonActions.reset({
      index: 0,
      routes: [{ name: homeRoute }],
    })
  );
}

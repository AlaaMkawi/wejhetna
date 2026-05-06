import { CommonActions } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/types";

/** Navigate to shared in-trip screen (root stack). Call from tab screens via `navigation.getParent()`. */
export function navigateToRideTripToDestination(
  navigation: NativeStackNavigationProp<RootStackParamList>,
  rideRequestId: number,
  options?: { showTripSuccessIntro?: boolean }
): void {
  navigation.navigate("RideTripToDestination", {
    rideRequestId,
    showTripSuccessIntro: options?.showTripSuccessIntro === true,
  });
}

/** Navigate to shared pickup-route screen (root stack). Driver sees full live nav, passenger is redirected to tracking map. */
export function navigateToRidePickupNavigation(
  navigation: NativeStackNavigationProp<RootStackParamList>,
  rideRequestId: number
): void {
  navigation.navigate("RidePickupNavigation", { rideRequestId });
}

/**
 * Root stack: open the correct ride tab (driver requests vs passenger transport).
 * `REGULAR` means the passenger/transport tab — same for regular users and business owners.
 */
export function navigateToUserRideRequestsTab(
  navigation: NativeStackNavigationProp<RootStackParamList>,
  role: "DRIVER" | "REGULAR"
): void {
  navigation.dispatch(
    CommonActions.navigate({
      name: "UserTabs",
      params: {
        screen: role === "DRIVER" ? "DriverRequests" : "RideTracking",
      },
    })
  );
}

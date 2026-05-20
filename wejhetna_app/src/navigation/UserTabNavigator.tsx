// src/navigation/UserTabNavigator.tsx

import React from "react";
import { View, TouchableOpacity, Text, Platform, ActivityIndicator } from "react-native";
import { createBottomTabNavigator, BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { useRoute, RouteProp } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { RootStackParamList } from "./types";
import {
  TAB_ACTIVE,
  TAB_INACTIVE,
  TAB_ICON_SIZE,
  tabBarLayout,
  TabBarLabelKey,
} from "./bottomTabBarVisuals";

import RegularHomeScreen from "../screens/RegularAccount/RegularHomeScreen";
import RegularRideStatusScreen from "../screens/RegularAccount/RegularRideStatusScreen";
import DriverHomeScreen from "../screens/DriverAccount/DriverHomeScreen";
import DriverRideScreen from "../screens/DriverAccount/DriverRideScreen";
import BusinessOwnerHomeScreen from "../screens/businessOwner/BusinessOwnerHomeScreen";
import AdvertisementsScreen from "../screens/AdvertisementsScreen";
import ProfileScreen from "../screens/ProfileScreen";
import ManageMyBusinessScreen from "../screens/businessOwner/ManageMyBusinessScreen";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { requestForegroundLocationPermission } from "../utils/locationPermission";
import {
  shouldRunLoginLocationPrompt,
  markLoginLocationPromptStarted,
} from "../utils/locationSession";

import Ionicons from "react-native-vector-icons/Ionicons";
import PassengerDriverCancelledListener from "../components/ride/PassengerDriverCancelledListener";
import PassengerDriverArrivedListener from "../components/ride/PassengerDriverArrivedListener";
import DriverRideCancellationListener from "../components/ride/DriverRideCancellationListener";
import RideTripStartListener from "../components/ride/RideTripStartListener";

const Tab = createBottomTabNavigator();

const USER_TAB_LABEL_KEY: Record<string, TabBarLabelKey> = {
  Home: "tab_map",
  RideTracking: "tab_transport",
  DriverRequests: "tab_driver_requests",
  ManageBusiness: "tab_my_business",
  AdvertisementsTab: "tab_community",
  Profile: "tab_profile",
};

type IconPair = { active: string; inactive: string };

function iconPairForRoute(name: string): IconPair {
  switch (name) {
    case "Home":
      return { active: "map", inactive: "map-outline" };
    case "RideTracking":
    case "DriverRequests":
      return { active: "car", inactive: "car-outline" };
    case "ManageBusiness":
      return { active: "storefront", inactive: "storefront-outline" };
    case "AdvertisementsTab":
      return { active: "megaphone", inactive: "megaphone-outline" };
    case "Profile":
      return { active: "person-circle", inactive: "person-circle-outline" };
    default:
      return { active: "ellipse", inactive: "ellipse-outline" };
  }
}

const CustomUserTabBar: React.FC<BottomTabBarProps> = ({ state, navigation }) => {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  return (
    <View style={[tabBarLayout.outer, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      <View style={tabBarLayout.row}>
        {state.routes.map((route, tabIndex) => {
          const { name } = route;
          const focused = state.index === tabIndex;
          const color = focused ? TAB_ACTIVE : TAB_INACTIVE;
          const { active, inactive } = iconPairForRoute(name);
          const labelKey = USER_TAB_LABEL_KEY[name];
          const label = labelKey ? t(labelKey) : name;

          const onPress = () => {
            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });

            if (!focused && !event.defaultPrevented) {
              navigation.navigate(name as never);
            }
          };

          return (
            <TouchableOpacity
              key={route.key}
              onPress={onPress}
              style={tabBarLayout.tabPressable}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityState={{ selected: focused }}
            >
              <View style={tabBarLayout.iconBox}>
                <Ionicons name={focused ? active : inactive} size={TAB_ICON_SIZE} color={color} />
              </View>
              <Text
                numberOfLines={2}
                adjustsFontSizeToFit
                minimumFontScale={0.85}
                style={[
                  tabBarLayout.label,
                  focused ? tabBarLayout.labelActive : tabBarLayout.labelInactive,
                  Platform.OS === "android" ? { fontFamily: "sans-serif" } : {},
                ]}
              >
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

type UserTabsRoute = RouteProp<RootStackParamList, "UserTabs">;

export default function UserTabNavigator() {
  const route = useRoute<UserTabsRoute>();
  const selectedPlaceIdFromParams = route.params?.selectedPlaceId;
  const [userRole, setUserRole] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    async function loadAndSaveUserData() {
      try {
        const role = await AsyncStorage.getItem("userRole");
        const userId = await AsyncStorage.getItem("userId");

        setUserRole(role);

        if (userId && role) {
          await AsyncStorage.setItem("userId", userId);
          await AsyncStorage.setItem("userRole", role);
        }
      } catch (error) {
        console.error("Error loading/saving user data:", error);
      } finally {
        setLoading(false);
      }
    }
    loadAndSaveUserData();
  }, []);

  React.useEffect(() => {
    if (!shouldRunLoginLocationPrompt()) {
      return;
    }
    markLoginLocationPromptStarted();
    requestForegroundLocationPermission().catch(() => {});
  }, []);

  const HomeScreenComponent = React.useMemo(() => {
    switch (userRole) {
      case "DRIVER":
        return DriverHomeScreen;
      case "BUSINESS_OWNER":
        return BusinessOwnerHomeScreen;
      case "REGULAR":
      default:
        return RegularHomeScreen;
    }
  }, [userRole]);

  // Do not mount MapView (Home tab) while role is loading. A placeholder Tab.Navigator here
  // used to mount RegularHomeScreen twice (loading navigator → role navigator), which crashes
  // iOS Fabric with "Attempt to mount already mounted component view" in MLNMapView.
  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color={TAB_ACTIVE} />
        <PassengerDriverCancelledListener />
        <PassengerDriverArrivedListener />
        <DriverRideCancellationListener />
        <RideTripStartListener />
      </View>
    );
  }

  const isBusinessOwner = userRole === "BUSINESS_OWNER";
  const isDriver = userRole === "DRIVER";

  return (
    <View style={{ flex: 1 }}>
      <Tab.Navigator
        id="UserTabs"
        tabBar={(props) => <CustomUserTabBar {...props} />}
        screenOptions={{
          headerShown: false,
          tabBarHideOnKeyboard: true,
          lazy: true,
          unmountOnBlur: true,
        }}
        initialRouteName="Home"
      >
        <Tab.Screen
          name="Home"
          component={HomeScreenComponent}
          initialParams={{ selectedPlaceId: selectedPlaceIdFromParams }}
        />
        {isBusinessOwner ? (
          <>
            <Tab.Screen name="RideTracking" component={RegularRideStatusScreen} />
            <Tab.Screen name="ManageBusiness" component={ManageMyBusinessScreen} />
          </>
        ) : isDriver ? (
          <Tab.Screen name="DriverRequests" component={DriverRideScreen} />
        ) : (
          <Tab.Screen name="RideTracking" component={RegularRideStatusScreen} />
        )}
        <Tab.Screen name="AdvertisementsTab" component={AdvertisementsScreen} />
        <Tab.Screen name="Profile" component={ProfileScreen} />
      </Tab.Navigator>
      <PassengerDriverCancelledListener />
      <PassengerDriverArrivedListener />
      <DriverRideCancellationListener />
      <RideTripStartListener />
    </View>
  );
}

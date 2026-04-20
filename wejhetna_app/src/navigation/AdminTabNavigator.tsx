// src/navigation/AdminTabNavigator.tsx

import React from "react";
import { View, TouchableOpacity, Text, Platform } from "react-native";
import { createBottomTabNavigator, BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { AdminTabParamList, RootStackParamList } from "./types";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import {
  TAB_ACTIVE,
  TAB_INACTIVE,
  TAB_ICON_SIZE,
  tabBarLayout,
  TabBarLabelKey,
} from "./bottomTabBarVisuals";

import AdminHomeScreen from "../screens/Admin/AdminHomeScreen";
import NewUsersScreen from "../screens/Admin/NewUsersScreen";
import UsersSelectorScreen from "../screens/Admin/UsersSelectorScreen";
import ProfileScreen from "../screens/ProfileScreen";
import AdvertisementsScreen from "../screens/AdvertisementsScreen";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { requestForegroundLocationPermission } from "../utils/locationPermission";
import {
  shouldRunLoginLocationPrompt,
  markLoginLocationPromptStarted,
} from "../utils/locationSession";

import Ionicons from "react-native-vector-icons/Ionicons";

type AdminTabsProps = NativeStackScreenProps<RootStackParamList, "AdminTabs">;

const Tab = createBottomTabNavigator<AdminTabParamList>();

const ADMIN_TAB_LABEL_KEY: Record<string, TabBarLabelKey> = {
  fitnessDummy: "tab_admin_tools",
  alreadyUsers: "tab_admin_users",
  AdminHome: "tab_map",
  newUsers: "tab_admin_new_users",
  AdvertisementsTab: "tab_community",
  profileDummy: "tab_profile",
};

type IconPair = { active: string; inactive: string };

function iconPairForRoute(name: keyof AdminTabParamList): IconPair {
  switch (name) {
    case "fitnessDummy":
      return { active: "build", inactive: "build-outline" };
    case "alreadyUsers":
      return { active: "people", inactive: "people-outline" };
    case "AdminHome":
      return { active: "map", inactive: "map-outline" };
    case "newUsers":
      return { active: "person-add", inactive: "person-add-outline" };
    case "AdvertisementsTab":
      return { active: "megaphone", inactive: "megaphone-outline" };
    case "profileDummy":
      return { active: "person-circle", inactive: "person-circle-outline" };
    default:
      return { active: "ellipse", inactive: "ellipse-outline" };
  }
}

const CustomAdminTabBar: React.FC<BottomTabBarProps> = ({ state, navigation }) => {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  return (
    <View style={[tabBarLayout.outer, { paddingBottom: Math.max(insets.bottom, 6) }]}>
      <View style={tabBarLayout.row}>
        {state.routes.map((route, index) => {
          const { name } = route;
          const focused = state.index === index;
          const color = focused ? TAB_ACTIVE : TAB_INACTIVE;
          const { active, inactive } = iconPairForRoute(name as keyof AdminTabParamList);
          const labelKey = ADMIN_TAB_LABEL_KEY[name];
          const label = labelKey ? t(labelKey) : name;

          const onPress = () => {
            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });

            if (!focused && !event.defaultPrevented) {
              navigation.navigate(name);
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
                minimumFontScale={0.8}
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

export default function AdminTabNavigator({ route }: AdminTabsProps) {
  const { adminUserId, role } = route.params;

  React.useEffect(() => {
    async function saveAdminData() {
      try {
        await AsyncStorage.setItem("userId", adminUserId.toString());
        await AsyncStorage.setItem("userRole", role);
      } catch (error) {
        console.error("Error saving admin data:", error);
      }
    }
    saveAdminData();
  }, [adminUserId, role]);

  React.useEffect(() => {
    if (!shouldRunLoginLocationPrompt()) {
      return;
    }
    markLoginLocationPromptStarted();
    requestForegroundLocationPermission().catch(() => {});
  }, []);

  return (
    <Tab.Navigator
      id="AdminTabs"
      tabBar={(props) => <CustomAdminTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
      }}
      initialRouteName="AdminHome"
    >
      <Tab.Screen
        name="fitnessDummy"
        component={UsersSelectorScreen}
        initialParams={{ adminUserId, role }}
      />
      <Tab.Screen
        name="alreadyUsers"
        component={UsersSelectorScreen}
        initialParams={{ adminUserId, role }}
      />
      <Tab.Screen
        name="AdminHome"
        component={AdminHomeScreen}
        initialParams={{
          adminUserId,
          role,
          selectedPlaceId: route.params?.selectedPlaceId,
        }}
      />
      <Tab.Screen name="newUsers" component={NewUsersScreen} initialParams={{ adminUserId, role }} />
      <Tab.Screen name="AdvertisementsTab" component={AdvertisementsScreen} />
      <Tab.Screen
        name="profileDummy"
        component={ProfileScreen}
        initialParams={{ userId: adminUserId } as any}
      />
    </Tab.Navigator>
  );
}

// src/navigation/UserTabNavigator.tsx

import React, { useEffect, useCallback } from 'react';
import { View, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { createBottomTabNavigator, BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { useRoute, RouteProp } from "@react-navigation/native";
import { RootStackParamList } from "./types";


import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  SharedValue,
} from 'react-native-reanimated';

import RegularHomeScreen from '../screens/RegularAccount/RegularHomeScreen';
import RegularRideStatusScreen from '../screens/RegularAccount/RegularRideStatusScreen';
import DriverHomeScreen from '../screens/DriverAccount/DriverHomeScreen';
import DriverRideScreen from '../screens/DriverAccount/DriverRideScreen';
import BusinessOwnerHomeScreen from '../screens/businessOwner/BusinessOwnerHomeScreen';
import AdvertisementsScreen from '../screens/AdvertisementsScreen';
import ProfileScreen from '../screens/ProfileScreen';
import ManageMyBusinessScreen from '../screens/businessOwner/ManageMyBusinessScreen';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { requestForegroundLocationPermission } from '../utils/locationPermission';
import {
  shouldRunLoginLocationPrompt,
  markLoginLocationPromptStarted,
} from '../utils/locationSession';

import Ionicons from 'react-native-vector-icons/Ionicons';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const Tab = createBottomTabNavigator();

// Colors - matching the provided design
const TAB_COLOR = "#fff";
const INACTIVE_ICON_COLOR = "#0f5b63"; // Gray color for inactive icons on white background
// Colors from app logo gradient
const HOME_ICON_COLOR = "#0f5b63"; // blue-cyan from logo
const SEARCH_ICON_COLOR = "#0f5b63"; // green from logo
const PROFILE_ICON_COLOR = "#0f5b63"; // pink-magenta from logo

const INDICATOR_WIDTH = 80; // 4em equivalent
const INDICATOR_HEIGHT = 6; // 0.4em equivalent
const ANIMATION_DURATION = 300;
const WHITE_COLOR = "#fff";

const ICONS_MAP: { [key: string]: { name: string; color: string } } = {
  Home: { name: 'home', color: HOME_ICON_COLOR },
  RideTracking: { name: 'navigate', color: SEARCH_ICON_COLOR },
  DriverRequests: { name: 'car-sport', color: SEARCH_ICON_COLOR },
  ManageBusiness: { name: 'business', color: HOME_ICON_COLOR },
  AdvertisementsTab: { name: 'megaphone', color: HOME_ICON_COLOR },
  Profile: { name: 'person', color: PROFILE_ICON_COLOR },
};

const MovingIndicator = ({ 
  translateX, 
  indicatorColor 
}: { 
  translateX: SharedValue<number>;
  indicatorColor: string;
}) => {
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  // Convert hex to rgba for glow effect
  const hexToRgba = (hex: string, alpha: number) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  return (
    <Animated.View style={[styles.indicatorContainer, animatedStyle]}>
      <View style={[styles.indicatorBar, { backgroundColor: indicatorColor }]} />
      {/* Subtle glow effect - soft light descending from indicator */}
      <View style={[styles.glowLayer1, { backgroundColor: hexToRgba(indicatorColor, 0.25) }]} />
      <View style={[styles.glowLayer2, { backgroundColor: hexToRgba(indicatorColor, 0.15) }]} />
      <View style={[styles.glowLayer3, { backgroundColor: hexToRgba(indicatorColor, 0.08) }]} />
    </Animated.View>
  );
};

const CustomUserTabBar: React.FC<BottomTabBarProps> = ({ state, navigation }) => {
  const tabWidth = SCREEN_WIDTH / state.routes.length;
  
  const getTargetPosition = useCallback(
    (index: number) => {
      const tabCenter = tabWidth * index + tabWidth / 2;
      return tabCenter - INDICATOR_WIDTH / 2;
    },
    [tabWidth]
  );

  // Initialize with the correct starting position
  const initialPosition = getTargetPosition(state.index);
  const translateX = useSharedValue(initialPosition);
  const [indicatorColor, setIndicatorColor] = React.useState(() => {
    const activeRoute = state.routes[state.index];
    return ICONS_MAP[activeRoute.name]?.color || HOME_ICON_COLOR;
  });

  useEffect(() => {
    const target = getTargetPosition(state.index);
    const activeRoute = state.routes[state.index];
    const activeColor = ICONS_MAP[activeRoute.name]?.color || HOME_ICON_COLOR;

    translateX.value = withTiming(-target, {
      duration: ANIMATION_DURATION,
      easing: Easing.ease,
    });
    
    setIndicatorColor(activeColor);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.index, getTargetPosition, translateX]);

  return (
    <View style={styles.tabBarWrapper}>
      <View style={styles.tabBarBackground}>
        <MovingIndicator translateX={translateX} indicatorColor={indicatorColor} />

        {state.routes.map((route, index) => {
          const { name } = route;
          const focused = state.index === index;

          const { name: iconName, color: iconColor } = ICONS_MAP[name] || { name: 'ellipse', color: WHITE_COLOR };

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });

            if (!focused && !event.defaultPrevented) {
              navigation.navigate(name as never);
            }
          };

          // For Profile and ManageBusiness tabs, use different icon names
          let displayIconName = focused ? iconName : `${iconName}-outline`;
          if (name === 'Profile') {
            displayIconName = focused ? 'person' : 'person-outline';
          } else if (name === 'ManageBusiness') {
            displayIconName = focused ? 'business' : 'business-outline';
          } else if (iconName.endsWith('-outline')) {
            // Prevent invalid names like "xxx-outline-outline" which show a ? icon.
            displayIconName = iconName;
          }

          return (
            <TouchableOpacity
              key={route.key}
              onPress={onPress}
              style={styles.tabItem}
              activeOpacity={0.8}
            >
              <View style={styles.iconWrapper}>
                <Ionicons
                  name={displayIconName}
                  size={40}
                  color={focused ? iconColor : INACTIVE_ICON_COLOR}
                  style={[
                    focused ? styles.activeIcon : styles.inactiveIcon,
                    focused && { shadowColor: iconColor },
                  ]}
                />
              </View>
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

  // Get user role and userId from AsyncStorage and ensure they are saved
  React.useEffect(() => {
    async function loadAndSaveUserData() {
      try {
        const role = await AsyncStorage.getItem("userRole");
        const userId = await AsyncStorage.getItem("userId");
        
        setUserRole(role);
        
        // Ensure userId and role are saved (in case they weren't saved during login)
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

  // Determine which home screen to use based on role
  const HomeScreenComponent = React.useMemo(() => {
    if (loading) return RegularHomeScreen; // Default while loading
    
    switch (userRole) {
      case "DRIVER":
        return DriverHomeScreen;
      case "BUSINESS_OWNER":
        return BusinessOwnerHomeScreen;
      case "REGULAR":
      default:
        return RegularHomeScreen;
    }
  }, [userRole, loading]);

  if (loading) {
    // Return a loading state or default screen while loading
    return (
      <Tab.Navigator
        id="UserTabs"
        tabBar={(props) => <CustomUserTabBar {...props} />}
        screenOptions={{
          headerShown: false,
          tabBarHideOnKeyboard: true,
        }}
        initialRouteName="Home"
      >
        <Tab.Screen
          name="Home"
          component={RegularHomeScreen}
        />
        <Tab.Screen
          name="RideTracking"
          component={RegularRideStatusScreen}
        />
        <Tab.Screen
          name="AdvertisementsTab"
          component={AdvertisementsScreen}
        />
        <Tab.Screen
          name="Profile"
          component={ProfileScreen}
        />
      </Tab.Navigator>
    );
  }

  // Determine tabs based on user role
  const isBusinessOwner = userRole === "BUSINESS_OWNER";
  const isDriver = userRole === "DRIVER";

  return (
    <Tab.Navigator
      id="UserTabs"
      tabBar={(props) => <CustomUserTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
      }}
      initialRouteName="Home"
    >
      <Tab.Screen
        name="Home"
        component={HomeScreenComponent}
        initialParams={{ selectedPlaceId: selectedPlaceIdFromParams }}
      />
      {isBusinessOwner ? (
        <Tab.Screen
          name="ManageBusiness"
          component={ManageMyBusinessScreen}
        />
      ) : isDriver ? (
        <Tab.Screen
          name="DriverRequests"
          component={DriverRideScreen}
        />
      ) : (
        <Tab.Screen
          name="RideTracking"
          component={RegularRideStatusScreen}
        />
      )}
      <Tab.Screen
        name="AdvertisementsTab"
        component={AdvertisementsScreen}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBarWrapper: {
    position: 'absolute',
    bottom: 0,
    width: SCREEN_WIDTH,
    height: 80,
    backgroundColor: 'transparent',
  },
  tabBarBackground: {
    flexDirection: 'row',
    height: 80,
    width: SCREEN_WIDTH,
    backgroundColor: TAB_COLOR,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    position: 'absolute',
    bottom: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    elevation: 10,
    alignItems: 'center',
    overflow: 'hidden',
  },
  tabItem: {
    justifyContent: 'center',
    alignItems: 'center',
    flex: 1,
    height: '100%',
  },
  iconWrapper: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  inactiveIcon: {
    opacity: 0.5,
  },
  activeIcon: {
    opacity: 1,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 15,
    elevation: 0,
  },
  indicatorContainer: {
    position: 'absolute',
    top: 0,
    width: INDICATOR_WIDTH,
    height: 80,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  indicatorBar: {
    width: '100%',
    height: INDICATOR_HEIGHT,
    backgroundColor: HOME_ICON_COLOR,
    borderRadius: 2,
  },
  glowLayer1: {
    position: 'absolute',
    top: INDICATOR_HEIGHT,
    width: 50,
    height: 50,
    opacity: 0.5,
    borderRadius: 25,
  },
  glowLayer2: {
    position: 'absolute',
    top: INDICATOR_HEIGHT + 15,
    width: 65,
    height: 40,
    opacity: 0.4,
    borderRadius: 20,
  },
  glowLayer3: {
    position: 'absolute',
    top: INDICATOR_HEIGHT + 30,
    width: 75,
    height: 30,
    opacity: 0.3,
    borderRadius: 15,
  },
});


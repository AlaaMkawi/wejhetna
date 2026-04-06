// src/navigation/AdminTabNavigator.tsx

import React, { useEffect, useCallback } from 'react';
import { View, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { createBottomTabNavigator, BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { AdminTabParamList, RootStackParamList } from "./types";
import { NativeStackScreenProps } from "@react-navigation/native-stack";

import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  SharedValue,
} from 'react-native-reanimated';

import AdminHomeScreen from '../screens/Admin/AdminHomeScreen';
import NewUsersScreen from '../screens/Admin/NewUsersScreen';
import UsersSelectorScreen from '../screens/Admin/UsersSelectorScreen';
import ProfileScreen from '../screens/ProfileScreen';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { requestForegroundLocationPermission } from '../utils/locationPermission';
import {
  shouldRunLoginLocationPrompt,
  markLoginLocationPromptStarted,
} from '../utils/locationSession';

import Feather from 'react-native-vector-icons/Feather';
import Ionicons from 'react-native-vector-icons/Ionicons';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type AdminTabsProps = NativeStackScreenProps<RootStackParamList, "AdminTabs">;

const Tab = createBottomTabNavigator<AdminTabParamList>();

// Colors - matching the provided design
const TAB_COLOR = "#fff";
const INACTIVE_ICON_COLOR = "#666"; // Gray color for inactive icons on white background
// Colors from app logo gradient
const TOOL_ICON_COLOR = "#0f5b63"; // blue-cyan from logo
const USERS_ICON_COLOR = "#0f5b63"; // green from logo
const LOCATION_ICON_COLOR = "#0f5b63"; // yellow-gold from logo
const NEW_USERS_ICON_COLOR = "#0f5b63"; // orange from logo
const PROFILE_ICON_COLOR = "#0f5b63"; // pink-magenta from logo

const INDICATOR_WIDTH = 80;
const INDICATOR_HEIGHT = 6;
const ANIMATION_DURATION = 300;

const ICONS_MAP: { [key: string]: { name: string; Library: any; color: string } } = {
  fitnessDummy: { name: 'tool', Library: Feather, color: TOOL_ICON_COLOR },
  alreadyUsers: { name: 'users', Library: Feather, color: USERS_ICON_COLOR },
  AdminHome: { name: 'location-sharp', Library: Ionicons, color: LOCATION_ICON_COLOR },
  newUsers: { name: 'user-plus', Library: Feather, color: NEW_USERS_ICON_COLOR },
  profileDummy: { name: 'person', Library: Ionicons, color: PROFILE_ICON_COLOR },
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

const CustomAdminTabBar: React.FC<BottomTabBarProps> = ({ state, navigation }) => {
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
    return ICONS_MAP[activeRoute.name]?.color || LOCATION_ICON_COLOR;
  });

  useEffect(() => {
    const target = getTargetPosition(state.index);
    const activeRoute = state.routes[state.index];
    const activeColor = ICONS_MAP[activeRoute.name]?.color || LOCATION_ICON_COLOR;

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

          const { name: iconName, Library: Icon, color: iconColor } = ICONS_MAP[name];

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
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
              style={styles.tabItem}
              activeOpacity={0.8}
            >
              <View style={styles.iconWrapper}>
                <Icon
                  name={iconName}
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

export default function AdminTabNavigator({ route }: AdminTabsProps) {
  const { adminUserId, role } = route.params;

  // Save admin user ID and role to AsyncStorage when navigating to admin panel
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
      <Tab.Screen
        name="newUsers"
        component={NewUsersScreen}
        initialParams={{ adminUserId, role }}
      />
      <Tab.Screen
        name="profileDummy"
        component={ProfileScreen}
        initialParams={{ userId: adminUserId } as any}
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
    backgroundColor: LOCATION_ICON_COLOR,
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

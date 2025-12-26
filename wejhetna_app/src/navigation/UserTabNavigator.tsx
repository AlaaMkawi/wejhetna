// src/navigation/UserTabNavigator.tsx

import React, { useEffect, useCallback } from 'react';
import { View, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { createBottomTabNavigator, BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { RootStackParamList } from "./types";
import { NativeStackScreenProps } from "@react-navigation/native-stack";

import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  SharedValue,
} from 'react-native-reanimated';

import RegularHomeScreen from '../screens/RegularAccount/RegularHomeScreen';
import DriverHomeScreen from '../screens/DriverAccount/DriverHomeScreen';
import BusinessOwnerHomeScreen from '../screens/businessOwner/BusinessOwnerHomeScreen';
import ProfileScreen from '../screens/ProfileScreen';
import AsyncStorage from '@react-native-async-storage/async-storage';

import Ionicons from 'react-native-vector-icons/Ionicons';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type UserTabsProps = NativeStackScreenProps<RootStackParamList, "UserTabs">;

const Tab = createBottomTabNavigator();

const DARK_TEAL = "#0f5b63";
const SOFT_TEAL = "#3a8d96";
const MINT = "#9bd3d8";
const INDICATOR_SIZE = SCREEN_WIDTH / 3;
const ANIMATION_DURATION = 350;

const ICONS_MAP: { [key: string]: { name: string } } = {
  Home: { name: 'home' },
  Search: { name: 'search' },
  Profile: { name: 'person' },
};

const MovingIndicator = ({ translateX }: { translateX: SharedValue<number> }) => {
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <Animated.View style={[styles.indicatorContainer, animatedStyle]}>
      <View style={styles.indicatorBackground} />
    </Animated.View>
  );
};

const CustomUserTabBar: React.FC<BottomTabBarProps> = ({ state, navigation }) => {
  const tabWidth = SCREEN_WIDTH / state.routes.length;
  const translateX = useSharedValue(0);

  const getTargetPosition = useCallback(
    (index: number) => tabWidth * index + (tabWidth / 2 - INDICATOR_SIZE / 2),
    [tabWidth]
  );

  useEffect(() => {
    const target = getTargetPosition(state.index);

    translateX.value = withTiming(target, {
      duration: ANIMATION_DURATION,
      easing: Easing.out(Easing.back(0.9)),
    });
  }, [state.index, getTargetPosition, translateX]);

  return (
    <View style={styles.tabBarWrapper}>
      <View style={styles.tabBarBackground}>
        <MovingIndicator translateX={translateX} />

        {state.routes.map((route, index) => {
          const { name } = route;
          const focused = state.index === index;

          const { name: iconName } = ICONS_MAP[name] || { name: 'ellipse' };

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

          // For Profile tab, use different icon names - ensure it's always visible
          let displayIconName = focused ? iconName : `${iconName}-outline`;
          if (name === 'Profile') {
            // Use simpler, more reliable icon names
            displayIconName = focused ? 'person' : 'person-outline';
          }

          return (
            <TouchableOpacity
              key={route.key}
              onPress={onPress}
              style={[styles.tabItem, { width: tabWidth }]}
              activeOpacity={0.8}
            >
              <View style={focused ? styles.activeIconWrapper : styles.inactiveIconWrapper}>
                {/* Multiple shadow layers for strong visibility */}
                {focused && (
                  <>
                    {/* Outer dark shadow */}
                    <Ionicons
                      name={displayIconName}
                      size={36}
                      color="#000000"
                      style={styles.iconShadowOuter}
                    />
                    {/* Middle shadow */}
                    <Ionicons
                      name={displayIconName}
                      size={35}
                      color={DARK_TEAL}
                      style={styles.iconShadowMiddle}
                    />
                  </>
                )}
                {/* Active icon with app color (mint) on top */}
                <Ionicons
                  name={displayIconName}
                  size={focused ? 34 : 26}
                  color={focused ? MINT : DARK_TEAL}
                  style={focused ? styles.activeIcon : styles.inactiveIcon}
                />
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

export default function UserTabNavigator() {
  const [userRole, setUserRole] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  // Get user role from AsyncStorage
  React.useEffect(() => {
    async function loadUserRole() {
      try {
        const role = await AsyncStorage.getItem("userRole");
        setUserRole(role);
      } catch (error) {
        console.error("Error loading user role:", error);
      } finally {
        setLoading(false);
      }
    }
    loadUserRole();
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
          name="Search"
          component={RegularHomeScreen}
        />
        <Tab.Screen
          name="Profile"
          component={ProfileScreen}
        />
      </Tab.Navigator>
    );
  }

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
      />
      <Tab.Screen
        name="Search"
        component={HomeScreenComponent}
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
    height: 90,
    backgroundColor: 'transparent',
  },
  tabBarBackground: {
    flexDirection: 'row',
    height: 70,
    width: '100%',
    backgroundColor: '#FFF',
    position: 'absolute',
    bottom: 0,
    borderTopLeftRadius: 25,
    borderTopRightRadius: 25,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 10,
  },
  tabItem: {
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  inactiveIconWrapper: {
    paddingTop: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  inactiveIcon: {
    // No special styling needed
  },
  activeIconWrapper: {
    // Keep icon in same position as inactive icons - no jumping up
    paddingTop: 10,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  activeIcon: {
    // Mint color icon on top of shadow layers
    zIndex: 13,
    position: 'relative',
  },
  iconShadowOuter: {
    // Outer black shadow for strong contrast
    position: 'absolute',
    top: 10, // Match paddingTop: 10
    left: 2,
    zIndex: 11,
    opacity: 0.5,
  },
  iconShadowMiddle: {
    // Middle dark teal shadow
    position: 'absolute',
    top: 10, // Match paddingTop: 10
    left: 1,
    zIndex: 12,
    opacity: 0.7,
  },
  indicatorContainer: {
    position: 'absolute',
    bottom: 10,
    width: INDICATOR_SIZE,
    height: INDICATOR_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  indicatorBackground: {
    width: '100%',
    height: '100%',
    backgroundColor: DARK_TEAL,
    borderRadius: INDICATOR_SIZE / 2,
    transform: [{ scaleY: 1.1 }],
  },
});


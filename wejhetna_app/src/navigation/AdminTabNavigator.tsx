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

import Feather from 'react-native-vector-icons/Feather';
import Ionicons from 'react-native-vector-icons/Ionicons';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type AdminTabsProps = NativeStackScreenProps<RootStackParamList, "AdminTabs">;

const Tab = createBottomTabNavigator<AdminTabParamList>();

const INDICATOR_SIZE = SCREEN_WIDTH / 6;
const ANIMATION_DURATION = 350;

const ICONS_MAP: { [key: string]: { name: string; Library: any } } = {
  fitnessDummy: { name: 'tool', Library: Feather },
  alreadyUsers: { name: 'users', Library: Feather },
  AdminHome: { name: 'location-sharp', Library: Ionicons },
  newUsers: { name: 'user-plus', Library: Feather },
  profileDummy: { name: 'bell', Library: Feather },
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

const CustomAdminTabBar: React.FC<BottomTabBarProps> = ({ state, navigation }) => {
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

          const { name: iconName, Library: Icon } = ICONS_MAP[name];

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
              style={[styles.tabItem, { width: tabWidth }]}
              activeOpacity={0.8}
            >
              <Icon
                name={iconName}
                size={24}
                color={focused ? '#FFF' : '#5E5A8A'}
                style={focused ? styles.activeIcon : styles.inactiveIcon}
              />
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

export default function AdminTabNavigator({ route }: AdminTabsProps) {
  const { adminUserId, role } = route.params;

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
        initialParams={{ adminUserId, role }}
      />
      <Tab.Screen
        name="newUsers"
        component={NewUsersScreen}
        initialParams={{ adminUserId, role }}
      />
      <Tab.Screen
        name="profileDummy"
        component={NewUsersScreen}
        initialParams={{ adminUserId, role }}
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
    height: 65,
    width: '100%',
    backgroundColor: '#FFF',
    position: 'absolute',
    bottom: 0,
    borderTopLeftRadius: 25,
    borderTopRightRadius: 25,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -5 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 10,
  },
  tabItem: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  inactiveIcon: {
    paddingTop: 10,
  },
  activeIcon: {
    position: 'absolute',
    top: -10,
    zIndex: 2,
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
    backgroundColor: '#ED1C7B',
    borderRadius: INDICATOR_SIZE / 2,
    transform: [{ scaleY: 1.1 }],
  },
});

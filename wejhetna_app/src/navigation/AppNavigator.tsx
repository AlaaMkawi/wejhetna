import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import HomeScreen from "../screens/HomeScreen";
import SignUpScreen from "../screens/SignUpScreen";
import { RootStackParamList } from "./types";
import AdminLoginScreen from "../screens/AdminLoginScreen";
import AdminDriversScreen from "../screens/AdminDriversScreen";
import UserLoginScreen from "../screens/UserLoginScreen";


const Stack = createNativeStackNavigator<RootStackParamList>();

export default function AppNavigator() {
  return (
    <Stack.Navigator
      id="RootStack"          // מזהה נחמד ל־navigator (פותח את השגיאה)
      initialRouteName="Home"
    >
      <Stack.Screen
        name="Home"
        component={HomeScreen}
        options={{ title: "Wejhetna Map" }}
      />

      <Stack.Screen
        name="SignUp"
        component={SignUpScreen}
        options={{ title: "Sign Up" }}
      />
      <Stack.Screen
        name="AdminLogin"
        component={AdminLoginScreen}
        options={{ title: "Admin Login" }}
      />

      <Stack.Screen
        name="AdminDrivers"
        component={AdminDriversScreen}
        options={{ title: "Pending Drivers" }}
      />
      
      <Stack.Screen
        name="UserLogin"
        component={UserLoginScreen}
        options={{ title: "User Login" }}
      />
    </Stack.Navigator>
       
  );
}

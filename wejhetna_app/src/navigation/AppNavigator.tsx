import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import HomeScreen from "../screens/HomeScreen";
import SignUpScreen from "../screens/SignUpScreen";
import { RootStackParamList } from "./types";
import AdminLoginScreen from "../screens/AdminLoginScreen";
import AdminDriversScreen from "../screens/AdminDriversScreen";
import UserLoginScreen from "../screens/UserLoginScreen";
import AdminTabNavigator from "./AdminTabNavigator";
import AdminCitiesScreen from "../screens/AdminCitiesScreen";
import AdminCategoriesScreen from "../screens/AdminCategoriesScreen";
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

{/* --- שינוי 2: הוספת ה-Tab Navigator המותאם אישית --- */}
      <Stack.Screen
        name="AdminPanel" // שם חדש שמייצג את כל פאנל הניהול עם הטאבים
        component={AdminTabNavigator} // משתמשים בקומפוננטה המכילה את סרגל הניווט התחתון
        options={{ 
            headerShown: false, // חשוב להסתיר את ה-Header הרגיל של ה-Stack
            title: "Admin Panel" 
        }}
      />
            {/* 🔹 מסך ניהול ערים */}
      <Stack.Screen
        name="AdminCities"
        component={AdminCitiesScreen}
        options={{ title: "Manage Cities" }}
      />

      {/* 🔹 מסך ניהול קטגוריות */}
      <Stack.Screen
        name="AdminCategories"
        component={AdminCategoriesScreen}
        options={{ title: "Manage Categories" }}
      />
    </Stack.Navigator>
       
  );
}

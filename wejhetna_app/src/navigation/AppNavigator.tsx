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
import AdminPlaceFormScreen from "../screens/Admin/AdminPlaceFormScreen";
import AdminPlaceMapPickerScreen from "../screens/Admin/AdminPlaceMapPickerScreen";
import LoginScreen from "../screens/LoginScreen";
import AdminHomeScreen from "../screens/AdminHomeScreen";
import RegularHomeScreen from "../screens/RegularAccount/RegularHomeScreen";
import AdminDriverDetailsScreen from "../screens/AdminDriverDetailsScreen";

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
        options={{ headerShown: false }}
      />

      <Stack.Screen
        name="SignUp"
        component={SignUpScreen}
  options={{ headerShown: false }}
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
        options={{ headerShown: false }}
      />

{/* --- שינוי 2: הוספת ה-Tab Navigator המותאם אישית --- */}
      <Stack.Screen
        name="AdminTabs" // שם חדש שמייצג את כל פאנל הניהול עם הטאבים
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
      <Stack.Screen
        name="AdminPlaceForm"
        component={AdminPlaceFormScreen}
        options={{ title: "הוספת מקום חדש" }}
      />
      <Stack.Screen
        name="AdminPlaceMapPicker"
        component={AdminPlaceMapPickerScreen}
        options={{ title: "בחירת מיקום על המפה" }}
      />
      <Stack.Screen
        name="Login"
        component={LoginScreen}
        options={{ headerShown: false }}
      />

     <Stack.Screen
        name="AdminHomeScreen"
        component={AdminHomeScreen}
        options={{ title: "Admin Home" }}
      />
      <Stack.Screen
  name="RegularHome"
  component={RegularHomeScreen}
  options={{ headerShown: false }}
/>
      <Stack.Screen
  name="AdminDriverDetails"
  component={AdminDriverDetailsScreen}
  options={{ title: "Driver details" }}
/>




      </Stack.Navigator>



       
  );
}
import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import HomeScreen from "../screens/HomeScreen";
import SignUpScreen from "../screens/SignUpScreen";
import { RootStackParamList } from "./types";
import AdminLoginScreen from "../screens/AdminLoginScreen";
import AdminDriversScreen from "../screens/Admin/AdminDriversScreen";
import UserLoginScreen from "../screens/UserLoginScreen";
import AdminTabNavigator from "./AdminTabNavigator";
import AdminCitiesScreen from "../screens//Admin/AdminCitiesScreen";
import AdminCategoriesScreen from "../screens/Admin/AdminCategoriesScreen";
import AdminPlaceFormScreen from "../screens/Admin/AdminPlaceFormScreen";
import AdminPlaceMapPickerScreen from "../screens/Admin/AdminPlaceMapPickerScreen";
import LoginScreen from "../screens/LoginScreen";
import AdminHomeScreen from "../screens/Admin/AdminHomeScreen";
import RegularHomeScreen from "../screens/RegularAccount/RegularHomeScreen";
import AdminDriverDetailsScreen from "../screens/Admin/AdminDriverDetailsScreen";
import AdminBusinessOwnerRequestsScreen from "../screens/Admin/AdminBusinessOwnerRequestsScreen";
import AdminBusinessOwnerRequestDetailsScreen from "../screens/Admin/AdminBusinessOwnerRequestDetailsScreen";
import BusinessOwnerSignupScreen from "../screens/businessOwner/BusinessOwnerSignupScreen";
import BusinessOwnerPickLocationScreen from "../screens/businessOwner/BusinessOwnerPickLocationScreen";
import BusinessOwnerDetailsFormScreen from "../screens/businessOwner/BusinessOwnerDetailsFormScreen";
import ExistingUsersScreen from "../screens/Admin/ExistingUsersScreen";
import RejectedUsersScreen from "../screens/Admin/RejectedUsersScreen";
import VerifyEmailScreen from "../screens/VerifyEmailScreen";
import EnterEmailScreen from "../screens/EnterEmailScreen";
import RegularSignupForm from "../screens/RegularSignupForm";

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
      <Stack.Screen name="EnterEmail" component={EnterEmailScreen} />
      <Stack.Screen name="VerifyEmail" component={VerifyEmailScreen} />
      <Stack.Screen name="RegularSignup" component={RegularSignupForm} />


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

<Stack.Screen
  name="AdminBusinessOwnerRequests"
  component={AdminBusinessOwnerRequestsScreen}
  options={{ title: "Business Owner Requests" }}
/>

<Stack.Screen
  name="AdminBusinessOwnerRequestDetails"
  component={AdminBusinessOwnerRequestDetailsScreen}
  options={{ title: "Request Details" }}
/>

<Stack.Screen
  name="BusinessOwnerSignup"
  component={BusinessOwnerSignupScreen}
  options={{ title: "Business Owner Signup" }}
/>

<Stack.Screen
  name="BusinessOwnerPickLocation"
  component={BusinessOwnerPickLocationScreen}
  options={{ title: "Pick Location" }}
/>

<Stack.Screen
  name="BusinessOwnerDetailsForm"
  component={BusinessOwnerDetailsFormScreen}
  options={{ title: "Business Details" }}
/>

<Stack.Screen
  name="ExistingUsers"
  component={ExistingUsersScreen}
  options={{ title: "Existing Users" }}
/>

<Stack.Screen
  name="RejectedUsers"
  component={RejectedUsersScreen}
  options={{ title: "Rejected Users" }}
/>

      </Stack.Navigator>



       
  );
}
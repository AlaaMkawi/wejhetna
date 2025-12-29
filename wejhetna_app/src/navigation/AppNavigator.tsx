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
import EditPlaceScreen from "../screens/EditPlaceScreen";
import ExistingUsersScreen from "../screens/Admin/ExistingUsersScreen";
import RejectedUsersScreen from "../screens/Admin/RejectedUsersScreen";
import UserDetailsScreen from "../screens/Admin/UserDetailsScreen";
import VerifyEmailScreen from "../screens/VerifyEmailScreen";
import EnterEmailScreen from "../screens/EnterEmailScreen";
import RegularSignupScreen from "../screens/RegularSignupScreen";
import DriverSignupScreen from "../screens/DriverSignupScreen";
import ForgotPasswordEnterEmailScreen from "../screens/ForgotPasswordEnterEmailScreen";
import ForgotPasswordVerifyCodeScreen from "../screens/ForgotPasswordVerifyCodeScreen";
import ResetPasswordScreen from "../screens/ResetPasswordScreen";
import ProfileScreen from "../screens/ProfileScreen";
import SavedPlacesScreen from "../screens/SavedPlacesScreen";
import UserTabNavigator from "./UserTabNavigator";
import ManageMyBusinessScreen from "../screens/businessOwner/ManageMyBusinessScreen";

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
        options={{ headerShown: false }}
      />
      
      <Stack.Screen
        name="UserLogin"
        component={UserLoginScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen name="EnterEmail" component={EnterEmailScreen} />
      <Stack.Screen name="VerifyEmail" component={VerifyEmailScreen} />
      <Stack.Screen 
        name="RegularSignup" 
        component={RegularSignupScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen 
        name="DriverSignup" 
        component={DriverSignupScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen 
        name="ForgotPasswordEnterEmail" 
        component={ForgotPasswordEnterEmailScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen 
        name="ForgotPasswordVerifyCode" 
        component={ForgotPasswordVerifyCodeScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen 
        name="ResetPassword" 
        component={ResetPasswordScreen}
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
        options={{ headerShown: false }}
      />

      {/* 🔹 מסך ניהול קטגוריות */}
      <Stack.Screen
        name="AdminCategories"
        component={AdminCategoriesScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="AdminPlaceForm"
        component={AdminPlaceFormScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="AdminPlaceMapPicker"
        component={AdminPlaceMapPickerScreen}
        options={{ headerShown: false }}
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
        name="UserTabs"
        component={UserTabNavigator}
        options={{ headerShown: false }}
      />
      <Stack.Screen
  name="AdminDriverDetails"
  component={AdminDriverDetailsScreen}
  options={{ headerShown: false }}
/>

<Stack.Screen
  name="AdminBusinessOwnerRequests"
  component={AdminBusinessOwnerRequestsScreen}
  options={{ headerShown: false }}
/>

<Stack.Screen
  name="AdminBusinessOwnerRequestDetails"
  component={AdminBusinessOwnerRequestDetailsScreen}
  options={{ headerShown: false }}
/>

<Stack.Screen
  name="BusinessOwnerSignup"
  component={BusinessOwnerSignupScreen}
  options={{ headerShown: false }}
/>

      <Stack.Screen
        name="BusinessOwnerPickLocation"
        component={BusinessOwnerPickLocationScreen}
        options={{ headerShown: false }}
      />

<Stack.Screen
  name="BusinessOwnerDetailsForm"
  component={BusinessOwnerDetailsFormScreen}
  options={{ headerShown: false }}
/>

<Stack.Screen
  name="EditPlace"
  component={EditPlaceScreen}
  options={{ headerShown: false }}
/>

<Stack.Screen
  name="ExistingUsers"
  component={ExistingUsersScreen}
  options={{ headerShown: false }}
/>

<Stack.Screen
  name="RejectedUsers"
  component={RejectedUsersScreen}
  options={{ headerShown: false }}
/>

<Stack.Screen
  name="UserDetails"
  component={UserDetailsScreen}
  options={{ headerShown: false }}
/>

<Stack.Screen
  name="Profile"
  component={ProfileScreen}
  options={{ headerShown: false }}
/>

<Stack.Screen
  name="SavedPlaces"
  component={SavedPlacesScreen}
  options={{ headerShown: false }}
/>

<Stack.Screen
  name="ManageMyBusiness"
  component={ManageMyBusinessScreen}
  options={{ headerShown: false }}
/>

      </Stack.Navigator>



       
  );
}
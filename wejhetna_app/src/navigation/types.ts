// src/navigation/types.ts
import type { DriverApplication } from "../screens/AdminDriversScreen";

export type RootStackParamList = {
  Home: undefined;
  SignUp: undefined;
  AdminLogin: undefined;
  AdminDrivers: { adminUserId: number };
  UserLogin: { mode: "REGULAR" | "DRIVER" };
  AdminPanel: undefined;
  AdminHomeScreen: undefined;
  Login: undefined;
  RegularHome: undefined;
  AdminTabs: { adminUserId: number };  // 👈 instead of undefined
  AdminDriverDetails: { adminUserId: number; driver: DriverApplication };

  // 🔹 מסכי ניהול חדשים
  AdminCities: undefined;
  AdminCategories: undefined;

  // 🔹 מסך טופס יצירת מקום (אדמין)
  AdminPlaceForm: {
    pickedLat?: number;
    pickedLon?: number;
    pickedSource?: string;          // 👈 חדש
    pickedOsmId?: string | null;    // 👈 חדש
  } | undefined;

  // 🔹 מסך בחירת מיקום על המפה
  AdminPlaceMapPicker: {
    initialLat?: number;
    initialLon?: number;
  } | undefined;
};

export type AdminTabParamList = {
  fitnessDummy: undefined;
  alreadyUsers: undefined;
  AdminHome: undefined;
  newUsers: { adminUserId: number };
  profileDummy: undefined;
};

// src/navigation/types.ts
import type { DriverApplication } from "../screens/Admin/AdminDriversScreen";

export type RootStackParamList = {
  Home: undefined;
  SignUp: undefined;
  AdminLogin: undefined;
  AdminDrivers: { adminUserId: number; role: "ADMIN";};
  UserLogin: { mode: "REGULAR" | "DRIVER" };
  AdminPanel: undefined;
  AdminHomeScreen: { adminUserId: number; role: "ADMIN" };
  Login: undefined;
  RegularHome: undefined;
  AdminTabs: { adminUserId: number; role: "ADMIN" };
  AdminDriverDetails: { adminUserId: number; role: "ADMIN"; driver: DriverApplication };

  // 🔹 מסכי ניהול חדשים
  AdminCities: { adminUserId: number; role: "ADMIN" };
  AdminCategories: { adminUserId: number; role: "ADMIN" };

  // 🔹 מסך טופס יצירת מקום (אדמין)
  AdminPlaceForm: {
    pickedLat?: number;
    pickedLon?: number;
    pickedSource?: string;         
    pickedOsmId?: string | null;   
    adminUserId: number; 
    role: "ADMIN";
  } | undefined;

  // 🔹 מסך בחירת מיקום על המפה
  AdminPlaceMapPicker: {
    initialLat?: number;
    initialLon?: number;
    adminUserId: number;
    role: "ADMIN";
  } | undefined;
};

export type AdminTabParamList = {
  fitnessDummy: { adminUserId: number; role: "ADMIN" };
  alreadyUsers: { adminUserId: number; role: "ADMIN" };
  AdminHome: { adminUserId: number; role: "ADMIN" };
  newUsers: { adminUserId: number; role: "ADMIN" };
  profileDummy: { adminUserId: number; role: "ADMIN" };
};

// src/navigation/types.ts

export type RootStackParamList = {
  Home: undefined;
  SignUp: undefined;
  AdminLogin: undefined;
  AdminDrivers: { adminUserId: number };
  UserLogin: { mode: "REGULAR" | "DRIVER" };
  AdminPanel: undefined;

  // 🔹 מסכי ניהול חדשים
  AdminCities: undefined;
  AdminCategories: undefined;

  // 🔹 מסך טופס יצירת מקום (אדמין)
  AdminPlaceForm: {
    pickedLat?: number;
    pickedLon?: number;
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
  newUsers: undefined;
  profileDummy: undefined;
};

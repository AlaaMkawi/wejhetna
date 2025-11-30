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
};

export type AdminTabParamList = {
  fitnessDummy: undefined;
  alreadyUsers: undefined;
  AdminHome: undefined;
  newUsers: undefined;
  profileDummy: undefined;
};

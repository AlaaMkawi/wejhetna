export type RootStackParamList = {
  Home: undefined;
  SignUp: undefined;
  AdminLogin: undefined;
  AdminDrivers: { adminUserId: number };
  UserLogin: { mode: "REGULAR" | "DRIVER" };
};

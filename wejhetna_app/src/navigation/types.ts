// src/navigation/types.ts
import type { DriverApplication } from "../screens/Admin/AdminDriversScreen";

export type RootStackParamList = {
  Home: undefined;
  SignUp: undefined;
  AdminLogin: undefined;
  AdminDrivers: { adminUserId: number; role: "ADMIN";};
  EnterEmail: { userType?: "regular" | "driver" | "owner" };
  VerifyEmail: { email: string; userType?: "regular" | "driver" | "owner" };
  RegularSignup: { email: string };
  DriverSignup: { email: string };
  UserLogin: { mode: "REGULAR" | "DRIVER" };
  ForgotPasswordEnterEmail: undefined;
  ForgotPasswordVerifyCode: { email: string };
  ResetPassword: { email: string; code: string };
 
  AdminPanel: undefined;
  AdminHomeScreen: { adminUserId: number; role: "ADMIN" };
  Login: undefined;
  RegularHome: undefined;
  AdminTabs: { adminUserId: number; role: "ADMIN"; selectedPlaceId?: number };
  AdminDriverDetails: { adminUserId: number; role: "ADMIN"; driver: DriverApplication };
  BusinessOwnerSignup: { email?: string };
  BusinessOwnerPickLocation: {
    personalInfo: {
      full_name: string;
      username: string;
      email: string;
      phone: string;
      password: string;
    };
  };
  BusinessOwnerDetailsForm: {
    personalInfo: {
      full_name: string;
      username: string;
      email: string;
      phone: string;
      password: string;
    };
    lat: number;
    lon: number;
    source: string; // "MAP_PICK" | "GPS_NO_OSM" | "GPS_WITH_OSM"
    detectedCityId?: number | null; // City ID detected from location
    osmId?: string | null;
    existingPlaceId?: number | null; // If claiming existing place
  };
  AdminBusinessOwnerRequests: { adminUserId: number; role: "ADMIN" };
  AdminBusinessOwnerRequestDetails: {
    adminUserId: number;
    role: "ADMIN";
    request: import("../screens/Admin/AdminBusinessOwnerRequestsScreen").BusinessOwnerRequest;
  };
  AdminAdvertisementsPending: { adminUserId: number; role: "ADMIN" };
  AdminAdvertisementDetails: {
    adminUserId: number;
    role: "ADMIN";
    advertisement: import("../api/advertisements").AdminPendingAdvertisement;
  };
  ExistingUsers: { adminUserId: number; role: "ADMIN" };
  RejectedUsers: { adminUserId: number; role: "ADMIN" };
  UserDetails: {
    adminUserId: number;
    role: "ADMIN";
    user: import("../screens/Admin/ExistingUsersScreen").UserListItem;
  };
  // 🔹 מסכי ניהול חדשים
  AdminCities: { adminUserId: number; role: "ADMIN" };
  AdminCategories: { adminUserId: number; role: "ADMIN" };

  // 🔹 מסך טופס יצירת מקום (אדמין)
  AdminPlaceForm: {
    pickedLat?: number;
    pickedLon?: number;
    pickedSource?: string;         
    pickedOsmId?: string | null;
    detectedCityId?: number; // העיר שנמצאה אוטומטית לפי הגבולות
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
  Profile: {
    userId?: number;
  } | undefined;
  UserTabs: { selectedPlaceId?: number } | undefined;
  SavedPlaces: undefined;
  EditPlace: {
    placeId: number;
    userRole: "ADMIN" | "BUSINESS_OWNER";
    userId: number;
  };
  ManageMyBusiness: { fromMap?: boolean } | undefined;
  CreateAdvertisement: undefined;
  Advertisements: undefined;
  AdvertisementDetails: {
    advertisementId: number;
    advertisements: import("../api/advertisements").PublicAdvertisement[];
  };
  RouteDetails: {
    routeInfo: {
      distance: number;
      duration: number;
      startAddress?: string;
      endAddress?: string;
    };
    destination: { lat: number; lon: number; name?: string };
    userLocation: { lat: number; lon: number };
    routeCoordinates: {
      type: "FeatureCollection";
      features: Array<{
        type: "Feature";
        geometry: {
          type: "LineString";
          coordinates: [number, number][];
        };
        properties: Record<string, any>;
      }>;
    } | null;
    /** When omitted, screen defaults to preview (map + summary before live navigation). */
    navigationPhase?: "preview" | "active";
  };
};
export type AuthStackParamList = {
  Login: undefined;
  SignUp: undefined;
  BusinessOwnerSignup: undefined;
};

export type AdminTabParamList = {
  fitnessDummy: { adminUserId: number; role: "ADMIN" };
  alreadyUsers: { adminUserId: number; role: "ADMIN" };
  AdminHome: { adminUserId: number; role: "ADMIN"; selectedPlaceId?: number };
  newUsers: { adminUserId: number; role: "ADMIN" };
  AdvertisementsTab: { adminUserId: number; role: "ADMIN" };
  profileDummy: { adminUserId: number; role: "ADMIN" };
};

// src/navigation/types.ts
import type { DriverApplication } from "../screens/Admin/AdminDriversScreen";

export type RootStackParamList = {
  /** Cold-start bootstrap: reads persisted session and navigates to Home or main app. */
  SessionRestore: undefined;
  Home: undefined;
  SignUp: undefined;
  AdminLogin: undefined;
  AdminDrivers: { adminUserId: number; role: "ADMIN";};
  AdminDriverReports: { adminUserId: number; role: "ADMIN" };
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
  MyAdvertisements: { userId: number };
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
    /**
     * Optional ride UI overlay shown only when this route is opened from the ride flow
     * (OTP verified → in-trip navigation). Does not affect regular navigation entrypoints.
     */
    rideContext?: {
      rideRequestId: number;
      destinationText: string;
      destinationLat: number | null;
      destinationLon: number | null;
      driverName: string;
      driverPhone: string | null;
      passengerName: string;
      passengerPhone: string | null;
      /** Needed so the back button inside RouteDetails returns to the correct requests tab. */
      role: "DRIVER" | "REGULAR";
      /**
       * `"trip"` = after OTP, driver+passenger en route to destination.
       * `"pickup"` = driver en route to passenger's pickup point.
       * When omitted, defaults to `"trip"` (legacy behaviour).
       */
      mode?: "trip" | "pickup";
    };
  };
  /** Full-screen live ride tracking (driver → pickup or passenger following driver). */
  RideTrackingMap: {
    mode: "driver" | "passenger";
    rideRequestId: number;
  };
  /** Shared in-trip navigation to destination (after OTP success). */
  RideTripToDestination: {
    rideRequestId: number;
    showTripSuccessIntro?: boolean;
  };
  /**
   * Unified pickup-route entrypoint.
   * Driver: loads into openDrivingRoutePreview → RouteDetails (live nav to pickup).
   * Passenger: redirects to RideTrackingMap (passenger mode) which already shows live driver approach.
   */
  RidePickupNavigation: {
    rideRequestId: number;
  };
};
export type AuthStackParamList = {
  Login: undefined;
  SignUp: undefined;
  BusinessOwnerSignup: undefined;
};

export type AdminTabParamList = {
  alreadyUsers: { adminUserId: number; role: "ADMIN" };
  AdminHome: { adminUserId: number; role: "ADMIN"; selectedPlaceId?: number };
  newUsers: { adminUserId: number; role: "ADMIN" };
  AdvertisementsTab: { adminUserId: number; role: "ADMIN" };
  profileDummy: { adminUserId: number; role: "ADMIN" };
};

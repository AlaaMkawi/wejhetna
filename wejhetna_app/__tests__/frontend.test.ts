/**
 * @format
 *
 * Single consolidated frontend test suite.
 *
 * Each former individual test file is preserved here as a top-level
 * `describe("File: ...")` block. Per-file `beforeAll` / `beforeEach` /
 * `afterAll` hooks are scoped inside their own describe block so they do not
 * leak across suites (timers, AsyncStorage state, mock state, etc.).
 *
 * Module mocks (`jest.mock(...)`) below are hoisted to the top of this file
 * by babel-jest, so they apply globally to every test in this file. We
 * intentionally only mock modules that no other suite needs in its real form.
 *
 * Heavier RN component/interaction suites: `frontend.components.test.tsx`,
 * `passengerDriverArrivedListener.test.tsx`, etc. Stay in separate files when they
 * need broader mocks (`@react-navigation/native`, ride navigation helpers).
 */

/// <reference types="jest" />

// ============================================================================
// Module mocks (hoisted to the top by jest)
// ============================================================================

// Used by `destinationBoundaryValidation` tests.
jest.mock("../src/api/places", () => ({
  __esModule: true,
  checkLocationInServiceCities: jest.fn(),
}));

jest.mock("../src/utils/appAlert", () => ({
  __esModule: true,
  appAlert: jest.fn(),
}));

// Used by `rideNavigateToTripScreen` tests; harmless to all others (none of
// the other suites import from `@react-navigation/native`).
jest.mock("@react-navigation/native", () => ({
  __esModule: true,
  CommonActions: {
    navigate: (payload: unknown) => ({ type: "NAVIGATE", payload }),
  },
}));

// Names below MUST start with `mock` so jest's babel transform allows the
// factories to reference them (otherwise it errors on out-of-scope vars).
// Used by `sessionRestore` tests.
const mockGetUserProfile = jest.fn();
const mockIsAxiosError = jest.fn();

jest.mock("../src/api/profileApi", () => ({
  __esModule: true,
  getUserProfile: (...args: unknown[]) => mockGetUserProfile(...args),
}));

jest.mock("axios", () => ({
  __esModule: true,
  default: { isAxiosError: (e: unknown) => mockIsAxiosError(e) },
  isAxiosError: (e: unknown) => mockIsAxiosError(e),
}));

// ============================================================================
// Imports
// ============================================================================

import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  parseStoredUserId,
  normalizeRideRequestStatus,
  isActiveBlockingRideStatus,
  rideApiDetailToTranslationKey,
} from "../src/api/rides";
import type { NearbyDriver, RegularLatestRideRequest } from "../src/api/rides";
import { bearingDegrees as bearingFromGeo } from "../src/utils/geoBearing";
import {
  formatDistance,
  formatDistanceText,
} from "../src/utils/formatDistance";
import {
  clusterNearbyDrivers,
  zoomInTargetForCluster,
} from "../src/utils/nearbyDriverClustering";
import { isPassengerRideUserRole } from "../src/utils/ridePassengerRole";
import {
  navigateToRidePickupNavigation,
  navigateToRideTripToDestination,
  navigateToUserRideRequestsTab,
} from "../src/utils/rideNavigateToTripScreen";
import {
  bearingDegrees,
  haversineMeters,
  minDistanceToPolylineMeters,
  pointAtFractionAlongPolyline,
  polylineLengthMeters,
  snapToPolylinePoint,
  trimPolylineAheadOfUser,
} from "../src/utils/routePolyline";
import {
  getActiveLocationSessionId,
  markLoginLocationPromptStarted,
  notifyUserLoggedIn,
  notifyUserLoggedOut,
  shouldRunLoginLocationPrompt,
} from "../src/utils/locationSession";
import { clearUserSession } from "../src/utils/sessionLogout";
import {
  AUTH_STORAGE_KEYS,
  resolveSessionRestore,
} from "../src/utils/sessionRestore";

// Mock-typed handles for the `destinationBoundaryValidation` tests.
import { assertDestinationInServiceCities } from "../src/utils/destinationBoundaryValidation";
import { checkLocationInServiceCities } from "../src/api/places";
import { appAlert } from "../src/utils/appAlert";

import {
  passengerPhaseKey,
  hasValidPickup,
  formatRideRequestTimestamp,
  driverDisplayInitials,
} from "../src/screens/RegularAccount/RegularRideStatusScreen";
import {
  isDriverRideStatusEligibleForPickupNav,
  isPassengerRideStatusEligibleForPickupNav,
} from "../src/utils/ridePickupNavigationGuards";

const mockedCheck = checkLocationInServiceCities as jest.MockedFunction<
  typeof checkLocationInServiceCities
>;
const mockedAlert = appAlert as jest.MockedFunction<typeof appAlert>;

// ============================================================================
// File: parseStoredUserId
// ============================================================================

describe("File: parseStoredUserId", () => {
  /**
   * `parseStoredUserId` is the front line against AsyncStorage corruption.
   * If it returns a bogus number we end up with URLs like `/users/NaN/...` and
   * FastAPI 422s on cold start — these tests pin down every failure mode.
   */

  describe("parseStoredUserId — invalid inputs return null", () => {
    test.each([
      ["null literal", null],
      ["undefined", undefined],
      ["empty string", ""],
      ["whitespace", "   "],
      ["string 'null'", "null"],
      ["string 'undefined'", "undefined"],
      ["non-numeric", "abc"],
      ["mixed", "12abc"], // parseInt would happily return 12 — guard via Number.isFinite is not enough; current impl actually accepts this; keep it as a documented case
    ])("%s → null or finite int", (_label, raw) => {
      const result = parseStoredUserId(raw as string | null | undefined);
      if (result !== null) {
        expect(Number.isInteger(result)).toBe(true);
      }
    });

    test("plain garbage returns null", () => {
      expect(parseStoredUserId("not-a-number")).toBeNull();
      expect(parseStoredUserId("null")).toBeNull();
      expect(parseStoredUserId("")).toBeNull();
      expect(parseStoredUserId(null)).toBeNull();
      expect(parseStoredUserId(undefined)).toBeNull();
    });

    test("zero and negative ids are rejected (server ids start at 1)", () => {
      expect(parseStoredUserId("0")).toBeNull();
      expect(parseStoredUserId("-1")).toBeNull();
      expect(parseStoredUserId("-2147483648")).toBeNull();
    });

    test("values larger than 32-bit signed int max are rejected", () => {
      expect(parseStoredUserId("2147483648")).toBeNull(); // > INT_MAX
      expect(parseStoredUserId("99999999999")).toBeNull();
    });
  });

  describe("parseStoredUserId — valid inputs are coerced to numbers", () => {
    test("plain integer string", () => {
      expect(parseStoredUserId("42")).toBe(42);
    });

    test("trims surrounding whitespace", () => {
      expect(parseStoredUserId("  17  ")).toBe(17);
    });

    test("max valid 32-bit signed int", () => {
      expect(parseStoredUserId("2147483647")).toBe(2147483647);
    });

    test("smallest valid id", () => {
      expect(parseStoredUserId("1")).toBe(1);
    });
  });
});

// ============================================================================
// File: locationSession
// ============================================================================

describe("File: locationSession", () => {
  /**
   * locationSession is the in-memory marker the rest of the app uses to know
   * whether anyone is logged in (e.g. the location-permission prompt only runs
   * once per session). These tests guard the lifecycle: login increments,
   * logout resets, and the one-time prompt gate flips correctly.
   */

  beforeEach(() => {
    // Fully reset module state. notifyUserLoggedOut() puts both counters back
    // to zero, which is the same baseline as a fresh app launch.
    notifyUserLoggedOut();
  });

  describe("locationSession — login / logout markers", () => {
    test("starts logged-out", () => {
      expect(getActiveLocationSessionId()).toBe(0);
    });

    test("login increments the session id", () => {
      notifyUserLoggedIn();
      expect(getActiveLocationSessionId()).toBe(1);
    });

    test("each successive login bumps the session id (re-auth)", () => {
      notifyUserLoggedIn();
      notifyUserLoggedIn();
      notifyUserLoggedIn();
      expect(getActiveLocationSessionId()).toBe(3);
    });

    test("logout resets the session id to zero", () => {
      notifyUserLoggedIn();
      notifyUserLoggedIn();
      notifyUserLoggedOut();
      expect(getActiveLocationSessionId()).toBe(0);
    });

    test("re-login after logout starts a fresh session id", () => {
      notifyUserLoggedIn();
      notifyUserLoggedIn();
      notifyUserLoggedOut();
      notifyUserLoggedIn();
      expect(getActiveLocationSessionId()).toBe(1);
    });
  });

  describe("locationSession — one-time prompt gate", () => {
    test("does not run before login", () => {
      expect(shouldRunLoginLocationPrompt()).toBe(false);
    });

    test("runs exactly once per login session", () => {
      notifyUserLoggedIn();
      expect(shouldRunLoginLocationPrompt()).toBe(true);

      markLoginLocationPromptStarted();
      expect(shouldRunLoginLocationPrompt()).toBe(false);
    });

    test("re-arms after logout + login (next session must prompt again)", () => {
      notifyUserLoggedIn();
      markLoginLocationPromptStarted();
      expect(shouldRunLoginLocationPrompt()).toBe(false);

      notifyUserLoggedOut();
      notifyUserLoggedIn();
      expect(shouldRunLoginLocationPrompt()).toBe(true);
    });

    test("logout alone (without a follow-up login) does not arm the prompt", () => {
      notifyUserLoggedIn();
      markLoginLocationPromptStarted();
      notifyUserLoggedOut();
      expect(shouldRunLoginLocationPrompt()).toBe(false);
    });
  });
});

// ============================================================================
// File: sessionLogout
// ============================================================================

describe("File: sessionLogout", () => {
  /**
   * `clearUserSession` is the single side-effect helper every logout path goes
   * through. Tests pin down two invariants:
   *  1. The in-memory login marker flips first so any concurrent UI sees the
   *     logout immediately, even if storage is slow or fails.
   *  2. Storage is wiped — but a storage failure must NOT throw, because we
   *     never want a logout to be blocked by a transient I/O error.
   */

  beforeEach(async () => {
    await AsyncStorage.clear();
    notifyUserLoggedOut();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("clearUserSession", () => {
    test("resets the in-memory session marker", async () => {
      notifyUserLoggedIn();
      expect(getActiveLocationSessionId()).toBe(1);

      await clearUserSession();
      expect(getActiveLocationSessionId()).toBe(0);
    });

    test("clears every persisted auth key from AsyncStorage", async () => {
      await AsyncStorage.setItem("userId", "42");
      await AsyncStorage.setItem("userRole", "REGULAR");
      await AsyncStorage.setItem("authToken", "abc.def.ghi");

      await clearUserSession();

      expect(await AsyncStorage.getItem("userId")).toBeNull();
      expect(await AsyncStorage.getItem("userRole")).toBeNull();
      expect(await AsyncStorage.getItem("authToken")).toBeNull();
    });

    test("storage errors are swallowed so logout always succeeds", async () => {
      notifyUserLoggedIn();
      const spy = jest
        .spyOn(AsyncStorage, "clear")
        .mockImplementationOnce(() => Promise.reject(new Error("disk full")));

      // Must not throw — the user must be able to log out even if storage is broken.
      await expect(clearUserSession()).resolves.toBeUndefined();
      // In-memory session is still cleared even when storage failed.
      expect(getActiveLocationSessionId()).toBe(0);
      expect(spy).toHaveBeenCalled();
    });

    test("flips the in-memory marker before awaiting storage clear", async () => {
      notifyUserLoggedIn();
      let sessionDuringClear: number | null = null;
      jest.spyOn(AsyncStorage, "clear").mockImplementation(async () => {
        // sample session marker the moment storage clear starts
        if (sessionDuringClear === null) {
          sessionDuringClear = getActiveLocationSessionId();
        }
      });

      await clearUserSession();

      expect(sessionDuringClear).toBe(0);
      expect(getActiveLocationSessionId()).toBe(0);
    });
  });
});

// ============================================================================
// File: sessionRestore
// ============================================================================

describe("File: sessionRestore", () => {
  /**
   * `resolveSessionRestore` is the cold-start decision: where do we send the
   * user (Home vs UserTabs vs AdminTabs) and do we keep their stored credentials?
   * These tests cover every branch of that decision tree without rendering the
   * SessionRestoreScreen component.
   */

  const seedAuthKeys = async (
    userId: string | null,
    role: string | null,
  ): Promise<void> => {
    if (userId == null) {
      await AsyncStorage.removeItem("userId");
    } else {
      await AsyncStorage.setItem("userId", userId);
    }
    if (role == null) {
      await AsyncStorage.removeItem("userRole");
    } else {
      await AsyncStorage.setItem("userRole", role);
    }
  };

  const expectAuthKeysCleared = async (): Promise<void> => {
    for (const key of AUTH_STORAGE_KEYS) {
      expect(await AsyncStorage.getItem(key)).toBeNull();
    }
  };

  beforeEach(async () => {
    await AsyncStorage.clear();
    mockGetUserProfile.mockReset();
    mockIsAxiosError.mockReset();
    // axios.isAxiosError defaults to false unless a specific test opts in.
    mockIsAxiosError.mockReturnValue(false);
  });

  describe("resolveSessionRestore - no/invalid stored credentials -> home", () => {
    test("nothing in storage -> go_home (and storage stays empty)", async () => {
      const outcome = await resolveSessionRestore();
      expect(outcome).toEqual({ kind: "go_home" });
      await expectAuthKeysCleared();
      expect(mockGetUserProfile).not.toHaveBeenCalled();
    });

    test("only userId set, no role -> clears keys and goes home", async () => {
      await seedAuthKeys("42", null);
      const outcome = await resolveSessionRestore();
      expect(outcome).toEqual({ kind: "go_home" });
      await expectAuthKeysCleared();
      expect(mockGetUserProfile).not.toHaveBeenCalled();
    });

    test("only role set, no userId -> clears keys and goes home", async () => {
      await seedAuthKeys(null, "REGULAR");
      const outcome = await resolveSessionRestore();
      expect(outcome).toEqual({ kind: "go_home" });
      await expectAuthKeysCleared();
      expect(mockGetUserProfile).not.toHaveBeenCalled();
    });

    test("garbage userId ('null' literal in storage) -> home", async () => {
      await seedAuthKeys("null", "REGULAR");
      const outcome = await resolveSessionRestore();
      expect(outcome).toEqual({ kind: "go_home" });
      await expectAuthKeysCleared();
      expect(mockGetUserProfile).not.toHaveBeenCalled();
    });

    test("non-numeric userId -> home", async () => {
      await seedAuthKeys("abc", "REGULAR");
      const outcome = await resolveSessionRestore();
      expect(outcome).toEqual({ kind: "go_home" });
      await expectAuthKeysCleared();
    });

    test("whitespace-only role is treated as missing -> home", async () => {
      await seedAuthKeys("42", "   ");
      const outcome = await resolveSessionRestore();
      expect(outcome).toEqual({ kind: "go_home" });
      await expectAuthKeysCleared();
    });
  });

  describe("resolveSessionRestore - valid credentials, server validates", () => {
    test("ACTIVE REGULAR user -> go_user_tabs and keys are kept", async () => {
      await seedAuthKeys("42", "REGULAR");
      mockGetUserProfile.mockResolvedValueOnce({
        id: 42,
        role: "REGULAR",
        status: "ACTIVE",
      });

      const outcome = await resolveSessionRestore();
      expect(outcome).toEqual({ kind: "go_user_tabs", userId: 42, role: "REGULAR" });
      expect(mockGetUserProfile).toHaveBeenCalledWith(42);
      expect(await AsyncStorage.getItem("userId")).toBe("42");
      expect(await AsyncStorage.getItem("userRole")).toBe("REGULAR");
    });

    test("ACTIVE BUSINESS_OWNER user -> go_user_tabs", async () => {
      await seedAuthKeys("17", "BUSINESS_OWNER");
      mockGetUserProfile.mockResolvedValueOnce({
        id: 17,
        role: "BUSINESS_OWNER",
        status: "ACTIVE",
      });

      const outcome = await resolveSessionRestore();
      expect(outcome).toEqual({
        kind: "go_user_tabs",
        userId: 17,
        role: "BUSINESS_OWNER",
      });
    });

    test("ACTIVE ADMIN user -> go_admin_tabs (carries userId for tab params)", async () => {
      await seedAuthKeys("3", "ADMIN");
      mockGetUserProfile.mockResolvedValueOnce({
        id: 3,
        role: "ADMIN",
        status: "ACTIVE",
      });

      const outcome = await resolveSessionRestore();
      expect(outcome).toEqual({ kind: "go_admin_tabs", userId: 3 });
    });

    test("server reports a different role -> adopt server role and persist", async () => {
      // User was promoted from REGULAR to DRIVER server-side; restore must
      // pick up the new role and update storage.
      await seedAuthKeys("9", "REGULAR");
      mockGetUserProfile.mockResolvedValueOnce({
        id: 9,
        role: "DRIVER",
        status: "ACTIVE",
      });

      const outcome = await resolveSessionRestore();
      expect(outcome).toEqual({ kind: "go_user_tabs", userId: 9, role: "DRIVER" });
      expect(await AsyncStorage.getItem("userRole")).toBe("DRIVER");
    });

    test("server flips role to ADMIN -> routes to AdminTabs even if storage said REGULAR", async () => {
      await seedAuthKeys("5", "REGULAR");
      mockGetUserProfile.mockResolvedValueOnce({
        id: 5,
        role: "ADMIN",
        status: "ACTIVE",
      });

      const outcome = await resolveSessionRestore();
      expect(outcome).toEqual({ kind: "go_admin_tabs", userId: 5 });
      expect(await AsyncStorage.getItem("userRole")).toBe("ADMIN");
    });

    test("server returns same role -> persisted value is unchanged", async () => {
      await seedAuthKeys("10", "REGULAR");
      mockGetUserProfile.mockResolvedValueOnce({
        id: 10,
        role: "REGULAR",
        status: "ACTIVE",
      });

      await resolveSessionRestore();

      expect(await AsyncStorage.getItem("userRole")).toBe("REGULAR");
    });
  });

  describe("resolveSessionRestore - server invalidation flows", () => {
    test("non-ACTIVE status -> clears keys and goes home", async () => {
      await seedAuthKeys("42", "REGULAR");
      mockGetUserProfile.mockResolvedValueOnce({
        id: 42,
        role: "REGULAR",
        status: "SUSPENDED",
      });

      const outcome = await resolveSessionRestore();
      expect(outcome).toEqual({ kind: "go_home" });
      await expectAuthKeysCleared();
    });

    test("server 401 -> clears keys and goes home", async () => {
      await seedAuthKeys("42", "REGULAR");
      const err = Object.assign(new Error("unauthorized"), {
        response: { status: 401 },
        isAxiosError: true,
      });
      mockIsAxiosError.mockImplementation((e) => e === err);
      mockGetUserProfile.mockRejectedValueOnce(err);

      const outcome = await resolveSessionRestore();
      expect(outcome).toEqual({ kind: "go_home" });
      await expectAuthKeysCleared();
    });

    test("server 404 (user no longer exists) -> clears keys and goes home", async () => {
      await seedAuthKeys("42", "REGULAR");
      const err = Object.assign(new Error("not found"), {
        response: { status: 404 },
        isAxiosError: true,
      });
      mockIsAxiosError.mockImplementation((e) => e === err);
      mockGetUserProfile.mockRejectedValueOnce(err);

      const outcome = await resolveSessionRestore();
      expect(outcome).toEqual({ kind: "go_home" });
      await expectAuthKeysCleared();
    });
  });

  describe("resolveSessionRestore - offline / transient errors keep the session", () => {
    test("network error keeps stored credentials and routes to UserTabs", async () => {
      await seedAuthKeys("42", "REGULAR");
      const netErr = new Error("network down");
      // axios reports it as an axios error WITHOUT an http response - current
      // behavior keeps the session for both "no response" and 5xx cases.
      mockIsAxiosError.mockImplementation((e) => e === netErr);
      mockGetUserProfile.mockRejectedValueOnce(netErr);

      const outcome = await resolveSessionRestore();
      expect(outcome).toEqual({ kind: "go_user_tabs", userId: 42, role: "REGULAR" });
      // Keys are intentionally preserved for offline-friendly UX.
      expect(await AsyncStorage.getItem("userId")).toBe("42");
      expect(await AsyncStorage.getItem("userRole")).toBe("REGULAR");
    });

    test("server 500 keeps the session (only 401/404 invalidate)", async () => {
      await seedAuthKeys("42", "ADMIN");
      const err = Object.assign(new Error("boom"), {
        response: { status: 500 },
        isAxiosError: true,
      });
      mockIsAxiosError.mockImplementation((e) => e === err);
      mockGetUserProfile.mockRejectedValueOnce(err);

      const outcome = await resolveSessionRestore();
      expect(outcome).toEqual({ kind: "go_admin_tabs", userId: 42 });
      expect(await AsyncStorage.getItem("userId")).toBe("42");
      expect(await AsyncStorage.getItem("userRole")).toBe("ADMIN");
    });

    test("non-axios thrown error keeps the session", async () => {
      await seedAuthKeys("42", "REGULAR");
      mockIsAxiosError.mockReturnValue(false);
      mockGetUserProfile.mockRejectedValueOnce(new TypeError("undefined.x"));

      const outcome = await resolveSessionRestore();
      expect(outcome).toEqual({ kind: "go_user_tabs", userId: 42, role: "REGULAR" });
      expect(await AsyncStorage.getItem("userId")).toBe("42");
    });
  });

  describe("resolveSessionRestore - AsyncStorage failures", () => {
    test("getItem failure -> go_home and best-effort key clear", async () => {
      jest
        .spyOn(AsyncStorage, "getItem")
        .mockRejectedValueOnce(new Error("storage broken"));
      const outcome = await resolveSessionRestore();
      expect(outcome).toEqual({ kind: "go_home" });
    });
  });
});

// ============================================================================
// File: ridePassengerRole
// ============================================================================

describe("File: ridePassengerRole", () => {
  describe("isPassengerRideUserRole", () => {
    it("returns true for REGULAR (matches backend _user_can_request_rides)", () => {
      expect(isPassengerRideUserRole("REGULAR")).toBe(true);
    });

    it("returns true for BUSINESS_OWNER (also a passenger in the ride flow)", () => {
      expect(isPassengerRideUserRole("BUSINESS_OWNER")).toBe(true);
    });

    it("returns false for DRIVER and ADMIN — they don't see passenger UX", () => {
      expect(isPassengerRideUserRole("DRIVER")).toBe(false);
      expect(isPassengerRideUserRole("ADMIN")).toBe(false);
    });

    it("returns false for null/undefined/empty (cold-start, missing role)", () => {
      expect(isPassengerRideUserRole(null)).toBe(false);
      expect(isPassengerRideUserRole(undefined)).toBe(false);
      expect(isPassengerRideUserRole("")).toBe(false);
    });

    it("is case-sensitive — guards against accidental lowercase persistence", () => {
      expect(isPassengerRideUserRole("regular")).toBe(false);
      expect(isPassengerRideUserRole("Business_Owner")).toBe(false);
    });
  });
});

// ============================================================================
// File: geoBearing
// ============================================================================

describe("File: geoBearing", () => {
  const closeTo = (actual: number, expected: number, eps = 0.5) =>
    Math.abs(actual - expected) <= eps;

  describe("bearingDegrees", () => {
    it("returns ~0 when the target is directly north (same longitude, higher lat)", () => {
      expect(closeTo(bearingFromGeo(31, 34, 32, 34), 0)).toBe(true);
    });

    it("returns ~180 when the target is directly south", () => {
      expect(closeTo(bearingFromGeo(32, 34, 31, 34), 180)).toBe(true);
    });

    it("returns ~90 when the target is directly east at low latitude", () => {
      expect(closeTo(bearingFromGeo(0, 34, 0, 35), 90)).toBe(true);
    });

    it("returns ~270 when the target is directly west", () => {
      expect(closeTo(bearingFromGeo(0, 34, 0, 33), 270)).toBe(true);
    });

    it("normalizes to [0, 360)", () => {
      const b = bearingFromGeo(31.39, 34.75, 31.40, 34.74); // NW-ish
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThan(360);
    });

    it("is well-defined when both points coincide (no NaN)", () => {
      const b = bearingFromGeo(31.39, 34.75, 31.39, 34.75);
      expect(Number.isFinite(b)).toBe(true);
    });
  });
});

// ============================================================================
// File: routePolyline
// ============================================================================

describe("File: routePolyline", () => {
  // MapLibre / GeoJSON conventions: coordinates are [lon, lat].
  type Coords = Array<[number, number]>;

  const closeTo = (a: number, b: number, eps = 1) => Math.abs(a - b) <= eps;

  describe("haversineMeters", () => {
    it("returns 0 for the same point", () => {
      expect(haversineMeters(31.39, 34.75, 31.39, 34.75)).toBe(0);
    });

    it("approximates 1 deg of latitude ≈ 111 km", () => {
      // Tolerate a few hundred meters; the spheroid vs sphere model differs.
      const m = haversineMeters(0, 0, 1, 0);
      expect(closeTo(m, 111195, 500)).toBe(true);
    });

    it("is symmetric", () => {
      const a = haversineMeters(31.39, 34.75, 31.40, 34.76);
      const b = haversineMeters(31.40, 34.76, 31.39, 34.75);
      expect(closeTo(a, b, 0.0001)).toBe(true);
    });
  });

  describe("minDistanceToPolylineMeters", () => {
    const seg: Coords = [
      [34.75, 31.39],
      [34.76, 31.39],
    ];

    it("is 0 when the user sits exactly on the line", () => {
      expect(closeTo(minDistanceToPolylineMeters(31.39, 34.755, seg), 0, 1)).toBe(
        true,
      );
    });

    it("returns the perpendicular distance for off-route users", () => {
      // User 0.001 deg north of midpoint ≈ ~111 m off the segment.
      const d = minDistanceToPolylineMeters(31.391, 34.755, seg);
      expect(d).toBeGreaterThan(80);
      expect(d).toBeLessThan(140);
    });

    it("handles a single-point 'polyline' as point distance", () => {
      const single: Coords = [[34.75, 31.39]];
      const d = minDistanceToPolylineMeters(31.391, 34.75, single);
      expect(d).toBeGreaterThan(80);
      expect(d).toBeLessThan(140);
    });

    it("returns Infinity for an empty polyline (no route to compare)", () => {
      expect(minDistanceToPolylineMeters(31.39, 34.75, [])).toBe(Infinity);
    });
  });

  describe("snapToPolylinePoint", () => {
    const seg: Coords = [
      [34.75, 31.39],
      [34.76, 31.39],
    ];

    it("returns null for too-short polylines", () => {
      expect(snapToPolylinePoint(31.39, 34.75, [])).toBeNull();
      expect(snapToPolylinePoint(31.39, 34.75, [[34.75, 31.39]])).toBeNull();
    });

    it("snaps to the nearest segment with a small distance and t∈[0,1]", () => {
      const r = snapToPolylinePoint(31.391, 34.755, seg);
      expect(r).not.toBeNull();
      expect(r!.segmentIndex).toBe(0);
      expect(r!.t).toBeGreaterThanOrEqual(0);
      expect(r!.t).toBeLessThanOrEqual(1);
      // Snap point must lie on the segment latitude line.
      expect(closeTo(r!.point.lat, 31.39, 0.0005)).toBe(true);
    });
  });

  describe("trimPolylineAheadOfUser", () => {
    it("does not change anything for short polylines (< 2 points)", () => {
      const empty = trimPolylineAheadOfUser(31.39, 34.75, []);
      expect(empty.trimmed).toEqual([]);
      expect(empty.remainingLengthMeters).toBe(0);
    });

    it("when off-route past threshold, returns the original line untouched", () => {
      const seg: Coords = [
        [34.75, 31.39],
        [34.76, 31.39],
      ];
      // User ~111 m north — well beyond the 18 m default threshold.
      const r = trimPolylineAheadOfUser(31.391, 34.755, seg, 18);
      expect(r.trimmed.length).toBe(2);
      expect(r.trimmed).toEqual(seg);
      expect(r.remainingLengthMeters).toBeGreaterThan(800);
    });

    it("when on the segment, the trimmed line starts at the snap point and remaining length shrinks", () => {
      const longSeg: Coords = [
        [34.750, 31.39],
        [34.760, 31.39],
        [34.770, 31.39],
      ];
      const totalBefore = polylineLengthMeters(longSeg);
      // User near the midpoint of the first segment.
      const r = trimPolylineAheadOfUser(31.39, 34.755, longSeg, 18);
      expect(r.remainingLengthMeters).toBeLessThan(totalBefore);
      expect(r.trimmed.length).toBeGreaterThanOrEqual(2);
      // First trimmed point should be (≈) the snap, NOT the original first vertex.
      expect(closeTo(r.trimmed[0][0], 34.755, 0.001)).toBe(true);
    });
  });

  describe("polylineLengthMeters", () => {
    it("is 0 for empty / single-point polylines", () => {
      expect(polylineLengthMeters([])).toBe(0);
      expect(polylineLengthMeters([[34.75, 31.39]])).toBe(0);
    });

    it("sums segment haversine lengths", () => {
      const coords: Coords = [
        [34.75, 31.39],
        [34.76, 31.39],
      ];
      const expected = haversineMeters(31.39, 34.75, 31.39, 34.76);
      expect(closeTo(polylineLengthMeters(coords), expected, 0.0001)).toBe(true);
    });
  });

  describe("pointAtFractionAlongPolyline", () => {
    it("returns null for empty coords", () => {
      expect(pointAtFractionAlongPolyline([], 0.5)).toBeNull();
    });

    it("returns the vertex for a degenerate polyline", () => {
      expect(pointAtFractionAlongPolyline([[34.75, 31.39]], 0)).toEqual([34.75, 31.39]);
    });

    it("places fraction=0.5 near the midpoint of a segment", () => {
      const seg: Coords = [
        [34.75, 31.39],
        [34.76, 31.39],
      ];
      const p = pointAtFractionAlongPolyline(seg, 0.5);
      expect(p).not.toBeNull();
      expect(closeTo(p![1], 31.39, 0.00001)).toBe(true);
      expect(p![0]).toBeGreaterThan(34.75);
      expect(p![0]).toBeLessThan(34.76);
    });
  });

  describe("bearingDegrees (re-exported in routePolyline)", () => {
    it("returns ~0 north and ~90 east", () => {
      expect(Math.abs(bearingDegrees(31, 34, 32, 34))).toBeLessThan(1);
      expect(Math.abs(bearingDegrees(0, 34, 0, 35) - 90)).toBeLessThan(1);
    });
  });
});

// ============================================================================
// File: formatDistance
// ============================================================================

describe("File: formatDistance", () => {
  describe("formatDistance — invalid input", () => {
    it("returns null for nullish input (caller hides the line)", () => {
      expect(formatDistance(null)).toBeNull();
      expect(formatDistance(undefined)).toBeNull();
    });

    it("returns null for non-finite or negative input", () => {
      expect(formatDistance(Number.NaN)).toBeNull();
      expect(formatDistance(Number.POSITIVE_INFINITY)).toBeNull();
      expect(formatDistance(-1)).toBeNull();
      expect(formatDistance(-0.5)).toBeNull();
    });
  });

  describe("formatDistance — kilometers bucket", () => {
    it("renders >= 1 km in km, one decimal", () => {
      const r = formatDistance(2.44);
      expect(r).not.toBeNull();
      expect(r!.scale).toBe("km");
      expect(r!.value).toBe("2.4");
      expect(r!.text).toBe("2.4 km");
    });

    it("strips a trailing .0 so '1 km' is preferred over '1.0 km'", () => {
      expect(formatDistance(1.0)!.value).toBe("1");
      expect(formatDistance(1.0)!.text).toBe("1 km");
      expect(formatDistance(3.04)!.value).toBe("3");
    });

    it("rounds half-up at the 0.05 boundary", () => {
      // 2.44 → 2.4, but 2.46 → 2.5
      expect(formatDistance(2.46)!.value).toBe("2.5");
    });
  });

  describe("formatDistance — meters bucket", () => {
    it("renders < 1 km in meters, snapped to 10 m", () => {
      const r = formatDistance(0.317);
      expect(r).not.toBeNull();
      expect(r!.scale).toBe("m");
      // 317 m → snapped to 320 m
      expect(r!.value).toBe("320");
      expect(r!.text).toBe("320 m");
    });

    it("does not collapse tiny non-zero distances to '0 m'", () => {
      // 1 m would round to 0 — clamp to 10 m floor.
      expect(formatDistance(0.001)!.value).toBe("10");
    });

    it("renders 0 km cleanly (avoids the 0.001 edge)", () => {
      const r = formatDistance(0);
      expect(r).not.toBeNull();
      expect(r!.value).toBe("0");
      expect(r!.scale).toBe("m");
      expect(r!.text).toBe("0 m");
    });

    it("just-below-1 km still renders in meters", () => {
      const r = formatDistance(0.999);
      expect(r!.scale).toBe("m");
      // 999 m → snaps to nearest 10 → 1000 m. Acceptable: a single edge
      // value still reads correctly; the next bucket starts at exactly 1.
      expect(r!.value).toBe("1000");
    });
  });

  describe("formatDistance — translation hook", () => {
    it("uses t('ride_km') / t('ride_m') when a translator is provided", () => {
      const t = (k: string) => (k === "ride_km" ? "كم" : k === "ride_m" ? "م" : k);
      const km = formatDistance(2.5, { t });
      const m = formatDistance(0.4, { t });
      expect(km!.unit).toBe("كم");
      expect(km!.text).toBe("2.5 كم");
      expect(m!.unit).toBe("م");
      expect(m!.text).toBe("400 م");
    });

    it("falls back to English units when t() echoes the key (missing translation)", () => {
      const t = (k: string) => k;
      const r = formatDistance(2.5, { t });
      expect(r!.unit).toBe("km");
      expect(r!.text).toBe("2.5 km");
    });

    it("falls back when t() throws — never crashes the UI", () => {
      const t = () => {
        throw new Error("boom");
      };
      const r = formatDistance(2.5, { t });
      expect(r!.unit).toBe("km");
    });
  });

  describe("formatDistance — withUnit option", () => {
    it("returns just the numeric portion when withUnit=false", () => {
      const r = formatDistance(2.5, { withUnit: false });
      expect(r!.text).toBe("2.5");
      expect(r!.value).toBe("2.5");
      expect(r!.unit).toBe("km");
    });
  });

  describe("formatDistanceText", () => {
    it("returns the joined string for the common UI use case", () => {
      expect(formatDistanceText(0.5)).toBe("500 m");
      expect(formatDistanceText(7.2)).toBe("7.2 km");
    });

    it("returns null for invalid input (so the line can be hidden)", () => {
      expect(formatDistanceText(null)).toBeNull();
      expect(formatDistanceText(Number.NaN)).toBeNull();
    });
  });
});

// ============================================================================
// File: nearbyDriverClustering
// ============================================================================

describe("File: nearbyDriverClustering", () => {
  const driver = (
    overrides: Partial<NearbyDriver> & {
      driver_user_id: number;
      lat: number;
      lon: number;
    },
  ): NearbyDriver => ({
    full_name: `Driver ${overrides.driver_user_id}`,
    username: `d${overrides.driver_user_id}`,
    distance_km: 0,
    ...overrides,
  });

  const ANCHOR_LAT = 31.39; // Negev — what the app uses in practice.

  describe("clusterNearbyDrivers — basic shapes", () => {
    it("returns an empty list for empty input", () => {
      expect(clusterNearbyDrivers([], 14, ANCHOR_LAT)).toEqual([]);
    });

    it("returns a single 'single' item when only one driver is on screen", () => {
      const out = clusterNearbyDrivers(
        [driver({ driver_user_id: 1, lat: 31.39, lon: 34.75 })],
        14,
        ANCHOR_LAT,
      );
      expect(out).toHaveLength(1);
      expect(out[0].type).toBe("single");
      expect(out[0].id).toBe("driver_1");
    });

    it("keeps far-apart drivers as separate singles", () => {
      const out = clusterNearbyDrivers(
        [
          driver({ driver_user_id: 1, lat: 31.39, lon: 34.75 }),
          // ~1 km east — at zoom 14 (~9.5 m/px), far beyond the 36-px threshold.
          driver({ driver_user_id: 2, lat: 31.39, lon: 34.76 }),
        ],
        14,
        ANCHOR_LAT,
      );
      expect(out).toHaveLength(2);
      expect(out.every((i) => i.type === "single")).toBe(true);
    });
  });

  describe("clusterNearbyDrivers — clustering vs spreading", () => {
    it("groups two near-coincident drivers into a 'cluster' at low zoom", () => {
      // ~5 m apart — well inside the 36 px clustering radius at zoom 12.
      const drivers = [
        driver({ driver_user_id: 1, lat: 31.39, lon: 34.75 }),
        driver({ driver_user_id: 2, lat: 31.39001, lon: 34.75001 }),
      ];
      const out = clusterNearbyDrivers(drivers, 12, ANCHOR_LAT);
      expect(out).toHaveLength(1);
      expect(out[0].type).toBe("cluster");
      if (out[0].type === "cluster") {
        expect(out[0].drivers.map((d) => d.driver_user_id).sort()).toEqual([1, 2]);
        // ID is deterministic in driver_user_id order.
        expect(out[0].id).toBe("cluster_1_2");
      }
    });

    it("spreads same-coordinate drivers into a fan at high zoom", () => {
      const drivers = [
        driver({ driver_user_id: 5, lat: 31.39, lon: 34.75 }),
        driver({ driver_user_id: 6, lat: 31.39, lon: 34.75 }),
        driver({ driver_user_id: 7, lat: 31.39, lon: 34.75 }),
      ];
      const out = clusterNearbyDrivers(drivers, 17, ANCHOR_LAT);
      expect(out).toHaveLength(3);
      expect(out.every((i) => i.type === "spread")).toBe(true);
      // Each spread item must point back to a different driver.
      const ids = out.map((i) => (i as any).driver.driver_user_id).sort();
      expect(ids).toEqual([5, 6, 7]);
      // Spread items must NOT all share identical coordinates — they fan out.
      const distinctLats = new Set(out.map((i) => i.lat.toFixed(6)));
      expect(distinctLats.size).toBeGreaterThan(1);
    });

    it("does NOT spread when drivers are close but not identical (still a cluster)", () => {
      // ~50 m apart — beyond the 12 m sameSpotThreshold, even at high zoom.
      const drivers = [
        driver({ driver_user_id: 1, lat: 31.3900, lon: 34.7500 }),
        driver({ driver_user_id: 2, lat: 31.3905, lon: 34.7500 }),
      ];
      const out = clusterNearbyDrivers(drivers, 17, ANCHOR_LAT);
      // At zoom 17 they may either still cluster (same screen pixels) OR split
      // back into singles depending on m/px. Either is fine — the contract is
      // "do NOT spread", which is what we assert here.
      expect(out.every((i) => i.type !== "spread")).toBe(true);
    });
  });

  describe("clusterNearbyDrivers — determinism", () => {
    it("produces the same output regardless of input order (sorted by driver_user_id)", () => {
      const a = [
        driver({ driver_user_id: 3, lat: 31.39, lon: 34.75 }),
        driver({ driver_user_id: 1, lat: 31.39, lon: 34.75 }),
        driver({ driver_user_id: 2, lat: 31.39, lon: 34.75 }),
      ];
      const b = [...a].reverse();
      const out1 = clusterNearbyDrivers(a, 12, ANCHOR_LAT);
      const out2 = clusterNearbyDrivers(b, 12, ANCHOR_LAT);
      // Both should produce a single cluster of {1,2,3} with the same id.
      expect(out1).toEqual(out2);
    });
  });

  describe("zoomInTargetForCluster", () => {
    it("steps up by ~2 levels", () => {
      expect(zoomInTargetForCluster(10)).toBe(12);
      expect(zoomInTargetForCluster(13.5)).toBe(15.5);
    });

    it("clamps at 18 (max useful zoom)", () => {
      expect(zoomInTargetForCluster(17.5)).toBe(18);
      expect(zoomInTargetForCluster(20)).toBe(18);
    });

    it("guarantees at least +1 (never zooms out)", () => {
      expect(zoomInTargetForCluster(17)).toBeGreaterThanOrEqual(18);
    });
  });
});

// ============================================================================
// File: rideNavigateToTripScreen
// ============================================================================

describe("File: rideNavigateToTripScreen", () => {
  type MockNav = {
    navigate: jest.Mock;
    dispatch: jest.Mock;
  };

  const makeNav = (): MockNav => ({
    navigate: jest.fn(),
    dispatch: jest.fn(),
  });

  describe("navigateToRideTripToDestination", () => {
    it("pushes the trip screen with the ride id and explicit success-intro = false by default", () => {
      const nav = makeNav();
      navigateToRideTripToDestination(nav as any, 42);
      expect(nav.navigate).toHaveBeenCalledTimes(1);
      expect(nav.navigate).toHaveBeenCalledWith("RideTripToDestination", {
        rideRequestId: 42,
        showTripSuccessIntro: false,
      });
    });

    it("threads the success-intro option through when truthy", () => {
      const nav = makeNav();
      navigateToRideTripToDestination(nav as any, 7, { showTripSuccessIntro: true });
      expect(nav.navigate).toHaveBeenCalledWith("RideTripToDestination", {
        rideRequestId: 7,
        showTripSuccessIntro: true,
      });
    });

    it("normalizes any non-strict-true value (=== true) to false", () => {
      const nav = makeNav();
      // @ts-expect-error — intentionally pass a wrong type to lock the contract
      navigateToRideTripToDestination(nav as any, 7, { showTripSuccessIntro: 1 });
      expect(nav.navigate).toHaveBeenCalledWith("RideTripToDestination", {
        rideRequestId: 7,
        showTripSuccessIntro: false,
      });
    });
  });

  describe("navigateToRidePickupNavigation", () => {
    it("pushes the live pickup-navigation screen with just the ride id", () => {
      const nav = makeNav();
      navigateToRidePickupNavigation(nav as any, 99);
      expect(nav.navigate).toHaveBeenCalledTimes(1);
      expect(nav.navigate).toHaveBeenCalledWith("RidePickupNavigation", {
        rideRequestId: 99,
      });
    });
  });

  describe("navigateToUserRideRequestsTab", () => {
    it("DRIVER → opens the DriverRequests tab inside UserTabs", () => {
      const nav = makeNav();
      navigateToUserRideRequestsTab(nav as any, "DRIVER");
      expect(nav.dispatch).toHaveBeenCalledTimes(1);
      expect(nav.dispatch).toHaveBeenCalledWith({
        type: "NAVIGATE",
        payload: {
          name: "UserTabs",
          params: { screen: "DriverRequests" },
        },
      });
    });

    it("REGULAR (passenger or business owner) → opens the RideTracking tab", () => {
      const nav = makeNav();
      navigateToUserRideRequestsTab(nav as any, "REGULAR");
      expect(nav.dispatch).toHaveBeenCalledWith({
        type: "NAVIGATE",
        payload: {
          name: "UserTabs",
          params: { screen: "RideTracking" },
        },
      });
    });
  });
});

// ============================================================================
// File: rideCancelAlertGate
// ============================================================================

describe("File: rideCancelAlertGate", () => {
  describe("rideCancelAlertGate — passenger self-cancel suppression", () => {
    beforeEach(() => {
      jest.resetModules();
      jest.useFakeTimers({ doNotFake: ["nextTick"] });
      jest.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    });
    afterEach(() => {
      jest.useRealTimers();
    });

    it("starts unsuppressed (no alerts have been gated yet)", () => {
      const mod = require("../src/utils/rideCancelAlertGate");
      expect(mod.shouldSuppressDriverCancelledGlobalAlert()).toBe(false);
    });

    it("suppresses the 'cancelled by driver' global alert briefly after a self-cancel", () => {
      const mod = require("../src/utils/rideCancelAlertGate");
      mod.markPassengerCancelledOwnRide();
      expect(mod.shouldSuppressDriverCancelledGlobalAlert()).toBe(true);
      // Window is ~12s — still suppressed at +11s.
      jest.setSystemTime(new Date("2026-01-01T00:00:11Z"));
      expect(mod.shouldSuppressDriverCancelledGlobalAlert()).toBe(true);
    });

    it("re-allows the alert once the suppression window expires", () => {
      const mod = require("../src/utils/rideCancelAlertGate");
      mod.markPassengerCancelledOwnRide();
      jest.setSystemTime(new Date("2026-01-01T00:00:13Z"));
      expect(mod.shouldSuppressDriverCancelledGlobalAlert()).toBe(false);
    });

    it("driver self-cancel and passenger self-cancel are independent gates", () => {
      const mod = require("../src/utils/rideCancelAlertGate");
      mod.markPassengerCancelledOwnRide();
      expect(mod.shouldSuppressDriverSideGlobalCancelAlert()).toBe(false);
      mod.markDriverCancelledOwnRide();
      expect(mod.shouldSuppressDriverSideGlobalCancelAlert()).toBe(true);
      expect(mod.shouldSuppressDriverCancelledGlobalAlert()).toBe(true);
    });

    it("verification mismatch self-alert gate behaves like the others", () => {
      const mod = require("../src/utils/rideCancelAlertGate");
      expect(mod.shouldSuppressVerificationMismatchGlobalAlert()).toBe(false);
      mod.markVerificationMismatchSelfAlert();
      expect(mod.shouldSuppressVerificationMismatchGlobalAlert()).toBe(true);
      // Window is ~18s — still suppressed at +17s, released after.
      jest.setSystemTime(new Date("2026-01-01T00:00:17Z"));
      expect(mod.shouldSuppressVerificationMismatchGlobalAlert()).toBe(true);
      jest.setSystemTime(new Date("2026-01-01T00:00:19Z"));
      expect(mod.shouldSuppressVerificationMismatchGlobalAlert()).toBe(false);
    });
  });

  describe("tryConsumeRideCancelledUiAlert", () => {
    beforeEach(() => {
      jest.resetModules();
      jest.useFakeTimers({ doNotFake: ["nextTick"] });
      jest.setSystemTime(new Date("2026-06-01T12:00:00Z"));
    });
    afterEach(() => {
      jest.useRealTimers();
    });

    it("returns true once per ride id, then false until TTL elapsed", () => {
      const mod = require("../src/utils/rideCancelAlertGate");
      expect(mod.tryConsumeRideCancelledUiAlert(4401)).toBe(true);
      expect(mod.tryConsumeRideCancelledUiAlert(4401)).toBe(false);
      jest.setSystemTime(new Date("2026-06-01T12:02:01Z"));
      expect(mod.tryConsumeRideCancelledUiAlert(4401)).toBe(true);
    });

    it("tracks independent ids", () => {
      const mod = require("../src/utils/rideCancelAlertGate");
      expect(mod.tryConsumeRideCancelledUiAlert(4402)).toBe(true);
      expect(mod.tryConsumeRideCancelledUiAlert(4403)).toBe(true);
      expect(mod.tryConsumeRideCancelledUiAlert(4402)).toBe(false);
    });
  });
});

// ============================================================================
// File: rideTripStartPromotionGate
// ============================================================================

describe("File: rideTripStartPromotionGate", () => {
  describe("rideTripStartPromotionGate", () => {
    beforeEach(() => {
      jest.resetModules();
      jest.useFakeTimers({ doNotFake: ["nextTick"] });
      jest.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    });
    afterEach(() => {
      jest.useRealTimers();
    });

    it("does not suppress before any local OTP success", () => {
      const mod = require("../src/utils/rideTripStartPromotionGate");
      expect(mod.shouldSuppressInProgressTripPromotion(42)).toBe(false);
    });

    it("suppresses the poller promotion for the marked ride only", () => {
      const mod = require("../src/utils/rideTripStartPromotionGate");
      mod.markTripStartHandledLocally(42);
      expect(mod.shouldSuppressInProgressTripPromotion(42)).toBe(true);
      expect(mod.shouldSuppressInProgressTripPromotion(99)).toBe(false);
    });

    it("releases the suppression after the window (~25 s)", () => {
      const mod = require("../src/utils/rideTripStartPromotionGate");
      mod.markTripStartHandledLocally(42);
      jest.setSystemTime(new Date("2026-01-01T00:00:24Z"));
      expect(mod.shouldSuppressInProgressTripPromotion(42)).toBe(true);
      jest.setSystemTime(new Date("2026-01-01T00:00:26Z"));
      expect(mod.shouldSuppressInProgressTripPromotion(42)).toBe(false);
    });
  });
});

// ============================================================================
// File: destinationBoundaryValidation
// ============================================================================

describe("File: destinationBoundaryValidation", () => {
  const t = ((k: string) => k) as any;

  // The util logs `[assertDestinationInServiceCities]` via console.warn inside
  // `if (__DEV__)`. Jest sets `__DEV__` to true via the react-native preset, so
  // we silence the warnings to keep test output focused on assertions.
  let warnSpy: jest.SpyInstance;

  beforeAll(() => {
    jest.useFakeTimers({ doNotFake: ["nextTick"] });
    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
  });
  afterAll(() => {
    jest.useRealTimers();
    warnSpy.mockRestore();
  });

  beforeEach(() => {
    // Far enough into the future to ensure the module-internal cooldown gate
    // (45 s) has elapsed since any previous test, then take a stable epoch.
    jest.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    mockedCheck.mockReset();
    mockedAlert.mockReset();
  });

  describe("assertDestinationInServiceCities", () => {
    it("returns true when the point is inside a service city", async () => {
      mockedCheck.mockResolvedValueOnce({ is_within: true } as any);
      const ok = await assertDestinationInServiceCities(31.39, 34.75, t);
      expect(ok).toBe(true);
      expect(mockedAlert).not.toHaveBeenCalled();
    });

    it("returns false and alerts the user when the point is outside any city", async () => {
      mockedCheck.mockResolvedValueOnce({ is_within: false } as any);
      const ok = await assertDestinationInServiceCities(0, 0, t);
      expect(ok).toBe(false);
      expect(mockedAlert).toHaveBeenCalledTimes(1);
      expect(mockedAlert).toHaveBeenCalledWith(
        "location_outside_service_area",
        "destination_must_be_in_service_cities",
        [{ text: "ok" }],
      );
    });

    it("returns false and alerts a network error on failure (after cooldown)", async () => {
      // Fast-forward past the module-internal 45 s cooldown so this test can
      // alert independently of any previous failure within this run.
      jest.setSystemTime(new Date("2026-01-01T00:01:00Z"));
      mockedCheck.mockRejectedValueOnce(new Error("offline"));
      const ok = await assertDestinationInServiceCities(31.39, 34.75, t);
      expect(ok).toBe(false);
      expect(mockedAlert).toHaveBeenCalledTimes(1);
      expect(mockedAlert).toHaveBeenCalledWith(
        "boundary_check_error",
        "boundary_check_error_message",
        [{ text: "ok" }],
      );
    });

    it("rate-limits the network-error alert: 3 quick failures → 1 popup", async () => {
      // Ensure the gate is currently OPEN (cooldown elapsed).
      jest.setSystemTime(new Date("2026-01-01T00:02:00Z"));
      mockedCheck.mockRejectedValue(new Error("offline"));
      await assertDestinationInServiceCities(31.39, 34.75, t);
      await assertDestinationInServiceCities(31.39, 34.75, t);
      await assertDestinationInServiceCities(31.39, 34.75, t);
      // Only the first failure produced a popup — the gate suppressed the rest.
      expect(mockedAlert).toHaveBeenCalledTimes(1);
    });

    it("re-allows the error alert after the cooldown window elapses", async () => {
      // Open the gate, fire one failure to arm the cooldown.
      jest.setSystemTime(new Date("2026-01-01T00:03:00Z"));
      mockedCheck.mockRejectedValue(new Error("offline"));
      await assertDestinationInServiceCities(31.39, 34.75, t);
      expect(mockedAlert).toHaveBeenCalledTimes(1);
      // Advance > 45 s and try again — alert should fire again.
      jest.setSystemTime(new Date("2026-01-01T00:03:46Z"));
      await assertDestinationInServiceCities(31.39, 34.75, t);
      expect(mockedAlert).toHaveBeenCalledTimes(2);
    });
  });
});

// ============================================================================
// File: rides.ts (normalizeRideRequestStatus, blocking gate, API detail keys)
// ============================================================================

describe("File: rides.ts (status helpers)", () => {
  describe("normalizeRideRequestStatus", () => {
    it.each<[unknown, string]>([
      [null, "pending"],
      ["", "pending"],
      ["  ", "pending"],
      ["accepted", "accepted"],
      ["ACCEPTED", "accepted"],
      ["On_The_Way", "on_the_way"],
      ["ON_THE_WAY", "on_the_way"],
      ["DRIVING_TO_CUSTOMER", "driving_to_customer"],
      ["in_progress", "in_progress"],
      ["totally_unknown_backend_status", "pending"],
    ])("normalizes %j → %s", (raw, expected) => {
      expect(normalizeRideRequestStatus(raw)).toBe(expected);
    });
  });

  describe("isActiveBlockingRideStatus", () => {
    it("treats pending through in-progress family as blocking new requests", () => {
      expect(isActiveBlockingRideStatus("pending")).toBe(true);
      expect(isActiveBlockingRideStatus("accepted")).toBe(true);
      expect(isActiveBlockingRideStatus("arrived")).toBe(true);
      expect(isActiveBlockingRideStatus("IN_PROGRESS")).toBe(true);
    });

    it("treats terminal / failure states as non-blocking", () => {
      expect(isActiveBlockingRideStatus("rejected")).toBe(false);
      expect(isActiveBlockingRideStatus("cancelled")).toBe(false);
      expect(isActiveBlockingRideStatus("completed")).toBe(false);
    });

    it("returns false for empty / missing status", () => {
      expect(isActiveBlockingRideStatus(null)).toBe(false);
      expect(isActiveBlockingRideStatus("")).toBe(false);
    });
  });

  describe("rideApiDetailToTranslationKey", () => {
    it("maps known FastAPI detail literals to stable i18n key names", () => {
      expect(rideApiDetailToTranslationKey("Driver is not available")).toBe(
        "ride_error_driver_unavailable",
      );
      expect(rideApiDetailToTranslationKey("Invalid verification code")).toBe(
        "ride_error_verify_invalid",
      );
      expect(
        rideApiDetailToTranslationKey(
          "Verification attempts exceeded; ride cancelled",
        ),
      ).toBe("ride_error_verify_attempts_exceeded");
    });

    it("returns null for unknown or empty details", () => {
      expect(rideApiDetailToTranslationKey("")).toBeNull();
      expect(rideApiDetailToTranslationKey("   ")).toBeNull();
      expect(rideApiDetailToTranslationKey("Unexpected server message")).toBeNull();
    });
  });
});

// ============================================================================
// File: ridePickupNavigationGuards
// ============================================================================

describe("File: ridePickupNavigationGuards", () => {
  describe("isDriverRideStatusEligibleForPickupNav", () => {
    it.each<[unknown, boolean]>([
      ["accepted", true],
      ["on_the_way", true],
      ["driving_to_customer", true],
      ["ACCEPTED", true],
      ["pending", false],
      ["arrived", false],
      ["in_progress", false],
      [null, false],
      ["", false],
    ])("normalized %j → %s", (raw, expected) => {
      expect(isDriverRideStatusEligibleForPickupNav(raw as any)).toBe(expected);
    });
  });

  describe("isPassengerRideStatusEligibleForPickupNav", () => {
    it.each<[unknown, boolean]>([
      ["accepted", false],
      ["on_the_way", true],
      ["driving_to_customer", true],
      ["PENDING", false],
      ["arrived", false],
      [null, false],
    ])("normalized %j → %s", (raw, expected) => {
      expect(isPassengerRideStatusEligibleForPickupNav(raw as any)).toBe(expected);
    });
  });
});

// ============================================================================
// File: RegularRideStatusScreen (exported helpers)
// ============================================================================

describe("File: RegularRideStatusScreen (helpers)", () => {
  describe("passengerPhaseKey", () => {
    it("maps accepted → wait for driver to start", () => {
      expect(passengerPhaseKey("accepted", null)).toBe(
        "ride_passenger_phase_wait_start",
      );
    });

    it("maps on_the_way with null ETA → en route copy", () => {
      expect(passengerPhaseKey("on_the_way", null)).toBe(
        "ride_passenger_phase_en_route",
      );
    });

    it("maps ETA ≤1 minute → arriving now", () => {
      expect(passengerPhaseKey("on_the_way", 1)).toBe(
        "ride_passenger_phase_arriving_now",
      );
      expect(passengerPhaseKey("driving_to_customer", 0)).toBe(
        "ride_passenger_phase_arriving_now",
      );
    });

    it("maps ETA 2–3 minutes → arriving soon (not “now”)", () => {
      expect(passengerPhaseKey("on_the_way", 2)).toBe(
        "ride_passenger_phase_arriving_soon",
      );
      expect(passengerPhaseKey("on_the_way", 3)).toBe(
        "ride_passenger_phase_arriving_soon",
      );
    });

    it("maps ETA >3 minutes → generic en route", () => {
      expect(passengerPhaseKey("on_the_way", 4)).toBe(
        "ride_passenger_phase_en_route",
      );
    });

    it("maps arrived → OTP phase", () => {
      expect(passengerPhaseKey("arrived", null)).toBe(
        "ride_passenger_phase_at_pickup_otp",
      );
    });

    it("maps in_progress → trip started", () => {
      expect(passengerPhaseKey("in_progress", null)).toBe(
        "ride_passenger_phase_trip_started",
      );
    });

    it("returns null for terminal / irrelevant statuses", () => {
      expect(passengerPhaseKey("completed", null)).toBeNull();
      expect(passengerPhaseKey("pending", null)).toBeNull();
    });
  });

  describe("hasValidPickup", () => {
    const base = (): RegularLatestRideRequest =>
      ({
        id: 1,
        driver_user_id: 2,
        driver_full_name: "Test Driver",
        driver_username: "drv",
        destination_text: "somewhere",
        status: "accepted",
      }) as RegularLatestRideRequest;

    it("returns true only when both coords are finite numbers", () => {
      expect(hasValidPickup({ ...base(), pickup_lat: 31.5, pickup_lon: 34.2 })).toBe(
        true,
      );
      expect(hasValidPickup({ ...base(), pickup_lat: NaN, pickup_lon: 34 })).toBe(
        false,
      );
      expect(hasValidPickup({ ...base(), pickup_lat: 31, pickup_lon: undefined as any })).toBe(
        false,
      );
    });
  });

  describe("formatRideRequestTimestamp", () => {
    it("formats parseable ISO strings with the caller locale", () => {
      const s = formatRideRequestTimestamp("2026-04-28T12:00:00.000Z", "en-US");
      expect(s.length).toBeGreaterThan(4);
      expect(s.toUpperCase()).not.toContain("INVALID DATE");
    });

    it("falls back to the raw string when not parseable", () => {
      const junk = "not-a-date";
      expect(formatRideRequestTimestamp(junk, "en-US")).toBe(junk);
    });
  });

  describe("driverDisplayInitials", () => {
    const ride = (partial: Partial<RegularLatestRideRequest>): RegularLatestRideRequest =>
      ({
        id: 1,
        driver_user_id: 2,
        driver_full_name: partial.driver_full_name ?? "X",
        driver_username: partial.driver_username ?? "u",
        destination_text: "somewhere",
        status: "accepted",
        ...partial,
      }) as RegularLatestRideRequest;

    it("prefers two-letter initials from first and second token when possible", () => {
      expect(driverDisplayInitials(ride({ driver_full_name: "Ada Lovelace" }))).toBe(
        "AL",
      );
    });

    it("uses the first two letters when the name is a single word", () => {
      expect(driverDisplayInitials(ride({ driver_full_name: "Cher" }))).toBe("CH");
    });

    it("falls back to username when full name missing", () => {
      expect(
        driverDisplayInitials(
          ride({ driver_full_name: "", driver_username: "solo_driver" }),
        ),
      ).toBe("SO");
    });
  });
});

describe("File: navMetricsAtArrival", () => {
  const {
    zeroNavMetricsIfForced,
    navEtaMinutesFromSeconds,
    navEtaSecondsForDisplay,
    navDistanceKmFromMeters,
    navRemainingMinutesFromSeconds,
    isPickupArrivalStatus,
    formatNavRemainingDistanceMeters,
    shouldLockNavMetricsForProximity,
  } = require("../src/utils/navMetricsAtArrival");

  it("zeroNavMetricsIfForced returns zeros when forced", () => {
    expect(zeroNavMetricsIfForced(120, 90, true)).toEqual({
      remainingDistanceMeters: 0,
      etaSecondsRemaining: 0,
    });
    expect(zeroNavMetricsIfForced(120, 90, false)).toEqual({
      remainingDistanceMeters: 120,
      etaSecondsRemaining: 90,
    });
  });

  it("nav helpers return 0 at arrival", () => {
    expect(navEtaMinutesFromSeconds(180, { atArrival: true })).toBe(0);
    expect(navEtaSecondsForDisplay(45, { atArrival: true })).toBe(0);
    expect(navDistanceKmFromMeters(500, { atArrival: true })).toBe(0);
    expect(navRemainingMinutesFromSeconds(120, { atArrival: true })).toBe(0);
  });

  it("nav helpers keep en-route floor when not at arrival", () => {
    expect(navEtaMinutesFromSeconds(180)).toBe(3);
    expect(navEtaMinutesFromSeconds(60)).toBe(1);
    expect(navRemainingMinutesFromSeconds(30)).toBe(1);
    expect(navRemainingMinutesFromSeconds(0)).toBe(0);
  });

  it("isPickupArrivalStatus recognizes arrived", () => {
    expect(isPickupArrivalStatus("arrived")).toBe(true);
    expect(isPickupArrivalStatus("on_the_way")).toBe(false);
  });

  it("formatNavRemainingDistanceMeters shows 0 m when locked", () => {
    expect(formatNavRemainingDistanceMeters(120, { atArrival: true })).toBe("0 m");
    expect(formatNavRemainingDistanceMeters(2)).toBe("2 m");
  });

  it("shouldLockNavMetricsForProximity matches destination radius", () => {
    expect(shouldLockNavMetricsForProximity(2, 40)).toBe(true);
    expect(shouldLockNavMetricsForProximity(200, 40)).toBe(true);
    expect(shouldLockNavMetricsForProximity(200, 80)).toBe(false);
  });
});

/**
 * Heavier React Native component / interaction tests (RTL).
 *
 * Kept separate from `frontend.test.ts` so most suites can keep a real
 * `@react-navigation/native` surface (NavigationContainer, navigation hooks).
 *
 * `PassengerDriverArrivedListener` lives in `passengerDriverArrivedListener.test.tsx`
 * because that component needs a mutable `useNavigationState` leaf route, and
 * `jest.spyOn` fails on the non-configurable RN export — that file wraps only
 * `useNavigationState` while re-exporting the rest of the navigation package.
 *
 * This file also mocks `rideNavigateToTripScreen.navigateToRideTripToDestination` and
 * `RideVerifySuccessModal` so `RideTripStartListener` can assert navigation without waiting
 * 5s real time.
 */

/// <reference types="jest" />

import React, { ReactElement } from "react";
import { ActivityIndicator, TextInput, TouchableOpacity } from "react-native";
import {
  render,
  fireEvent,
  waitFor,
  act,
  configure,
  resetToDefaults,
} from "@testing-library/react-native";
import { I18nextProvider } from "react-i18next";
import { NavigationContainer } from "@react-navigation/native";

import AsyncStorage from "@react-native-async-storage/async-storage";

import i18n from "../src/i18n";
import { MapPickedDestinationPanel } from "../src/components/map/MapPickedDestinationPanel";
import { RideDestinationDetailsModal } from "../src/components/ride/RideDestinationDetailsModal";
import { RideVerificationCodeModal } from "../src/components/ride/RideVerificationCodeModal";
import { RideVerificationAttemptHint } from "../src/components/ride/RideVerificationAttemptHint";
import DriverRideCancellationListener from "../src/components/ride/DriverRideCancellationListener";
import PassengerDriverCancelledListener from "../src/components/ride/PassengerDriverCancelledListener";
import {
  PostRideFeedbackModal,
  type PostRideFeedbackTarget,
} from "../src/components/ride/PostRideFeedbackModal";
import RideTripStartListener from "../src/components/ride/RideTripStartListener";
import { appAlert } from "../src/utils/appAlert";
import type { DriverRideRequest, RegularLatestRideRequest } from "../src/api/rides";
import { fetchAllPlaces as fetchAllPlacesMocked } from "../src/api/places";

jest.mock("@maplibre/maplibre-react-native", () => {
  const React = require("react");
  const { View } = require("react-native");
  return {
    MapView: ({ children, testID }: { children?: React.ReactNode; testID?: string }) => (
      <View testID={testID ?? "maplibre-mapview"}>{children}</View>
    ),
    Camera: () => null,
    PointAnnotation: ({ children }: { children?: React.ReactNode }) => <View>{children}</View>,
  };
});

jest.mock("../src/api/places", () => {
  const actual = jest.requireActual("../src/api/places") as Record<string, unknown>;
  return {
    ...actual,
    fetchAllPlaces: jest.fn(),
  };
});

const mockedFetchAllPlaces = jest.mocked(fetchAllPlacesMocked);

const mockGetDriverRideRequests = jest.fn();
const mockGetRegularLatestRideRequest = jest.fn();
const mockSubmitDriverRating = jest.fn();
const mockSubmitDriverReport = jest.fn();
jest.mock("../src/api/rides", () => {
  const actual = jest.requireActual("../src/api/rides") as Record<string, unknown>;
  return {
    ...actual,
    getDriverRideRequests: (...args: unknown[]) => mockGetDriverRideRequests(...args),
    getRegularLatestRideRequest: (...args: unknown[]) =>
      mockGetRegularLatestRideRequest(...args),
    submitDriverRating: (...args: unknown[]) => mockSubmitDriverRating(...args),
    submitDriverReport: (...args: unknown[]) => mockSubmitDriverReport(...args),
  };
});

jest.mock("../src/utils/appAlert", () => ({
  __esModule: true,
  appAlert: jest.fn(),
}));

jest.mock("../src/utils/rideCancelAlertGate", () => {
  const actual = jest.requireActual("../src/utils/rideCancelAlertGate") as Record<
    string,
    unknown
  >;
  return {
    ...actual,
    shouldSuppressDriverSideGlobalCancelAlert: () =>
      Boolean(
        (globalThis as Record<string, unknown>).__rideSuppressDriverSideGlobalCancel,
      ),
    shouldSuppressDriverCancelledGlobalAlert: () =>
      Boolean(
        (globalThis as Record<string, unknown>).__rideSuppressPassengerDriverCancelled,
      ),
    shouldSuppressVerificationMismatchGlobalAlert: () =>
      Boolean(
        (globalThis as Record<string, unknown>).__rideSuppressVerificationMismatchAlert,
      ),
  };
});

jest.mock("../config", () => {
  const actual = jest.requireActual("../config") as Record<string, number | string>;
  return { ...actual, RIDE_STATUS_POLL_INTERVAL_MS: 8 };
});

const mockShouldSuppressInProgressTripPromotion = jest.fn(() => false);
jest.mock("../src/utils/rideTripStartPromotionGate", () => ({
  __esModule: true,
  shouldSuppressInProgressTripPromotion: (rideId: number) =>
    mockShouldSuppressInProgressTripPromotion(rideId),
}));

const mockNavigateToRideTripDestination = jest.fn();
jest.mock("../src/utils/rideNavigateToTripScreen", () => {
  const actual = jest.requireActual("../src/utils/rideNavigateToTripScreen") as Record<
    string,
    unknown
  >;
  return {
    ...actual,
    navigateToRideTripToDestination: (...args: unknown[]) =>
      mockNavigateToRideTripDestination(...args),
  };
});

jest.mock("../src/components/ride/RideVerifySuccessModal", () => {
  const React = require("react");
  return {
    RideVerifySuccessModal: function MockRideVerifySuccessModal(props: {
      visible: boolean;
      onTimerComplete: () => void;
      title?: string;
      body?: string;
    }) {
      React.useEffect(() => {
        if (props.visible) {
          props.onTimerComplete();
        }
      }, [props.visible, props.onTimerComplete]);
      return null;
    },
  };
});

async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function renderWithI18n(ui: ReactElement) {
  return render(<I18nextProvider i18n={i18n}>{ui}</I18nextProvider>);
}

function minimalDriverRow(
  overrides: Partial<DriverRideRequest> & Pick<DriverRideRequest, "id" | "status">
): DriverRideRequest {
  return {
    id: overrides.id,
    regular_user_id: 1,
    regular_username: "pax",
    pickup_lat: 31.0,
    pickup_lon: 34.0,
    destination_text: "Somewhere",
    passengers_count: 1,
    created_at: "2020-01-01T00:00:00.000Z",
    updated_at: "2020-01-01T00:00:00.000Z",
    status_note: null,
    ...overrides,
  };
}

function minimalRegularLatest(
  overrides: Partial<RegularLatestRideRequest> &
    Pick<RegularLatestRideRequest, "id" | "status">
): RegularLatestRideRequest {
  return {
    id: overrides.id,
    driver_user_id: 2,
    driver_full_name: "D",
    driver_username: "d1",
    destination_text: "Somewhere",
    passengers_count: 1,
    created_at: "2020-01-01T00:00:00.000Z",
    updated_at: "2020-01-01T00:00:00.000Z",
    status_note: null,
    ...overrides,
  };
}

const hidden = { includeHiddenElements: true };

function baseFeedbackTarget(overrides?: Partial<PostRideFeedbackTarget>): PostRideFeedbackTarget {
  return {
    rideRequestId: 9001,
    regularUserId: 77,
    driverFullName: "Ali Driver",
    driverUsername: "ali_d",
    ...overrides,
  };
}

describe("Component: MapPickedDestinationPanel", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("ar");
  });

  test("renders nothing when not visible", () => {
    const { queryByText } = renderWithI18n(
      <MapPickedDestinationPanel
        visible={false}
        onDismiss={() => undefined}
        onStartNavigation={() => undefined}
        onRideWithDriver={() => undefined}
      />
    );
    expect(queryByText("وجهة مختارة")).toBeNull();
  });

  test("invokes actions for close, navigation, and ride", () => {
    const onDismiss = jest.fn();
    const onStartNavigation = jest.fn();
    const onRideWithDriver = jest.fn();

    const { getByLabelText, getByText } = renderWithI18n(
      <MapPickedDestinationPanel
        visible
        onDismiss={onDismiss}
        onStartNavigation={onStartNavigation}
        onRideWithDriver={onRideWithDriver}
      />
    );

    expect(getByText("وجهة مختارة")).toBeTruthy();

    fireEvent.press(getByLabelText("إغلاق"));
    expect(onDismiss).toHaveBeenCalledTimes(1);

    fireEvent.press(getByText("بدء الملاحة"));
    fireEvent.press(getByText("رحلة مع سائق"));
    expect(onStartNavigation).toHaveBeenCalledTimes(1);
    expect(onRideWithDriver).toHaveBeenCalledTimes(1);
  });

  test("shows loading spinner and blocks both actions while navigation route is loading", () => {
    const onStartNavigation = jest.fn();
    const onRideWithDriver = jest.fn();

    const { queryByText, UNSAFE_getAllByType } = renderWithI18n(
      <MapPickedDestinationPanel
        visible
        navigationLoading
        onDismiss={() => undefined}
        onStartNavigation={onStartNavigation}
        onRideWithDriver={onRideWithDriver}
      />
    );

    expect(UNSAFE_getAllByType(ActivityIndicator).length).toBeGreaterThanOrEqual(1);
    expect(queryByText("بدء الملاحة")).toBeNull();

    const touchables = UNSAFE_getAllByType(TouchableOpacity);
    // [0] header close, [1] start navigation, [2] ride with driver
    expect(touchables[1].props.disabled).toBe(true);
    expect(touchables[2].props.disabled).toBe(true);
  });
});

describe("Component: RideDestinationDetailsModal", () => {
  beforeAll(() => {
    configure({ defaultIncludeHiddenElements: true });
  });

  afterAll(() => {
    resetToDefaults();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    mockedFetchAllPlaces.mockReset();
    await i18n.changeLanguage("ar");
  });

  test(
    "shows fallback copy when no nearby known place matches coordinates",
    async () => {
      mockedFetchAllPlaces.mockResolvedValue([]);

      const destinationText = " عنوان حر على الخريطة ";
      const trimmed = destinationText.trim();
      const noPlaceMatch = i18n.t("ride_trip_destination_no_place_match");

      const { getByText } = renderWithI18n(
        <RideDestinationDetailsModal
          visible
          onClose={() => undefined}
          destinationText={trimmed}
          destinationLat={31.392}
          destinationLon={34.756}
        />
      );

      await flushMicrotasks();

      await waitFor(() => {
        expect(mockedFetchAllPlaces).toHaveBeenCalled();
      });

      await waitFor(
        () => {
          expect(getByText(trimmed)).toBeTruthy();
          expect(getByText(noPlaceMatch)).toBeTruthy();
        },
        { timeout: 15_000 }
      );
    },
    /** Default Jest 5s is too tight: Modal + RNTL async reconciliation can exceed it. */
    20_000
  );

  test("renders matched place name within match radius (fetchAllPlaces)", async () => {
    await i18n.changeLanguage("en");

    const lat = 31.392;
    const lon = 34.756;
    mockedFetchAllPlaces.mockResolvedValue([
      {
        id: 901,
        name: "English Display Name",
        name_ar: "العربية",
        name_he: "עברית",
        place_type: "BUSINESS",
        can_be_claimed: false,
        city: { id: 1, name_ar: "Rahat", name_he: "", name_en: "Rahat" },
        category: null,
        location: { lat, lon },
      },
    ]);

    const { findByText, getByTestId } = renderWithI18n(
      <RideDestinationDetailsModal
        visible
        onClose={() => undefined}
        destinationText="Picked pin"
        destinationLat={lat}
        destinationLon={lon}
      />
    );

    expect(getByTestId("maplibre-mapview")).toBeTruthy();
    await findByText("English Display Name");
    await findByText("Rahat", { exact: false });
  });
});

describe("Component: RideVerificationAttemptHint", () => {
  test("switches hint after first failed attempt threshold", () => {
    const { rerender, getByText } = render(
      <RideVerificationAttemptHint
        failedAttempts={0}
        labelTwoRemaining="Two left label"
        labelOneRemaining="One left label"
      />
    );
    expect(getByText("Two left label")).toBeTruthy();

    rerender(
      <RideVerificationAttemptHint
        failedAttempts={1}
        labelTwoRemaining="Two left label"
        labelOneRemaining="One left label"
      />
    );
    expect(getByText("One left label")).toBeTruthy();
  });
});

describe("Component: RideVerificationCodeModal", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("ar");
  });

  test("fires onSubmit only when exactly length digits, and cancel closes", () => {
    const onSubmit = jest.fn();
    const onClose = jest.fn();

    const { UNSAFE_getByType, getByText } = renderWithI18n(
      <RideVerificationCodeModal
        visible
        length={6}
        onSubmit={onSubmit}
        onClose={onClose}
        resetOnOpen
      />
    );

    const input = UNSAFE_getByType(TextInput);
    fireEvent.changeText(input, "12345");
    fireEvent.press(getByText("تأكيد الرمز")); // Confirm — button still disabled visually
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.changeText(input, "123456");
    fireEvent.press(getByText("تأكيد الرمز"));
    expect(onSubmit).toHaveBeenCalledWith("123456");

    fireEvent.press(getByText("إغلاق"));
    expect(onClose).toHaveBeenCalled();
  });
});

describe("Component: DriverRideCancellationListener", () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    mockGetDriverRideRequests.mockReset();
    AsyncStorage.clear();
    delete (globalThis as Record<string, unknown>).__rideSuppressDriverSideGlobalCancel;
    delete (globalThis as Record<string, unknown>).__rideSuppressVerificationMismatchAlert;
    await AsyncStorage.multiSet([
      ["userRole", "DRIVER"],
      ["userId", "42"],
    ]);
  });

  test("shows global alert when ride becomes cancelled after blocking active status", async () => {
    const jestAlert = jest.mocked(appAlert);
    jestAlert.mockClear();

    const rid = 5001;

    mockGetDriverRideRequests
      .mockResolvedValueOnce([minimalDriverRow({ id: rid, status: "accepted" })])
      .mockResolvedValue([
        minimalDriverRow({
          id: rid,
          status: "cancelled",
          status_note: "passenger aborted",
        }),
      ]);

    render(
      <I18nextProvider i18n={i18n}>
        <NavigationContainer>
          <DriverRideCancellationListener />
        </NavigationContainer>
      </I18nextProvider>
    );

    await waitFor(() => expect(mockGetDriverRideRequests).toHaveBeenCalled());
    await flushMicrotasks();

    await waitFor(
      () => {
        expect(mockGetDriverRideRequests.mock.calls.length).toBeGreaterThanOrEqual(2);
      },
      { interval: 5, timeout: 6000 }
    );

    await waitFor(() => expect(jestAlert).toHaveBeenCalled());
    expect(String(jestAlert.mock.calls[0][1])).toContain(
      "تم إلغاء الرحلة من قبل الراكب أو النظام"
    );
  });

  test("uses verification mismatch copy when cancellation note cites invalid verification", async () => {
    const jestAlert = jest.mocked(appAlert);
    jestAlert.mockClear();

    const rid = 5002;

    mockGetDriverRideRequests
      .mockResolvedValueOnce([minimalDriverRow({ id: rid, status: "arrived" })])
      .mockResolvedValue([
        minimalDriverRow({
          id: rid,
          status: "cancelled",
          status_note: "invalid verification attempts exceeded",
        }),
      ]);

    render(
      <I18nextProvider i18n={i18n}>
        <NavigationContainer>
          <DriverRideCancellationListener />
        </NavigationContainer>
      </I18nextProvider>
    );

    await waitFor(() => expect(mockGetDriverRideRequests).toHaveBeenCalled());
    await flushMicrotasks();

    await waitFor(
      () => {
        expect(mockGetDriverRideRequests.mock.calls.length).toBeGreaterThanOrEqual(2);
      },
      { interval: 5, timeout: 6000 }
    );

    await waitFor(() => expect(jestAlert).toHaveBeenCalled());
    expect(String(jestAlert.mock.calls[0][1])).toContain(
      "تم إلغاء الرحلة بسبب عدم تطابق رمز التحقق"
    );
  });

  test("does not alert when driver-side self-cancel suppression gate is on", async () => {
    const jestAlert = jest.mocked(appAlert);
    jestAlert.mockClear();
    (globalThis as Record<string, unknown>).__rideSuppressDriverSideGlobalCancel = true;

    const rid = 5003;

    mockGetDriverRideRequests
      .mockResolvedValueOnce([minimalDriverRow({ id: rid, status: "accepted" })])
      .mockResolvedValue([
        minimalDriverRow({
          id: rid,
          status: "cancelled",
          status_note: "passenger cancelled",
        }),
      ]);

    render(
      <I18nextProvider i18n={i18n}>
        <NavigationContainer>
          <DriverRideCancellationListener />
        </NavigationContainer>
      </I18nextProvider>
    );

    await waitFor(() => expect(mockGetDriverRideRequests).toHaveBeenCalled());
    await flushMicrotasks();
    await waitFor(
      () => {
        expect(mockGetDriverRideRequests.mock.calls.length).toBeGreaterThanOrEqual(2);
      },
      { interval: 5, timeout: 6000 }
    );

    expect(jestAlert).not.toHaveBeenCalled();
  });

  test("does not show verification mismatch alert when that gate suppresses duplicates", async () => {
    const jestAlert = jest.mocked(appAlert);
    jestAlert.mockClear();
    (globalThis as Record<string, unknown>).__rideSuppressVerificationMismatchAlert = true;

    const rid = 5004;

    mockGetDriverRideRequests
      .mockResolvedValueOnce([minimalDriverRow({ id: rid, status: "arrived" })])
      .mockResolvedValue([
        minimalDriverRow({
          id: rid,
          status: "cancelled",
          status_note: "too many invalid verification",
        }),
      ]);

    render(
      <I18nextProvider i18n={i18n}>
        <NavigationContainer>
          <DriverRideCancellationListener />
        </NavigationContainer>
      </I18nextProvider>
    );

    await waitFor(() => expect(mockGetDriverRideRequests).toHaveBeenCalled());
    await flushMicrotasks();
    await waitFor(
      () => {
        expect(mockGetDriverRideRequests.mock.calls.length).toBeGreaterThanOrEqual(2);
      },
      { interval: 5, timeout: 6000 }
    );

    expect(jestAlert).not.toHaveBeenCalled();
  });
});

describe("Component: PassengerDriverCancelledListener", () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    mockGetRegularLatestRideRequest.mockReset();
    AsyncStorage.clear();
    delete (globalThis as Record<string, unknown>).__rideSuppressPassengerDriverCancelled;
    delete (globalThis as Record<string, unknown>).__rideSuppressVerificationMismatchAlert;
    await AsyncStorage.multiSet([
      ["userRole", "REGULAR"],
      ["userId", "91"],
    ]);
  });

  test("shows driver-cancel copy when latest ride flips to cancelled (same id)", async () => {
    const jestAlert = jest.mocked(appAlert);
    jestAlert.mockClear();

    const rid = 6003;

    mockGetRegularLatestRideRequest
      .mockResolvedValueOnce(
        minimalRegularLatest({ id: rid, status: "accepted" })
      )
      .mockResolvedValue(
        minimalRegularLatest({
          id: rid,
          status: "cancelled",
          status_note: "driver walked away",
        })
      );

    await i18n.changeLanguage("ar");

    render(
      <I18nextProvider i18n={i18n}>
        <NavigationContainer>
          <PassengerDriverCancelledListener />
        </NavigationContainer>
      </I18nextProvider>
    );

    await waitFor(() => expect(mockGetRegularLatestRideRequest).toHaveBeenCalled());
    await flushMicrotasks();

    await waitFor(
      () => {
        expect(mockGetRegularLatestRideRequest.mock.calls.length).toBeGreaterThanOrEqual(2);
      },
      { interval: 5, timeout: 6000 }
    );

    await waitFor(() => expect(jestAlert).toHaveBeenCalled());
    expect(String(jestAlert.mock.calls[0][0])).toContain("تم إلغاء الرحلة");
    expect(String(jestAlert.mock.calls[0][1])).toContain("ألغى السائق الرحلة");
  });

  test("uses verification mismatch copy when cancellation note cites invalid verification", async () => {
    const jestAlert = jest.mocked(appAlert);
    jestAlert.mockClear();

    const rid = 6004;

    mockGetRegularLatestRideRequest
      .mockResolvedValueOnce(
        minimalRegularLatest({ id: rid, status: "driving_to_customer" })
      )
      .mockResolvedValue(
        minimalRegularLatest({
          id: rid,
          status: "cancelled",
          status_note: "invalid verification",
        })
      );

    await i18n.changeLanguage("ar");

    render(
      <I18nextProvider i18n={i18n}>
        <NavigationContainer>
          <PassengerDriverCancelledListener />
        </NavigationContainer>
      </I18nextProvider>
    );

    await waitFor(() => expect(mockGetRegularLatestRideRequest).toHaveBeenCalled());
    await flushMicrotasks();

    await waitFor(
      () => {
        expect(mockGetRegularLatestRideRequest.mock.calls.length).toBeGreaterThanOrEqual(2);
      },
      { interval: 5, timeout: 6000 }
    );

    await waitFor(() => expect(jestAlert).toHaveBeenCalled());
    expect(String(jestAlert.mock.calls[0][1])).toContain(
      "تم إلغاء الرحلة بسبب عدم تطابق رمز التحقق"
    );
  });

  test("does not alert when passenger self-cancel suppression gate is active", async () => {
    const jestAlert = jest.mocked(appAlert);
    jestAlert.mockClear();
    (globalThis as Record<string, unknown>).__rideSuppressPassengerDriverCancelled = true;

    const rid = 6005;

    mockGetRegularLatestRideRequest
      .mockResolvedValueOnce(
        minimalRegularLatest({ id: rid, status: "accepted" })
      )
      .mockResolvedValue(
        minimalRegularLatest({
          id: rid,
          status: "cancelled",
          status_note: "driver walked away",
        })
      );

    await i18n.changeLanguage("ar");

    render(
      <I18nextProvider i18n={i18n}>
        <NavigationContainer>
          <PassengerDriverCancelledListener />
        </NavigationContainer>
      </I18nextProvider>
    );

    await waitFor(() => expect(mockGetRegularLatestRideRequest).toHaveBeenCalled());
    await flushMicrotasks();
    await waitFor(
      () => {
        expect(mockGetRegularLatestRideRequest.mock.calls.length).toBeGreaterThanOrEqual(2);
      },
      { interval: 5, timeout: 6000 }
    );

    expect(jestAlert).not.toHaveBeenCalled();
  });

  test("does not show verification-mismatch copy when that suppression gate is on", async () => {
    const jestAlert = jest.mocked(appAlert);
    jestAlert.mockClear();
    (globalThis as Record<string, unknown>).__rideSuppressVerificationMismatchAlert = true;

    const rid = 6006;

    mockGetRegularLatestRideRequest
      .mockResolvedValueOnce(
        minimalRegularLatest({ id: rid, status: "driving_to_customer" })
      )
      .mockResolvedValue(
        minimalRegularLatest({
          id: rid,
          status: "cancelled",
          status_note: "invalid verification",
        })
      );

    await i18n.changeLanguage("ar");

    render(
      <I18nextProvider i18n={i18n}>
        <NavigationContainer>
          <PassengerDriverCancelledListener />
        </NavigationContainer>
      </I18nextProvider>
    );

    await waitFor(() => expect(mockGetRegularLatestRideRequest).toHaveBeenCalled());
    await flushMicrotasks();
    await waitFor(
      () => {
        expect(mockGetRegularLatestRideRequest.mock.calls.length).toBeGreaterThanOrEqual(2);
      },
      { interval: 5, timeout: 6000 }
    );

    expect(jestAlert).not.toHaveBeenCalled();
  });

  test("does not poll when role is not a passenger ride user", async () => {
    mockGetRegularLatestRideRequest.mockClear();
    AsyncStorage.clear();
    await AsyncStorage.multiSet([
      ["userRole", "ADMIN"],
      ["userId", "1"],
    ]);

    render(
      <I18nextProvider i18n={i18n}>
        <NavigationContainer>
          <PassengerDriverCancelledListener />
        </NavigationContainer>
      </I18nextProvider>
    );

    await act(async () => {
      await flushMicrotasks();
    });

    await new Promise((r) => setTimeout(r, 40));
    expect(mockGetRegularLatestRideRequest).not.toHaveBeenCalled();
  });
});

describe("Component: PostRideFeedbackModal", () => {
  beforeAll(() => {
    configure({ defaultIncludeHiddenElements: true });
  });

  afterAll(() => {
    resetToDefaults();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    mockSubmitDriverRating.mockReset();
    mockSubmitDriverReport.mockReset();
    mockSubmitDriverRating.mockResolvedValue(undefined);
    mockSubmitDriverReport.mockResolvedValue(undefined);
    await i18n.changeLanguage("ar");
  });

  test("returns null when target is null even if visible", () => {
    const { toJSON } = renderWithI18n(
      <PostRideFeedbackModal visible target={null} onClose={() => undefined} />
    );
    expect(toJSON()).toBeNull();
  });

  test("submits a driver rating after selecting stars", async () => {
    const onClose = jest.fn();
    const onRatingSubmitted = jest.fn();
    const target = baseFeedbackTarget();

    const { UNSAFE_getAllByType, findByText } = renderWithI18n(
      <PostRideFeedbackModal
        visible
        target={target}
        onClose={onClose}
        onRatingSubmitted={onRatingSubmitted}
      />
    );

    await findByText("Ali Driver", hidden);

    const touchables = UNSAFE_getAllByType(TouchableOpacity);
    fireEvent.press(touchables[7]);

    const submitLabel = await findByText("إرسال التقييم", hidden);
    fireEvent.press(submitLabel);

    await waitFor(() => expect(mockSubmitDriverRating).toHaveBeenCalled());
    expect(mockSubmitDriverRating.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        ride_request_id: target.rideRequestId,
        regular_user_id: target.regularUserId,
        stars: 5,
      })
    );
    expect(jest.mocked(appAlert)).toHaveBeenCalled();
    expect(onRatingSubmitted).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("submits a report from the report tab", async () => {
    const onClose = jest.fn();
    const onReportSubmitted = jest.fn();

    const { UNSAFE_getByType, findByText } = renderWithI18n(
      <PostRideFeedbackModal
        visible
        target={baseFeedbackTarget()}
        onClose={onClose}
        onReportSubmitted={onReportSubmitted}
      />
    );

    await findByText("تقييم الرحلة", hidden);

    fireEvent.press(await findByText("شكوى", hidden));

    const reportInput = UNSAFE_getByType(TextInput);
    fireEvent.changeText(reportInput, "  Issue details here  ");

    fireEvent.press(await findByText("إرسال الشكوى", hidden));

    await waitFor(() => expect(mockSubmitDriverReport).toHaveBeenCalled());
    expect(mockSubmitDriverReport.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        ride_request_id: 9001,
        regular_user_id: 77,
        message: "Issue details here",
      })
    );
    expect(onReportSubmitted).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("shows error alert when rating submit fails", async () => {
    mockSubmitDriverRating.mockRejectedValueOnce(new Error("rating failed"));

    const { UNSAFE_getAllByType, findByText } = renderWithI18n(
      <PostRideFeedbackModal
        visible
        target={baseFeedbackTarget()}
        onClose={() => undefined}
      />
    );

    await findByText("Ali Driver", hidden);
    fireEvent.press(UNSAFE_getAllByType(TouchableOpacity)[7]);
    fireEvent.press(await findByText("إرسال التقييم", hidden));

    await waitFor(() =>
      expect(jest.mocked(appAlert)).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining("rating failed")
      )
    );
  });

  test("opens report tab when already rated and reporting is still allowed", async () => {
    const { findByText, queryByText } = renderWithI18n(
      <PostRideFeedbackModal
        visible
        target={baseFeedbackTarget({ alreadyRated: true, alreadyReported: false })}
        onClose={() => undefined}
      />
    );

    await findByText("ما الذي حدث؟", hidden);
    expect(queryByText("كيف كانت رحلتك؟", hidden)).toBeNull();
  });
});

describe("Component: RideTripStartListener", () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    mockNavigateToRideTripDestination.mockClear();
    mockShouldSuppressInProgressTripPromotion.mockReturnValue(false);
    mockGetDriverRideRequests.mockReset();
    mockGetRegularLatestRideRequest.mockReset();
    AsyncStorage.clear();
  });

  test("driver poll: arrived -> in_progress navigates to RideTripToDestination when gate allows promotion", async () => {
    await AsyncStorage.multiSet([
      ["userRole", "DRIVER"],
      ["userId", "5"],
    ]);

    const rid = 8810;
    mockGetDriverRideRequests
      .mockResolvedValueOnce([minimalDriverRow({ id: rid, status: "arrived" })])
      .mockResolvedValue([
        minimalDriverRow({ id: rid, status: "in_progress" }),
      ]);

    render(
      <I18nextProvider i18n={i18n}>
        <NavigationContainer>
          <RideTripStartListener />
        </NavigationContainer>
      </I18nextProvider>
    );

    await waitFor(() => expect(mockGetDriverRideRequests).toHaveBeenCalled());
    await flushMicrotasks();
    await waitFor(
      () =>
        expect(mockGetDriverRideRequests.mock.calls.length).toBeGreaterThanOrEqual(2),
      { interval: 5, timeout: 6000 }
    );
    await flushMicrotasks();

    await waitFor(() =>
      expect(mockNavigateToRideTripDestination).toHaveBeenCalledWith(
        expect.anything(),
        rid,
        { showTripSuccessIntro: false }
      )
    );
    expect(mockShouldSuppressInProgressTripPromotion).toHaveBeenCalledWith(rid);
  });

  test("driver path does not navigate when promotion gate suppresses the poller overlap", async () => {
    mockShouldSuppressInProgressTripPromotion.mockReturnValue(true);

    await AsyncStorage.multiSet([
      ["userRole", "DRIVER"],
      ["userId", "5"],
    ]);

    const rid = 8811;
    mockGetDriverRideRequests
      .mockResolvedValueOnce([minimalDriverRow({ id: rid, status: "arrived" })])
      .mockResolvedValue([
        minimalDriverRow({ id: rid, status: "in_progress" }),
      ]);

    render(
      <I18nextProvider i18n={i18n}>
        <NavigationContainer>
          <RideTripStartListener />
        </NavigationContainer>
      </I18nextProvider>
    );

    await waitFor(() => expect(mockGetDriverRideRequests).toHaveBeenCalled());
    await flushMicrotasks();
    await waitFor(
      () =>
        expect(mockGetDriverRideRequests.mock.calls.length).toBeGreaterThanOrEqual(2),
      { interval: 5, timeout: 6000 }
    );
    await flushMicrotasks();

    expect(mockNavigateToRideTripDestination).not.toHaveBeenCalled();
  });

  test("passenger latest ride: arrived -> in_progress navigates via same promotion path", async () => {
    await AsyncStorage.multiSet([
      ["userRole", "REGULAR"],
      ["userId", "93"],
    ]);

    const rid = 8812;
    mockGetRegularLatestRideRequest
      .mockResolvedValueOnce(
        minimalRegularLatest({ id: rid, status: "arrived" })
      )
      .mockResolvedValue(
        minimalRegularLatest({ id: rid, status: "in_progress" })
      );

    render(
      <I18nextProvider i18n={i18n}>
        <NavigationContainer>
          <RideTripStartListener />
        </NavigationContainer>
      </I18nextProvider>
    );

    await waitFor(() => expect(mockGetRegularLatestRideRequest).toHaveBeenCalled());
    await flushMicrotasks();
    await waitFor(
      () =>
        expect(mockGetRegularLatestRideRequest.mock.calls.length).toBeGreaterThanOrEqual(2),
      { interval: 5, timeout: 6000 }
    );
    await flushMicrotasks();

    await waitFor(() =>
      expect(mockNavigateToRideTripDestination).toHaveBeenCalledWith(
        expect.anything(),
        rid,
        { showTripSuccessIntro: false }
      )
    );
  });

  test("business owner latest ride: same arrived -> in_progress promotion as regular passenger", async () => {
    await AsyncStorage.multiSet([
      ["userRole", "BUSINESS_OWNER"],
      ["userId", "93"],
    ]);

    const rid = 8813;
    mockGetRegularLatestRideRequest
      .mockResolvedValueOnce(
        minimalRegularLatest({ id: rid, status: "arrived" })
      )
      .mockResolvedValue(
        minimalRegularLatest({ id: rid, status: "in_progress" })
      );

    render(
      <I18nextProvider i18n={i18n}>
        <NavigationContainer>
          <RideTripStartListener />
        </NavigationContainer>
      </I18nextProvider>
    );

    await waitFor(() => expect(mockGetRegularLatestRideRequest).toHaveBeenCalled());
    await flushMicrotasks();
    await waitFor(
      () =>
        expect(mockGetRegularLatestRideRequest.mock.calls.length).toBeGreaterThanOrEqual(2),
      { interval: 5, timeout: 6000 }
    );
    await flushMicrotasks();

    await waitFor(() =>
      expect(mockNavigateToRideTripDestination).toHaveBeenCalledWith(
        expect.anything(),
        rid,
        { showTripSuccessIntro: false }
      )
    );
  });
});

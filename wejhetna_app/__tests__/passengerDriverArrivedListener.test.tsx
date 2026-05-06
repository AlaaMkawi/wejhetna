/**
 * PassengerDriverArrivedListener: focuses on polling + pickup-screen guard.
 *
 * `useNavigationState` cannot be reliably `jest.spyOn`'d here (RN ESM export is
 * non-configurable); we substitute only that hook via `jest.requireActual`,
 * preserving a real NavigationContainer surface.
 */

/// <reference types="jest" />

import React from "react";
import { render, waitFor } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const mockGetRegularLatestRideRequest = jest.fn();

jest.mock("../src/utils/appAlert", () => ({
  __esModule: true,
  appAlert: jest.fn(),
}));

jest.mock("../src/api/rides", () => {
  const actual = jest.requireActual("../src/api/rides") as Record<string, unknown>;
  return {
    ...actual,
    getRegularLatestRideRequest: (...args: unknown[]) =>
      mockGetRegularLatestRideRequest(...args),
  };
});

jest.mock("../config", () => {
  const actual = jest.requireActual("../config") as Record<string, number | string>;
  return { ...actual, RIDE_STATUS_POLL_INTERVAL_MS: 8 };
});

jest.mock("@react-navigation/native", () => {
  const actual = jest.requireActual("@react-navigation/native") as Record<string, unknown>;
  return {
    ...actual,
    useNavigationState: (selector: (state: unknown) => unknown) => {
      const leaf =
        typeof (globalThis as Record<string, unknown>).__passengerArrivedNavLeafRoute ===
        "string"
          ? String(
              (globalThis as Record<string, unknown>).__passengerArrivedNavLeafRoute
            )
          : "RegularHome";
      return selector({
        index: 0,
        routes: [{ key: "nav-test-leaf", name: leaf }],
      });
    },
  };
});

import { NavigationContainer } from "@react-navigation/native";
import { I18nextProvider } from "react-i18next";

import PassengerDriverArrivedListener from "../src/components/ride/PassengerDriverArrivedListener";
import i18n from "../src/i18n";
import { appAlert } from "../src/utils/appAlert";
import type { RegularLatestRideRequest } from "../src/api/rides";

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

async function flushMicrotasks() {
  await new Promise((r) => setImmediate(r));
}

describe("PassengerDriverArrivedListener", () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    mockGetRegularLatestRideRequest.mockReset();
    jest.mocked(appAlert).mockClear();
    (globalThis as Record<string, unknown>).__passengerArrivedNavLeafRoute = "RegularHome";

    AsyncStorage.clear();
    await AsyncStorage.multiSet([
      ["userRole", "REGULAR"],
      ["userId", "94"],
    ]);
    await i18n.changeLanguage("ar");
  });

  test("shows arrival alert when en-route ride becomes arrived (same id) outside pickup screens", async () => {
    const jestAlert = jest.mocked(appAlert);
    const rid = 9920;

    mockGetRegularLatestRideRequest
      .mockResolvedValueOnce(
        minimalRegularLatest({
          id: rid,
          status: "driving_to_customer",
        })
      )
      .mockResolvedValue(minimalRegularLatest({ id: rid, status: "arrived" }));

    render(
      <I18nextProvider i18n={i18n}>
        <NavigationContainer>
          <PassengerDriverArrivedListener />
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

    await waitFor(() => expect(jestAlert).toHaveBeenCalled());
    expect(String(jestAlert.mock.calls[0][0])).toContain("السائق وصل");
    expect(String(jestAlert.mock.calls[0][1])).toContain(
      "السائق ينتظرك في الخارج"
    );
  });

  test("skips global alert when passenger is already on RidePickupNavigation", async () => {
    const jestAlert = jest.mocked(appAlert);
    (globalThis as Record<string, unknown>).__passengerArrivedNavLeafRoute =
      "RidePickupNavigation";

    const rid = 9921;

    mockGetRegularLatestRideRequest
      .mockResolvedValueOnce(
        minimalRegularLatest({
          id: rid,
          status: "on_the_way",
        })
      )
      .mockResolvedValue(minimalRegularLatest({ id: rid, status: "arrived" }));

    render(
      <I18nextProvider i18n={i18n}>
        <NavigationContainer>
          <PassengerDriverArrivedListener />
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

    expect(jestAlert).not.toHaveBeenCalled();
  });
});

/**
 * Jest setup — runs before each test file.
 *
 * Provides global mocks for native modules that don't exist in the Jest
 * environment so tests can import app modules transitively without crashing.
 */

// Async Storage: official mock shipped with the package.
jest.mock(
  "@react-native-async-storage/async-storage",
  () => require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

// react-native-localize: just enough surface for src/i18n.ts to boot up.
jest.mock("react-native-localize", () => ({
  __esModule: true,
  getLocales: () => [
    { countryCode: "IL", languageTag: "ar-IL", languageCode: "ar", isRTL: true },
  ],
  getNumberFormatSettings: () => ({ decimalSeparator: ".", groupingSeparator: "," }),
  findBestAvailableLanguage: () => ({ languageTag: "ar", isRTL: true }),
  uses24HourClock: () => true,
  getCalendar: () => "gregorian",
  getCountry: () => "IL",
  getCurrencies: () => ["ILS"],
  getTemperatureUnit: () => "celsius",
  getTimeZone: () => "Asia/Jerusalem",
  usesMetricSystem: () => true,
}));

jest.mock("@react-native-community/netinfo", () => {
  const state = { isConnected: true, isInternetReachable: true };
  return {
    __esModule: true,
    default: {
      fetch: jest.fn(() => Promise.resolve(state)),
      addEventListener: jest.fn(() => jest.fn()),
    },
  };
});

jest.mock("react-native-nitro-sqlite", () => ({
  __esModule: true,
  open: jest.fn(() => ({
    execute: jest.fn(() => ({
      rows: {
        length: 0,
        _array: [],
        item: jest.fn(),
      },
    })),
    executeAsync: jest.fn(),
    close: jest.fn(),
  })),
}));

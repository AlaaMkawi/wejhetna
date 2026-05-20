import { Platform } from "react-native";

const LOG_PREFIX = "[MapNav][Home]";

export function logHomeMapNav(step: string): void {
  if (Platform.OS === "ios" || __DEV__) {
    console.log(LOG_PREFIX, step);
  }
}

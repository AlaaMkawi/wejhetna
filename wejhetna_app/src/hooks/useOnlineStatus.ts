import { useEffect, useState } from "react";
import { NativeModules } from "react-native";

const LOG_PREFIX = "[useOnlineStatus]";

type NetInfoState = {
  isConnected: boolean | null;
  isInternetReachable?: boolean | null;
};

type NetInfoModule = {
  addEventListener: (listener: (state: NetInfoState) => void) => () => void;
  fetch: () => Promise<NetInfoState>;
};

let cachedNetInfo: NetInfoModule | null | undefined;
let missingModuleWarned = false;

function warnNetInfoUnavailable(reason: string, error?: unknown): void {
  if (missingModuleWarned) {
    return;
  }
  missingModuleWarned = true;
  if (error != null) {
    console.warn(LOG_PREFIX, reason, error);
  } else {
    console.warn(LOG_PREFIX, reason);
  }
}

/** Lazy-load NetInfo only when the native module is present (avoids throw on import). */
function getNetInfoModule(): NetInfoModule | null {
  if (cachedNetInfo !== undefined) {
    return cachedNetInfo;
  }

  if (!NativeModules.RNCNetInfo) {
    warnNetInfoUnavailable(
      "RNCNetInfo native module missing; assuming online=true"
    );
    cachedNetInfo = null;
    return null;
  }

  try {
    const NetInfo = require("@react-native-community/netinfo")
      .default as NetInfoModule;
    cachedNetInfo = NetInfo;
    return NetInfo;
  } catch (error) {
    warnNetInfoUnavailable(
      "Failed to load @react-native-community/netinfo; assuming online=true",
      error
    );
    cachedNetInfo = null;
    return null;
  }
}

function isConnected(state: NetInfoState): boolean {
  if (state.isConnected === false) return false;
  if (state.isInternetReachable === false) return false;
  return true;
}

/** Live connectivity for navigation (blocks reroute / OSRM refresh when offline). */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const NetInfo = getNetInfoModule();
    if (!NetInfo) {
      return;
    }

    const unsubscribe = NetInfo.addEventListener((state) => {
      setOnline(isConnected(state));
    });
    void NetInfo.fetch()
      .then((state) => setOnline(isConnected(state)))
      .catch((error) => {
        console.warn(LOG_PREFIX, "NetInfo.fetch failed; keeping online=true", error);
      });
    return unsubscribe;
  }, []);

  return online;
}

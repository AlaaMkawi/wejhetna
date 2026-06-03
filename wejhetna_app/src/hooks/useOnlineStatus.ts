import { useCallback, useEffect, useRef, useState } from "react";
import NetInfo from "@react-native-community/netinfo";
import type { NetInfoState } from "@react-native-community/netinfo";

function isStateOnline(state: NetInfoState): boolean {
  if (state.isConnected !== true) return false;
  if (state.isInternetReachable === false) return false;
  return true;
}

/**
 * Coarse online/offline signal for gating OSRM and other network-only nav paths.
 * When unknown (e.g. reachability null), treats the device as online so first paint stays usable.
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(true);
  const mounted = useRef(true);

  const apply = useCallback((state: NetInfoState) => {
    if (!mounted.current) return;
    setOnline(isStateOnline(state));
  }, []);

  useEffect(() => {
    mounted.current = true;
    let sub: ReturnType<typeof NetInfo.addEventListener> | undefined;
    void NetInfo.fetch().then(apply);

    sub = NetInfo.addEventListener((state) => {
      apply(state);
    });

    return () => {
      mounted.current = false;
      if (sub) sub();
    };
  }, [apply]);

  return online;
}

import { useEffect, useState } from "react";
import NetInfo, { type NetInfoState } from "@react-native-community/netinfo";

function isConnected(state: NetInfoState): boolean {
  if (state.isConnected === false) return false;
  if (state.isInternetReachable === false) return false;
  return true;
}

/** Live connectivity for navigation (blocks reroute / OSRM refresh when offline). */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setOnline(isConnected(state));
    });
    void NetInfo.fetch().then((state) => setOnline(isConnected(state)));
    return unsubscribe;
  }, []);

  return online;
}

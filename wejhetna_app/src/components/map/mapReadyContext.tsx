import { useSyncExternalStore } from "react";
import {
  getMapAnnotationsReady,
  subscribeMapAnnotationsReady,
} from "./mapReadyStore";

export function useMapAnnotationsReady(): boolean {
  return useSyncExternalStore(
    subscribeMapAnnotationsReady,
    getMapAnnotationsReady,
    getMapAnnotationsReady
  );
}

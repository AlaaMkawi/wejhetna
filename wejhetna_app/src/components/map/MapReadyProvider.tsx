import { createContext, useContext } from "react";
import { useMapAnnotationsReady } from "./mapReadyContext";

const MapReadyContext = createContext(true);

/** Legacy wrapper — reads the shared map-ready store. */
export function MapReadyProvider({
  children,
  value: _value,
}: {
  children: React.ReactNode;
  value?: boolean;
}) {
  const ready = useMapAnnotationsReady();
  return <MapReadyContext.Provider value={ready}>{children}</MapReadyContext.Provider>;
}

export function useMapReadyContextValue(): boolean {
  return useContext(MapReadyContext);
}

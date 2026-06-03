/**
 * iOS-only: reset root stack to Home tabs after RouteDetails (no goBack pop).
 * Re-exports from routeDetailsIosExit for a stable import path.
 */
export {
  dispatchIosResetToHomeMap,
  resolveHomeRootRoute,
  type HomeRootRoute,
} from "./routeDetailsIosExit";

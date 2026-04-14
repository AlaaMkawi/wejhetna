export type GpsFix = {
  lat: number;
  lon: number;
  /** meters (smaller is better). Undefined treated as “medium”. */
  accuracy?: number;
  /** meters/second */
  speed?: number;
  /** ms */
  timestampMs: number;
};

export type SmoothedPoint = {
  lat: number;
  lon: number;
};

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function accuracyTrust(accuracyM: number | undefined): number {
  // 0..1 (higher = more trust)
  if (accuracyM == null || Number.isNaN(accuracyM)) return 0.55;
  if (accuracyM <= 5) return 1.0;
  if (accuracyM <= 10) return 0.9;
  if (accuracyM <= 20) return 0.75;
  if (accuracyM <= 30) return 0.6;
  return 0.35;
}

function speedFactor(speedMps: number | undefined): number {
  // 0..1 (higher = less smoothing, more responsiveness)
  if (speedMps == null || Number.isNaN(speedMps)) return 0.55;
  // walking(1.5) -> 0.25, city(12) -> 0.75, highway(28) -> 1.0
  return clamp((speedMps - 1.5) / (28 - 1.5), 0.25, 1.0);
}

/**
 * Weighted EMA: combines accuracy-based trust + speed-based responsiveness.
 * - Better accuracy => higher alpha (follow measurement more)
 * - Higher speed => higher alpha (reduce lag in turns)
 */
export function createWeightedEmaSmoother(options?: {
  /** alpha bounds to prevent extreme lag/jitter */
  minAlpha?: number;
  maxAlpha?: number;
}): {
  reset: (p: SmoothedPoint) => void;
  update: (fix: GpsFix) => SmoothedPoint;
  get: () => SmoothedPoint | null;
} {
  const minAlpha = options?.minAlpha ?? 0.18;
  const maxAlpha = options?.maxAlpha ?? 0.72;
  let state: SmoothedPoint | null = null;

  const reset = (p: SmoothedPoint) => {
    state = { ...p };
  };

  const update = (fix: GpsFix): SmoothedPoint => {
    const meas = { lat: fix.lat, lon: fix.lon };
    if (!state) {
      state = { ...meas };
      return { ...state };
    }

    const tAcc = accuracyTrust(fix.accuracy);
    const tSpeed = speedFactor(fix.speed);
    // combine: accuracy matters a lot, speed helps avoid “turn lag”
    const trust = clamp(0.7 * tAcc + 0.3 * tSpeed, 0, 1);
    const alpha = lerp(minAlpha, maxAlpha, trust);

    state = {
      lat: state.lat + (meas.lat - state.lat) * alpha,
      lon: state.lon + (meas.lon - state.lon) * alpha,
    };
    return { ...state };
  };

  const get = () => (state ? { ...state } : null);

  return { reset, update, get };
}

/**
 * Lightweight 1D constant-velocity Kalman filter (pos+vel) for a single axis.
 * Tuned for GPS: measurement variance comes from accuracy; process noise is small but non-zero.
 */
function createKalman1D() {
  // state: x = [pos, vel]
  let pos = 0;
  let vel = 0;
  // covariance P (2x2)
  let p00 = 1;
  let p01 = 0;
  let p10 = 0;
  let p11 = 1;
  let initialized = false;

  const reset = (p: number) => {
    pos = p;
    vel = 0;
    p00 = 1;
    p01 = 0;
    p10 = 0;
    p11 = 1;
    initialized = true;
  };

  const update = (z: number, dt: number, measVar: number, accelVar: number) => {
    if (!initialized) reset(z);

    // Predict
    // x = F x, F=[[1,dt],[0,1]]
    pos = pos + vel * dt;
    // P = F P F^T + Q, with Q from accel variance
    // Q = [[dt^4/4, dt^3/2],[dt^3/2, dt^2]] * accelVar
    const dt2 = dt * dt;
    const dt3 = dt2 * dt;
    const dt4 = dt2 * dt2;
    const q00 = (dt4 / 4) * accelVar;
    const q01 = (dt3 / 2) * accelVar;
    const q10 = q01;
    const q11 = dt2 * accelVar;

    const fp00 = p00 + dt * p10;
    const fp01 = p01 + dt * p11;
    const fp10 = p10;
    const fp11 = p11;

    p00 = fp00 + dt * fp01 + q00;
    p01 = fp01 + q01;
    p10 = fp10 + dt * fp11 + q10;
    p11 = fp11 + q11;

    // Update with measurement z, H=[1,0]
    const y = z - pos; // innovation
    const s = p00 + measVar; // innovation covariance
    const k0 = p00 / s;
    const k1 = p10 / s;

    pos = pos + k0 * y;
    vel = vel + k1 * y;

    // P = (I - K H) P
    p00 = (1 - k0) * p00;
    p01 = (1 - k0) * p01;
    p10 = p10 - k1 * p00; // small correction; stable enough for our use
    p11 = p11 - k1 * p01;

    return pos;
  };

  const get = () => (initialized ? pos : null);

  return { reset, update, get };
}

/**
 * 2D Kalman (lat/lon) using per-axis constant-velocity filters.
 * - Uses accuracy (meters) as measurement noise.
 * - Uses speed to slightly increase process noise to stay responsive.
 */
export function createKalmanLatLonSmoother(): {
  reset: (p: SmoothedPoint) => void;
  update: (fix: GpsFix) => SmoothedPoint;
  get: () => SmoothedPoint | null;
} {
  const kLat = createKalman1D();
  const kLon = createKalman1D();
  let lastTs: number | null = null;
  let state: SmoothedPoint | null = null;

  const reset = (p: SmoothedPoint) => {
    state = { ...p };
    kLat.reset(p.lat);
    kLon.reset(p.lon);
    lastTs = null;
  };

  const update = (fix: GpsFix): SmoothedPoint => {
    const ts = fix.timestampMs;
    const dt =
      lastTs == null ? 1 : clamp((ts - lastTs) / 1000, 0.2, 2.5);
    lastTs = ts;

    // Convert accuracy meters -> degrees variance (rough local conversion)
    const accM = fix.accuracy ?? 15;
    const refLat = state?.lat ?? fix.lat;
    const degPerM_Lat = 1 / 111320;
    const degPerM_Lon = 1 / (111320 * Math.cos((refLat * Math.PI) / 180));
    const measVarLat = Math.pow(accM * degPerM_Lat, 2);
    const measVarLon = Math.pow(accM * degPerM_Lon, 2);

    // Process noise: higher speed => more willing to move
    const sp = fix.speed ?? 0;
    const accelVar = 0.6 + clamp(sp / 15, 0, 1.5); // small, but adaptive

    const lat = kLat.update(fix.lat, dt, measVarLat, accelVar);
    const lon = kLon.update(fix.lon, dt, measVarLon, accelVar);
    state = { lat, lon };
    return { ...state };
  };

  const get = () => (state ? { ...state } : null);

  return { reset, update, get };
}


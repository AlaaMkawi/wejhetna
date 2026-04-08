type Period = "AM" | "PM";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
export type DayName = (typeof DAY_NAMES)[number];

function toMinutes(h: number, m: number, p: Period): number {
  let hour = h % 12;
  if (p === "PM") hour += 12;
  return hour * 60 + m;
}

function parseDayName(raw: string): DayName | null {
  const s = raw.trim().toLowerCase();
  const hit = DAY_NAMES.find((d) => d.toLowerCase() === s);
  return hit ?? null;
}

/** Normalize period labels saved with translations (ar/he) or English. */
export function normalizePeriodToken(raw: string): Period | null {
  const t = raw.trim();
  const u = t.toUpperCase();
  if (u === "AM" || u === "A.M.") return "AM";
  if (u === "PM" || u === "P.M.") return "PM";
  // Arabic (i18n keys am → ص, pm → م)
  if (t === "ص") return "AM";
  if (t === "م") return "PM";
  // Hebrew morning / afternoon
  if (t.includes("בוקר")) return "AM";
  if (t.includes("אחה")) return "PM";

  return null;
}

export type StoredHourSlot = {
  startHour: string;
  startPeriod: Period;
  endHour: string;
  endPeriod: Period;
};

/** One segment after split by comma, e.g. "Monday: 08:00 AM - 05:00 PM" or localized periods. */
function parseOneOpeningHoursEntry(entry: string): {
  day: DayName;
  startHour: string;
  startPeriod: Period;
  endHour: string;
  endPeriod: Period;
} | null {
  const m = entry
    .trim()
    .match(/^(\w+):\s*(\d{1,2}):(\d{2})\s+(.+?)\s*-\s*(\d{1,2}):(\d{2})\s+(.+)$/i);
  if (!m) return null;
  const day = parseDayName(m[1]);
  if (!day) return null;
  const sp = normalizePeriodToken(m[4]);
  const ep = normalizePeriodToken(m[7]);
  if (!sp || !ep) return null;
  return {
    day,
    startHour: `${m[2]}:${m[3]}`,
    startPeriod: sp,
    endHour: `${m[5]}:${m[6]}`,
    endPeriod: ep,
  };
}

/**
 * Parse DB opening_hours into per-day slots for the Manage Time UI.
 * Supports English AM/PM and localized labels (Arabic ص/מ, Hebrew בוקר/אחה״צ).
 */
export function parseOpeningHoursToSlotMap(
  hoursString: string | null | undefined
): Record<DayName, StoredHourSlot | null> {
  const empty = {} as Record<DayName, StoredHourSlot | null>;
  for (const d of DAY_NAMES) empty[d] = null;
  if (!hoursString?.trim()) return empty;

  for (const entry of hoursString.split(",").map((s) => s.trim()).filter(Boolean)) {
    const parsed = parseOneOpeningHoursEntry(entry);
    if (parsed) {
      empty[parsed.day] = {
        startHour: parsed.startHour,
        startPeriod: parsed.startPeriod,
        endHour: parsed.endHour,
        endPeriod: parsed.endPeriod,
      };
    }
  }
  return empty;
}

/** Canonical string for API / DB (English AM/PM only) — keeps parsing and “open now” logic reliable. */
export function formatHourSlotForStorage(slot: StoredHourSlot): string {
  return `${slot.startHour} ${slot.startPeriod} - ${slot.endHour} ${slot.endPeriod}`;
}

export type OpeningHoursRange = {
  day: DayName;
  startMinutes: number;
  endMinutes: number;
  /** True if interval continues after midnight into next day. */
  overnight: boolean;
};

/**
 * Parses a backend opening_hours string like:
 * "Sunday: 8:00 AM - 2:00 AM, Monday: 9:00 AM - 5:00 PM"
 */
export function parseOpeningHoursRanges(openingHours: string | null | undefined): OpeningHoursRange[] {
  if (!openingHours) return [];
  const entries = openingHours
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const out: OpeningHoursRange[] = [];
  for (const entry of entries) {
    const parsed = parseOneOpeningHoursEntry(entry);
    if (!parsed) continue;
    const [sh, sm] = parsed.startHour.split(":").map((x) => parseInt(x, 10));
    const [eh, em] = parsed.endHour.split(":").map((x) => parseInt(x, 10));
    const startMinutes = toMinutes(sh, sm, parsed.startPeriod);
    const endMinutes = toMinutes(eh, em, parsed.endPeriod);
    out.push({
      day: parsed.day,
      startMinutes,
      endMinutes,
      overnight: endMinutes <= startMinutes,
    });
  }
  return out;
}

export function isOpenNowFromRanges(ranges: OpeningHoursRange[], now = new Date()): boolean {
  if (!ranges.length) return false;
  const today = now.getDay(); // 0..6, Sunday=0
  const minutesNow = now.getHours() * 60 + now.getMinutes();

  for (const r of ranges) {
    const startDayIdx = DAY_NAMES.findIndex((d) => d === r.day);
    if (startDayIdx < 0) continue;
    const nextDayIdx = (startDayIdx + 1) % 7;

    if (!r.overnight) {
      if (today === startDayIdx && minutesNow >= r.startMinutes && minutesNow < r.endMinutes) {
        return true;
      }
    } else {
      // Example: 8:00 PM - 2:00 AM
      if (today === startDayIdx && minutesNow >= r.startMinutes) return true;
      if (today === nextDayIdx && minutesNow < r.endMinutes) return true;
    }
  }
  return false;
}

export function isOpenNow(openingHours: string | null | undefined, now = new Date()): boolean {
  return isOpenNowFromRanges(parseOpeningHoursRanges(openingHours), now);
}


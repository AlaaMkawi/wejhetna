import i18n from "../i18n";
import { isOpenNow } from "./openingHours";

export type OpeningHoursDayRow = {
  day: string;
  hours: string;
  isToday: boolean;
};

/** Day-by-day rows for the expandable opening-hours card on place details sheets. */
export function parseOpeningHoursForDisplay(
  openingHours: string | null | undefined
): OpeningHoursDayRow[] {
  if (!openingHours) return [];

  const now = new Date();
  const currentDay = now.getDay();
  const dayNames = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  const dayNamesLocalized = {
    he: ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"],
    ar: ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"],
  };

  const currentLanguage = i18n.language || "ar";
  const localizedDays =
    currentLanguage === "he" ? dayNamesLocalized.he : dayNamesLocalized.ar;

  const dayEntries = openingHours.split(",").map((s) => s.trim());
  const parsed: OpeningHoursDayRow[] = [];

  for (let i = 0; i < 7; i++) {
    const dayName = dayNames[i];
    const localizedDayName = localizedDays[i];
    const isToday = i === currentDay;

    const entry = dayEntries.find((e) =>
      e.toLowerCase().startsWith(dayName.toLowerCase() + ":")
    );

    if (entry) {
      const match = entry.match(new RegExp(`${dayName}:\\s*(.+)`, "i"));
      if (match) {
        parsed.push({
          day: localizedDayName,
          hours: match[1].trim(),
          isToday,
        });
      } else {
        parsed.push({ day: localizedDayName, hours: "", isToday });
      }
    } else {
      parsed.push({ day: localizedDayName, hours: "", isToday });
    }
  }

  return parsed;
}

export function isBusinessOpenNow(openingHours: string | null | undefined): boolean {
  return isOpenNow(openingHours);
}

/** Status line when closed (e.g. "סגור · פתוח ב 10:30 AM"). */
export function getOpeningHoursStatusText(
  openingHours: string | null | undefined
): string {
  if (!openingHours) {
    return i18n.language === "ar" ? "مغلق" : "סגור";
  }

  const now = new Date();
  const currentDay = now.getDay();
  const dayNames = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  const dayNamesLocalized = {
    he: ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"],
    ar: ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"],
  };

  const currentLanguage = i18n.language || "ar";
  const localizedDays =
    currentLanguage === "he" ? dayNamesLocalized.he : dayNamesLocalized.ar;
  const currentDayName = dayNames[currentDay];

  const dayEntries = openingHours.split(",").map((s) => s.trim());

  for (const entry of dayEntries) {
    const match = entry.match(
      new RegExp(
        `${currentDayName}:\\s*(\\d+):(\\d+)\\s*(AM|PM)\\s*-\\s*(\\d+):(\\d+)\\s*(AM|PM)`,
        "i"
      )
    );
    if (match) {
      const [, startH, startM, startP, endH, endM, endP] = match;

      const startHour = parseInt(startH, 10);
      const startMin = parseInt(startM, 10);
      const endHour = parseInt(endH, 10);
      const endMin = parseInt(endM, 10);

      let startMinutes = startHour * 60 + startMin;
      let endMinutes = endHour * 60 + endMin;

      if (startP.toUpperCase() === "PM" && startHour !== 12) startMinutes += 12 * 60;
      if (startP.toUpperCase() === "AM" && startHour === 12) startMinutes -= 12 * 60;
      if (endP.toUpperCase() === "PM" && endHour !== 12) endMinutes += 12 * 60;
      if (endP.toUpperCase() === "AM" && endHour === 12) endMinutes -= 12 * 60;

      const currentMinutes = now.getHours() * 60 + now.getMinutes();

      if (currentMinutes >= startMinutes && currentMinutes < endMinutes) {
        return currentLanguage === "ar" ? "مفتوح" : "פתוח";
      }
    }
  }

  for (let i = 0; i < 7; i++) {
    const checkDay = (currentDay + i) % 7;
    const checkDayName = dayNames[checkDay];
    const localizedDayName = localizedDays[checkDay];

    const entry = dayEntries.find((e) =>
      e.toLowerCase().startsWith(checkDayName.toLowerCase() + ":")
    );
    if (entry) {
      const match = entry.match(
        new RegExp(`${checkDayName}:\\s*(\\d+):(\\d+)\\s*(AM|PM)`, "i")
      );
      if (match) {
        const [, hour, minute, period] = match;
        const statusText = currentLanguage === "ar" ? "مغلق" : "סגור";
        const opensText = currentLanguage === "ar" ? "يفتح" : "פתוח ב";
        if (i === 0) {
          return `${statusText} · ${opensText} ${hour}:${minute} ${period}`;
        }
        return `${statusText} · ${opensText} ${hour}:${minute} ${period} ${localizedDayName}`;
      }
    }
  }

  return i18n.language === "ar" ? "مغلق" : "סגור";
}

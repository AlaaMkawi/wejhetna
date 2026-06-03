import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  DayName,
  formatHourSlotForStorage,
  isOpenNowFromRanges,
  parseOpeningHoursToSlotMap,
} from "../utils/openingHours";

export type HourData = {
  startHour: string;
  startPeriod: "AM" | "PM";
  endHour: string;
  endPeriod: "AM" | "PM";
} | null;

export type OpeningHoursWeek = { [key: string]: HourData };

const EMPTY_WEEK: OpeningHoursWeek = {
  Sunday: null,
  Monday: null,
  Tuesday: null,
  Wednesday: null,
  Thursday: null,
  Friday: null,
  Saturday: null,
};

export type PickerField = "startHour" | "startPeriod" | "endHour" | "endPeriod";

function parseToWeek(hoursString: string | null | undefined): OpeningHoursWeek {
  const slots = parseOpeningHoursToSlotMap(hoursString);
  const out: OpeningHoursWeek = { ...EMPTY_WEEK };
  for (const day of Object.keys(out) as DayName[]) {
    const s = slots[day];
    out[day] = s
      ? {
          startHour: s.startHour,
          startPeriod: s.startPeriod,
          endHour: s.endHour,
          endPeriod: s.endPeriod,
        }
      : null;
  }
  return out;
}

/** Format week map to backend storage string (English AM/PM). */
export function formatOpeningHoursWeekForStorage(
  openingHours: OpeningHoursWeek
): string | null {
  const hoursString = Object.entries(openingHours)
    .map(([day, hours]) => {
      if (!hours) return null;
      return `${day}: ${formatHourSlotForStorage(hours)}`;
    })
    .filter(Boolean)
    .join(", ");
  return hoursString || null;
}

export function useOpeningHoursEditor(initialHours?: string | null) {
  const { t } = useTranslation();
  const [openingHours, setOpeningHours] = useState<OpeningHoursWeek>(() =>
    parseToWeek(initialHours)
  );
  const [isEditing, setIsEditing] = useState(false);
  const [pickerModalVisible, setPickerModalVisible] = useState(false);
  const [pickerType, setPickerType] = useState<PickerField | null>(null);
  const [pickerDay, setPickerDay] = useState("");

  const hourOptions = useMemo(() => {
    const minutes = ["00", "15", "30", "45"];
    const out: string[] = [];
    for (let h = 1; h <= 12; h++) {
      for (const m of minutes) {
        out.push(`${String(h).padStart(2, "0")}:${m}`);
      }
    }
    return out;
  }, []);

  const periodOptions = ["AM", "PM"];

  const formatPeriodLabel = useCallback(
    (period: "AM" | "PM" | string): string => {
      if (period === "AM") return t("am") || "AM";
      if (period === "PM") return t("pm") || "PM";
      return period;
    },
    [t]
  );

  const formatHours = useCallback(
    (hours: HourData): string => {
      if (!hours) return "";
      return `${hours.startHour} ${formatPeriodLabel(hours.startPeriod)} - ${hours.endHour} ${formatPeriodLabel(hours.endPeriod)}`;
    },
    [formatPeriodLabel]
  );

  const getDayName = useCallback(
    (day: string): string => {
      const dayKey = `day_${day.toLowerCase()}`;
      return t(dayKey) || day;
    },
    [t]
  );

  const isCurrentlyOpen = useCallback((day: string, hours: HourData): boolean => {
    if (!hours) return false;
    const now = new Date();
    const dayMap: Record<string, number> = {
      Sunday: 0,
      Monday: 1,
      Tuesday: 2,
      Wednesday: 3,
      Thursday: 4,
      Friday: 5,
      Saturday: 6,
    };
    const [startH, startM] = hours.startHour.split(":").map(Number);
    const [endH, endM] = hours.endHour.split(":").map(Number);
    let startMinutes = startH * 60 + startM;
    let endMinutes = endH * 60 + endM;
    if (hours.startPeriod === "PM" && startH !== 12) startMinutes += 12 * 60;
    if (hours.startPeriod === "AM" && startH === 12) startMinutes -= 12 * 60;
    if (hours.endPeriod === "PM" && endH !== 12) endMinutes += 12 * 60;
    if (hours.endPeriod === "AM" && endH === 12) endMinutes -= 12 * 60;
    const startDayIdx = dayMap[day];
    if (startDayIdx == null) return false;
    const overnight = endMinutes <= startMinutes;
    return isOpenNowFromRanges(
      [{ day: day as DayName, startMinutes, endMinutes, overnight }],
      now
    );
  }, []);

  const openPicker = (day: string, type: PickerField) => {
    setPickerDay(day);
    setPickerType(type);
    setPickerModalVisible(true);
  };

  const handlePickerSelect = (value: string) => {
    if (!pickerDay || !pickerType || !openingHours[pickerDay]) return;
    const currentHours = openingHours[pickerDay];
    if (!currentHours) return;
    setOpeningHours({
      ...openingHours,
      [pickerDay]: { ...currentHours, [pickerType]: value },
    });
    setPickerModalVisible(false);
    setPickerType(null);
    setPickerDay("");
  };

  const getPickerValue = (): string => {
    if (!pickerDay || !pickerType || !openingHours[pickerDay]) return "";
    const hours = openingHours[pickerDay];
    if (!hours) return "";
    return String(hours[pickerType] || "");
  };

  const getPickerOptions = (): string[] => {
    if (pickerType === "startPeriod" || pickerType === "endPeriod") {
      return periodOptions;
    }
    return hourOptions;
  };

  const toStorageString = useCallback(
    () => formatOpeningHoursWeekForStorage(openingHours),
    [openingHours]
  );

  return {
    openingHours,
    setOpeningHours,
    isEditing,
    setIsEditing,
    pickerModalVisible,
    setPickerModalVisible,
    pickerType,
    pickerDay,
    openPicker,
    handlePickerSelect,
    getPickerValue,
    getPickerOptions,
    formatPeriodLabel,
    formatHours,
    getDayName,
    isCurrentlyOpen,
    toStorageString,
    resetFromString: (s: string | null | undefined) =>
      setOpeningHours(parseToWeek(s)),
  };
}

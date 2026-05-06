import { useEffect, useRef } from "react";
import { appAlert } from "../utils/appAlert";
import { Linking } from "react-native";
import { useIsFocused } from "@react-navigation/native";
import i18n from "../i18n";
import { getCurrentPositionReliable } from "../utils/locationPermission";

/**
 * Single stable fetch for map home screens: only runs when the tab is focused (avoids duplicate
 * Home + Search instances both requesting GPS). Does not depend on `t` from i18n (prevents re-runs
 * when translations hydrate). Timeout / no-fix errors are silent so the user is not spammed.
 */
export function useInitialMapGeolocation(
  setUserLocation: (loc: { lat: number; lon: number }) => void,
  setLocationLoading: (loading: boolean) => void,
  hasShownLocationPermissionMessage: boolean,
  setHasShownLocationPermissionMessage: (v: boolean) => void
): void {
  const isFocused = useIsFocused();
  const attemptGeneration = useRef(0);
  const permissionAlertShownRef = useRef(hasShownLocationPermissionMessage);
  permissionAlertShownRef.current = hasShownLocationPermissionMessage;

  useEffect(() => {
    if (!isFocused) {
      return;
    }

    const gen = ++attemptGeneration.current;
    let cancelled = false;

    setLocationLoading(true);

    (async () => {
      try {
        const loc = await getCurrentPositionReliable();
        if (cancelled || gen !== attemptGeneration.current) {
          return;
        }
        setUserLocation(loc);
      } catch (error: any) {
        if (cancelled || gen !== attemptGeneration.current) {
          return;
        }
        console.log("GPS error", error);
        const currentLanguage = i18n.language || "ar";

        if (error?.code === 1) {
          let title = "";
          let message = "";
          if (!permissionAlertShownRef.current) {
            title =
              currentLanguage === "ar"
                ? "السماح بالموقع"
                : currentLanguage === "he"
                  ? "אפשר גישת מיקום"
                  : "Allow Location Access";
            message =
              currentLanguage === "ar"
                ? "يجب السماح للتطبيق بالوصول إلى موقعك لاستخدام ميزة الموقع ورؤية موقعك الحالي كنقطة بداية للمسارات."
                : currentLanguage === "he"
                  ? "אנא אפשר לאפליקציה גישה למיקום שלך כדי להשתמש בתכונת המיקום ולראות את המיקום הנוכחי שלך כנקודת התחלה למסלולים."
                  : "Please allow the app to access your location to use the location feature and see your current location as the starting point for routes.";
            permissionAlertShownRef.current = true;
            setHasShownLocationPermissionMessage(true);
          } else {
            title =
              currentLanguage === "ar"
                ? "السماح بالموقع مطلوب"
                : currentLanguage === "he"
                  ? "נדרש אישור מיקום"
                  : "Location Permission Required";
            message =
              currentLanguage === "ar"
                ? "يجب السماح للتطبيق بالوصول إلى موقعك لاستخدام ميزة الموقع. يرجى تفعيل الموقع في إعدادات الجهاز."
                : currentLanguage === "he"
                  ? "יש לאפשר לאפליקציה גישה למיקום שלך כדי להשתמש בתכונת המיקום. אנא הפעל את המיקום בהגדרות המכשיר."
                  : "The app needs access to your location to use the location feature. Please enable location in device settings.";
          }

          const allowText =
            currentLanguage === "ar" ? "السماح" : currentLanguage === "he" ? "אפשר" : "Allow";
          const cancelText =
            currentLanguage === "ar" ? "إلغاء" : currentLanguage === "he" ? "ביטול" : "Cancel";

          appAlert(title, message, [
            { text: cancelText, style: "cancel" },
            {
              text: allowText,
              onPress: () => {
                Linking.openSettings();
              },
            },
          ]);
        }
        // code 2 / 3 / others: no blocking alert — avoids loops; user can use Start Navigation or settings
      } finally {
        if (!cancelled && gen === attemptGeneration.current) {
          setLocationLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isFocused, setUserLocation, setLocationLoading, setHasShownLocationPermissionMessage]);
}

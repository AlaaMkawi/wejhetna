import i18n, { InitOptions } from "i18next";
import { initReactI18next } from "react-i18next";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as RNLocalize from "react-native-localize";

import ar from "./languages/ar.json";
import he from "./languages/he.json";

const LANG_KEY = "APP_LANGUAGE";

const resources = {
  ar: { translation: ar },
  he: { translation: he },
};

export const changeAppLanguage = async (lang: string) => {
  await AsyncStorage.setItem(LANG_KEY, lang);
  i18n.changeLanguage(lang);
};

export const loadAppLanguage = async (): Promise<string> => {
  const savedLang = await AsyncStorage.getItem(LANG_KEY);

  if (savedLang) return savedLang;

  return RNLocalize.getLocales()[0].languageCode.startsWith("ar")
    ? "ar"
    : "he";
};

const options: InitOptions = {
  compatibilityJSON: "v4",
  resources,
  lng: "ar",
  fallbackLng: "ar",
  interpolation: {
    escapeValue: false,
  },
};

// IMPORTANT: type safe init()
i18n.use(initReactI18next).init(options);

export default i18n;

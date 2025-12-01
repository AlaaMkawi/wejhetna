import "./src/i18n";
import { I18nextProvider } from "react-i18next";
import i18n from "./src/i18n";

import React, { useEffect} from "react";
import { NavigationContainer } from "@react-navigation/native";
import AppNavigator from "./src/navigation/AppNavigator";

import { loadAppLanguage, changeAppLanguage } from "./src/i18n";

export default function App() {

  // Load saved language when app starts
  useEffect(() => {
    const loadLang = async () => {
      const lang = await loadAppLanguage();
      await changeAppLanguage(lang);
    };
    loadLang();
  }, []);

    return (
    <I18nextProvider i18n={i18n}>
      <NavigationContainer>
        <AppNavigator />
      </NavigationContainer>
    </I18nextProvider>
  );
}

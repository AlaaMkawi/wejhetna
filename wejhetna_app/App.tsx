// App.tsx
import { I18nextProvider } from "react-i18next";
import i18n, { loadAppLanguage } from "./src/i18n";

import React, { useEffect, useState } from "react";
import { NavigationContainer } from "@react-navigation/native";
import AppNavigator from "./src/navigation/AppNavigator";

export default function App() {
  const [ready, setReady] = useState(false);

  // Load saved language when app starts
  useEffect(() => {
    const initLang = async () => {
      const savedLang = await loadAppLanguage();
      await i18n.changeLanguage(savedLang);
      setReady(true);
    };
    initLang();
  }, []);

  if (!ready) {
    return null; // פה אפשר לשים Splash אם תרצי
  }

  return (
    <I18nextProvider i18n={i18n}>
      <NavigationContainer>
        <AppNavigator />
      </NavigationContainer>
    </I18nextProvider>
  );
}

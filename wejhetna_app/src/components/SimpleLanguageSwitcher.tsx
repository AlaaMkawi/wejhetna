// src/components/SimpleLanguageSwitcher.tsx
import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import i18n from "../i18n";
import RNRestart from "react-native-restart";
import { changeAppLanguage } from "../i18n";
import { I18nManager } from "react-native";

const DARK_TEAL = "#0f5b63";

export default function SimpleLanguageSwitcher() {
  const {  } = useTranslation();
  const currentLang = i18n.language || "ar";

  const selectLanguage = async (lang: string) => {
    await changeAppLanguage(lang);
    const isRTL = lang === "ar" || lang === "he";
    if (I18nManager.isRTL !== isRTL) {
      I18nManager.allowRTL(isRTL);
      I18nManager.forceRTL(isRTL);
      RNRestart.restart();
    }
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.langButton, currentLang === "ar" && styles.langButtonActive]}
        onPress={() => selectLanguage("ar")}
        activeOpacity={0.7}
      >
        <Text style={[styles.langText, currentLang === "ar" && styles.langTextActive]}>
          العربية
        </Text>
      </TouchableOpacity>
      
      <View style={styles.divider} />
      
      <TouchableOpacity
        style={[styles.langButton, currentLang === "he" && styles.langButtonActive]}
        onPress={() => selectLanguage("he")}
        activeOpacity={0.7}
      >
        <Text style={[styles.langText, currentLang === "he" && styles.langTextActive]}>
          עברית
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    backgroundColor: "#f0f0f0",
    borderRadius: 12,
    padding: 4,
    width: "100%",
  },
  langButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  langButtonActive: {
    backgroundColor: DARK_TEAL,
  },
  langText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#666",
  },
  langTextActive: {
    color: "#fff",
    fontWeight: "700",
  },
  divider: {
    width: 1,
    backgroundColor: "#ddd",
    marginHorizontal: 4,
  },
});

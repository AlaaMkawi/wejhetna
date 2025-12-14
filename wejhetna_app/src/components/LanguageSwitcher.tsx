import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Image,
  I18nManager, 
} from "react-native";
import RNRestart from "react-native-restart";

import { changeAppLanguage } from "../i18n"; 

export default function LanguageSwitcher() {
  const [open, setOpen] = useState(false);
  const dropdownOpacity = useState(new Animated.Value(0))[0];

  const toggleDropdown = () => {
    setOpen(!open);
    Animated.timing(dropdownOpacity, {
      toValue: open ? 0 : 1,
      duration: 180,
      useNativeDriver: true,
    }).start();
  };

  const selectLanguage = async (lang: string) => {
    await changeAppLanguage(lang);
    const isRTL = lang === "ar" || lang === "he";
    if (I18nManager.isRTL !== isRTL) {
      I18nManager.allowRTL(isRTL);
      I18nManager.forceRTL(isRTL);
      RNRestart.restart(); 
    }
    setOpen(false);
  };

  return (
    <View style={styles.container}>
      {/* Icon Button */}
      <TouchableOpacity style={styles.iconBtn} onPress={toggleDropdown}>
        <Image
          source={require("../../assets/language-icon.png")}
          style={{ width: 45, height: 45, tintColor: "#0f5b63" }} 
          resizeMode="contain"
        />
      </TouchableOpacity>

      {/* Dropdown */}
      {open && (
        <Animated.View style={[styles.dropdown, { opacity: dropdownOpacity }]}>
          <TouchableOpacity onPress={() => selectLanguage("ar")}>
            <Text style={styles.option}>العربية</Text>
          </TouchableOpacity>
          
          {/* Subtle floating divider */}
          <View style={styles.divider} />
          
          <TouchableOpacity onPress={() => selectLanguage("he")}>
            <Text style={styles.option}>עברית</Text>
          </TouchableOpacity>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    zIndex: 999,
    alignItems: 'center', // Centers the dropdown under the icon
  },

  iconBtn: {
    backgroundColor: "transparent",
    width: 60,
    height: 60,
    alignItems: "center",
    justifyContent: "center",
  },

  // CHANGED: Completely transparent, no box, no shadows
  dropdown: {
    position:'absolute',
    top:60,
    backgroundColor: "transparent", 
    paddingVertical: 0,
    paddingHorizontal: 0,
    borderRadius: 0,
    borderWidth: 0,
    shadowOpacity: 0,
    elevation: 0,
    minWidth: 100,
    alignItems: 'center',
  },

  // CHANGED: Added shadow to text so it is readable without a background
  option: {
    fontSize: 18,
    color: "#0f5b63",
    fontWeight: "700",
    paddingVertical: 12,
    textShadowColor: 'rgba(255, 255, 255, 0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  
 
  divider: {
      height: 1,
      width: "50%",
      backgroundColor: "#0f5b63",
      opacity: 0.3,
  }
});
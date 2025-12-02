import React, { useState } from "react";
import { Image } from "react-native";

import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
} from "react-native";
import MaterialCommunityIcons from "react-native-vector-icons/MaterialCommunityIcons";
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
    setOpen(false);
  };

  return (
    <View style={styles.container}>
      {/* Language Icon Button */}
      <TouchableOpacity style={styles.iconBtn} onPress={toggleDropdown}>
        <Image
          source={require("../../assets/language-icon.png")}
          style={{ width: 30, height: 30 }}
          resizeMode="contain"
        />

      </TouchableOpacity>

      {/* Dropdown */}
      {open && (
        <Animated.View style={[styles.dropdown, { opacity: dropdownOpacity }]}>
          <TouchableOpacity onPress={() => selectLanguage("ar")}>
            <Text style={styles.option}>العربية</Text>
          </TouchableOpacity>

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
    position: "absolute",
    top: 20,
    left: 20,
    zIndex: 999,
  },

  iconBtn: {
    backgroundColor: "#ffffff",
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",

    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },

  dropdown: {
    marginTop: 8,
    backgroundColor: "#ffffff",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    elevation: 6,

    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },

  option: {
    fontSize: 16,
    color: "#2b6f73",
    fontWeight: "600",
    paddingVertical: 6,
  },
});

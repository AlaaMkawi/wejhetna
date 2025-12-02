// wejhetna_app/src/screens/HomeScreen.tsx
import React from "react";
import { useTranslation } from "react-i18next";
import LanguageSwitcher from "../components/LanguageSwitcher";

import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
} from "react-native";

type Props = {
  navigation: any;
};

const BASE_COLOR = "#9bd3d8";      
const DARK_TEAL = "#2b6f73";
const LIGHT_BG = "#f4fbfc";

export default function HomeScreen({ navigation }: Props) {
  const { t } = useTranslation();

  return (
    
    <View style={styles.container}>
       <LanguageSwitcher />
      {/* Top colored header like the inspiration */}
      <View style={styles.header}>
        <View style={styles.logoWrapper}>
          <Image
                source={require("../../assets/wejhetna-logo.png")}
                style={styles.logo}
                resizeMode="contain"
          />
        </View>

        <Text style={styles.appName}>Wejhetna</Text>
      </View>

      {/* Floating white card */}
      <View style={styles.card}>
        {/* no “Rides and connections …” here anymore */}
        <View style={styles.buttonsContainer}>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => navigation.navigate("Login")}
          >
            <Text style={styles.primaryButtonText}>{t("login")}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => navigation.navigate("SignUp")}
          >
            <Text style={styles.secondaryButtonText}>{t("create_account")}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: LIGHT_BG,
  },
  header: {
    backgroundColor: BASE_COLOR,
    paddingTop: 80,
    paddingBottom: 60,
    paddingHorizontal: 24,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    alignItems: "center",
  },
  logoWrapper: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
    // soft shadow
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 4,
  },
  logo: {
    width: 70,
    height: 70,
  },
  appName: {
    fontSize: 24,
    fontWeight: "700",
    color: DARK_TEAL,
  },
  card: {
    marginTop: -30, // make the card float over the header
    marginHorizontal: 24,
    backgroundColor: "#fff",
    borderRadius: 24,
    paddingVertical: 24,
    paddingHorizontal: 20,
    // shadow
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 6,
  },
  buttonsContainer: {
    gap: 12,
  },
  primaryButton: {
    backgroundColor: DARK_TEAL,
    paddingVertical: 14,
    borderRadius: 999,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  secondaryButton: {
    paddingVertical: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: DARK_TEAL,
    alignItems: "center",
    backgroundColor: "#fff",
  },
  secondaryButtonText: {
    color: DARK_TEAL,
    fontSize: 16,
    fontWeight: "600",
  },
});

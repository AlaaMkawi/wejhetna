import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from "react-native";
import RegularSignupForm from "./RegularSignupForm";
import DriverSignupForm from "./DriverSignupForm";

const MINT = "#9bd3d8";
const DARK_TEAL = "#0f5b63";

type SignupType = "choose" | "regular" | "driver";

export default function SignUpScreen() {
  const [type, setType] = useState<SignupType>("choose");

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      {/* Mint header like login screen */}
      <View style={styles.header}>
        <Text style={styles.logoText}>Wejhetna</Text>
        <Text style={styles.welcome}>Create your account</Text>
      </View>

      {/* Floating white card */}
      <View style={styles.card}>
        <Text style={styles.title}>Sign up</Text>

        {type === "choose" && (
          <>
            <Text style={styles.subtitle}>
              Choose how you want to use Wejhetna
            </Text>

            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => setType("regular")}
            >
              <Text style={styles.primaryButtonText}>Regular user</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => setType("driver")}
            >
              <Text style={styles.secondaryButtonText}>Driver</Text>
            </TouchableOpacity>
          </>
        )}

        {type === "regular" && (
          <>
            <Text style={styles.modeLabel}>Regular user sign up</Text>
            <RegularSignupForm onBack={() => setType("choose")} />
          </>
        )}

        {type === "driver" && (
          <>
            <Text style={styles.modeLabel}>Driver sign up</Text>
            <DriverSignupForm onBack={() => setType("choose")} />
          </>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flexGrow: 1,
    backgroundColor: "#ffffff",
  },
  header: {
    backgroundColor: MINT,
    paddingTop: 60,
    paddingBottom: 40,
    paddingHorizontal: 24,
    alignItems: "center",
    borderBottomLeftRadius: 40,
    borderBottomRightRadius: 40,
  },
  logoText: {
    fontSize: 26,
    fontWeight: "800",
    color: "#ffffff",
    letterSpacing: 1,
    marginBottom: 6,
  },
  welcome: {
    fontSize: 16,
    color: "#eafcff",
  },
  card: {
    marginTop: -30,
    marginHorizontal: 24,
    backgroundColor: "#ffffff",
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 24,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: DARK_TEAL,
    textAlign: "center",
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 14,
    color: "#7a98a0",
    textAlign: "center",
    marginBottom: 20,
  },
  modeLabel: {
    fontSize: 14,
    color: "#7a98a0",
    marginBottom: 12,
    textAlign: "center",
  },
  primaryButton: {
    backgroundColor: DARK_TEAL,
    borderRadius: 24,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
  secondaryButton: {
    borderRadius: 24,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: DARK_TEAL,
    marginBottom: 4,
  },
  secondaryButtonText: {
    color: DARK_TEAL,
    fontSize: 16,
    fontWeight: "600",
  },
});

import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigation } from "@react-navigation/native";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  I18nManager,
} from "react-native";

const API_BASE_URL = "http://10.0.2.2:8000";
const DARK_TEAL = "#0f5b63";

export default function RegularSignupForm({ onBack, route }: any) {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();

  // ✅ email comes ONLY from verified step
  const email = route?.params?.email;
if (!email) {
  return (
    <View style={styles.container}>
      <Text style={{ color: "red", textAlign: "center" }}>
        Invalid signup flow. Please start again.
      </Text>
    </View>
  );
}

  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");

  const [error, setError] = useState<string | null>(null);

  const signupRegular = async () => {
    setError(null);

    try {
      const res = await fetch(`${API_BASE_URL}/auth/signup/regular`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: fullName,
          username,
          email, // ✅ verified email
          phone,
          password,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        setError(
          typeof json?.detail === "string"
            ? json.detail
            : t("signup_failed")
        );
        return;
      }

      // ✅ Signup done → go to Login
      navigation.reset({
        index: 0,
        routes: [{ name: "Login" }],
      });

    } catch (e: any) {
      setError(t("network_error"));
    }
  };

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        value={fullName}
        onChangeText={setFullName}
        placeholder={t("full_name")}
        placeholderTextColor="#9ab8bd"
      />

      <TextInput
        style={styles.input}
        value={username}
        onChangeText={setUsername}
        placeholder={t("username")}
        placeholderTextColor="#9ab8bd"
        autoCapitalize="none"
      />

      <TextInput
        style={styles.input}
        value={phone}
        onChangeText={setPhone}
        placeholder={t("phone")}
        placeholderTextColor="#9ab8bd"
        keyboardType="phone-pad"
      />

      <TextInput
        style={styles.input}
        value={password}
        onChangeText={setPassword}
        placeholder={t("password")}
        placeholderTextColor="#9ab8bd"
        secureTextEntry
      />

      <TouchableOpacity style={styles.primaryButton} onPress={signupRegular}>
        <Text style={styles.primaryButtonText}>{t("sign_up")}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.secondaryButton} onPress={onBack}>
        <Text style={styles.secondaryButtonText}>{t("back")}</Text>
      </TouchableOpacity>

      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 8 },
  input: {
    backgroundColor: "#f5fdff",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#d6ebee",
    marginBottom: 10,
    fontSize: 14,
    color: "#234348",
    textAlign: I18nManager.isRTL ? "right" : "left",
  },
  primaryButton: {
    backgroundColor: DARK_TEAL,
    borderRadius: 24,
    paddingVertical: 12,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  secondaryButton: {
    marginTop: 10,
    borderRadius: 24,
    paddingVertical: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: DARK_TEAL,
  },
  secondaryButtonText: {
    color: DARK_TEAL,
    fontSize: 15,
    fontWeight: "600",
  },
  error: {
    marginTop: 10,
    color: "red",
    fontSize: 12,
  },
});

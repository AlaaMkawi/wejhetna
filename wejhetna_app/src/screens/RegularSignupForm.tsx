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
import MessageModal from "./MessageModal";

const API_BASE_URL = "http://10.0.2.2:8000";
const DARK_TEAL = "#0f5b63";

type Props = {
  onBack: () => void;
};

export default function RegularSignupForm({ onBack }: Props) {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");

  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  // 🔹 modal state
  const [modalVisible, setModalVisible] = useState(false);
  const [modalType, setModalType] = useState<"error" | "success">("error");
  const [modalTitle, setModalTitle] = useState("");
  const [modalMessage, setModalMessage] = useState("");

  const showModal = (
    type: "error" | "success",
    title: string,
    message: string
  ) => {
    setModalType(type);
    setModalTitle(title);
    setModalMessage(message);
    setModalVisible(true);
  };

  const signupRegular = async () => {
    setResult(null);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/signup/regular`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: fullName,
          username,
          email,
          phone,
          password,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        if (res.status === 400 || res.status === 409) {
          const msg = t("username_email_exists");
          setError(msg);
          showModal("error", t("sign_up_error"), msg);
        } else if (typeof json?.detail === "string") {
          setError(json.detail);
          showModal("error", t("sign_up_error"), json.detail);
        } else {
          const msg = t("signup_failed");
          setError(msg);
          showModal("error", t("sign_up_error"), msg);
        }
        return;
      }

      setResult(json);
      showModal("success", t("account_created"), t("account_created_success"));
    } catch (e: any) {
      const msg = t("network_error") + e.message;
      setError(msg);
      showModal("error", t("network_error").trim(), msg);
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
        value={email}
        onChangeText={setEmail}
        placeholder={t("email")}
        placeholderTextColor="#9ab8bd"
        autoCapitalize="none"
        keyboardType="email-address"
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

      {/* pretty popup */}
      <MessageModal
        visible={modalVisible}
        type={modalType}
        title={modalTitle}
        message={modalMessage}
        onClose={() => {
          setModalVisible(false);
          // Navigate to LoginScreen only after user closes success modal
          if (modalType === "success") {
            navigation.reset({
              index: 1,
              routes: [
                { name: "Home" },
                { name: "Login" },
              ],
            });
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 8,
  },
  subtitle: {
    fontSize: 16,
    fontWeight: "600",
    color: DARK_TEAL,
    textAlign: "center",
    marginBottom: 16,
  },
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
    marginTop: 4,
    backgroundColor: DARK_TEAL,
    borderRadius: 24,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
    textAlign: I18nManager.isRTL ? "right" : "left",
  },
  secondaryButton: {
    marginTop: 10,
    borderRadius: 24,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: DARK_TEAL,
  },
  secondaryButtonText: {
    color: DARK_TEAL,
    fontSize: 15,
    fontWeight: "600",
    textAlign: I18nManager.isRTL ? "right" : "left",
  },
  success: {
    marginTop: 10,
    color: "green",
    fontSize: 12,
  },
  error: {
    marginTop: 10,
    color: "red",
    fontSize: 12,
  },
});
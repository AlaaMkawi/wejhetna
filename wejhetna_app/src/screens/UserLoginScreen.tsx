import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Button,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/types";
import { API_BASE_URL } from "../../config";
import { useTranslation } from "react-i18next";
type Props = NativeStackScreenProps<RootStackParamList, "UserLogin">;

export default function UserLoginScreen({ route }: Props) {
  const { t } = useTranslation();
  const { mode } = route.params; // "REGULAR" or "DRIVER"

  const [usernameOrEmail, setUsernameOrEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const title =
    mode === "REGULAR"
      ? t("regular_user_login") || "Regular User Login"
      : t("driver_login") || "Driver Login";

  const handleLogin = async () => {
    setError(null);
    setSuccess(null);

    if (!usernameOrEmail.trim() || !password.trim()) {
      setError(t("login_missing_fields") || "Please enter username/email and password");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username_or_email: usernameOrEmail.trim(),
          password,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        setError(json.detail || t("login_failed") || "Login failed");
        return;
      }

      // json should have: id, full_name, role, status
      const role = json.role;
      const status = json.status;

      if (mode === "REGULAR") {
        if (role !== "REGULAR") {
          setError(t("not_regular_account") || "This account is not a regular user account.");
          return;
        }
        if (status !== "ACTIVE") {
          setError(t("account_not_active") || "Your account is not active yet.");
          return;
        }
        setSuccess(t("logged_in_as_regular", { name: json.full_name }) || `Logged in as regular user: ${json.full_name}`);
      } else {
        // DRIVER mode
        if (role !== "DRIVER") {
          setError(t("not_driver_account") || "This account is not a driver account.");
          return;
        }
        if (status !== "ACTIVE") {
          setError(t("driver_not_approved") || "Your driver application is not approved yet.");
          return;
        }
        setSuccess(t("logged_in_as_driver", { name: json.full_name }) || `Logged in as driver: ${json.full_name}`);
      }
    } catch (e: any) {
      setError(`${t("network_error") || "Network error"}: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>

      <TextInput
        style={styles.input}
        value={usernameOrEmail}
        onChangeText={setUsernameOrEmail}
        placeholder={t("username_or_email") || "Username or email"}
        autoCapitalize="none"
      />

      <TextInput
        style={styles.input}
        value={password}
        onChangeText={setPassword}
        placeholder={t("password") || "Password"}
        secureTextEntry
      />

      {loading ? (
        <ActivityIndicator />
      ) : (
        <Button title={t("login") || "Login"} onPress={handleLogin} />
      )}

      {error && <Text style={styles.error}>{error}</Text>}
      {success && <Text style={styles.success}>{success}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    flex: 1,
    justifyContent: "center",
  },
  title: {
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 20,
    textAlign: "center",
  },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    padding: 8,
    borderRadius: 6,
    marginBottom: 12,
  },
  error: {
    marginTop: 12,
    color: "red",
    textAlign: "center",
  },
  success: {
    marginTop: 12,
    color: "green",
    textAlign: "center",
  },
});

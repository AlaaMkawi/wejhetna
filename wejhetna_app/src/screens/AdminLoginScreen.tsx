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

type Props = NativeStackScreenProps<RootStackParamList, "AdminLogin">;

export default function AdminLoginScreen({ navigation }: Props) {
  const [usernameOrEmail, setUsernameOrEmail] = useState("admin");
  const [password, setPassword] = useState("Admin123!");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    setError(null);

    if (!usernameOrEmail.trim() || !password.trim()) {
      setError("Please enter username/email and password");
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
        setError(json.detail || "Login failed");
        return;
      }

      if (json.role !== "ADMIN") {
        setError("This user is not an admin");
        return;
      }

      // ✅ לוגין מוצלח – מעבר לדף הבית של האדמין
      navigation.navigate("AdminPanel");
    } catch (e: any) {
      setError("Network error: " + (e?.message || "unknown error"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Admin Login</Text>

      <TextInput
        style={styles.input}
        value={usernameOrEmail}
        onChangeText={setUsernameOrEmail}
        placeholder="Username or email"
        autoCapitalize="none"
      />

      <TextInput
        style={styles.input}
        value={password}
        onChangeText={setPassword}
        placeholder="Password"
        secureTextEntry
      />

      {loading ? (
        <ActivityIndicator />
      ) : (
        <Button title="Login" onPress={handleLogin} />
      )}

      {error && <Text style={styles.error}>{error}</Text>}
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
});

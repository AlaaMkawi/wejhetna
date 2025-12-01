import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Button,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";

const API_BASE_URL = "http://10.0.2.2:8000";

type Props = {
  navigation: any;
};

export default function LoginScreen({ navigation }: Props) {
  const [usernameOrEmail, setUsernameOrEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false); // 👈 NEW
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    setError(null);

    if (!usernameOrEmail.trim() || !password.trim()) {
      setError("Please enter username/email and password.");
      return;
    }

    setLoading(true);
    try {
      const value = usernameOrEmail.trim();
      const pwd = password.trim();

      const body = {
        username_or_email: value,
        password: pwd,
      };

      const res = await fetch(`${API_BASE_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        let message = "Invalid credentials.";
        if (typeof data === "string") {
          message = data;
        } else if (typeof data?.detail === "string") {
          message = data.detail;
        } else if (Array.isArray(data?.detail)) {
          message = data.detail
            .map((e: any) => {
              const loc = Array.isArray(e.loc) ? e.loc.join(" → ") : "";
              if (loc) return `${loc}: ${e.msg}`;
              return e.msg || "";
            })
            .filter(Boolean)
            .join("\n");
        }
        setError(message);
        return;
      }

      const lower = value.toLowerCase();
      const isAdminUser =
        lower === "admin" || lower.startsWith("admin@");

      if (isAdminUser) {
        navigation.reset({
          index: 0,
          routes: [{ name: "AdminHomeScreen" }],
        });
      } else {
        navigation.reset({
          index: 0,
          routes: [{ name: "RegularHome" }],
        });
      }
    } catch (e: any) {
      setError("Network error: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Login</Text>
      <Text style={styles.subtitle}>
        One login for admin, drivers and residents
      </Text>

      <TextInput
        style={styles.input}
        placeholder="Username or email"
        value={usernameOrEmail}
        onChangeText={setUsernameOrEmail}
        autoCapitalize="none"
      />

      {/* 🔐 Password with show/hide eye icon */}
      <View style={styles.passwordContainer}>
        <TextInput
          style={styles.passwordInput}
          placeholder="Password"
          secureTextEntry={!showPassword}   // 👈 toggle here
          value={password}
          onChangeText={setPassword}
        />
        <TouchableOpacity
          onPress={() => setShowPassword((prev) => !prev)}
          style={styles.eyeButton}
        >
          <Ionicons
            name={showPassword ? "eye-off" : "eye"}
            size={20}
            color="#666"
          />
        </TouchableOpacity>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      {loading ? (
        <ActivityIndicator style={{ marginTop: 12 }} />
      ) : (
        <Button title="Log in" onPress={handleLogin} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 4,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    color: "#666",
    marginBottom: 16,
    textAlign: "center",
  },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
  },
  // 🔽 NEW styles for password + eye
  passwordContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    paddingHorizontal: 10,
    marginBottom: 12,
  },
  passwordInput: {
    flex: 1,
    paddingVertical: 10,
  },
  eyeButton: {
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  error: {
    color: "red",
    marginBottom: 8,
    textAlign: "center",
  },
});

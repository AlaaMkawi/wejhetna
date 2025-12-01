import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Linking,
} from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";

const API_BASE_URL = "http://10.0.2.2:8000";

type Props = {
  navigation: any;
};

const MINT = "#9bd3d8";
const DARK_TEAL = "#0f5b63";

export default function LoginScreen({ navigation }: Props) {
  const [usernameOrEmail, setUsernameOrEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
          routes: [{ name: "AdminTabs" }],
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

  const handleContactEmail = () => {
    Linking.openURL("mailto:wejhetna.app@gmail.com").catch(() => {});
  };

  return (
    <View style={styles.screen}>
      {/* Mint header like the example */}
      <View style={styles.header}>
        <Text style={styles.logoText}>Wejhetna</Text>
        <Text style={styles.welcome}>Welcome back!</Text>
      </View>

      {/* Floating white card */}
      <View style={styles.card}>
        <Text style={styles.title}>Log in</Text>

        <TextInput
          style={styles.input}
          placeholder="Username or email"
          value={usernameOrEmail}
          onChangeText={setUsernameOrEmail}
          autoCapitalize="none"
          placeholderTextColor="#9ab8bd"
        />

        <View style={styles.passwordContainer}>
          <TextInput
            style={styles.passwordInput}
            placeholder="Password"
            secureTextEntry={!showPassword}
            value={password}
            onChangeText={setPassword}
            placeholderTextColor="#9ab8bd"
          />
          <TouchableOpacity
            onPress={() => setShowPassword((prev) => !prev)}
            style={styles.eyeButton}
          >
            <Ionicons
              name={showPassword ? "eye-off" : "eye"}
              size={20}
              color="#66838a"
            />
          </TouchableOpacity>
        </View>

        {error && <Text style={styles.error}>{error}</Text>}

        <TouchableOpacity
          style={styles.primaryButton}
          onPress={handleLogin}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryButtonText}>Login</Text>
          )}
        </TouchableOpacity>

        {/* New user? Sign up */}
        <View style={styles.newUserRow}>
          <Text style={styles.newUserText}>New user? </Text>
          <TouchableOpacity onPress={() => navigation.navigate("SignUp")}>
            <Text style={styles.signUpText}>Sign up</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Footer with Gmail icon */}
      <View style={styles.footer}>
        <Text style={styles.contactText}>Contact us</Text>
        <TouchableOpacity onPress={handleContactEmail} style={styles.gmailIconBtn}>
          <Ionicons name="mail" size={24} color={DARK_TEAL} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
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
    marginTop: -30, // float over header
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
    marginBottom: 18,
  },
  input: {
    backgroundColor: "#f5fdff",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#d6ebee",
    marginBottom: 12,
    fontSize: 14,
    color: "#234348",
  },
  passwordContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f5fdff",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#d6ebee",
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  passwordInput: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 14,
    color: "#234348",
  },
  eyeButton: {
    paddingLeft: 8,
    paddingVertical: 4,
  },
  error: {
    color: "#d7263d",
    textAlign: "center",
    marginTop: 6,
    marginBottom: 10,
    fontSize: 13,
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
  },
  newUserRow: {
    marginTop: 14,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  newUserText: {
    fontSize: 13,
    color: "#7a98a0",
  },
  signUpText: {
    fontSize: 13,
    color: DARK_TEAL,
    fontWeight: "600",
  },
  footer: {
    marginTop: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  contactText: {
    fontSize: 13,
    color: "#8aa4aa",
    marginBottom: 6,
  },
  gmailIconBtn: {
    padding: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#d2e5e9",
  },
});

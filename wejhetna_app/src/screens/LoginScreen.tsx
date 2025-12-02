import React, { useState } from "react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
  const [usernameOrEmail, setUsernameOrEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    setError(null);

    if (!usernameOrEmail.trim() || !password.trim()) {
      setError(t("login_missing_fields"));
      return;
    }

    setLoading(true);
    try {
      const body = {
        username_or_email: usernameOrEmail.trim(),
        password: password.trim(),
      };

      const res = await fetch(`${API_BASE_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        let message = "Invalid credentials.";
        if (typeof data === "string") message = data;
        else if (typeof data?.detail === "string") message = data.detail;
        else if (Array.isArray(data?.detail)) {
          message = data.detail
            .map((e: any) => {
              const loc = Array.isArray(e.loc) ? e.loc.join(" → ") : "";
              return loc ? `${loc}: ${e.msg}` : e.msg || "";
            })
            .join("\n");
        }

        setError(message);
        return;
      }

      const lower = usernameOrEmail.trim().toLowerCase();
      const isAdmin = lower === "admin" || lower.startsWith("admin@");

      navigation.reset({
        index: 0,
        routes: [{ name: isAdmin ? "AdminTabs" : "RegularHome" }],
      });
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
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.logoText}>Wejhetna</Text>
        <Text style={styles.welcome}>{t("welcome_back")}</Text>
      </View>

      {/* Card */}
      <View style={styles.card}>
        <Text style={styles.title}>{t("login")}</Text>

        {/* Username input */}
        <TextInput
          style={[styles.input, styles.inputRight]}
          placeholder={t("username_or_email")}
          value={usernameOrEmail}
          onChangeText={setUsernameOrEmail}
          autoCapitalize="none"
          placeholderTextColor="#9ab8bd"
        />

        {/* Password container */}
        <View style={styles.passwordContainer}>
          <TextInput
            style={styles.passwordInput}
            placeholder={t("password")}
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

        {/* Login button */}
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={handleLogin}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryButtonText}>{t("login")}</Text>
          )}
        </TouchableOpacity>

        {/* New user? */}
        <View style={styles.newUserRow}>
          <Text style={styles.newUserText}>{t("new_user_question_")}</Text>
          <TouchableOpacity onPress={() => navigation.navigate("SignUp")}>
            <Text style={styles.signUpText}>{t("sign_up")}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.contactText}>{t("contact_us")}</Text>
        <TouchableOpacity
          onPress={handleContactEmail}
          style={styles.gmailIconBtn}
        >
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
    borderWidth: 1,
    borderColor: "#d6ebee",
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 12,
    fontSize: 14,
    color: "#234348",
  },
  inputRight: {
    textAlign: "right",
  },
  passwordContainer: {
    flexDirection: "row-reverse", // RTL: icon left, text right
    justifyContent: "space-between",
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
    textAlign: "right",
    paddingVertical: 10,
    fontSize: 14,
    color: "#234348",
    marginRight: 10, // extra spacing from eye icon
  },
  eyeButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    justifyContent: "center",
    alignItems: "center",
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
    fontWeight: "700",
    marginHorizontal: 4,
  },
  footer: {
    marginTop: 24,
    alignItems: "center",
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

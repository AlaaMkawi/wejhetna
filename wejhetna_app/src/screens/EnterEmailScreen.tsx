import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from "react-native";

const API_BASE_URL = "http://10.0.2.2:8000";

export default function EnterEmailScreen({ navigation }: any) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  const sendCode = async () => {
    if (!email.trim()) {
      Alert.alert("Error", "Please enter your email");
      return;
    }

    try {
      setLoading(true);

      const res = await fetch(
        `${API_BASE_URL}/auth/request-email-verification`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email.trim() }),
        }
      );

      const json = await res.json();

      if (!res.ok) {
        Alert.alert(
          "Error",
          json?.detail || "Failed to send verification code"
        );
        return;
      }

      // ✅ Success → go to VerifyEmail
      navigation.navigate("VerifyEmail", { email: email.trim() });

    } catch (e: any) {
      Alert.alert("Network error", e?.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Enter your email</Text>

      <TextInput
        style={styles.input}
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />

      <TouchableOpacity
        style={[
          styles.button,
          (!email.trim() || loading) && { opacity: 0.6 },
        ]}
        onPress={sendCode}
        disabled={!email.trim() || loading}
      >
        <Text style={styles.buttonText}>
          {loading ? "Sending..." : "Send code"}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    padding: 20,
    backgroundColor: "#fff",
  },
  title: {
    fontSize: 20,
    marginBottom: 20,
    textAlign: "center",
    fontWeight: "700",
  },
  input: {
    borderWidth: 1,
    padding: 12,
    borderRadius: 10,
    marginBottom: 12,
    borderColor: "#ccc",
  },
  button: {
    backgroundColor: "#0f5b63",
    padding: 14,
    borderRadius: 10,
  },
  buttonText: {
    color: "#fff",
    textAlign: "center",
    fontWeight: "700",
  },
});

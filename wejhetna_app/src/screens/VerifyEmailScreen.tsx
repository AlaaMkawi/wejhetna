import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from "react-native";

const API_BASE_URL = "http://10.0.2.2:8000";

export default function VerifyEmailScreen({ route, navigation }: any) {
  const emailFromRoute = route?.params?.email || "";

  const [email, setEmail] = useState(emailFromRoute);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);

  const handleVerify = async () => {
    if (!email.trim() || !code.trim()) {
      Alert.alert("Error", "Please enter email and code");
      return;
    }

    try {
      setLoading(true);

      const res = await fetch(`${API_BASE_URL}/auth/verify-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          code: code.trim(),
        }),
      });

      const json = await res.json();

     if (!res.ok) {
      Alert.alert(
        "Verification failed",
        json?.detail || "Invalid or expired code"
      );
      return;
    }

   Alert.alert(
  "Email verified ",
  "Your email was verified successfully.\nPlease complete your signup.",
  [
    {
      text: "Continue",
            onPress: () =>
            navigation.navigate("RegularSignup", {
        email: email.trim(),
      })
    },
  ]
);

  } catch (e: any) {
    Alert.alert("Network error", e?.message || "Error");
  } finally {
    setLoading(false);
  }
};

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Verify your email</Text>

      <TextInput
        style={styles.input}
        value={email}
        editable={false}
      />


      <TextInput
        style={styles.input}
        value={code}
        onChangeText={setCode}
        placeholder="Verification code"
        keyboardType="numeric"
      />

      <TouchableOpacity style={styles.button} onPress={handleVerify} disabled={loading}>
        <Text style={styles.buttonText}>{loading ? "Verifying..." : "Verify"}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 20, backgroundColor: "#fff" },
  title: { fontSize: 22, fontWeight: "700", marginBottom: 20, textAlign: "center" },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  button: {
    backgroundColor: "#0f5b63",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 6,
  },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});

import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
} from "react-native";
import MessageModal from "./MessageModal";

const API_BASE_URL = "http://10.0.2.2:8000";
const DARK_TEAL = "#0f5b63";

type Props = {
  onBack: () => void;
};

export default function RegularSignupForm({ onBack }: Props) {
  const [fullName, setFullName] = useState("Regular Test");
  const [username, setUsername] = useState("regular_android");
  const [email, setEmail] = useState("regular.android@example.com");
  const [phone, setPhone] = useState("0501234567");
  const [password, setPassword] = useState("test1234");

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
          const msg = "Username or email already exists.";
          setError(msg);
          showModal("error", "Sign up error", msg);
        } else if (typeof json?.detail === "string") {
          setError(json.detail);
          showModal("error", "Sign up error", json.detail);
        } else {
          const msg = "Signup failed. Please try again.";
          setError(msg);
          showModal("error", "Sign up error", msg);
        }
        return;
      }

      setResult(json);
      showModal("success", "Account created", "Your account was created successfully.");
    } catch (e: any) {
      const msg = "Network error: " + e.message;
      setError(msg);
      showModal("error", "Network error", msg);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.subtitle}>Regular user sign up</Text>

      <TextInput
        style={styles.input}
        value={fullName}
        onChangeText={setFullName}
        placeholder="Full name"
        placeholderTextColor="#9ab8bd"
      />
      <TextInput
        style={styles.input}
        value={username}
        onChangeText={setUsername}
        placeholder="Username"
        placeholderTextColor="#9ab8bd"
        autoCapitalize="none"
      />
      <TextInput
        style={styles.input}
        value={email}
        onChangeText={setEmail}
        placeholder="Email"
        placeholderTextColor="#9ab8bd"
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <TextInput
        style={styles.input}
        value={phone}
        onChangeText={setPhone}
        placeholder="Phone"
        placeholderTextColor="#9ab8bd"
        keyboardType="phone-pad"
      />
      <TextInput
        style={styles.input}
        value={password}
        onChangeText={setPassword}
        placeholder="Password"
        placeholderTextColor="#9ab8bd"
        secureTextEntry
      />

      <TouchableOpacity style={styles.primaryButton} onPress={signupRegular}>
        <Text style={styles.primaryButtonText}>Sign up</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.secondaryButton} onPress={onBack}>
        <Text style={styles.secondaryButtonText}>Back</Text>
      </TouchableOpacity>

      {result && (
        <Text style={styles.success}>{JSON.stringify(result)}</Text>
      )}
      {error && <Text style={styles.error}>{error}</Text>}

      {/* pretty popup */}
      <MessageModal
        visible={modalVisible}
        type={modalType}
        title={modalTitle}
        message={modalMessage}
        onClose={() => setModalVisible(false)}
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

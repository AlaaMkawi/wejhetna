// src/businessOwner/BusinessOwnerSignupScreen.tsx
import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
// ✅ correct paths from src/screens/businessOwner/
import { BusinessOwnerSignupPayload, signupBusinessOwner } from "../../api/businessOwnerApi";
import { RootStackParamList } from "../../navigation/types";

type NavType = NativeStackNavigationProp<RootStackParamList, "BusinessOwnerSignup">;

export default function BusinessOwnerSignupScreen() {
  const navigation = useNavigation<NavType>();

  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!fullName || !username || !email || !phone || !password) {
      Alert.alert("Error", "Please fill all fields");
      return;
    }

    const payload: BusinessOwnerSignupPayload = {
      full_name: fullName,
      username,
      email,
      phone,
      password,
    };

    try {
      setLoading(true);
      const res = await signupBusinessOwner(payload);

      // user is created with status=PENDING (backend)
      const userId = res.user.id;

      // 👉 go to next step: choose location
      navigation.navigate("BusinessOwnerPickLocation", {
        userId,
      });

      // Show success message after navigation
      Alert.alert("Success", res.message || "Signup created successfully");
    } catch (err: any) {
      console.log("signupBusinessOwner error:", err?.response?.data || err?.message);
      
      // Extract error message properly
      let errorMessage = "Could not sign up business owner";
      
      if (err?.response?.data) {
        const errorData = err.response.data;
        
        // Handle different error response formats
        if (typeof errorData.detail === "string") {
          errorMessage = errorData.detail;
        } else if (typeof errorData.detail === "object" && errorData.detail !== null) {
          // If detail is an object, try to extract a message
          if (errorData.detail.message) {
            errorMessage = errorData.detail.message;
          } else if (errorData.detail.msg) {
            errorMessage = errorData.detail.msg;
          } else if (Array.isArray(errorData.detail)) {
            // FastAPI validation errors
            const msgs = errorData.detail
              .map((d: any) => d?.msg || "")
              .filter(Boolean);
            if (msgs.length > 0) {
              errorMessage = msgs.join(", ");
            }
          } else {
            // Try to stringify the object or use a default
            errorMessage = JSON.stringify(errorData.detail);
          }
        } else if (typeof errorData.message === "string") {
          errorMessage = errorData.message;
        } else if (typeof errorData.error === "string") {
          errorMessage = errorData.error;
        }
      } else if (err?.message && typeof err.message === "string") {
        errorMessage = err.message;
      }
      
      Alert.alert("Error", errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Business Owner – Signup</Text>

      <TextInput
        style={styles.input}
        placeholder="Full name"
        value={fullName}
        onChangeText={setFullName}
      />
      <TextInput
        style={styles.input}
        placeholder="Username"
        autoCapitalize="none"
        value={username}
        onChangeText={setUsername}
      />
      <TextInput
        style={styles.input}
        placeholder="Email"
        keyboardType="email-address"
        autoCapitalize="none"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Phone"
        keyboardType="phone-pad"
        value={phone}
        onChangeText={setPhone}
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleSubmit}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator />
        ) : (
          <Text style={styles.buttonText}>Continue</Text>
        )}
      </TouchableOpacity>
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
    fontSize: 22,
    fontWeight: "600",
    marginBottom: 24,
    textAlign: "center",
  },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  button: {
    backgroundColor: "#1e90ff",
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 16,
  },
});

import React, { useState } from "react";
import { View, Text, TextInput, Button, StyleSheet } from "react-native";

const API_BASE_URL = "http://10.0.2.2:8000";

export default function RegularSignupForm({ onBack }) {
  const [fullName, setFullName] = useState("Regular Test");
  const [username, setUsername] = useState("regular_android");
  const [email, setEmail] = useState("regular.android@example.com");
  const [phone, setPhone] = useState("0501234567");
  const [password, setPassword] = useState("test1234");

  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

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
      res.ok ? setResult(json) : setError(JSON.stringify(json));
    } catch (e) {
      setError("Network error: " + e.message);
    }
  };

  return (
    <View>
      <Text style={styles.subtitle}>Regular user signup</Text>

      <TextInput style={styles.input} value={fullName} onChangeText={setFullName} placeholder="Full name" />
      <TextInput style={styles.input} value={username} onChangeText={setUsername} placeholder="Username" />
      <TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder="Email" />
      <TextInput style={styles.input} value={phone} onChangeText={setPhone} placeholder="Phone" />
      <TextInput style={styles.input} value={password} onChangeText={setPassword} placeholder="Password" secureTextEntry />

      <Button title="Signup regular user" onPress={signupRegular} />
      <View style={{ height: 12 }} />
      <Button title="Back" onPress={onBack} />

      {result && <Text style={{ color: "green" }}>{JSON.stringify(result)}</Text>}
      {error && <Text style={{ color: "red" }}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  subtitle: { fontSize: 18, marginVertical: 8 },
  input: {
    borderWidth: 1, borderColor: "#ccc", padding: 8, borderRadius: 6, marginBottom: 8,
  },
});

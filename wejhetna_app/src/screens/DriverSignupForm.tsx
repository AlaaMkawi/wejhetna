import React, { useState } from "react";
import { View, Text, TextInput, Button, StyleSheet } from "react-native";

const API_BASE_URL = "http://10.0.2.2:8000";

export default function DriverSignupForm({ onBack }) {
  const [fullName, setFullName] = useState("Android Driver");
  const [username, setUsername] = useState("driver_android");
  const [email, setEmail] = useState("driver.android@example.com");
  const [phone, setPhone] = useState("0509999999");
  const [password, setPassword] = useState("Driver123!");

  const [carType, setCarType] = useState("Hyundai i20");
  const [plateNumber, setPlateNumber] = useState("11-222-33");
  const [productionYear, setProductionYear] = useState("2019");

  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const signupDriver = async () => {
    setResult(null);
    setError(null);

    try {
      const unique = Date.now().toString();

      const res = await fetch(`${API_BASE_URL}/auth/signup/driver`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: fullName,
          username: `${username}_${unique}`,
          email: `driver.${unique}@example.com`,
          phone,
          password,
          driver_license_image_url: "https://example.com/uploads/driver_license.jpg",
          id_card_image_url: "https://example.com/uploads/id_card.jpg",
          car_type: carType,
          plate_number: plateNumber,
          production_year: Number(productionYear),
          car_license_image_url: "https://example.com/uploads/car_license.jpg",
          car_insurance_image_url: "https://example.com/uploads/insurance.jpg",
          car_photos_urls: [
            "https://example.com/uploads/car_front.jpg",
            "https://example.com/uploads/car_back.jpg",
          ],
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
      <Text style={styles.subtitle}>Driver signup</Text>

      <TextInput style={styles.input} value={fullName} onChangeText={setFullName} placeholder="Full name" />
      <TextInput style={styles.input} value={username} onChangeText={setUsername} placeholder="Base username" />
      <TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder="Base email" />
      <TextInput style={styles.input} value={phone} onChangeText={setPhone} placeholder="Phone" />
      <TextInput style={styles.input} value={password} onChangeText={setPassword} placeholder="Password" secureTextEntry />

      <Text style={{ marginTop: 8, fontWeight: "bold" }}>Car info</Text>

      <TextInput style={styles.input} value={carType} onChangeText={setCarType} placeholder="Car type" />
      <TextInput style={styles.input} value={plateNumber} onChangeText={setPlateNumber} placeholder="Plate number" />
      <TextInput style={styles.input} value={productionYear} onChangeText={setProductionYear} placeholder="Production year" />

      <Button title="Sign Up Driver" onPress={signupDriver} />
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

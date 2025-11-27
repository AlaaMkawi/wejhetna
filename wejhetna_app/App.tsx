import React, { useState } from "react";
import {
  SafeAreaView,
  View,
  Text,
  TextInput,
  Button,
  StyleSheet,
  ScrollView,
} from "react-native";

const API_BASE_URL = "http://10.0.2.2:8000"; // backend on your laptop

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<"home" | "regular" | "driver">("home");

  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const resetMessages = () => {
    setResult(null);
    setError(null);
  };

  const checkHealth = async () => {
    resetMessages();
    try {
      const res = await fetch(`${API_BASE_URL}/health`);
      const json = await res.json();
      setResult(json);
    } catch (e) {
      setError("Network error: " + e.message);
    }
  };

  const goHome = () => {
    resetMessages();
    setCurrentScreen("home");
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>Wejhetna – Auth Test</Text>

        <Button title="Check /health" onPress={checkHealth} />

        <View style={styles.separator} />

        {currentScreen === "home" && (
          <>
            <Text style={styles.subtitle}>Choose signup type:</Text>
            <View style={styles.buttonRow}>
              <View style={styles.buttonWrapper}>
                <Button
                  title="Regular user signup"
                  onPress={() => {
                    resetMessages();
                    setCurrentScreen("regular");
                  }}
                />
              </View>
              <View style={styles.buttonWrapper}>
                <Button
                  title="Driver signup"
                  onPress={() => {
                    resetMessages();
                    setCurrentScreen("driver");
                  }}
                />
              </View>
            </View>
          </>
        )}

        {currentScreen === "regular" && (
          <RegularSignupForm
            onBack={goHome}
            setResult={setResult}
            setError={setError}
          />
        )}

        {currentScreen === "driver" && (
          <DriverSignupForm
            onBack={goHome}
            setResult={setResult}
            setError={setError}
          />
        )}

        <View style={styles.separator} />

        {result && (
          <Text style={styles.success}>
            SUCCESS: {JSON.stringify(result, null, 2)}
          </Text>
        )}

        {error && <Text style={styles.error}>ERROR: {error}</Text>}
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------- Regular user signup form ----------

function RegularSignupForm({ onBack, setResult, setError }) {
  const [fullName, setFullName] = useState("Regular Test");
  const [username, setUsername] = useState("regular_android");
  const [email, setEmail] = useState("regular.android@example.com");
  const [phone, setPhone] = useState("0501234567");
  const [password, setPassword] = useState("test1234");

  const signupRegular = async () => {
    setResult(null);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/signup/regular`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
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
        setError(JSON.stringify(json));
      } else {
        setResult(json);
      }
    } catch (e) {
      setError("Network error: " + e.message);
    }
  };

  return (
    <View>
      <Text style={styles.subtitle}>Regular user signup</Text>

      <TextInput
        style={styles.input}
        value={fullName}
        onChangeText={setFullName}
        placeholder="Full name"
      />
      <TextInput
        style={styles.input}
        value={username}
        onChangeText={setUsername}
        placeholder="Username"
      />
      <TextInput
        style={styles.input}
        value={email}
        onChangeText={setEmail}
        placeholder="Email"
      />
      <TextInput
        style={styles.input}
        value={phone}
        onChangeText={setPhone}
        placeholder="Phone"
      />
      <TextInput
        style={styles.input}
        value={password}
        onChangeText={setPassword}
        placeholder="Password"
        secureTextEntry
      />

      <Button title="Signup regular user" onPress={signupRegular} />
      <View style={styles.separator} />
      <Button title="Back" onPress={onBack} />
    </View>
  );
}

// ---------- Driver signup form ----------

function DriverSignupForm({ onBack, setResult, setError }) {
  const [fullName, setFullName] = useState("Android Driver");
  const [username, setUsername] = useState("driver_android");
  const [email, setEmail] = useState("driver.android@example.com");
  const [phone, setPhone] = useState("0509999999");
  const [password, setPassword] = useState("Driver123!");

  const [carType, setCarType] = useState("Hyundai i20");
  const [plateNumber, setPlateNumber] = useState("11-222-33");
  const [productionYear, setProductionYear] = useState("2019");

  const signupDriver = async () => {
    setResult(null);
    setError(null);
    try {
      // avoid duplicate username/email – add timestamp
      const unique = Date.now().toString();

      const res = await fetch(`${API_BASE_URL}/auth/signup/driver`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          full_name: fullName,
          username: `${username}_${unique}`,
          email: `driver.${unique}@example.com`,
          phone,
          password,
          driver_license_image_url:
            "https://example.com/uploads/driver_license.jpg",
          id_card_image_url: "https://example.com/uploads/id_card.jpg",
          car_type: carType,
          plate_number: plateNumber,
          production_year: Number(productionYear),
          car_license_image_url:
            "https://example.com/uploads/car_license.jpg",
          car_insurance_image_url:
            "https://example.com/uploads/insurance.jpg",
          car_photos_urls: [
            "https://example.com/uploads/car_front.jpg",
            "https://example.com/uploads/car_back.jpg",
          ],
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        setError(JSON.stringify(json));
      } else {
        setResult(json);
      }
    } catch (e) {
      setError("Network error: " + e.message);
    }
  };

  return (
    <View>
      <Text style={styles.subtitle}>Driver signup</Text>

      <TextInput
        style={styles.input}
        value={fullName}
        onChangeText={setFullName}
        placeholder="Full name"
      />
      <TextInput
        style={styles.input}
        value={username}
        onChangeText={setUsername}
        placeholder="Base username"
      />
      <TextInput
        style={styles.input}
        value={email}
        onChangeText={setEmail}
        placeholder="Base email (not used, we auto-generate unique)"
      />
      <TextInput
        style={styles.input}
        value={phone}
        onChangeText={setPhone}
        placeholder="Phone"
      />
      <TextInput
        style={styles.input}
        value={password}
        onChangeText={setPassword}
        placeholder="Password"
        secureTextEntry
      />

      <Text style={{ marginTop: 8, fontWeight: "bold" }}>Car info</Text>

      <TextInput
        style={styles.input}
        value={carType}
        onChangeText={setCarType}
        placeholder="Car type"
      />
      <TextInput
        style={styles.input}
        value={plateNumber}
        onChangeText={setPlateNumber}
        placeholder="Plate number"
      />
      <TextInput
        style={styles.input}
        value={productionYear}
        onChangeText={setProductionYear}
        placeholder="Production year"
        keyboardType="numeric"
      />

      <Button title="Signup driver" onPress={signupDriver} />
      <View style={styles.separator} />
      <Button title="Back" onPress={onBack} />
    </View>
  );
}

// ---------- Styles ----------

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    padding: 16,
    paddingBottom: 40,
  },
  title: {
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 16,
  },
  subtitle: {
    fontSize: 18,
    marginVertical: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    marginBottom: 8,
  },
  separator: {
    height: 16,
  },
  success: {
    color: "green",
    marginTop: 8,
  },
  error: {
    color: "red",
    marginTop: 8,
  },
  buttonRow: {
    flexDirection: "row",
    gap: 8,
  },
  buttonWrapper: {
    flex: 1,
  },
});

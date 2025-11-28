import React, { useState } from "react";
import { View, Text, TextInput, Button, StyleSheet } from "react-native";
import { launchImageLibrary } from "react-native-image-picker";

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

  // DOC URL FIELDS (images)
  const [driverLicenseUrl, setDriverLicenseUrl] = useState("");
  const [carLicenseUrl, setCarLicenseUrl] = useState("");
  const [carInsuranceUrl, setCarInsuranceUrl] = useState("");
  const [carPhoto1Url, setCarPhoto1Url] = useState("");
  const [carPhoto2Url, setCarPhoto2Url] = useState("");

  // ID is a long number string (NOT a photo)
  const [idNumber, setIdNumber] = useState("");

  const [result, setResult] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ----- IMAGE UPLOAD HELPER -----
  const pickAndUpload = (setUrl: (url: string) => void) => {
    launchImageLibrary({ mediaType: "photo" }, async (res) => {
      if (res.didCancel || res.errorCode) {
        console.log("User cancelled or error:", res.errorMessage);
        return;
      }

      const asset = res.assets?.[0];
      if (!asset || !asset.uri) return;

      // show local URI immediately
      setUrl(asset.uri);

      const formData = new FormData();
      formData.append("file", {
        uri: asset.uri,
        name: asset.fileName || "upload.jpg",
        type: asset.type || "image/jpeg",
      } as any);

      try {
        const uploadRes = await fetch(`${API_BASE_URL}/files/upload`, {
          method: "POST",
          headers: { "Content-Type": "multipart/form-data" },
          body: formData,
        });
        const json = await uploadRes.json();
        if (json.file_url) {
          // replace local URI with real server URL
          setUrl(json.file_url);
        }
      } catch (e: any) {
        console.log("Upload error", e?.message || e);
        // keep local uri so user still sees something
      }
    });
  };

  const uploadDriverLicense = () => pickAndUpload(setDriverLicenseUrl);
  const uploadCarLicense = () => pickAndUpload(setCarLicenseUrl);
  const uploadCarInsurance = () => pickAndUpload(setCarInsuranceUrl);
  const uploadCarPhoto1 = () => pickAndUpload(setCarPhoto1Url);
  const uploadCarPhoto2 = () => pickAndUpload(setCarPhoto2Url);

  // ----- SIGNUP -----
  const signupDriver = async () => {
    setResult(null);
    setError(null);

    // --- FRONTEND REQUIRED FIELDS CHECK ---
    if (
      !fullName.trim() ||
      !username.trim() ||
      !email.trim() ||
      !phone.trim() ||
      !password.trim() ||
      !carType.trim() ||
      !plateNumber.trim() ||
      !productionYear.trim() ||
      !driverLicenseUrl.trim() || // driver license photo required
      !idNumber.trim() ||         // ID number required
      !carLicenseUrl.trim() ||
      !carInsuranceUrl.trim()
    ) {
      setError("Please fill all required fields");
      return;
    }

    try {
      // optional car photos
      const carPhotos: string[] = [];
      if (carPhoto1Url.trim()) carPhotos.push(carPhoto1Url.trim());
      if (carPhoto2Url.trim()) carPhotos.push(carPhoto2Url.trim());

      const res = await fetch(`${API_BASE_URL}/auth/signup/driver`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: fullName,
          username: username, // exactly what user typed
          email: email,
          phone,
          password,

          // driver docs
          driver_license_image_url: driverLicenseUrl.trim(),
          id_card_image_url: idNumber.trim(), // ID number string saved here

          // car info
          car_type: carType,
          plate_number: plateNumber,
          production_year: Number(productionYear),

          // car docs
          car_license_image_url: carLicenseUrl.trim(),
          car_insurance_image_url: carInsuranceUrl.trim(),

          // optional car photos
          car_photos_urls: carPhotos,
        }),
      });

      const json = await res.json();
      res.ok ? setResult(json) : setError(JSON.stringify(json));
    } catch (e: any) {
      setError("Network error: " + e.message);
    }
  };

  // ----- UI -----
  return (
    <View>
      <Text style={styles.subtitle}>Driver signup</Text>

      {/* USER INFO */}
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
        placeholder="Base email"
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

      {/* CAR INFO */}
      <Text style={styles.sectionTitle}>Car info</Text>
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
      />

      {/* DRIVER DOCUMENTS */}
      <Text style={styles.sectionTitle}>Driver documents</Text>

      {/* ID as number string */}
      <TextInput
        style={styles.input}
        value={idNumber}
        onChangeText={setIdNumber}
        placeholder="ID number (long number)"
        keyboardType="numeric"
      />

      <Button title="Upload driver license" onPress={uploadDriverLicense} />
      <TextInput
        style={styles.input}
        value={driverLicenseUrl}
        onChangeText={setDriverLicenseUrl}
        placeholder="Driver license image URL"
      />

      {/* CAR DOCUMENTS */}
      <Text style={styles.sectionTitle}>Car documents</Text>

      <Button title="Upload car license" onPress={uploadCarLicense} />
      <TextInput
        style={styles.input}
        value={carLicenseUrl}
        onChangeText={setCarLicenseUrl}
        placeholder="Car license image URL"
      />

      <Button title="Upload car insurance" onPress={uploadCarInsurance} />
      <TextInput
        style={styles.input}
        value={carInsuranceUrl}
        onChangeText={setCarInsuranceUrl}
        placeholder="Car insurance image URL"
      />

      {/* CAR PHOTOS */}
      <Text style={styles.sectionTitle}>Car photos (optional)</Text>

      <Button title="Upload car photo 1" onPress={uploadCarPhoto1} />
      <TextInput
        style={styles.input}
        value={carPhoto1Url}
        onChangeText={setCarPhoto1Url}
        placeholder="Car photo 1 URL"
      />

      <Button title="Upload car photo 2" onPress={uploadCarPhoto2} />
      <TextInput
        style={styles.input}
        value={carPhoto2Url}
        onChangeText={setCarPhoto2Url}
        placeholder="Car photo 2 URL"
      />

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
  sectionTitle: {
    marginTop: 12,
    marginBottom: 4,
    fontWeight: "bold",
  },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    padding: 8,
    borderRadius: 6,
    marginBottom: 8,
  },
});

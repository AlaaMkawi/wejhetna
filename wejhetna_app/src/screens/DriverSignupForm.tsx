import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Button,
  StyleSheet,
  ScrollView,
} from "react-native";
import { launchImageLibrary } from "react-native-image-picker";

const API_BASE_URL = "http://10.0.2.2:8000";

type Props = {
  onBack: () => void;
};

export default function DriverSignupForm({ onBack }: Props) {
  // 🔹 Step state: 1 = basic info, 2 = driver details + docs
  const [step, setStep] = useState<1 | 2>(1);

  // ----- STEP 1: BASIC USER INFO (same as regular user) -----
  const [fullName, setFullName] = useState("Android Driver");
  const [username, setUsername] = useState("driver_android");
  const [email, setEmail] = useState("driver.android@example.com");
  const [phone, setPhone] = useState("0509999999");
  const [password, setPassword] = useState("Driver123!");

  // ----- STEP 2: CAR + DRIVER INFO -----
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

  // ----- SMALL VALIDATION HELPERS -----
  const isValidEmail = (value: string) => /\S+@\S+\.\S+/.test(value.trim());

  const isValidPhone = (value: string) => {
    const digitsOnly = value.replace(/\D/g, "");
    return /^[0-9]{9,15}$/.test(digitsOnly);
  };

  const isStrongPassword = (value: string) => {
    // At least 8 chars, at least 1 letter and 1 digit
    return /^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(value);
  };

  const isValidUsername = (value: string) => {
    // 3–20 chars, letters/numbers/underscore only
    return /^[A-Za-z0-9_]{3,20}$/.test(value);
  };

  const isValidIdNumber = (value: string) => {
    // digits only, length between 7 and 15
    return /^[0-9]{7,15}$/.test(value.trim());
  };

  const isValidProductionYear = (value: string) => {
    const year = Number(value);
    if (!Number.isInteger(year)) return false;
    const current = new Date().getFullYear();
    return year >= 1990 && year <= current + 1;
  };

  const isValidPlateNumber = (value: string) => {
    const trimmed = value.trim();
    // at least 5 chars and must contain a digit
    return trimmed.length >= 5 && /\d/.test(trimmed);
  };

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

  // ----- STEP 1 → VALIDATION & CONTINUE -----
  const goToStep2 = () => {
    setResult(null);
    setError(null);

    const nameTrim = fullName.trim();
    const usernameTrim = username.trim();
    const emailTrim = email.trim();
    const phoneTrim = phone.trim();
    const passwordTrim = password.trim();

    if (
      !nameTrim ||
      !usernameTrim ||
      !emailTrim ||
      !phoneTrim ||
      !passwordTrim
    ) {
      setError("Please fill all basic info before continuing.");
      return;
    }

    if (nameTrim.length < 3) {
      setError("Full name should be at least 3 characters.");
      return;
    }

    if (!isValidUsername(usernameTrim)) {
      setError(
        "Username must be 3–20 characters and contain only letters, numbers, or underscore."
      );
      return;
    }

    if (!isValidEmail(emailTrim)) {
      setError("Please enter a valid email address.");
      return;
    }

    if (!isValidPhone(phoneTrim)) {
      setError("Phone must contain 9–15 digits (numbers only).");
      return;
    }

    if (!isStrongPassword(passwordTrim)) {
      setError(
        "Password must be at least 8 characters and include both letters and numbers."
      );
      return;
    }

    setStep(2);
  };

  // ----- FINAL SIGNUP (ON STEP 2) -----
  const signupDriver = async () => {
    setResult(null);
    setError(null);

    const carTypeTrim = carType.trim();
    const plateTrim = plateNumber.trim();
    const prodYearTrim = productionYear.trim();
    const idTrim = idNumber.trim();
    const driverLicenseTrim = driverLicenseUrl.trim();
    const carLicenseTrim = carLicenseUrl.trim();
    const carInsuranceTrim = carInsuranceUrl.trim();

    // 🔸 Check required fields across both steps
    if (
      !fullName.trim() ||
      !username.trim() ||
      !email.trim() ||
      !phone.trim() ||
      !password.trim() ||
      !carTypeTrim ||
      !plateTrim ||
      !prodYearTrim ||
      !driverLicenseTrim ||
      !idTrim ||
      !carLicenseTrim ||
      !carInsuranceTrim
    ) {
      setError("Please fill all required fields.");
      return;
    }

    // 🔸 Re-check core rules in case user changed something after Step 1
    if (!isValidUsername(username.trim())) {
      setError(
        "Username must be 3–20 characters and contain only letters, numbers, or underscore."
      );
      return;
    }

    if (!isValidEmail(email.trim())) {
      setError("Please enter a valid email address.");
      return;
    }

    if (!isValidPhone(phone.trim())) {
      setError("Phone must contain 9–15 digits (numbers only).");
      return;
    }

    if (!isStrongPassword(password.trim())) {
      setError(
        "Password must be at least 8 characters and include both letters and numbers."
      );
      return;
    }

    // 🔸 Step 2 rules
    if (carTypeTrim.length < 2) {
      setError("Car type should be at least 2 characters.");
      return;
    }

    if (!isValidPlateNumber(plateTrim)) {
      setError("Plate number should be at least 5 characters and include a digit.");
      return;
    }

    if (!isValidProductionYear(prodYearTrim)) {
      const current = new Date().getFullYear();
      setError(
        `Production year must be a valid number between 1990 and ${current + 1}.`
      );
      return;
    }

    if (!isValidIdNumber(idTrim)) {
      setError("ID number must contain only digits and be 7–15 digits long.");
      return;
    }

    if (!driverLicenseTrim) {
      setError("Driver license image is required.");
      return;
    }

    if (!carLicenseTrim) {
      setError("Car license image is required.");
      return;
    }

    if (!carInsuranceTrim) {
      setError("Car insurance image is required.");
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
          full_name: fullName.trim(),
          username: username.trim(),
          email: email.trim(),
          phone: phone.trim(),
          password: password.trim(),

          // driver docs
          driver_license_image_url: driverLicenseTrim,
          id_card_image_url: idTrim, // ID number string saved here

          // car info
          car_type: carTypeTrim,
          plate_number: plateTrim,
          production_year: Number(prodYearTrim),

          // car docs
          car_license_image_url: carLicenseTrim,
          car_insurance_image_url: carInsuranceTrim,

          // optional car photos
          car_photos_urls: carPhotos,
        }),
      });

      const json = await res.json();
      if (res.ok) {
        setResult(json);
        // Optionally: show a nice message and go back
        // Alert.alert("Success", "Your request was sent for approval.");
        // onBack();
      } else {
        setError(JSON.stringify(json));
      }
    } catch (e: any) {
      setError("Network error: " + e.message);
    }
  };

  // ----- UI -----
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.subtitle}>Driver signup</Text>
      <Text style={styles.stepText}>Step {step} of 2</Text>

      {step === 1 ? (
        <ScrollView>
          {/* STEP 1: BASIC INFO (same as regular) */}
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
            keyboardType="email-address"
          />
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            placeholder="Phone"
            keyboardType="phone-pad"
          />
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="Password"
            secureTextEntry
          />

          <Button title="Continue" onPress={goToStep2} />
          <View style={{ height: 12 }} />
          <Button title="Back" onPress={onBack} />

          {error && <Text style={{ color: "red", marginTop: 8 }}>{error}</Text>}
        </ScrollView>
      ) : (
        <ScrollView>
          {/* STEP 2: CAR + DRIVER INFO + FILES */}
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
            keyboardType="numeric"
          />

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

          <View style={{ height: 12 }} />
          <Button title="Submit for approval" onPress={signupDriver} />
          <View style={{ height: 12 }} />
          <Button title="Back to previous step" onPress={() => setStep(1)} />

          {result && (
            <Text style={{ color: "green", marginTop: 8 }}>
              {JSON.stringify(result)}
            </Text>
          )}
          {error && <Text style={{ color: "red", marginTop: 8 }}>{error}</Text>}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  subtitle: { fontSize: 18, marginVertical: 8 },
  stepText: { fontSize: 14, marginBottom: 8, color: "#555" },
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

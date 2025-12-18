import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from "react-native";
import { launchImageLibrary } from "react-native-image-picker";
import MessageModal from "./MessageModal"; // 👈 pretty popup

const API_BASE_URL = "http://10.0.2.2:8000";

const MINT = "#9bd3d8";
const DARK_TEAL = "#0f5b63";

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
      showModal("error", "Sign up error", "Please fill all basic info before continuing.");
      return;
    }

    if (nameTrim.length < 3) {
      setError("Full name should be at least 3 characters.");
      showModal("error", "Sign up error", "Full name should be at least 3 characters.");
      return;
    }

    if (!isValidUsername(usernameTrim)) {
      const msg =
        "Username must be 3–20 characters and contain only letters, numbers, or underscore.";
      setError(msg);
      showModal("error", "Sign up error", msg);
      return;
    }

    if (!isValidEmail(emailTrim)) {
      const msg = "Please enter a valid email address.";
      setError(msg);
      showModal("error", "Sign up error", msg);
      return;
    }

    if (!isValidPhone(phoneTrim)) {
      const msg = "Phone must contain 9–15 digits (numbers only).";
      setError(msg);
      showModal("error", "Sign up error", msg);
      return;
    }

    if (!isStrongPassword(passwordTrim)) {
      const msg =
        "Password must be at least 8 characters and include both letters and numbers.";
      setError(msg);
      showModal("error", "Sign up error", msg);
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
      const msg = "Please fill all required fields.";
      setError(msg);
      showModal("error", "Sign up error", msg);
      return;
    }

    // 🔸 Re-check core rules in case user changed something after Step 1
    if (!isValidUsername(username.trim())) {
      const msg =
        "Username must be 3–20 characters and contain only letters, numbers, or underscore.";
      setError(msg);
      showModal("error", "Sign up error", msg);
      return;
    }

    if (!isValidEmail(email.trim())) {
      const msg = "Please enter a valid email address.";
      setError(msg);
      showModal("error", "Sign up error", msg);
      return;
    }

    if (!isValidPhone(phone.trim())) {
      const msg = "Phone must contain 9–15 digits (numbers only).";
      setError(msg);
      showModal("error", "Sign up error", msg);
      return;
    }

    if (!isStrongPassword(password.trim())) {
      const msg =
        "Password must be at least 8 characters and include both letters and numbers.";
      setError(msg);
      showModal("error", "Sign up error", msg);
      return;
    }

    // 🔸 Step 2 rules
    if (carTypeTrim.length < 2) {
      const msg = "Car type should be at least 2 characters.";
      setError(msg);
      showModal("error", "Sign up error", msg);
      return;
    }

    if (!isValidPlateNumber(plateTrim)) {
      const msg =
        "Plate number should be at least 5 characters and include a digit.";
      setError(msg);
      showModal("error", "Sign up error", msg);
      return;
    }

    if (!isValidProductionYear(prodYearTrim)) {
      const current = new Date().getFullYear();
      const msg = `Production year must be a valid number between 1990 and ${current + 1}.`;
      setError(msg);
      showModal("error", "Sign up error", msg);
      return;
    }

    if (!isValidIdNumber(idTrim)) {
      const msg =
        "ID number must contain only digits and be 7–15 digits long.";
      setError(msg);
      showModal("error", "Sign up error", msg);
      return;
    }

    if (!driverLicenseTrim) {
      const msg = "Driver license image is required.";
      setError(msg);
      showModal("error", "Sign up error", msg);
      return;
    }

    if (!carLicenseTrim) {
      const msg = "Car license image is required.";
      setError(msg);
      showModal("error", "Sign up error", msg);
      return;
    }

    if (!carInsuranceTrim) {
      const msg = "Car insurance image is required.";
      setError(msg);
      showModal("error", "Sign up error", msg);
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
      showModal(
        "success",
        "Application sent",
        "Your driver application has been sent for approval."
      );
    } catch (e: any) {
      const msg = "Network error: " + e.message;
      setError(msg);
      showModal("error", "Network error", msg);
    }
  };

  // ----- UI -----
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.subtitle}>Driver sign up</Text>
      <Text style={styles.stepText}>Step {step} of 2</Text>

      {step === 1 ? (
        <ScrollView>
          {/* STEP 1: BASIC INFO */}
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
            keyboardType="email-address"
            placeholderTextColor="#9ab8bd"
            autoCapitalize="none"
          />
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            placeholder="Phone"
            keyboardType="phone-pad"
            placeholderTextColor="#9ab8bd"
          />
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="Password"
            secureTextEntry
            placeholderTextColor="#9ab8bd"
          />

          <TouchableOpacity style={styles.primaryButton} onPress={goToStep2}>
            <Text style={styles.primaryButtonText}>Continue</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryButton} onPress={onBack}>
            <Text style={styles.secondaryButtonText}>Back</Text>
          </TouchableOpacity>

          {error && <Text style={styles.error}>{error}</Text>}
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
            placeholderTextColor="#9ab8bd"
          />
          <TextInput
            style={styles.input}
            value={plateNumber}
            onChangeText={setPlateNumber}
            placeholder="Plate number"
            placeholderTextColor="#9ab8bd"
          />
          <TextInput
            style={styles.input}
            value={productionYear}
            onChangeText={setProductionYear}
            placeholder="Production year"
            keyboardType="numeric"
            placeholderTextColor="#9ab8bd"
          />

          <Text style={styles.sectionTitle}>Driver documents</Text>
          <TextInput
            style={styles.input}
            value={idNumber}
            onChangeText={setIdNumber}
            placeholder="ID number (long number)"
            keyboardType="numeric"
            placeholderTextColor="#9ab8bd"
          />

          <TouchableOpacity
            style={styles.smallButton}
            onPress={uploadDriverLicense}
          >
            <Text style={styles.smallButtonText}>Upload driver license</Text>
          </TouchableOpacity>
          <TextInput
            style={styles.input}
            value={driverLicenseUrl}
            onChangeText={setDriverLicenseUrl}
            placeholder="Driver license image URL"
            placeholderTextColor="#9ab8bd"
          />

          <Text style={styles.sectionTitle}>Car documents</Text>

          <TouchableOpacity
            style={styles.smallButton}
            onPress={uploadCarLicense}
          >
            <Text style={styles.smallButtonText}>Upload car license</Text>
          </TouchableOpacity>
          <TextInput
            style={styles.input}
            value={carLicenseUrl}
            onChangeText={setCarLicenseUrl}
            placeholder="Car license image URL"
            placeholderTextColor="#9ab8bd"
          />

          <TouchableOpacity
            style={styles.smallButton}
            onPress={uploadCarInsurance}
          >
            <Text style={styles.smallButtonText}>Upload car insurance</Text>
          </TouchableOpacity>
          <TextInput
            style={styles.input}
            value={carInsuranceUrl}
            onChangeText={setCarInsuranceUrl}
            placeholder="Car insurance image URL"
            placeholderTextColor="#9ab8bd"
          />

          <Text style={styles.sectionTitle}>Car photos (optional)</Text>

          <TouchableOpacity
            style={styles.smallButton}
            onPress={uploadCarPhoto1}
          >
            <Text style={styles.smallButtonText}>Upload car photo 1</Text>
          </TouchableOpacity>
          <TextInput
            style={styles.input}
            value={carPhoto1Url}
            onChangeText={setCarPhoto1Url}
            placeholder="Car photo 1 URL"
            placeholderTextColor="#9ab8bd"
          />

          <TouchableOpacity
            style={styles.smallButton}
            onPress={uploadCarPhoto2}
          >
            <Text style={styles.smallButtonText}>Upload car photo 2</Text>
          </TouchableOpacity>
          <TextInput
            style={styles.input}
            value={carPhoto2Url}
            onChangeText={setCarPhoto2Url}
            placeholder="Car photo 2 URL"
            placeholderTextColor="#9ab8bd"
          />

          <TouchableOpacity
            style={[styles.primaryButton, { marginTop: 16 }]}
            onPress={signupDriver}
          >
            <Text style={styles.primaryButtonText}>Submit for approval</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => setStep(1)}
          >
            <Text style={styles.secondaryButtonText}>
              Back to previous step
            </Text>
          </TouchableOpacity>

          {result && (
            <Text style={styles.success}>{JSON.stringify(result)}</Text>
          )}
          {error && <Text style={styles.error}>{error}</Text>}
        </ScrollView>
      )}

      {/* pretty popup for errors / success */}
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
  subtitle: {
    fontSize: 16,
    fontWeight: "600",
    color: DARK_TEAL,
    textAlign: "center",
    marginTop: 8,
    marginBottom: 4,
  },
  stepText: {
    fontSize: 13,
    color: "#7a98a0",
    textAlign: "center",
    marginBottom: 12,
  },
  sectionTitle: {
    marginTop: 12,
    marginBottom: 6,
    fontWeight: "600",
    color: DARK_TEAL,
    fontSize: 14,
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
  smallButton: {
    alignSelf: "flex-start",
    backgroundColor: MINT,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    marginBottom: 6,
  },
  smallButtonText: {
    color: DARK_TEAL,
    fontSize: 12,
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
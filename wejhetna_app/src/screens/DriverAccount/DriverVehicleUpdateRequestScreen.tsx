import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
} from "react-native";
import { useTranslation } from "react-i18next";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Ionicons from "react-native-vector-icons/Ionicons";
import MessageModal from "../MessageModal";
import { RootStackParamList } from "../../navigation/types";
import DriverDocumentUploadField from "../../components/driver/DriverDocumentUploadField";
import {
  createVehicleUpdateRequest,
  VehicleUpdateRequestType,
} from "../../api/driverVehicleRequests";
import { getDriverProfile, DriverProfileInfo } from "../../api/profileApi";

const DARK_TEAL = "#0f5b63";
const MINT = "#9bd3d8";

const EMPTY_VEHICLE_FORM = {
  carType: "",
  plateNumber: "",
  productionYear: "",
  idNumber: "",
  driverLicenseUrl: "",
  carLicenseUrl: "",
  carInsuranceUrl: "",
  carPhoto1Url: "",
  carPhoto2Url: "",
};

export default function DriverVehicleUpdateRequestScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [requestType, setRequestType] = useState<VehicleUpdateRequestType>("UPDATE_EXISTING");
  const [messageToAdmin, setMessageToAdmin] = useState("");
  const [carType, setCarType] = useState("");
  const [plateNumber, setPlateNumber] = useState("");
  const [productionYear, setProductionYear] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [driverLicenseUrl, setDriverLicenseUrl] = useState("");
  const [carLicenseUrl, setCarLicenseUrl] = useState("");
  const [carInsuranceUrl, setCarInsuranceUrl] = useState("");
  const [carPhoto1Url, setCarPhoto1Url] = useState("");
  const [carPhoto2Url, setCarPhoto2Url] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [prefilling, setPrefilling] = useState(false);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [idNumberError, setIdNumberError] = useState<string | null>(null);

  const [modalVisible, setModalVisible] = useState(false);
  const [modalType, setModalType] = useState<"error" | "success">("error");
  const [modalTitle, setModalTitle] = useState("");
  const [modalMessage, setModalMessage] = useState("");

  const showModal = (type: "error" | "success", title: string, message: string) => {
    setModalType(type);
    setModalTitle(title);
    setModalMessage(message);
    setModalVisible(true);
  };

  const isValidIdNumber = (v: string) => /^[0-9]{9}$/.test(v.trim());
  const idNumberIsValid = idNumber.length === 9 && isValidIdNumber(idNumber);

  const clearVehicleForm = () => {
    setCarType(EMPTY_VEHICLE_FORM.carType);
    setPlateNumber(EMPTY_VEHICLE_FORM.plateNumber);
    setProductionYear(EMPTY_VEHICLE_FORM.productionYear);
    setIdNumber(EMPTY_VEHICLE_FORM.idNumber);
    setDriverLicenseUrl(EMPTY_VEHICLE_FORM.driverLicenseUrl);
    setCarLicenseUrl(EMPTY_VEHICLE_FORM.carLicenseUrl);
    setCarInsuranceUrl(EMPTY_VEHICLE_FORM.carInsuranceUrl);
    setCarPhoto1Url(EMPTY_VEHICLE_FORM.carPhoto1Url);
    setCarPhoto2Url(EMPTY_VEHICLE_FORM.carPhoto2Url);
    setIdNumberError(null);
  };

  const applyProfileToForm = (profile: DriverProfileInfo) => {
    setIdNumber(profile.id_card_image_url || "");
    setDriverLicenseUrl(profile.driver_license_image_url || "");
    if (profile.vehicle) {
      setCarType(profile.vehicle.car_type || "");
      setPlateNumber(profile.vehicle.plate_number || "");
      setProductionYear(
        profile.vehicle.production_year != null
          ? String(profile.vehicle.production_year)
          : ""
      );
      setCarLicenseUrl(profile.vehicle.car_license_image_url || "");
      setCarInsuranceUrl(profile.vehicle.car_insurance_image_url || "");
      const photos = profile.vehicle.car_photos_urls || [];
      setCarPhoto1Url(photos[0] || "");
      setCarPhoto2Url(photos[1] || "");
    } else {
      setCarType("");
      setPlateNumber("");
      setProductionYear("");
      setCarLicenseUrl("");
      setCarInsuranceUrl("");
      setCarPhoto1Url("");
      setCarPhoto2Url("");
    }
    const id = profile.id_card_image_url || "";
    if (id.length > 0) {
      setIdNumberError(
        isValidIdNumber(id)
          ? null
          : t("id_number_must_be_9_digits") || "מספר ת.ז. חייב להיות בדיוק 9 ספרות"
      );
    } else {
      setIdNumberError(null);
    }
  };

  const handleIdNumberChange = (text: string) => {
    const numbersOnly = text.replace(/[^0-9]/g, "").slice(0, 9);
    setIdNumber(numbersOnly);
    if (numbersOnly.length === 0) {
      setIdNumberError(null);
      return;
    }
    setIdNumberError(
      isValidIdNumber(numbersOnly)
        ? null
        : t("id_number_must_be_9_digits") || "מספר ת.ז. חייב להיות בדיוק 9 ספרות"
    );
  };

  const loadFormForRequestType = async (type: VehicleUpdateRequestType) => {
    if (type === "ADD_NEW") {
      clearVehicleForm();
      return;
    }
    const stored = await AsyncStorage.getItem("userId");
    const userId = stored ? parseInt(stored, 10) : NaN;
    if (!Number.isFinite(userId)) return;
    setPrefilling(true);
    try {
      const profile = await getDriverProfile(userId);
      applyProfileToForm(profile);
    } catch {
      // keep form as-is on failure
    } finally {
      setPrefilling(false);
    }
  };

  const onSelectRequestType = (type: VehicleUpdateRequestType) => {
    if (type === requestType) return;
    setRequestType(type);
    loadFormForRequestType(type);
  };
  const isValidProductionYear = (v: string) => {
    const year = Number(v);
    const current = new Date().getFullYear();
    return Number.isInteger(year) && year >= 1990 && year <= current + 1;
  };
  const isValidPlateNumber = (v: string) => v.trim().length >= 5 && /\d/.test(v.trim());

  const onUploadError = (message: string) => {
    showModal("error", t("error") || "Error", message);
  };

  React.useEffect(() => {
    loadFormForRequestType("UPDATE_EXISTING");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial load only
  }, []);

  const handleSubmit = async () => {
    const carTypeTrim = carType.trim();
    const plateTrim = plateNumber.trim();
    const prodYearTrim = productionYear.trim();
    const idTrim = idNumber.trim();

    if (
      !carTypeTrim ||
      !plateTrim ||
      !prodYearTrim ||
      !idTrim ||
      !driverLicenseUrl.trim() ||
      !carLicenseUrl.trim() ||
      !carInsuranceUrl.trim()
    ) {
      showModal("error", t("error") || "Error", t("fill_all_required_fields") || "Please fill all required fields.");
      return;
    }
    if (!isValidIdNumber(idTrim)) {
      setIdNumberError(
        t("id_number_must_be_9_digits") || "מספר ת.ז. חייב להיות בדיוק 9 ספרות"
      );
    }
    if (
      !isValidIdNumber(idTrim) ||
      !isValidPlateNumber(plateTrim) ||
      !isValidProductionYear(prodYearTrim)
    ) {
      showModal("error", t("error") || "Error", t("please_fix_errors") || "Please fix the errors above.");
      return;
    }

    const stored = await AsyncStorage.getItem("userId");
    const userId = stored ? parseInt(stored, 10) : NaN;
    if (!Number.isFinite(userId)) {
      showModal("error", t("error") || "Error", t("unknown_error") || "User not found");
      return;
    }

    const carPhotos: string[] = [];
    if (carPhoto1Url.trim()) carPhotos.push(carPhoto1Url.trim());
    if (carPhoto2Url.trim()) carPhotos.push(carPhoto2Url.trim());

    setSubmitting(true);
    try {
      await createVehicleUpdateRequest({
        driver_user_id: userId,
        request_type: requestType,
        car_type: carTypeTrim,
        plate_number: plateTrim,
        production_year: Number(prodYearTrim),
        driver_license_image_url: driverLicenseUrl.trim(),
        id_card_image_url: idTrim,
        car_license_image_url: carLicenseUrl.trim(),
        car_insurance_image_url: carInsuranceUrl.trim(),
        car_photos_urls: carPhotos.length ? carPhotos : undefined,
        message_to_admin: messageToAdmin.trim() || undefined,
      });
      showModal(
        "success",
        t("success") || "Success",
        t("vehicle_request_sent") || "Your request was sent to the admin."
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t("unknown_error");
      showModal("error", t("error") || "Error", msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-forward" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t("vehicle_update_request") || "בקשת עדכון רכב"}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.sectionTitle}>{t("request_type") || "סוג בקשה"}</Text>
        <View style={styles.typeRow}>
          <TouchableOpacity
            style={[styles.typeChip, requestType === "UPDATE_EXISTING" && styles.typeChipActive]}
            onPress={() => onSelectRequestType("UPDATE_EXISTING")}
            disabled={prefilling}
          >
            <Text style={[styles.typeChipText, requestType === "UPDATE_EXISTING" && styles.typeChipTextActive]}>
              {t("update_existing_vehicle") || "עדכון רכב קיים"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.typeChip, requestType === "ADD_NEW" && styles.typeChipActive]}
            onPress={() => onSelectRequestType("ADD_NEW")}
            disabled={prefilling}
          >
            <Text style={[styles.typeChipText, requestType === "ADD_NEW" && styles.typeChipTextActive]}>
              {t("add_new_vehicle") || "הוספת רכב חדש"}
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>{t("message_to_admin") || "הודעה לאדמין"}</Text>
        <TextInput
          style={[styles.input, styles.messageInput]}
          value={messageToAdmin}
          onChangeText={setMessageToAdmin}
          placeholder={t("message_to_admin_placeholder") || "הסבר קצר לאדמין..."}
          placeholderTextColor="#9ab8bd"
          multiline
          textAlignVertical="top"
        />

        {prefilling ? (
          <ActivityIndicator color={DARK_TEAL} style={{ marginVertical: 12 }} />
        ) : null}

        <Text style={styles.sectionTitle}>{t("car_info") || "פרטי רכב"}</Text>
        <TextInput style={styles.input} value={carType} onChangeText={setCarType} placeholder={t("car_type") || "סוג רכב"} placeholderTextColor="#9ab8bd" editable={!prefilling} />
        <TextInput style={styles.input} value={plateNumber} onChangeText={setPlateNumber} placeholder={t("plate_number") || "מספר רכב"} placeholderTextColor="#9ab8bd" editable={!prefilling} />
        <TextInput style={styles.input} value={productionYear} onChangeText={(text) => setProductionYear(text.replace(/[^0-9]/g, ""))} placeholder={t("production_year") || "שנת יצור"} keyboardType="numeric" placeholderTextColor="#9ab8bd" editable={!prefilling} />

        <Text style={styles.sectionTitle}>{t("driver_documents") || "מסמכי נהג"}</Text>
        <TextInput
          style={[
            styles.input,
            idNumberError ? styles.inputError : null,
            idNumberIsValid ? styles.inputValid : null,
          ]}
          value={idNumber}
          onChangeText={handleIdNumberChange}
          placeholder={t("id_number_long") || "ת.ז. (9 ספרות)"}
          keyboardType="numeric"
          maxLength={9}
          placeholderTextColor="#9ab8bd"
          editable={!prefilling}
        />
        {idNumberError ? (
          <Text style={styles.fieldError}>{idNumberError}</Text>
        ) : idNumberIsValid ? (
          <Text style={styles.fieldOk}>
            {t("id_number_valid") || "מספר ת.ז. תקין"}
          </Text>
        ) : null}
        <DriverDocumentUploadField
          label={t("driver_license") || "רישיון נהיגה"}
          url={driverLicenseUrl}
          uploading={uploadingKey === "license"}
          disabled={prefilling || (!!uploadingKey && uploadingKey !== "license")}
          mode="document_or_photo"
          onUrlChange={setDriverLicenseUrl}
          onUploadingChange={(u) => setUploadingKey(u ? "license" : null)}
          onError={onUploadError}
        />

        <Text style={styles.sectionTitle}>{t("car_documents") || "מסמכי רכב"}</Text>
        <DriverDocumentUploadField
          label={t("car_license") || "רישיון רכב"}
          url={carLicenseUrl}
          uploading={uploadingKey === "carLic"}
          disabled={prefilling || (!!uploadingKey && uploadingKey !== "carLic")}
          mode="document_or_photo"
          onUrlChange={setCarLicenseUrl}
          onUploadingChange={(u) => setUploadingKey(u ? "carLic" : null)}
          onError={onUploadError}
        />
        <DriverDocumentUploadField
          label={t("car_insurance") || "ביטוח"}
          url={carInsuranceUrl}
          uploading={uploadingKey === "ins"}
          disabled={prefilling || (!!uploadingKey && uploadingKey !== "ins")}
          mode="document_or_photo"
          onUrlChange={setCarInsuranceUrl}
          onUploadingChange={(u) => setUploadingKey(u ? "ins" : null)}
          onError={onUploadError}
        />

        <Text style={styles.sectionTitle}>{t("car_photos_optional") || "תמונות רכב (אופציונלי)"}</Text>
        <DriverDocumentUploadField
          label={`${t("car_photo") || "תמונה"} 1`}
          url={carPhoto1Url}
          uploading={uploadingKey === "p1"}
          disabled={prefilling || (!!uploadingKey && uploadingKey !== "p1")}
          mode="photo_only"
          onUrlChange={setCarPhoto1Url}
          onUploadingChange={(u) => setUploadingKey(u ? "p1" : null)}
          onError={onUploadError}
        />
        <DriverDocumentUploadField
          label={`${t("car_photo") || "תמונה"} 2`}
          url={carPhoto2Url}
          uploading={uploadingKey === "p2"}
          disabled={prefilling || (!!uploadingKey && uploadingKey !== "p2")}
          mode="photo_only"
          onUrlChange={setCarPhoto2Url}
          onUploadingChange={(u) => setUploadingKey(u ? "p2" : null)}
          onError={onUploadError}
        />

        <TouchableOpacity style={[styles.primaryButton, submitting && styles.disabled]} onPress={handleSubmit} disabled={submitting}>
          {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>{t("send_to_admin") || "שליחה לאדמין"}</Text>}
        </TouchableOpacity>
      </ScrollView>

      <MessageModal
        visible={modalVisible}
        type={modalType}
        title={modalTitle}
        message={modalMessage}
        onClose={() => {
          setModalVisible(false);
          if (modalType === "success") navigation.goBack();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  header: { flexDirection: "row", alignItems: "center", padding: 16, borderBottomWidth: 1, borderBottomColor: "#eee" },
  backBtn: { padding: 4 },
  headerTitle: { flex: 1, textAlign: "center", fontSize: 18, fontWeight: "700", color: DARK_TEAL },
  headerSpacer: { width: 32 },
  scroll: { padding: 16, paddingBottom: 40 },
  sectionTitle: { marginTop: 12, marginBottom: 8, fontWeight: "700", color: DARK_TEAL, fontSize: 15 },
  typeRow: { flexDirection: "row", gap: 8, marginBottom: 8 },
  typeChip: { flex: 1, paddingVertical: 12, paddingHorizontal: 8, borderRadius: 12, borderWidth: 1, borderColor: MINT, alignItems: "center" },
  typeChipActive: { backgroundColor: DARK_TEAL, borderColor: DARK_TEAL },
  typeChipText: { fontSize: 12, fontWeight: "600", color: DARK_TEAL, textAlign: "center" },
  typeChipTextActive: { color: "#fff" },
  input: { backgroundColor: "#f5fdff", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: "#d6ebee", marginBottom: 10, fontSize: 14, color: "#234348" },
  messageInput: { minHeight: 90 },
  uploadLabel: { fontSize: 13, color: DARK_TEAL, marginBottom: 6, fontWeight: "600" },
  uploadButton: { borderWidth: 1, borderColor: MINT, borderRadius: 12, padding: 12, marginBottom: 12, alignItems: "center", minHeight: 56, justifyContent: "center" },
  uploadButtonText: { color: DARK_TEAL, fontWeight: "600" },
  imagePreviewContainer: { alignItems: "center" },
  imagePreview: { width: 120, height: 80, borderRadius: 8, marginBottom: 4 },
  imagePreviewText: { fontSize: 12, color: "#4CAF50" },
  primaryButton: { marginTop: 16, backgroundColor: DARK_TEAL, borderRadius: 24, paddingVertical: 16, alignItems: "center" },
  primaryButtonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  disabled: { opacity: 0.6 },
  inputError: {
    borderColor: "#d7263d",
    borderWidth: 1.5,
  },
  inputValid: {
    borderColor: "#4CAF50",
    borderWidth: 1.5,
  },
  fieldError: {
    color: "#d7263d",
    fontSize: 12,
    marginTop: -6,
    marginBottom: 8,
    textAlign: "right",
  },
  fieldOk: {
    color: "#4CAF50",
    fontSize: 12,
    marginTop: -6,
    marginBottom: 8,
    textAlign: "right",
    fontWeight: "600",
  },
});

// src/screens/businessOwner/BusinessOwnerDetailsFormScreen.tsx

import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
  ScrollView,
  Image,
} from "react-native";
import { launchImageLibrary } from "react-native-image-picker";
import { useRoute, useNavigation, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Picker } from "@react-native-picker/picker";
import { RootStackParamList } from "../../navigation/types";
import {
  fetchCities,
  fetchCategories,
  City,
  Category,
} from "../../api/places";
import {
  createBusinessOwnerPlaceRequest,
  BusinessOwnerPlaceRequestPayload,
} from "../../api/businessOwnerApi";

const API_BASE_URL = "http://10.0.2.2:8000";

type BusinessOwnerDetailsFormRoute = RouteProp<
  RootStackParamList,
  "BusinessOwnerDetailsForm"
>;

export default function BusinessOwnerDetailsFormScreen() {
  const route = useRoute<BusinessOwnerDetailsFormRoute>();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const params = route.params;
  const userId = params?.userId ?? 0;
  const lat = params?.lat ?? 0;
  const lon = params?.lon ?? 0;
  const source = params?.source ?? "MAP_PICK";
  const osmId = params?.osmId ?? null;
  const existingPlaceId = params?.existingPlaceId ?? null;

  const [name, setName] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [nameHe, setNameHe] = useState("");

  const [cityId, setCityId] = useState<number | undefined>(undefined);
  const [categoryId, setCategoryId] = useState<number | undefined>(undefined);

  const [description, setDescription] = useState("");
  const [phone, setPhone] = useState("");
  const [openingHours, setOpeningHours] = useState("");
  const [socialMediaAccountName, setSocialMediaAccountName] = useState("");

  // Image uploads (UI only - not sent to backend)
  const [businessLicenseUrl, setBusinessLicenseUrl] = useState<string>("");
  const [businessImagesUrls, setBusinessImagesUrls] = useState<string[]>([]);
  const [uploadingLicense, setUploadingLicense] = useState(false);
  const [uploadingImages, setUploadingImages] = useState(false);

  const [cities, setCities] = useState<City[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [phoneTouched, setPhoneTouched] = useState(false);
  const [phoneBlurred, setPhoneBlurred] = useState(false);

  useEffect(() => {
    let isActive = true;

    async function loadData() {
      try {
        setLoading(true);

        const [citiesRes, categoriesRes] = await Promise.all([
          fetchCities(),
          fetchCategories(),
        ]);

        if (!isActive) return;

        setCities(citiesRes);
        setCategories(categoriesRes);

        if (citiesRes.length > 0) {
          setCityId((prev) => prev ?? citiesRes[0].id);
        }
      } catch (err) {
        console.error(err);
        Alert.alert("Error", "Failed to load cities/categories from server");
      } finally {
        if (isActive) setLoading(false);
      }
    }

    loadData();
    return () => {
      isActive = false;
    };
  }, []);

  function handlePhoneChange(value: string) {
    const digitsOnly = value.replace(/[^0-9]/g, "");
    setPhone(digitsOnly);
    if (!phoneTouched) setPhoneTouched(true);
  }

  function handlePhoneBlur() {
    setPhoneBlurred(true);
  }

  // Image upload helper (UI only - not sent to backend)
  const pickAndUpload = async (
    setUrl: (url: string) => void,
    setUploading: (loading: boolean) => void
  ) => {
    launchImageLibrary({ mediaType: "photo" }, async (res) => {
      if (res.didCancel || res.errorCode) {
        console.log("User cancelled or error:", res.errorMessage);
        return;
      }

      const asset = res.assets?.[0];
      if (!asset || !asset.uri) return;

      setUploading(true);
      try {
        const formData = new FormData();
        formData.append("file", {
          uri: asset.uri,
          name: asset.fileName || "upload.jpg",
          type: asset.type || "image/jpeg",
        } as any);

        const uploadRes = await fetch(`${API_BASE_URL}/files/upload`, {
          method: "POST",
          headers: { "Content-Type": "multipart/form-data" },
          body: formData,
        });
        const json = await uploadRes.json();
        if (json.file_url) {
          setUrl(json.file_url);
        } else {
          Alert.alert("Error", "Failed to upload image");
        }
      } catch (e: any) {
        console.log("Upload error", e?.message || e);
        Alert.alert("Error", "Failed to upload image: " + (e?.message || "Unknown error"));
      } finally {
        setUploading(false);
      }
    });
  };

  const handleUploadBusinessLicense = () => {
    pickAndUpload(setBusinessLicenseUrl, setUploadingLicense);
  };

  const handleUploadBusinessImage = () => {
    launchImageLibrary({ mediaType: "photo" }, async (res) => {
      if (res.didCancel || res.errorCode) {
        return;
      }

      const asset = res.assets?.[0];
      if (!asset || !asset.uri) return;

      setUploadingImages(true);
      try {
        const formData = new FormData();
        formData.append("file", {
          uri: asset.uri,
          name: asset.fileName || "upload.jpg",
          type: asset.type || "image/jpeg",
        } as any);

        const uploadRes = await fetch(`${API_BASE_URL}/files/upload`, {
          method: "POST",
          headers: { "Content-Type": "multipart/form-data" },
          body: formData,
        });
        const json = await uploadRes.json();
        if (json.file_url) {
          setBusinessImagesUrls([...businessImagesUrls, json.file_url]);
        } else {
          Alert.alert("Error", "Failed to upload image");
        }
      } catch (e: any) {
        console.log("Upload error", e?.message || e);
        Alert.alert("Error", "Failed to upload image: " + (e?.message || "Unknown error"));
      } finally {
        setUploadingImages(false);
      }
    });
  };

  const handleRemoveBusinessImage = (index: number) => {
    setBusinessImagesUrls(businessImagesUrls.filter((_, i) => i !== index));
  };

  const hasPhone = phone.length > 0;
  const isPhoneLengthRuleOk = phone.length === 9 || phone.length === 10;
  const isPhoneValid = !hasPhone || isPhoneLengthRuleOk;

  const shouldShowPhoneRequirements =
    phoneTouched && (!phoneBlurred || !isPhoneValid);

  const isNameValid = name.trim().length > 0;
  const isNameArValid = nameAr.trim().length > 0;
  const isNameHeValid = nameHe.trim().length > 0;
  const isCityValid = !!cityId;
  const isCategoryValid = !!categoryId;

  const isFormValid =
    isNameValid &&
    isNameArValid &&
    isNameHeValid &&
    isCityValid &&
    isCategoryValid &&
    isPhoneValid;

  const canSubmit = isFormValid && !submitting;

  async function handleSubmit() {
    if (!isNameValid) {
      Alert.alert("Error", "Business name (English) is required");
      return;
    }
    if (!isNameArValid) {
      Alert.alert("Error", "Business name (Arabic) is required");
      return;
    }
    if (!isNameHeValid) {
      Alert.alert("Error", "Business name (Hebrew) is required");
      return;
    }

    if (!isCityValid) {
      Alert.alert("Error", "Please select a city");
      return;
    }

    if (!isCategoryValid) {
      Alert.alert("Error", "Please select a category");
      return;
    }

    if (!isPhoneValid) {
      Alert.alert(
        "Error",
        "Phone number (if provided) must be 9 or 10 digits"
      );
      return;
    }

    if (!lat || !lon) {
      Alert.alert("Error", "Location is required");
      return;
    }

    try {
      setSubmitting(true);

      // Prepare payload - ensure all fields are properly formatted
      const payload: BusinessOwnerPlaceRequestPayload = {
        user_id: userId,
        existing_place_id: existingPlaceId ?? null,
        lat,
        lon,
        source,
        osm_id: osmId ?? null,
        name: name.trim(),
        name_ar: nameAr.trim(),
        name_he: nameHe.trim(),
        city_id: cityId!,
        category_id: categoryId!,
        description: description.trim() || null,
        phone: hasPhone ? phone : null,
        opening_hours: openingHours.trim() || null,
        main_image_url: null,
        social_links: null,
      };

      // Log payload for debugging
      console.log("Submitting payload:", JSON.stringify(payload, null, 2));

      await createBusinessOwnerPlaceRequest(payload);

      Alert.alert(
        "Request Submitted",
        "Your business place request has been submitted successfully. An admin will review it and you will be notified once it's approved.",
        [
          {
            text: "OK",
            onPress: () => {
              // Navigate back to home/login
              navigation.reset({
                index: 0,
                routes: [{ name: "Home" }],
              });
            },
          },
        ]
      );
    } catch (err: any) {
      // Log full error details for debugging
      console.log("=== ERROR DETAILS ===");
      console.log("Error object:", err);
      console.log("Error type:", typeof err);
      console.log("Has response:", !!err?.response);
      console.log("Response status:", err?.response?.status);
      console.log("Response data:", err?.response?.data);
      console.log("Error message:", err?.message);
      console.log("Error stack:", err?.stack);
      console.log("===================");
      
      // Extract error message properly
      let errorMessage = "Could not submit place request";
      
      try {
        if (err?.response) {
          const status = err.response.status;
          const errorData = err.response.data;
          
          console.log("Status code:", status);
          console.log("Error data:", errorData);
          
          // Handle different error response formats
          if (typeof errorData?.detail === "string") {
            errorMessage = errorData.detail;
          } else if (Array.isArray(errorData?.detail)) {
            // FastAPI validation errors
            const msgs = errorData.detail
              .map((d: any) => {
                const loc = d.loc ? d.loc.join(".") : "";
                const msg = d.msg || "";
                return loc ? `${loc}: ${msg}` : msg;
              })
              .filter(Boolean);
            if (msgs.length > 0) {
              errorMessage = msgs.join("\n");
            }
          } else if (errorData?.detail && typeof errorData.detail === "object") {
            if (errorData.detail.message) {
              errorMessage = errorData.detail.message;
            } else if (errorData.detail.msg) {
              errorMessage = errorData.detail.msg;
            } else {
              errorMessage = "Validation error: " + JSON.stringify(errorData.detail);
            }
          } else if (typeof errorData?.message === "string") {
            errorMessage = errorData.message;
          } else if (typeof errorData?.error === "string") {
            errorMessage = errorData.error;
          } else if (errorData) {
            errorMessage = "Server error: " + JSON.stringify(errorData);
          }
          
          // Add status code info
          if (status === 404) {
            errorMessage = "Not found: " + errorMessage;
          } else if (status === 400) {
            errorMessage = "Invalid request: " + errorMessage;
          } else if (status === 500) {
            errorMessage = "Server error: " + errorMessage;
          }
        } else if (err?.request) {
          errorMessage = "Network error: Could not reach server. Please check your connection.";
        } else if (err?.message && typeof err.message === "string") {
          errorMessage = err.message;
        }
      } catch (parseError) {
        console.log("Error parsing error message:", parseError);
        errorMessage = "Failed to submit request. Please check your connection and try again.";
      }
      
      console.log("Final error message:", errorMessage);
      Alert.alert("Error", errorMessage);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text>Loading cities and categories...</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <View style={styles.container}>
        <Text style={styles.title}>Business Details</Text>
        {existingPlaceId && (
          <Text style={styles.infoText}>
            You are claiming an existing place on the map.
          </Text>
        )}

        <Text style={styles.label}>Business Name (English) *</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={(text) => setName(text.replace(/[^A-Za-z0-9 _-]/g, ""))}
          placeholder="Example: Coffee Shop"
        />

        <Text style={styles.label}>Business Name (Arabic) *</Text>
        <TextInput
          style={styles.input}
          value={nameAr}
          onChangeText={setNameAr}
          placeholder="مثال: مقهى"
          textAlign="right"
        />

        <Text style={styles.label}>Business Name (Hebrew) *</Text>
        <TextInput
          style={styles.input}
          value={nameHe}
          onChangeText={setNameHe}
          placeholder="דוגמה: בית קפה"
          textAlign="right"
        />

        <Text style={styles.label}>City *</Text>
        <View style={styles.pickerContainer}>
          <Picker
            selectedValue={cityId}
            onValueChange={(value) => setCityId(value)}
            style={styles.picker}
          >
            <Picker.Item label="Select a city..." value={undefined} />
            {cities.map((city) => (
              <Picker.Item
                key={city.id}
                label={city.name_ar || city.name_en || `City ${city.id}`}
                value={city.id}
              />
            ))}
          </Picker>
        </View>

        <Text style={styles.label}>Category *</Text>
        <View style={styles.pickerContainer}>
          <Picker
            selectedValue={categoryId}
            onValueChange={(value) => setCategoryId(value)}
            style={styles.picker}
          >
            <Picker.Item label="Select a category..." value={undefined} />
            {categories.map((cat) => (
              <Picker.Item
                key={cat.id}
                label={cat.name_ar || cat.name_en || `Category ${cat.id}`}
                value={cat.id}
              />
            ))}
          </Picker>
        </View>

        <Text style={styles.label}>Phone (Optional)</Text>
        <TextInput
          style={[
            styles.input,
            shouldShowPhoneRequirements && !isPhoneValid && styles.inputError,
          ]}
          value={phone}
          onChangeText={handlePhoneChange}
          onBlur={handlePhoneBlur}
          placeholder="0501234567"
          keyboardType="phone-pad"
        />
        {shouldShowPhoneRequirements && !isPhoneValid && (
          <Text style={styles.errorText}>
            Phone must be 9 or 10 digits (if provided)
          </Text>
        )}

        <Text style={styles.label}>Description (Optional)</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={description}
          onChangeText={setDescription}
          placeholder="Describe your business..."
          multiline
          numberOfLines={4}
        />

        <Text style={styles.label}>Opening Hours (Optional)</Text>
        <TextInput
          style={styles.input}
          value={openingHours}
          onChangeText={setOpeningHours}
          placeholder="Example: Sun-Thu: 9:00-18:00"
        />

        <Text style={styles.label}>Business License (Optional - UI Only)</Text>
        <Text style={styles.subLabel}>Upload a photo of your business license (not saved yet)</Text>
        <TouchableOpacity
          style={styles.uploadButton}
          onPress={handleUploadBusinessLicense}
          disabled={uploadingLicense}
        >
          {uploadingLicense ? (
            <ActivityIndicator color="#1e90ff" />
          ) : businessLicenseUrl ? (
            <View style={styles.imagePreviewContainer}>
              <Image source={{ uri: businessLicenseUrl }} style={styles.imagePreview} />
              <Text style={styles.imagePreviewText}>License uploaded ✓</Text>
            </View>
          ) : (
            <Text style={styles.uploadButtonText}>📄 Upload Business License</Text>
          )}
        </TouchableOpacity>

        <Text style={styles.label}>Business Pictures (Optional - UI Only)</Text>
        <Text style={styles.subLabel}>Upload photos of your business (not saved yet)</Text>
        <TouchableOpacity
          style={styles.uploadButton}
          onPress={handleUploadBusinessImage}
          disabled={uploadingImages}
        >
          {uploadingImages ? (
            <ActivityIndicator color="#1e90ff" />
          ) : (
            <Text style={styles.uploadButtonText}>📷 Add Business Photo</Text>
          )}
        </TouchableOpacity>

        {businessImagesUrls.length > 0 && (
          <View style={styles.imagesList}>
            {businessImagesUrls.map((url, index) => (
              <View key={index} style={styles.imageItem}>
                <Image source={{ uri: url }} style={styles.businessImage} />
                <TouchableOpacity
                  style={styles.removeImageButton}
                  onPress={() => handleRemoveBusinessImage(index)}
                >
                  <Text style={styles.removeImageText}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        <Text style={styles.label}>Social Media Account Name (Optional - UI Only)</Text>
        <Text style={styles.subLabel}>Your social media account name (not saved yet)</Text>
        <TextInput
          style={styles.input}
          value={socialMediaAccountName}
          onChangeText={setSocialMediaAccountName}
          placeholder="Example: @mybusiness or mybusiness_page"
          autoCapitalize="none"
        />

        <TouchableOpacity
          style={[styles.submitButton, !canSubmit && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={!canSubmit}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitButtonText}>Submit Request</Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    padding: 16,
  },
  container: {
    flex: 1,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontSize: 22,
    fontWeight: "600",
    marginBottom: 8,
    textAlign: "center",
  },
  infoText: {
    fontSize: 14,
    color: "#666",
    marginBottom: 16,
    textAlign: "center",
    fontStyle: "italic",
  },
  label: {
    fontSize: 14,
    fontWeight: "500",
    marginTop: 12,
    marginBottom: 4,
  },
  subLabel: {
    fontSize: 12,
    color: "#666",
    marginBottom: 8,
    fontStyle: "italic",
  },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  inputError: {
    borderColor: "#ff0000",
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    marginBottom: 4,
  },
  picker: {
    height: 50,
  },
  errorText: {
    color: "#ff0000",
    fontSize: 12,
    marginTop: 4,
  },
  submitButton: {
    backgroundColor: "#1e90ff",
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 24,
    marginBottom: 16,
  },
  submitButtonDisabled: {
    backgroundColor: "#ccc",
    opacity: 0.6,
  },
  submitButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 16,
  },
  uploadButton: {
    borderWidth: 2,
    borderColor: "#1e90ff",
    borderStyle: "dashed",
    borderRadius: 8,
    padding: 16,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
    backgroundColor: "#F0F8FF",
  },
  uploadButtonText: {
    color: "#1e90ff",
    fontWeight: "600",
    fontSize: 14,
  },
  imagePreviewContainer: {
    alignItems: "center",
    width: "100%",
  },
  imagePreview: {
    width: 200,
    height: 150,
    borderRadius: 8,
    marginBottom: 8,
    resizeMode: "cover",
  },
  imagePreviewText: {
    color: "#4CAF50",
    fontWeight: "600",
    fontSize: 12,
  },
  imagesList: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 12,
  },
  imageItem: {
    position: "relative",
    marginRight: 8,
    marginBottom: 8,
  },
  businessImage: {
    width: 100,
    height: 100,
    borderRadius: 8,
    resizeMode: "cover",
  },
  removeImageButton: {
    position: "absolute",
    top: -8,
    right: -8,
    backgroundColor: "#F44336",
    borderRadius: 12,
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  removeImageText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
});

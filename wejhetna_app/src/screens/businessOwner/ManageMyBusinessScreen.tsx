// src/screens/businessOwner/ManageMyBusinessScreen.tsx

import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  Alert,
  ActivityIndicator,
  Platform,
  StatusBar,
} from "react-native";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useTranslation } from "react-i18next";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Ionicons from "react-native-vector-icons/Ionicons";
import MaterialCommunityIcons from "react-native-vector-icons/MaterialCommunityIcons";
import { RootStackParamList } from "../../navigation/types";
import {
  getBusinessOwnerProfile,
  BusinessOwnerProfileOut,
  BusinessPlaceOut,
} from "../../api/businessOwnerApi";
import { updatePlace } from "../../api/places";
import i18n from "../../i18n";

const DARK_TEAL = "#0f5b63";
const SOFT_TEAL = "#3a8d96";
const MINT = "#9bd3d8";

type NavType = NativeStackNavigationProp<RootStackParamList>;

export default function ManageMyBusinessScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NavType>();

  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [, setProfile] = useState<BusinessOwnerProfileOut | null>(null);
  const [place, setPlace] = useState<BusinessPlaceOut | null>(null);

  // Edit states
  const [editingField, setEditingField] = useState<string | null>(null);

  // Form states
  const [phone, setPhone] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [whatsappLink, setWhatsappLink] = useState("");
  const [openingHours, setOpeningHours] = useState<{ [key: string]: string }>({
    Sunday: "",
    Monday: "",
    Tuesday: "",
    Wednesday: "",
    Thursday: "",
    Friday: "",
    Saturday: "",
  });
  
  const loadBusinessData = React.useCallback(async () => {
    try {
      setLoading(true);
      const userId = await AsyncStorage.getItem("userId");
      if (!userId) {
        Alert.alert(t("error") || "שגיאה", "User ID not found");
        navigation.goBack();
        return;
      }

      const profileData = await getBusinessOwnerProfile(parseInt(userId, 10));
      setProfile(profileData);
      setPlace(profileData.place);

      if (profileData.place) {
        setPhone(profileData.place.phone || "");
        setDescription(profileData.place.description || "");
        setLocation(
          profileData.place.city_name
            ? `${profileData.place.city_name}, Israel`
            : ""
        );
        setWhatsappLink(profileData.place.social_links || "");
      }
    } catch (error: any) {
      Alert.alert(
        t("error") || "שגיאה",
        error.message || "Failed to load business data"
      );
    } finally {
      setLoading(false);
    }
  }, [navigation, t]);
  useFocusEffect(
    React.useCallback(() => {
      loadBusinessData();
    }, [loadBusinessData])
  );

  async function handleSaveField(field: string) {
    if (!place) return;

    try {
      setUpdating(true);

      const updateData: any = {};
      switch (field) {
        case "phone":
          updateData.phone = phone.trim() || null;
          break;
        case "description":
          updateData.description = description.trim() || null;
          break;
        case "whatsapp":
          updateData.social_links = whatsappLink.trim() || null;
          break;
        case "opening_hours":
          // Format opening hours string
          const hoursString = Object.entries(openingHours)
            .map(([day, hours]) => {
              if (!hours || hours.trim() === "") return null;
              return `${day}: ${hours}`;
            })
            .filter(Boolean)
            .join(", ");
          updateData.opening_hours = hoursString || null;
          break;
      }

      await updatePlace(place.id, updateData);

      // Reload data
      await loadBusinessData();

      setEditingField(null);

      Alert.alert(
        t("success") || "הצלחה",
        t("updated_successfully") || "Updated successfully"
      );
    } catch (error: any) {
      console.error("Error updating field:", error);
      Alert.alert(
        t("error") || "שגיאה",
        error.message || "Failed to update"
      );
    } finally {
      setUpdating(false);
    }
  }

  function getPlaceName(): string {
    if (!place) return "";
    const currentLanguage = i18n.language || "ar";
    if (currentLanguage === "he" && place.name_he) return place.name_he;
    if (currentLanguage === "ar" && place.name_ar) return place.name_ar;
    return place.name;
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={DARK_TEAL} />
        <Text style={styles.loadingText}>{t("loading") || "טוען..."}</Text>
      </View>
    );
  }

  if (!place) {
    return (
      <View style={styles.center}>
        <Text style={styles.noPlaceText}>
          {t("no_business_found") || "No business found"}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.wrapper}>
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {t("manage_my_business") || "Manage My Business"}
        </Text>
        <TouchableOpacity style={styles.bellButton} activeOpacity={0.7}>
          <Ionicons name="notifications-outline" size={24} color="#000" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Business Name Section */}
        <View style={styles.businessNameSection}>
          <View style={styles.businessNameRow}>
            <View style={styles.businessIconContainer}>
              <MaterialCommunityIcons
                name="store"
                size={32}
                color={DARK_TEAL}
              />
            </View>
            <View style={styles.businessNameContainer}>
              <Text style={styles.businessNameLabel}>
                {t("business_name") || "Business Name"}
              </Text>
              <Text style={styles.businessName}>{getPlaceName()}</Text>
              <View style={styles.approvedBadge}>
                <Ionicons name="checkmark-circle" size={16} color="#4CAF50" />
                <Text style={styles.approvedText}>
                  {t("approved_by_admin") || "Approved by Admin"}
                </Text>
              </View>
            </View>
            {place.lat && place.lon && (
              <TouchableOpacity
                style={styles.mapThumbnail}
                onPress={() => {
                  // Navigate to map view if needed
                }}
              >
                <Ionicons name="map-outline" size={24} color={DARK_TEAL} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Edit Business Info Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>
              {t("edit_business_info") || "Edit Business Info"}
            </Text>
            <Text style={styles.lastUpdated}>
              {t("last_updated") || "Last updated"}: 30 {t("min_ago") || "min ago"}
            </Text>
          </View>

          {/* Phone Number */}
          <View style={styles.infoRow}>
            <Ionicons name="call-outline" size={20} color={DARK_TEAL} />
            <View style={styles.infoContent}>
              {editingField === "phone" ? (
                <View style={styles.editContainer}>
                  <TextInput
                    style={styles.editInput}
                    value={phone}
                    onChangeText={setPhone}
                    placeholder="+972 52-1234567"
                    keyboardType="phone-pad"
                    autoFocus
                  />
                  <TouchableOpacity
                    style={styles.checkButton}
                    onPress={() => handleSaveField("phone")}
                    disabled={updating}
                  >
                    {updating ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Ionicons name="checkmark" size={20} color="#fff" />
                    )}
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.infoRowContent}>
                  <Text style={styles.infoText}>
                    {phone || t("not_set") || "Not set"}
                  </Text>
                  <TouchableOpacity
                    onPress={() => setEditingField("phone")}
                    style={styles.editButton}
                  >
                    <Text style={styles.editButtonText}>
                      {t("edit") || "Edit"}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>

          {/* Description */}
          <View style={styles.infoRow}>
            <Ionicons name="chatbubble-outline" size={20} color={DARK_TEAL} />
            <View style={styles.infoContent}>
              {editingField === "description" ? (
                <View style={styles.editContainer}>
                  <TextInput
                    style={[styles.editInput, styles.textArea]}
                    value={description}
                    onChangeText={setDescription}
                    placeholder={t("describe_business") || "Describe your business..."}
                    multiline
                    numberOfLines={3}
                    textAlignVertical="top"
                    autoFocus
                  />
                  <TouchableOpacity
                    style={styles.checkButton}
                    onPress={() => handleSaveField("description")}
                    disabled={updating}
                  >
                    {updating ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Ionicons name="checkmark" size={20} color="#fff" />
                    )}
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.infoRowContent}>
                  <Text style={styles.infoText}>
                    {description || t("not_set") || "Not set"}
                  </Text>
                  <TouchableOpacity
                    onPress={() => setEditingField("description")}
                    style={styles.editButton}
                  >
                    <Text style={styles.editButtonText}>
                      {t("edit") || "Edit"}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>

          {/* Location */}
          <View style={styles.infoRow}>
            <Ionicons name="location-outline" size={20} color={DARK_TEAL} />
            <View style={styles.infoContent}>
              <Text style={styles.infoText}>{location}</Text>
            </View>
          </View>

          {/* WhatsApp Link */}
          <View style={styles.infoRow}>
            <MaterialCommunityIcons
              name="whatsapp"
              size={20}
              color={DARK_TEAL}
            />
            <View style={styles.infoContent}>
              {editingField === "whatsapp" ? (
                <View style={styles.editContainer}>
                  <TextInput
                    style={styles.editInput}
                    value={whatsappLink}
                    onChangeText={setWhatsappLink}
                    placeholder="https://wa.me/9725221234567"
                    keyboardType="url"
                    autoCapitalize="none"
                    autoFocus
                  />
                  <TouchableOpacity
                    style={styles.checkButton}
                    onPress={() => handleSaveField("whatsapp")}
                    disabled={updating}
                  >
                    {updating ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Ionicons name="checkmark" size={20} color="#fff" />
                    )}
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.infoRowContent}>
                  <Text style={styles.infoText}>
                    {whatsappLink || t("not_set") || "Not set"}
                  </Text>
                  <TouchableOpacity
                    onPress={() => setEditingField("whatsapp")}
                    style={styles.editButton}
                  >
                    <Text style={styles.editButtonText}>
                      {t("edit") || "Edit"}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>

          {/* Add Social Link */}
          <TouchableOpacity style={styles.addSocialLink}>
            <Ionicons name="link-outline" size={20} color={DARK_TEAL} />
            <Text style={styles.addSocialLinkText}>
              + {t("add_social_link") || "Add social link"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Opening and Closing Hours Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>
              {t("opening_and_closing_hours") || "Opening and Closing Hours"}
            </Text>
            {editingField === "opening_hours" && (
              <TouchableOpacity
                style={styles.saveChangesButton}
                onPress={() => handleSaveField("opening_hours")}
                disabled={updating}
              >
                {updating ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.saveChangesText}>
                    {t("save_changes") || "Save Changes"}
                  </Text>
                )}
              </TouchableOpacity>
            )}
          </View>

          {Object.entries(openingHours).map(([day, hours]) => (
            <View key={day} style={styles.hoursRow}>
              <Text style={styles.dayText}>{day}</Text>
              {editingField === "opening_hours" ? (
                <TextInput
                  style={styles.hoursInput}
                  value={hours}
                  onChangeText={(text) =>
                    setOpeningHours({ ...openingHours, [day]: text })
                  }
                  placeholder="8:00 AM - 8:00 PM"
                  placeholderTextColor="#9ab8bd"
                />
              ) : (
                <Text style={styles.hoursText}>
                  {hours || t("closed") || "Closed"}
                </Text>
              )}
            </View>
          ))}

          {editingField !== "opening_hours" && (
            <TouchableOpacity
              style={styles.updateHoursButton}
              onPress={() => setEditingField("opening_hours")}
            >
              <Text style={styles.updateHoursText}>
                {t("update_hours") || "Update Hours"}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Photo Gallery Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>
              {t("photo_gallery") || "Photo Gallery"}
            </Text>
            <TouchableOpacity>
              <Text style={styles.addPhotoText}>
                + {t("add_photo") || "Add Photo"} &gt;
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.photoGallery}>
            {place.main_image_url && (
              <View style={styles.photoItem}>
                <Image
                  source={{ uri: place.main_image_url }}
                  style={styles.photo}
                />
                <View style={styles.photoOverlay}>
                  <TouchableOpacity style={styles.photoAction}>
                    <Ionicons name="download-outline" size={20} color="#fff" />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.photoAction}>
                    <Ionicons name="create-outline" size={20} color="#fff" />
                  </TouchableOpacity>
                </View>
              </View>
            )}
            <TouchableOpacity style={styles.addPhotoPlaceholder}>
              <Ionicons name="camera-outline" size={32} color={DARK_TEAL} />
              <Text style={styles.addPhotoPlaceholderText}>
                {t("add_photo") || "Add Photo"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Announcement Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>
              {t("announcement") || "Announcement"}
            </Text>
            <TouchableOpacity>
              <Text style={styles.updateAnnouncementText}>
                {t("update_announcement") || "Update Announcement"}
              </Text>
            </TouchableOpacity>
          </View>
          <TextInput
            style={styles.announcementInput}
            placeholder={t("announcement_placeholder") || "Today only 20% off..."}
            placeholderTextColor="#9ab8bd"
            multiline
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: "#f5fdff",
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f5fdff",
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: DARK_TEAL,
  },
  noPlaceText: {
    fontSize: 16,
    color: DARK_TEAL,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "ios" ? 50 : 16,
    paddingBottom: 12,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1A1A1A",
    flex: 1,
    textAlign: "center",
  },
  bellButton: {
    padding: 4,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 24,
  },
  businessNameSection: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#d6ebee",
  },
  businessNameRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  businessIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: MINT,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  businessNameContainer: {
    flex: 1,
  },
  businessNameLabel: {
    fontSize: 12,
    color: SOFT_TEAL,
    marginBottom: 4,
  },
  businessName: {
    fontSize: 20,
    fontWeight: "700",
    color: DARK_TEAL,
    marginBottom: 8,
  },
  approvedBadge: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
  },
  approvedText: {
    fontSize: 12,
    color: "#4CAF50",
    marginLeft: 4,
  },
  mapThumbnail: {
    width: 80,
    height: 60,
    borderRadius: 8,
    overflow: "hidden",
    marginLeft: 12,
  },
  section: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#d6ebee",
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: DARK_TEAL,
  },
  lastUpdated: {
    fontSize: 12,
    color: SOFT_TEAL,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  infoContent: {
    flex: 1,
    marginLeft: 12,
  },
  infoRowContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  infoText: {
    fontSize: 14,
    color: DARK_TEAL,
    flex: 1,
  },
  editButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  editButtonText: {
    fontSize: 14,
    color: DARK_TEAL,
    fontWeight: "600",
  },
  editContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  editInput: {
    flex: 1,
    backgroundColor: "#f5fdff",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#d6ebee",
    fontSize: 14,
    color: DARK_TEAL,
  },
  textArea: {
    minHeight: 60,
    textAlignVertical: "top",
  },
  checkButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: DARK_TEAL,
    justifyContent: "center",
    alignItems: "center",
  },
  addSocialLink: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
  },
  addSocialLinkText: {
    fontSize: 14,
    color: DARK_TEAL,
    fontWeight: "600",
    marginLeft: 12,
  },
  hoursRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  dayText: {
    fontSize: 14,
    color: DARK_TEAL,
    fontWeight: "500",
  },
  hoursText: {
    fontSize: 14,
    color: DARK_TEAL,
  },
  hoursInput: {
    flex: 1,
    backgroundColor: "#f5fdff",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#d6ebee",
    fontSize: 14,
    color: DARK_TEAL,
    textAlign: "right",
  },
  saveChangesButton: {
    backgroundColor: DARK_TEAL,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  saveChangesText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  updateHoursButton: {
    backgroundColor: DARK_TEAL,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 16,
  },
  updateHoursText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  photoGallery: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  photoItem: {
    width: 100,
    height: 100,
    borderRadius: 8,
    overflow: "hidden",
    position: "relative",
  },
  photo: {
    width: "100%",
    height: "100%",
  },
  photoOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-around",
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingVertical: 4,
  },
  photoAction: {
    padding: 4,
  },
  addPhotoPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: MINT,
    borderStyle: "dashed",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f5fdff",
  },
  addPhotoPlaceholderText: {
    fontSize: 12,
    color: DARK_TEAL,
    marginTop: 4,
  },
  addPhotoText: {
    fontSize: 14,
    color: DARK_TEAL,
    fontWeight: "600",
  },
  announcementInput: {
    backgroundColor: "#f5fdff",
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: "#d6ebee",
    fontSize: 14,
    color: DARK_TEAL,
    minHeight: 60,
    textAlignVertical: "top",
  },
  updateAnnouncementText: {
    fontSize: 14,
    color: DARK_TEAL,
    fontWeight: "600",
  },
});


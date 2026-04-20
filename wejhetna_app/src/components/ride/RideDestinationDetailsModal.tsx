import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useTranslation } from "react-i18next";
import Ionicons from "react-native-vector-icons/Ionicons";
import type { Category, City, PlaceForMap } from "../../api/places";
import { fetchAllPlaces } from "../../api/places";
import { haversineMeters } from "../../utils/routePolyline";

const TEAL = "#0f5b63";

type Props = {
  visible: boolean;
  onClose: () => void;
  destinationText: string;
  destinationLat: number | null;
  destinationLon: number | null;
};

const MATCH_RADIUS_M = 95;

function cityLabel(city: City, lang: string): string {
  if (lang === "ar") return city.name_ar;
  if (lang === "he") return city.name_he || city.name_ar;
  return city.name_en || city.name_ar;
}

function categoryLabel(cat: Category, lang: string): string {
  if (lang === "ar") return cat.name_ar;
  if (lang === "he") return cat.name_he || cat.name_ar;
  return cat.name_en || cat.name_ar;
}

export function RideDestinationDetailsModal({
  visible,
  onClose,
  destinationText,
  destinationLat,
  destinationLon,
}: Props) {
  const { t, i18n } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [place, setPlace] = useState<PlaceForMap | null>(null);

  useEffect(() => {
    if (!visible) {
      setPlace(null);
      return;
    }
    if (
      destinationLat == null ||
      destinationLon == null ||
      !Number.isFinite(destinationLat) ||
      !Number.isFinite(destinationLon)
    ) {
      setPlace(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const places = await fetchAllPlaces();
        if (cancelled) return;
        let best: PlaceForMap | null = null;
        let bestD = Infinity;
        for (const p of places) {
          const d = haversineMeters(destinationLat, destinationLon, p.location.lat, p.location.lon);
          if (d < bestD && d <= MATCH_RADIUS_M) {
            bestD = d;
            best = p;
          }
        }
        setPlace(best);
      } catch {
        setPlace(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, destinationLat, destinationLon]);

  const lang = i18n.language === "ar" ? "ar" : i18n.language === "he" ? "he" : "en";

  const placeName = useMemo(() => {
    if (place == null) return null;
    return lang === "ar"
      ? place.name_ar || place.name
      : lang === "he"
        ? place.name_he || place.name
        : place.name;
  }, [place, lang]);

  /** `fetchAllPlaces` already normalizes main + gallery; gallery excludes duplicate of main. */
  const galleryUrls = useMemo(() => {
    if (!place?.business_images_urls?.length) return [];
    return place.business_images_urls.filter(Boolean);
  }, [place]);

  const openSocial = () => {
    if (!place?.social_links?.trim()) return;
    const raw = place.social_links.trim();
    const url = raw.startsWith("http") ? raw : `https://${raw}`;
    void Linking.openURL(url);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{t("ride_trip_destination_details_title")}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeX} hitSlop={12} accessibilityRole="button">
              <Ionicons name="close" size={28} color="#333" />
            </TouchableOpacity>
          </View>
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
          >
            {loading ? <ActivityIndicator color={TEAL} style={styles.loader} /> : null}
            {place ? (
              <>
                {place.main_image_url ? (
                  <Image source={{ uri: place.main_image_url }} style={styles.hero} resizeMode="cover" />
                ) : null}
                {galleryUrls.length > 0 ? (
                  <View style={styles.galleryBlock}>
                    <Text style={styles.galleryLabel}>{t("ride_trip_destination_more_images")}</Text>
                    <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator={false}>
                      <View style={styles.galleryRow}>
                        {galleryUrls.map((uri, idx) => (
                          <Image
                            key={`${uri}-${idx}`}
                            source={{ uri }}
                            style={[styles.thumb, idx < galleryUrls.length - 1 && styles.thumbSpacing]}
                            resizeMode="cover"
                          />
                        ))}
                      </View>
                    </ScrollView>
                  </View>
                ) : null}
                <Text style={styles.placeName}>{placeName}</Text>
                {place.description ? <Text style={styles.bodyText}>{place.description}</Text> : null}
                <Text style={styles.meta}>
                  {t("ride_trip_destination_city")}: {cityLabel(place.city, lang)}
                </Text>
                {place.category ? (
                  <Text style={styles.meta}>
                    {t("ride_trip_destination_category")}: {categoryLabel(place.category, lang)}
                  </Text>
                ) : null}
                <Text style={styles.meta}>
                  {t("ride_trip_destination_place_type")}:{" "}
                  {place.place_type === "BUSINESS"
                    ? t("ride_trip_place_type_business")
                    : t("ride_trip_place_type_public_service")}
                </Text>
                {place.opening_hours ? (
                  <Text style={styles.meta}>
                    {t("ride_trip_destination_hours")}: {place.opening_hours}
                  </Text>
                ) : null}
                {place.phone ? (
                  <TouchableOpacity
                    onPress={() => void Linking.openURL(`tel:${place.phone}`)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.linkLine}>
                      {t("ride_trip_destination_phone")}: {place.phone}
                    </Text>
                  </TouchableOpacity>
                ) : null}
                {place.social_links?.trim() ? (
                  <TouchableOpacity onPress={openSocial} activeOpacity={0.7}>
                    <Text style={styles.linkLine}>
                      {t("ride_trip_destination_social")}: {place.social_links.trim()}
                    </Text>
                  </TouchableOpacity>
                ) : null}
                {place.announcement ? <Text style={styles.announce}>{place.announcement}</Text> : null}
              </>
            ) : !loading ? (
              <View>
                <Text style={styles.destFallback}>{destinationText}</Text>
                <Text style={styles.bodyMuted}>{t("ride_trip_destination_no_place_match")}</Text>
              </View>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: "88%",
    paddingBottom: 24,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#ddd",
  },
  sheetTitle: { fontSize: 17, fontWeight: "700", color: "#111", flex: 1 },
  closeX: { padding: 4 },
  scroll: { padding: 16 },
  loader: { marginVertical: 24 },
  hero: { width: "100%", height: 180, borderRadius: 12, marginBottom: 12 },
  galleryBlock: { marginBottom: 12 },
  galleryLabel: { fontSize: 13, fontWeight: "600", color: "#555", marginBottom: 8 },
  galleryRow: { flexDirection: "row", flexWrap: "nowrap", paddingRight: 8 },
  thumb: { width: 120, height: 90, borderRadius: 10, backgroundColor: "#eee" },
  thumbSpacing: { marginRight: 10 },
  placeName: { fontSize: 20, fontWeight: "800", color: TEAL, marginBottom: 8 },
  bodyText: { fontSize: 15, color: "#333", lineHeight: 22, marginBottom: 10 },
  bodyMuted: { fontSize: 14, color: "#666", lineHeight: 20, marginTop: 8 },
  meta: { fontSize: 14, color: "#444", marginBottom: 8, lineHeight: 20 },
  linkLine: {
    fontSize: 14,
    color: "#1565c0",
    marginBottom: 8,
    lineHeight: 20,
    textDecorationLine: "underline",
  },
  announce: { fontSize: 14, color: "#555", marginTop: 8, fontStyle: "italic", lineHeight: 20 },
  destFallback: { fontSize: 16, fontWeight: "700", color: "#111", marginBottom: 6 },
});

import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Platform,
} from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import { formatApiImageUri } from "../utils/imageUrl";
import type { AdminPendingAdvertisement } from "../api/advertisements";

const DARK_TEAL = "#0f5b63";
const MUTED = "#64748b";
const CARD = "#ffffff";
const BORDER = "#e8eef0";

type Props = {
  item: AdminPendingAdvertisement;
  categoryLabel: string;
  cityLabel: string;
  createdDisplay: string;
  userLabel: string;
  imageAlt: string;
  isRTL: boolean;
  onPress: () => void;
};

export default function AdminAdvertisementPendingCard({
  item,
  categoryLabel,
  cityLabel,
  createdDisplay,
  userLabel,
  imageAlt,
  isRTL,
  onPress,
}: Props) {
  const uri = formatApiImageUri(item.image_url);
  const desc = item.description?.trim();

  return (
    <TouchableOpacity
      style={styles.wrap}
      activeOpacity={0.92}
      onPress={onPress}
      accessibilityRole="button"
    >
      <View style={styles.card}>
        {uri ? (
          <Image
            source={{ uri }}
            style={styles.image}
            resizeMode="cover"
            accessibilityLabel={imageAlt}
          />
        ) : (
          <View style={[styles.image, styles.imagePlaceholder]}>
            <Ionicons name="image-outline" size={40} color={MUTED} />
          </View>
        )}

        <View style={[styles.body, isRTL && styles.bodyRTL]}>
          <View style={[styles.row, isRTL && styles.rowRTL]}>
            <View style={[styles.chip, styles.chipTeal]}>
              <Ionicons name="grid-outline" size={14} color={DARK_TEAL} />
              <Text style={styles.chipText} numberOfLines={1}>
                {categoryLabel}
              </Text>
            </View>
            <View style={[styles.chip, styles.chipMuted]}>
              <Ionicons name="location-outline" size={14} color={MUTED} />
              <Text style={[styles.chipTextMuted, isRTL && styles.textRTL]} numberOfLines={1}>
                {cityLabel}
              </Text>
            </View>
          </View>

          {desc ? (
            <Text style={[styles.description, isRTL && styles.textRTL]} numberOfLines={2}>
              {desc}
            </Text>
          ) : null}

          <View style={[styles.metaRow, isRTL && styles.rowRTL]}>
            <View style={[styles.metaItem, isRTL && styles.rowRTL]}>
              <Ionicons name="time-outline" size={15} color={MUTED} />
              <Text style={[styles.metaText, isRTL && styles.textRTL]} numberOfLines={1}>
                {createdDisplay}
              </Text>
            </View>
            <View style={[styles.metaItem, isRTL && styles.rowRTL]}>
              <Ionicons name="person-outline" size={15} color={MUTED} />
              <Text style={[styles.metaText, isRTL && styles.textRTL]}>
                {userLabel}: {item.user.full_name} (@{item.user.username})
              </Text>
            </View>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: 18,
    marginBottom: 16,
  },
  card: {
    backgroundColor: CARD,
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: BORDER,
    shadowColor: DARK_TEAL,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 5,
  },
  image: {
    width: "100%",
    height: 168,
    backgroundColor: "#eef5f6",
  },
  imagePlaceholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  body: {
    padding: 16,
    gap: 10,
  },
  bodyRTL: {
    alignItems: "stretch",
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    alignItems: "center",
  },
  rowRTL: {
    flexDirection: "row-reverse",
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 14,
    maxWidth: "100%",
  },
  chipTeal: {
    backgroundColor: "#e8f4f5",
  },
  chipMuted: {
    backgroundColor: "#f1f5f9",
  },
  chipText: {
    fontSize: 13,
    fontWeight: "600",
    color: DARK_TEAL,
    maxWidth: 160,
    fontFamily: Platform.OS === "ios" ? "System" : "Roboto",
  },
  chipTextMuted: {
    fontSize: 13,
    fontWeight: "500",
    color: MUTED,
    maxWidth: 160,
    fontFamily: Platform.OS === "ios" ? "System" : "Roboto",
  },
  description: {
    fontSize: 14,
    lineHeight: 21,
    color: "#334155",
    fontWeight: "400",
    fontFamily: Platform.OS === "ios" ? "System" : "Roboto",
  },
  textRTL: {
    textAlign: "right",
    writingDirection: "rtl",
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 10,
    paddingTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: BORDER,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 1,
  },
  metaText: {
    fontSize: 12,
    color: MUTED,
    fontWeight: "500",
    fontFamily: Platform.OS === "ios" ? "System" : "Roboto",
  },
});

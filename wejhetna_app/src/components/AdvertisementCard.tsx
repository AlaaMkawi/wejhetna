import React from "react";
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  Platform,
} from "react-native";
import { useTranslation } from "react-i18next";
import type { PublicAdvertisement } from "../api/advertisements";
import { formatApiImageUri } from "../utils/imageUrl";

type Props = {
  item: PublicAdvertisement;
  onPress: () => void;
  subtitle?: string;
};

export default function AdvertisementCard({
  item,
  onPress,
  subtitle,
}: Props) {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.dir() === "rtl";
  const { width } = useWindowDimensions();
  const cardWidth = width - 36;
  const uri = formatApiImageUri(item.image_url);

  return (
    <TouchableOpacity
      style={[styles.card, { width: cardWidth }]}
      activeOpacity={0.92}
      onPress={onPress}
      accessibilityRole="button"
    >
      <View style={styles.imageWrap}>
        {uri ? (
          <Image
            source={{ uri }}
            style={styles.image}
            resizeMode="cover"
            accessibilityLabel={t("advertisements.imageAlt")}
          />
        ) : (
          <View style={[styles.image, styles.imagePlaceholder]} />
        )}
      </View>

      {subtitle ? (
        <View style={styles.body}>
          <Text style={[styles.subtitle, isRTL && styles.textRTL]} numberOfLines={1}>
            {subtitle}
          </Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    alignSelf: "center",
    borderRadius: 14,
    marginBottom: 12,
    backgroundColor: "#ffffff",
    overflow: "hidden",
    shadowColor: "#0f5b6322",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 10,
    elevation: 3,
    borderWidth: 1,
    borderColor: "#d4e8ea",
  },
  imageWrap: {
    padding: 8,
    paddingBottom: 0,
  },
  image: {
    width: "100%",
    height: 132,
    borderRadius: 12,
    backgroundColor: "#e8f4f5",
  },
  imagePlaceholder: {
    backgroundColor: "#e8f4f5",
  },
  body: {
    paddingHorizontal: 10,
    paddingTop: 6,
    paddingBottom: 10,
  },
  rowRTL: { flexDirection: "row-reverse" },
  textRTL: { textAlign: "right", writingDirection: "rtl" },
  subtitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#475569",
    fontFamily: Platform.OS === "ios" ? "System" : "Roboto",
  },
});

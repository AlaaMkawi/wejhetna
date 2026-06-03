import React from "react";
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Linking,
  ImageStyle,
  ViewStyle,
} from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import { useTranslation } from "react-i18next";
import {
  attachmentFileLabel,
  isImageAttachmentUrl,
} from "../../utils/attachmentDisplay";

const DARK_TEAL = "#0f5b63";

type Props = {
  url: string;
  imageStyle?: ImageStyle;
  containerStyle?: ViewStyle;
  onPress?: () => void;
};

export default function AttachmentPreview({
  url,
  imageStyle,
  containerStyle,
  onPress,
}: Props) {
  const { t } = useTranslation();
  const isImage = isImageAttachmentUrl(url);

  const openUrl = async () => {
    if (onPress) {
      onPress();
      return;
    }
    try {
      const can = await Linking.canOpenURL(url);
      if (can) await Linking.openURL(url);
    } catch {
      // ignore
    }
  };

  if (isImage) {
    return (
      <TouchableOpacity activeOpacity={0.9} onPress={openUrl} style={containerStyle}>
        <Image
          source={{ uri: url }}
          style={[styles.image, imageStyle]}
          resizeMode="cover"
        />
      </TouchableOpacity>
    );
  }

  const label = attachmentFileLabel(url);
  return (
    <TouchableOpacity
      style={[styles.docCard, containerStyle]}
      onPress={openUrl}
      activeOpacity={0.85}
    >
      <Ionicons name="document-text-outline" size={32} color={DARK_TEAL} />
      <Text style={styles.docTitle} numberOfLines={2}>
        {label}
      </Text>
      <Text style={styles.docHint}>
        {t("tap_to_open_document") || "לחץ לפתיחת הקובץ"}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  image: {
    width: "100%",
    height: 140,
    borderRadius: 8,
    backgroundColor: "#eee",
  },
  docCard: {
    width: "100%",
    minHeight: 100,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d6ebee",
    backgroundColor: "#f5fdff",
    padding: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  docTitle: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: "600",
    color: DARK_TEAL,
    textAlign: "center",
  },
  docHint: {
    marginTop: 4,
    fontSize: 11,
    color: "#6b8a8f",
  },
});

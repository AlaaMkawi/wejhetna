import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { useTranslation } from "react-i18next";
import {
  promptPickAndUploadDriverDocument,
  DriverDocumentPickMode,
} from "../../utils/pickDriverDocument";
import AttachmentPreview from "./AttachmentPreview";

const DARK_TEAL = "#0f5b63";
const MINT = "#9bd3d8";

type Props = {
  label: string;
  url: string;
  uploading: boolean;
  disabled?: boolean;
  placeholderText?: string;
  mode?: DriverDocumentPickMode;
  onUrlChange: (url: string) => void;
  onUploadingChange?: (uploading: boolean) => void;
  onError?: (message: string) => void;
};

export default function DriverDocumentUploadField({
  label,
  url,
  uploading,
  disabled,
  placeholderText,
  mode = "document_or_photo",
  onUrlChange,
  onUploadingChange,
  onError,
}: Props) {
  const { t } = useTranslation();

  const onPress = () => {
    if (disabled || uploading) return;
    promptPickAndUploadDriverDocument(
      mode,
      {
        title: t("upload_attachment_title") || "העלאת מסמך",
        message:
          t("upload_attachment_message") ||
          "בחרי איך לצרף את המסמך",
        camera: t("take_photo") || "צילום",
        gallery: t("choose_photo") || "תמונה מהגלריה",
        document: t("choose_document") || "קובץ (PDF וכו׳)",
        cancel: t("cancel") || "ביטול",
      },
      {
        onUploadStart: () => onUploadingChange?.(true),
        onUploadEnd: () => onUploadingChange?.(false),
        onSuccess: onUrlChange,
        onError: (msg) => onError?.(msg),
      }
    );
  };

  return (
    <View>
      <Text style={styles.uploadLabel}>{label}</Text>
      <TouchableOpacity
        style={styles.uploadButton}
        onPress={onPress}
        disabled={disabled || uploading}
      >
        {uploading ? (
          <ActivityIndicator color={DARK_TEAL} />
        ) : url ? (
          <View style={styles.previewWrap}>
            <AttachmentPreview url={url} imageStyle={styles.imagePreview} />
            <Text style={styles.uploadedText}>
              {t("uploaded") || "הועלה"} ✓
            </Text>
          </View>
        ) : (
          <Text style={styles.uploadButtonText}>
            {placeholderText || t("upload") || "העלאה"}
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  uploadLabel: {
    fontSize: 13,
    fontWeight: "500",
    color: DARK_TEAL,
    marginTop: 8,
    marginBottom: 6,
  },
  uploadButton: {
    borderWidth: 2,
    borderColor: MINT,
    borderStyle: "dashed",
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    alignItems: "center",
    minHeight: 56,
    justifyContent: "center",
  },
  uploadButtonText: {
    color: DARK_TEAL,
    fontWeight: "600",
  },
  previewWrap: {
    alignItems: "center",
    width: "100%",
  },
  imagePreview: {
    width: 120,
    height: 80,
    borderRadius: 8,
  },
  uploadedText: {
    fontSize: 12,
    color: "#4CAF50",
    marginTop: 4,
  },
});

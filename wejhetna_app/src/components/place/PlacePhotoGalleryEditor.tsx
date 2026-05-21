import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import { useTranslation } from "react-i18next";
import { launchImageLibrary } from "react-native-image-picker";
import { uploadAssetToS3Presigned } from "../../api/upload";
import { formatApiImageUri } from "../../utils/imageUrl";

const TEAL = "#0f5b63";
const MAX_PHOTOS = 20;

type Props = {
  images: string[];
  onChange: (images: string[]) => void;
  disabled?: boolean;
};

/**
 * Local photo gallery for place create/edit (upload to S3 before parent saves place).
 */
export function PlacePhotoGalleryEditor({ images, onChange, disabled }: Props) {
  const { t } = useTranslation();
  /** Latest list — avoids stale closure when several uploads finish out of order. */
  const imagesRef = useRef(images);
  useEffect(() => {
    imagesRef.current = images;
  }, [images]);

  const commitImages = (next: string[]) => {
    imagesRef.current = next;
    onChange(next);
  };

  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadingTokens, setUploadingTokens] = useState<Record<string, boolean>>(
    {}
  );
  const [imageErrors, setImageErrors] = useState<Record<number, boolean>>({});
  const [imageLoading, setImageLoading] = useState<Record<number, boolean>>({});

  const handleAddPhoto = () => {
    if (disabled || uploadingImage || images.length >= MAX_PHOTOS) return;

    launchImageLibrary(
      {
        mediaType: "photo",
        quality: 0.8,
        selectionLimit: 1,
        includeBase64: true,
      },
      (res) => {
        if (res.didCancel || res.errorCode) return;
        const asset = res.assets?.[0];
        if (!asset?.uri) return;

        const placeholderToken = `__uploading__${Date.now()}_${Math.random().toString(16).slice(2)}`;
        commitImages([...imagesRef.current, placeholderToken]);
        setUploadingTokens((prev) => ({ ...prev, [placeholderToken]: true }));
        setUploadingImage(true);

        (async () => {
          try {
            await new Promise<void>((r) => setTimeout(r, 150));
            const fileUrl = await uploadAssetToS3Presigned({
              uri: asset.uri!,
              fileName: asset.fileName,
              type: asset.type,
              base64: (asset as { base64?: string }).base64,
            });
            const withoutPlaceholder = imagesRef.current.filter(
              (u) => u !== placeholderToken
            );
            commitImages(
              fileUrl
                ? [...withoutPlaceholder, fileUrl]
                : withoutPlaceholder
            );
          } catch {
            commitImages(
              imagesRef.current.filter((u) => u !== placeholderToken)
            );
          } finally {
            setUploadingTokens((prev) => {
              const next = { ...prev };
              delete next[placeholderToken];
              return next;
            });
            setUploadingImage(false);
          }
        })();
      }
    );
  };

  const handleDelete = (index: number) => {
    if (disabled || uploadingImage) return;
    commitImages(imagesRef.current.filter((_, i) => i !== index));
  };

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Text style={styles.title}>{t("photo_gallery") || "גלריית תמונות"}</Text>
        {images.length < MAX_PHOTOS && !disabled ? (
          <TouchableOpacity onPress={handleAddPhoto} disabled={uploadingImage}>
            <Text style={styles.addLink}>
              + {t("add_photo") || "הוסף תמונה"}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <Text style={styles.optionalHint}>
        {t("optional") || "אופציונלי"}
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.row}>
          {images.map((imageUri, index) => {
            const isUploading = !!uploadingTokens[imageUri];
            const formattedUri = formatApiImageUri(imageUri);
            if (!isUploading && !formattedUri) return null;
            return (
              <View key={`${index}-${imageUri.slice(0, 12)}`} style={styles.item}>
                {isUploading ? (
                  <View style={styles.uploadingBox}>
                    <ActivityIndicator color={TEAL} />
                  </View>
                ) : (
                  <View>
                    <Image
                      source={{ uri: formattedUri! }}
                      style={styles.photo}
                      resizeMode="cover"
                      onError={() =>
                        setImageErrors((p) => ({ ...p, [index]: true }))
                      }
                      onLoad={() =>
                        setImageLoading((p) => {
                          const n = { ...p };
                          delete n[index];
                          return n;
                        })
                      }
                      onLoadStart={() =>
                        setImageLoading((p) => ({ ...p, [index]: true }))
                      }
                    />
                    {imageLoading[index] ? (
                      <View style={styles.loadingOverlay}>
                        <ActivityIndicator color="#fff" size="small" />
                      </View>
                    ) : null}
                    {imageErrors[index] ? (
                      <View style={styles.errorBox}>
                        <Ionicons name="image-outline" size={28} color="#999" />
                      </View>
                    ) : null}
                  </View>
                )}
                {!disabled && !isUploading ? (
                  <TouchableOpacity
                    style={styles.deleteBtn}
                    onPress={() => handleDelete(index)}
                  >
                    <Ionicons name="close-circle" size={22} color="#ff6b6b" />
                  </TouchableOpacity>
                ) : null}
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 16 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  title: { fontSize: 16, fontWeight: "700", color: TEAL },
  addLink: { fontSize: 14, fontWeight: "600", color: TEAL },
  optionalHint: { fontSize: 12, color: "#666", marginBottom: 10 },
  row: { flexDirection: "row", gap: 10, paddingVertical: 4 },
  item: { position: "relative" },
  photo: { width: 88, height: 88, borderRadius: 10 },
  uploadingBox: {
    width: 88,
    height: 88,
    borderRadius: 10,
    backgroundColor: "#f0f0f0",
    alignItems: "center",
    justifyContent: "center",
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.25)",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  errorBox: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f5f5f5",
    borderRadius: 10,
  },
  deleteBtn: {
    position: "absolute",
    top: -6,
    right: -6,
    backgroundColor: "#fff",
    borderRadius: 12,
  },
});

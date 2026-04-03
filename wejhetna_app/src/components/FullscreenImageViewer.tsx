import React, { useEffect, useMemo, useRef } from "react";
import {
  View,
  Modal,
  FlatList,
  Image,
  Dimensions,
  TouchableOpacity,
  Text,
  StyleSheet,
  StatusBar,
  Platform,
} from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import { formatApiImageUri, getValidImageUrl } from "../utils/imageUrl";

type Props = {
  visible: boolean;
  images: string[];
  initialIndex: number;
  onRequestClose: () => void;
};

export default function FullscreenImageViewer({
  visible,
  images,
  initialIndex,
  onRequestClose,
}: Props) {
  const listRef = useRef<FlatList<string>>(null);
  const { width, height } = Dimensions.get("window");

  const safeImages = useMemo(
    () =>
      images
        .map((u) => (getValidImageUrl(u) ? formatApiImageUri(u) : ""))
        .filter((u) => u.length > 0),
    [images]
  );

  const startIndex = Math.min(
    Math.max(initialIndex ?? 0, 0),
    Math.max(safeImages.length - 1, 0)
  );

  useEffect(() => {
    if (!visible) return;
    const id = setTimeout(() => {
      try {
        listRef.current?.scrollToIndex({ index: startIndex, animated: false });
      } catch {
        // ignore
      }
    }, 0);
    return () => clearTimeout(id);
  }, [visible, startIndex]);

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent={false} onRequestClose={onRequestClose}>
      <StatusBar barStyle="light-content" />
      <View style={styles.container}>
        <TouchableOpacity style={styles.closeBtn} onPress={onRequestClose} activeOpacity={0.85}>
          <Ionicons name="close" size={28} color="#fff" />
        </TouchableOpacity>

        <FlatList
          ref={listRef}
          data={safeImages}
          keyExtractor={(item, idx) => `${idx}-${item}`}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          getItemLayout={(_, index) => ({
            length: width,
            offset: width * index,
            index,
          })}
          initialScrollIndex={startIndex}
          renderItem={({ item }) => (
            <View style={[styles.page, { width, height }]}>
              <Image
                source={{ uri: item }}
                style={[styles.image, { width, height }]}
                resizeMode="contain"
              />
            </View>
          )}
          ListEmptyComponent={
            <View style={[styles.page, { width, height }]}>
              <Ionicons name="image-outline" size={48} color="#bbb" />
              <Text style={styles.emptyText}>No image</Text>
            </View>
          }
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  closeBtn: {
    position: "absolute",
    top: Platform.OS === "ios" ? 54 : 18,
    right: 18,
    zIndex: 10,
    padding: 10,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.55)",
    ...(Platform.OS === "android"
      ? { elevation: 6 }
      : {
          shadowColor: "#000",
          shadowOpacity: 0.35,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 4 },
        }),
  },
  page: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#000",
  },
  image: {
    backgroundColor: "#000",
  },
  emptyText: {
    marginTop: 12,
    color: "#bbb",
    fontSize: 14,
  },
});

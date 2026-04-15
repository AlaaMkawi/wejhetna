import React, { useCallback, useEffect, useMemo, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  StatusBar,
  Platform,
  FlatList,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import Ionicons from "react-native-vector-icons/Ionicons";
import { RootStackParamList } from "../navigation/types";
import { PublicAdvertisement } from "../api/advertisements";
import { formatApiImageUri } from "../utils/imageUrl";

type Props = NativeStackScreenProps<RootStackParamList, "AdvertisementDetails">;

function sortNewestFirst(list: PublicAdvertisement[]) {
  return [...list].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

function formatPostedAt(iso: string, lang: string): string {
  try {
    const d = new Date(iso);
    const loc = lang === "he" ? "he-IL" : "ar";
    return d.toLocaleString(loc, {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function AdvertisementDetailsScreen({ route, navigation }: Props) {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.dir() === "rtl";
  const lang = i18n.language || "ar";
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList<PublicAdvertisement> | null>(null);

  const feed = useMemo(
    () => sortNewestFirst(route.params.advertisements),
    [route.params.advertisements]
  );

  const { advertisementId } = route.params;

  const initialIndex = useMemo(() => {
    const idx = feed.findIndex((a) => a.id === advertisementId);
    return Math.max(0, idx);
  }, [feed, advertisementId]);

  const pageHeight = height;

  const getItemLayout = useCallback(
    (_data: ArrayLike<PublicAdvertisement> | null | undefined, index: number) => ({
      length: pageHeight,
      offset: pageHeight * index,
      index,
    }),
    [pageHeight]
  );

  useEffect(() => {
    const id = setTimeout(() => {
      try {
        listRef.current?.scrollToIndex({ index: initialIndex, animated: false });
      } catch {
        /* ignore */
      }
    }, 0);
    return () => clearTimeout(id);
  }, [initialIndex]);

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      <FlatList<PublicAdvertisement>
        ref={(r) => {
          listRef.current = r;
        }}
        data={feed}
        keyExtractor={(it) => String(it.id)}
        renderItem={({ item }) => {
          const uri = formatApiImageUri(item.image_url);
          const posted = formatPostedAt(item.created_at, lang);
          return (
            <View style={{ width, height: pageHeight, backgroundColor: "#000" }}>
              {uri ? (
                <Image
                  source={{ uri }}
                  style={StyleSheet.absoluteFill}
                  resizeMode="contain"
                  accessibilityLabel={t("advertisements.imageAlt")}
                />
              ) : (
                <View style={[StyleSheet.absoluteFill, styles.placeholder]}>
                  <Ionicons name="image-outline" size={56} color="#94a3b8" />
                </View>
              )}
              <Text
                style={[
                  styles.dateOverlay,
                  isRTL && styles.dateOverlayRTL,
                  { top: insets.top + 52 },
                ]}
                numberOfLines={1}
              >
                {posted}
              </Text>
            </View>
          );
        }}
        pagingEnabled
        snapToInterval={pageHeight}
        snapToAlignment="start"
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        getItemLayout={getItemLayout}
        initialScrollIndex={feed.length > 0 ? initialIndex : undefined}
        removeClippedSubviews={false}
        onScrollToIndexFailed={(info) => {
          setTimeout(() => {
            listRef.current?.scrollToIndex({
              index: info.index,
              animated: false,
            });
          }, 350);
        }}
      />

      <TouchableOpacity
        style={[
          styles.backFloating,
          isRTL ? { right: 6 } : { left: 6 },
          { top: insets.top + 4 },
        ]}
        onPress={() => navigation.goBack()}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        accessibilityRole="button"
        accessibilityLabel={t("back")}
      >
        <View style={styles.backInner}>
          <Ionicons
            name={isRTL ? "chevron-forward" : "chevron-back"}
            size={26}
            color="#fff"
          />
        </View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  placeholder: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0f172a",
  },
  dateOverlay: {
    position: "absolute",
    left: 16,
    right: 16,
    textAlign: "center",
    fontSize: 12,
    fontWeight: "500",
    color: "rgba(255,255,255,0.78)",
    textShadowColor: "rgba(0,0,0,0.55)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
    fontFamily: Platform.OS === "ios" ? "System" : "Roboto",
  },
  dateOverlayRTL: {
    writingDirection: "rtl",
  },
  backFloating: {
    position: "absolute",
    zIndex: 20,
  },
  backInner: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
});

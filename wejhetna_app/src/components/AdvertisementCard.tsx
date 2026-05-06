import React from "react";
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  ViewStyle,
} from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import { useTranslation } from "react-i18next";
import type { PublicAdvertisement } from "../api/advertisements";
import { formatApiImageUri } from "../utils/imageUrl";
import { Colors, Radius, Shadow, Spacing, Typography } from "../theme";

type Props = {
  item: PublicAdvertisement;
  onPress: () => void;
  /** Pre-resolved category label (i18n-aware). */
  categoryLabel?: string;
  /** Pre-resolved city label (i18n-aware). */
  cityLabel?: string;
  /** Optional explicit width (used inside grids). Defaults to flex:1. */
  width?: number;
  /** Optional extra style to merge over the card root. */
  style?: ViewStyle | ViewStyle[];
};

function pickInitials(name?: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return (
    parts
      .map((p) => p[0])
      .filter(Boolean)
      .join("")
      .toUpperCase() || "?"
  );
}

function formatRelativeTime(
  iso: string,
  t: (key: string, opts?: Record<string, unknown>) => string
): string {
  try {
    const then = new Date(iso).getTime();
    const now = Date.now();
    const diffMs = Math.max(0, now - then);
    const minutes = Math.floor(diffMs / 60000);
    if (minutes < 1) return t("advertisements.publishedJustNow");
    if (minutes < 60) {
      return t("advertisements.publishedMinutesAgo", { count: minutes });
    }
    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
      return t("advertisements.publishedHoursAgo", { count: hours });
    }
    const days = Math.floor(hours / 24);
    return t("advertisements.publishedDaysAgo", { count: days });
  } catch {
    return iso;
  }
}

/**
 * Public advertisement card used in the community feed grid.
 *
 * Visual layout:
 *  - 4:5 image with a tinted gradient-like overlay at the bottom
 *  - Category pill in the top corner
 *  - Title-area lines (description preview + city)
 *  - Footer row with author avatar, name and relative time
 *
 * Pure presentational — receives pre-resolved labels so the card stays
 * agnostic of the i18n logic that lives at the screen level.
 */
export default function AdvertisementCard({
  item,
  onPress,
  categoryLabel,
  cityLabel,
  width,
  style,
}: Props) {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.dir() === "rtl";
  const uri = formatApiImageUri(item.image_url);

  const authorName = item.user?.full_name || item.user?.username || "";
  const initials = pickInitials(authorName);
  const postedRelative = formatRelativeTime(item.created_at, t);
  const description = (item.description || "").trim();
  const previewTitle = description || categoryLabel || "";

  return (
    <TouchableOpacity
      style={[
        styles.card,
        width != null ? { width } : styles.cardFlex,
        style as ViewStyle,
      ]}
      activeOpacity={0.9}
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
          <View style={[styles.image, styles.imagePlaceholder]}>
            <Ionicons name="image-outline" size={28} color={Colors.textMuted} />
          </View>
        )}

        {/* Soft gradient-like overlays — keep the badge readable on bright
            photos and let the text block sit on a darker base. */}
        <View pointerEvents="none" style={styles.overlayTop} />
        <View pointerEvents="none" style={styles.overlayBottom} />

        {categoryLabel ? (
          <View
            style={[
              styles.categoryBadge,
              isRTL ? styles.badgeRight : styles.badgeLeft,
            ]}
          >
            <Text style={styles.categoryBadgeText} numberOfLines={1}>
              {categoryLabel}
            </Text>
          </View>
        ) : null}

        <View style={styles.imageTextBlock}>
          {previewTitle ? (
            <Text
              style={[styles.previewTitle, isRTL && styles.textRTL]}
              numberOfLines={2}
            >
              {previewTitle}
            </Text>
          ) : null}
          {cityLabel ? (
            <View style={[styles.locationRow, isRTL && styles.rowRTL]}>
              <Ionicons
                name="location-outline"
                size={11}
                color="rgba(255,255,255,0.92)"
              />
              <Text
                style={[styles.locationText, isRTL && styles.textRTL]}
                numberOfLines={1}
              >
                {cityLabel}
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      <View style={[styles.footer, isRTL && styles.rowRTL]}>
        <View style={[styles.authorWrap, isRTL && styles.rowRTL]}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <Text
            style={[styles.authorName, isRTL && styles.textRTL]}
            numberOfLines={1}
          >
            {authorName || t("advertisements.anonymousAuthor")}
          </Text>
        </View>
        <Text style={styles.postedAt} numberOfLines={1}>
          {postedRelative}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const IMAGE_ASPECT = 4 / 5;

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.soft,
  },
  cardFlex: {
    flex: 1,
  },
  imageWrap: {
    width: "100%",
    aspectRatio: IMAGE_ASPECT,
    backgroundColor: Colors.surfaceMuted,
    position: "relative",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  imagePlaceholder: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.surfaceMuted,
  },
  overlayTop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 56,
    backgroundColor: "rgba(15,23,42,0.18)",
  },
  overlayBottom: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: "55%",
    backgroundColor: "rgba(15,23,42,0.55)",
  },
  categoryBadge: {
    position: "absolute",
    top: Spacing.sm + 2,
    backgroundColor: "rgba(255,255,255,0.92)",
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: 4,
    maxWidth: "78%",
  },
  badgeLeft: { left: Spacing.sm + 2 },
  badgeRight: { right: Spacing.sm + 2 },
  categoryBadgeText: {
    fontSize: Typography.sizeXs,
    fontWeight: Typography.weightBold,
    color: Colors.text,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  imageTextBlock: {
    position: "absolute",
    left: Spacing.md,
    right: Spacing.md,
    bottom: Spacing.md,
    gap: 4,
  },
  previewTitle: {
    fontSize: Typography.sizeMd,
    fontWeight: Typography.weightBold,
    color: Colors.textInverse,
    lineHeight: 20,
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  locationText: {
    flex: 1,
    fontSize: Typography.sizeXs,
    fontWeight: Typography.weightMedium,
    color: "rgba(255,255,255,0.92)",
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
  },
  authorWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm - 2,
    flex: 1,
    overflow: "hidden",
  },
  avatar: {
    width: 22,
    height: 22,
    borderRadius: Radius.pill,
    backgroundColor: Colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 10,
    fontWeight: Typography.weightBold,
    color: Colors.primary,
    letterSpacing: 0.2,
  },
  authorName: {
    flex: 1,
    fontSize: Typography.sizeXs + 1,
    fontWeight: Typography.weightSemibold,
    color: Colors.textSecondary,
  },
  postedAt: {
    fontSize: Typography.sizeXs,
    fontWeight: Typography.weightMedium,
    color: Colors.textMuted,
  },
  rowRTL: { flexDirection: "row-reverse" },
  textRTL: { textAlign: "right", writingDirection: "rtl" },
});

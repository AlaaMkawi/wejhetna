import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import { Colors, Radius, Shadow, Spacing, Typography } from "../../theme";
import { Tag } from "../ui/Tag";
import type { StatusTone } from "../ui/StatusDot";

/**
 * Polished profile header for all 4 user roles.
 *
 * Layout: a soft white card with a circular avatar (initials), the user's
 * name, a colored role badge, and an optional supporting line — e.g. the
 * driver's vehicle, the business owner's place, "member since" for regulars.
 *
 * Visual language:
 *  - airy white surface, rounded corners, subtle border + soft shadow
 *  - amber/teal accents (no heavy blue blocks)
 *  - uppercase eyebrow label above the title for hierarchy
 */
export type ProfileHeaderCardProps = {
  name: string;
  /** Translated, human-readable role (e.g. "Driver", "Admin"). */
  roleLabel: string;
  roleTone?: StatusTone;
  /** Translated eyebrow line above the name (e.g. "Account · Profile"). */
  eyebrow?: string;
  /** Optional secondary line under the name (e.g. business name, vehicle). */
  supportingLine?: string;
  /** Optional second secondary line (e.g. member since date). */
  secondaryLine?: string;
  /** Optional username chip (e.g. "@alex"). */
  handle?: string;
};

function getInitials(name: string): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.charAt(0).toUpperCase();
  return (parts[0]!.charAt(0) + parts[parts.length - 1]!.charAt(0)).toUpperCase();
}

export function ProfileHeaderCard({
  name,
  roleLabel,
  roleTone = "primary",
  eyebrow,
  supportingLine,
  secondaryLine,
  handle,
}: ProfileHeaderCardProps) {
  const initials = getInitials(name);
  return (
    <View style={styles.card}>
      {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}

      <View style={styles.row}>
        <View style={styles.avatarWrap}>
          <View style={styles.avatarRing}>
            <Text style={styles.avatarInitials}>{initials}</Text>
          </View>
          <View style={styles.avatarBadge}>
            <Ionicons name="checkmark" size={12} color={Colors.textInverse} />
          </View>
        </View>

        <View style={styles.body}>
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>

          {handle ? (
            <Text style={styles.handle} numberOfLines={1}>
              {handle}
            </Text>
          ) : null}

          <View style={styles.metaRow}>
            <Tag tone={roleTone} label={roleLabel} />
            {supportingLine ? (
              <Text style={styles.supporting} numberOfLines={1}>
                {supportingLine}
              </Text>
            ) : null}
          </View>

          {secondaryLine ? (
            <View style={styles.secondaryRow}>
              <Ionicons
                name="time-outline"
                size={14}
                color={Colors.textMuted}
              />
              <Text style={styles.secondary} numberOfLines={1}>
                {secondaryLine}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const AVATAR_SIZE = 72;

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xxl,
    padding: Spacing.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.soft,
  },
  eyebrow: {
    fontSize: 10,
    letterSpacing: 2,
    color: Colors.textMuted,
    textTransform: "uppercase",
    fontWeight: Typography.weightBold,
    marginBottom: Spacing.md,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.lg,
  },
  avatarWrap: {
    position: "relative",
  },
  avatarRing: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: Colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: Colors.surface,
    ...Shadow.soft,
  },
  avatarInitials: {
    fontSize: Typography.sizeXl + 2,
    fontWeight: Typography.weightHeavy,
    color: Colors.primaryDark,
    letterSpacing: 0.5,
  },
  avatarBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.success,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: Colors.surface,
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontSize: Typography.sizeXl,
    fontWeight: Typography.weightHeavy,
    color: Colors.text,
    letterSpacing: -0.2,
  },
  handle: {
    marginTop: 2,
    fontSize: Typography.sizeSm + 1,
    color: Colors.textMuted,
  },
  metaRow: {
    marginTop: Spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    flexWrap: "wrap",
  },
  supporting: {
    flexShrink: 1,
    fontSize: Typography.sizeSm + 1,
    color: Colors.textSecondary,
    fontWeight: Typography.weightMedium,
  },
  secondaryRow: {
    marginTop: Spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs + 2,
  },
  secondary: {
    fontSize: Typography.sizeSm,
    color: Colors.textMuted,
  },
});

export default ProfileHeaderCard;

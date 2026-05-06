import React, { useEffect, useMemo, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  I18nManager,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useTranslation } from "react-i18next";
import Ionicons from "react-native-vector-icons/Ionicons";

const DEFAULT_ACCENT = "#0f5b63";
const PANEL_BG = "#FFFFFF";
const MUTED = "#64748B";
const BORDER = "rgba(15, 91, 99, 0.12)";

export type NavInfoStat = {
  label: string;
  value: string;
  icon: string;
  highlight?: boolean;
  /** If true, value may wrap to two lines (e.g. long localized ETA strings). */
  valueFlexible?: boolean;
};

export type NavigationInfoPanelProps = {
  accentColor?: string;
  isLive?: boolean;
  liveLabel: string;
  showLiveDot?: boolean;
  rerouting?: boolean;
  reroutingLabel?: string;
  /** Three tiles: e.g. remaining ETA, distance, arrival clock. */
  stats: [NavInfoStat, NavInfoStat, NavInfoStat];
  /** Optional subline under the title row, e.g. “12 min · 4.2 km”. */
  metaLine?: string | null;
  /** 0–1; when showProgress, drives the bar and percent label. */
  progress: number;
  showProgress: boolean;
  startLabel?: string;
  endLabel?: string;
  footNote?: string | null;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Extra bottom padding (e.g. safe area) inside the card. */
  contentPaddingBottom?: number;
};

/**
 * Shared bottom “trip / route” card: live strip, three stat tiles, optional progress, footer slot.
 * Presentation only — parent supplies all strings and numbers from existing navigation logic.
 */
export function NavigationInfoPanel({
  accentColor = DEFAULT_ACCENT,
  isLive = true,
  liveLabel,
  showLiveDot = true,
  rerouting = false,
  reroutingLabel,
  stats,
  metaLine,
  progress: progressProp,
  showProgress,
  startLabel: startLabelProp,
  endLabel: endLabelProp,
  footNote,
  children,
  style,
  contentPaddingBottom = 0,
}: NavigationInfoPanelProps) {
  const { t } = useTranslation();
  const progress = Math.max(0, Math.min(1, progressProp));
  const pct = Math.round(progress * 100);
  const startLabel = startLabelProp ?? t("nav_panel_route_leg_a");
  const endLabel = endLabelProp ?? t("nav_panel_route_leg_b");
  const reroutingText = reroutingLabel ?? t("rerouting");
  const barAnim = useRef(new Animated.Value(progress)).current;
  const pulse = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    Animated.timing(barAnim, {
      toValue: progress,
      duration: 450,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [progress, barAnim]);

  useEffect(() => {
    if (!showLiveDot || !isLive) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1200, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.25, duration: 1200, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [isLive, showLiveDot, pulse]);

  const barWidth = useMemo(
    () =>
      barAnim.interpolate({
        inputRange: [0, 1],
        outputRange: ["0%", "100%"],
      }),
    [barAnim]
  );

  const thumbLeft = useMemo(
    () =>
      barAnim.interpolate({
        inputRange: [0, 1],
        outputRange: ["0%", "100%"],
      }),
    [barAnim]
  );

  const isRtl = I18nManager.isRTL;
  const rowDir = isRtl ? "row-reverse" : "row";
  const progressLabelsDir = isRtl ? "row-reverse" : "row";

  return (
    <View style={[styles.root, { paddingBottom: 14 + contentPaddingBottom }, style]}>
      <View style={styles.topRow}>
        <View style={[styles.topLeft, { flexDirection: rowDir }]}>
          {showLiveDot && isLive ? (
            <View style={styles.liveDotWrap} accessibilityLabel={liveLabel}>
              <Animated.View style={[styles.liveDotPing, { opacity: pulse }]} />
              <View style={[styles.liveDot, { backgroundColor: accentColor }]} />
            </View>
          ) : null}
          <Text style={[styles.liveLabel, { color: accentColor }]} numberOfLines={1}>
            {liveLabel}
          </Text>
        </View>
        {rerouting ? (
          <View style={styles.rerouteChip}>
            <Text style={styles.rerouteChipText} numberOfLines={1}>
              {reroutingText}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.statsRow}>
        {stats.map((s, i) => (
          <StatTile key={i} stat={s} accentColor={accentColor} isRtl={isRtl} />
        ))}
      </View>

      {metaLine ? (
        <Text style={styles.metaLine} numberOfLines={1}>
          {metaLine}
        </Text>
      ) : null}

      {showProgress ? (
        <View style={styles.progressBlock}>
          <View style={styles.progressTrack}>
            <Animated.View style={[styles.progressFill, { width: barWidth, backgroundColor: accentColor }]} />
            <View style={[styles.progressDotStart, { borderColor: PANEL_BG, backgroundColor: accentColor }]} />
            <Animated.View
              style={[
                styles.progressDotMoving,
                {
                  borderColor: PANEL_BG,
                  backgroundColor: accentColor,
                  left: thumbLeft,
                },
              ]}
            />
            <View style={[styles.progressDotEnd, { borderColor: PANEL_BG, backgroundColor: "#1e293b" }]}>
              <Ionicons name="flag" size={10} color="#fff" />
            </View>
          </View>
          <View style={[styles.progressLabels, { flexDirection: progressLabelsDir }]}>
            <View style={[styles.legPill, { flexDirection: rowDir }]}>
              <View style={[styles.legDot, { backgroundColor: accentColor }]} />
              <Text style={styles.legText} numberOfLines={1}>
                {startLabel}
              </Text>
            </View>
            <Text style={styles.pctText}>{t("nav_panel_route_progress_pct", { percent: pct })}</Text>
            <View style={[styles.legPill, { flexDirection: rowDir }]}>
              <Text style={styles.legText} numberOfLines={1}>
                {endLabel}
              </Text>
              <View style={[styles.legDot, { backgroundColor: "#1e293b" }]} />
            </View>
          </View>
        </View>
      ) : null}

      {footNote ? <Text style={styles.footNote}>{footNote}</Text> : null}

      {children ? <View style={styles.childrenSlot}>{children}</View> : null}
    </View>
  );
}

function StatTile({
  stat,
  accentColor,
  isRtl,
}: {
  stat: NavInfoStat;
  accentColor: string;
  isRtl: boolean;
}) {
  const rowDir = isRtl ? "row-reverse" : "row";
  if (stat.highlight) {
    return (
      <View style={[styles.statTile, styles.statTileHi, { backgroundColor: accentColor, borderColor: accentColor }]}>
        <View style={[styles.statLabelRow, { flexDirection: rowDir }]}>
          <Ionicons name={stat.icon as "time-outline"} size={12} color="rgba(255,255,255,0.9)" />
          <Text style={[styles.statLabel, styles.statLabelHi]} numberOfLines={1}>
            {stat.label}
          </Text>
        </View>
        <Text
          style={[styles.statValue, styles.statValueHi, stat.valueFlexible && styles.statValueFlex]}
          numberOfLines={stat.valueFlexible ? 2 : 1}
        >
          {stat.value}
        </Text>
        <View style={styles.statHiGlow} />
      </View>
    );
  }
  return (
    <View style={styles.statTile}>
      <View style={[styles.statLabelRow, { flexDirection: rowDir }]}>
        <Ionicons name={stat.icon as "time-outline"} size={12} color={MUTED} />
        <Text style={styles.statLabel} numberOfLines={1}>
          {stat.label}
        </Text>
      </View>
      <Text
        style={[styles.statValue, stat.valueFlexible && styles.statValueFlex]}
        numberOfLines={stat.valueFlexible ? 2 : 1}
        adjustsFontSizeToFit={!stat.valueFlexible}
        minimumFontScale={0.75}
      >
        {stat.value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: PANEL_BG,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 10,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  topLeft: { flex: 1, alignItems: "center", minWidth: 0 },
  liveDotWrap: { width: 16, height: 16, marginEnd: 8, justifyContent: "center", alignItems: "center" },
  liveDotPing: {
    position: "absolute",
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(15, 91, 99, 0.25)",
  },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  liveLabel: {
    flex: 1,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.0,
    textTransform: "uppercase",
  },
  rerouteChip: {
    maxWidth: "55%",
    marginStart: 8,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 20,
    backgroundColor: "rgba(251, 191, 36, 0.2)",
  },
  rerouteChipText: { fontSize: 11, fontWeight: "700", color: "#92400e" },
  statsRow: { flexDirection: "row", gap: 8, marginBottom: 8 },
  statTile: {
    flex: 1,
    minWidth: 0,
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 8,
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "rgba(100, 116, 139, 0.2)",
  },
  statTileHi: { overflow: "hidden" },
  statHiGlow: {
    position: "absolute",
    top: -16,
    end: -16,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  statLabelRow: { alignItems: "center", marginBottom: 4, gap: 4 },
  statLabel: {
    flex: 1,
    fontSize: 9,
    fontWeight: "700",
    color: MUTED,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  statLabelHi: { color: "rgba(255,255,255,0.85)" },
  statValue: { fontSize: 17, fontWeight: "800", color: "#0f172a", letterSpacing: -0.3 },
  statValueHi: { color: "#fff" },
  statValueFlex: { fontSize: 14, lineHeight: 18, fontWeight: "700" },
  metaLine: { fontSize: 12, color: "#94a3b8", textAlign: "center", marginBottom: 4, fontWeight: "600" },
  progressBlock: { marginTop: 6 },
  progressTrack: {
    position: "relative",
    height: 6,
    borderRadius: 4,
    backgroundColor: "#E2E8F0",
    overflow: "visible",
  },
  progressFill: { height: "100%", borderRadius: 4 },
  progressDotStart: {
    position: "absolute",
    left: 0,
    top: "50%",
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: -5,
    marginLeft: -5,
    borderWidth: 3,
  },
  progressDotMoving: {
    position: "absolute",
    top: "50%",
    width: 12,
    height: 12,
    borderRadius: 6,
    marginTop: -6,
    marginLeft: -6,
    borderWidth: 3,
    zIndex: 2,
  },
  progressDotEnd: {
    position: "absolute",
    right: 0,
    top: "50%",
    width: 22,
    height: 22,
    borderRadius: 11,
    marginTop: -11,
    marginRight: -11,
    borderWidth: 3,
    alignItems: "center",
    justifyContent: "center",
  },
  progressLabels: {
    marginTop: 10,
    alignItems: "center",
    justifyContent: "space-between",
  },
  legPill: { flex: 1, alignItems: "center", gap: 4, minWidth: 0 },
  legDot: { width: 5, height: 5, borderRadius: 2.5 },
  legText: { fontSize: 10, color: "#64748B", fontWeight: "600", flexShrink: 1 },
  pctText: { fontSize: 11, color: "#0f172a", fontWeight: "800", marginHorizontal: 4 },
  footNote: { fontSize: 11, color: "#94a3b8", textAlign: "center", marginTop: 6, lineHeight: 15 },
  childrenSlot: { marginTop: 8 },
});

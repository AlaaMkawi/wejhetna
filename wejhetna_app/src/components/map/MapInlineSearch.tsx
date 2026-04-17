import React, { useRef, useState, useCallback, type ReactNode } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  FlatList,
  ActivityIndicator,
  Keyboard,
  Dimensions,
  Platform,
  type ListRenderItem,
} from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import type { PlaceForMap } from "../../api/places";

function SearchResultSeparator() {
  return <View style={sepStyles.line} />;
}

const sepStyles = StyleSheet.create({
  line: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#E8EAED",
    marginLeft: 16,
  },
});

const { height: SCREEN_H } = Dimensions.get("window");
const DROPDOWN_MAX_H = Math.min(400, SCREEN_H * 0.46);

export type MapInlineSearchProps = {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  locationLoading?: boolean;
  results: PlaceForMap[];
  getResultTitle: (place: PlaceForMap) => string;
  getResultSubtitle?: (place: PlaceForMap) => string | undefined;
  onSelectPlace: (place: PlaceForMap) => void;
  emptyHint: string;
  noResultsText: string;
  /** Offset from top of screen (below status bar) */
  topOffset?: number;
  /** Called when the search field is focused (e.g. dismiss place details panel). */
  onSearchFocus?: () => void;
  /** Optional row under the search field (e.g. quick filter / map mode). */
  secondaryRow?: ReactNode;
};

export default function MapInlineSearch({
  value,
  onChangeText,
  placeholder,
  locationLoading,
  results,
  getResultTitle,
  getResultSubtitle,
  onSelectPlace,
  emptyHint,
  noResultsText,
  topOffset = 50,
  onSearchFocus,
  secondaryRow,
}: MapInlineSearchProps) {
  const [focused, setFocused] = useState(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelBlurTimer = () => {
    if (blurTimer.current) {
      clearTimeout(blurTimer.current);
      blurTimer.current = null;
    }
  };

  const handleFocus = () => {
    cancelBlurTimer();
    onSearchFocus?.();
    setFocused(true);
  };

  const handleBlur = () => {
    cancelBlurTimer();
    blurTimer.current = setTimeout(() => setFocused(false), 240);
  };

  const dismiss = useCallback(() => {
    cancelBlurTimer();
    Keyboard.dismiss();
    setFocused(false);
  }, []);

  const handleSelect = (place: PlaceForMap) => {
    cancelBlurTimer();
    Keyboard.dismiss();
    setFocused(false);
    onSelectPlace(place);
  };

  const renderItem: ListRenderItem<PlaceForMap> = ({ item }) => {
    const subtitle = getResultSubtitle?.(item);
    return (
      <Pressable
        onPress={() => handleSelect(item)}
        style={({ pressed }) => [styles.resultRow, pressed && styles.resultRowPressed]}
        android_ripple={{ color: "rgba(15,91,99,0.1)" }}
      >
        <View style={styles.resultRowInner}>
          <View style={styles.resultTextCol}>
            <Text style={styles.resultTitle} numberOfLines={2}>
              {getResultTitle(item)}
            </Text>
            {subtitle ? (
              <Text style={styles.resultSubtitle} numberOfLines={1}>
                {subtitle}
              </Text>
            ) : null}
          </View>
          <Ionicons name="chevron-forward" size={18} color="#BDC1C6" />
        </View>
      </Pressable>
    );
  };

  const showDropdown = focused;
  const q = value.trim();
  const showList = q.length > 0 && results.length > 0;

  return (
    <>
      {showDropdown && (
        <Pressable
          style={styles.backdrop}
          onPress={dismiss}
          accessibilityRole="button"
          accessibilityLabel="Close search"
        />
      )}
      <View style={[styles.column, { top: topOffset }]} pointerEvents="box-none">
        <View style={[styles.searchShell, showDropdown && styles.searchShellFocused]}>
          <Ionicons name="search" size={20} color={showDropdown ? "#0f5b63" : "#5F6368"} />
          <TextInput
            style={styles.input}
            placeholder={placeholder}
            placeholderTextColor="#80868B"
            value={value}
            onChangeText={onChangeText}
            onFocus={handleFocus}
            onBlur={handleBlur}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
          />
          {value.length > 0 ? (
            <Pressable
              onPress={() => onChangeText("")}
              hitSlop={12}
              style={styles.clearHit}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
            >
              <Ionicons name="close-circle" size={22} color="#9AA0A6" />
            </Pressable>
          ) : null}
          {locationLoading ? (
            <ActivityIndicator size="small" color="#0f5b63" style={styles.inlineLoader} />
          ) : null}
        </View>

        {secondaryRow ? <View style={styles.secondaryRowWrap}>{secondaryRow}</View> : null}

        {showDropdown && (
          <View style={styles.dropdown}>
            {q.length === 0 && (
              <View style={styles.hintPad}>
                <Text style={styles.hint}>{emptyHint}</Text>
              </View>
            )}
            {q.length > 0 && results.length === 0 && (
              <View style={styles.hintPad}>
                <Text style={styles.hint}>{noResultsText}</Text>
              </View>
            )}
            {showList && (
              <FlatList
                data={results}
                keyExtractor={(item) => String(item.id)}
                renderItem={renderItem}
                keyboardShouldPersistTaps="handled"
                style={{ maxHeight: DROPDOWN_MAX_H }}
                nestedScrollEnabled
                maxToRenderPerBatch={14}
                windowSize={7}
                ItemSeparatorComponent={SearchResultSeparator}
              />
            )}
          </View>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.32)",
    zIndex: 900,
  },
  column: {
    position: "absolute",
    left: 16,
    right: 16,
    zIndex: 1000,
  },
  searchShell: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    paddingHorizontal: 14,
    minHeight: 50,
    borderWidth: 1.5,
    borderColor: "rgba(0,0,0,0.06)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  searchShellFocused: {
    borderColor: "rgba(15, 91, 99, 0.42)",
    shadowOpacity: 0.14,
    shadowRadius: 16,
    elevation: 10,
  },
  secondaryRowWrap: {
    marginTop: 8,
  },
  input: {
    flex: 1,
    marginLeft: 10,
    fontSize: 16,
    color: "#202124",
    paddingVertical: Platform.OS === "ios" ? 13 : 11,
  },
  clearHit: {
    marginLeft: 4,
    padding: 2,
  },
  inlineLoader: {
    marginLeft: 8,
  },
  dropdown: {
    marginTop: 10,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 14,
  },
  hintPad: {
    paddingVertical: 28,
    paddingHorizontal: 18,
  },
  hint: {
    fontSize: 15,
    color: "#5F6368",
    textAlign: "center",
    lineHeight: 22,
  },
  resultRow: {
    backgroundColor: "#FFFFFF",
  },
  resultRowPressed: {
    backgroundColor: "#F1F3F4",
  },
  resultRowInner: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    paddingRight: 12,
  },
  resultTextCol: {
    flex: 1,
    marginRight: 8,
  },
  resultTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#202124",
    letterSpacing: -0.2,
  },
  resultSubtitle: {
    marginTop: 4,
    fontSize: 14,
    color: "#5F6368",
  },
});

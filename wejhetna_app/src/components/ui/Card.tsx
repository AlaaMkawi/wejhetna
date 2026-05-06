import React from "react";
import { StyleSheet, View, ViewProps, ViewStyle } from "react-native";
import { Colors, Radius, Shadow, Spacing } from "../../theme";

/**
 * Base card surface used across the app.
 *
 * Keeps cards visually consistent: white surface, soft border, rounded corners,
 * and a subtle elevation so they lift slightly off the neutral background.
 *
 * Variants:
 *  - "flat"     → no shadow, just border (for dense lists, stacked rows)
 *  - "soft"     → default — soft shadow + border (most cards)
 *  - "elevated" → stronger shadow, no border (modals, feature surfaces)
 */
export type CardVariant = "flat" | "soft" | "elevated";

export type CardProps = ViewProps & {
  variant?: CardVariant;
  padding?: keyof typeof Spacing | number;
  style?: ViewStyle | ViewStyle[];
};

export function Card({
  variant = "soft",
  padding = "lg",
  style,
  children,
  ...rest
}: CardProps) {
  const paddingValue =
    typeof padding === "number" ? padding : Spacing[padding];

  return (
    <View
      {...rest}
      style={[
        styles.base,
        styles[variant],
        { padding: paddingValue },
        style as ViewStyle,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
  },
  flat: {
    borderWidth: 1,
    borderColor: Colors.border,
  },
  soft: {
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.soft,
  },
  elevated: {
    ...Shadow.card,
  },
});

export default Card;

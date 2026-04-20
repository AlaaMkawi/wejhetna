import React from "react";
import { StyleSheet, Text } from "react-native";

type Props = {
  failedAttempts: number;
  labelTwoRemaining: string;
  labelOneRemaining: string;
};

/**
 * Shared copy for driver + passenger OTP blocks: 2 attempts, then 1 after first wrong.
 * `failedAttempts` is server count after a wrong submit (0 = none wrong yet).
 */
export function RideVerificationAttemptHint({
  failedAttempts,
  labelTwoRemaining,
  labelOneRemaining,
}: Props) {
  return (
    <Text style={styles.hint}>
      {failedAttempts >= 1 ? labelOneRemaining : labelTwoRemaining}
    </Text>
  );
}

const styles = StyleSheet.create({
  hint: {
    fontSize: 13,
    color: "#555",
    textAlign: "center",
    lineHeight: 18,
    marginBottom: 4,
  },
});

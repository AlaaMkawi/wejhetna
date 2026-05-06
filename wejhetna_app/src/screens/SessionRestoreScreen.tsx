import React, { useEffect } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { CommonActions, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/types";
import { notifyUserLoggedIn, notifyUserLoggedOut } from "../utils/locationSession";
import { resolveSessionRestore } from "../utils/sessionRestore";

const DARK_TEAL = "#0f5b63";

/**
 * First screen on cold start. Restores a persisted session from AsyncStorage
 * (same keys written on successful login) and resets navigation to the main
 * app — matching normal mobile "stay logged in" behavior until explicit logout
 * or server-side invalidation.
 */
export default function SessionRestoreScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const outcome = await resolveSessionRestore();
        if (cancelled) return;

        if (outcome.kind === "go_home") {
          notifyUserLoggedOut();
          navigation.dispatch(
            CommonActions.reset({
              index: 0,
              routes: [{ name: "Home" }],
            })
          );
          return;
        }

        notifyUserLoggedIn();

        if (outcome.kind === "go_admin_tabs") {
          navigation.dispatch(
            CommonActions.reset({
              index: 0,
              routes: [
                {
                  name: "AdminTabs",
                  params: { adminUserId: outcome.userId, role: "ADMIN" },
                },
              ],
            })
          );
        } else {
          navigation.dispatch(
            CommonActions.reset({
              index: 0,
              routes: [{ name: "UserTabs" }],
            })
          );
        }
      } catch {
        if (!cancelled) {
          notifyUserLoggedOut();
          navigation.dispatch(
            CommonActions.reset({
              index: 0,
              routes: [{ name: "Home" }],
            })
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [navigation]);

  return (
    <View style={styles.container} accessibilityLabel="Session restore">
      <ActivityIndicator size="large" color={DARK_TEAL} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F2F2F7",
  },
});

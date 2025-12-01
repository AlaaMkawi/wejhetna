// src/screens/RegularAccount/RegularHomeScreen.tsx

import React from "react";
import { View, Text, StyleSheet, Button } from "react-native";

type Props = {
  navigation: any;
};

const BASE_COLOR = "#9bd3d8";

export default function RegularHomeScreen({ navigation }: Props) {
  return (
    <View style={styles.root}>
      <View style={styles.card}>
        <Text style={styles.title}>Regular User Home</Text>
        <Text style={styles.subtitle}>
          You are logged in as a regular user / driver.
        </Text>

        <Text style={styles.text}>
          Later we can put the map, rides and requests here.
        </Text>

        <View style={{ marginTop: 24 }}>
          <Button
            title="Log out"
            onPress={() =>
              navigation.reset({
                index: 0,
                routes: [{ name: "Home" }], // back to welcome screen
              })
            }
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BASE_COLOR,
    justifyContent: "center",
    alignItems: "center",
  },
  card: {
    width: "85%",
    backgroundColor: "#fff",
    borderRadius: 24,
    paddingHorizontal: 24,
    paddingVertical: 32,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: "#555",
    textAlign: "center",
    marginBottom: 16,
  },
  text: {
    fontSize: 14,
    color: "#444",
    textAlign: "center",
  },
});

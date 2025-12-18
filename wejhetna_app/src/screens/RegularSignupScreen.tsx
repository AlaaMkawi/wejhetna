import React from "react";
import { View, StyleSheet } from "react-native";
import RegularSignupForm from "./RegularSignupForm";

export default function RegularSignupScreen({ route }: any) {
  const email = route?.params?.email;

  return (
    <View style={styles.container}>
      <RegularSignupForm verifiedEmail={email} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: "#fff",
  },
});

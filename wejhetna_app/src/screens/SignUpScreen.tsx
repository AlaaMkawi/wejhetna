import React, { useState } from "react";
import { View, Text, Button, StyleSheet, ScrollView } from "react-native";
import RegularSignupForm from "./RegularSignupForm";
import DriverSignupForm from "./DriverSignupForm";

export default function SignUpScreen() {
  const [type, setType] = useState<"choose" | "regular" | "driver">("choose");

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Sign Up</Text>

      {type === "choose" && (
        <>
          <Button title="Regular User" onPress={() => setType("regular")} />
          <View style={{ height: 12 }} />
          <Button title="Driver" onPress={() => setType("driver")} />
        </>
      )}

      {type === "regular" && <RegularSignupForm onBack={() => setType("choose")} />}

      {type === "driver" && <DriverSignupForm onBack={() => setType("choose")} />}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    paddingBottom: 40,
  },
  title: {
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 20,
    textAlign: "center",
  },
});

import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";

interface AccordionProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  icon?: string;
}


export default function Accordion({
  title,
  children,
  defaultOpen = false,
  icon,
}: AccordionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const toggleAccordion = () => {
    setIsOpen(!isOpen);
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.header}
        onPress={toggleAccordion}
        activeOpacity={0.7}
      >
        <View style={styles.headerContent}>
          {icon && (
            <Ionicons
              name={icon as any}
              size={22}
              color="#666"
              style={styles.icon}
            />
          )}
          <Text style={styles.title}>{title}</Text>
        </View>
      </TouchableOpacity>

      {isOpen && (
        <View style={styles.content}>
          {children}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 20,
    backgroundColor: "#ffffff",
  },
  headerContent: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  icon: {
    marginRight: 16,
  },
  title: {
    fontSize: 16,
    fontWeight: "500",
    color: "#333",
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    backgroundColor: "#ffffff",
  },
});


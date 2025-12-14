import React from "react";
import { useTranslation } from "react-i18next";
import LanguageSwitcher from "../components/LanguageSwitcher";

import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ImageBackground, 
  StatusBar,       
  Dimensions,  
  I18nManager,    
} from "react-native";

type Props = {
  navigation: any;
};

const { width, height } = Dimensions.get("window");
const DARK_TEAL = "#0f5b63"; 

export default function HomeScreen({ navigation }: Props) {
  const { t } = useTranslation();

  return (
   
    <ImageBackground
      source={require("../../assets/wejhetna-logo.png")} 
      style={styles.backgroundImage}
      blurRadius={3} // Fog effect
      resizeMode="stretch"
    >
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      
      {/* 2. Main Content Container */}
      <View style={styles.container}>
        
        {/* Language Switcher (Top Right) */}
        <View style={styles.langWrapper}>
            <LanguageSwitcher />
        </View>

        {/* 3. Floating Logo Area (Centered) */}
        <View style={styles.logoArea}>
          <Image
            source={require("../../assets/wejhetna-logo.png")}
            style={styles.logo}
            resizeMode="contain"
          />
          <Text style={styles.appName}>Wejhetna</Text>
        </View>

        {/* 4. Floating Buttons (Bottom) */}
        <View style={styles.buttonsContainer}>
          
          {/* Login - Glowing Pill */}
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => navigation.navigate("Login")}
          >
            <Text style={styles.primaryButtonText}>{t("login")}</Text>
          </TouchableOpacity>

          {/* Create Account - Glass Border Pill */}
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => navigation.navigate("SignUp")}
          >
            <Text style={styles.secondaryButtonText}>{t("create_account")}</Text>
          </TouchableOpacity>
        </View>

      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  backgroundImage: {
    flex: 1,
    width: width,
    height: height,
  },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingBottom: 60, 
  },
  langWrapper: {
   position: "absolute",
    top: 50,     
    zIndex: 1000,
    left: I18nManager.isRTL ? 24 : undefined, 
    right: I18nManager.isRTL ? undefined : 24,
    alignItems: "flex-end",
  },
  
  logoArea: {
    flex:1,
    alignItems: "center",
    justifyContent: "center",
  },
  logo: {
    width: 140,    
    height: 140,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
  },
  appName: {
    fontSize: 36,
    fontWeight: "800",
    color: DARK_TEAL,
    letterSpacing: 1,
    textShadowColor: 'rgba(0, 0, 0, 0.1)',
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 10,
  },

  buttonsContainer: {
    gap: 20, 
    width: "100%",
    justifyContent: "flex-end",
  },
  
 
  primaryButton: {
    backgroundColor: DARK_TEAL,
    paddingVertical: 18,
    borderRadius: 50, 
    alignItems: "center",
    width: "100%",
    
    shadowColor: DARK_TEAL,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 15,
    elevation: 10,
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
  },

  secondaryButton: {
    paddingVertical: 18,
    borderRadius: 50, 
    borderWidth: 2,   
    borderColor: DARK_TEAL,
    alignItems: "center",
    backgroundColor: "transparent", 
    width: "100%",
  },
  secondaryButtonText: {
    color: DARK_TEAL,
    fontSize: 18,
    fontWeight: "700",
  },
});
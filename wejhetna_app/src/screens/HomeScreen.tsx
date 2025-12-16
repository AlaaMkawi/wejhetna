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
const SOFT_TEAL = "#3a8d96";
// Watercolor palette - soft, transparent colors (less blue, more green/mint)
const WATERCOLOR_MINT = "rgba(155, 211, 216, 0.5)"; // Soft mint green
const WATERCOLOR_SAGE = "rgba(140, 180, 170, 0.45)"; // Sage green
const WATERCOLOR_AQUA = "rgba(120, 200, 190, 0.4)"; // Aqua green
const WATERCOLOR_PALE = "rgba(180, 220, 210, 0.35)"; // Pale green 

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
          
          {/* Login - Watercolor Button */}
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => navigation.navigate("Login")}
            activeOpacity={0.85}
          >
            {/* Watercolor layers for depth */}
            <View style={styles.watercolorBase}>
              <View style={styles.watercolorBaseLayer} />
              <View style={styles.watercolorLayer1} />
              <View style={styles.watercolorLayer2} />
              <View style={styles.watercolorLayer3} />
            </View>
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
    paddingVertical: 18,
    borderRadius: 30, 
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    overflow: "hidden",
    borderWidth: 1.5,
    borderColor: "rgba(155, 211, 216, 0.5)",
    shadowColor: "rgba(140, 180, 170, 0.4)",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 15,
    elevation: 8,
    position: "relative",
  },
  watercolorBase: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 30,
    overflow: "hidden",
  },
  watercolorBaseLayer: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    borderRadius: 30,
    backgroundColor: WATERCOLOR_MINT,
  },
  watercolorLayer1: {
    position: "absolute",
    top: 0,
    left: "30%",
    width: "70%",
    height: "100%",
    borderRadius: 30,
    backgroundColor: WATERCOLOR_SAGE,
  },
  watercolorLayer2: {
    position: "absolute",
    top: 0,
    right: 0,
    width: "60%",
    height: "100%",
    borderRadius: 30,
    backgroundColor: WATERCOLOR_AQUA,
  },
  watercolorLayer3: {
    position: "absolute",
    top: 0,
    left: "50%",
    width: "50%",
    height: "100%",
    borderRadius: 30,
    backgroundColor: WATERCOLOR_PALE,
  },
  primaryButtonText: {
    color: DARK_TEAL,
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: 0.5,
    textShadowColor: "rgba(255, 255, 255, 0.8)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
    zIndex: 10,
  },

  secondaryButton: {
    paddingVertical: 18,
    borderRadius: 30, 
    borderWidth: 2,   
    borderColor: "rgba(255, 255, 255, 0.6)",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.35)", 
    width: "100%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
  secondaryButtonText: {
    color: DARK_TEAL,
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: I18nManager.isRTL ? 0 : 0.5,
    textDecorationLine: "none",
    textShadowColor: "transparent",
    includeFontPadding: false,
   lineHeight: 24,

  },
});
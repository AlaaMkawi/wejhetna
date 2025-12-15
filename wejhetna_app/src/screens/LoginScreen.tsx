import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Linking,
  ImageBackground, 
  StatusBar,      
  Dimensions,     
  KeyboardAvoidingView, 
  Platform
} from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";

const API_BASE_URL = "http://10.0.2.2:8000";
const { width, height } = Dimensions.get("window");

type Props = {
  navigation: any;
};

const MINT = "#9bd3d8";
const DARK_TEAL ="#0f5b63";
const CALM_OCEAN = "#3a8d96";

export default function LoginScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const [usernameOrEmail, setUsernameOrEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    setError(null);

    if (!usernameOrEmail.trim() || !password.trim()) {
      setError(t("login_missing_fields"));
      return;
    }

    setLoading(true);
    try {
      const body = {
        username_or_email: usernameOrEmail.trim(),
        password: password.trim(),
      };

      const res = await fetch(`${API_BASE_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        let message = t("invalid_credentials");
        if (typeof data === "string") message = data;
        else if (typeof data?.detail === "string") message = data.detail;
        else if (Array.isArray(data?.detail)) {
          message = data.detail
            .map((e: any) => {
              const loc = Array.isArray(e.loc) ? e.loc.join(" → ") : "";
              return loc ? `${loc}: ${e.msg}` : e.msg || "";
            })
            .join("\n");
        }

        setError(message);
        return;
      }

      const role = data.role;
      const status = data.status;
      const userId = data.id;

      if (role === "ADMIN") {
        if (status !== "ACTIVE") {
          setError(t("admin_not_active"));
          return;
        }
        navigation.reset({
          index: 0,
          routes: [
            {
              name: "AdminTabs",
              params: { adminUserId: userId, role: "ADMIN" },
            },
          ],
        });
      } else {
        if (status !== "ACTIVE") {
          setError(t("account_not_active"));
          return;
        }
        navigation.reset({
          index: 0,
          routes: [{ name: "RegularHome" }],
        });
      }
    } catch (e: any) {
      setError(t("network_error") + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleContactEmail = () => {
    Linking.openURL("mailto:wejhetna.app@gmail.com").catch(() => {});
  };

  return (
    
        <ImageBackground
      source={require("../../assets/wejhetna-logo.png")} 
      style={styles.backgroundImage}
      blurRadius={3} 
      resizeMode="stretch"
    >
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      
      {/* Dark overlay to ensure text is readable on top of the image */}
      <View style={styles.overlay}>
        
        <KeyboardAvoidingView 
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={styles.keyboardContainer}
        >

            {/* Header Area */}
            <View style={styles.headerContainer}>
                <Text style={styles.logoText}>Wejhetna</Text>
                <Text style={styles.welcome}>{t("welcome_back")}</Text>
            </View>

            {/* Glass Card */}
            <View style={styles.glassCard}>
                <Text style={styles.title}>{t("login")}</Text>

               {/* Username Input with Icon */}
                <View style={styles.inputRow}>
                   {/* Input takes up the empty space */}
                   <TextInput
                       style={styles.inputFlex}
                       placeholder={t("username_or_email")}
                       value={usernameOrEmail}
                       onChangeText={setUsernameOrEmail}
                       autoCapitalize="none"
                       placeholderTextColor="#66838a"
                   />
                   {/* Icon sits on the Right side */}
                   <Ionicons 
                       name="person-outline" 
                       size={20} 
                       color="#0f5b63" 
                       style={{ marginLeft: 10 }} 
                   />
                </View>

                {/* Password Input with Icons */}
                <View style={styles.inputRow}>
                    {/* Eye Button on the Left */}
                    <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                        <Ionicons 
                            name={showPassword ? "eye-off" : "eye"} 
                            size={20} 
                            color="#66838a" 
                        />
                    </TouchableOpacity>

                    {/* Password Field in the middle */}
                    <TextInput
                        style={styles.inputFlex}
                        placeholder={t("password")}
                        secureTextEntry={!showPassword}
                        value={password}
                        onChangeText={setPassword}
                        placeholderTextColor="#66838a"
                    />

                    {/* Lock Icon on the Right */}
                    <Ionicons 
                        name="lock-closed-outline" 
                        size={20} 
                        color="#0f5b63" 
                        style={{ marginLeft: 10 }} 
                    />
                </View>

                {error && <Text style={styles.error}>{error}</Text>}

                {/* Login button */}
                <TouchableOpacity
                    style={styles.primaryButton}
                    onPress={handleLogin}
                    disabled={loading}
                >
                    {loading ? (
                    <ActivityIndicator color="#fff" />
                    ) : (
                    <Text style={styles.primaryButtonText}>{t("login")}</Text>
                    )}
                </TouchableOpacity>

                {/* New user? */}
                <View style={styles.newUserRow}>
                    <Text style={styles.newUserText}>{t("new_user_question_")}</Text>
                    <TouchableOpacity onPress={() => navigation.navigate("SignUp")}>
                    <Text style={styles.signUpText}>{t("sign_up")}</Text>
                    </TouchableOpacity>
                </View>
            </View>

            {/* Footer */}
            <View style={styles.footer}>
                <Text style={styles.contactText}>{t("contact_us")}</Text>
                <TouchableOpacity
                    onPress={handleContactEmail}
                    style={styles.gmailIconBtn}
                >
                    <Ionicons name="mail" size={20} color="#ffffff" />
                </TouchableOpacity>
            </View>

        </KeyboardAvoidingView>
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
  overlay: {
    flex: 1,
    backgroundColor: 'transparent', 
    justifyContent: 'center',
  },
  keyboardContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  headerContainer: {
    alignItems: "center",
    marginBottom: 40,
  },
  logoText: {
    fontSize: 32,
    fontWeight: "800",
    color: DARK_TEAL,
    marginBottom: 6,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  welcome: {
    fontSize: 18,
    color: "#5c7c82",
    fontWeight: "500",
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  glassCard: {
    backgroundColor: "transparent", 
    width: "100%",
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderWidth: 0,
    shadowOpacity: 0,
    elevation: 0,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: DARK_TEAL,
    textAlign: "center",
    marginBottom: 24,
  },
 input: {
    backgroundColor: "transparent", 
    borderBottomWidth: 1,           
    borderBottomColor: "#5c7c82",  
    paddingHorizontal: 0,          
    marginBottom: 20,               
    fontSize: 16,
    color: "#0f5b63",               
    textAlign: "right",             
  },
  inputRight: {
    textAlign: "right",
  },
 passwordContainer: {
    flexDirection: "row-reverse",   
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "transparent", 
    borderBottomWidth: 1,           
    borderBottomColor: "#5c7c82",
    paddingHorizontal: 0,
    marginBottom: 10,
  },
  passwordInput: {
    flex: 1,
    textAlign: "right",
    paddingVertical: 10,
    fontSize: 16,
    color: "#0f5b63", 
    marginRight: 0,   
  },

  eyeButton: {
    padding: 8,
    marginLeft: 0,
  },
  error: {
    color: "#d7263d",
    textAlign: "center",
    marginTop: 6,
    marginBottom: 10,
    fontSize: 13,
  },
  primaryButton: {
    marginTop: 30,
    backgroundColor:"rgba(255, 255, 255, 0.16)",
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: "center",
    width: "100%",
    alignSelf: "center",
    borderWidth:1,
    shadowColor:"rgba(255, 255, 255, 0.6)",
    shadowOffset: {
        width: 0,
        height: 10,
    },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 12,
    
  },
  primaryButtonText: {
    color: DARK_TEAL,
    fontSize: 16,
    fontWeight: "700",
    letterSpacing:0.5,
    textTransform: "none",
    textShadowColor: "rgba(0, 0, 0, 0.15)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
  },
  newUserRow: {
    marginTop: 20,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  newUserText: {
    fontSize: 14,
    color: "#5c7c82",
  },
  signUpText: {
    fontSize: 14,
    color: DARK_TEAL,
    fontWeight: "800",
    marginHorizontal: 4,
  },
  footer: {
    marginTop: 40,
    alignItems: "center",
  },
  contactText: {
    fontSize: 13,
    color: "#5c7c82", 
    marginBottom: 8,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  gmailIconBtn: {
    padding: 10,
    borderRadius: 50,
    backgroundColor: "#b8c6c9ff", 
    borderWidth: 1,
    borderColor: "#5c7c82",
  },
  
  inputRow: {
    flexDirection: 'row',        
    alignItems: 'center',       
    borderBottomWidth: 1,        
    borderBottomColor: "#5c7c82",
    marginBottom: 20,
    paddingVertical: 10,
  },
  inputFlex: {
    flex: 1,                    
    textAlign: 'right',          
    fontSize: 16,
    color: "#0f5b63",
    padding: 0,
  },
});
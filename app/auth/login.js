import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import {
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { doc, getDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import { useEffect, useState } from "react";
import {
  Alert,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { auth, db } from "../../config/firebase";

const BIOMETRIC_ENABLED_KEY = "biometric_enabled";
const BIOMETRIC_EMAIL_KEY = "biometric_email";
const BIOMETRIC_PASSWORD_KEY = "biometric_password";

export default function LoginScreen() {
  const router = useRouter();
  const { width, height } = useWindowDimensions();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [loginError, setLoginError] = useState("");

  const [fpOpen, setFpOpen] = useState(false);
  const [fpEmail, setFpEmail] = useState("");
  const [fpLoading, setFpLoading] = useState(false);

  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);

  useEffect(() => {
    checkBiometricStatus();
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      console.log("AUTH STATE CHANGED:", user ? user.email : "NO USER");
    });

    return unsubscribe;
  }, []);

  const routeByRole = (role) => {
    if (role === "admin") {
      router.replace("/admin");
    } else if (role === "service_provider") {
      router.replace("/service_provider");
    } else {
      router.replace("/users");
    }
  };

  const resolveAndRouteUser = async (uid, fallbackEmail = "") => {
    const userRef = doc(db, "users", uid);
    const snap = await getDoc(userRef);

    if (!snap.exists()) {
      throw new Error("Your profile is not set up yet. Please contact admin.");
    }

    const data = snap.data() || {};
    const rawRole =
      typeof data.role === "string" ? data.role.trim().toLowerCase() : "user";

    let userRole = "user";

    if (rawRole === "admin") {
      userRole = "admin";
    } else if (
      rawRole === "service_provider" ||
      rawRole === "service provider"
    ) {
      userRole = "service_provider";
    }

    await updateDoc(userRef, {
      email: auth.currentUser?.email || fallbackEmail || data.email || "",
      lastLoginAt: serverTimestamp(),
      active: true,
    });

    routeByRole(userRole);
  };

  const checkBiometricStatus = async () => {
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      const enabled = await SecureStore.getItemAsync(BIOMETRIC_ENABLED_KEY);
      const savedEmail = await SecureStore.getItemAsync(BIOMETRIC_EMAIL_KEY);
      const savedPassword = await SecureStore.getItemAsync(BIOMETRIC_PASSWORD_KEY);

      const available = !!hasHardware && !!isEnrolled;
      const enabledForUser =
        enabled === "true" && !!savedEmail && !!savedPassword;

      setBiometricAvailable(available);
      setBiometricEnabled(enabledForUser);

      if (savedEmail) {
        setEmail(savedEmail);
      }
    } catch (error) {
      console.log("BIOMETRIC STATUS ERROR:", error?.message);
      setBiometricAvailable(false);
      setBiometricEnabled(false);
    }
  };

  const saveBiometricPreference = async (userEmail, userPassword) => {
    try {
      await SecureStore.setItemAsync(BIOMETRIC_ENABLED_KEY, "true");
      await SecureStore.setItemAsync(
        BIOMETRIC_EMAIL_KEY,
        (userEmail || "").trim().toLowerCase()
      );
      await SecureStore.setItemAsync(BIOMETRIC_PASSWORD_KEY, userPassword || "");
      setBiometricEnabled(true);
    } catch (error) {
      console.log("SAVE BIOMETRIC ERROR:", error?.message);
    }
  };

  const disableBiometricPreference = async () => {
    try {
      await SecureStore.deleteItemAsync(BIOMETRIC_ENABLED_KEY);
      await SecureStore.deleteItemAsync(BIOMETRIC_EMAIL_KEY);
      await SecureStore.deleteItemAsync(BIOMETRIC_PASSWORD_KEY);
      setBiometricEnabled(false);
    } catch (error) {
      console.log("DISABLE BIOMETRIC ERROR:", error?.message);
    }
  };

  const askToEnableBiometric = async (userEmail, userPassword) => {
    if (!biometricAvailable) return;

    Alert.alert(
      "Enable fingerprint login",
      "Would you like to use fingerprint next time on this device?",
      [
        { text: "Not now", style: "cancel" },
        {
          text: "Enable",
          onPress: async () => {
            await saveBiometricPreference(userEmail, userPassword);
          },
        },
      ]
    );
  };

  const onLogin = async () => {
    setLoginError("");

    const em = email.trim().toLowerCase();
    const pw = password.trim();

    if (!em || !pw) {
      setLoginError("Please enter your email and password.");
      return;
    }

    setLoading(true);

    try {
      const cred = await signInWithEmailAndPassword(auth, em, pw);
      const uid = cred.user.uid;

      await resolveAndRouteUser(uid, em);

      setTimeout(() => {
        askToEnableBiometric(em, pw);
      }, 300);
    } catch (e) {
      console.log("AUTH ERROR:", e?.code, e?.message);

      if (
        e?.code === "auth/invalid-credential" ||
        e?.code === "auth/wrong-password"
      ) {
        setLoginError("Incorrect email or password.");
      } else if (e?.code === "auth/user-not-found") {
        setLoginError("No account found with that email.");
      } else if (e?.code === "auth/invalid-email") {
        setLoginError("Enter a valid email address.");
      } else if (e?.code === "auth/too-many-requests") {
        setLoginError("Too many attempts. Try again later.");
      } else {
        setLoginError(e?.message || "Login failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const onBiometricLogin = async () => {
    setLoginError("");
    setBiometricLoading(true);

    try {
      const enabled = await SecureStore.getItemAsync(BIOMETRIC_ENABLED_KEY);
      const savedEmail = await SecureStore.getItemAsync(BIOMETRIC_EMAIL_KEY);
      const savedPassword = await SecureStore.getItemAsync(BIOMETRIC_PASSWORD_KEY);

      if (enabled !== "true" || !savedEmail || !savedPassword) {
        Alert.alert(
          "Fingerprint not enabled",
          "Please sign in with your email and password first."
        );
        return;
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Login with fingerprint",
        fallbackLabel: "Use passcode",
        disableDeviceFallback: false,
        cancelLabel: "Cancel",
      });

      if (!result.success) {
        if (result.error !== "user_cancel" && result.error !== "system_cancel") {
          Alert.alert("Authentication failed", "Fingerprint was not verified.");
        }
        return;
      }

      setEmail(savedEmail);

      const cred = await signInWithEmailAndPassword(
        auth,
        savedEmail,
        savedPassword
      );

      await resolveAndRouteUser(cred.user.uid, savedEmail);
    } catch (error) {
      console.log("BIOMETRIC LOGIN ERROR:", error?.code, error?.message);

      if (
        error?.code === "auth/invalid-credential" ||
        error?.code === "auth/wrong-password"
      ) {
        Alert.alert(
          "Fingerprint login failed",
          "Your saved login details are no longer valid. Please sign in with your email and password again."
        );
        await disableBiometricPreference();
      } else {
        Alert.alert("Error", error?.message || "Fingerprint login failed.");
      }
    } finally {
      setBiometricLoading(false);
    }
  };

  const onForgotPassword = async () => {
    const em = fpEmail.trim().toLowerCase();

    if (!em) {
      Alert.alert("Missing", "Enter your email");
      return;
    }

    setFpLoading(true);

    try {
      await sendPasswordResetEmail(auth, em);
      Alert.alert("Check your email", "A password reset link has been sent.");
      setFpOpen(false);
    } catch (e) {
      console.log("FORGOT ERROR:", e?.code, e?.message);

      if (e?.code === "auth/invalid-email") {
        Alert.alert("Invalid email", "Enter a valid email address.");
      } else if (e?.code === "auth/user-not-found") {
        Alert.alert("Not found", "No account exists with that email.");
      } else if (e?.code === "auth/too-many-requests") {
        Alert.alert("Too many attempts", "Try again later.");
      } else {
        Alert.alert("Failed", e?.message || "Try again");
      }
    } finally {
      setFpLoading(false);
    }
  };

  const openForgot = () => {
    setFpEmail(email.trim());
    setFpOpen(true);
  };

  const cardWidth = Math.min(width * 0.9, 420);
  const logoSize = Math.min(width * 0.2, 76);
  const titleSize = Math.max(28, Math.min(width * 0.08, 34));
  const subtitleSize = Math.max(13, Math.min(width * 0.036, 15));

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
      <StatusBar barStyle="light-content" />

      <LinearGradient
        colors={["#07111F", "#0E1B2E", "#10243A", "#15324A"]}
        style={styles.background}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <KeyboardAvoidingView
            style={styles.flex}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            keyboardVerticalOffset={Platform.OS === "ios" ? 20 : 0}
          >
            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={[
                styles.scrollContent,
                {
                  minHeight: height,
                  paddingHorizontal: Math.max(18, width * 0.05),
                  paddingVertical: Math.max(24, height * 0.035),
                },
              ]}
            >
              <View style={[styles.wrapper, { width: cardWidth }]}>
                <Pressable onPress={() => router.back()} style={styles.backButton}>
                  <Text style={styles.backText}>← Back</Text>
                </Pressable>

                <View style={styles.header}>
                  <View
                    style={[
                      styles.logoWrap,
                      {
                        width: logoSize + 14,
                        height: logoSize + 14,
                        borderRadius: (logoSize + 14) / 2,
                      },
                    ]}
                  >
                    <Image
                      source={require("../../assets/images/logo.png")}
                      style={{
                        width: logoSize,
                        height: logoSize,
                        borderRadius: logoSize / 2,
                      }}
                      resizeMode="cover"
                    />
                  </View>

                  <Text style={[styles.title, { fontSize: titleSize }]}>
                    Welcome back
                  </Text>

                  <Text style={[styles.subtitle, { fontSize: subtitleSize }]}>
                    Sign in to continue sharing, discovering, and selling artwork.
                  </Text>
                </View>

                <View style={styles.card}>
                  <View style={styles.form}>
                    <View style={styles.inputGroup}>
                      <Text style={styles.label}>Email address</Text>
                      <TextInput
                        style={[styles.input, !!loginError && styles.inputError]}
                        placeholder="Enter your email"
                        placeholderTextColor="#94A3B8"
                        autoCapitalize="none"
                        keyboardType="email-address"
                        value={email}
                        onChangeText={(t) => {
                          setEmail(t);
                          if (loginError) setLoginError("");
                        }}
                        returnKeyType="next"
                      />
                    </View>

                    <View style={styles.inputGroup}>
                      <Text style={styles.label}>Password</Text>
                      <TextInput
                        style={[styles.input, !!loginError && styles.inputError]}
                        placeholder="Enter your password"
                        placeholderTextColor="#94A3B8"
                        secureTextEntry
                        value={password}
                        onChangeText={(t) => {
                          setPassword(t);
                          if (loginError) setLoginError("");
                        }}
                        returnKeyType="done"
                      />
                    </View>

                    {!!loginError && (
                      <Text style={styles.inlineError}>{loginError}</Text>
                    )}

                    <Pressable onPress={openForgot} style={styles.forgotWrap}>
                      <Text style={styles.forgotText}>Forgot password?</Text>
                    </Pressable>

                    <Pressable
                      style={[styles.button, loading && styles.buttonDisabled]}
                      onPress={onLogin}
                      disabled={loading}
                    >
                      <Text style={styles.buttonText}>
                        {loading ? "Signing in..." : "Login"}
                      </Text>
                    </Pressable>

                    {biometricAvailable && biometricEnabled && (
                      <Pressable
                        style={[
                          styles.biometricButton,
                          biometricLoading && styles.buttonDisabled,
                        ]}
                        onPress={onBiometricLogin}
                        disabled={biometricLoading}
                      >
                        <Ionicons name="finger-print" size={22} color="#14B8A6" />
                        <Text style={styles.biometricButtonText}>
                          {biometricLoading
                            ? "Checking fingerprint..."
                            : "Login with fingerprint"}
                        </Text>
                      </Pressable>
                    )}

                    {biometricAvailable && biometricEnabled && (
                      <Pressable
                        onPress={async () => {
                          await disableBiometricPreference();
                          Alert.alert(
                            "Fingerprint disabled",
                            "Fingerprint login has been turned off for this device."
                          );
                        }}
                      >
                        <Text style={styles.disableBiometricText}>
                          Turn off fingerprint login
                        </Text>
                      </Pressable>
                    )}

                    <Pressable onPress={() => router.push("/auth/register")}>
                      <Text style={styles.footerText}>
                        Do not have an account? Create one
                      </Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </TouchableWithoutFeedback>

        <Modal
          transparent
          visible={fpOpen}
          animationType="fade"
          onRequestClose={() => setFpOpen(false)}
        >
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={styles.overlay}>
              <KeyboardAvoidingView
                behavior={Platform.OS === "ios" ? "padding" : "height"}
                style={styles.modalKeyboardWrap}
              >
                <View style={styles.modal}>
                  <Text style={styles.modalTitle}>Reset password</Text>
                  <Text style={styles.modalSubtitle}>
                    Enter your email address and we will send you a reset link.
                  </Text>

                  <TextInput
                    style={styles.modalInput}
                    placeholder="Email address"
                    placeholderTextColor="#94A3B8"
                    autoCapitalize="none"
                    keyboardType="email-address"
                    value={fpEmail}
                    onChangeText={setFpEmail}
                    returnKeyType="done"
                  />

                  <Pressable
                    style={[styles.modalButton, fpLoading && styles.buttonDisabled]}
                    onPress={onForgotPassword}
                    disabled={fpLoading}
                  >
                    <Text style={styles.modalButtonText}>
                      {fpLoading ? "Sending..." : "Send reset link"}
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={() => setFpOpen(false)}
                    style={styles.modalCancelButton}
                  >
                    <Text style={styles.modalCancelText}>Cancel</Text>
                  </Pressable>
                </View>
              </KeyboardAvoidingView>
            </View>
          </TouchableWithoutFeedback>
        </Modal>
      </LinearGradient>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    backgroundColor: "#07111F",
  },
  background: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  wrapper: {
    justifyContent: "center",
    width: "100%",
  },
  backButton: {
    alignSelf: "flex-start",
    marginBottom: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  backText: {
    color: "#F8FAFC",
    fontSize: 14,
    fontWeight: "700",
  },
  header: {
    alignItems: "center",
    marginBottom: 24,
  },
  logoWrap: {
    backgroundColor: "rgba(255,255,255,0.10)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 18,
  },
  title: {
    fontWeight: "900",
    color: "#FFFFFF",
    textAlign: "center",
    marginBottom: 10,
  },
  subtitle: {
    lineHeight: 21,
    color: "#CBD5E1",
    textAlign: "center",
    maxWidth: 340,
    paddingHorizontal: 8,
  },
  card: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 26,
    padding: 18,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 8,
  },
  form: {
    gap: 14,
  },
  inputGroup: {
    gap: 7,
  },
  label: {
    color: "#E2E8F0",
    fontSize: 13,
    fontWeight: "700",
    paddingLeft: 4,
  },
  input: {
    minHeight: 56,
    borderRadius: 18,
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 16,
    color: "#0F172A",
    fontSize: 14,
    fontWeight: "600",
    borderWidth: 1,
    borderColor: "transparent",
  },
  inputError: {
    borderColor: "#EF4444",
  },
  inlineError: {
    marginTop: -2,
    textAlign: "center",
    color: "#F87171",
    fontWeight: "800",
    fontSize: 13,
  },
  forgotWrap: {
    alignSelf: "center",
    marginTop: 2,
  },
  forgotText: {
    color: "#2DD4BF",
    fontWeight: "800",
    fontSize: 13,
  },
  button: {
    minHeight: 56,
    borderRadius: 18,
    backgroundColor: "#14B8A6",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  biometricButton: {
    minHeight: 54,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: "rgba(45,212,191,0.45)",
    backgroundColor: "rgba(255,255,255,0.04)",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
  },
  biometricButtonText: {
    color: "#D1FAE5",
    fontSize: 15,
    fontWeight: "800",
  },
  disableBiometricText: {
    marginTop: 2,
    textAlign: "center",
    color: "#94A3B8",
    fontWeight: "700",
    fontSize: 13,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  footerText: {
    marginTop: 8,
    textAlign: "center",
    color: "#CBD5E1",
    fontWeight: "700",
    fontSize: 14,
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(2,6,23,0.72)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  modalKeyboardWrap: {
    width: "100%",
    alignItems: "center",
  },
  modal: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 24,
    backgroundColor: "#F8FAFC",
    padding: 20,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: "900",
    color: "#0F172A",
    textAlign: "center",
  },
  modalSubtitle: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: "600",
    color: "#64748B",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 14,
  },
  modalInput: {
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: "#E2E8F0",
    paddingHorizontal: 14,
    color: "#0F172A",
    fontSize: 14,
    fontWeight: "600",
  },
  modalButton: {
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: "#14B8A6",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 14,
  },
  modalButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "900",
  },
  modalCancelButton: {
    paddingVertical: 12,
    marginTop: 6,
  },
  modalCancelText: {
    textAlign: "center",
    color: "#64748B",
    fontWeight: "800",
    fontSize: 14,
  },
});
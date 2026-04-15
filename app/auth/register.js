import { useRouter } from "expo-router";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { useState } from "react";
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  Keyboard,
  View,
  useWindowDimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import { auth, db } from "../../config/firebase";

export default function RegisterScreen() {
  const router = useRouter();
  const { width, height } = useWindowDimensions();

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("user");
  const [loading, setLoading] = useState(false);

  const onRegister = async () => {
    const trimmedName = displayName.trim();
    const trimmedEmail = email.trim();

    if (!trimmedName || !trimmedEmail || !password.trim()) {
      return Alert.alert("Missing", "Enter name, email and password");
    }

    if (password.length < 6) {
      return Alert.alert("Weak password", "Password must be at least 6 characters");
    }

    try {
      setLoading(true);

      const cred = await createUserWithEmailAndPassword(
        auth,
        trimmedEmail,
        password
      );

      await updateProfile(cred.user, { displayName: trimmedName });

      await setDoc(doc(db, "users", cred.user.uid), {
        active: true,
        displayName: trimmedName,
        email: trimmedEmail,
        role,
        createdAt: serverTimestamp(),
        lastLoginAt: serverTimestamp(),
      });

      if (role === "admin") {
        router.replace("/admin");
      } else if (role === "service_provider") {
        router.replace("/service_provider");
      } else {
        router.replace("/users");
      }
    } catch (e) {
      Alert.alert("Register failed", e?.message || "Try again");
    } finally {
      setLoading(false);
    }
  };

  const cardWidth = Math.min(width * 0.9, 420);
  const logoSize = Math.min(width * 0.2, 76);
  const titleSize = Math.max(28, Math.min(width * 0.08, 34));
  const subtitleSize = Math.max(13, Math.min(width * 0.036, 15));

  return (
    <SafeAreaView style={styles.safeArea}>
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
                    Create your account
                  </Text>

                  <Text style={[styles.subtitle, { fontSize: subtitleSize }]}>
                    Join a modern space for artists to share, discover, and sell artwork.
                  </Text>
                </View>

                <View style={styles.card}>
                  <View style={styles.roleSwitch}>
                    <Pressable
                      style={[styles.roleButton, role === "user" && styles.roleActive]}
                      onPress={() => setRole("user")}
                    >
                      <Text
                        style={[styles.roleText, role === "user" && styles.roleTextActive]}
                      >
                        User
                      </Text>
                    </Pressable>

                    <Pressable
                      style={[styles.roleButton, role === "admin" && styles.roleActive]}
                      onPress={() => setRole("admin")}
                    >
                      <Text
                        style={[styles.roleText, role === "admin" && styles.roleTextActive]}
                      >
                        Admin
                      </Text>
                    </Pressable>

                    <Pressable
                      style={[
                        styles.roleButton,
                        role === "service_provider" && styles.roleActive,
                      ]}
                      onPress={() => setRole("service_provider")}
                    >
                      <Text
                        style={[
                          styles.roleText,
                          role === "service_provider" && styles.roleTextActive,
                        ]}
                        numberOfLines={1}
                      >
                        Provider
                      </Text>
                    </Pressable>
                  </View>

                  <View style={styles.form}>
                    <View style={styles.inputGroup}>
                      <Text style={styles.label}>Full name</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="Enter your full name"
                        placeholderTextColor="#94A3B8"
                        value={displayName}
                        onChangeText={setDisplayName}
                        returnKeyType="next"
                      />
                    </View>

                    <View style={styles.inputGroup}>
                      <Text style={styles.label}>Email address</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="Enter your email"
                        placeholderTextColor="#94A3B8"
                        autoCapitalize="none"
                        keyboardType="email-address"
                        value={email}
                        onChangeText={setEmail}
                        returnKeyType="next"
                      />
                    </View>

                    <View style={styles.inputGroup}>
                      <Text style={styles.label}>Password</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="Create a password"
                        placeholderTextColor="#94A3B8"
                        secureTextEntry
                        value={password}
                        onChangeText={setPassword}
                        returnKeyType="done"
                      />
                    </View>

                    <Pressable
                      style={[styles.button, loading && styles.buttonDisabled]}
                      onPress={onRegister}
                      disabled={loading}
                    >
                      <Text style={styles.buttonText}>
                        {loading ? "Creating account..." : "Create account"}
                      </Text>
                    </Pressable>

                    <Pressable onPress={() => router.push("/auth/login")}>
                      <Text style={styles.footerText}>
                        Already have an account? Sign in
                      </Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </TouchableWithoutFeedback>
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
  roleSwitch: {
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 18,
    padding: 5,
    marginBottom: 18,
  },
  roleButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 11,
    paddingHorizontal: 6,
    borderRadius: 14,
    minHeight: 44,
  },
  roleActive: {
    backgroundColor: "#14B8A6",
  },
  roleText: {
    color: "#94A3B8",
    fontSize: 13,
    fontWeight: "800",
  },
  roleTextActive: {
    color: "#FFFFFF",
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
  },
  button: {
    minHeight: 56,
    borderRadius: 18,
    backgroundColor: "#14B8A6",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
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
});
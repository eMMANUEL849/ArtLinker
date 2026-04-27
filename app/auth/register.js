import { useState } from "react";
import { useRouter } from "expo-router";
import {
  createUserWithEmailAndPassword,
  updateProfile,
} from "firebase/auth";
import { doc, serverTimestamp, setDoc, getDoc } from "firebase/firestore";
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
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
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { auth, db } from "../../config/firebase";

export default function RegisterScreen() {
  const router = useRouter();
  const { width, height } = useWindowDimensions();

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const goToAppHome = () => {
    router.replace("/users");
  };

  const saveUserProfile = async ({
    uid,
    displayName,
    email,
    photoURL = "",
  }) => {
    const userRef = doc(db, "users", uid);
    const existingUser = await getDoc(userRef);

    if (!existingUser.exists()) {
      await setDoc(userRef, {
        active: true,
        displayName: displayName || "User",
        email: email || "",
        photoURL,
        role: "user",
        provider: "password",
        createdAt: serverTimestamp(),
        lastLoginAt: serverTimestamp(),
      });
      return;
    }

    await setDoc(
      userRef,
      {
        displayName: displayName || existingUser.data()?.displayName || "User",
        email: email || existingUser.data()?.email || "",
        photoURL: photoURL || existingUser.data()?.photoURL || "",
        lastLoginAt: serverTimestamp(),
      },
      { merge: true }
    );
  };

  const onRegister = async () => {
    const trimmedName = displayName.trim();
    const trimmedEmail = email.trim();
    const trimmedPassword = password.trim();

    if (!trimmedName || !trimmedEmail || !trimmedPassword) {
      return Alert.alert("Missing", "Enter name, email and password");
    }

    if (trimmedPassword.length < 6) {
      return Alert.alert(
        "Weak password",
        "Password must be at least 6 characters"
      );
    }

    try {
      setLoading(true);

      const cred = await createUserWithEmailAndPassword(
        auth,
        trimmedEmail,
        trimmedPassword
      );

      await updateProfile(cred.user, { displayName: trimmedName });

      await saveUserProfile({
        uid: cred.user.uid,
        displayName: trimmedName,
        email: trimmedEmail,
      });

      goToAppHome();
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
                <Pressable
                  onPress={() => router.back()}
                  style={styles.backButton}
                >
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
                    />
                  </View>

                  <Text style={[styles.title, { fontSize: titleSize }]}>
                    Create your account
                  </Text>

                  <Text style={[styles.subtitle, { fontSize: subtitleSize }]}>
                    Join a modern space for artists to share and discover artwork.
                  </Text>
                </View>

                <View style={styles.card}>
                  <View style={styles.form}>
                    <View style={styles.inputGroup}>
                      <Text style={styles.label}>Full name</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="Enter your full name"
                        value={displayName}
                        onChangeText={setDisplayName}
                      />
                    </View>

                    <View style={styles.inputGroup}>
                      <Text style={styles.label}>Email</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="Enter your email"
                        autoCapitalize="none"
                        value={email}
                        onChangeText={setEmail}
                      />
                    </View>

                    <View style={styles.inputGroup}>
                      <Text style={styles.label}>Password</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="Create a password"
                        secureTextEntry
                        value={password}
                        onChangeText={setPassword}
                      />
                    </View>

                    <Pressable
                      style={[styles.button, loading && styles.buttonDisabled]}
                      onPress={onRegister}
                      disabled={loading}
                    >
                      <Text style={styles.buttonText}>
                        {loading ? "Creating..." : "Create account"}
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
  flex: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: "#07111F" },
  background: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  wrapper: { justifyContent: "center", width: "100%" },
  backButton: {
    marginBottom: 18,
    padding: 10,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 12,
  },
  backText: { color: "#fff", fontWeight: "700" },
  header: { alignItems: "center", marginBottom: 24 },
  logoWrap: {
    backgroundColor: "rgba(255,255,255,0.1)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 18,
  },
  title: { fontWeight: "900", color: "#fff", marginBottom: 10 },
  subtitle: { color: "#CBD5E1", textAlign: "center" },
  card: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 20,
    padding: 16,
  },
  form: { gap: 12 },
  inputGroup: { gap: 5 },
  label: { color: "#E2E8F0", fontWeight: "700" },
  input: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
  },
  button: {
    backgroundColor: "#14B8A6",
    padding: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  buttonText: { color: "#fff", fontWeight: "800" },
  buttonDisabled: { opacity: 0.7 },
  footerText: {
    textAlign: "center",
    color: "#CBD5E1",
    marginTop: 8,
  },
});
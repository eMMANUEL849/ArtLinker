import React, { useEffect, useMemo, useState } from "react";
import {
  
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  ActivityIndicator,
  Alert,
  StatusBar,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { auth, db, storage } from "../../config/firebase";
import { doc, onSnapshot, setDoc, serverTimestamp } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";

const DEFAULT_AVATAR = "https://via.placeholder.com/300x300.png?text=Admin";

function getSafeName(user, data) {
  return (
    data?.displayName ||
    data?.name ||
    user?.displayName ||
    user?.email?.split("@")[0] ||
    "Admin"
  );
}

function getSafeAvatar(data) {
  return (
    data?.photoURL ||
    data?.avatar ||
    data?.profileImage ||
    DEFAULT_AVATAR
  );
}

export default function AdminProfileScreen() {
  const currentUser = auth.currentUser;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  const [form, setForm] = useState({
    displayName: "",
    username: "",
    email: "",
    phone: "",
    bio: "",
    avatar: DEFAULT_AVATAR,
  });

  const hasUser = useMemo(() => Boolean(currentUser?.uid), [currentUser?.uid]);

  useEffect(() => {
    if (!currentUser?.uid) {
      setLoading(false);
      return;
    }

    const userRef = doc(db, "users", currentUser.uid);

    const unsubscribe = onSnapshot(
      userRef,
      async (snapshot) => {
        try {
          if (snapshot.exists()) {
            const data = snapshot.data();

            setForm({
              displayName: getSafeName(currentUser, data),
              username: data?.username || "",
              email: data?.email || currentUser?.email || "",
              phone: data?.phone || data?.phoneNumber || "",
              bio: data?.bio || "",
              avatar: getSafeAvatar(data),
            });
          } else {
            const starterData = {
              displayName: getSafeName(currentUser, null),
              username: "",
              email: currentUser?.email || "",
              phone: "",
              bio: "",
              avatar: DEFAULT_AVATAR,
            };

            setForm(starterData);

            await setDoc(
              userRef,
              {
                displayName: starterData.displayName,
                name: starterData.displayName,
                username: starterData.username,
                email: starterData.email,
                phone: starterData.phone,
                phoneNumber: starterData.phone,
                bio: starterData.bio,
                photoURL: starterData.avatar,
                avatar: starterData.avatar,
                profileImage: starterData.avatar,
                role: "admin",
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                updatedBy: currentUser.uid,
              },
              { merge: true }
            );
          }
        } catch (error) {
          console.log("profile snapshot setup error:", error);
        } finally {
          setLoading(false);
        }
      },
      (error) => {
        console.log("profile load error:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [currentUser?.uid]);

  const handleChange = (key, value) => {
    setForm((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const pickProfileImage = async () => {
    try {
      const permissionResult =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permissionResult.granted) {
        Alert.alert(
          "Permission needed",
          "Please allow photo library access to upload a profile picture."
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
        allowsEditing: true,
        aspect: [1, 1],
      });

      if (result.canceled || !result.assets?.length) return;

      const selectedImage = result.assets[0];
      await uploadProfileImage(selectedImage.uri);
    } catch (error) {
      console.log("pick image error:", error);
      Alert.alert("Error", "Failed to select image.");
    }
  };

  const uploadProfileImage = async (uri) => {
    if (!currentUser?.uid) {
      Alert.alert("Error", "No signed in admin found.");
      return;
    }

    try {
      setUploadingImage(true);

      const response = await fetch(uri);
      const blob = await response.blob();

      const imageRef = ref(
        storage,
        `admin_profiles/${currentUser.uid}/profile_${Date.now()}.jpg`
      );

      await uploadBytes(imageRef, blob);
      const downloadURL = await getDownloadURL(imageRef);

      setForm((prev) => ({
        ...prev,
        avatar: downloadURL,
      }));

      await setDoc(
        doc(db, "users", currentUser.uid),
        {
          photoURL: downloadURL,
          avatar: downloadURL,
          profileImage: downloadURL,
          role: "admin",
          updatedAt: serverTimestamp(),
          updatedBy: currentUser.uid,
        },
        { merge: true }
      );

      Alert.alert("Success", "Profile picture uploaded successfully.");
    } catch (error) {
      console.log("upload image error:", error);
      Alert.alert("Error", "Failed to upload profile picture.");
    } finally {
      setUploadingImage(false);
    }
  };

  const saveProfile = async () => {
    if (!currentUser?.uid) {
      Alert.alert("Error", "No signed in admin found.");
      return;
    }

    const cleanedDisplayName = form.displayName.trim();
    const cleanedUsername = form.username.trim();
    const cleanedEmail = form.email.trim();
    const cleanedPhone = form.phone.trim();
    const cleanedBio = form.bio.trim();

    if (!cleanedDisplayName) {
      Alert.alert("Missing details", "Display name is required.");
      return;
    }

    try {
      setSaving(true);

      await setDoc(
        doc(db, "users", currentUser.uid),
        {
          displayName: cleanedDisplayName,
          name: cleanedDisplayName,
          username: cleanedUsername,
          email: cleanedEmail,
          phone: cleanedPhone,
          phoneNumber: cleanedPhone,
          bio: cleanedBio,
          photoURL: form.avatar || DEFAULT_AVATAR,
          avatar: form.avatar || DEFAULT_AVATAR,
          profileImage: form.avatar || DEFAULT_AVATAR,
          role: "admin",
          updatedAt: serverTimestamp(),
          updatedBy: currentUser.uid,
        },
        { merge: true }
      );

      Alert.alert("Success", "Profile updated successfully.");
    } catch (error) {
      console.log("save profile error:", error);
      Alert.alert("Error", "Failed to save profile.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={["top"]}>
        <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color="#7C3AED" />
          <Text style={styles.loadingText}>Loading profile...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!hasUser) {
    return (
      <SafeAreaView style={styles.safeArea} edges={["top"]}>
        <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />
        <View style={styles.loadingWrap}>
          <Ionicons name="alert-circle-outline" size={34} color="#EF4444" />
          <Text style={styles.loadingTitle}>No admin account found</Text>
          <Text style={styles.loadingText}>
            Please sign in again to manage your profile.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.headerCard}>
          <View style={styles.headerTopRow}>
            <View>
              <Text style={styles.logo}>ArtLinker</Text>
              <Text style={styles.headerBadge}>Admin Profile</Text>
            </View>

            <View style={styles.headerIconWrap}>
              <Ionicons name="person-outline" size={20} color="#7C3AED" />
            </View>
          </View>

          <Text style={styles.title}>My Profile</Text>
          <Text style={styles.subtitle}>
            Manage your admin profile details and profile picture
          </Text>
        </View>

        <View style={styles.profileCard}>
          <View style={styles.avatarWrap}>
            <Image
              source={{ uri: form.avatar || DEFAULT_AVATAR }}
              style={styles.avatar}
            />

            <TouchableOpacity
              style={styles.uploadPhotoButton}
              onPress={pickProfileImage}
              disabled={uploadingImage}
              activeOpacity={0.85}
            >
              {uploadingImage ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="camera-outline" size={16} color="#FFFFFF" />
                  <Text style={styles.uploadPhotoText}>Upload Photo</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.topInfoCard}>
            <Text style={styles.topInfoName}>
              {form.displayName || "Admin"}
            </Text>
            <Text style={styles.topInfoRole}>Administrator Account</Text>
            <Text style={styles.topInfoEmail}>
              {form.email || currentUser?.email || "No email"}
            </Text>
          </View>

          <Text style={styles.fieldLabel}>Display Name</Text>
          <TextInput
            style={styles.input}
            value={form.displayName}
            onChangeText={(text) => handleChange("displayName", text)}
            placeholder="Enter display name"
            placeholderTextColor="#9CA3AF"
          />

          <Text style={styles.fieldLabel}>Username</Text>
          <TextInput
            style={styles.input}
            value={form.username}
            onChangeText={(text) => handleChange("username", text)}
            placeholder="Enter username"
            placeholderTextColor="#9CA3AF"
            autoCapitalize="none"
          />

          <Text style={styles.fieldLabel}>Email</Text>
          <TextInput
            style={styles.input}
            value={form.email}
            onChangeText={(text) => handleChange("email", text)}
            placeholder="Enter email"
            placeholderTextColor="#9CA3AF"
            keyboardType="email-address"
            autoCapitalize="none"
          />

          <Text style={styles.fieldLabel}>Phone</Text>
          <TextInput
            style={styles.input}
            value={form.phone}
            onChangeText={(text) => handleChange("phone", text)}
            placeholder="Enter phone number"
            placeholderTextColor="#9CA3AF"
            keyboardType="phone-pad"
          />

          <Text style={styles.fieldLabel}>Bio</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={form.bio}
            onChangeText={(text) => handleChange("bio", text)}
            placeholder="Write a short bio"
            placeholderTextColor="#9CA3AF"
            multiline
            textAlignVertical="top"
          />

          <TouchableOpacity
            style={styles.saveButton}
            onPress={saveProfile}
            disabled={saving}
            activeOpacity={0.85}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="save-outline" size={18} color="#FFFFFF" />
                <Text style={styles.saveButtonText}>Save Profile</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 28,
  },

  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  loadingTitle: {
    marginTop: 12,
    fontSize: 17,
    fontWeight: "800",
    color: "#111827",
  },
  loadingText: {
    marginTop: 8,
    fontSize: 13,
    color: "#6B7280",
    fontWeight: "600",
    textAlign: "center",
  },

  headerCard: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E9EEF5",
    borderRadius: 24,
    padding: 18,
    marginBottom: 16,
    shadowColor: "#0F172A",
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 7 },
    elevation: 4,
  },
  headerTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 14,
  },
  logo: {
    fontSize: 26,
    fontWeight: "900",
    color: "#F06CE9",
  },
  headerBadge: {
    marginTop: 6,
    alignSelf: "flex-start",
    fontSize: 11,
    fontWeight: "700",
    color: "#6D28D9",
    backgroundColor: "#F3E8FF",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  headerIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "#F5F3FF",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 26,
    fontWeight: "900",
    color: "#111827",
  },
  subtitle: {
    marginTop: 6,
    fontSize: 13,
    color: "#64748B",
    lineHeight: 19,
  },

  profileCard: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E9EEF5",
    borderRadius: 22,
    padding: 16,
    shadowColor: "#0F172A",
    shadowOpacity: 0.05,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },

  avatarWrap: {
    alignItems: "center",
    marginBottom: 18,
  },
  avatar: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: "#E5E7EB",
    marginBottom: 12,
  },
  uploadPhotoButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#111827",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  uploadPhotoText: {
    marginLeft: 6,
    fontSize: 12,
    fontWeight: "800",
    color: "#FFFFFF",
  },

  topInfoCard: {
    backgroundColor: "#FAFAFB",
    borderWidth: 1,
    borderColor: "#EEF2F7",
    borderRadius: 16,
    padding: 14,
    marginBottom: 8,
  },
  topInfoName: {
    fontSize: 18,
    fontWeight: "900",
    color: "#111827",
  },
  topInfoRole: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: "700",
    color: "#7C3AED",
  },
  topInfoEmail: {
    marginTop: 6,
    fontSize: 12,
    color: "#6B7280",
    fontWeight: "600",
  },

  fieldLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: "#374151",
    marginBottom: 8,
    marginTop: 8,
  },
  input: {
    minHeight: 46,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 13,
    color: "#111827",
    fontWeight: "600",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  textArea: {
    minHeight: 100,
    paddingTop: 12,
  },

  saveButton: {
    backgroundColor: "#7C3AED",
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    marginTop: 18,
  },
  saveButtonText: {
    marginLeft: 8,
    fontSize: 14,
    fontWeight: "800",
    color: "#FFFFFF",
  },
});
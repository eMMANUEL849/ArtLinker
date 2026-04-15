import React, { useEffect, useState } from "react";
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  ActivityIndicator,
} from "react-native";
import { Ionicons, Feather, MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { signOut } from "firebase/auth";
import { doc, onSnapshot, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../../config/firebase";

const defaultSettings = {
  pushNotifications: true,
  emailNotifications: true,
  profilePrivate: false,
  showEmail: true,
  showLocation: true,
  allowComments: true,
  allowDownloads: false,
  darkMode: false,
};

export default function SettingsScreen() {
  const router = useRouter();
  const user = auth.currentUser;

  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState("");
  const [settings, setSettings] = useState(defaultSettings);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const unsubscribe = onSnapshot(
      doc(db, "users", user.uid),
      async (snapshot) => {
        try {
          if (snapshot.exists()) {
            const data = snapshot.data();

            setSettings({
              pushNotifications: data.pushNotifications ?? true,
              emailNotifications: data.emailNotifications ?? true,
              profilePrivate: data.profilePrivate ?? false,
              showEmail: data.showEmail ?? true,
              showLocation: data.showLocation ?? true,
              allowComments: data.allowComments ?? true,
              allowDownloads: data.allowDownloads ?? false,
              darkMode: data.darkMode ?? false,
            });
          } else {
            await setDoc(
              doc(db, "users", user.uid),
              {
                ...defaultSettings,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              },
              { merge: true }
            );

            setSettings(defaultSettings);
          }
        } catch (error) {
          console.log("SETTINGS LOAD ERROR:", error);
        } finally {
          setLoading(false);
        }
      },
      (error) => {
        console.log("SETTINGS SNAPSHOT ERROR:", error);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [user]);

  const updateSetting = async (key, value) => {
    if (!user) {
      Alert.alert("Error", "No logged in user found.");
      return;
    }

    const previousValue = settings[key];

    try {
      setSavingKey(key);
      setSettings((prev) => ({
        ...prev,
        [key]: value,
      }));

      await setDoc(
        doc(db, "users", user.uid),
        {
          [key]: value,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } catch (error) {
      console.log("UPDATE SETTING ERROR:", error);

      setSettings((prev) => ({
        ...prev,
        [key]: previousValue,
      }));

      Alert.alert("Error", "Could not update setting.");
    } finally {
      setSavingKey("");
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.replace("/auth/login");
    } catch (error) {
      Alert.alert("Error", "Could not log out.");
    }
  };

  const confirmLogout = () => {
    Alert.alert("Logout", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Logout",
        style: "destructive",
        onPress: handleLogout,
      },
    ]);
  };

  const settingsSections = [
    {
      title: "Notifications",
      items: [
        {
          key: "pushNotifications",
          label: "Push Notifications",
          description: "Receive alerts for likes, follows, comments, and messages.",
          icon: <Ionicons name="notifications-outline" size={20} color="#4A63FF" />,
        },
        {
          key: "emailNotifications",
          label: "Email Notifications",
          description: "Get important account activity by email.",
          icon: <MaterialIcons name="mail-outline" size={20} color="#F06CE9" />,
        },
      ],
    },
    {
      title: "Privacy",
      items: [
        {
          key: "profilePrivate",
          label: "Private Profile",
          description: "Limit profile visibility to approved followers only.",
          icon: <Ionicons name="lock-closed-outline" size={20} color="#111827" />,
        },
        {
          key: "showEmail",
          label: "Show Email",
          description: "Display email on the profile page.",
          icon: <Feather name="mail" size={20} color="#0F9D7A" />,
        },
        {
          key: "showLocation",
          label: "Show Location",
          description: "Display location on the profile page.",
          icon: <Ionicons name="location-outline" size={20} color="#F59E0B" />,
        },
      ],
    },
    {
      title: "Artwork Preferences",
      items: [
        {
          key: "allowComments",
          label: "Allow Comments",
          description: "Let other users comment on your artwork.",
          icon: <Ionicons name="chatbubble-outline" size={20} color="#7C3AED" />,
        },
        {
          key: "allowDownloads",
          label: "Allow Downloads",
          description: "Let other users download your artwork.",
          icon: <Ionicons name="download-outline" size={20} color="#EF4444" />,
        },
      ],
    },
    {
      title: "Appearance",
      items: [
        {
          key: "darkMode",
          label: "Dark Mode",
          description: "Enable a darker interface theme for your account.",
          icon: <Ionicons name="moon-outline" size={20} color="#374151" />,
        },
      ],
    },
  ];

  if (loading) {
    return (
      <SafeAreaView style={styles.loaderScreen}>
        <ActivityIndicator size="large" color="#f06ce9" />
        <Text style={styles.loaderText}>Loading settings...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
            activeOpacity={0.85}
          >
            <Ionicons name="chevron-back" size={20} color="#222" />
          </TouchableOpacity>

          <Text style={styles.headerTitle}>Settings</Text>

          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.heroCard}>
          <Text style={styles.heroTitle}>Manage your account</Text>
          <Text style={styles.heroText}>
            Control privacy, notifications, artwork preferences, and the way your profile appears to others.
          </Text>
        </View>

        {settingsSections.map((section) => (
          <View key={section.title} style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>{section.title}</Text>

            {section.items.map((item, index) => (
              <View
                key={item.key}
                style={[
                  styles.settingRow,
                  index !== section.items.length - 1 && styles.settingRowBorder,
                ]}
              >
                <View style={styles.settingLeft}>
                  <View style={styles.iconWrap}>{item.icon}</View>

                  <View style={styles.settingTextWrap}>
                    <Text style={styles.settingLabel}>{item.label}</Text>
                    <Text style={styles.settingDescription}>{item.description}</Text>
                  </View>
                </View>

                <View style={styles.settingRight}>
                  {savingKey === item.key ? (
                    <ActivityIndicator size="small" color="#4A63FF" />
                  ) : (
                    <Switch
                      value={settings[item.key]}
                      onValueChange={(value) => updateSetting(item.key, value)}
                      trackColor={{ false: "#D1D5DB", true: "#C7B8FF" }}
                      thumbColor={settings[item.key] ? "#7C3AED" : "#F9FAFB"}
                    />
                  )}
                </View>
              </View>
            ))}
          </View>
        ))}

        <View style={styles.accountCard}>
          <Text style={styles.sectionTitle}>Account</Text>

          <TouchableOpacity
            style={styles.accountAction}
            onPress={() => router.push("/(users)/profile")}
            activeOpacity={0.85}
          >
            <View style={styles.accountActionLeft}>
              <View style={styles.accountIconWrap}>
                <Ionicons name="person-outline" size={20} color="#4A63FF" />
              </View>
              <Text style={styles.accountActionText}>Back to Profile</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.logoutButton}
            onPress={confirmLogout}
            activeOpacity={0.85}
          >
            <Ionicons name="log-out-outline" size={18} color="#fff" />
            <Text style={styles.logoutButtonText}>Log Out</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#F7F8FC",
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 28,
  },
  loaderScreen: {
    flex: 1,
    backgroundColor: "#F7F8FC",
    justifyContent: "center",
    alignItems: "center",
  },
  loaderText: {
    marginTop: 12,
    fontSize: 14,
    color: "#666",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#ECECF2",
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#171717",
  },
  headerSpacer: {
    width: 40,
  },
  heroCard: {
    backgroundColor: "#14112B",
    borderRadius: 24,
    padding: 20,
    marginBottom: 16,
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  heroText: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 20,
    color: "#C7C9D9",
  },
  sectionCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#ECECF2",
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#1F2937",
    marginBottom: 10,
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
  },
  settingRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: "#F1F2F6",
  },
  settingLeft: {
    flexDirection: "row",
    alignItems: "flex-start",
    flex: 1,
    paddingRight: 12,
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "#F8F9FD",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  settingTextWrap: {
    flex: 1,
  },
  settingLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: "#222",
  },
  settingDescription: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 18,
    color: "#7B8190",
  },
  settingRight: {
    alignItems: "center",
    justifyContent: "center",
    minWidth: 60,
  },
  accountCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: "#ECECF2",
  },
  accountAction: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FAFAFC",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginTop: 6,
    marginBottom: 14,
  },
  accountActionLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  accountIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#EEF1FF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  accountActionText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#222",
  },
  logoutButton: {
    height: 52,
    borderRadius: 16,
    backgroundColor: "#111827",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  logoutButtonText: {
    marginLeft: 8,
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});
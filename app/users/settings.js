import React, { useEffect, useMemo, useState } from "react";
import {

  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  ActivityIndicator,
  StatusBar,
  TextInput,
} from "react-native";
import { Ionicons, Feather, MaterialIcons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { signOut } from "firebase/auth";
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { auth, db } from "../../config/firebase";

const defaultUserSettings = {
  pushNotifications: true,
  emailNotifications: true,
  showEmail: true,
  showLocation: true,
  allowComments: true,
  allowDownloads: false,
  darkMode: false,
};

const defaultPlatformSettings = {
  platformName: "ArtLinker",
  platformRules: [
    "Users must not upload abusive, illegal, or copyrighted content without permission.",
    "Providers must deliver services professionally and within agreed timelines.",
    "Spam, fraud, and harassment are prohibited across the platform.",
  ],
  policies: {
    contentModerationPolicy:
      "Reported content will be reviewed by the admin team and may be removed if it breaches platform standards.",
    refundPolicy:
      "Refunds are reviewed on a case by case basis depending on the transaction and service evidence.",
    providerPolicy:
      "Service providers may be verified and approved after review of profile quality, performance, and compliance.",
  },
};

function getUserDisplayName(userDoc, authUser) {
  return (
    userDoc?.displayName ||
    userDoc?.name ||
    userDoc?.fullName ||
    authUser?.displayName ||
    authUser?.email?.split("@")[0] ||
    "User"
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const user = auth.currentUser;

  const [loadingUserSettings, setLoadingUserSettings] = useState(true);
  const [loadingPlatformSettings, setLoadingPlatformSettings] = useState(true);
  const [loadingUserProfile, setLoadingUserProfile] = useState(true);
  const [loadingReceipts, setLoadingReceipts] = useState(true);

  const [savingKey, setSavingKey] = useState("");
  const [submittingProviderRequest, setSubmittingProviderRequest] =
    useState(false);

  const [settings, setSettings] = useState(defaultUserSettings);
  const [platformSettings, setPlatformSettings] = useState(
    defaultPlatformSettings
  );
  const [userProfile, setUserProfile] = useState(null);
  const [receipts, setReceipts] = useState([]);

  const [providerRequestMessage, setProviderRequestMessage] = useState("");

  useEffect(() => {
    if (!user?.uid) {
      setLoadingUserSettings(false);
      return;
    }

    const userSettingsRef = doc(db, "settings", user.uid);

    const unsubscribe = onSnapshot(
      userSettingsRef,
      async (snapshot) => {
        try {
          if (snapshot.exists()) {
            const data = snapshot.data();

            setSettings({
              pushNotifications: data?.pushNotifications ?? true,
              emailNotifications: data?.emailNotifications ?? true,
              showEmail: data?.showEmail ?? true,
              showLocation: data?.showLocation ?? true,
              allowComments: data?.allowComments ?? true,
              allowDownloads: data?.allowDownloads ?? false,
              darkMode: data?.darkMode ?? false,
            });
          } else {
            await setDoc(
              userSettingsRef,
              {
                ...defaultUserSettings,
                userId: user.uid,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              },
              { merge: true }
            );

            setSettings(defaultUserSettings);
          }
        } catch (error) {
          console.log("USER SETTINGS LOAD ERROR:", error);
        } finally {
          setLoadingUserSettings(false);
        }
      },
      (error) => {
        console.log("USER SETTINGS SNAPSHOT ERROR:", error);
        setLoadingUserSettings(false);
      }
    );

    return unsubscribe;
  }, [user?.uid]);

  useEffect(() => {
    const platformRef = doc(db, "settings", "platform");

    const unsubscribe = onSnapshot(
      platformRef,
      (snapshot) => {
        try {
          if (snapshot.exists()) {
            const data = snapshot.data();

            setPlatformSettings({
              platformName:
                data?.platformName || defaultPlatformSettings.platformName,
              platformRules:
                data?.platformRules || defaultPlatformSettings.platformRules,
              policies: {
                ...defaultPlatformSettings.policies,
                ...(data?.policies || {}),
              },
            });
          } else {
            setPlatformSettings(defaultPlatformSettings);
          }
        } catch (error) {
          console.log("PLATFORM SETTINGS LOAD ERROR:", error);
          setPlatformSettings(defaultPlatformSettings);
        } finally {
          setLoadingPlatformSettings(false);
        }
      },
      (error) => {
        console.log("PLATFORM SETTINGS SNAPSHOT ERROR:", error);
        setPlatformSettings(defaultPlatformSettings);
        setLoadingPlatformSettings(false);
      }
    );

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!user?.uid) {
      setLoadingUserProfile(false);
      return;
    }

    const userRef = doc(db, "users", user.uid);

    const unsubscribe = onSnapshot(
      userRef,
      (snapshot) => {
        try {
          if (snapshot.exists()) {
            setUserProfile({
              id: snapshot.id,
              ...snapshot.data(),
            });
          } else {
            setUserProfile(null);
          }
        } catch (error) {
          console.log("USER PROFILE LOAD ERROR:", error);
          setUserProfile(null);
        } finally {
          setLoadingUserProfile(false);
        }
      },
      (error) => {
        console.log("USER PROFILE SNAPSHOT ERROR:", error);
        setUserProfile(null);
        setLoadingUserProfile(false);
      }
    );

    return unsubscribe;
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) {
      setReceipts([]);
      setLoadingReceipts(false);
      return;
    }

    const receiptsQuery = query(
      collection(db, "receipts"),
      where("userId", "==", user.uid),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(
      receiptsQuery,
      (snapshot) => {
        try {
          const items = snapshot.docs.map((item) => ({
            id: item.id,
            ...item.data(),
          }));

          setReceipts(items);
        } catch (error) {
          console.log("RECEIPTS LOAD ERROR:", error);
          setReceipts([]);
        } finally {
          setLoadingReceipts(false);
        }
      },
      (error) => {
        console.log("RECEIPTS SNAPSHOT ERROR:", error);
        setReceipts([]);
        setLoadingReceipts(false);
      }
    );

    return unsubscribe;
  }, [user?.uid]);

  const loading =
    loadingUserSettings ||
    loadingPlatformSettings ||
    loadingUserProfile ||
    loadingReceipts;

  const isDarkMode = Boolean(settings.darkMode);
  const receiptCount = receipts.length;

  const theme = useMemo(
    () => ({
      background: isDarkMode ? "#0F1117" : "#F7F8FC",
      surface: isDarkMode ? "#171B24" : "#FFFFFF",
      surfaceAlt: isDarkMode ? "#111827" : "#FAFAFC",
      border: isDarkMode ? "#2A3140" : "#ECECF2",
      mutedBorder: isDarkMode ? "#242B38" : "#EEF1F6",
      text: isDarkMode ? "#F9FAFB" : "#171717",
      textSoft: isDarkMode ? "#E5E7EB" : "#374151",
      textMuted: isDarkMode ? "#94A3B8" : "#7B8190",
      inputBg: isDarkMode ? "#0F172A" : "#FFFFFF",
      heroBg: isDarkMode ? "#1A1335" : "#14112B",
      heroText: isDarkMode ? "#D8D9F1" : "#C7C9D9",
      iconBg: isDarkMode ? "#202938" : "#F8F9FD",
      backButtonBg: isDarkMode ? "#171B24" : "#FFFFFF",
      accountActionBg: isDarkMode ? "#111827" : "#FAFAFC",
      accountIconBg: isDarkMode ? "#1E293B" : "#EEF1FF",
      primary: "#7C3AED",
      secondary: "#111827",
      logout: isDarkMode ? "#7F1D1D" : "#111827",
      danger: "#EF4444",
      loaderText: isDarkMode ? "#CBD5E1" : "#666",
      switchTrackOff: isDarkMode ? "#374151" : "#D1D5DB",
      switchTrackOn: isDarkMode ? "#5B3FB2" : "#C7B8FF",
      switchThumbOn: "#7C3AED",
      switchThumbOff: isDarkMode ? "#E5E7EB" : "#F9FAFB",
      statusBar: isDarkMode ? "light-content" : "dark-content",
    }),
    [isDarkMode]
  );

  const styles = useMemo(() => createStyles(theme), [theme]);

  const updateSetting = async (key, value) => {
    if (!user?.uid) {
      Alert.alert("Error", "No logged in user found.");
      return;
    }

    const previousValue = settings[key];
    const userSettingsRef = doc(db, "settings", user.uid);

    try {
      setSavingKey(key);

      setSettings((prev) => ({
        ...prev,
        [key]: value,
      }));

      await setDoc(
        userSettingsRef,
        {
          [key]: value,
          userId: user.uid,
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

  const sendNotificationToAdmins = async ({
    title,
    message,
    type,
    extraData = {},
  }) => {
    if (!user?.uid) {
      throw new Error("No logged in user found.");
    }

    const adminsSnapshot = await getDocs(query(collection(db, "users")));

    const adminUsers = adminsSnapshot.docs
      .map((item) => ({
        id: item.id,
        ...item.data(),
      }))
      .filter((item) => (item?.role || "").toString().toLowerCase() === "admin");

    if (!adminUsers.length) {
      throw new Error("No admin accounts found.");
    }

    const batch = writeBatch(db);
    const senderName = getUserDisplayName(userProfile, user);

    adminUsers.forEach((admin) => {
      const notificationRef = doc(collection(db, "notifications"));

      batch.set(notificationRef, {
        userId: admin.id,
        title,
        message,
        type,
        read: false,
        createdAt: serverTimestamp(),
        createdBy: user.uid,
        senderId: user.uid,
        senderName,
        senderEmail: user?.email || userProfile?.email || "",
        senderRole: (userProfile?.role || "user").toString().toLowerCase(),
        isUserMessageToAdmin: true,
        ...extraData,
      });
    });

    await batch.commit();
  };

  const submitProviderRequest = async () => {
    const trimmedMessage = providerRequestMessage.trim();

    if (!trimmedMessage) {
      Alert.alert(
        "Missing details",
        "Please explain why you want a provider account."
      );
      return;
    }

    try {
      setSubmittingProviderRequest(true);

      await sendNotificationToAdmins({
        title: "Provider Account Request",
        message: trimmedMessage,
        type: "provider_account_request",
        extraData: {
          requestType: "provider_account_request",
          providerRequestMessage: trimmedMessage,
          requestedRole: "service_provider",
        },
      });

      setProviderRequestMessage("");

      Alert.alert(
        "Success",
        "Your provider account request has been sent to the admin."
      );
    } catch (error) {
      console.log("SUBMIT PROVIDER REQUEST ERROR:", error);
      Alert.alert(
        "Error",
        error?.message || "Could not send provider account request."
      );
    } finally {
      setSubmittingProviderRequest(false);
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

  const settingsSections = useMemo(
    () => [
      {
        title: "Notifications",
        items: [
          {
            key: "pushNotifications",
            label: "Push Notifications",
            description:
              "Receive alerts for likes, follows, comments, and messages.",
            icon: (
              <Ionicons
                name="notifications-outline"
                size={20}
                color="#4A63FF"
              />
            ),
          },
          {
            key: "emailNotifications",
            label: "Email Notifications",
            description: "Get important account activity by email.",
            icon: (
              <MaterialIcons
                name="mail-outline"
                size={20}
                color="#F06CE9"
              />
            ),
          },
        ],
      },
      {
        title: "Profile Visibility",
        items: [
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
            icon: (
              <Ionicons name="location-outline" size={20} color="#F59E0B" />
            ),
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
            icon: (
              <Ionicons
                name="chatbubble-outline"
                size={20}
                color="#7C3AED"
              />
            ),
          },
          {
            key: "allowDownloads",
            label: "Allow Downloads",
            description: "Let other users download your artwork.",
            icon: (
              <Ionicons name="download-outline" size={20} color="#EF4444" />
            ),
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
    ],
    []
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.loaderScreen} edges={["top"]}>
        <StatusBar
          barStyle={theme.statusBar}
          backgroundColor={theme.background}
        />
        <ActivityIndicator size="large" color="#f06ce9" />
        <Text style={styles.loaderText}>Loading settings...</Text>
      </SafeAreaView>
    );
  }

  if (!user?.uid) {
    return (
      <SafeAreaView style={styles.loaderScreen} edges={["top"]}>
        <StatusBar
          barStyle={theme.statusBar}
          backgroundColor={theme.background}
        />
        <Ionicons name="alert-circle-outline" size={34} color="#EF4444" />
        <Text style={styles.signedOutTitle}>No user found</Text>
        <Text style={styles.loaderText}>
          Please sign in again to manage your settings.
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <StatusBar
        barStyle={theme.statusBar}
        backgroundColor={theme.background}
      />

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
            <Ionicons name="chevron-back" size={20} color={theme.text} />
          </TouchableOpacity>

          <Text style={styles.headerTitle}>Settings</Text>

          <TouchableOpacity
            style={styles.receiptHeaderButton}
            onPress={() => router.push("/users/receipts")}
            activeOpacity={0.85}
          >
            <Ionicons name="receipt-outline" size={20} color={theme.text} />
            {receiptCount > 0 ? (
              <View style={styles.receiptBadge}>
                <Text style={styles.receiptBadgeText}>
                  {receiptCount > 99 ? "99+" : receiptCount}
                </Text>
              </View>
            ) : null}
          </TouchableOpacity>
        </View>

        <View style={styles.heroCard}>
          <Text style={styles.heroTitle}>
            {platformSettings.platformName || "ArtLinker"} Settings
          </Text>
          <Text style={styles.heroText}>
            Manage notifications, profile visibility, artwork preferences,
            platform rules, feedback, receipts, and provider requests.
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
                    <Text style={styles.settingDescription}>
                      {item.description}
                    </Text>
                  </View>
                </View>

                <View style={styles.settingRight}>
                  {savingKey === item.key ? (
                    <ActivityIndicator size="small" color="#4A63FF" />
                  ) : (
                    <Switch
                      value={Boolean(settings[item.key])}
                      onValueChange={(value) => updateSetting(item.key, value)}
                      trackColor={{
                        false: theme.switchTrackOff,
                        true: theme.switchTrackOn,
                      }}
                      thumbColor={
                        settings[item.key]
                          ? theme.switchThumbOn
                          : theme.switchThumbOff
                      }
                    />
                  )}
                </View>
              </View>
            ))}
          </View>
        ))}

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Platform Rules</Text>

          {platformSettings.platformRules?.length ? (
            platformSettings.platformRules.map((rule, index) => (
              <View
                key={`${index}-${rule}`}
                style={[
                  styles.infoRow,
                  index !== platformSettings.platformRules.length - 1 &&
                    styles.infoRowBorder,
                ]}
              >
                <View style={styles.ruleBulletWrap}>
                  <Ionicons
                    name="shield-checkmark-outline"
                    size={18}
                    color="#7C3AED"
                  />
                </View>

                <Text style={styles.infoText}>{rule}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.emptyInfoText}>No platform rules available.</Text>
          )}
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Platform Policies</Text>

          <View style={[styles.policyCard, styles.policyCardSpacing]}>
            <Text style={styles.policyTitle}>Content Moderation Policy</Text>
            <Text style={styles.policyText}>
              {platformSettings.policies?.contentModerationPolicy ||
                "No content moderation policy available."}
            </Text>
          </View>

          <View style={[styles.policyCard, styles.policyCardSpacing]}>
            <Text style={styles.policyTitle}>Refund Policy</Text>
            <Text style={styles.policyText}>
              {platformSettings.policies?.refundPolicy ||
                "No refund policy available."}
            </Text>
          </View>

          <View style={styles.policyCard}>
            <Text style={styles.policyTitle}>Provider Policy</Text>
            <Text style={styles.policyText}>
              {platformSettings.policies?.providerPolicy ||
                "No provider policy available."}
            </Text>
          </View>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>App Feedback</Text>

          <Text style={styles.sectionSubtitle}>
            Share your experience, report issues, or send suggestions to the
            admin.
          </Text>

          <TouchableOpacity
            style={styles.feedbackButton}
            onPress={() => router.push("/users/feedback")}
            activeOpacity={0.85}
          >
            <View style={styles.feedbackButtonLeft}>
              <Ionicons
                name="chatbubble-ellipses-outline"
                size={20}
                color="#FFFFFF"
              />
              <Text style={styles.feedbackButtonText}>Give App Feedback</Text>
            </View>

            <Ionicons name="chevron-forward" size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Request Provider Account</Text>
          <Text style={styles.sectionSubtitle}>
            Request creation of a provider account so you can offer services on
            the platform.
          </Text>

          <Text style={styles.fieldLabel}>Request Message</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Tell the admin why you want a provider account and what services you offer"
            placeholderTextColor={theme.textMuted}
            value={providerRequestMessage}
            onChangeText={setProviderRequestMessage}
            multiline
            textAlignVertical="top"
          />

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={submitProviderRequest}
            disabled={submittingProviderRequest}
            activeOpacity={0.85}
          >
            {submittingProviderRequest ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="briefcase-outline" size={18} color="#FFFFFF" />
                <Text style={styles.primaryButtonText}>
                  Request Provider Account
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.accountCard}>
          <Text style={styles.sectionTitle}>Account</Text>

          <TouchableOpacity
            style={styles.accountAction}
            onPress={() => router.push("/users/profile")}
            activeOpacity={0.85}
          >
            <View style={styles.accountActionLeft}>
              <View style={styles.accountIconWrap}>
                <Ionicons name="person-outline" size={20} color="#4A63FF" />
              </View>
              <Text style={styles.accountActionText}>Back to Profile</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
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

function createStyles(theme) {
  return StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: theme.background,
    },
    scrollContent: {
      paddingHorizontal: 16,
      paddingTop: 10,
      paddingBottom: 28,
    },
    loaderScreen: {
      flex: 1,
      backgroundColor: theme.background,
      justifyContent: "center",
      alignItems: "center",
      paddingHorizontal: 24,
    },
    loaderText: {
      marginTop: 12,
      fontSize: 14,
      color: theme.loaderText,
      textAlign: "center",
    },
    signedOutTitle: {
      marginTop: 12,
      fontSize: 18,
      fontWeight: "800",
      color: theme.text,
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
      backgroundColor: theme.backButtonBg,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: theme.border,
    },
    headerTitle: {
      fontSize: 22,
      fontWeight: "800",
      color: theme.text,
    },
    receiptHeaderButton: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: theme.backButtonBg,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: theme.border,
      position: "relative",
    },
    receiptBadge: {
      position: "absolute",
      top: -5,
      right: -5,
      minWidth: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: "#EF4444",
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 4,
    },
    receiptBadgeText: {
      color: "#FFFFFF",
      fontSize: 10,
      fontWeight: "800",
    },
    heroCard: {
      backgroundColor: theme.heroBg,
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
      color: theme.heroText,
    },
    sectionCard: {
      backgroundColor: theme.surface,
      borderRadius: 22,
      padding: 16,
      marginBottom: 14,
      borderWidth: 1,
      borderColor: theme.border,
    },
    sectionTitle: {
      fontSize: 17,
      fontWeight: "800",
      color: theme.textSoft,
      marginBottom: 10,
    },
    sectionSubtitle: {
      fontSize: 12,
      lineHeight: 18,
      color: theme.textMuted,
      marginBottom: 12,
    },
    settingRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 14,
    },
    settingRowBorder: {
      borderBottomWidth: 1,
      borderBottomColor: theme.mutedBorder,
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
      backgroundColor: theme.iconBg,
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
      color: theme.text,
    },
    settingDescription: {
      marginTop: 4,
      fontSize: 12,
      lineHeight: 18,
      color: theme.textMuted,
    },
    settingRight: {
      alignItems: "center",
      justifyContent: "center",
      minWidth: 60,
    },
    infoRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      paddingVertical: 12,
    },
    infoRowBorder: {
      borderBottomWidth: 1,
      borderBottomColor: theme.mutedBorder,
    },
    ruleBulletWrap: {
      width: 28,
      paddingTop: 1,
    },
    infoText: {
      flex: 1,
      fontSize: 13,
      lineHeight: 20,
      color: theme.textSoft,
      fontWeight: "600",
    },
    emptyInfoText: {
      fontSize: 13,
      color: theme.textMuted,
      lineHeight: 20,
    },
    policyCard: {
      backgroundColor: theme.surfaceAlt,
      borderRadius: 16,
      padding: 14,
      borderWidth: 1,
      borderColor: theme.mutedBorder,
    },
    policyCardSpacing: {
      marginBottom: 10,
    },
    policyTitle: {
      fontSize: 14,
      fontWeight: "800",
      color: theme.text,
      marginBottom: 6,
    },
    policyText: {
      fontSize: 12,
      lineHeight: 19,
      color: theme.textMuted,
      fontWeight: "600",
    },
    fieldLabel: {
      fontSize: 12,
      fontWeight: "800",
      color: theme.textSoft,
      marginBottom: 8,
      marginTop: 4,
    },
    input: {
      minHeight: 46,
      backgroundColor: theme.inputBg,
      borderRadius: 14,
      paddingHorizontal: 12,
      paddingVertical: 12,
      fontSize: 13,
      color: theme.text,
      fontWeight: "600",
      borderWidth: 1,
      borderColor: theme.border,
    },
    textArea: {
      minHeight: 110,
      paddingTop: 12,
    },
    secondaryButton: {
      height: 52,
      borderRadius: 16,
      backgroundColor: theme.secondary,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      marginTop: 16,
    },
    primaryButtonText: {
      marginLeft: 8,
      fontSize: 14,
      fontWeight: "800",
      color: "#FFFFFF",
    },
    feedbackButton: {
      height: 56,
      borderRadius: 16,
      backgroundColor: theme.primary,
      alignItems: "center",
      justifyContent: "space-between",
      flexDirection: "row",
      paddingHorizontal: 16,
      marginTop: 6,
    },
    feedbackButtonLeft: {
      flexDirection: "row",
      alignItems: "center",
    },
    feedbackButtonText: {
      marginLeft: 10,
      fontSize: 14,
      fontWeight: "800",
      color: "#FFFFFF",
    },
    accountCard: {
      backgroundColor: theme.surface,
      borderRadius: 22,
      padding: 16,
      borderWidth: 1,
      borderColor: theme.border,
    },
    accountAction: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: theme.accountActionBg,
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
      backgroundColor: theme.accountIconBg,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 10,
    },
    accountActionText: {
      fontSize: 14,
      fontWeight: "700",
      color: theme.text,
    },
    logoutButton: {
      height: 52,
      borderRadius: 16,
      backgroundColor: theme.logout,
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
}
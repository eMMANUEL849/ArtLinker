import React, { useState } from "react";
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Switch,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { signOut } from "firebase/auth";
import { auth } from "../../config/firebase";

export default function ServiceProviderSettingsScreen() {
  const router = useRouter();

  const [pushNotifications, setPushNotifications] = useState(true);
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [showBusinessAddress, setShowBusinessAddress] = useState(true);
  const [showPhoneNumber, setShowPhoneNumber] = useState(true);

  const confirmLogout = () => {
    Alert.alert(
      "Logout",
      "Are you sure you want to log out?",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Logout",
          style: "destructive",
          onPress: handleLogout,
        },
      ]
    );
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.replace("/auth/login");
    } catch (error) {
      console.log("Logout error:", error);
      Alert.alert("Error", "Failed to log out.");
    }
  };

  const MenuRow = ({
    icon,
    title,
    subtitle,
    onPress,
    rightNode,
    danger = false,
  }) => (
    <TouchableOpacity
      style={styles.menuRow}
      onPress={onPress}
      activeOpacity={0.85}
      disabled={!onPress}
    >
      <View style={styles.menuLeft}>
        <View style={[styles.iconWrap, danger && styles.iconWrapDanger]}>
          <Ionicons
            name={icon}
            size={20}
            color={danger ? "#dc2626" : "#4a63ff"}
          />
        </View>

        <View style={styles.menuTextWrap}>
          <Text style={[styles.menuTitle, danger && styles.dangerText]}>
            {title}
          </Text>
          {!!subtitle && <Text style={styles.menuSubtitle}>{subtitle}</Text>}
        </View>
      </View>

      {rightNode ? (
        rightNode
      ) : (
        <Ionicons name="chevron-forward" size={18} color="#9ca3af" />
      )}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          activeOpacity={0.85}
        >
          <Ionicons name="arrow-back" size={22} color="#111827" />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Settings</Text>

        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.topCard}>
          <View style={styles.topIcon}>
            <Ionicons name="settings-outline" size={28} color="#4a63ff" />
          </View>
          <Text style={styles.topTitle}>Service Provider Settings</Text>
          <Text style={styles.topSubtitle}>
            Manage your account, business profile, posts, privacy, and app preferences.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>

          <View style={styles.card}>
            <MenuRow
              icon="person-outline"
              title="Edit Profile"
              subtitle="Update your business details and profile information"
              onPress={() => router.push("/service_provider/profile")}
            />

            <View style={styles.divider} />

            <MenuRow
              icon="storefront-outline"
              title="My Shop"
              subtitle="Manage your products and shop items"
              onPress={() => router.push("/service_provider/myshop")}
            />

            <View style={styles.divider} />

            <MenuRow
              icon="briefcase-outline"
              title="Jobs"
              subtitle="View and manage your current jobs"
              onPress={() => router.push("/service_provider/jobs")}
            />

            <View style={styles.divider} />

            <MenuRow
              icon="cloud-upload-outline"
              title="Upload Product"
              subtitle="Add a new product or creative service"
              onPress={() => router.push("/service_provider/upload")}
            />

            <View style={styles.divider} />

            <MenuRow
              icon="images-outline"
              title="Post Artwork"
              subtitle="Share artwork with your audience"
              onPress={() => router.push("/service_provider/profile")}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notifications</Text>

          <View style={styles.card}>
            <MenuRow
              icon="notifications-outline"
              title="Push Notifications"
              subtitle="Receive alerts for orders, jobs, and activity"
              rightNode={
                <Switch
                  value={pushNotifications}
                  onValueChange={setPushNotifications}
                  trackColor={{ false: "#d1d5db", true: "#c7d2fe" }}
                  thumbColor={pushNotifications ? "#4a63ff" : "#f9fafb"}
                />
              }
            />

            <View style={styles.divider} />

            <MenuRow
              icon="mail-outline"
              title="Email Notifications"
              subtitle="Get important updates by email"
              rightNode={
                <Switch
                  value={emailNotifications}
                  onValueChange={setEmailNotifications}
                  trackColor={{ false: "#d1d5db", true: "#c7d2fe" }}
                  thumbColor={emailNotifications ? "#4a63ff" : "#f9fafb"}
                />
              }
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Privacy</Text>

          <View style={styles.card}>
            <MenuRow
              icon="location-outline"
              title="Show Business Address"
              subtitle="Control whether your business address is visible"
              rightNode={
                <Switch
                  value={showBusinessAddress}
                  onValueChange={setShowBusinessAddress}
                  trackColor={{ false: "#d1d5db", true: "#c7d2fe" }}
                  thumbColor={showBusinessAddress ? "#4a63ff" : "#f9fafb"}
                />
              }
            />

            <View style={styles.divider} />

            <MenuRow
              icon="call-outline"
              title="Show Phone Number"
              subtitle="Control whether your phone number is visible"
              rightNode={
                <Switch
                  value={showPhoneNumber}
                  onValueChange={setShowPhoneNumber}
                  trackColor={{ false: "#d1d5db", true: "#c7d2fe" }}
                  thumbColor={showPhoneNumber ? "#4a63ff" : "#f9fafb"}
                />
              }
            />

            <View style={styles.divider} />

            <MenuRow
              icon="lock-closed-outline"
              title="Privacy Policy"
              subtitle="Read how your information is handled"
              onPress={() =>
                Alert.alert("Privacy Policy", "Add your privacy policy screen here.")
              }
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Support</Text>

          <View style={styles.card}>
            <MenuRow
              icon="help-circle-outline"
              title="Help and Support"
              subtitle="Get help with your account or services"
              onPress={() =>
                Alert.alert("Help and Support", "Add your support screen here.")
              }
            />

            <View style={styles.divider} />

            <MenuRow
              icon="document-text-outline"
              title="Terms and Conditions"
              subtitle="Review the app terms and provider rules"
              onPress={() =>
                Alert.alert("Terms and Conditions", "Add your terms screen here.")
              }
            />

            <View style={styles.divider} />

            <MenuRow
              icon="information-circle-outline"
              title="About"
              subtitle="App version and platform information"
              onPress={() =>
                Alert.alert("About", "Your service provider marketplace app.")
              }
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Session</Text>

          <View style={styles.card}>
            <MenuRow
              icon="log-out-outline"
              title="Logout"
              subtitle="Sign out from your account"
              onPress={confirmLogout}
              danger
            />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f7f8fc",
  },
  header: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: "#111827",
  },
  headerSpacer: {
    width: 40,
  },
  scrollContent: {
    padding: 14,
    paddingBottom: 32,
  },
  topCard: {
    backgroundColor: "#ffffff",
    borderRadius: 24,
    padding: 20,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
    marginBottom: 16,
  },
  topIcon: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: "#eef2ff",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  topTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: "#111827",
    textAlign: "center",
  },
  topSubtitle: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 20,
    color: "#6b7280",
    textAlign: "center",
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 10,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 22,
    paddingHorizontal: 14,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  menuRow: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
  },
  menuLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    paddingRight: 10,
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#eef2ff",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  iconWrapDanger: {
    backgroundColor: "#fee2e2",
  },
  menuTextWrap: {
    flex: 1,
  },
  menuTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#111827",
  },
  dangerText: {
    color: "#dc2626",
  },
  menuSubtitle: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 18,
    color: "#6b7280",
  },
  divider: {
    height: 1,
    backgroundColor: "#f1f5f9",
  },
});
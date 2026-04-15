import React, { useState } from "react";
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Switch,
} from "react-native";

export default function AdminSettingsScreen() {
  const [activeTab, setActiveTab] = useState("General");
  const [siteName, setSiteName] = useState("ArtLinker");
  const [siteDescription, setSiteDescription] = useState(
    "Digital art sharing platform"
  );
  const [allowRegistration, setAllowRegistration] = useState(true);
  const [requireEmailVerification, setRequireEmailVerification] =
    useState(true);

  const tabs = ["General", "Features", "Moderation", "Uploads"];

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.header}>
          <Text style={styles.logo}>ArtLinker</Text>
          <Text style={styles.title}>Admin Setting</Text>
          <Text style={styles.subtitle}>
            Configure platform setting and preferences
          </Text>
        </View>

        <View style={styles.tabRow}>
          {tabs.map((tab) => {
            const active = activeTab === tab;

            return (
              <TouchableOpacity
                key={tab}
                style={[styles.tabButton, active && styles.tabButtonActive]}
                onPress={() => setActiveTab(tab)}
              >
                <Text style={[styles.tabText, active && styles.tabTextActive]}>
                  {tab}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>General Settings</Text>
          <Text style={styles.cardSubtitle}>
            Basic platform configuration
          </Text>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Site Name</Text>
            <TextInput
              style={styles.input}
              value={siteName}
              onChangeText={setSiteName}
              placeholder="Site Name"
              placeholderTextColor="#9CA3AF"
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Site Description</Text>
            <TextInput
              style={styles.input}
              value={siteDescription}
              onChangeText={setSiteDescription}
              placeholder="Site Description"
              placeholderTextColor="#9CA3AF"
            />
          </View>

          <View style={styles.switchRow}>
            <View style={styles.switchTextWrap}>
              <Text style={styles.switchTitle}>Allow User Registration</Text>
              <Text style={styles.switchSubtitle}>
                Enable new users to create accounts
              </Text>
            </View>

            <Switch
              value={allowRegistration}
              onValueChange={setAllowRegistration}
            />
          </View>

          <View style={styles.switchRow}>
            <View style={styles.switchTextWrap}>
              <Text style={styles.switchTitle}>Require Email Verification</Text>
              <Text style={styles.switchSubtitle}>
                Users must verify email before accessing platform
              </Text>
            </View>

            <Switch
              value={requireEmailVerification}
              onValueChange={setRequireEmailVerification}
            />
          </View>

          <TouchableOpacity style={styles.saveButton}>
            <Text style={styles.saveButtonText}>Save Changes</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  scrollContent: {
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 24,
  },
  header: {
    alignItems: "center",
    marginBottom: 16,
  },
  logo: {
    fontSize: 24,
    fontWeight: "800",
    color: "#f06ce9",
    marginBottom: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: "900",
    color: "#111827",
  },
  subtitle: {
    marginTop: 4,
    fontSize: 11,
    color: "#9CA3AF",
    textAlign: "center",
  },
  tabRow: {
    flexDirection: "row",
    backgroundColor: "#F3F4F6",
    borderRadius: 10,
    padding: 4,
    marginBottom: 16,
  },
  tabButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 7,
    borderRadius: 8,
  },
  tabButtonActive: {
    backgroundColor: "#ffffff",
  },
  tabText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#6B7280",
  },
  tabTextActive: {
    color: "#111827",
  },
  card: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#EDEFF3",
    borderRadius: 14,
    padding: 14,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#111827",
  },
  cardSubtitle: {
    fontSize: 12,
    color: "#9CA3AF",
    marginTop: 4,
    marginBottom: 16,
  },
  fieldGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 12,
    fontWeight: "700",
    color: "#4B5563",
    marginBottom: 8,
  },
  input: {
    height: 42,
    borderRadius: 8,
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 12,
    fontSize: 13,
    fontWeight: "600",
    color: "#111827",
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 18,
    gap: 12,
  },
  switchTextWrap: {
    flex: 1,
  },
  switchTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#111827",
  },
  switchSubtitle: {
    fontSize: 11,
    color: "#9CA3AF",
    marginTop: 3,
    lineHeight: 15,
  },
  saveButton: {
    marginTop: 8,
    backgroundColor: "#111827",
    height: 38,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignSelf: "flex-start",
    justifyContent: "center",
    alignItems: "center",
  },
  saveButtonText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "800",
  },
});
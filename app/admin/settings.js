import React, { useEffect, useMemo, useState } from "react";
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StatusBar,
  Switch,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { doc, onSnapshot, setDoc, serverTimestamp } from "firebase/firestore";
import { db, auth } from "../../config/firebase";

const DEFAULT_SETTINGS = {
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
  categories: [
    "Digital Art",
    "Illustration",
    "Photography",
    "Painting",
    "3D Art",
    "Animation",
    "Fantasy",
    "Character Design",
  ],
  commissionRates: {
    artworkSalesPercent: 10,
    serviceJobsPercent: 12,
    providerPayoutDelayDays: 7,
  },
  featureToggles: {
    enableArtworkUploads: true,
    enableServiceRequests: true,
    enableProviderVerification: true,
    enableMarketplace: true,
    enableRefundRequests: true,
    enableAnnouncements: true,
    enableCollections: true,
    enableSavedPosts: true,
    enableFeaturedArtworks: true,
  },
};

export default function AdminSettingsScreen() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [newRule, setNewRule] = useState("");
  const [newCategory, setNewCategory] = useState("");

  useEffect(() => {
    const settingsRef = doc(db, "admin_settings", "platform");

    const unsubscribe = onSnapshot(
      settingsRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();

          setSettings({
            platformName: data?.platformName || DEFAULT_SETTINGS.platformName,
            platformRules:
              data?.platformRules || DEFAULT_SETTINGS.platformRules,
            policies: {
              ...DEFAULT_SETTINGS.policies,
              ...(data?.policies || {}),
            },
            categories: data?.categories || DEFAULT_SETTINGS.categories,
            commissionRates: {
              ...DEFAULT_SETTINGS.commissionRates,
              ...(data?.commissionRates || {}),
            },
            featureToggles: {
              ...DEFAULT_SETTINGS.featureToggles,
              ...(data?.featureToggles || {}),
            },
          });
        } else {
          setSettings(DEFAULT_SETTINGS);
        }

        setLoading(false);
      },
      (error) => {
        console.log("settings snapshot error:", error);
        setSettings(DEFAULT_SETTINGS);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const handleSaveSettings = async () => {
    try {
      setSaving(true);

      await setDoc(
        doc(db, "admin_settings", "platform"),
        {
          ...settings,
          updatedAt: serverTimestamp(),
          updatedBy: auth.currentUser?.uid || null,
        },
        { merge: true }
      );

      Alert.alert("Success", "Settings saved successfully.");
    } catch (error) {
      console.log("save settings error:", error);
      Alert.alert("Error", "Failed to save settings.");
    } finally {
      setSaving(false);
    }
  };

  const updatePolicy = (key, value) => {
    setSettings((prev) => ({
      ...prev,
      policies: {
        ...prev.policies,
        [key]: value,
      },
    }));
  };

  const updateCommission = (key, value) => {
    const parsed = Number(value);
    setSettings((prev) => ({
      ...prev,
      commissionRates: {
        ...prev.commissionRates,
        [key]: Number.isNaN(parsed) ? 0 : parsed,
      },
    }));
  };

  const toggleFeature = (key) => {
    setSettings((prev) => ({
      ...prev,
      featureToggles: {
        ...prev.featureToggles,
        [key]: !prev.featureToggles[key],
      },
    }));
  };

  const addRule = () => {
    const trimmed = newRule.trim();
    if (!trimmed) return;

    setSettings((prev) => ({
      ...prev,
      platformRules: [...prev.platformRules, trimmed],
    }));
    setNewRule("");
  };

  const removeRule = (index) => {
    setSettings((prev) => ({
      ...prev,
      platformRules: prev.platformRules.filter((_, i) => i !== index),
    }));
  };

  const updateRule = (index, value) => {
    setSettings((prev) => ({
      ...prev,
      platformRules: prev.platformRules.map((rule, i) =>
        i === index ? value : rule
      ),
    }));
  };

  const addCategory = () => {
    const trimmed = newCategory.trim();
    if (!trimmed) return;

    const exists = settings.categories.some(
      (item) => item.toLowerCase() === trimmed.toLowerCase()
    );

    if (exists) {
      Alert.alert("Duplicate", "This category already exists.");
      return;
    }

    setSettings((prev) => ({
      ...prev,
      categories: [...prev.categories, trimmed],
    }));
    setNewCategory("");
  };

  const removeCategory = (index) => {
    setSettings((prev) => ({
      ...prev,
      categories: prev.categories.filter((_, i) => i !== index),
    }));
  };

  const updateCategory = (index, value) => {
    setSettings((prev) => ({
      ...prev,
      categories: prev.categories.map((category, i) =>
        i === index ? value : category
      ),
    }));
  };

  const featureCards = useMemo(() => {
    return [
      {
        key: "enableArtworkUploads",
        label: "Artwork Uploads",
        description: "Allow users to upload new artworks",
      },
      {
        key: "enableServiceRequests",
        label: "Service Requests",
        description: "Allow users to submit jobs to providers",
      },
      {
        key: "enableProviderVerification",
        label: "Provider Verification",
        description: "Enable provider approval and verification flow",
      },
      {
        key: "enableMarketplace",
        label: "Marketplace",
        description: "Enable product sales and checkout features",
      },
      {
        key: "enableRefundRequests",
        label: "Refund Requests",
        description: "Allow users to submit refund requests",
      },
      {
        key: "enableAnnouncements",
        label: "Announcements",
        description: "Allow admin to send platform announcements",
      },
      {
        key: "enableCollections",
        label: "Collections",
        description: "Enable saved collections on profiles",
      },
      {
        key: "enableSavedPosts",
        label: "Saved Posts",
        description: "Allow users to save artworks and products",
      },
      {
        key: "enableFeaturedArtworks",
        label: "Featured Artworks",
        description: "Allow admin to mark artworks as featured",
      },
    ];
  }, []);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.headerCard}>
          <View style={styles.headerTopRow}>
            <View>
              <Text style={styles.logo}>ArtLinker</Text>
              <Text style={styles.headerBadge}>Settings and Configuration</Text>
            </View>

            <View style={styles.headerIconWrap}>
              <Ionicons name="settings-outline" size={20} color="#7C3AED" />
            </View>
          </View>

          <Text style={styles.title}>Platform Settings</Text>
          <Text style={styles.subtitle}>
            Manage platform rules, policies, categories, commission structure, and feature controls
          </Text>
        </View>

        {loading ? (
          <View style={styles.stateWrap}>
            <ActivityIndicator size="large" color="#7C3AED" />
            <Text style={styles.stateText}>Loading settings...</Text>
          </View>
        ) : (
          <>
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Platform Identity</Text>
              <Text style={styles.sectionSubtitle}>
                Basic configuration for the platform
              </Text>

              <Text style={styles.fieldLabel}>Platform Name</Text>
              <TextInput
                style={styles.input}
                value={settings.platformName}
                onChangeText={(text) =>
                  setSettings((prev) => ({ ...prev, platformName: text }))
                }
                placeholder="Enter platform name"
                placeholderTextColor="#9CA3AF"
              />
            </View>

            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Platform Rules and Policies</Text>
              <Text style={styles.sectionSubtitle}>
                Define rules and moderation guidance for all users and providers
              </Text>

              <Text style={styles.fieldLabel}>Rules</Text>

              {settings.platformRules.map((rule, index) => (
                <View key={index} style={styles.editRow}>
                  <TextInput
                    style={[styles.input, styles.flexInput]}
                    value={rule}
                    onChangeText={(text) => updateRule(index, text)}
                    placeholder="Enter rule"
                    placeholderTextColor="#9CA3AF"
                    multiline
                  />

                  <TouchableOpacity
                    style={styles.deleteButton}
                    onPress={() => removeRule(index)}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="trash-outline" size={18} color="#EF4444" />
                  </TouchableOpacity>
                </View>
              ))}

              <View style={styles.addRow}>
                <TextInput
                  style={[styles.input, styles.flexInput]}
                  value={newRule}
                  onChangeText={setNewRule}
                  placeholder="Add new rule"
                  placeholderTextColor="#9CA3AF"
                />
                <TouchableOpacity
                  style={styles.addButton}
                  onPress={addRule}
                  activeOpacity={0.85}
                >
                  <Ionicons name="add" size={18} color="#FFFFFF" />
                </TouchableOpacity>
              </View>

              <Text style={styles.fieldLabel}>Content Moderation Policy</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={settings.policies.contentModerationPolicy}
                onChangeText={(text) =>
                  updatePolicy("contentModerationPolicy", text)
                }
                placeholder="Enter moderation policy"
                placeholderTextColor="#9CA3AF"
                multiline
                textAlignVertical="top"
              />

              <Text style={styles.fieldLabel}>Refund Policy</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={settings.policies.refundPolicy}
                onChangeText={(text) => updatePolicy("refundPolicy", text)}
                placeholder="Enter refund policy"
                placeholderTextColor="#9CA3AF"
                multiline
                textAlignVertical="top"
              />

              <Text style={styles.fieldLabel}>Provider Policy</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={settings.policies.providerPolicy}
                onChangeText={(text) => updatePolicy("providerPolicy", text)}
                placeholder="Enter provider policy"
                placeholderTextColor="#9CA3AF"
                multiline
                textAlignVertical="top"
              />
            </View>

            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Category Management</Text>
              <Text style={styles.sectionSubtitle}>
                Manage artwork and marketplace categories available across the platform
              </Text>

              {settings.categories.map((category, index) => (
                <View key={index} style={styles.editRow}>
                  <TextInput
                    style={[styles.input, styles.flexInput]}
                    value={category}
                    onChangeText={(text) => updateCategory(index, text)}
                    placeholder="Category name"
                    placeholderTextColor="#9CA3AF"
                  />

                  <TouchableOpacity
                    style={styles.deleteButton}
                    onPress={() => removeCategory(index)}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="trash-outline" size={18} color="#EF4444" />
                  </TouchableOpacity>
                </View>
              ))}

              <View style={styles.addRow}>
                <TextInput
                  style={[styles.input, styles.flexInput]}
                  value={newCategory}
                  onChangeText={setNewCategory}
                  placeholder="Add new category"
                  placeholderTextColor="#9CA3AF"
                />
                <TouchableOpacity
                  style={styles.addButton}
                  onPress={addCategory}
                  activeOpacity={0.85}
                >
                  <Ionicons name="add" size={18} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Commission Rates</Text>
              <Text style={styles.sectionSubtitle}>
                Define platform commission and provider payout timing
              </Text>

              <Text style={styles.fieldLabel}>Artwork Sales Commission Percent</Text>
              <TextInput
                style={styles.input}
                value={String(settings.commissionRates.artworkSalesPercent)}
                onChangeText={(text) =>
                  updateCommission("artworkSalesPercent", text)
                }
                placeholder="Enter percentage"
                placeholderTextColor="#9CA3AF"
                keyboardType="numeric"
              />

              <Text style={styles.fieldLabel}>Service Jobs Commission Percent</Text>
              <TextInput
                style={styles.input}
                value={String(settings.commissionRates.serviceJobsPercent)}
                onChangeText={(text) =>
                  updateCommission("serviceJobsPercent", text)
                }
                placeholder="Enter percentage"
                placeholderTextColor="#9CA3AF"
                keyboardType="numeric"
              />

              <Text style={styles.fieldLabel}>Provider Payout Delay Days</Text>
              <TextInput
                style={styles.input}
                value={String(settings.commissionRates.providerPayoutDelayDays)}
                onChangeText={(text) =>
                  updateCommission("providerPayoutDelayDays", text)
                }
                placeholder="Enter days"
                placeholderTextColor="#9CA3AF"
                keyboardType="numeric"
              />
            </View>

            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Feature Toggles</Text>
              <Text style={styles.sectionSubtitle}>
                Enable or disable major platform features without changing code
              </Text>

              {featureCards.map((item) => (
                <View key={item.key} style={styles.toggleCard}>
                  <View style={styles.toggleTextWrap}>
                    <Text style={styles.toggleTitle}>{item.label}</Text>
                    <Text style={styles.toggleDescription}>
                      {item.description}
                    </Text>
                  </View>

                  <Switch
                    value={Boolean(settings.featureToggles[item.key])}
                    onValueChange={() => toggleFeature(item.key)}
                    trackColor={{ false: "#D1D5DB", true: "#C4B5FD" }}
                    thumbColor={
                      settings.featureToggles[item.key] ? "#7C3AED" : "#FFFFFF"
                    }
                  />
                </View>
              ))}
            </View>

            <TouchableOpacity
              style={styles.saveButton}
              onPress={handleSaveSettings}
              disabled={saving}
              activeOpacity={0.85}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="save-outline" size={18} color="#FFFFFF" />
                  <Text style={styles.saveButtonText}>Save Settings</Text>
                </>
              )}
            </TouchableOpacity>
          </>
        )}
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

  sectionCard: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E9EEF5",
    borderRadius: 22,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#0F172A",
    shadowOpacity: 0.05,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#111827",
  },
  sectionSubtitle: {
    fontSize: 12,
    color: "#9CA3AF",
    marginTop: 4,
    marginBottom: 14,
    lineHeight: 18,
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
  editRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 10,
  },
  addRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
  },
  flexInput: {
    flex: 1,
    marginRight: 8,
  },
  addButton: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: "#111827",
    alignItems: "center",
    justifyContent: "center",
  },
  deleteButton: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: "#FEF2F2",
    alignItems: "center",
    justifyContent: "center",
  },

  toggleCard: {
    backgroundColor: "#FAFAFB",
    borderWidth: 1,
    borderColor: "#EEF2F7",
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  toggleTextWrap: {
    flex: 1,
    marginRight: 12,
  },
  toggleTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#111827",
  },
  toggleDescription: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 4,
    lineHeight: 18,
  },

  saveButton: {
    backgroundColor: "#111827",
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    marginBottom: 14,
  },
  saveButtonText: {
    marginLeft: 8,
    fontSize: 14,
    fontWeight: "800",
    color: "#FFFFFF",
  },

  stateWrap: {
    paddingVertical: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  stateText: {
    marginTop: 10,
    fontSize: 13,
    color: "#6B7280",
    fontWeight: "600",
  },
});
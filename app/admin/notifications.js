import React, { useEffect, useMemo, useState } from "react";
import {
  
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StatusBar,
  Modal,
  Pressable,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  writeBatch,
  doc,
  serverTimestamp,
} from "firebase/firestore";
import { db, auth } from "../../config/firebase";

function formatNumber(value) {
  return Number(value || 0).toLocaleString();
}

function toDate(value) {
  try {
    if (!value) return null;
    if (typeof value?.toDate === "function") return value.toDate();
    if (value?.seconds) return new Date(value.seconds * 1000);
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed;
  } catch (error) {
    return null;
  }
}

function getTimeAgo(value) {
  const date = toDate(value);
  if (!date) return "No date";

  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes} min ago`;
  if (diffHours < 24) return `${diffHours} hr ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;

  return date.toLocaleDateString();
}

function getUserName(user) {
  return (
    user?.displayName ||
    user?.name ||
    user?.fullName ||
    user?.email?.split("@")[0] ||
    "Unknown User"
  );
}

function getUserRole(user) {
  return (user?.role || "user").toString().toLowerCase();
}

function getAnnouncementTypeLabel(type) {
  if (type === "feature_update") return "Feature Update";
  if (type === "platform_alert") return "Platform Alert";
  if (type === "promotion") return "Promotion";
  return "Announcement";
}

function getAudienceLabel(audience) {
  if (audience === "all") return "All Accounts";
  if (audience === "users") return "Users";
  if (audience === "providers") return "Providers";
  if (audience === "admins") return "Admins";
  if (audience === "single_user") return "Single User";
  return "Custom";
}

const EMPTY_FORM = {
  title: "",
  message: "",
  type: "announcement",
  audience: "all",
  selectedUserId: "",
};

export default function AdminNotificationsScreen() {
  const [users, setUsers] = useState([]);
  const [allNotifications, setAllNotifications] = useState([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const [form, setForm] = useState(EMPTY_FORM);
  const [historyFilter, setHistoryFilter] = useState("all");
  const [userPickerVisible, setUserPickerVisible] = useState(false);

  useEffect(() => {
    const unsubscribers = [];

    const unsubUsers = onSnapshot(
      collection(db, "users"),
      (snapshot) => {
        setUsers(
          snapshot.docs.map((item) => ({
            id: item.id,
            ...item.data(),
          }))
        );
        setUsersLoading(false);
      },
      (error) => {
        console.log("users error:", error);
        setUsers([]);
        setUsersLoading(false);
      }
    );
    unsubscribers.push(unsubUsers);

    const unsubNotifications = onSnapshot(
      query(collection(db, "notifications"), orderBy("createdAt", "desc")),
      (snapshot) => {
        setAllNotifications(
          snapshot.docs.map((item) => ({
            id: item.id,
            ...item.data(),
          }))
        );
        setHistoryLoading(false);
      },
      (error) => {
        console.log("notifications error:", error);
        setAllNotifications([]);
        setHistoryLoading(false);
      }
    );
    unsubscribers.push(unsubNotifications);

    return () => {
      unsubscribers.forEach((unsubscribe) => {
        try {
          unsubscribe?.();
        } catch (error) {}
      });
    };
  }, []);

  const loading = usersLoading || historyLoading;

  const providerUsers = useMemo(() => {
    return users.filter((user) => getUserRole(user) === "service_provider");
  }, [users]);

  const adminUsers = useMemo(() => {
    return users.filter((user) => getUserRole(user) === "admin");
  }, [users]);

  const normalUsers = useMemo(() => {
    return users.filter((user) => getUserRole(user) === "user");
  }, [users]);

  const selectedUser = useMemo(() => {
    return users.find((user) => user.id === form.selectedUserId) || null;
  }, [users, form.selectedUserId]);

  const targetUsers = useMemo(() => {
    if (form.audience === "all") return users;
    if (form.audience === "users") return normalUsers;
    if (form.audience === "providers") return providerUsers;
    if (form.audience === "admins") return adminUsers;
    if (form.audience === "single_user") {
      return users.filter((user) => user.id === form.selectedUserId);
    }
    return [];
  }, [form.audience, form.selectedUserId, users, normalUsers, providerUsers, adminUsers]);

  const myRawAdminNotifications = useMemo(() => {
    const currentUid = auth.currentUser?.uid;
    if (!currentUid) return [];

    return allNotifications.filter(
      (item) => item?.isAdminNotification === true && item?.createdBy === currentUid
    );
  }, [allNotifications]);

  const groupedHistory = useMemo(() => {
    const groups = new Map();

    myRawAdminNotifications.forEach((item) => {
      const key = item?.sendGroupId || item?.id;

      if (!groups.has(key)) {
        groups.set(key, {
          id: key,
          sendGroupId: key,
          title: item?.title || "Untitled Notification",
          message: item?.message || "",
          type: item?.type || "announcement",
          audience: item?.audience || "all",
          createdAt: item?.createdAt || null,
          createdBy: item?.createdBy || null,
          recipientCount: 0,
          recipients: [],
        });
      }

      const group = groups.get(key);
      group.recipientCount += 1;

      if (item?.recipientName) {
        group.recipients.push({
          name: item.recipientName,
          role: item?.recipientRole || "user",
        });
      }
    });

    return Array.from(groups.values()).sort((a, b) => {
      const aTime = toDate(a.createdAt)?.getTime() || 0;
      const bTime = toDate(b.createdAt)?.getTime() || 0;
      return bTime - aTime;
    });
  }, [myRawAdminNotifications]);

  const historySummary = useMemo(() => {
    return {
      total: groupedHistory.length,
      all: groupedHistory.filter((item) => item?.audience === "all").length,
      providers: groupedHistory.filter((item) => item?.audience === "providers").length,
      users: groupedHistory.filter((item) => item?.audience === "users").length,
      alerts: groupedHistory.filter((item) => item?.type === "platform_alert").length,
    };
  }, [groupedHistory]);

  const filteredAnnouncements = useMemo(() => {
    if (historyFilter === "all") return groupedHistory;
    return groupedHistory.filter(
      (item) => item?.audience === historyFilter || item?.type === historyFilter
    );
  }, [groupedHistory, historyFilter]);

  const handleChange = (key, value) => {
    setForm((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const resetForm = () => {
    setForm(EMPTY_FORM);
  };

  const sendAnnouncement = async () => {
    const title = form.title.trim();
    const message = form.message.trim();

    if (!auth.currentUser?.uid) {
      Alert.alert("Error", "No signed in admin found.");
      return;
    }

    if (!title || !message) {
      Alert.alert("Missing details", "Please enter both a title and message.");
      return;
    }

    if (form.audience === "single_user" && !form.selectedUserId) {
      Alert.alert("Select user", "Please choose a user for this notification.");
      return;
    }

    if (!targetUsers.length) {
      Alert.alert("No recipients", "There are no matching users for this audience.");
      return;
    }

    try {
      setSending(true);

      const createdBy = auth.currentUser.uid;
      const batch = writeBatch(db);
      const sendGroupId = doc(collection(db, "notifications")).id;

      targetUsers.forEach((user) => {
        const notificationRef = doc(collection(db, "notifications"));

        batch.set(notificationRef, {
          sendGroupId,
          title,
          message,
          type: form.type || "announcement",
          audience: form.audience || "all",
          selectedUserId: form.selectedUserId || null,
          userId: user.id,
          recipientName: getUserName(user),
          recipientRole: getUserRole(user),
          recipientEmail: user?.email || null,
          read: false,
          createdAt: serverTimestamp(),
          createdBy,
          senderId: createdBy,
          isAdminNotification: true,
        });
      });

      await batch.commit();
      resetForm();

      Alert.alert(
        "Success",
        `Notification sent to ${targetUsers.length} account${targetUsers.length > 1 ? "s" : ""}.`
      );
    } catch (error) {
      console.log("SEND NOTIFICATION ERROR:", error);
      Alert.alert(
        "Send failed",
        error?.message || "Failed to send notification."
      );
    } finally {
      setSending(false);
    }
  };

  const typeOptions = [
    { key: "announcement", label: "Announcement", icon: "megaphone-outline" },
    { key: "feature_update", label: "Feature Update", icon: "sparkles-outline" },
    { key: "platform_alert", label: "Platform Alert", icon: "alert-circle-outline" },
    { key: "promotion", label: "Promotion", icon: "pricetag-outline" },
  ];

  const audienceOptions = [
    { key: "all", label: "All Accounts" },
    { key: "users", label: "Users" },
    { key: "providers", label: "Providers" },
    { key: "admins", label: "Admins" },
    { key: "single_user", label: "Single User" },
  ];

  const historyFilters = [
    { key: "all", label: "All" },
    { key: "users", label: "Users" },
    { key: "providers", label: "Providers" },
    { key: "admins", label: "Admins" },
    { key: "platform_alert", label: "Alerts" },
  ];

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
              <Text style={styles.headerBadge}>Notifications Panel</Text>
            </View>

            <View style={styles.headerIconWrap}>
              <Ionicons name="notifications-outline" size={20} color="#7C3AED" />
            </View>
          </View>

          <Text style={styles.title}>Announcements and Alerts</Text>
          <Text style={styles.subtitle}>
            Send platform wide notifications, announce updates and features, and push alerts to users or providers
          </Text>
        </View>

        <View style={styles.summaryGrid}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Announcements</Text>
            <Text style={styles.summaryValue}>{formatNumber(historySummary.total)}</Text>
          </View>

          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>All Accounts</Text>
            <Text style={styles.summaryValue}>{formatNumber(historySummary.all)}</Text>
          </View>

          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Users</Text>
            <Text style={styles.summaryValue}>{formatNumber(historySummary.users)}</Text>
          </View>

          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Providers</Text>
            <Text style={styles.summaryValue}>{formatNumber(historySummary.providers)}</Text>
          </View>

          <View style={styles.summaryCardWide}>
            <View style={styles.summaryWideLeft}>
              <Ionicons name="alert-circle-outline" size={18} color="#B45309" />
              <Text style={styles.summaryWideLabel}>Platform Alerts</Text>
            </View>
            <Text style={styles.summaryWideValue}>{formatNumber(historySummary.alerts)}</Text>
          </View>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Create Notification</Text>
          <Text style={styles.sectionSubtitle}>
            Send an announcement or alert to a selected audience
          </Text>

          <Text style={styles.fieldLabel}>Title</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter notification title"
            placeholderTextColor="#9CA3AF"
            value={form.title}
            onChangeText={(text) => handleChange("title", text)}
          />

          <Text style={styles.fieldLabel}>Message</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Enter notification message"
            placeholderTextColor="#9CA3AF"
            value={form.message}
            onChangeText={(text) => handleChange("message", text)}
            multiline
            textAlignVertical="top"
          />

          <Text style={styles.fieldLabel}>Type</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.optionRow}
          >
            {typeOptions.map((item) => {
              const active = form.type === item.key;
              return (
                <TouchableOpacity
                  key={item.key}
                  style={[styles.optionChip, active && styles.optionChipActive]}
                  onPress={() => handleChange("type", item.key)}
                  activeOpacity={0.85}
                >
                  <Ionicons
                    name={item.icon}
                    size={15}
                    color={active ? "#FFFFFF" : "#374151"}
                  />
                  <Text
                    style={[
                      styles.optionChipText,
                      active && styles.optionChipTextActive,
                    ]}
                  >
                    {item.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <Text style={styles.fieldLabel}>Audience</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.optionRow}
          >
            {audienceOptions.map((item) => {
              const active = form.audience === item.key;
              return (
                <TouchableOpacity
                  key={item.key}
                  style={[styles.optionChip, active && styles.optionChipActive]}
                  onPress={() => handleChange("audience", item.key)}
                  activeOpacity={0.85}
                >
                  <Text
                    style={[
                      styles.optionChipText,
                      active && styles.optionChipTextActive,
                    ]}
                  >
                    {item.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {form.audience === "single_user" ? (
            <>
              <Text style={styles.fieldLabel}>Selected User</Text>
              <TouchableOpacity
                style={styles.selectorButton}
                onPress={() => setUserPickerVisible(true)}
                activeOpacity={0.85}
              >
                <View style={styles.selectorLeft}>
                  <Ionicons name="person-outline" size={16} color="#6B7280" />
                  <Text style={styles.selectorText}>
                    {selectedUser ? getUserName(selectedUser) : "Choose a user"}
                  </Text>
                </View>
                <Ionicons name="chevron-forward-outline" size={16} color="#9CA3AF" />
              </TouchableOpacity>
            </>
          ) : null}

          <View style={styles.recipientPreviewCard}>
            <Text style={styles.recipientPreviewLabel}>Recipient Preview</Text>
            <Text style={styles.recipientPreviewValue}>
              {formatNumber(targetUsers.length)} recipient{targetUsers.length !== 1 ? "s" : ""}
            </Text>
            <Text style={styles.recipientPreviewMeta}>
              Audience: {getAudienceLabel(form.audience)}
            </Text>
          </View>

          <View style={styles.formActionRow}>
            <TouchableOpacity
              style={styles.resetButton}
              onPress={resetForm}
              activeOpacity={0.85}
            >
              <Text style={styles.resetButtonText}>Reset</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.sendButton}
              onPress={sendAnnouncement}
              disabled={sending}
              activeOpacity={0.85}
            >
              {sending ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="paper-plane-outline" size={16} color="#FFFFFF" />
                  <Text style={styles.sendButtonText}>Send Notification</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Sent History</Text>
          <Text style={styles.sectionSubtitle}>
            Review previously sent notifications from the notifications collection
          </Text>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.optionRow}
          >
            {historyFilters.map((item) => {
              const active = historyFilter === item.key;

              return (
                <TouchableOpacity
                  key={item.key}
                  style={[styles.optionChipSmall, active && styles.optionChipSmallActive]}
                  onPress={() => setHistoryFilter(item.key)}
                  activeOpacity={0.85}
                >
                  <Text
                    style={[
                      styles.optionChipSmallText,
                      active && styles.optionChipSmallTextActive,
                    ]}
                  >
                    {item.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {loading ? (
            <View style={styles.stateWrap}>
              <ActivityIndicator size="large" color="#7C3AED" />
              <Text style={styles.stateText}>Loading notifications...</Text>
            </View>
          ) : filteredAnnouncements.length === 0 ? (
            <View style={styles.stateWrap}>
              <Ionicons name="mail-open-outline" size={28} color="#9CA3AF" />
              <Text style={styles.stateTitle}>No sent history found</Text>
              <Text style={styles.stateText}>
                Send one notification and it will appear here
              </Text>
            </View>
          ) : (
            <View style={styles.list}>
              {filteredAnnouncements.map((item) => (
                <View key={item.id} style={styles.historyCard}>
                  <View style={styles.historyTopRow}>
                    <View style={styles.historyLeft}>
                      <View style={styles.historyIconWrap}>
                        <Ionicons
                          name={
                            item?.type === "platform_alert"
                              ? "alert-circle-outline"
                              : item?.type === "feature_update"
                              ? "sparkles-outline"
                              : item?.type === "promotion"
                              ? "pricetag-outline"
                              : "megaphone-outline"
                          }
                          size={18}
                          color="#7C3AED"
                        />
                      </View>

                      <View style={styles.historyTextWrap}>
                        <Text style={styles.historyTitle} numberOfLines={1}>
                          {item?.title || "Untitled Notification"}
                        </Text>
                        <Text style={styles.historyMeta}>
                          {getAnnouncementTypeLabel(item?.type)} · {getTimeAgo(item?.createdAt)}
                        </Text>
                      </View>
                    </View>
                  </View>

                  <Text style={styles.historyMessage}>
                    {item?.message || "No message"}
                  </Text>

                  <View style={styles.badgesRow}>
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>
                        {getAudienceLabel(item?.audience)}
                      </Text>
                    </View>

                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>
                        {formatNumber(item?.recipientCount || 0)} recipients
                      </Text>
                    </View>

                    {item?.recipients?.slice(0, 2).map((recipient, index) => (
                      <View key={`${item.id}-${index}`} style={styles.badge}>
                        <Text style={styles.badgeText}>
                          {recipient.name}
                        </Text>
                      </View>
                    ))}

                    {item?.recipientCount > 2 ? (
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>
                          +{item.recipientCount - 2} more
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      <Modal
        visible={userPickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setUserPickerVisible(false)}
      >
        <View style={styles.modalRoot}>
          <Pressable
            style={styles.modalOverlay}
            onPress={() => setUserPickerVisible(false)}
          />

          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select User</Text>
              <TouchableOpacity
                style={styles.modalCloseButton}
                onPress={() => setUserPickerVisible(false)}
                activeOpacity={0.85}
              >
                <Ionicons name="close" size={18} color="#111827" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {users.length === 0 ? (
                <View style={styles.emptyWrap}>
                  <Text style={styles.emptyText}>No users available</Text>
                </View>
              ) : (
                users.map((user) => (
                  <TouchableOpacity
                    key={user.id}
                    style={styles.userPickRow}
                    onPress={() => {
                      handleChange("selectedUserId", user.id);
                      setUserPickerVisible(false);
                    }}
                    activeOpacity={0.85}
                  >
                    <View style={styles.userPickLeft}>
                      <View style={styles.userPickAvatar}>
                        <Ionicons name="person" size={16} color="#111827" />
                      </View>

                      <View style={styles.userPickTextWrap}>
                        <Text style={styles.userPickName}>{getUserName(user)}</Text>
                        <Text style={styles.userPickRole}>{getUserRole(user)}</Text>
                      </View>
                    </View>

                    {form.selectedUserId === user.id ? (
                      <Ionicons
                        name="checkmark-circle"
                        size={18}
                        color="#16A34A"
                      />
                    ) : null}
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
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
    paddingBottom: 24,
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

  summaryGrid: {
    marginBottom: 14,
  },
  summaryCard: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E9EEF5",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 12,
  },
  summaryCardWide: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#FDE7C7",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  summaryLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#64748B",
  },
  summaryValue: {
    marginTop: 6,
    fontSize: 22,
    fontWeight: "900",
    color: "#111827",
  },
  summaryWideLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  summaryWideLabel: {
    marginLeft: 8,
    fontSize: 12,
    fontWeight: "700",
    color: "#92400E",
  },
  summaryWideValue: {
    fontSize: 24,
    fontWeight: "900",
    color: "#92400E",
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
  },

  fieldLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: "#374151",
    marginBottom: 8,
    marginTop: 8,
  },
  input: {
    height: 46,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    paddingHorizontal: 12,
    fontSize: 13,
    color: "#111827",
    fontWeight: "600",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  textArea: {
    height: 110,
    paddingTop: 12,
  },

  optionRow: {
    paddingBottom: 10,
  },
  optionChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    marginRight: 8,
  },
  optionChipActive: {
    backgroundColor: "#111827",
    borderColor: "#111827",
  },
  optionChipText: {
    marginLeft: 6,
    fontSize: 12,
    fontWeight: "700",
    color: "#374151",
  },
  optionChipTextActive: {
    color: "#FFFFFF",
  },

  optionChipSmall: {
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    marginRight: 8,
  },
  optionChipSmallActive: {
    backgroundColor: "#111827",
    borderColor: "#111827",
  },
  optionChipSmallText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#374151",
  },
  optionChipSmallTextActive: {
    color: "#FFFFFF",
  },

  selectorButton: {
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "space-between",
    flexDirection: "row",
  },
  selectorLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  selectorText: {
    marginLeft: 8,
    fontSize: 13,
    fontWeight: "600",
    color: "#111827",
  },

  recipientPreviewCard: {
    backgroundColor: "#FAFAFB",
    borderWidth: 1,
    borderColor: "#EEF2F7",
    borderRadius: 16,
    padding: 12,
    marginTop: 12,
  },
  recipientPreviewLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#94A3B8",
  },
  recipientPreviewValue: {
    marginTop: 4,
    fontSize: 18,
    fontWeight: "900",
    color: "#111827",
  },
  recipientPreviewMeta: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: "600",
    color: "#6B7280",
  },

  formActionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 14,
  },
  resetButton: {
    flex: 1,
    marginRight: 8,
    backgroundColor: "#F3F4F6",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  resetButtonText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#374151",
  },
  sendButton: {
    flex: 1.5,
    backgroundColor: "#111827",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  sendButtonText: {
    marginLeft: 6,
    fontSize: 12,
    fontWeight: "800",
    color: "#FFFFFF",
  },

  list: {
    gap: 12,
    marginTop: 4,
  },
  historyCard: {
    backgroundColor: "#FAFAFB",
    borderWidth: 1,
    borderColor: "#EEF2F7",
    borderRadius: 18,
    padding: 14,
  },
  historyTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  historyLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  historyIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: "#F5F3FF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  historyTextWrap: {
    flex: 1,
  },
  historyTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#111827",
  },
  historyMeta: {
    marginTop: 4,
    fontSize: 12,
    color: "#94A3B8",
    fontWeight: "600",
  },
  historyMessage: {
    fontSize: 13,
    lineHeight: 19,
    color: "#374151",
    fontWeight: "600",
    marginBottom: 12,
  },
  badgesRow: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  badge: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    marginRight: 8,
    marginBottom: 8,
  },
  badgeText: {
    fontSize: 11,
    color: "#4B5563",
    fontWeight: "800",
    textTransform: "capitalize",
  },

  stateWrap: {
    paddingVertical: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  stateTitle: {
    marginTop: 10,
    fontSize: 16,
    fontWeight: "800",
    color: "#111827",
  },
  stateText: {
    marginTop: 6,
    fontSize: 12,
    color: "#9CA3AF",
    textAlign: "center",
  },

  modalRoot: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.18)",
  },
  modalCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    padding: 16,
    maxHeight: "80%",
    borderWidth: 1,
    borderColor: "#E9EEF5",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#111827",
  },
  modalCloseButton: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  userPickRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#FAFAFB",
    borderWidth: 1,
    borderColor: "#EEF2F7",
    borderRadius: 16,
    padding: 12,
    marginBottom: 10,
  },
  userPickLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: 10,
  },
  userPickAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  userPickTextWrap: {
    flex: 1,
  },
  userPickName: {
    fontSize: 13,
    fontWeight: "800",
    color: "#111827",
  },
  userPickRole: {
    marginTop: 4,
    fontSize: 11,
    color: "#6B7280",
    fontWeight: "600",
    textTransform: "capitalize",
  },

  emptyWrap: {
    paddingVertical: 20,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 12,
    color: "#6B7280",
    fontWeight: "600",
  },
});
import React, { useEffect, useState } from "react";
import {
  
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StatusBar,
} from "react-native";
import { Ionicons, MaterialIcons, Feather } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  collection,
  onSnapshot,
  query,
  updateDoc,
  doc,
  where,
  writeBatch,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { useRouter } from "expo-router";
import { auth, db } from "../../config/firebase";

export default function NotificationsScreen() {
  const router = useRouter();

  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user || null);
    });

    return unsubscribeAuth;
  }, []);

  useEffect(() => {
    if (!currentUser?.uid) {
      setNotifications([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const notificationsQuery = query(
      collection(db, "notifications"),
      where("userId", "==", currentUser.uid)
    );

    const unsubscribe = onSnapshot(
      notificationsQuery,
      (snapshot) => {
        const data = snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        }));

        data.sort((a, b) => getMillis(b.createdAt) - getMillis(a.createdAt));

        setNotifications(data);
        setLoading(false);
      },
      (error) => {
        console.log("Error fetching notifications:", error);
        setLoading(false);
        Alert.alert("Error", error.message || "Could not load notifications.");
      }
    );

    return unsubscribe;
  }, [currentUser]);

  const formatTimeAgo = (timestamp) => {
    if (!timestamp) return "Just now";

    let date;

    if (timestamp?.toDate) {
      date = timestamp.toDate();
    } else {
      date = new Date(timestamp);
    }

    const now = new Date();
    const diffMs = now - date;

    const minutes = Math.floor(diffMs / 60000);
    const hours = Math.floor(diffMs / 3600000);
    const days = Math.floor(diffMs / 86400000);

    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes} min ago`;
    if (hours < 24) return `${hours} hour${hours > 1 ? "s" : ""} ago`;
    return `${days} day${days > 1 ? "s" : ""} ago`;
  };

  const getNotificationMeta = (type) => {
    switch (type) {
      case "like":
        return {
          iconType: "Ionicons",
          icon: "heart",
          bg: "#FEECEF",
          color: "#FF4D6D",
        };
      case "follow":
        return {
          iconType: "Ionicons",
          icon: "person-add",
          bg: "#EEF4FF",
          color: "#4A63FF",
        };
      case "comment":
        return {
          iconType: "Ionicons",
          icon: "chatbubble",
          bg: "#F3EEFF",
          color: "#7C3AED",
        };
      case "message":
        return {
          iconType: "Ionicons",
          icon: "paper-plane",
          bg: "#E7FFF6",
          color: "#0F9D7A",
        };
      case "upload":
        return {
          iconType: "Feather",
          icon: "upload",
          bg: "#FFF5E8",
          color: "#F59E0B",
        };
      case "system":
        return {
          iconType: "Feather",
          icon: "check-circle",
          bg: "#ECFDF3",
          color: "#16A34A",
        };
      default:
        return {
          iconType: "MaterialIcons",
          icon: "notifications",
          bg: "#EEF1FF",
          color: "#4A63FF",
        };
    }
  };

  const renderIcon = (item) => {
    const meta = getNotificationMeta(item.type);

    if (meta.iconType === "Ionicons") {
      return <Ionicons name={meta.icon} size={20} color={meta.color} />;
    }

    if (meta.iconType === "MaterialIcons") {
      return <MaterialIcons name={meta.icon} size={20} color={meta.color} />;
    }

    return <Feather name={meta.icon} size={20} color={meta.color} />;
  };

  const handleNotificationPress = async (item) => {
    try {
      if (!item.read) {
        await updateDoc(doc(db, "notifications", item.id), {
          read: true,
        });
      }

      if (item.type === "message") {
        router.push("/users/dms");
      }
    } catch (error) {
      console.log("Error handling notification:", error);
      Alert.alert("Error", "Could not open notification.");
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      const unreadNotifications = notifications.filter((item) => !item.read);

      if (unreadNotifications.length === 0) {
        Alert.alert("Done", "All notifications are already read.");
        return;
      }

      setMarkingAll(true);

      const batch = writeBatch(db);

      unreadNotifications.forEach((item) => {
        const notificationRef = doc(db, "notifications", item.id);
        batch.update(notificationRef, { read: true });
      });

      await batch.commit();
      Alert.alert("Success", "All notifications marked as read.");
    } catch (error) {
      console.log("Error marking all as read:", error);
      Alert.alert("Error", "Could not mark all notifications as read.");
    } finally {
      setMarkingAll(false);
    }
  };

  const unreadCount = notifications.filter((item) => !item.read).length;

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <StatusBar barStyle="dark-content" backgroundColor="#F6F7FB" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.headerCard}>
          <Text style={styles.logo}>ArtLinker</Text>
          <Text style={styles.headerTitle}>Notifications</Text>
          <Text style={styles.subheading}>
            Stay updated with likes, follows, comments, messages, and recent account activity.
          </Text>

          <View style={styles.headerBottomRow}>
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadBadgeText}>{unreadCount} unread</Text>
            </View>

            <TouchableOpacity
              style={styles.markAllButton}
              onPress={handleMarkAllAsRead}
              disabled={markingAll}
            >
              <Text style={styles.markAllText}>
                {markingAll ? "Updating..." : "Mark all as read"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {loading ? (
          <View style={styles.centerBox}>
            <ActivityIndicator size="large" color="#4A63FF" />
            <Text style={styles.loadingText}>Loading notifications...</Text>
          </View>
        ) : notifications.length === 0 ? (
          <View style={styles.emptyBox}>
            <Ionicons name="notifications-outline" size={50} color="#B9BFCD" />
            <Text style={styles.emptyTitle}>No notifications yet</Text>
            <Text style={styles.emptyText}>
              Likes, follows, comments, and messages will appear here.
            </Text>
          </View>
        ) : (
          <View style={styles.listWrapper}>
            {notifications.map((item) => {
              const meta = getNotificationMeta(item.type);

              return (
                <TouchableOpacity
                  key={item.id}
                  style={[
                    styles.card,
                    item.read ? styles.cardRead : styles.cardUnread,
                    item.type === "message" && !item.read
                      ? styles.dmCardUnread
                      : null,
                  ]}
                  activeOpacity={0.9}
                  onPress={() => handleNotificationPress(item)}
                >
                  <View
                    style={[
                      styles.iconWrapper,
                      { backgroundColor: item.read ? "#E8E8EC" : meta.bg },
                    ]}
                  >
                    {renderIcon(item)}
                  </View>

                  <View style={styles.textContent}>
                    <View style={styles.topRow}>
                      <Text
                        style={[
                          styles.cardTitle,
                          item.read && styles.readTitle,
                        ]}
                      >
                        {item.title || "Notification"}
                      </Text>

                      <Text style={styles.timeText}>
                        {formatTimeAgo(item.createdAt)}
                      </Text>
                    </View>

                    <Text
                      style={[
                        styles.cardMessage,
                        item.read && styles.readMessage,
                      ]}
                    >
                      {item.message || "You have a new notification."}
                    </Text>

                    <View style={styles.footerRow}>
                      {item.type === "message" ? (
                        <View
                          style={[
                            styles.typePill,
                            item.read ? styles.typePillRead : styles.dmPill,
                          ]}
                        >
                          <Text
                            style={[
                              styles.typePillText,
                              item.read
                                ? styles.typePillTextRead
                                : styles.dmPillText,
                            ]}
                          >
                            Open DM
                          </Text>
                        </View>
                      ) : (
                        <View
                          style={[
                            styles.typePill,
                            item.read ? styles.typePillRead : styles.defaultPill,
                          ]}
                        >
                          <Text
                            style={[
                              styles.typePillText,
                              item.read
                                ? styles.typePillTextRead
                                : styles.defaultPillText,
                            ]}
                          >
                            {item.type || "activity"}
                          </Text>
                        </View>
                      )}

                      {!item.read && <View style={styles.unreadDot} />}
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function getMillis(value) {
  if (!value) return 0;
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (typeof value?.seconds === "number") return value.seconds * 1000;
  return 0;
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#F6F7FB",
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 28,
  },
  headerCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    padding: 18,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: "#ECECF2",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  logo: {
    fontSize: 28,
    fontWeight: "800",
    color: "#F06CE9",
    marginBottom: 8,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "800",
    color: "#1F1F1F",
  },
  subheading: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 20,
    color: "#8B90A0",
  },
  headerBottomRow: {
    marginTop: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  unreadBadge: {
    backgroundColor: "#EEF1FF",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
  },
  unreadBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#4A63FF",
  },
  markAllButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: "#F3F4F8",
  },
  markAllText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#4A63FF",
  },
  listWrapper: {
    gap: 12,
  },
  card: {
    flexDirection: "row",
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardUnread: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E7EAF3",
  },
  cardRead: {
    backgroundColor: "#F1F2F5",
    borderColor: "#DEDFE5",
  },
  dmCardUnread: {
    borderColor: "#B8F0DF",
    backgroundColor: "#F7FFFB",
  },
  iconWrapper: {
    width: 46,
    height: 46,
    borderRadius: 23,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
    marginTop: 2,
  },
  textContent: {
    flex: 1,
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 6,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#1F2937",
    flex: 1,
    marginRight: 10,
  },
  readTitle: {
    color: "#7A7F8E",
  },
  timeText: {
    fontSize: 11,
    color: "#9AA0AF",
  },
  cardMessage: {
    fontSize: 13,
    lineHeight: 19,
    color: "#596070",
  },
  readMessage: {
    color: "#8C919F",
  },
  footerRow: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  typePill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  defaultPill: {
    backgroundColor: "#EEF1FF",
  },
  defaultPillText: {
    color: "#4A63FF",
  },
  dmPill: {
    backgroundColor: "#E7FFF6",
  },
  dmPillText: {
    color: "#0F9D7A",
  },
  typePillRead: {
    backgroundColor: "#E3E4E9",
  },
  typePillText: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "capitalize",
  },
  typePillTextRead: {
    color: "#7F8491",
  },
  unreadDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: "#4A63FF",
  },
  centerBox: {
    paddingVertical: 50,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    marginTop: 10,
    fontSize: 14,
    color: "#777",
  },
  emptyBox: {
    marginTop: 48,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  emptyTitle: {
    marginTop: 14,
    fontSize: 18,
    fontWeight: "700",
    color: "#333",
  },
  emptyText: {
    marginTop: 6,
    fontSize: 13,
    color: "#8D8D95",
    textAlign: "center",
    lineHeight: 20,
  },
});
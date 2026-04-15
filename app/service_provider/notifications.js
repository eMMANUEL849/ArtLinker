import React, { useEffect, useState } from "react";
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  doc,
  where,
} from "firebase/firestore";
import { auth, db } from "../../config/firebase";

export default function ServiceProviderNotificationsScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    let unsubNotifications = null;

    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (!user) {
        setLoading(false);
        router.replace("/auth/login");
        return;
      }

      const notificationsQuery = query(
        collection(db, "notifications"),
        where("userId", "==", user.uid)
      );

      unsubNotifications = onSnapshot(
        notificationsQuery,
        (snapshot) => {
          const items = snapshot.docs.map((docSnap) => ({
            id: docSnap.id,
            ...docSnap.data(),
          }));

          items.sort((a, b) => {
            const aTime = a.createdAt?.seconds || 0;
            const bTime = b.createdAt?.seconds || 0;
            return bTime - aTime;
          });

          setNotifications(items);
          setLoading(false);
        },
        (error) => {
          console.log("Notifications error:", error);
          setLoading(false);
        }
      );
    });

    return () => {
      unsubAuth();
      if (unsubNotifications) unsubNotifications();
    };
  }, [router]);

  const markAsRead = async (id) => {
    try {
      await updateDoc(doc(db, "notifications", id), {
        read: true,
      });
    } catch (error) {
      console.log("Mark as read error:", error);
    }
  };

  const renderItem = ({ item }) => (
    <TouchableOpacity
      style={[styles.card, item.read && styles.cardRead]}
      onPress={() => markAsRead(item.id)}
    >
      <View style={styles.iconWrap}>
        <Ionicons
          name={item.read ? "mail-open-outline" : "notifications-outline"}
          size={20}
          color="#4F6BFF"
        />
      </View>

      <View style={styles.content}>
        <Text style={styles.title}>{item.title || "Notification"}</Text>
        <Text style={styles.message}>
          {item.message || "You have a new notification."}
        </Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back-outline" size={22} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notifications</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color="#4F6BFF" />
          <Text style={styles.loadingText}>Loading notifications...</Text>
        </View>
      ) : notifications.length === 0 ? (
        <View style={styles.centerBox}>
          <Ionicons name="notifications-off-outline" size={42} color="#9CA3AF" />
          <Text style={styles.emptyTitle}>No notifications yet</Text>
          <Text style={styles.emptyText}>
            Your notifications from Firebase will appear here.
          </Text>
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#F7F8FC",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#111827",
  },
  centerBox: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  loadingText: {
    marginTop: 10,
    color: "#6B7280",
    fontSize: 14,
  },
  emptyTitle: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: "800",
    color: "#111827",
  },
  emptyText: {
    marginTop: 6,
    fontSize: 13,
    color: "#6B7280",
    textAlign: "center",
  },
  listContent: {
    padding: 14,
    paddingBottom: 30,
  },
  card: {
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardRead: {
    backgroundColor: "#E5E7EB",
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#EEF2FF",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  content: {
    flex: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: "800",
    color: "#111827",
  },
  message: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 18,
    color: "#6B7280",
  },
});
import React, { useEffect, useMemo, useState } from "react";
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { useRouter } from "expo-router";
import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { auth, db } from "../../config/firebase";

function getInitials(name) {
  if (!name) return "SP";
  const parts = name.trim().split(" ").filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
}

export default function ServiceProviderHomeScreen() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [providerName, setProviderName] = useState("Service Provider");
  const [reviews, setReviews] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [notifications, setNotifications] = useState([]);

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.log("Logout error:", error);
    }
  };

  useEffect(() => {
    let unsubUserDoc = null;
    let unsubReviews = null;
    let unsubJobs = null;
    let unsubNotifications = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (!user) {
        setLoading(false);
        router.replace("/auth/login");
        return;
      }

      const userRef = doc(db, "users", user.uid);

      unsubUserDoc = onSnapshot(
        userRef,
        (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            setProviderName(
              data.businessName ||
                data.fullName ||
                user.displayName ||
                "Service Provider"
            );
          } else {
            setProviderName(user.displayName || "Service Provider");
          }
        },
        (error) => {
          console.log("User load error:", error);
        }
      );

      const reviewsQuery = query(
        collection(db, "reviews"),
        where("providerId", "==", user.uid)
      );

      unsubReviews = onSnapshot(
        reviewsQuery,
        (snapshot) => {
          const items = snapshot.docs.map((docSnap) => ({
            id: docSnap.id,
            ...docSnap.data(),
          }));
          setReviews(items);
        },
        (error) => {
          console.log("Reviews load error:", error);
        }
      );

      const jobsQuery = query(
        collection(db, "jobs"),
        where("providerId", "==", user.uid)
      );

      unsubJobs = onSnapshot(
        jobsQuery,
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

          setJobs(items);
        },
        (error) => {
          console.log("Jobs load error:", error);
        }
      );

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
          console.log("Notifications load error:", error);
          setLoading(false);
        }
      );
    });

    return () => {
      unsubscribeAuth();
      if (unsubUserDoc) unsubUserDoc();
      if (unsubReviews) unsubReviews();
      if (unsubJobs) unsubJobs();
      if (unsubNotifications) unsubNotifications();
    };
  }, [router]);

  const stats = useMemo(() => {
    const activeJobs = jobs.filter(
      (job) => !["Completed", "Resolved", "Closed"].includes(job.status)
    ).length;

    const pendingRequests = jobs.filter((job) =>
      ["Pending", "Requested", "Awaiting Response"].includes(job.status)
    ).length;

    const completedJobs = jobs.filter((job) =>
      ["Completed", "Resolved", "Closed"].includes(job.status)
    ).length;

    const rating =
      reviews.length > 0
        ? (
            reviews.reduce((sum, item) => sum + Number(item.rating || 0), 0) /
            reviews.length
          ).toFixed(1)
        : "0.0";

    return [
      {
        id: "1",
        label: "Active Jobs",
        value: String(activeJobs),
        icon: "briefcase-outline",
      },
      {
        id: "2",
        label: "Pending Requests",
        value: String(pendingRequests),
        icon: "time-outline",
      },
      {
        id: "3",
        label: "Completed",
        value: String(completedJobs),
        icon: "checkmark-done-outline",
      },
      {
        id: "4",
        label: "Rating",
        value: rating,
        icon: "star-outline",
      },
    ];
  }, [jobs, reviews]);

  const recentJobs = useMemo(() => {
    return jobs.slice(0, 5).map((job) => ({
      id: job.id,
      title: job.title || job.serviceName || "Untitled Job",
      client:
        job.clientName ||
        job.customerName ||
        job.userName ||
        "Unknown Client",
      status: job.status || "Pending",
    }));
  }, [jobs]);

  const unreadNotificationCount = useMemo(() => {
    return notifications.filter((item) => !item.read).length;
  }, [notifications]);

  const getStatusStyle = (status) => {
    if (["Completed", "Resolved", "Closed"].includes(status)) {
      return styles.statusCompleted;
    }
    if (["In Progress", "Ongoing", "Accepted"].includes(status)) {
      return styles.statusInProgress;
    }
    return styles.statusPending;
  };

  const quickActions = [
    {
      id: "1",
      title: "My Shop",
      icon: "storefront-outline",
      onPress: () => router.push("/service_provider/myshop"),
    },
    {
      id: "2",
      title: "Upload Product",
      icon: "cloud-upload-outline",
      onPress: () => router.push("/service_provider/upload"),
    },
    {
      id: "3",
      title: "Earnings",
      icon: "cash-outline",
      onPress: () => router.push("/service_provider/earnings"),
    },
    {
      id: "4",
      title: "Profile",
      icon: "person-outline",
      onPress: () => router.push("/service_provider/profile"),
    },
  ];

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.brandWrap}>
            <Text style={styles.brandTitle}>ArtLinker</Text>
            <Text style={styles.brandSubtitle}>Service Provider Dashboard</Text>
          </View>

          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.iconButton}
              activeOpacity={0.85}
              onPress={() => router.push("/service_provider/notifications")}
            >
              <Ionicons
                name="notifications-outline"
                size={22}
                color="#111827"
              />
              {unreadNotificationCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {unreadNotificationCount > 99
                      ? "99+"
                      : unreadNotificationCount}
                  </Text>
                </View>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.iconButton}
              activeOpacity={0.85}
              onPress={handleLogout}
            >
              <Ionicons name="log-out-outline" size={22} color="#111827" />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.heroCard}>
          <View style={styles.avatarWrap}>
            <Text style={styles.avatarText}>{getInitials(providerName)}</Text>
          </View>

          <Text style={styles.welcomeText}>Welcome back</Text>
          <Text style={styles.providerName}>{providerName}</Text>
          <Text style={styles.heroDescription}>
            Manage products, jobs, earnings, and customer activity from one
            professional dashboard.
          </Text>
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#4F46E5" />
            <Text style={styles.loadingText}>Loading dashboard...</Text>
          </View>
        ) : (
          <>
            <View style={styles.statsGrid}>
              {stats.map((item) => (
                <View key={item.id} style={styles.statCard}>
                  <View style={styles.statIconWrap}>
                    <Ionicons name={item.icon} size={20} color="#4F46E5" />
                  </View>
                  <Text style={styles.statValue}>{item.value}</Text>
                  <Text style={styles.statLabel}>{item.label}</Text>
                </View>
              ))}
            </View>

            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Quick Actions</Text>
                <Text style={styles.sectionSubtitle}>
                  Access your main tools instantly
                </Text>
              </View>

              <View style={styles.quickActionsGrid}>
                {quickActions.map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    style={styles.quickActionCard}
                    activeOpacity={0.9}
                    onPress={item.onPress}
                  >
                    <View style={styles.quickActionIconWrap}>
                      <Ionicons name={item.icon} size={22} color="#4F46E5" />
                    </View>
                    <Text style={styles.quickActionText}>{item.title}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Recent Jobs</Text>
                <Text style={styles.sectionSubtitle}>
                  Latest customer activity
                </Text>
              </View>

              {recentJobs.length === 0 ? (
                <View style={styles.emptyState}>
                  <Ionicons
                    name="briefcase-outline"
                    size={42}
                    color="#9CA3AF"
                  />
                  <Text style={styles.emptyStateTitle}>No jobs available</Text>
                  <Text style={styles.emptyStateText}>
                    Your recent jobs will appear here once they are added.
                  </Text>
                </View>
              ) : (
                recentJobs.map((job, index) => (
                  <View
                    key={job.id}
                    style={[
                      styles.jobRow,
                      index === recentJobs.length - 1 && styles.lastJobRow,
                    ]}
                  >
                    <View style={styles.jobIconWrap}>
                      <Ionicons
                        name="briefcase-outline"
                        size={18}
                        color="#4F46E5"
                      />
                    </View>

                    <View style={styles.jobInfo}>
                      <Text style={styles.jobTitle}>{job.title}</Text>
                      <Text style={styles.jobClient}>
                        Client: {job.client}
                      </Text>
                    </View>

                    <View style={[styles.statusBadge, getStatusStyle(job.status)]}>
                      <Text style={styles.statusText}>{job.status}</Text>
                    </View>
                  </View>
                ))
              )}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#F6F8FC",
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 28,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  brandWrap: {
    flex: 1,
    paddingRight: 10,
  },
  brandTitle: {
    fontSize: 28,
    fontWeight: "800",
    color: "#111827",
    letterSpacing: 0.3,
  },
  brandSubtitle: {
    marginTop: 4,
    fontSize: 12,
    color: "#6B7280",
    fontWeight: "500",
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
  },
  iconButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 10,
    position: "relative",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  badge: {
    position: "absolute",
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#EF4444",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 4,
  },
  badgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "800",
  },
  heroCard: {
    marginTop: 18,
    backgroundColor: "#111827",
    borderRadius: 24,
    padding: 20,
  },
  avatarWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#374151",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 14,
  },
  avatarText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "900",
  },
  welcomeText: {
    fontSize: 13,
    color: "#C7D2FE",
    fontWeight: "700",
  },
  providerName: {
    marginTop: 6,
    fontSize: 24,
    color: "#FFFFFF",
    fontWeight: "900",
  },
  heroDescription: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 20,
    color: "#D1D5DB",
  },
  loadingContainer: {
    paddingVertical: 72,
    alignItems: "center",
  },
  loadingText: {
    marginTop: 10,
    fontSize: 14,
    color: "#6B7280",
    fontWeight: "500",
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginTop: 18,
  },
  statCard: {
    width: "48%",
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  statIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#EEF2FF",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  statValue: {
    fontSize: 24,
    fontWeight: "900",
    color: "#111827",
  },
  statLabel: {
    marginTop: 4,
    fontSize: 12,
    color: "#6B7280",
    fontWeight: "700",
  },
  sectionCard: {
    marginTop: 16,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 16,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  sectionHeader: {
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#111827",
  },
  sectionSubtitle: {
    marginTop: 4,
    fontSize: 12,
    color: "#9CA3AF",
    fontWeight: "500",
  },
  quickActionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  quickActionCard: {
    width: "48%",
    backgroundColor: "#F9FAFB",
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 12,
    alignItems: "center",
    marginBottom: 10,
  },
  quickActionIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#EEF2FF",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 10,
  },
  quickActionText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#111827",
    textAlign: "center",
  },
  emptyState: {
    paddingVertical: 32,
    alignItems: "center",
  },
  emptyStateTitle: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: "800",
    color: "#111827",
  },
  emptyStateText: {
    marginTop: 6,
    fontSize: 12,
    color: "#8B909C",
    textAlign: "center",
    lineHeight: 18,
    paddingHorizontal: 16,
  },
  jobRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  lastJobRow: {
    borderBottomWidth: 0,
  },
  jobIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#EEF2FF",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  jobInfo: {
    flex: 1,
  },
  jobTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#111827",
  },
  jobClient: {
    marginTop: 4,
    fontSize: 12,
    color: "#6B7280",
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  statusPending: {
    backgroundColor: "#FEF3C7",
  },
  statusInProgress: {
    backgroundColor: "#DBEAFE",
  },
  statusCompleted: {
    backgroundColor: "#DCFCE7",
  },
  statusText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#111827",
  },
});
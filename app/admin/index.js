import React, { useEffect, useMemo, useState } from "react";
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  Alert,
  StatusBar,
  Modal,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { Ionicons, Feather } from "@expo/vector-icons";
import { signOut } from "firebase/auth";
import { useRouter } from "expo-router";
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";

import { auth, db } from "../../config/firebase";

const DEFAULT_IMAGE =
  "https://via.placeholder.com/300x300.png?text=Artwork";

function formatNumber(value) {
  return Number(value || 0).toLocaleString();
}

function formatCurrency(value) {
  return `£${Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function getDisplayName(userData, currentUser) {
  return (
    userData?.displayName ||
    userData?.name ||
    currentUser?.displayName ||
    currentUser?.email?.split("@")[0] ||
    "Admin"
  );
}

function getArtworkImage(item) {
  return (
    item?.imageUrl ||
    item?.image ||
    item?.artworkUrl ||
    item?.photoURL ||
    item?.photoUrl ||
    item?.mediaUrl ||
    item?.thumbnailUrl ||
    DEFAULT_IMAGE
  );
}

function getArtworkTitle(item) {
  return item?.title || item?.caption || item?.name || "Untitled Artwork";
}

function getArtworkArtist(item) {
  return (
    item?.artistName ||
    item?.username ||
    item?.artist ||
    item?.createdByName ||
    item?.userName ||
    item?.displayName ||
    "Unknown Artist"
  );
}

function getArtworkLikes(item) {
  if (typeof item?.likes === "number") return item.likes;
  if (typeof item?.likesCount === "number") return item.likesCount;
  if (typeof item?.totalLikes === "number") return item.totalLikes;
  if (Array.isArray(item?.likedBy)) return item.likedBy.length;
  if (Array.isArray(item?.likes)) return item.likes.length;
  return 0;
}

function getArtworkComments(item) {
  if (typeof item?.comments === "number") return item.comments;
  if (typeof item?.commentsCount === "number") return item.commentsCount;
  if (typeof item?.totalComments === "number") return item.totalComments;
  if (Array.isArray(item?.commentList)) return item.commentList.length;
  if (Array.isArray(item?.comments)) return item.comments.length;
  return 0;
}

function getArtworkSaves(item) {
  if (typeof item?.saves === "number") return item.saves;
  if (typeof item?.savesCount === "number") return item.savesCount;
  if (typeof item?.totalSaves === "number") return item.totalSaves;
  if (Array.isArray(item?.savedBy)) return item.savedBy.length;
  if (Array.isArray(item?.saves)) return item.saves.length;
  return 0;
}

function getReportStatus(item) {
  return (
    item?.status ||
    item?.reportStatus ||
    item?.state ||
    "pending"
  )
    .toString()
    .toLowerCase();
}

function getUserStatus(user) {
  return (
    user?.status ||
    user?.accountStatus ||
    user?.state ||
    "active"
  )
    .toString()
    .toLowerCase();
}

function getRelativeTime(value) {
  try {
    if (!value) return "No date";
    let date = null;

    if (typeof value?.toDate === "function") {
      date = value.toDate();
    } else if (value?.seconds) {
      date = new Date(value.seconds * 1000);
    } else {
      date = new Date(value);
    }

    if (!date || Number.isNaN(date.getTime())) return "No date";

    const diffMs = Date.now() - date.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMinutes < 1) return "Just now";
    if (diffMinutes < 60) return `${diffMinutes} min ago`;
    if (diffHours < 24) return `${diffHours} hr ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;

    return date.toLocaleDateString();
  } catch (error) {
    return "No date";
  }
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

function isToday(value) {
  const date = toDate(value);
  if (!date) return false;

  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

function isWithinDays(value, days = 7) {
  const date = toDate(value);
  if (!date) return false;

  const diff = Date.now() - date.getTime();
  return diff >= 0 && diff <= days * 24 * 60 * 60 * 1000;
}

function isActiveUser(user) {
  const lastActive =
    user?.lastSeen ||
    user?.lastActive ||
    user?.updatedAt ||
    user?.lastLoginAt;

  return isWithinDays(lastActive, 7) && getUserStatus(user) !== "blocked";
}

function getRevenueValue(item) {
  if (typeof item?.amount === "number") return item.amount;
  if (typeof item?.totalAmount === "number") return item.totalAmount;
  if (typeof item?.total === "number") return item.total;
  if (typeof item?.price === "number") return item.price;
  if (typeof item?.grandTotal === "number") return item.grandTotal;
  return 0;
}

export default function AdminDashboardScreen() {
  const router = useRouter();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [adminName, setAdminName] = useState("Admin");

  const [loadingStats, setLoadingStats] = useState(true);
  const [loadingArtworks, setLoadingArtworks] = useState(true);
  const [loadingAlerts, setLoadingAlerts] = useState(true);

  const [stats, setStats] = useState({
    totalUsers: 0,
    activeUsers: 0,
    newSignUps: 0,
    totalArtworks: 0,
    uploadsToday: 0,
    totalLikes: 0,
    totalComments: 0,
    totalSaves: 0,
    revenue: 0,
    totalReports: 0,
    flaggedContent: 0,
    reportedUsers: 0,
  });

  const [recentArtworks, setRecentArtworks] = useState([]);
  const [recentAlerts, setRecentAlerts] = useState([]);

  useEffect(() => {
    const currentUser = auth.currentUser;

    if (!currentUser) {
      setLoadingStats(false);
      setLoadingArtworks(false);
      setLoadingAlerts(false);
      return;
    }

    const unsubscribers = [];

    const unsubUser = onSnapshot(
      doc(db, "users", currentUser.uid),
      (snap) => {
        if (snap.exists()) {
          setAdminName(getDisplayName(snap.data(), currentUser));
        } else {
          setAdminName(getDisplayName(null, currentUser));
        }
      },
      () => {
        setAdminName(getDisplayName(null, currentUser));
      }
    );
    unsubscribers.push(unsubUser);

    let usersData = [];
    let reportsData = [];
    let postsData = [];
    let artworksData = [];
    let paymentsData = [];

    const updateStats = () => {
      const artworkSource = postsData.length > 0 ? postsData : artworksData;

      const activeUsers = usersData.filter((user) => isActiveUser(user)).length;
      const newSignUps = usersData.filter((user) =>
        isWithinDays(user?.createdAt || user?.joinedAt || user?.dateCreated, 7)
      ).length;

      const uploadsToday = artworkSource.filter((item) =>
        isToday(item?.createdAt)
      ).length;

      const totalLikes = artworkSource.reduce(
        (sum, item) => sum + getArtworkLikes(item),
        0
      );

      const totalComments = artworkSource.reduce(
        (sum, item) => sum + getArtworkComments(item),
        0
      );

      const totalSaves = artworkSource.reduce(
        (sum, item) => sum + getArtworkSaves(item),
        0
      );

      const revenue = paymentsData.reduce(
        (sum, item) => sum + getRevenueValue(item),
        0
      );

      const flaggedContent = reportsData.filter((item) => {
        const type = (
          item?.type ||
          item?.reportType ||
          item?.category ||
          ""
        )
          .toString()
          .toLowerCase();

        return (
          type.includes("content") ||
          type.includes("post") ||
          type.includes("artwork") ||
          type.includes("image")
        );
      }).length;

      const reportedUsers = reportsData.filter((item) => {
        const type = (
          item?.type ||
          item?.reportType ||
          item?.category ||
          ""
        )
          .toString()
          .toLowerCase();

        return (
          type.includes("user") ||
          type.includes("account") ||
          type.includes("artist") ||
          type.includes("provider")
        );
      }).length;

      setStats({
        totalUsers: usersData.length,
        activeUsers,
        newSignUps,
        totalArtworks: artworkSource.length,
        uploadsToday,
        totalLikes,
        totalComments,
        totalSaves,
        revenue,
        totalReports: reportsData.length,
        flaggedContent,
        reportedUsers,
      });

      setLoadingStats(false);
    };

    const unsubUsers = onSnapshot(
      collection(db, "users"),
      (snap) => {
        usersData = snap.docs.map((docItem) => ({
          id: docItem.id,
          ...docItem.data(),
        }));
        updateStats();
      },
      () => {
        usersData = [];
        updateStats();
      }
    );
    unsubscribers.push(unsubUsers);

    const unsubReports = onSnapshot(
      collection(db, "reports"),
      (snap) => {
        reportsData = snap.docs.map((docItem) => ({
          id: docItem.id,
          ...docItem.data(),
        }));
        updateStats();
      },
      () => {
        reportsData = [];
        updateStats();
      }
    );
    unsubscribers.push(unsubReports);

    const unsubPayments = onSnapshot(
      collection(db, "payments"),
      (snap) => {
        paymentsData = snap.docs.map((docItem) => ({
          id: docItem.id,
          ...docItem.data(),
        }));
        updateStats();
      },
      () => {
        paymentsData = [];
        updateStats();
      }
    );
    unsubscribers.push(unsubPayments);

    const unsubPosts = onSnapshot(
      collection(db, "posts"),
      (snap) => {
        postsData = snap.docs.map((docItem) => ({
          id: docItem.id,
          ...docItem.data(),
        }));
        updateStats();
      },
      () => {
        postsData = [];
        updateStats();
      }
    );
    unsubscribers.push(unsubPosts);

    const unsubArtworks = onSnapshot(
      collection(db, "artworks"),
      (snap) => {
        artworksData = snap.docs.map((docItem) => ({
          id: docItem.id,
          ...docItem.data(),
        }));
        updateStats();
      },
      () => {
        artworksData = [];
        updateStats();
      }
    );
    unsubscribers.push(unsubArtworks);

    const unsubRecentPosts = onSnapshot(
      query(collection(db, "posts"), orderBy("createdAt", "desc"), limit(5)),
      (snap) => {
        const list = snap.docs.map((docItem) => ({
          id: docItem.id,
          ...docItem.data(),
        }));

        if (list.length > 0) {
          setRecentArtworks(list);
          setLoadingArtworks(false);
        } else {
          const unsubFallbackRecentArtworks = onSnapshot(
            query(
              collection(db, "artworks"),
              orderBy("createdAt", "desc"),
              limit(5)
            ),
            (fallbackSnap) => {
              setRecentArtworks(
                fallbackSnap.docs.map((docItem) => ({
                  id: docItem.id,
                  ...docItem.data(),
                }))
              );
              setLoadingArtworks(false);
            },
            () => {
              setRecentArtworks([]);
              setLoadingArtworks(false);
            }
          );

          unsubscribers.push(unsubFallbackRecentArtworks);
        }
      },
      () => {
        const unsubFallbackRecentArtworks = onSnapshot(
          query(collection(db, "artworks"), orderBy("createdAt", "desc"), limit(5)),
          (fallbackSnap) => {
            setRecentArtworks(
              fallbackSnap.docs.map((docItem) => ({
                id: docItem.id,
                ...docItem.data(),
              }))
            );
            setLoadingArtworks(false);
          },
          () => {
            setRecentArtworks([]);
            setLoadingArtworks(false);
          }
        );

        unsubscribers.push(unsubFallbackRecentArtworks);
      }
    );
    unsubscribers.push(unsubRecentPosts);

    const unsubRecentAlerts = onSnapshot(
      query(collection(db, "reports"), orderBy("createdAt", "desc"), limit(5)),
      (snap) => {
        setRecentAlerts(
          snap.docs.map((docItem) => ({
            id: docItem.id,
            ...docItem.data(),
          }))
        );
        setLoadingAlerts(false);
      },
      () => {
        setRecentAlerts([]);
        setLoadingAlerts(false);
      }
    );
    unsubscribers.push(unsubRecentAlerts);

    return () => {
      unsubscribers.forEach((unsubscribe) => {
        try {
          unsubscribe?.();
        } catch (error) {}
      });
    };
  }, []);

  const topStats = useMemo(
    () => [
      {
        id: "1",
        label: "Total Users",
        value: formatNumber(stats.totalUsers),
        icon: "people-outline",
        color: "#2563EB",
        bg: "#EFF6FF",
      },
      {
        id: "2",
        label: "Active Users",
        value: formatNumber(stats.activeUsers),
        icon: "pulse-outline",
        color: "#059669",
        bg: "#ECFDF5",
      },
      {
        id: "3",
        label: "New Sign Ups",
        value: formatNumber(stats.newSignUps),
        icon: "person-add-outline",
        color: "#7C3AED",
        bg: "#F5F3FF",
      },
      {
        id: "4",
        label: "Revenue",
        value: formatCurrency(stats.revenue),
        icon: "cash-outline",
        color: "#D97706",
        bg: "#FFF7ED",
      },
    ],
    [stats]
  );

  const contentStats = useMemo(
    () => [
      {
        id: "1",
        label: "Total Artworks",
        value: formatNumber(stats.totalArtworks),
        icon: "images-outline",
      },
      {
        id: "2",
        label: "Uploads Today",
        value: formatNumber(stats.uploadsToday),
        icon: "cloud-upload-outline",
      },
      {
        id: "3",
        label: "Total Likes",
        value: formatNumber(stats.totalLikes),
        icon: "heart-outline",
      },
      {
        id: "4",
        label: "Comments",
        value: formatNumber(stats.totalComments),
        icon: "chatbubble-outline",
      },
      {
        id: "5",
        label: "Saves",
        value: formatNumber(stats.totalSaves),
        icon: "bookmark-outline",
      },
    ],
    [stats]
  );

  const alertStats = useMemo(
    () => [
      {
        id: "1",
        label: "Total Reports",
        value: formatNumber(stats.totalReports),
        icon: "alert-circle-outline",
        color: "#DC2626",
        bg: "#FEF2F2",
      },
      {
        id: "2",
        label: "Flagged Content",
        value: formatNumber(stats.flaggedContent),
        icon: "flag-outline",
        color: "#B45309",
        bg: "#FFF7ED",
      },
      {
        id: "3",
        label: "Reported Users",
        value: formatNumber(stats.reportedUsers),
        icon: "person-circle-outline",
        color: "#7C2D12",
        bg: "#FFEDD5",
      },
    ],
    [stats]
  );

  const sideNavItems = [
    {
      id: "dashboard",
      label: "Dashboard",
      icon: "grid-outline",
      route: "/admin",
    },
    {
      id: "users",
      label: "Users",
      icon: "people-outline",
      route: "/admin/users",
    },
    {
      id: "artworks",
      label: "Artworks",
      icon: "images-outline",
      route: "/admin/artworks",
    },
    {
      id: "notifications",
      label: "Notifications",
      icon: "notifications-outline",
      route: "/admin/notifications",
    },
    {
      id: "reports",
      label: "Reports",
      icon: "shield-outline",
      route: "/admin/reports",
    },
    {
      id: "transactions",
      label: "Transactions",
      icon: "card-outline",
      route: "/admin/transactions",
    },
    {
      id: "analytics",
      label: "Analytics",
      icon: "bar-chart-outline",
      route: "/admin/analytics",
    },
    {
      id: "jobs_management",
      label: "Jobs Management",
      icon: "briefcase-outline",
      route: "/admin/jobs_management",
    },
  ];

  const sideNavBottomItems = [
    {
      id: "settings",
      label: "Settings",
      icon: "settings-outline",
      route: "/admin/settings",
    },
    {
      id: "profiles",
      label: "Profiles",
      icon: "person-outline",
      route: "/admin/profiles",
    },
  ];

  const handleRoutePush = (route) => {
    try {
      router.push(route);
    } catch (error) {
      Alert.alert("Info", "This page route is not set yet.");
    }
  };

  const handleSideNavRoute = (route) => {
    setDrawerOpen(false);
    setTimeout(() => {
      handleRoutePush(route);
    }, 120);
  };

  const handleLogout = async () => {
    try {
      setDrawerOpen(false);
      await signOut(auth);
      router.replace("/auth/login");
    } catch (error) {
      Alert.alert("Error", "Failed to logout");
    }
  };

  const confirmLogout = () => {
    Alert.alert("Logout", "Are you sure you want to logout?", [
      { text: "Cancel", style: "cancel" },
      { text: "Logout", style: "destructive", onPress: handleLogout },
    ]);
  };

  const isPageLoading = loadingStats && loadingArtworks && loadingAlerts;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.heroCard}>
          <View style={styles.heroOverlay} />

          <View style={styles.heroTopRow}>
            <TouchableOpacity
              style={styles.menuTrigger}
              onPress={() => setDrawerOpen(true)}
              activeOpacity={0.85}
            >
              <Ionicons name="menu-outline" size={22} color="#111827" />
            </TouchableOpacity>

            <View style={styles.heroTopRight}>
              <TouchableOpacity
                style={styles.profileButton}
                onPress={() => setDrawerOpen(true)}
                activeOpacity={0.85}
              >
                <View style={styles.profileCircle}>
                  <Ionicons name="person" size={18} color="#111827" />
                </View>
                <Ionicons name="chevron-down" size={16} color="#6B7280" />
              </TouchableOpacity>
            </View>
          </View>

          <Text style={styles.logo}>ArtLinker</Text>
          <Text style={styles.heroBadge}>Admin Dashboard</Text>

          <Text style={styles.title}>Platform Overview</Text>
          <Text style={styles.subtitle}>
            Track user growth, artwork activity, engagement, revenue, and moderation alerts in real time
          </Text>

          <View style={styles.heroPillsRow}>
            <View style={styles.welcomePill}>
              <Ionicons name="sparkles-outline" size={14} color="#7C3AED" />
              <Text style={styles.welcomeText}>Welcome back, {adminName}</Text>
            </View>

            <View style={styles.liveBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>Live Firebase</Text>
            </View>
          </View>
        </View>

        {isPageLoading ? (
          <View style={styles.loadingCard}>
            <ActivityIndicator size="small" color="#7C3AED" />
            <Text style={styles.loadingText}>Loading dashboard...</Text>
          </View>
        ) : (
          <>
            <Text style={styles.blockTitle}>User and Revenue Overview</Text>
            <View style={styles.topStatsGrid}>
              {topStats.map((item) => (
                <View key={item.id} style={styles.primaryStatCard}>
                  <View style={[styles.primaryIconWrap, { backgroundColor: item.bg }]}>
                    <Ionicons name={item.icon} size={18} color={item.color} />
                  </View>
                  <Text style={styles.primaryStatValue}>{item.value}</Text>
                  <Text style={styles.primaryStatLabel}>{item.label}</Text>
                </View>
              ))}
            </View>

            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <View>
                  <Text style={styles.sectionTitle}>Artwork and Engagement</Text>
                  <Text style={styles.sectionSubtitle}>
                    Content volume and interaction metrics
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.sectionAction}
                  onPress={() => handleRoutePush("/admin/artworks")}
                >
                  <Text style={styles.sectionActionText}>Manage</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.metricRowWrap}>
                {contentStats.map((item) => (
                  <View key={item.id} style={styles.metricCard}>
                    <View style={styles.metricIconWrap}>
                      <Ionicons name={item.icon} size={18} color="#7C3AED" />
                    </View>
                    <Text style={styles.metricValue}>{item.value}</Text>
                    <Text style={styles.metricLabel}>{item.label}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <View>
                  <Text style={styles.sectionTitle}>Alerts and Moderation</Text>
                  <Text style={styles.sectionSubtitle}>
                    Flagged items and reported accounts
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.sectionAction}
                  onPress={() => handleRoutePush("/admin/reports")}
                >
                  <Text style={styles.sectionActionText}>Open</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.alertGrid}>
                {alertStats.map((item) => (
                  <View key={item.id} style={styles.alertCard}>
                    <View style={[styles.alertIconWrap, { backgroundColor: item.bg }]}>
                      <Ionicons name={item.icon} size={18} color={item.color} />
                    </View>
                    <Text style={styles.alertValue}>{item.value}</Text>
                    <Text style={styles.alertLabel}>{item.label}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <View>
                  <Text style={styles.sectionTitle}>Recent Artworks</Text>
                  <Text style={styles.sectionSubtitle}>
                    Latest uploads on the platform
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.sectionAction}
                  onPress={() => handleRoutePush("/admin/artworks")}
                >
                  <Text style={styles.sectionActionText}>View all</Text>
                </TouchableOpacity>
              </View>

              {loadingArtworks ? (
                <View style={styles.innerLoadingWrap}>
                  <ActivityIndicator size="small" color="#7C3AED" />
                  <Text style={styles.loadingText}>Loading artworks...</Text>
                </View>
              ) : recentArtworks.length === 0 ? (
                <View style={styles.emptyWrap}>
                  <Ionicons name="image-outline" size={24} color="#9CA3AF" />
                  <Text style={styles.emptyTitle}>No artworks found</Text>
                  <Text style={styles.emptySubtitle}>
                    Recent uploads will appear here once artists post their work
                  </Text>
                </View>
              ) : (
                <View>
                  {recentArtworks.map((item) => (
                    <TouchableOpacity
                      key={item.id}
                      style={styles.artworkRow}
                      activeOpacity={0.88}
                      onPress={() =>
                        handleRoutePush({
                          pathname: "/admin/artworks",
                          params: { id: item.id },
                        })
                      }
                    >
                      <Image
                        source={{ uri: getArtworkImage(item) }}
                        style={styles.artworkImage}
                      />

                      <View style={styles.artworkInfo}>
                        <Text numberOfLines={1} style={styles.artworkTitle}>
                          {getArtworkTitle(item)}
                        </Text>
                        <Text numberOfLines={1} style={styles.artworkArtist}>
                          by {getArtworkArtist(item)}
                        </Text>
                        <Text style={styles.artworkMeta}>
                          {getRelativeTime(item?.createdAt)}
                        </Text>
                      </View>

                      <View style={styles.sideCountBox}>
                        <Ionicons name="heart-outline" size={15} color="#9CA3AF" />
                        <Text style={styles.sideCountText}>
                          {formatNumber(getArtworkLikes(item))}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <View>
                  <Text style={styles.sectionTitle}>Recent Alerts</Text>
                  <Text style={styles.sectionSubtitle}>
                    Latest flagged content or reported users
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.sectionAction}
                  onPress={() => handleRoutePush("/admin/reports")}
                >
                  <Text style={styles.sectionActionText}>Review</Text>
                </TouchableOpacity>
              </View>

              {loadingAlerts ? (
                <View style={styles.innerLoadingWrap}>
                  <ActivityIndicator size="small" color="#7C3AED" />
                  <Text style={styles.loadingText}>Loading alerts...</Text>
                </View>
              ) : recentAlerts.length === 0 ? (
                <View style={styles.emptyWrap}>
                  <Ionicons
                    name="shield-checkmark-outline"
                    size={24}
                    color="#9CA3AF"
                  />
                  <Text style={styles.emptyTitle}>No alerts found</Text>
                  <Text style={styles.emptySubtitle}>
                    Reports and flagged items will appear here
                  </Text>
                </View>
              ) : (
                <View>
                  {recentAlerts.map((item) => (
                    <TouchableOpacity
                      key={item.id}
                      style={styles.alertRow}
                      activeOpacity={0.88}
                      onPress={() => handleRoutePush("/admin/reports")}
                    >
                      <View style={styles.alertRowLeft}>
                        <View style={styles.alertRowIcon}>
                          <Ionicons
                            name="alert-circle-outline"
                            size={18}
                            color="#B45309"
                          />
                        </View>

                        <View style={styles.alertRowInfo}>
                          <Text style={styles.alertRowTitle} numberOfLines={1}>
                            {item?.title ||
                              item?.reason ||
                              item?.type ||
                              "New report received"}
                          </Text>
                          <Text style={styles.alertRowMeta} numberOfLines={1}>
                            {item?.reportedUserName ||
                              item?.reportedItemTitle ||
                              item?.reporterName ||
                              item?.category ||
                              "Moderation activity"}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.alertRowRight}>
                        <Text style={styles.alertRowStatus}>
                          {getReportStatus(item)}
                        </Text>
                        <Text style={styles.alertRowTime}>
                          {getRelativeTime(item?.createdAt)}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          </>
        )}
      </ScrollView>

      <Modal
        visible={drawerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setDrawerOpen(false)}
      >
        <View style={styles.drawerRoot}>
          <Pressable
            style={styles.drawerOverlay}
            onPress={() => setDrawerOpen(false)}
          />

          <View style={styles.drawerContainer}>
            <View style={styles.drawerHeader}>
              <View style={styles.drawerProfileRow}>
                <View style={styles.drawerAvatar}>
                  <Ionicons name="person" size={22} color="#111827" />
                </View>

                <View style={styles.drawerProfileTextWrap}>
                  <Text style={styles.drawerProfileName}>{adminName}</Text>
                  <Text style={styles.drawerProfileRole}>Administrator</Text>
                </View>
              </View>

              <TouchableOpacity
                style={styles.drawerCloseButton}
                onPress={() => setDrawerOpen(false)}
                activeOpacity={0.85}
              >
                <Ionicons name="close" size={20} color="#111827" />
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.drawerScrollContent}
            >
              <View style={styles.drawerSection}>
                <Text style={styles.drawerSectionTitle}>Navigation</Text>

                {sideNavItems.map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    style={styles.drawerItem}
                    onPress={() => handleSideNavRoute(item.route)}
                    activeOpacity={0.85}
                  >
                    <View style={styles.drawerItemIconWrap}>
                      <Ionicons name={item.icon} size={18} color="#111827" />
                    </View>
                    <Text style={styles.drawerItemText}>{item.label}</Text>
                    <Ionicons
                      name="chevron-forward-outline"
                      size={16}
                      color="#9CA3AF"
                    />
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.drawerDivider} />

              <View style={styles.drawerSection}>
                <Text style={styles.drawerSectionTitle}>Account</Text>

                {sideNavBottomItems.map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    style={styles.drawerItem}
                    onPress={() => handleSideNavRoute(item.route)}
                    activeOpacity={0.85}
                  >
                    <View style={styles.drawerItemIconWrap}>
                      <Ionicons name={item.icon} size={18} color="#111827" />
                    </View>
                    <Text style={styles.drawerItemText}>{item.label}</Text>
                    <Ionicons
                      name="chevron-forward-outline"
                      size={16}
                      color="#9CA3AF"
                    />
                  </TouchableOpacity>
                ))}

                <TouchableOpacity
                  style={styles.drawerItem}
                  onPress={confirmLogout}
                  activeOpacity={0.85}
                >
                  <View style={[styles.drawerItemIconWrap, styles.logoutIconWrap]}>
                    <Ionicons name="log-out-outline" size={18} color="#EF4444" />
                  </View>
                  <Text style={styles.drawerLogoutText}>Logout</Text>
                  <Ionicons
                    name="chevron-forward-outline"
                    size={16}
                    color="#FCA5A5"
                  />
                </TouchableOpacity>
              </View>

              <View style={styles.drawerFooterCard}>
                <Text style={styles.drawerFooterTitle}>Add More Screens</Text>
                <Text style={styles.drawerFooterText}>
                  Add new admin pages by inserting more items into the sideNavItems array.
                </Text>
              </View>
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
    paddingTop: 12,
    paddingBottom: 28,
  },

  heroCard: {
    position: "relative",
    overflow: "hidden",
    backgroundColor: "#FFFFFF",
    borderRadius: 28,
    padding: 20,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: "#E9EEF5",
    shadowColor: "#0F172A",
    shadowOpacity: 0.07,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  heroOverlay: {
    position: "absolute",
    right: -35,
    top: -20,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: "#F5F3FF",
  },
  heroTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  menuTrigger: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#DCE3ED",
    alignItems: "center",
    justifyContent: "center",
  },
  heroTopRight: {
    flexDirection: "row",
    alignItems: "center",
  },
  logo: {
    fontSize: 28,
    fontWeight: "900",
    color: "#F06CE9",
  },
  heroBadge: {
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
  profileButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    paddingVertical: 7,
    paddingHorizontal: 9,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#DCE3ED",
  },
  profileCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 6,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  title: {
    fontSize: 28,
    fontWeight: "900",
    color: "#111827",
    marginTop: 14,
  },
  subtitle: {
    marginTop: 8,
    fontSize: 13,
    color: "#64748B",
    lineHeight: 20,
    maxWidth: "96%",
  },
  heroPillsRow: {
    marginTop: 16,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 10,
  },
  welcomePill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F5F3FF",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  welcomeText: {
    marginLeft: 6,
    fontSize: 13,
    fontWeight: "700",
    color: "#4B5563",
  },
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ECFDF5",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#10B981",
    marginRight: 7,
  },
  liveText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#047857",
  },

  blockTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 12,
    marginTop: 2,
  },

  topStatsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  primaryStatCard: {
    width: "48.5%",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E9EEF5",
    borderRadius: 20,
    paddingVertical: 16,
    paddingHorizontal: 14,
    marginBottom: 12,
    shadowColor: "#0F172A",
    shadowOpacity: 0.04,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  primaryIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  primaryStatValue: {
    fontSize: 22,
    fontWeight: "900",
    color: "#111827",
    marginBottom: 4,
  },
  primaryStatLabel: {
    fontSize: 12,
    color: "#6B7280",
    fontWeight: "600",
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
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
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
    maxWidth: 230,
  },
  sectionAction: {
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  sectionActionText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#374151",
  },

  metricRowWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  metricCard: {
    width: "48.5%",
    backgroundColor: "#FAFAFB",
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#EEF2F7",
  },
  metricIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#F5F3FF",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  metricValue: {
    fontSize: 20,
    fontWeight: "900",
    color: "#111827",
  },
  metricLabel: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: "600",
    color: "#6B7280",
  },

  alertGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
    flexWrap: "wrap",
  },
  alertCard: {
    width: "31.5%",
    backgroundColor: "#FAFAFB",
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: "#EEF2F7",
    alignItems: "center",
  },
  alertIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  alertValue: {
    fontSize: 18,
    fontWeight: "900",
    color: "#111827",
    textAlign: "center",
  },
  alertLabel: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: "700",
    color: "#6B7280",
    textAlign: "center",
  },

  loadingCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    paddingVertical: 32,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E9EEF5",
  },
  innerLoadingWrap: {
    paddingVertical: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    marginTop: 10,
    fontSize: 13,
    color: "#6B7280",
    fontWeight: "600",
  },

  emptyWrap: {
    paddingVertical: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    marginTop: 10,
    fontSize: 15,
    fontWeight: "800",
    color: "#111827",
  },
  emptySubtitle: {
    marginTop: 6,
    fontSize: 12,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 18,
    paddingHorizontal: 12,
  },

  artworkRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FAFAFB",
    borderRadius: 16,
    padding: 10,
    borderWidth: 1,
    borderColor: "#EEF2F7",
    marginBottom: 12,
  },
  artworkImage: {
    width: 56,
    height: 56,
    borderRadius: 14,
    marginRight: 12,
    backgroundColor: "#E5E7EB",
  },
  artworkInfo: {
    flex: 1,
  },
  artworkTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#111827",
  },
  artworkArtist: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 4,
  },
  artworkMeta: {
    fontSize: 11,
    color: "#94A3B8",
    marginTop: 4,
  },
  sideCountBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  sideCountText: {
    marginLeft: 4,
    fontSize: 12,
    color: "#6B7280",
    fontWeight: "700",
  },

  alertRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#FAFAFB",
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: "#EEF2F7",
    marginBottom: 12,
  },
  alertRowLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: 10,
  },
  alertRowIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: "#FFF7ED",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  alertRowInfo: {
    flex: 1,
  },
  alertRowTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#111827",
  },
  alertRowMeta: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 4,
  },
  alertRowRight: {
    alignItems: "flex-end",
  },
  alertRowStatus: {
    fontSize: 11,
    fontWeight: "800",
    color: "#B45309",
    textTransform: "capitalize",
  },
  alertRowTime: {
    fontSize: 11,
    color: "#94A3B8",
    marginTop: 4,
  },

  drawerRoot: {
    flex: 1,
    flexDirection: "row",
  },
  drawerOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.18)",
  },
  drawerContainer: {
    width: "78%",
    maxWidth: 320,
    backgroundColor: "#FFFFFF",
    paddingTop: 18,
    paddingHorizontal: 16,
    paddingBottom: 22,
    borderTopRightRadius: 26,
    borderBottomRightRadius: 26,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 24,
  },
  drawerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 14,
  },
  drawerProfileRow: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: 10,
  },
  drawerAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    marginRight: 10,
  },
  drawerProfileTextWrap: {
    flex: 1,
  },
  drawerProfileName: {
    fontSize: 15,
    fontWeight: "800",
    color: "#111827",
  },
  drawerProfileRole: {
    marginTop: 4,
    fontSize: 12,
    color: "#6B7280",
    fontWeight: "600",
  },
  drawerCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  drawerScrollContent: {
    paddingBottom: 12,
  },
  drawerSection: {
    marginTop: 8,
  },
  drawerSectionTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: "#9CA3AF",
    textTransform: "uppercase",
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  drawerItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 10,
    paddingVertical: 12,
    borderRadius: 16,
    marginBottom: 6,
  },
  drawerItemIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  drawerItemText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
  },
  drawerLogoutText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
    color: "#EF4444",
  },
  logoutIconWrap: {
    backgroundColor: "#FEF2F2",
  },
  drawerDivider: {
    height: 1,
    backgroundColor: "#EEF2F7",
    marginVertical: 12,
  },
  drawerFooterCard: {
    marginTop: 14,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E9EEF5",
    borderRadius: 18,
    padding: 14,
  },
  drawerFooterTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#111827",
  },
  drawerFooterText: {
    marginTop: 6,
    fontSize: 12,
    lineHeight: 18,
    color: "#6B7280",
    fontWeight: "600",
  },
});
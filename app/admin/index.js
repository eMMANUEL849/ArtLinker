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
import { Ionicons } from "@expo/vector-icons";
import { signOut } from "firebase/auth";
import { useRouter } from "expo-router";
import {
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";

import { auth, db } from "../../config/firebase";

const DEFAULT_IMAGE =
  "https://via.placeholder.com/300x300.png?text=Artwork";

function formatNumber(value) {
  const number = Number(value || 0);
  return number.toLocaleString();
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

export default function AdminDashboardScreen() {
  const router = useRouter();

  const [menuOpen, setMenuOpen] = useState(false);
  const [adminName, setAdminName] = useState("Admin");
  const [loading, setLoading] = useState(true);

  const [stats, setStats] = useState({
    totalUsers: 0,
    artworks: 0,
    totalLikes: 0,
    reports: 0,
  });

  const [artworks, setArtworks] = useState([]);

  useEffect(() => {
    const currentUser = auth.currentUser;

    if (!currentUser) {
      setLoading(false);
      return;
    }

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

    let unsubscribeArtworks = null;
    let isMounted = true;

    const loadStats = async () => {
      try {
        const usersPromise = getDocs(collection(db, "users")).catch(() => null);
        const reportsPromise = getDocs(collection(db, "reports")).catch(
          () => null
        );
        const postsPromise = getDocs(collection(db, "posts")).catch(() => null);
        const artworksPromise = getDocs(collection(db, "artworks")).catch(
          () => null
        );

        const [usersSnap, reportsSnap, postsSnap, artworksSnap] =
          await Promise.all([
            usersPromise,
            reportsPromise,
            postsPromise,
            artworksPromise,
          ]);

        const postDocs = postsSnap?.docs || [];
        const artworkDocs = artworksSnap?.docs || [];
        const artworkSourceDocs =
          postDocs.length > 0 ? postDocs : artworkDocs.length > 0 ? artworkDocs : [];

        const totalLikes = artworkSourceDocs.reduce((sum, item) => {
          return sum + getArtworkLikes(item.data());
        }, 0);

        if (isMounted) {
          setStats({
            totalUsers: usersSnap?.size || 0,
            artworks: artworkSourceDocs.length,
            totalLikes,
            reports: reportsSnap?.size || 0,
          });
        }
      } catch (error) {
        if (isMounted) {
          setStats({
            totalUsers: 0,
            artworks: 0,
            totalLikes: 0,
            reports: 0,
          });
        }
      }
    };

    const subscribeToRecentArtworks = () => {
      const postsQuery = query(
        collection(db, "posts"),
        orderBy("createdAt", "desc"),
        limit(5)
      );

      unsubscribeArtworks = onSnapshot(
        postsQuery,
        (snap) => {
          const list = snap.docs.map((item) => ({
            id: item.id,
            ...item.data(),
          }));

          if (list.length > 0) {
            setArtworks(list);
            setLoading(false);
          } else {
            const artworksQuery = query(
              collection(db, "artworks"),
              orderBy("createdAt", "desc"),
              limit(5)
            );

            if (unsubscribeArtworks) unsubscribeArtworks();

            unsubscribeArtworks = onSnapshot(
              artworksQuery,
              (artSnap) => {
                const fallbackList = artSnap.docs.map((item) => ({
                  id: item.id,
                  ...item.data(),
                }));
                setArtworks(fallbackList);
                setLoading(false);
              },
              () => {
                setArtworks([]);
                setLoading(false);
              }
            );
          }
        },
        () => {
          const artworksQuery = query(
            collection(db, "artworks"),
            orderBy("createdAt", "desc"),
            limit(5)
          );

          if (unsubscribeArtworks) unsubscribeArtworks();

          unsubscribeArtworks = onSnapshot(
            artworksQuery,
            (artSnap) => {
              const fallbackList = artSnap.docs.map((item) => ({
                id: item.id,
                ...item.data(),
              }));
              setArtworks(fallbackList);
              setLoading(false);
            },
            () => {
              setArtworks([]);
              setLoading(false);
            }
          );
        }
      );
    };

    loadStats();
    subscribeToRecentArtworks();

    return () => {
      isMounted = false;
      unsubUser?.();
      unsubscribeArtworks?.();
    };
  }, []);

  const statCards = useMemo(
    () => [
      {
        id: "1",
        label: "Total Users",
        value: formatNumber(stats.totalUsers),
        icon: "people-outline",
      },
      {
        id: "2",
        label: "Artworks",
        value: formatNumber(stats.artworks),
        icon: "image-outline",
      },
      {
        id: "3",
        label: "Total Likes",
        value: formatNumber(stats.totalLikes),
        icon: "heart-outline",
      },
      {
        id: "4",
        label: "Reports",
        value: formatNumber(stats.reports),
        icon: "alert-circle-outline",
      },
    ],
    [stats]
  );

  const handleLogout = async () => {
    try {
      setMenuOpen(false);
      await signOut(auth);
      router.replace("/auth/login");
    } catch (error) {
      Alert.alert("Error", "Failed to logout");
    }
  };

  const confirmLogout = () => {
    Alert.alert("Logout", "Are you sure you want to logout?", [
      {
        text: "Cancel",
        style: "cancel",
      },
      {
        text: "Logout",
        style: "destructive",
        onPress: handleLogout,
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.heroCard}>
          <View style={styles.heroTopRow}>
            <View>
              <Text style={styles.logo}>ArtLinker</Text>
              <Text style={styles.heroBadge}>Admin Panel</Text>
            </View>

            <TouchableOpacity
              style={styles.profileButton}
              onPress={() => setMenuOpen(true)}
              activeOpacity={0.85}
            >
              <View style={styles.profileCircle}>
                <Ionicons name="person" size={18} color="#111827" />
              </View>
              <Ionicons name="chevron-down" size={16} color="#6B7280" />
            </TouchableOpacity>
          </View>

          <Text style={styles.title}>Admin Dashboard</Text>
          <Text style={styles.subtitle}>
            Overview of platform activity and statistics
          </Text>

          <View style={styles.welcomePill}>
            <Ionicons name="sparkles-outline" size={14} color="#7C3AED" />
            <Text style={styles.welcomeText}>Welcome back, {adminName}</Text>
          </View>
        </View>

        <View style={styles.statsGrid}>
          {statCards.map((item) => (
            <View key={item.id} style={styles.statCard}>
              <View style={styles.statIconWrap}>
                <Ionicons name={item.icon} size={18} color="#7C3AED" />
              </View>
              <Text style={styles.statValue}>{item.value}</Text>
              <Text style={styles.statLabel}>{item.label}</Text>
            </View>
          ))}
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>Recent Artworks</Text>
              <Text style={styles.sectionSubtitle}>
                Latest uploads to the platform
              </Text>
            </View>

            <TouchableOpacity
              style={styles.sectionAction}
              onPress={() => {
                try {
                  router.push("/admin/artworks");
                } catch (error) {
                  Alert.alert("Info", "Artworks page route is not set yet.");
                }
              }}
            >
              <Text style={styles.sectionActionText}>View all</Text>
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="small" color="#7C3AED" />
              <Text style={styles.loadingText}>Loading dashboard...</Text>
            </View>
          ) : artworks.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Ionicons name="image-outline" size={24} color="#9CA3AF" />
              <Text style={styles.emptyTitle}>No artworks found</Text>
              <Text style={styles.emptySubtitle}>
                Recent uploads will appear here once artists post their work
              </Text>
            </View>
          ) : (
            <View style={styles.artworkList}>
              {artworks.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={styles.artworkRow}
                  activeOpacity={0.88}
                  onPress={() => {
                    try {
                      router.push({
                        pathname: "/admin/artworks",
                        params: { id: item.id },
                      });
                    } catch (error) {}
                  }}
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
                  </View>

                  <View style={styles.likesBox}>
                    <Ionicons name="heart-outline" size={15} color="#9CA3AF" />
                    <Text style={styles.likesText}>
                      {formatNumber(getArtworkLikes(item))}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      <Modal
        visible={menuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuOpen(false)}
      >
        <View style={styles.modalRoot}>
          <Pressable
            style={styles.modalOverlay}
            onPress={() => setMenuOpen(false)}
          />

          <View style={styles.modalMenuWrap} pointerEvents="box-none">
            <View style={styles.dropdown}>
              <TouchableOpacity
                style={styles.dropdownItem}
                onPress={() => {
                  setMenuOpen(false);
                  router.push("/admin/settings");
                }}
              >
                <Ionicons name="settings-outline" size={16} color="#111827" />
                <Text style={styles.dropdownText}>Settings</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.dropdownItem}
                onPress={() => {
                  setMenuOpen(false);
                  router.push("/admin/profile");
                }}
              >
                <Ionicons name="person-outline" size={16} color="#111827" />
                <Text style={styles.dropdownText}>Profile</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.dropdownItem}
                onPress={() => {
                  setMenuOpen(false);
                  confirmLogout();
                }}
              >
                <Ionicons name="log-out-outline" size={16} color="#EF4444" />
                <Text style={styles.dropdownLogoutText}>Logout</Text>
              </TouchableOpacity>
            </View>
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
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 18,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: "#EEF2F7",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  heroTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 16,
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
    backgroundColor: "#F3F4F6",
    paddingVertical: 7,
    paddingHorizontal: 9,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#D1D5DB",
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

  modalRoot: {
    flex: 1,
  },
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.08)",
  },
  modalMenuWrap: {
    position: "absolute",
    top: 74,
    right: 16,
    alignItems: "flex-end",
  },
  dropdown: {
    width: 190,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingVertical: 6,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 30,
  },
  dropdownItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  dropdownText: {
    marginLeft: 8,
    fontSize: 13,
    fontWeight: "600",
    color: "#111827",
  },
  dropdownLogoutText: {
    marginLeft: 8,
    fontSize: 13,
    fontWeight: "700",
    color: "#EF4444",
  },

  title: {
    fontSize: 28,
    fontWeight: "900",
    color: "#111827",
    textAlign: "center",
  },
  subtitle: {
    marginTop: 6,
    fontSize: 13,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 19,
  },
  welcomePill: {
    marginTop: 14,
    alignSelf: "center",
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

  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  statCard: {
    width: "48.5%",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#EEF2F7",
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 14,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  statIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#F5F3FF",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  statValue: {
    fontSize: 22,
    fontWeight: "900",
    color: "#111827",
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: "#6B7280",
    fontWeight: "600",
  },

  sectionCard: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#EEF2F7",
    borderRadius: 20,
    padding: 16,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
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

  loadingWrap: {
    paddingVertical: 30,
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

  artworkList: {
    marginTop: 2,
  },
  artworkRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FAFAFB",
    borderRadius: 16,
    padding: 10,
    borderWidth: 1,
    borderColor: "#F1F5F9",
    marginBottom: 12,
  },
  artworkImage: {
    width: 54,
    height: 54,
    borderRadius: 12,
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
  likesBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  likesText: {
    marginLeft: 4,
    fontSize: 12,
    color: "#6B7280",
    fontWeight: "700",
  },
});
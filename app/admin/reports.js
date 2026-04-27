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
  Modal,
  Pressable,
  StatusBar,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons, Feather } from "@expo/vector-icons";
import {
  collection,
  onSnapshot,
  doc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db, auth } from "../../config/firebase";

const DEFAULT_IMAGE =
  "https://via.placeholder.com/300x300.png?text=Reported+Content";

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

function getReportTitle(item) {
  return (
    item?.title ||
    item?.subject ||
    item?.reason ||
    item?.type ||
    "New report"
  );
}

function getReportCategory(item) {
  const raw = (
    item?.category ||
    item?.type ||
    item?.reportType ||
    item?.reason ||
    "other"
  )
    .toString()
    .toLowerCase();

  if (raw.includes("abuse")) return "abuse";
  if (raw.includes("copyright")) return "copyright";
  if (raw.includes("spam")) return "spam";
  if (raw.includes("harass")) return "abuse";
  if (raw.includes("fake")) return "spam";
  if (raw.includes("scam")) return "spam";
  return "other";
}

function getReportStatus(item) {
  const status = (
    item?.status ||
    item?.reportStatus ||
    item?.state ||
    "pending"
  )
    .toString()
    .toLowerCase();

  if (["resolved", "closed", "done"].includes(status)) return "resolved";
  if (["dismissed", "ignored"].includes(status)) return "dismissed";
  return "pending";
}

function getReportDescription(item) {
  return (
    item?.message ||
    item?.description ||
    item?.details ||
    item?.reportMessage ||
    "No additional details provided."
  );
}

function getReporterName(item) {
  return (
    item?.reporterName ||
    item?.reportedByName ||
    item?.senderName ||
    "Unknown Reporter"
  );
}

function getReporterId(item) {
  return (
    item?.reporterId ||
    item?.reportedById ||
    item?.senderId ||
    ""
  );
}

function getReportedUserId(item) {
  return (
    item?.reportedUserId ||
    item?.userId ||
    item?.reportedAgainst ||
    item?.targetUserId ||
    ""
  );
}

function getReportedUserName(item) {
  return (
    item?.reportedUserName ||
    item?.targetUserName ||
    item?.username ||
    item?.artistName ||
    "Unknown User"
  );
}

function getReportedArtworkId(item) {
  return (
    item?.postId ||
    item?.artworkId ||
    item?.contentId ||
    item?.reportedPostId ||
    item?.reportedArtworkId ||
    item?.targetId ||
    ""
  );
}

function getReportedArtworkTitle(item) {
  return (
    item?.reportedItemTitle ||
    item?.postTitle ||
    item?.artworkTitle ||
    item?.targetTitle ||
    "Reported Content"
  );
}

function getReportedImage(item, matchedArtwork) {
  return (
    matchedArtwork?.imageUrl ||
    matchedArtwork?.image ||
    matchedArtwork?.artworkUrl ||
    matchedArtwork?.photoURL ||
    matchedArtwork?.photoUrl ||
    matchedArtwork?.thumbnailUrl ||
    matchedArtwork?.mediaUrl ||
    item?.imageUrl ||
    item?.thumbnailUrl ||
    DEFAULT_IMAGE
  );
}

function getArtworkStatus(item) {
  if (!item) return "unknown";
  if (item?.status) return String(item.status).toLowerCase();
  if (item?.approved === true) return "approved";
  if (item?.approved === false) return "pending";
  return "pending";
}

export default function AdminReportsScreen() {
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("all");

  const [reports, setReports] = useState([]);
  const [users, setUsers] = useState([]);
  const [posts, setPosts] = useState([]);
  const [artworks, setArtworks] = useState([]);

  const [loading, setLoading] = useState(true);
  const [selectedReport, setSelectedReport] = useState(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    const unsubscribers = [];

    const unsubReports = onSnapshot(
      collection(db, "reports"),
      (snapshot) => {
        const list = snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        }));
        list.sort((a, b) => {
          const aDate = toDate(a?.createdAt)?.getTime() || 0;
          const bDate = toDate(b?.createdAt)?.getTime() || 0;
          return bDate - aDate;
        });
        setReports(list);
        setLoading(false);
      },
      (error) => {
        console.log("reports error:", error);
        setReports([]);
        setLoading(false);
      }
    );
    unsubscribers.push(unsubReports);

    const unsubUsers = onSnapshot(
      collection(db, "users"),
      (snapshot) => {
        setUsers(
          snapshot.docs.map((item) => ({
            id: item.id,
            ...item.data(),
          }))
        );
      },
      () => setUsers([])
    );
    unsubscribers.push(unsubUsers);

    const unsubPosts = onSnapshot(
      collection(db, "posts"),
      (snapshot) => {
        setPosts(
          snapshot.docs.map((item) => ({
            id: item.id,
            _collection: "posts",
            ...item.data(),
          }))
        );
      },
      () => setPosts([])
    );
    unsubscribers.push(unsubPosts);

    const unsubArtworks = onSnapshot(
      collection(db, "artworks"),
      (snapshot) => {
        setArtworks(
          snapshot.docs.map((item) => ({
            id: item.id,
            _collection: "artworks",
            ...item.data(),
          }))
        );
      },
      () => setArtworks([])
    );
    unsubscribers.push(unsubArtworks);

    return () => {
      unsubscribers.forEach((unsubscribe) => {
        try {
          unsubscribe?.();
        } catch (error) {}
      });
    };
  }, []);

  const allContent = useMemo(() => [...posts, ...artworks], [posts, artworks]);

  const enrichedReports = useMemo(() => {
    return reports.map((report) => {
      const reportedUserId = getReportedUserId(report);
      const reportedArtworkId = getReportedArtworkId(report);

      const matchedUser = users.find((user) => user.id === reportedUserId) || null;
      const matchedArtwork =
        allContent.find((item) => item.id === reportedArtworkId) || null;

      return {
        ...report,
        normalizedCategory: getReportCategory(report),
        normalizedStatus: getReportStatus(report),
        matchedUser,
        matchedArtwork,
      };
    });
  }, [reports, users, allContent]);

  const filteredReports = useMemo(() => {
    const q = search.trim().toLowerCase();

    return enrichedReports.filter((item) => {
      const matchesSearch =
        !q ||
        getReportTitle(item).toLowerCase().includes(q) ||
        getReporterName(item).toLowerCase().includes(q) ||
        getReportedUserName(item).toLowerCase().includes(q) ||
        getReportedArtworkTitle(item).toLowerCase().includes(q) ||
        getReportDescription(item).toLowerCase().includes(q);

      const matchesCategory =
        selectedCategory === "all" || item.normalizedCategory === selectedCategory;

      const matchesStatus =
        selectedStatus === "all" || item.normalizedStatus === selectedStatus;

      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [enrichedReports, search, selectedCategory, selectedStatus]);

  const summary = useMemo(() => {
    return {
      total: enrichedReports.length,
      pending: enrichedReports.filter((item) => item.normalizedStatus === "pending").length,
      resolved: enrichedReports.filter((item) => item.normalizedStatus === "resolved").length,
      abuse: enrichedReports.filter((item) => item.normalizedCategory === "abuse").length,
      copyright: enrichedReports.filter((item) => item.normalizedCategory === "copyright").length,
      spam: enrichedReports.filter((item) => item.normalizedCategory === "spam").length,
    };
  }, [enrichedReports]);

  const openReportMenu = (report) => {
    setSelectedReport(report);
    setMenuVisible(true);
  };

  const closeReportMenu = () => {
    if (actionLoading) return;
    setMenuVisible(false);
    setSelectedReport(null);
  };

  const updateReportStatus = async (report, status, successMessage) => {
    try {
      setActionLoading(true);

      await updateDoc(doc(db, "reports", report.id), {
        status,
        reportStatus: status,
        updatedAt: serverTimestamp(),
        handledAt: serverTimestamp(),
        handledBy: auth.currentUser?.uid || null,
      });

      closeReportMenu();
      Alert.alert("Success", successMessage);
    } catch (error) {
      console.log("update report status error:", error);
      Alert.alert("Error", "Failed to update report.");
    } finally {
      setActionLoading(false);
    }
  };

  const resolveReport = async () => {
    if (!selectedReport) return;
    await updateReportStatus(selectedReport, "resolved", "Report marked as resolved.");
  };

  const dismissReport = async () => {
    if (!selectedReport) return;
    await updateReportStatus(selectedReport, "dismissed", "Report dismissed.");
  };

  const blockReportedUser = async () => {
    if (!selectedReport) return;

    const userId = getReportedUserId(selectedReport);
    if (!userId) {
      Alert.alert("Unavailable", "This report is not linked to a user.");
      return;
    }

    try {
      setActionLoading(true);

      await updateDoc(doc(db, "users", userId), {
        status: "blocked",
        active: false,
        updatedAt: serverTimestamp(),
      });

      await updateDoc(doc(db, "reports", selectedReport.id), {
        status: "resolved",
        reportStatus: "resolved",
        actionTaken: "user_blocked",
        updatedAt: serverTimestamp(),
        handledAt: serverTimestamp(),
        handledBy: auth.currentUser?.uid || null,
      });

      closeReportMenu();
      Alert.alert("Success", "User blocked and report resolved.");
    } catch (error) {
      console.log("block reported user error:", error);
      Alert.alert("Error", "Failed to block user.");
    } finally {
      setActionLoading(false);
    }
  };

  const removeReportedArtwork = async () => {
    if (!selectedReport) return;

    const artworkId = getReportedArtworkId(selectedReport);
    const matchedArtwork =
      allContent.find((item) => item.id === artworkId) || selectedReport.matchedArtwork;

    if (!artworkId || !matchedArtwork?._collection) {
      Alert.alert("Unavailable", "This report is not linked to an artwork.");
      return;
    }

    Alert.alert(
      "Remove Artwork",
      `Are you sure you want to remove "${getReportedArtworkTitle(selectedReport)}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            try {
              setActionLoading(true);

              await deleteDoc(doc(db, matchedArtwork._collection, artworkId));

              await updateDoc(doc(db, "reports", selectedReport.id), {
                status: "resolved",
                reportStatus: "resolved",
                actionTaken: "artwork_removed",
                updatedAt: serverTimestamp(),
                handledAt: serverTimestamp(),
                handledBy: auth.currentUser?.uid || null,
              });

              closeReportMenu();
              Alert.alert("Success", "Artwork removed and report resolved.");
            } catch (error) {
              console.log("remove artwork error:", error);
              Alert.alert("Error", "Failed to remove artwork.");
            } finally {
              setActionLoading(false);
            }
          },
        },
      ]
    );
  };

  const approveReportedArtwork = async () => {
    if (!selectedReport) return;

    const artworkId = getReportedArtworkId(selectedReport);
    const matchedArtwork =
      allContent.find((item) => item.id === artworkId) || selectedReport.matchedArtwork;

    if (!artworkId || !matchedArtwork?._collection) {
      Alert.alert("Unavailable", "This report is not linked to an artwork.");
      return;
    }

    try {
      setActionLoading(true);

      await updateDoc(doc(db, matchedArtwork._collection, artworkId), {
        status: "approved",
        approved: true,
        rejected: false,
        approvedAt: serverTimestamp(),
        approvedBy: auth.currentUser?.uid || null,
        updatedAt: serverTimestamp(),
      });

      await updateDoc(doc(db, "reports", selectedReport.id), {
        status: "resolved",
        reportStatus: "resolved",
        actionTaken: "content_approved",
        updatedAt: serverTimestamp(),
        handledAt: serverTimestamp(),
        handledBy: auth.currentUser?.uid || null,
      });

      closeReportMenu();
      Alert.alert("Success", "Artwork approved and report resolved.");
    } catch (error) {
      console.log("approve reported artwork error:", error);
      Alert.alert("Error", "Failed to approve artwork.");
    } finally {
      setActionLoading(false);
    }
  };

  const statusFilters = [
    { key: "all", label: "All" },
    { key: "pending", label: "Pending" },
    { key: "resolved", label: "Resolved" },
    { key: "dismissed", label: "Dismissed" },
  ];

  const categoryFilters = [
    { key: "all", label: "All" },
    { key: "abuse", label: "Abuse" },
    { key: "copyright", label: "Copyright" },
    { key: "spam", label: "Spam" },
    { key: "other", label: "Other" },
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
              <Text style={styles.headerBadge}>Reports and Complaints</Text>
            </View>

            <View style={styles.headerIconWrap}>
              <Ionicons name="shield-outline" size={20} color="#7C3AED" />
            </View>
          </View>

          <Text style={styles.title}>Moderation Queue</Text>
          <Text style={styles.subtitle}>
            Review abuse, copyright, and spam complaints, track resolution status, and take action directly from each report
          </Text>
        </View>

        <View style={styles.summaryGrid}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Total Reports</Text>
            <Text style={styles.summaryValue}>{formatNumber(summary.total)}</Text>
          </View>

          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Pending</Text>
            <Text style={styles.summaryValue}>{formatNumber(summary.pending)}</Text>
          </View>

          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Resolved</Text>
            <Text style={styles.summaryValue}>{formatNumber(summary.resolved)}</Text>
          </View>

          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Abuse</Text>
            <Text style={styles.summaryValue}>{formatNumber(summary.abuse)}</Text>
          </View>

          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Copyright</Text>
            <Text style={styles.summaryValue}>{formatNumber(summary.copyright)}</Text>
          </View>

          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Spam</Text>
            <Text style={styles.summaryValue}>{formatNumber(summary.spam)}</Text>
          </View>
        </View>

        <View style={styles.searchWrapper}>
          <Ionicons
            name="search"
            size={16}
            color="#9CA3AF"
            style={styles.searchIcon}
          />
          <TextInput
            style={styles.searchInput}
            placeholder="Search reports, users, content, or descriptions..."
            placeholderTextColor="#9CA3AF"
            value={search}
            onChangeText={setSearch}
          />
        </View>

        <Text style={styles.filterTitle}>Status</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          {statusFilters.map((item) => {
            const active = selectedStatus === item.key;
            return (
              <TouchableOpacity
                key={item.key}
                style={[styles.filterChip, active && styles.filterChipActive]}
                onPress={() => setSelectedStatus(item.key)}
                activeOpacity={0.85}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    active && styles.filterChipTextActive,
                  ]}
                >
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <Text style={styles.filterTitle}>Category</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          {categoryFilters.map((item) => {
            const active = selectedCategory === item.key;
            return (
              <TouchableOpacity
                key={item.key}
                style={[styles.filterChip, active && styles.filterChipActive]}
                onPress={() => setSelectedCategory(item.key)}
                activeOpacity={0.85}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    active && styles.filterChipTextActive,
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
            <Text style={styles.stateText}>Loading reports...</Text>
          </View>
        ) : filteredReports.length === 0 ? (
          <View style={styles.stateWrap}>
            <Ionicons name="shield-checkmark-outline" size={28} color="#9CA3AF" />
            <Text style={styles.stateTitle}>No reports found</Text>
            <Text style={styles.stateText}>
              Try a different search or filter
            </Text>
          </View>
        ) : (
          <View style={styles.list}>
            {filteredReports.map((item) => (
              <View key={item.id} style={styles.reportCard}>
                <View style={styles.reportTopRow}>
                  <View style={styles.reportTopLeft}>
                    <View
                      style={[
                        styles.categoryIconWrap,
                        item.normalizedCategory === "abuse" &&
                          styles.categoryIconAbuse,
                        item.normalizedCategory === "copyright" &&
                          styles.categoryIconCopyright,
                        item.normalizedCategory === "spam" &&
                          styles.categoryIconSpam,
                      ]}
                    >
                      <Ionicons
                        name="alert-circle-outline"
                        size={18}
                        color={
                          item.normalizedCategory === "abuse"
                            ? "#DC2626"
                            : item.normalizedCategory === "copyright"
                            ? "#D97706"
                            : item.normalizedCategory === "spam"
                            ? "#7C3AED"
                            : "#4B5563"
                        }
                      />
                    </View>

                    <View style={styles.reportTextWrap}>
                      <Text style={styles.reportTitle}>{getReportTitle(item)}</Text>
                      <Text style={styles.reportMeta}>
                        {item.normalizedCategory} · {getTimeAgo(item?.createdAt)}
                      </Text>
                    </View>
                  </View>

                  <TouchableOpacity
                    style={styles.menuButton}
                    onPress={() => openReportMenu(item)}
                    activeOpacity={0.85}
                  >
                    <Feather name="more-horizontal" size={14} color="#111827" />
                  </TouchableOpacity>
                </View>

                <View style={styles.badgesRow}>
                  <View style={styles.categoryBadge}>
                    <Text style={styles.categoryBadgeText}>
                      {item.normalizedCategory}
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.statusBadge,
                      item.normalizedStatus === "resolved" &&
                        styles.statusBadgeResolved,
                      item.normalizedStatus === "dismissed" &&
                        styles.statusBadgeDismissed,
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusBadgeText,
                        item.normalizedStatus === "resolved" &&
                          styles.statusBadgeTextResolved,
                        item.normalizedStatus === "dismissed" &&
                          styles.statusBadgeTextDismissed,
                      ]}
                    >
                      {item.normalizedStatus}
                    </Text>
                  </View>
                </View>

                <Text style={styles.descriptionText}>
                  {getReportDescription(item)}
                </Text>

                <View style={styles.infoBlock}>
                  <View style={styles.infoRow}>
                    <Ionicons name="person-outline" size={14} color="#6B7280" />
                    <Text style={styles.infoText}>
                      Reporter: {getReporterName(item)}
                    </Text>
                  </View>

                  <View style={styles.infoRow}>
                    <Ionicons name="person-circle-outline" size={14} color="#6B7280" />
                    <Text style={styles.infoText}>
                      Reported User: {getReportedUserName(item)}
                    </Text>
                  </View>

                  <View style={styles.infoRow}>
                    <Ionicons name="image-outline" size={14} color="#6B7280" />
                    <Text style={styles.infoText}>
                      Content: {getReportedArtworkTitle(item)}
                    </Text>
                  </View>
                </View>

                {item.matchedArtwork ? (
                  <View style={styles.linkedContentCard}>
                    <Image
                      source={{ uri: getReportedImage(item, item.matchedArtwork) }}
                      style={styles.linkedImage}
                    />
                    <View style={styles.linkedTextWrap}>
                      <Text style={styles.linkedTitle} numberOfLines={1}>
                        {getReportedArtworkTitle(item)}
                      </Text>
                      <Text style={styles.linkedMeta} numberOfLines={1}>
                        Artwork status: {getArtworkStatus(item.matchedArtwork)}
                      </Text>
                    </View>
                  </View>
                ) : null}

                <View style={styles.quickActionRow}>
                  <TouchableOpacity
                    style={styles.quickActionButton}
                    onPress={() => openReportMenu(item)}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="flash-outline" size={15} color="#374151" />
                    <Text style={styles.quickActionText}>Take Action</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.quickResolveButton}
                    onPress={() => updateReportStatus(item, "resolved", "Report marked as resolved.")}
                    activeOpacity={0.85}
                  >
                    <Ionicons
                      name="checkmark-circle-outline"
                      size={15}
                      color="#FFFFFF"
                    />
                    <Text style={styles.quickResolveText}>Resolve</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        onRequestClose={closeReportMenu}
      >
        <View style={styles.modalRoot}>
          <Pressable style={styles.modalOverlay} onPress={closeReportMenu} />

          <View style={styles.modalSheetWrap}>
            <View style={styles.modalSheet}>
              <View style={styles.sheetHandle} />

              <Text style={styles.sheetTitle}>
                {selectedReport ? getReportTitle(selectedReport) : "Report"}
              </Text>

              <TouchableOpacity
                style={styles.actionItem}
                onPress={resolveReport}
                disabled={actionLoading}
              >
                <Ionicons
                  name="checkmark-circle-outline"
                  size={18}
                  color="#16A34A"
                />
                <Text style={styles.actionText}>Mark as resolved</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionItem}
                onPress={dismissReport}
                disabled={actionLoading}
              >
                <Ionicons
                  name="close-circle-outline"
                  size={18}
                  color="#D97706"
                />
                <Text style={styles.actionText}>Dismiss report</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionItem}
                onPress={approveReportedArtwork}
                disabled={actionLoading}
              >
                <Ionicons
                  name="image-outline"
                  size={18}
                  color="#2563EB"
                />
                <Text style={styles.actionText}>Approve reported artwork</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionItem}
                onPress={removeReportedArtwork}
                disabled={actionLoading}
              >
                <Ionicons name="trash-outline" size={18} color="#EF4444" />
                <Text style={styles.actionDeleteText}>Remove reported artwork</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionItem}
                onPress={blockReportedUser}
                disabled={actionLoading}
              >
                <Ionicons name="ban-outline" size={18} color="#B91C1C" />
                <Text style={styles.actionDeleteText}>Block reported user</Text>
              </TouchableOpacity>

              {actionLoading ? (
                <View style={styles.actionLoadingWrap}>
                  <ActivityIndicator size="small" color="#7C3AED" />
                </View>
              ) : null}

              <TouchableOpacity
                style={styles.cancelButton}
                onPress={closeReportMenu}
                disabled={actionLoading}
              >
                <Text style={styles.cancelButtonText}>Close</Text>
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
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  summaryCard: {
    width: "48.5%",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E9EEF5",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 12,
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

  searchWrapper: {
    position: "relative",
    justifyContent: "center",
    marginBottom: 14,
  },
  searchIcon: {
    position: "absolute",
    left: 12,
    zIndex: 1,
  },
  searchInput: {
    height: 46,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    paddingLeft: 38,
    paddingRight: 12,
    fontSize: 13,
    color: "#111827",
    fontWeight: "600",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },

  filterTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: "#4B5563",
    marginBottom: 8,
  },
  filterRow: {
    paddingBottom: 12,
  },
  filterChip: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    marginRight: 8,
  },
  filterChipActive: {
    backgroundColor: "#111827",
    borderColor: "#111827",
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#374151",
  },
  filterChipTextActive: {
    color: "#FFFFFF",
  },

  stateWrap: {
    paddingVertical: 40,
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

  list: {
    gap: 14,
  },
  reportCard: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#EDEFF3",
    borderRadius: 18,
    padding: 14,
    shadowColor: "#0F172A",
    shadowOpacity: 0.04,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  reportTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  reportTopLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: 10,
  },
  categoryIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  categoryIconAbuse: {
    backgroundColor: "#FEF2F2",
  },
  categoryIconCopyright: {
    backgroundColor: "#FFF7ED",
  },
  categoryIconSpam: {
    backgroundColor: "#F5F3FF",
  },
  reportTextWrap: {
    flex: 1,
  },
  reportTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#111827",
  },
  reportMeta: {
    marginTop: 4,
    fontSize: 12,
    color: "#94A3B8",
    fontWeight: "600",
    textTransform: "capitalize",
  },
  menuButton: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },

  badgesRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 12,
  },
  categoryBadge: {
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    marginRight: 8,
    marginBottom: 8,
  },
  categoryBadgeText: {
    fontSize: 11,
    color: "#4B5563",
    fontWeight: "800",
    textTransform: "capitalize",
  },
  statusBadge: {
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    marginBottom: 8,
  },
  statusBadgeResolved: {
    backgroundColor: "#DCFCE7",
  },
  statusBadgeDismissed: {
    backgroundColor: "#F3F4F6",
  },
  statusBadgeText: {
    fontSize: 11,
    color: "#92400E",
    fontWeight: "800",
    textTransform: "capitalize",
  },
  statusBadgeTextResolved: {
    color: "#166534",
  },
  statusBadgeTextDismissed: {
    color: "#4B5563",
  },

  descriptionText: {
    fontSize: 13,
    lineHeight: 19,
    color: "#374151",
    fontWeight: "600",
    marginBottom: 12,
  },

  infoBlock: {
    backgroundColor: "#FAFAFB",
    borderWidth: 1,
    borderColor: "#EEF2F7",
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  infoText: {
    marginLeft: 8,
    fontSize: 12,
    color: "#4B5563",
    fontWeight: "600",
  },

  linkedContentCard: {
    flexDirection: "row",
    backgroundColor: "#FAFAFB",
    borderWidth: 1,
    borderColor: "#EEF2F7",
    borderRadius: 14,
    padding: 10,
    marginBottom: 12,
  },
  linkedImage: {
    width: 52,
    height: 52,
    borderRadius: 12,
    backgroundColor: "#E5E7EB",
    marginRight: 10,
  },
  linkedTextWrap: {
    flex: 1,
    justifyContent: "center",
  },
  linkedTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#111827",
  },
  linkedMeta: {
    marginTop: 4,
    fontSize: 11,
    color: "#94A3B8",
    fontWeight: "600",
    textTransform: "capitalize",
  },

  quickActionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  quickActionButton: {
    flex: 1,
    marginRight: 8,
    backgroundColor: "#F3F4F6",
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  quickActionText: {
    marginLeft: 6,
    fontSize: 12,
    fontWeight: "800",
    color: "#374151",
  },
  quickResolveButton: {
    flex: 1,
    backgroundColor: "#111827",
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  quickResolveText: {
    marginLeft: 6,
    fontSize: 12,
    fontWeight: "800",
    color: "#FFFFFF",
  },

  modalRoot: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.18)",
  },
  modalSheetWrap: {
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 24,
  },
  sheetHandle: {
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: "#D1D5DB",
    alignSelf: "center",
    marginBottom: 14,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 14,
    textAlign: "center",
  },
  actionItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  actionText: {
    marginLeft: 10,
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
  },
  actionDeleteText: {
    marginLeft: 10,
    fontSize: 14,
    fontWeight: "700",
    color: "#EF4444",
  },
  actionLoadingWrap: {
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelButton: {
    marginTop: 14,
    height: 46,
    borderRadius: 12,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#374151",
  },
});
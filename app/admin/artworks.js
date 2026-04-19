import React, { useEffect, useMemo, useState } from "react";
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  StatusBar,
} from "react-native";
import { Ionicons, Feather } from "@expo/vector-icons";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
} from "firebase/firestore";
import { db, auth } from "../../config/firebase";

const DEFAULT_IMAGE =
  "https://via.placeholder.com/600x600.png?text=Artwork";

function formatNumber(value) {
  return Number(value || 0).toLocaleString();
}

function getImage(item) {
  return (
    item?.imageUrl ||
    item?.image ||
    item?.artworkUrl ||
    item?.photoURL ||
    item?.photoUrl ||
    item?.thumbnailUrl ||
    item?.mediaUrl ||
    DEFAULT_IMAGE
  );
}

function getTitle(item) {
  return item?.title || item?.caption || item?.name || "Untitled Artwork";
}

function getArtist(item) {
  return (
    item?.artistName ||
    item?.username ||
    item?.artist ||
    item?.createdByName ||
    item?.userName ||
    item?.displayName ||
    item?.ownerName ||
    "Unknown Artist"
  );
}

function getArtistId(item) {
  return (
    item?.userId ||
    item?.artistId ||
    item?.providerId ||
    item?.ownerId ||
    item?.createdBy ||
    ""
  );
}

function getCategory(item) {
  return item?.category || item?.type || item?.artCategory || "Other";
}

function getLikes(item) {
  if (typeof item?.likes === "number") return item.likes;
  if (typeof item?.likesCount === "number") return item.likesCount;
  if (typeof item?.totalLikes === "number") return item.totalLikes;
  if (Array.isArray(item?.likedBy)) return item.likedBy.length;
  if (Array.isArray(item?.likes)) return item.likes.length;
  return 0;
}

function getComments(item) {
  if (typeof item?.commentsCount === "number") return item.commentsCount;
  if (typeof item?.commentCount === "number") return item.commentCount;
  if (typeof item?.comments === "number") return item.comments;
  if (Array.isArray(item?.comments)) return item.comments.length;
  return 0;
}

function getStatus(item) {
  if (item?.status) return String(item.status).toLowerCase();
  if (item?.approved === true) return "approved";
  if (item?.approved === false) return "pending";
  return "pending";
}

function isFeatured(item) {
  return item?.featured === true || item?.isFeatured === true;
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

function getReportArtworkId(item) {
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

function getReportReason(item) {
  return (
    item?.reason ||
    item?.title ||
    item?.type ||
    item?.category ||
    "Reported content"
  );
}

export default function AdminArtworksScreen() {
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All Categories");
  const [selectedStatusFilter, setSelectedStatusFilter] = useState("all");
  const [selectedDateFilter, setSelectedDateFilter] = useState("all");
  const [selectedArtist, setSelectedArtist] = useState("All Artists");

  const [artworks, setArtworks] = useState([]);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sourceCollection, setSourceCollection] = useState("posts");

  const [menuVisible, setMenuVisible] = useState(false);
  const [selectedArtwork, setSelectedArtwork] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    let unsubPosts = null;
    let unsubArtworks = null;
    let unsubReports = null;
    let cleaned = false;

    const subscribeToArtworks = () => {
      const postsRef = query(
        collection(db, "posts"),
        orderBy("createdAt", "desc")
      );

      unsubPosts = onSnapshot(
        postsRef,
        (snap) => {
          if (cleaned) return;

          const list = snap.docs.map((item) => ({
            id: item.id,
            _collection: "posts",
            ...item.data(),
          }));

          if (list.length > 0) {
            setSourceCollection("posts");
            setArtworks(list);
            setLoading(false);
          } else {
            const artworksRef = query(
              collection(db, "artworks"),
              orderBy("createdAt", "desc")
            );

            if (unsubArtworks) unsubArtworks();

            unsubArtworks = onSnapshot(
              artworksRef,
              (artSnap) => {
                if (cleaned) return;

                const fallbackList = artSnap.docs.map((item) => ({
                  id: item.id,
                  _collection: "artworks",
                  ...item.data(),
                }));

                setSourceCollection("artworks");
                setArtworks(fallbackList);
                setLoading(false);
              },
              (error) => {
                console.log("artworks fallback error:", error);
                setSourceCollection("artworks");
                setArtworks([]);
                setLoading(false);
              }
            );
          }
        },
        (error) => {
          console.log("posts snapshot error:", error);

          const artworksRef = query(
            collection(db, "artworks"),
            orderBy("createdAt", "desc")
          );

          if (unsubArtworks) unsubArtworks();

          unsubArtworks = onSnapshot(
            artworksRef,
            (artSnap) => {
              if (cleaned) return;

              const fallbackList = artSnap.docs.map((item) => ({
                id: item.id,
                _collection: "artworks",
                ...item.data(),
              }));

              setSourceCollection("artworks");
              setArtworks(fallbackList);
              setLoading(false);
            },
            (fallbackError) => {
              console.log("artworks snapshot error:", fallbackError);
              setArtworks([]);
              setLoading(false);
            }
          );
        }
      );
    };

    const subscribeToReports = () => {
      unsubReports = onSnapshot(
        collection(db, "reports"),
        (snap) => {
          const list = snap.docs.map((item) => ({
            id: item.id,
            ...item.data(),
          }));
          setReports(list);
        },
        (error) => {
          console.log("reports snapshot error:", error);
          setReports([]);
        }
      );
    };

    subscribeToArtworks();
    subscribeToReports();

    return () => {
      cleaned = true;
      if (unsubPosts) unsubPosts();
      if (unsubArtworks) unsubArtworks();
      if (unsubReports) unsubReports();
    };
  }, []);

  const flaggedArtworkMap = useMemo(() => {
    const map = {};

    reports.forEach((report) => {
      const artworkId = getReportArtworkId(report);
      if (!artworkId) return;

      if (!map[artworkId]) {
        map[artworkId] = {
          count: 0,
          reasons: [],
          latestStatus: "pending",
        };
      }

      map[artworkId].count += 1;
      map[artworkId].reasons.push(getReportReason(report));
      map[artworkId].latestStatus = getReportStatus(report);
    });

    return map;
  }, [reports]);

  const artworksWithFlags = useMemo(() => {
    return artworks.map((item) => {
      const flaggedInfo = flaggedArtworkMap[item.id];

      return {
        ...item,
        flaggedCount: flaggedInfo?.count || 0,
        flaggedReasons: flaggedInfo?.reasons || [],
        flagged: Boolean(flaggedInfo),
        latestReportStatus: flaggedInfo?.latestStatus || null,
      };
    });
  }, [artworks, flaggedArtworkMap]);

  const categories = useMemo(() => {
    const set = new Set(["All Categories"]);
    artworksWithFlags.forEach((item) => {
      set.add(getCategory(item));
    });
    return Array.from(set);
  }, [artworksWithFlags]);

  const artistOptions = useMemo(() => {
    const set = new Set(["All Artists"]);
    artworksWithFlags.forEach((item) => {
      set.add(getArtist(item));
    });
    return Array.from(set);
  }, [artworksWithFlags]);

  const filteredArtworks = useMemo(() => {
    const queryText = search.trim().toLowerCase();

    return artworksWithFlags.filter((item) => {
      const title = getTitle(item).toLowerCase();
      const artist = getArtist(item).toLowerCase();
      const category = getCategory(item);
      const status = getStatus(item);

      const matchesSearch =
        !queryText ||
        title.includes(queryText) ||
        artist.includes(queryText) ||
        category.toLowerCase().includes(queryText);

      const matchesCategory =
        selectedCategory === "All Categories" ||
        category === selectedCategory;

      const matchesArtist =
        selectedArtist === "All Artists" ||
        getArtist(item) === selectedArtist;

      const matchesStatus =
        selectedStatusFilter === "all" ||
        (selectedStatusFilter === "flagged" && item.flagged) ||
        status === selectedStatusFilter;

      const matchesDate =
        selectedDateFilter === "all" ||
        (selectedDateFilter === "today" && isToday(item?.createdAt)) ||
        (selectedDateFilter === "7days" && isWithinDays(item?.createdAt, 7)) ||
        (selectedDateFilter === "30days" && isWithinDays(item?.createdAt, 30));

      return (
        matchesSearch &&
        matchesCategory &&
        matchesArtist &&
        matchesStatus &&
        matchesDate
      );
    });
  }, [
    artworksWithFlags,
    search,
    selectedCategory,
    selectedArtist,
    selectedStatusFilter,
    selectedDateFilter,
  ]);

  const openArtworkMenu = (item) => {
    setSelectedArtwork(item);
    setMenuVisible(true);
  };

  const closeArtworkMenu = () => {
    if (actionLoading) return;
    setMenuVisible(false);
    setSelectedArtwork(null);
  };

  const approveArtwork = async () => {
    if (!selectedArtwork) return;

    try {
      setActionLoading(true);

      await updateDoc(
        doc(
          db,
          selectedArtwork._collection || sourceCollection,
          selectedArtwork.id
        ),
        {
          status: "approved",
          approved: true,
          rejected: false,
          approvedAt: serverTimestamp(),
          approvedBy: auth.currentUser?.uid || null,
          updatedAt: serverTimestamp(),
        }
      );

      closeArtworkMenu();
      Alert.alert("Success", "Artwork approved successfully.");
    } catch (error) {
      console.log("approve artwork error:", error);
      Alert.alert("Error", "Failed to approve artwork.");
    } finally {
      setActionLoading(false);
    }
  };

  const rejectArtwork = async () => {
    if (!selectedArtwork) return;

    try {
      setActionLoading(true);

      await updateDoc(
        doc(
          db,
          selectedArtwork._collection || sourceCollection,
          selectedArtwork.id
        ),
        {
          status: "rejected",
          approved: false,
          rejected: true,
          rejectedAt: serverTimestamp(),
          rejectedBy: auth.currentUser?.uid || null,
          updatedAt: serverTimestamp(),
        }
      );

      closeArtworkMenu();
      Alert.alert("Success", "Artwork rejected successfully.");
    } catch (error) {
      console.log("reject artwork error:", error);
      Alert.alert("Error", "Failed to reject artwork.");
    } finally {
      setActionLoading(false);
    }
  };

  const toggleFeatured = async () => {
    if (!selectedArtwork) return;

    try {
      setActionLoading(true);

      const nextFeatured = !isFeatured(selectedArtwork);

      await updateDoc(
        doc(
          db,
          selectedArtwork._collection || sourceCollection,
          selectedArtwork.id
        ),
        {
          featured: nextFeatured,
          isFeatured: nextFeatured,
          updatedAt: serverTimestamp(),
        }
      );

      closeArtworkMenu();
      Alert.alert(
        "Success",
        nextFeatured
          ? "Artwork added to featured."
          : "Artwork removed from featured."
      );
    } catch (error) {
      console.log("toggle featured error:", error);
      Alert.alert("Error", "Failed to update featured status.");
    } finally {
      setActionLoading(false);
    }
  };

  const confirmDeleteArtwork = () => {
    if (!selectedArtwork) return;

    Alert.alert(
      "Remove Artwork",
      `Are you sure you want to remove "${getTitle(selectedArtwork)}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: deleteArtwork,
        },
      ]
    );
  };

  const deleteArtwork = async () => {
    if (!selectedArtwork) return;

    try {
      setActionLoading(true);

      await deleteDoc(
        doc(
          db,
          selectedArtwork._collection || sourceCollection,
          selectedArtwork.id
        )
      );

      closeArtworkMenu();
      Alert.alert("Success", "Artwork removed successfully.");
    } catch (error) {
      console.log("delete artwork error:", error);
      Alert.alert("Error", "Failed to remove artwork.");
    } finally {
      setActionLoading(false);
    }
  };

  const totalApproved = useMemo(() => {
    return artworksWithFlags.filter((item) => getStatus(item) === "approved")
      .length;
  }, [artworksWithFlags]);

  const totalPending = useMemo(() => {
    return artworksWithFlags.filter((item) => getStatus(item) === "pending")
      .length;
  }, [artworksWithFlags]);

  const totalRejected = useMemo(() => {
    return artworksWithFlags.filter((item) => getStatus(item) === "rejected")
      .length;
  }, [artworksWithFlags]);

  const totalFlagged = useMemo(() => {
    return artworksWithFlags.filter((item) => item.flagged).length;
  }, [artworksWithFlags]);

  const statusFilters = [
    { key: "all", label: "All" },
    { key: "pending", label: "Pending" },
    { key: "approved", label: "Approved" },
    { key: "rejected", label: "Rejected" },
    { key: "flagged", label: "Flagged" },
  ];

  const dateFilters = [
    { key: "all", label: "All Time" },
    { key: "today", label: "Today" },
    { key: "7days", label: "7 Days" },
    { key: "30days", label: "30 Days" },
  ];

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
              <Text style={styles.headerBadge}>Content Moderation</Text>
            </View>

            <View style={styles.headerIconWrap}>
              <Ionicons name="images-outline" size={20} color="#7C3AED" />
            </View>
          </View>

          <Text style={styles.title}>Artwork Management</Text>
          <Text style={styles.subtitle}>
            Review uploads, moderate content, handle flagged artwork, and manage approvals
          </Text>
        </View>

        <View style={styles.summaryGrid}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>All Artworks</Text>
            <Text style={styles.summaryValue}>{formatNumber(artworks.length)}</Text>
          </View>

          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Approved</Text>
            <Text style={styles.summaryValue}>{formatNumber(totalApproved)}</Text>
          </View>

          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Pending</Text>
            <Text style={styles.summaryValue}>{formatNumber(totalPending)}</Text>
          </View>

          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Rejected</Text>
            <Text style={styles.summaryValue}>{formatNumber(totalRejected)}</Text>
          </View>

          <View style={styles.summaryCardWide}>
            <View style={styles.flagSummaryLeft}>
              <Ionicons name="flag-outline" size={18} color="#B45309" />
              <Text style={styles.summaryLabelWide}>Flagged Content Queue</Text>
            </View>
            <Text style={styles.summaryValueWide}>{formatNumber(totalFlagged)}</Text>
          </View>
        </View>

        <View style={styles.sourcePill}>
          <Ionicons name="cloud-outline" size={14} color="#4B5563" />
          <Text style={styles.sourcePillText}>Source: {sourceCollection}</Text>
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
            placeholder="Search artworks, artists, or categories..."
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
            const active = selectedStatusFilter === item.key;
            return (
              <TouchableOpacity
                key={item.key}
                style={[styles.filterChip, active && styles.filterChipActive]}
                onPress={() => setSelectedStatusFilter(item.key)}
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

        <Text style={styles.filterTitle}>Date</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          {dateFilters.map((item) => {
            const active = selectedDateFilter === item.key;
            return (
              <TouchableOpacity
                key={item.key}
                style={[styles.filterChip, active && styles.filterChipActive]}
                onPress={() => setSelectedDateFilter(item.key)}
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
          {categories.map((item) => {
            const active = selectedCategory === item;
            return (
              <TouchableOpacity
                key={item}
                style={[styles.filterChip, active && styles.filterChipActive]}
                onPress={() => setSelectedCategory(item)}
                activeOpacity={0.85}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    active && styles.filterChipTextActive,
                  ]}
                >
                  {item}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <Text style={styles.filterTitle}>Artist</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          {artistOptions.map((item) => {
            const active = selectedArtist === item;
            return (
              <TouchableOpacity
                key={item}
                style={[styles.filterChip, active && styles.filterChipActive]}
                onPress={() => setSelectedArtist(item)}
                activeOpacity={0.85}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    active && styles.filterChipTextActive,
                  ]}
                >
                  {item}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {loading ? (
          <View style={styles.stateWrap}>
            <ActivityIndicator size="large" color="#7C3AED" />
            <Text style={styles.stateText}>Loading artworks...</Text>
          </View>
        ) : filteredArtworks.length === 0 ? (
          <View style={styles.stateWrap}>
            <Ionicons name="image-outline" size={28} color="#9CA3AF" />
            <Text style={styles.stateTitle}>No artworks found</Text>
            <Text style={styles.stateText}>
              Try a different search or filter
            </Text>
          </View>
        ) : (
          <View style={styles.grid}>
            {filteredArtworks.map((item) => (
              <View key={item.id} style={styles.card}>
                <View style={styles.imageWrapper}>
                  <Image
                    source={{ uri: getImage(item) }}
                    style={styles.cardImage}
                  />

                  <TouchableOpacity
                    style={styles.menuButton}
                    onPress={() => openArtworkMenu(item)}
                    activeOpacity={0.85}
                  >
                    <Feather name="more-horizontal" size={14} color="#111827" />
                  </TouchableOpacity>

                  {isFeatured(item) ? (
                    <View style={styles.featuredBadge}>
                      <Ionicons name="star" size={12} color="#FFFFFF" />
                      <Text style={styles.featuredBadgeText}>Featured</Text>
                    </View>
                  ) : null}

                  {item.flagged ? (
                    <View style={styles.flaggedBadge}>
                      <Ionicons name="flag" size={12} color="#FFFFFF" />
                      <Text style={styles.flaggedBadgeText}>
                        {item.flaggedCount} flag{item.flaggedCount > 1 ? "s" : ""}
                      </Text>
                    </View>
                  ) : null}
                </View>

                <View style={styles.cardBody}>
                  <Text numberOfLines={1} style={styles.cardTitle}>
                    {getTitle(item)}
                  </Text>
                  <Text numberOfLines={1} style={styles.cardArtist}>
                    by {getArtist(item)}
                  </Text>
                  <Text style={styles.cardDate}>{getTimeAgo(item?.createdAt)}</Text>

                  <View style={styles.metaRow}>
                    <View style={styles.tagChip}>
                      <Text style={styles.tagText}>{getCategory(item)}</Text>
                    </View>

                    <View
                      style={[
                        styles.statusChip,
                        getStatus(item) === "approved" &&
                          styles.statusChipApproved,
                        getStatus(item) === "pending" && styles.statusChipPending,
                        getStatus(item) === "rejected" &&
                          styles.statusChipRejected,
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusText,
                          getStatus(item) === "approved" &&
                            styles.statusTextApproved,
                          getStatus(item) === "pending" &&
                            styles.statusTextPending,
                          getStatus(item) === "rejected" &&
                            styles.statusTextRejected,
                        ]}
                      >
                        {getStatus(item)}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.statsRow}>
                    <View style={styles.statInline}>
                      <Ionicons name="heart-outline" size={13} color="#9CA3AF" />
                      <Text style={styles.statInlineText}>
                        {getLikes(item)} likes
                      </Text>
                    </View>

                    <View style={styles.statInline}>
                      <Ionicons
                        name="chatbubble-outline"
                        size={13}
                        color="#9CA3AF"
                      />
                      <Text style={styles.statInlineText}>
                        {getComments(item)} comments
                      </Text>
                    </View>
                  </View>

                  {item.flagged ? (
                    <View style={styles.flaggedInfoBox}>
                      <Text style={styles.flaggedInfoTitle}>Flagged reasons</Text>
                      <Text numberOfLines={2} style={styles.flaggedInfoText}>
                        {item.flaggedReasons.join(", ")}
                      </Text>
                    </View>
                  ) : null}
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
        onRequestClose={closeArtworkMenu}
      >
        <View style={styles.modalRoot}>
          <Pressable style={styles.modalOverlay} onPress={closeArtworkMenu} />

          <View style={styles.modalSheetWrap}>
            <View style={styles.modalSheet}>
              <View style={styles.sheetHandle} />

              <Text style={styles.sheetTitle}>
                {selectedArtwork ? getTitle(selectedArtwork) : "Artwork"}
              </Text>

              <TouchableOpacity
                style={styles.actionItem}
                onPress={approveArtwork}
                disabled={actionLoading}
              >
                <Ionicons
                  name="checkmark-circle-outline"
                  size={18}
                  color="#16A34A"
                />
                <Text style={styles.actionText}>Approve artwork</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionItem}
                onPress={rejectArtwork}
                disabled={actionLoading}
              >
                <Ionicons
                  name="close-circle-outline"
                  size={18}
                  color="#D97706"
                />
                <Text style={styles.actionText}>Reject artwork</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionItem}
                onPress={toggleFeatured}
                disabled={actionLoading}
              >
                <Ionicons name="star-outline" size={18} color="#F59E0B" />
                <Text style={styles.actionText}>
                  {selectedArtwork && isFeatured(selectedArtwork)
                    ? "Remove from featured"
                    : "Add to featured"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionItem}
                onPress={confirmDeleteArtwork}
                disabled={actionLoading}
              >
                <Ionicons name="trash-outline" size={18} color="#EF4444" />
                <Text style={styles.actionDeleteText}>Remove artwork</Text>
              </TouchableOpacity>

              {actionLoading ? (
                <View style={styles.actionLoadingWrap}>
                  <ActivityIndicator size="small" color="#7C3AED" />
                </View>
              ) : null}

              <TouchableOpacity
                style={styles.cancelButton}
                onPress={closeArtworkMenu}
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
    marginBottom: 12,
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
    alignItems: "center",
    justifyContent: "space-between",
  },
  flagSummaryLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  summaryLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#64748B",
  },
  summaryLabelWide: {
    marginLeft: 8,
    fontSize: 12,
    fontWeight: "700",
    color: "#92400E",
  },
  summaryValue: {
    marginTop: 6,
    fontSize: 22,
    color: "#111827",
    fontWeight: "900",
  },
  summaryValueWide: {
    fontSize: 24,
    color: "#92400E",
    fontWeight: "900",
  },

  sourcePill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    marginBottom: 12,
  },
  sourcePillText: {
    marginLeft: 6,
    fontSize: 12,
    fontWeight: "700",
    color: "#4B5563",
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
    marginTop: 2,
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

  grid: {
    gap: 14,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#EDEFF3",
    borderRadius: 18,
    overflow: "hidden",
    shadowColor: "#0F172A",
    shadowOpacity: 0.04,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  imageWrapper: {
    position: "relative",
  },
  cardImage: {
    width: "100%",
    height: 250,
    backgroundColor: "#E5E7EB",
  },
  menuButton: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.96)",
    alignItems: "center",
    justifyContent: "center",
  },
  featuredBadge: {
    position: "absolute",
    left: 10,
    top: 10,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F59E0B",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  featuredBadgeText: {
    marginLeft: 4,
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "800",
  },
  flaggedBadge: {
    position: "absolute",
    left: 10,
    bottom: 10,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#DC2626",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  flaggedBadgeText: {
    marginLeft: 4,
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "800",
  },

  cardBody: {
    padding: 14,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#111827",
  },
  cardArtist: {
    marginTop: 4,
    fontSize: 12,
    color: "#6B7280",
    fontWeight: "700",
  },
  cardDate: {
    marginTop: 4,
    fontSize: 11,
    color: "#94A3B8",
    fontWeight: "600",
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    marginTop: 12,
  },
  tagChip: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: "#F3F4F6",
    marginRight: 8,
    marginBottom: 8,
  },
  tagText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#6B7280",
  },
  statusChip: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 10,
    marginBottom: 8,
  },
  statusChipApproved: {
    backgroundColor: "#DCFCE7",
  },
  statusChipPending: {
    backgroundColor: "#FEF3C7",
  },
  statusChipRejected: {
    backgroundColor: "#FEE2E2",
  },
  statusText: {
    fontSize: 11,
    fontWeight: "800",
    textTransform: "capitalize",
  },
  statusTextApproved: {
    color: "#166534",
  },
  statusTextPending: {
    color: "#92400E",
  },
  statusTextRejected: {
    color: "#B91C1C",
  },
  statsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    marginTop: 8,
  },
  statInline: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: 14,
    marginTop: 4,
  },
  statInlineText: {
    marginLeft: 4,
    fontSize: 11,
    color: "#9CA3AF",
    fontWeight: "600",
  },
  flaggedInfoBox: {
    marginTop: 12,
    backgroundColor: "#FFF7ED",
    borderWidth: 1,
    borderColor: "#FED7AA",
    borderRadius: 12,
    padding: 10,
  },
  flaggedInfoTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: "#92400E",
    marginBottom: 4,
  },
  flaggedInfoText: {
    fontSize: 11,
    lineHeight: 16,
    color: "#9A3412",
    fontWeight: "600",
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
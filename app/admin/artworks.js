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
    "Unknown Artist"
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
  if (item?.status) return item.status;
  if (item?.approved === true) return "approved";
  if (item?.approved === false) return "pending";
  return "pending";
}

function isFeatured(item) {
  return item?.featured === true || item?.isFeatured === true;
}

export default function AdminArtworksScreen() {
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All Categories");
  const [artworks, setArtworks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sourceCollection, setSourceCollection] = useState("posts");

  const [menuVisible, setMenuVisible] = useState(false);
  const [selectedArtwork, setSelectedArtwork] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    let unsubPosts = null;
    let unsubArtworks = null;
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

    subscribeToArtworks();

    return () => {
      cleaned = true;
      if (unsubPosts) unsubPosts();
      if (unsubArtworks) unsubArtworks();
    };
  }, []);

  const categories = useMemo(() => {
    const set = new Set(["All Categories"]);
    artworks.forEach((item) => {
      set.add(getCategory(item));
    });
    return Array.from(set);
  }, [artworks]);

  const filteredArtworks = useMemo(() => {
    const queryText = search.trim().toLowerCase();

    return artworks.filter((item) => {
      const title = getTitle(item).toLowerCase();
      const artist = getArtist(item).toLowerCase();
      const category = getCategory(item);

      const matchesSearch =
        !queryText || title.includes(queryText) || artist.includes(queryText);

      const matchesCategory =
        selectedCategory === "All Categories" ||
        category === selectedCategory;

      return matchesSearch && matchesCategory;
    });
  }, [artworks, search, selectedCategory]);

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
        doc(db, selectedArtwork._collection || sourceCollection, selectedArtwork.id),
        {
          status: "approved",
          approved: true,
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

  const toggleFeatured = async () => {
    if (!selectedArtwork) return;

    try {
      setActionLoading(true);

      const nextFeatured = !isFeatured(selectedArtwork);

      await updateDoc(
        doc(db, selectedArtwork._collection || sourceCollection, selectedArtwork.id),
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
      "Delete Artwork",
      `Are you sure you want to delete "${getTitle(selectedArtwork)}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
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
        doc(db, selectedArtwork._collection || sourceCollection, selectedArtwork.id)
      );

      closeArtworkMenu();
      Alert.alert("Success", "Artwork deleted successfully.");
    } catch (error) {
      console.log("delete artwork error:", error);
      Alert.alert("Error", "Failed to delete artwork.");
    } finally {
      setActionLoading(false);
    }
  };

  const totalApproved = useMemo(() => {
    return artworks.filter((item) => getStatus(item) === "approved").length;
  }, [artworks]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.header}>
          <Text style={styles.logo}>ArtLinker</Text>
          <Text style={styles.title}>Artwork Management</Text>
          <Text style={styles.subtitle}>
            Moderate and manage platform content
          </Text>
        </View>

        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>All Artworks</Text>
            <Text style={styles.summaryValue}>{artworks.length}</Text>
          </View>

          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Approved</Text>
            <Text style={styles.summaryValue}>{totalApproved}</Text>
          </View>
        </View>

        <View style={styles.sourcePill}>
          <Ionicons name="cloud-outline" size={14} color="#4B5563" />
          <Text style={styles.sourcePillText}>
            Source: {sourceCollection}
          </Text>
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
            placeholder="Search artworks or artists..."
            placeholderTextColor="#9CA3AF"
            value={search}
            onChangeText={setSearch}
          />
        </View>

        <View style={styles.quickCategories}>
          {categories.map((item) => {
            const active = selectedCategory === item;

            return (
              <TouchableOpacity
                key={item}
                style={[
                  styles.quickCategoryChip,
                  active && styles.quickCategoryChipActive,
                ]}
                onPress={() => setSelectedCategory(item)}
              >
                <Text
                  style={[
                    styles.quickCategoryText,
                    active && styles.quickCategoryTextActive,
                  ]}
                >
                  {item}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {loading ? (
          <View style={styles.stateWrap}>
            <ActivityIndicator size="large" color="#4A63FF" />
            <Text style={styles.stateText}>Loading artworks...</Text>
          </View>
        ) : filteredArtworks.length === 0 ? (
          <View style={styles.stateWrap}>
            <Ionicons name="image-outline" size={28} color="#9CA3AF" />
            <Text style={styles.stateTitle}>No artworks found</Text>
            <Text style={styles.stateText}>
              Try a different search or category
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
                  >
                    <Feather name="more-horizontal" size={14} color="#111827" />
                  </TouchableOpacity>

                  {isFeatured(item) ? (
                    <View style={styles.featuredBadge}>
                      <Ionicons name="star" size={12} color="#FFFFFF" />
                      <Text style={styles.featuredBadgeText}>Featured</Text>
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

                  <View style={styles.metaRow}>
                    <View style={styles.tagChip}>
                      <Text style={styles.tagText}>{getCategory(item)}</Text>
                    </View>

                    <View
                      style={[
                        styles.statusChip,
                        getStatus(item) === "approved"
                          ? styles.statusChipApproved
                          : styles.statusChipPending,
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusText,
                          getStatus(item) === "approved"
                            ? styles.statusTextApproved
                            : styles.statusTextPending,
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
                onPress={toggleFeatured}
                disabled={actionLoading}
              >
                <Ionicons
                  name="star-outline"
                  size={18}
                  color="#F59E0B"
                />
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
                <Text style={styles.actionDeleteText}>Delete artwork</Text>
              </TouchableOpacity>

              {actionLoading ? (
                <View style={styles.actionLoadingWrap}>
                  <ActivityIndicator size="small" color="#4A63FF" />
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
    backgroundColor: "#FFFFFF",
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
    color: "#F06CE9",
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
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
    gap: 10,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#EEF0F4",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  summaryLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#4B5563",
  },
  summaryValue: {
    marginTop: 6,
    fontSize: 20,
    color: "#111827",
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
    marginBottom: 12,
  },
  searchIcon: {
    position: "absolute",
    left: 12,
    zIndex: 1,
  },
  searchInput: {
    height: 42,
    backgroundColor: "#F3F4F6",
    borderRadius: 12,
    paddingLeft: 34,
    paddingRight: 12,
    fontSize: 13,
    color: "#111827",
    fontWeight: "600",
  },
  quickCategories: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 14,
  },
  quickCategoryChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: "#F3F4F6",
  },
  quickCategoryChipActive: {
    backgroundColor: "#4A63FF",
  },
  quickCategoryText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#6B7280",
  },
  quickCategoryTextActive: {
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
    borderRadius: 14,
    overflow: "hidden",
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
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.95)",
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
  cardBody: {
    padding: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#111827",
  },
  cardArtist: {
    marginTop: 4,
    fontSize: 12,
    color: "#9CA3AF",
    fontWeight: "600",
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
  },
  tagChip: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: "#F3F4F6",
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
  },
  statusChipApproved: {
    backgroundColor: "#DCFCE7",
  },
  statusChipPending: {
    backgroundColor: "#FEF3C7",
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
  statsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 12,
    marginTop: 12,
  },
  statInline: {
    flexDirection: "row",
    alignItems: "center",
  },
  statInlineText: {
    marginLeft: 4,
    fontSize: 11,
    color: "#9CA3AF",
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
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
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
    height: 44,
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
import React, { useEffect, useMemo, useState } from "react";
import {

  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Image,
  ScrollView,
  Modal,
  ActivityIndicator,
  Alert,
  StatusBar,
  Share,
} from "react-native";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { onAuthStateChanged } from "firebase/auth";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { auth, db } from "../../config/firebase";

const DEFAULT_AVATAR = "https://via.placeholder.com/300";
const DEFAULT_IMAGE = "https://via.placeholder.com/800x800.png?text=Artwork";

export default function ExploreScreen() {
  const [currentUser, setCurrentUser] = useState(auth.currentUser);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  const [searchText, setSearchText] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");

  const [featuredIndex, setFeaturedIndex] = useState(0);

  const [profile, setProfile] = useState({
    name: "Artist",
    avatar: DEFAULT_AVATAR,
  });

  const [selectedPost, setSelectedPost] = useState(null);
  const [postModalVisible, setPostModalVisible] = useState(false);
  const [modalImageRatio, setModalImageRatio] = useState(1);

  const [commentModalVisible, setCommentModalVisible] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [comments, setComments] = useState([]);
  const [commentLoading, setCommentLoading] = useState(false);
  const [sendingComment, setSendingComment] = useState(false);

  const [followLoadingId, setFollowLoadingId] = useState(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user || null);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!currentUser) return;

    const loadProfile = async () => {
      try {
        const userRef = doc(db, "users", currentUser.uid);
        const snap = await getDoc(userRef);

        if (snap.exists()) {
          const data = snap.data();
          setProfile({
            name: data.name || data.displayName || "Artist",
            avatar: data.avatar || data.photoURL || DEFAULT_AVATAR,
          });
        }
      } catch (error) {
        console.log("EXPLORE PROFILE ERROR:", error?.code, error?.message, error);
      }
    };

    loadProfile();
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) {
      setPosts([]);
      setLoading(false);
      return;
    }

    const postsQuery = query(collection(db, "posts"));

    const unsubscribe = onSnapshot(
      postsQuery,
      async (snapshot) => {
        try {
          const allPosts = await Promise.all(
            snapshot.docs.map(async (item) => {
              const data = item.data();

              let ownerName = data.userName || "Artist";
              let ownerAvatar = data.userAvatar || DEFAULT_AVATAR;
              let likedByMe = false;
              let savedByMe = false;
              let followingOwner = false;

              if (data.userId) {
                try {
                  const ownerRef = doc(db, "users", data.userId);
                  const ownerSnap = await getDoc(ownerRef);

                  if (ownerSnap.exists()) {
                    const ownerData = ownerSnap.data();
                    ownerName =
                      ownerData.name || ownerData.displayName || ownerName;
                    ownerAvatar =
                      ownerData.avatar || ownerData.photoURL || ownerAvatar;
                  }
                } catch (error) {
                  console.log("EXPLORE OWNER ERROR:", error?.code, error?.message, error);
                }
              }

              if (currentUser) {
                try {
                  const likeRef = doc(db, "posts", item.id, "likes", currentUser.uid);
                  const saveRef = doc(
                    db,
                    "users",
                    currentUser.uid,
                    "savedPosts",
                    item.id
                  );
                  const followRef = data.userId
                    ? doc(db, "users", data.userId, "followers", currentUser.uid)
                    : null;

                  const [likeSnap, saveSnap, followSnap] = await Promise.all([
                    getDoc(likeRef),
                    getDoc(saveRef),
                    followRef ? getDoc(followRef) : Promise.resolve({ exists: () => false }),
                  ]);

                  likedByMe = likeSnap.exists();
                  savedByMe = saveSnap.exists();
                  followingOwner = followSnap.exists();
                } catch (error) {
                  console.log(
                    "EXPLORE RELATION ERROR:",
                    error?.code,
                    error?.message,
                    error
                  );
                }
              }

              return {
                id: item.id,
                ...data,
                ownerName,
                ownerAvatar,
                likedByMe,
                savedByMe,
                followingOwner,
                likesCount: data.likesCount || 0,
                commentsCount: data.commentsCount || 0,
                savesCount: data.savesCount || 0,
                imageUrl: data.imageUrl || data.image || data.postImage || "",
              };
            })
          );

          allPosts.sort((a, b) => getMillis(b.createdAt) - getMillis(a.createdAt));
          setPosts(allPosts);
          setLoading(false);
        } catch (error) {
          console.log("EXPLORE POSTS ERROR:", error?.code, error?.message, error);
          setLoading(false);
        }
      },
      (error) => {
        console.log("EXPLORE SNAPSHOT ERROR:", error?.code, error?.message, error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [currentUser]);

  const categories = useMemo(() => {
    const dynamicCategories = posts
      .map((item) => item.category)
      .filter((value) => typeof value === "string" && value.trim());

    return ["All", ...Array.from(new Set(dynamicCategories))];
  }, [posts]);

  const filteredPosts = useMemo(() => {
    let result = [...posts];

    if (selectedCategory !== "All") {
      result = result.filter((item) => item.category === selectedCategory);
    }

    if (searchText.trim()) {
      const term = searchText.toLowerCase();

      result = result.filter((item) => {
        const titleMatch = item.title?.toLowerCase().includes(term);
        const artistMatch = item.ownerName?.toLowerCase().includes(term);
        const descMatch = item.description?.toLowerCase().includes(term);
        const storyMatch = item.story?.toLowerCase().includes(term);
        const materialsMatch = item.materials?.toLowerCase().includes(term);
        const tagsMatch = Array.isArray(item.tags)
          ? item.tags.join(" ").toLowerCase().includes(term)
          : false;

        return (
          titleMatch ||
          artistMatch ||
          descMatch ||
          storyMatch ||
          materialsMatch ||
          tagsMatch
        );
      });
    }

    return result;
  }, [posts, selectedCategory, searchText]);

  useEffect(() => {
    if (filteredPosts.length === 0) {
      setFeaturedIndex(0);
      return;
    }

    if (featuredIndex >= filteredPosts.length) {
      setFeaturedIndex(0);
    }
  }, [filteredPosts, featuredIndex]);

  useEffect(() => {
    if (filteredPosts.length <= 1) return;

    const interval = setInterval(() => {
      setFeaturedIndex((prev) => {
        const next = prev + 1;
        return next >= filteredPosts.length ? 0 : next;
      });
    }, 30000);

    return () => clearInterval(interval);
  }, [filteredPosts]);

  const featuredPost =
    filteredPosts.length > 0 ? filteredPosts[featuredIndex] : null;

  const updatePostState = (postId, updater) => {
    setPosts((prev) =>
      prev.map((item) => (item.id === postId ? { ...item, ...updater(item) } : item))
    );

    setSelectedPost((prev) => {
      if (!prev || prev.id !== postId) return prev;
      return { ...prev, ...updater(prev) };
    });
  };

  const sendNotification = async ({
    ownerId,
    type,
    title,
    message,
    postId = "",
  }) => {
    if (!currentUser || !ownerId || ownerId === currentUser.uid) return;

    try {
      await addDoc(collection(db, "notifications"), {
        userId: ownerId,
        senderId: currentUser.uid,
        senderName: profile.name,
        senderAvatar: profile.avatar,
        type,
        title,
        message,
        postId,
        read: false,
        createdAt: serverTimestamp(),
      });
    } catch (error) {
      console.log(
        "EXPLORE NOTIFICATION ERROR:",
        error?.code,
        error?.message,
        error
      );
    }
  };

  const handleLike = async (post) => {
    if (!currentUser?.uid) {
      Alert.alert("Login required", "Please log in first.");
      return;
    }

    try {
      const postRef = doc(db, "posts", post.id);
      const likeRef = doc(db, "posts", post.id, "likes", currentUser.uid);
      const likedPostRef = doc(db, "users", currentUser.uid, "likedPosts", post.id);

      const likeSnap = await getDoc(likeRef);

      if (likeSnap.exists()) {
        await deleteDoc(likeRef);
        await deleteDoc(likedPostRef);

        await updateDoc(postRef, {
          likesCount: increment(-1),
          updatedAt: serverTimestamp(),
        });

        updatePostState(post.id, (item) => ({
          likedByMe: false,
          likesCount: Math.max((item.likesCount || 1) - 1, 0),
        }));
      } else {
        await setDoc(likeRef, {
          userId: currentUser.uid,
          createdAt: serverTimestamp(),
        });

        await setDoc(likedPostRef, {
          postId: post.id,
          ownerId: post.userId || "",
          title: post.title || "",
          imageUrl: post.imageUrl || "",
          category: post.category || "",
          createdAt: serverTimestamp(),
        });

        await updateDoc(postRef, {
          likesCount: increment(1),
          updatedAt: serverTimestamp(),
        });

        updatePostState(post.id, (item) => ({
          likedByMe: true,
          likesCount: (item.likesCount || 0) + 1,
        }));

        await sendNotification({
          ownerId: post.userId,
          type: "like",
          title: "New Like",
          message: `${profile.name} liked your post "${post.title || "Untitled"}".`,
          postId: post.id,
        });
      }
    } catch (error) {
      console.log("LIKE ERROR CODE:", error?.code);
      console.log("LIKE ERROR MESSAGE:", error?.message);
      console.log("LIKE ERROR FULL:", error);
      Alert.alert("Error", "Could not update like.");
    }
  };

  const handleSave = async (post) => {
    if (!currentUser?.uid) {
      Alert.alert("Login required", "Please log in first.");
      return;
    }

    try {
      const postRef = doc(db, "posts", post.id);
      const saveRef = doc(db, "users", currentUser.uid, "savedPosts", post.id);
      const saveSnap = await getDoc(saveRef);

      if (saveSnap.exists()) {
        await deleteDoc(saveRef);

        await updateDoc(postRef, {
          savesCount: increment(-1),
          updatedAt: serverTimestamp(),
        });

        updatePostState(post.id, (item) => ({
          savedByMe: false,
          savesCount: Math.max((item.savesCount || 1) - 1, 0),
        }));
      } else {
        await setDoc(saveRef, {
          postId: post.id,
          ownerId: post.userId || "",
          title: post.title || "",
          imageUrl: post.imageUrl || "",
          category: post.category || "",
          createdAt: serverTimestamp(),
        });

        await updateDoc(postRef, {
          savesCount: increment(1),
          updatedAt: serverTimestamp(),
        });

        updatePostState(post.id, (item) => ({
          savedByMe: true,
          savesCount: (item.savesCount || 0) + 1,
        }));
      }
    } catch (error) {
      console.log("SAVE ERROR CODE:", error?.code);
      console.log("SAVE ERROR MESSAGE:", error?.message);
      console.log("SAVE ERROR FULL:", error);
      Alert.alert("Error", "Could not update save.");
    }
  };

  const handleFollow = async (post) => {
    if (!currentUser) {
      Alert.alert("Login required", "Please log in first.");
      return;
    }

    if (!post?.userId) {
      Alert.alert("Error", "Artist information is missing.");
      return;
    }

    if (post.userId === currentUser.uid) {
      Alert.alert("Info", "You cannot follow yourself.");
      return;
    }

    try {
      setFollowLoadingId(post.id);

      const followerRef = doc(db, "users", post.userId, "followers", currentUser.uid);
      const followingRef = doc(db, "users", currentUser.uid, "following", post.userId);

      const followerSnap = await getDoc(followerRef);

      if (followerSnap.exists()) {
        await deleteDoc(followerRef);
        await deleteDoc(followingRef);

        updatePostState(post.id, () => ({
          followingOwner: false,
        }));
      } else {
        await setDoc(followerRef, {
          followerId: currentUser.uid,
          followerName: profile.name,
          followerAvatar: profile.avatar,
          createdAt: serverTimestamp(),
        });

        await setDoc(followingRef, {
          userId: post.userId,
          userName: post.ownerName || "",
          userAvatar: post.ownerAvatar || "",
          createdAt: serverTimestamp(),
        });

        updatePostState(post.id, () => ({
          followingOwner: true,
        }));

        await sendNotification({
          ownerId: post.userId,
          type: "follow",
          title: "New Follower",
          message: `${profile.name} started following you.`,
          postId: post.id,
        });
      }
    } catch (error) {
      console.log("FOLLOW ERROR:", error?.code, error?.message, error);
      Alert.alert("Error", "Could not update follow.");
    } finally {
      setFollowLoadingId(null);
    }
  };

  const openPostModal = (post) => {
    const imageUri = post?.imageUrl || DEFAULT_IMAGE;

    Image.getSize(
      imageUri,
      (imgWidth, imgHeight) => {
        if (imgWidth && imgHeight) {
          setModalImageRatio(imgWidth / imgHeight);
        } else {
          setModalImageRatio(1);
        }

        setSelectedPost(post);
        setPostModalVisible(true);
      },
      () => {
        setModalImageRatio(1);
        setSelectedPost(post);
        setPostModalVisible(true);
      }
    );
  };

  const openCommentModal = async (post) => {
    if (post.allowComments === false) {
      Alert.alert("Comments disabled", "This artist has turned off comments.");
      return;
    }

    setSelectedPost(post);
    setCommentText("");
    setComments([]);
    setCommentModalVisible(true);
    setCommentLoading(true);

    try {
      const commentsQuery = query(
        collection(db, "posts", post.id, "comments"),
        orderBy("createdAt", "asc")
      );

      const snap = await getDocs(commentsQuery);

      const list = snap.docs.map((item) => ({
        id: item.id,
        ...item.data(),
      }));

      setComments(list);
    } catch (error) {
      console.log("COMMENTS ERROR:", error?.code, error?.message, error);
      setComments([]);
    } finally {
      setCommentLoading(false);
    }
  };

  const submitComment = async () => {
    if (!currentUser || !selectedPost) return;

    if (!commentText.trim()) {
      Alert.alert("Missing comment", "Please enter a comment.");
      return;
    }

    try {
      setSendingComment(true);

      const payload = {
        userId: currentUser.uid,
        userName: profile.name,
        userAvatar: profile.avatar,
        text: commentText.trim(),
        createdAt: serverTimestamp(),
      };

      await addDoc(collection(db, "posts", selectedPost.id, "comments"), payload);

      await updateDoc(doc(db, "posts", selectedPost.id), {
        commentsCount: increment(1),
        updatedAt: serverTimestamp(),
      });

      updatePostState(selectedPost.id, (item) => ({
        commentsCount: (item.commentsCount || 0) + 1,
      }));

      await sendNotification({
        ownerId: selectedPost.userId,
        type: "comment",
        title: "New Comment",
        message: `${profile.name} commented on your post "${selectedPost.title || "Untitled"}".`,
        postId: selectedPost.id,
      });

      setComments((prev) => [
        ...prev,
        {
          id: String(Date.now()),
          userId: currentUser.uid,
          userName: profile.name,
          userAvatar: profile.avatar,
          text: commentText.trim(),
        },
      ]);

      setCommentText("");
    } catch (error) {
      console.log("COMMENT ERROR:", error?.code, error?.message, error);
      Alert.alert("Error", "Could not add comment.");
    } finally {
      setSendingComment(false);
    }
  };

  const handleShare = async (post) => {
    try {
      await Share.share({
        message: `${post.title || "Artwork"}\n\n${post.description || ""}`,
      });
    } catch (error) {
      console.log("SHARE ERROR:", error?.code, error?.message, error);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.logo}>ArtLinker</Text>

          <View style={styles.profileButton}>
            <Image
              source={{ uri: profile.avatar || DEFAULT_AVATAR }}
              style={styles.profileImage}
            />
          </View>
        </View>

        <View style={styles.searchWrapper}>
          <TextInput
            value={searchText}
            onChangeText={setSearchText}
            placeholder="Search artwork, artists, tags"
            placeholderTextColor="#999"
            style={styles.searchInput}
          />
          <Ionicons name="search" size={20} color="#777" style={styles.searchIcon} />
        </View>

        <Text style={styles.heading}>Explore Artwork</Text>
        <Text style={styles.subheading}>
          Search and discover amazing digital art from our community
        </Text>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryRow}
        >
          {categories.map((category) => {
            const active = selectedCategory === category;

            return (
              <TouchableOpacity
                key={category}
                style={[styles.categoryButton, active && styles.categoryButtonActive]}
                onPress={() => setSelectedCategory(category)}
              >
                <Text
                  style={[
                    styles.categoryText,
                    active && styles.categoryTextActive,
                  ]}
                >
                  {category}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {featuredPost ? (
          <TouchableOpacity
            activeOpacity={0.92}
            style={styles.featuredCard}
            onPress={() => openPostModal(featuredPost)}
          >
            <Image
              source={{ uri: featuredPost.imageUrl || DEFAULT_IMAGE }}
              style={styles.featuredImage}
            />
            <View style={styles.featuredOverlay}>
              <Text style={styles.featuredBadge}>Featured</Text>
              <Text style={styles.featuredTitle}>
                {featuredPost.title || "Untitled"}
              </Text>
              <Text style={styles.featuredArtist}>
                by {featuredPost.ownerName || "Artist"}
              </Text>
            </View>
          </TouchableOpacity>
        ) : null}

        {loading ? (
          <View style={styles.loaderWrap}>
            <ActivityIndicator size="large" color="#4a63ff" />
            <Text style={styles.loaderText}>Loading artworks...</Text>
          </View>
        ) : filteredPosts.length === 0 ? (
          <View style={styles.emptyBox}>
            <Ionicons name="images-outline" size={34} color="#4a63ff" />
            <Text style={styles.emptyTitle}>No artworks found</Text>
            <Text style={styles.emptyText}>Try another search or category.</Text>
          </View>
        ) : (
          filteredPosts.map((item) => (
            <TouchableOpacity
              key={item.id}
              activeOpacity={0.92}
              style={styles.card}
              onPress={() => openPostModal(item)}
            >
              <Image
                source={{ uri: item.imageUrl || DEFAULT_IMAGE }}
                style={styles.cardImage}
              />

              <View style={styles.cardBody}>
                <Text style={styles.cardTitle}>{item.title || "Untitled"}</Text>

                <View style={styles.artistRow}>
                  <MaterialIcons name="account-circle" size={16} color="#555" />
                  <Text style={styles.artistName}>
                    {item.ownerName || "Artist"}
                  </Text>
                </View>

                {!!item.category && (
                  <View style={styles.categoryChip}>
                    <Text style={styles.categoryChipText}>{item.category}</Text>
                  </View>
                )}

                <View style={styles.cardFooter}>
                  <TouchableOpacity
                    style={styles.footerAction}
                    onPress={() => handleLike(item)}
                  >
                    <Ionicons
                      name={item.likedByMe ? "heart" : "heart-outline"}
                      size={16}
                      color={item.likedByMe ? "#FF4D6D" : "#666"}
                    />
                    <Text style={styles.footerText}>{item.likesCount || 0}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.footerAction}
                    onPress={() => openCommentModal(item)}
                  >
                    <Ionicons name="chatbubble-outline" size={15} color="#666" />
                    <Text style={styles.footerText}>{item.commentsCount || 0}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.footerAction}
                    onPress={() => handleSave(item)}
                  >
                    <Ionicons
                      name={item.savedByMe ? "bookmark" : "bookmark-outline"}
                      size={16}
                      color={item.savedByMe ? "#7C3AED" : "#666"}
                    />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.footerAction}
                    onPress={() => handleShare(item)}
                  >
                    <Ionicons name="share-social-outline" size={16} color="#666" />
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      <Modal visible={postModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Artwork Details</Text>
                <TouchableOpacity onPress={() => setPostModalVisible(false)}>
                  <Ionicons name="close" size={24} color="#111" />
                </TouchableOpacity>
              </View>

              {selectedPost ? (
                <>
                  <Image
                    source={{ uri: selectedPost.imageUrl || DEFAULT_IMAGE }}
                    style={[
                      styles.modalImage,
                      {
                        width: "100%",
                        aspectRatio: modalImageRatio,
                        height: undefined,
                      },
                    ]}
                    resizeMode="cover"
                  />

                  <View style={styles.modalOwnerRow}>
                    <View style={styles.modalOwnerLeft}>
                      <Image
                        source={{
                          uri: selectedPost.ownerAvatar || DEFAULT_AVATAR,
                        }}
                        style={styles.modalOwnerAvatar}
                      />
                      <View style={styles.modalOwnerInfo}>
                        <Text style={styles.modalOwnerName}>
                          {selectedPost.ownerName || "Artist"}
                        </Text>
                        <Text style={styles.modalOwnerSub}>Digital Artist</Text>
                      </View>
                    </View>

                    {selectedPost.userId &&
                    selectedPost.userId !== currentUser?.uid ? (
                      <TouchableOpacity
                        style={
                          selectedPost.followingOwner
                            ? styles.followingButton
                            : styles.followButton
                        }
                        onPress={() => handleFollow(selectedPost)}
                        disabled={followLoadingId === selectedPost.id}
                      >
                        {followLoadingId === selectedPost.id ? (
                          <ActivityIndicator
                            size="small"
                            color={selectedPost.followingOwner ? "#2F2A5A" : "#fff"}
                          />
                        ) : (
                          <>
                            <Ionicons
                              name={
                                selectedPost.followingOwner
                                  ? "checkmark-circle"
                                  : "person-add"
                              }
                              size={15}
                              color={selectedPost.followingOwner ? "#2F2A5A" : "#fff"}
                            />
                            <Text
                              style={
                                selectedPost.followingOwner
                                  ? styles.followingButtonText
                                  : styles.followButtonText
                              }
                            >
                              {selectedPost.followingOwner ? "Following" : "Follow"}
                            </Text>
                          </>
                        )}
                      </TouchableOpacity>
                    ) : null}
                  </View>

                  <Text style={styles.modalArtworkTitle}>
                    {selectedPost.title || "Untitled"}
                  </Text>

                  {!!selectedPost.category && (
                    <View style={styles.modalBadgeRow}>
                      <Text style={styles.modalBadge}>{selectedPost.category}</Text>
                    </View>
                  )}

                  <View style={styles.modalStatsRow}>
                    <TouchableOpacity
                      style={styles.modalStatItem}
                      onPress={() => handleLike(selectedPost)}
                    >
                      <Ionicons
                        name={selectedPost.likedByMe ? "heart" : "heart-outline"}
                        size={18}
                        color={selectedPost.likedByMe ? "#FF4D6D" : "#666"}
                      />
                      <Text style={styles.modalStatText}>
                        {selectedPost.likesCount || 0}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.modalStatItem}
                      onPress={() => openCommentModal(selectedPost)}
                    >
                      <Ionicons name="chatbubble-outline" size={18} color="#666" />
                      <Text style={styles.modalStatText}>
                        {selectedPost.commentsCount || 0}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.modalStatItem}
                      onPress={() => handleSave(selectedPost)}
                    >
                      <Ionicons
                        name={selectedPost.savedByMe ? "bookmark" : "bookmark-outline"}
                        size={18}
                        color={selectedPost.savedByMe ? "#7C3AED" : "#666"}
                      />
                      <Text style={styles.modalStatText}>
                        {selectedPost.savesCount || 0}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {!!selectedPost.description && (
                    <>
                      <Text style={styles.modalSectionLabel}>Description</Text>
                      <Text style={styles.modalText}>{selectedPost.description}</Text>
                    </>
                  )}

                  {!!selectedPost.story && (
                    <>
                      <Text style={styles.modalSectionLabel}>Artist Story</Text>
                      <Text style={styles.modalText}>{selectedPost.story}</Text>
                    </>
                  )}

                  {!!selectedPost.materials && (
                    <>
                      <Text style={styles.modalSectionLabel}>Tools / Materials</Text>
                      <Text style={styles.modalText}>{selectedPost.materials}</Text>
                    </>
                  )}

                  {!!selectedPost.yearCreated && (
                    <>
                      <Text style={styles.modalSectionLabel}>Year Created</Text>
                      <Text style={styles.modalText}>{selectedPost.yearCreated}</Text>
                    </>
                  )}

                  {Array.isArray(selectedPost.tags) && selectedPost.tags.length > 0 && (
                    <>
                      <Text style={styles.modalSectionLabel}>Tags</Text>
                      <View style={styles.modalTagsWrap}>
                        {selectedPost.tags.map((tag, index) => (
                          <View
                            key={`${selectedPost.id}-modal-tag-${index}`}
                            style={styles.modalTagChip}
                          >
                            <Text style={styles.modalTagText}>#{tag}</Text>
                          </View>
                        ))}
                      </View>
                    </>
                  )}
                </>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={commentModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.commentModal}>
            <View style={styles.commentHeader}>
              <Text style={styles.modalTitle}>Comments</Text>
              <TouchableOpacity onPress={() => setCommentModalVisible(false)}>
                <Ionicons name="close" size={22} color="#111827" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.commentsList} showsVerticalScrollIndicator={false}>
              {commentLoading ? (
                <ActivityIndicator size="small" color="#7C3AED" />
              ) : comments.length === 0 ? (
                <Text style={styles.emptyCommentText}>No comments yet</Text>
              ) : (
                comments.map((item) => (
                  <View key={item.id} style={styles.commentItem}>
                    <Image
                      source={{
                        uri: item.userAvatar || DEFAULT_AVATAR,
                      }}
                      style={styles.commentAvatar}
                    />
                    <View style={styles.commentContent}>
                      <Text style={styles.commentName}>{item.userName || "User"}</Text>
                      <Text style={styles.commentBody}>{item.text || ""}</Text>
                    </View>
                  </View>
                ))
              )}
            </ScrollView>

            <TextInput
              style={styles.modalInput}
              placeholder="Write your comment"
              value={commentText}
              onChangeText={setCommentText}
              multiline
            />

            <TouchableOpacity
              style={styles.primaryModalBtn}
              onPress={submitComment}
              disabled={sendingComment}
            >
              {sendingComment ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.primaryModalBtnText}>Post Comment</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryModalBtn}
              onPress={() => setCommentModalVisible(false)}
            >
              <Text style={styles.secondaryModalBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
    backgroundColor: "#ffffff",
  },
  scrollContent: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 24,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  logo: {
    fontSize: 28,
    fontWeight: "800",
    color: "#f062d6",
  },
  profileButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    overflow: "hidden",
    backgroundColor: "#f3f3f6",
  },
  profileImage: {
    width: "100%",
    height: "100%",
  },
  searchWrapper: {
    marginTop: 14,
    position: "relative",
    justifyContent: "center",
  },
  searchInput: {
    backgroundColor: "#f3f3f6",
    borderRadius: 18,
    height: 44,
    paddingLeft: 14,
    paddingRight: 42,
    fontSize: 14,
    color: "#222",
    borderWidth: 1,
    borderColor: "#ececf1",
  },
  searchIcon: {
    position: "absolute",
    right: 14,
  },
  heading: {
    marginTop: 18,
    fontSize: 30,
    fontWeight: "800",
    color: "#1f1f1f",
  },
  subheading: {
    marginTop: 6,
    fontSize: 13,
    color: "#8d8d99",
    lineHeight: 18,
    maxWidth: 280,
  },
  categoryRow: {
    paddingTop: 16,
    paddingBottom: 14,
    gap: 10,
  },
  categoryButton: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: "transparent",
  },
  categoryButtonActive: {
    backgroundColor: "#4a63ff",
  },
  categoryText: {
    fontSize: 14,
    color: "#9f9fb0",
    fontWeight: "600",
  },
  categoryTextActive: {
    color: "#ffffff",
  },
  featuredCard: {
    width: "100%",
    height: 230,
    borderRadius: 20,
    overflow: "hidden",
    marginBottom: 18,
    backgroundColor: "#f3f3f6",
  },
  featuredImage: {
    width: "100%",
    height: "100%",
  },
  featuredOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: 18,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  featuredBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#ffffff",
    color: "#222",
    fontSize: 11,
    fontWeight: "700",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    marginBottom: 8,
  },
  featuredTitle: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "800",
  },
  featuredArtist: {
    color: "#f3f4f6",
    marginTop: 4,
    fontSize: 13,
  },
  loaderWrap: {
    paddingVertical: 60,
    alignItems: "center",
  },
  loaderText: {
    marginTop: 12,
    color: "#777",
  },
  emptyBox: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 28,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e8e8ee",
  },
  emptyTitle: {
    fontWeight: "800",
    fontSize: 17,
    color: "#111827",
    marginTop: 10,
  },
  emptyText: {
    marginTop: 6,
    color: "#6B7280",
    textAlign: "center",
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#e8e8ee",
    width: "100%",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    marginBottom: 16,
  },
  cardImage: {
    width: "100%",
    height: 250,
    backgroundColor: "#f3f3f6",
  },
  cardBody: {
    padding: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#222",
  },
  artistRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
  },
  artistName: {
    marginLeft: 5,
    fontSize: 12,
    color: "#666",
  },
  categoryChip: {
    alignSelf: "flex-start",
    marginTop: 10,
    backgroundColor: "#eef2ff",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  categoryChipText: {
    color: "#4a63ff",
    fontSize: 11,
    fontWeight: "700",
  },
  cardFooter: {
    marginTop: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  footerAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  footerText: {
    fontSize: 12,
    color: "#666",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.45)",
    justifyContent: "center",
    padding: 16,
  },
  modalCard: {
    backgroundColor: "#fff",
    borderRadius: 22,
    maxHeight: "88%",
    padding: 16,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 19,
    fontWeight: "800",
    color: "#111827",
  },
  modalImage: {
    borderRadius: 18,
    backgroundColor: "#f3f3f6",
    marginBottom: 14,
  },
  modalOwnerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  modalOwnerLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    paddingRight: 10,
  },
  modalOwnerAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    marginRight: 10,
    backgroundColor: "#E5E7EB",
  },
  modalOwnerInfo: {
    flex: 1,
  },
  modalOwnerName: {
    fontSize: 14,
    fontWeight: "800",
    color: "#111827",
  },
  modalOwnerSub: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 2,
  },
  followButton: {
    minWidth: 104,
    backgroundColor: "#7C3AED",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  followButtonText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 12,
  },
  followingButton: {
    minWidth: 110,
    backgroundColor: "#EDE9FE",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: "#D8B4FE",
  },
  followingButtonText: {
    color: "#2F2A5A",
    fontWeight: "800",
    fontSize: 12,
  },
  modalArtworkTitle: {
    fontWeight: "800",
    fontSize: 22,
    color: "#111827",
    marginBottom: 8,
  },
  modalBadgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 14,
  },
  modalBadge: {
    alignSelf: "flex-start",
    fontSize: 12,
    fontWeight: "700",
    color: "#6C2CF6",
    backgroundColor: "#F4F0FF",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  modalStatsRow: {
    flexDirection: "row",
    gap: 18,
    marginBottom: 14,
  },
  modalStatItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  modalStatText: {
    fontSize: 13,
    color: "#4B5563",
    fontWeight: "700",
  },
  modalSectionLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: "#374151",
    marginTop: 8,
    marginBottom: 5,
  },
  modalText: {
    fontSize: 14,
    lineHeight: 21,
    color: "#4B5563",
  },
  modalTagsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
    marginBottom: 6,
  },
  modalTagChip: {
    backgroundColor: "#F3F4F6",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  modalTagText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#374151",
  },
  commentModal: {
    backgroundColor: "#fff",
    borderRadius: 22,
    padding: 18,
    maxHeight: "82%",
  },
  commentHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  commentsList: {
    maxHeight: 320,
    marginBottom: 12,
  },
  commentItem: {
    flexDirection: "row",
    marginBottom: 12,
    backgroundColor: "#F9FAFB",
    padding: 12,
    borderRadius: 14,
  },
  commentAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 10,
    backgroundColor: "#E5E7EB",
  },
  commentContent: {
    flex: 1,
  },
  commentName: {
    fontSize: 13,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 4,
  },
  commentBody: {
    fontSize: 13,
    color: "#4B5563",
    lineHeight: 19,
  },
  emptyCommentText: {
    textAlign: "center",
    color: "#777",
    marginVertical: 24,
  },
  modalInput: {
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 14,
    minHeight: 110,
    paddingHorizontal: 14,
    paddingTop: 14,
    color: "#111827",
    marginBottom: 12,
    textAlignVertical: "top",
  },
  primaryModalBtn: {
    backgroundColor: "#7C3AED",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 10,
  },
  primaryModalBtnText: {
    color: "#fff",
    fontWeight: "800",
  },
  secondaryModalBtn: {
    backgroundColor: "#F3F4F6",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  secondaryModalBtnText: {
    color: "#333",
    fontWeight: "700",
  },
});
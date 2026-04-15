import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TextInput,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
  Modal,
  ActivityIndicator,
  Share,
  Linking,
  StatusBar,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { useRouter } from "expo-router";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  increment,
  where,
} from "firebase/firestore";
import { auth, db } from "../../config/firebase";

const categories = [
  "All",
  "Digital Art",
  "Illustration",
  "Photography",
  "Painting",
  "3D Art",
  "Animation",
  "Fantasy",
  "Character Design",
];

const DEFAULT_AVATAR = "https://via.placeholder.com/300";
const DEFAULT_IMAGE = "https://via.placeholder.com/800x800.png?text=Artwork";

const REPORT_REASONS = [
  "I don't like it",
  "Violence",
  "Sexual content",
  "Harassment or bullying",
  "Hate speech",
  "False information",
  "Spam",
  "Scam or fraud",
  "Copyright issue",
  "Other",
];

export default function HomeScreen() {
  const router = useRouter();

  const [currentUser, setCurrentUser] = useState(auth.currentUser);

  const [posts, setPosts] = useState([]);
  const [filteredPosts, setFilteredPosts] = useState([]);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);

  const [profile, setProfile] = useState({
    name: "Artist",
    avatar: DEFAULT_AVATAR,
  });

  const [loading, setLoading] = useState(true);
  const [commentLoading, setCommentLoading] = useState(false);
  const [sendingComment, setSendingComment] = useState(false);
  const [sendingDm, setSendingDm] = useState(false);
  const [menuLoading, setMenuLoading] = useState(false);

  const [commentModalVisible, setCommentModalVisible] = useState(false);
  const [dmModalVisible, setDmModalVisible] = useState(false);
  const [postMenuVisible, setPostMenuVisible] = useState(false);
  const [reportModalVisible, setReportModalVisible] = useState(false);

  const [selectedPost, setSelectedPost] = useState(null);
  const [menuPost, setMenuPost] = useState(null);
  const [commentText, setCommentText] = useState("");
  const [messageText, setMessageText] = useState("");
  const [comments, setComments] = useState([]);
  const [reportReason, setReportReason] = useState("");
  const [reportOtherText, setReportOtherText] = useState("");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user || null);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!currentUser) {
      setUnreadNotificationCount(0);
      return;
    }

    const notificationsQuery = query(
      collection(db, "notifications"),
      where("userId", "==", currentUser.uid),
      where("read", "==", false)
    );

    const unsubscribe = onSnapshot(
      notificationsQuery,
      (snapshot) => {
        setUnreadNotificationCount(snapshot.size || 0);
      },
      (error) => {
        console.log("NOTIFICATION COUNT ERROR:", error);
        setUnreadNotificationCount(0);
      }
    );

    return () => unsubscribe();
  }, [currentUser]);

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
        console.log("PROFILE ERROR:", error);
      }
    };

    loadProfile();
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) {
      setPosts([]);
      setFilteredPosts([]);
      setLoading(false);
      return;
    }

    const postsQuery = query(collection(db, "posts"));

    const unsubscribe = onSnapshot(
      postsQuery,
      async (snapshot) => {
        try {
          const followingSnap = await getDocs(
            collection(db, "users", currentUser.uid, "following")
          );

          const followingIds = new Set(
            followingSnap.docs
              .map((item) => item.id || item.data()?.userId)
              .filter(Boolean)
          );

          const allPosts = await Promise.all(
            snapshot.docs.map(async (item) => {
              const data = item.data();

              let likedByMe = false;
              let savedByMe = false;
              let followingOwner = false;
              let ownerName = data.userName || "Artist";
              let ownerAvatar = data.userAvatar || DEFAULT_AVATAR;

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
                  console.log("OWNER ERROR:", error);
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

                  const [likeSnap, saveSnap] = await Promise.all([
                    getDoc(likeRef),
                    getDoc(saveRef),
                  ]);

                  likedByMe = likeSnap.exists();
                  savedByMe = saveSnap.exists();
                  followingOwner = !!data.userId && followingIds.has(data.userId);
                } catch (error) {
                  console.log("POST RELATION ERROR:", error);
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

          const followedPosts = allPosts
            .filter(
              (item) =>
                item.userId &&
                item.userId !== currentUser.uid &&
                item.followingOwner === true
            )
            .sort((a, b) => getMillis(b.createdAt) - getMillis(a.createdAt));

          setPosts(followedPosts);
          setLoading(false);
        } catch (error) {
          console.log("POSTS ERROR:", error);
          setLoading(false);
        }
      },
      (error) => {
        console.log("SNAPSHOT ERROR:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [currentUser]);

  useEffect(() => {
    let result = [...posts];

    if (selectedCategory !== "All") {
      result = result.filter((item) => item.category === selectedCategory);
    }

    if (search.trim()) {
      const term = search.toLowerCase();
      result = result.filter((item) => {
        const titleMatch = item.title?.toLowerCase().includes(term);
        const descMatch = item.description?.toLowerCase().includes(term);
        const storyMatch = item.story?.toLowerCase().includes(term);
        const toolsMatch = item.materials?.toLowerCase().includes(term);
        const artistMatch = item.ownerName?.toLowerCase().includes(term);
        const tagsMatch = Array.isArray(item.tags)
          ? item.tags.join(" ").toLowerCase().includes(term)
          : false;

        return (
          titleMatch ||
          descMatch ||
          storyMatch ||
          toolsMatch ||
          artistMatch ||
          tagsMatch
        );
      });
    }

    result.sort((a, b) => getMillis(b.createdAt) - getMillis(a.createdAt));
    setFilteredPosts(result);
  }, [posts, selectedCategory, search]);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.replace("/auth/login");
    } catch (error) {
      Alert.alert("Error", error.message);
    }
  };

  const goToNotifications = () => {
    router.push("/users/notifications");
  };

  const updatePostState = (postId, updater) => {
    setPosts((prev) =>
      prev.map((item) => (item.id === postId ? { ...item, ...updater(item) } : item))
    );

    setFilteredPosts((prev) =>
      prev.map((item) => (item.id === postId ? { ...item, ...updater(item) } : item))
    );
  };

  const sendNotification = async ({
    userId,
    type,
    title,
    message,
    postId = "",
    extra = {},
  }) => {
    if (!userId) return;

    try {
      await addDoc(collection(db, "notifications"), {
        userId,
        senderId: currentUser?.uid || "",
        senderName: profile.name || "Artist",
        senderAvatar: profile.avatar || DEFAULT_AVATAR,
        type,
        title,
        message,
        postId,
        read: false,
        createdAt: serverTimestamp(),
        ...extra,
      });
    } catch (error) {
      console.log("NOTIFICATION ERROR:", error);
    }
  };

  const handleLike = async (post) => {
    if (!currentUser) {
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

        if (post.userId && post.userId !== currentUser.uid) {
          await sendNotification({
            userId: post.userId,
            type: "like",
            title: "New Like",
            message: `${profile.name} liked your post "${post.title || "Untitled"}".`,
            postId: post.id,
          });
        }
      }
    } catch (error) {
      console.log("LIKE ERROR:", error);
      Alert.alert("Error", "Could not update like.");
    }
  };

  const handleSave = async (post) => {
    if (!currentUser) {
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
      console.log("SAVE ERROR:", error);
      Alert.alert("Error", "Could not update save.");
    }
  };

  const handleFollow = async (post) => {
    if (!currentUser) {
      Alert.alert("Login required", "Please log in first.");
      return;
    }

    if (!post.userId) {
      Alert.alert("Error", "Artist information is missing.");
      return;
    }

    if (post.userId === currentUser.uid) {
      Alert.alert("Info", "You cannot follow yourself.");
      return;
    }

    try {
      const followerRef = doc(db, "users", post.userId, "followers", currentUser.uid);
      const followingRef = doc(db, "users", currentUser.uid, "following", post.userId);

      const followerSnap = await getDoc(followerRef);

      if (followerSnap.exists()) {
        await deleteDoc(followerRef);
        await deleteDoc(followingRef);

        setPosts((prev) => prev.filter((item) => item.id !== post.id));
        setFilteredPosts((prev) => prev.filter((item) => item.id !== post.id));
      } else {
        await setDoc(followerRef, {
          followerId: currentUser.uid,
          followerName: profile.name,
          followerAvatar: profile.avatar,
          createdAt: serverTimestamp(),
        });

        await setDoc(followingRef, {
          userId: post.userId,
          userName: post.ownerName,
          userAvatar: post.ownerAvatar,
          createdAt: serverTimestamp(),
        });

        updatePostState(post.id, () => ({
          followingOwner: true,
        }));

        await sendNotification({
          userId: post.userId,
          type: "follow",
          title: "New Follower",
          message: `${profile.name} started following you.`,
          postId: post.id,
        });
      }
    } catch (error) {
      console.log("FOLLOW ERROR:", error);
      Alert.alert("Error", "Could not update follow.");
    }
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
      console.log("COMMENTS ERROR:", error);
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

      if (selectedPost.userId && selectedPost.userId !== currentUser.uid) {
        await sendNotification({
          userId: selectedPost.userId,
          type: "comment",
          title: "New Comment",
          message: `${profile.name} commented on your post "${selectedPost.title || "Untitled"}".`,
          postId: selectedPost.id,
        });
      }

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
      console.log("COMMENT ERROR:", error);
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
      console.log("SHARE ERROR:", error);
    }
  };

  const openDmModal = (post) => {
    setSelectedPost(post);
    setMessageText("");
    setDmModalVisible(true);
  };

  const sendDm = async () => {
    if (!currentUser || !selectedPost) return;

    if (!messageText.trim()) {
      Alert.alert("Missing message", "Please enter a message.");
      return;
    }

    if (!selectedPost.userId) {
      Alert.alert("Error", "This post has no owner.");
      return;
    }

    if (selectedPost.userId === currentUser.uid) {
      Alert.alert("Info", "You cannot message yourself.");
      return;
    }

    try {
      setSendingDm(true);

      const conversationId = [currentUser.uid, selectedPost.userId].sort().join("_");

      await addDoc(collection(db, "dms"), {
        conversationId,
        senderId: currentUser.uid,
        senderName: profile.name,
        senderAvatar: profile.avatar,
        receiverId: selectedPost.userId,
        receiverName: selectedPost.ownerName || "",
        receiverAvatar: selectedPost.ownerAvatar || "",
        postId: selectedPost.id,
        postTitle: selectedPost.title || "",
        text: messageText.trim(),
        read: false,
        createdAt: serverTimestamp(),
      });

      await sendNotification({
        userId: selectedPost.userId,
        type: "message",
        title: "New Message",
        message: `${profile.name} sent you a message about "${selectedPost.title || "your post"}".`,
        postId: selectedPost.id,
      });

      setDmModalVisible(false);
      setMessageText("");
      setSelectedPost(null);
      Alert.alert("Sent", "Message sent successfully.");
    } catch (error) {
      console.log("DM ERROR:", error);
      Alert.alert("Error", "Could not send message.");
    } finally {
      setSendingDm(false);
    }
  };

  const handleDownload = async (post) => {
    if (!post.allowDownloads) {
      Alert.alert("Download not allowed", "This artist has not allowed downloads.");
      return;
    }

    if (!post.imageUrl) {
      Alert.alert("Unavailable", "No image available to download.");
      return;
    }

    try {
      await Linking.openURL(post.imageUrl);
    } catch (error) {
      console.log("DOWNLOAD ERROR:", error);
      Alert.alert("Error", "Could not open the download link.");
    }
  };

  const openPostMenu = (post) => {
    setMenuPost(post);
    setPostMenuVisible(true);
  };

  const closePostMenu = () => {
    setMenuPost(null);
    setPostMenuVisible(false);
  };

  const openReportModal = () => {
    setPostMenuVisible(false);
    setReportReason("");
    setReportOtherText("");
    setReportModalVisible(true);
  };

  const submitReport = async () => {
    if (!currentUser || !menuPost) return;

    if (!reportReason) {
      Alert.alert("Select reason", "Please choose a report reason.");
      return;
    }

    if (reportReason === "Other" && !reportOtherText.trim()) {
      Alert.alert("Add details", "Please write the report reason.");
      return;
    }

    try {
      setMenuLoading(true);

      const reportPayload = {
        type: "post",
        postId: menuPost.id,
        postOwnerId: menuPost.userId || "",
        postOwnerName: menuPost.ownerName || "",
        reportedBy: currentUser.uid,
        reportedByName: profile.name,
        reason: reportReason,
        details: reportReason === "Other" ? reportOtherText.trim() : "",
        title: menuPost.title || "",
        imageUrl: menuPost.imageUrl || "",
        status: "pending",
        createdAt: serverTimestamp(),
      };

      console.log("SUBMITTING REPORT:", reportPayload);
      await addDoc(collection(db, "reports"), reportPayload);

      await sendNotification({
        userId: currentUser.uid,
        type: "report_submitted",
        title: "Report submitted",
        message: `Your report for "${menuPost.title || "this post"}" was sent successfully.`,
        postId: menuPost.id,
        extra: { reason: reportReason },
      });

      if (menuPost.userId && menuPost.userId !== currentUser.uid) {
        await sendNotification({
          userId: menuPost.userId,
          type: "post_reported",
          title: "Post reported",
          message: `Your post "${menuPost.title || "Untitled"}" has been reported and is under review.`,
          postId: menuPost.id,
          extra: { reason: reportReason },
        });
      }

      const adminQuery = query(collection(db, "users"), where("role", "==", "admin"));
      const adminSnap = await getDocs(adminQuery);

      for (const adminDoc of adminSnap.docs) {
        await sendNotification({
          userId: adminDoc.id,
          type: "new_report",
          title: "New post report",
          message: `${profile.name} reported "${menuPost.title || "a post"}" for ${reportReason}.`,
          postId: menuPost.id,
          extra: {
            reason: reportReason,
            reportedBy: currentUser.uid,
            postOwnerId: menuPost.userId || "",
          },
        });
      }

      setReportModalVisible(false);
      setMenuPost(null);
      setReportReason("");
      setReportOtherText("");
      Alert.alert("Reported", "The post has been reported successfully.");
    } catch (error) {
      console.log("REPORT ERROR:", error);
      Alert.alert("Error", "Could not submit report.");
    } finally {
      setMenuLoading(false);
    }
  };

  const handleDeletePost = async () => {
    if (!menuPost || !currentUser) return;

    Alert.alert("Delete post", "Are you sure you want to delete this post?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            setMenuLoading(true);
            await deleteDoc(doc(db, "posts", menuPost.id));
            setPosts((prev) => prev.filter((item) => item.id !== menuPost.id));
            setFilteredPosts((prev) => prev.filter((item) => item.id !== menuPost.id));
            setPostMenuVisible(false);
            setMenuPost(null);
            Alert.alert("Deleted", "Post deleted successfully.");
          } catch (error) {
            console.log("DELETE POST ERROR:", error);
            Alert.alert("Error", "Could not delete post.");
          } finally {
            setMenuLoading(false);
          }
        },
      },
    ]);
  };

  const explorePosts = () => {
    router.push("/users/explore");
  };

  const goToUpload = () => {
    router.push("/users/upload");
  };

  const categoryPreview = useMemo(() => categories.slice(0, 5), []);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.header}>
          <View style={styles.headerTextWrap}>
            <Text style={styles.logo}>ArtLinker</Text>
            <Text style={styles.subtitle}>A premium home for digital creators</Text>
          </View>

          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.iconBtn} onPress={goToNotifications}>
              <Ionicons name="notifications-outline" size={22} color="#fff" />
              {unreadNotificationCount > 0 ? (
                <View style={styles.notificationBadge}>
                  <Text style={styles.notificationBadgeText}>
                    {unreadNotificationCount > 99 ? "99+" : unreadNotificationCount}
                  </Text>
                </View>
              ) : null}
            </TouchableOpacity>

            <TouchableOpacity style={styles.iconBtn} onPress={handleLogout}>
              <Ionicons name="log-out-outline" size={22} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color="#8D91A6" />
          <TextInput
            placeholder="Search artworks, artists, tags"
            placeholderTextColor="#8D91A6"
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
          />
        </View>

        <View style={styles.hero}>
          <Text style={styles.heroBadge}>Following Feed</Text>
          <Text style={styles.heroTitle}>Posts from artists you follow</Text>
          <Text style={styles.heroText}>
            The newest posts always appear first. Follow more artists to grow your feed.
          </Text>

          <View style={styles.heroButtons}>
            <TouchableOpacity style={styles.exploreBtn} onPress={explorePosts}>
              <Text style={styles.exploreText}>Explore</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.uploadBtn} onPress={goToUpload}>
              <Text style={styles.uploadText}>Upload Art</Text>
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryRow}
        >
          {categoryPreview.map((item) => {
            const active = selectedCategory === item;

            return (
              <TouchableOpacity
                key={item}
                style={active ? styles.activeCategory : styles.category}
                onPress={() => setSelectedCategory(item)}
              >
                <Text style={active ? styles.activeCategoryText : styles.categoryText}>
                  {item}
                </Text>
              </TouchableOpacity>
            );
          })}

          <TouchableOpacity
            style={styles.category}
            onPress={() => setShowCategoryModal(true)}
          >
            <Text style={styles.categoryText}>More</Text>
          </TouchableOpacity>
        </ScrollView>

        {loading ? (
          <View style={styles.loaderWrap}>
            <ActivityIndicator size="large" color="#7C3AED" />
            <Text style={styles.loaderText}>Loading posts...</Text>
          </View>
        ) : filteredPosts.length === 0 ? (
          <View style={styles.emptyBox}>
            <Ionicons name="images-outline" size={34} color="#7C3AED" />
            <Text style={styles.emptyTitle}>No posts found</Text>
            <Text style={styles.emptyText}>
              Follow some artists first, then their new posts will appear here.
            </Text>
          </View>
        ) : (
          <View style={styles.listWrap}>
            {filteredPosts.map((item) => (
              <View key={item.id} style={styles.card}>
                <View style={styles.postTopRow}>
                  <View style={styles.ownerLeft}>
                    <Image
                      source={{ uri: item.ownerAvatar || DEFAULT_AVATAR }}
                      style={styles.ownerAvatar}
                    />
                    <View style={styles.ownerInfo}>
                      <Text style={styles.ownerName}>{item.ownerName}</Text>
                      <Text style={styles.ownerSub}>
                        {formatDate(item.createdAt)}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.ownerRight}>
                    {item.userId && item.userId !== currentUser?.uid ? (
                      <TouchableOpacity
                        style={
                          item.followingOwner
                            ? styles.followingButton
                            : styles.followButton
                        }
                        onPress={() => handleFollow(item)}
                      >
                        <Ionicons
                          name={item.followingOwner ? "checkmark-circle" : "person-add"}
                          size={15}
                          color={item.followingOwner ? "#2F2A5A" : "#fff"}
                        />
                        <Text
                          style={
                            item.followingOwner
                              ? styles.followingButtonText
                              : styles.followButtonText
                          }
                        >
                          {item.followingOwner ? "Following" : "Follow"}
                        </Text>
                      </TouchableOpacity>
                    ) : null}

                    <TouchableOpacity
                      style={styles.moreButton}
                      onPress={() => openPostMenu(item)}
                    >
                      <Ionicons name="ellipsis-horizontal" size={20} color="#374151" />
                    </TouchableOpacity>
                  </View>
                </View>

                {!!item.title && <Text style={styles.title}>{item.title}</Text>}

                {!!item.description && (
                  <Text style={styles.captionText}>{item.description}</Text>
                )}

                <View style={styles.imageShell}>
                  <Image
                    source={{ uri: item.imageUrl || DEFAULT_IMAGE }}
                    style={styles.image}
                    resizeMode="contain"
                  />
                </View>

                <View style={styles.quickInfoRow}>
                  {!!item.category && (
                    <View style={styles.badgePill}>
                      <Text style={styles.badgeText}>{item.category}</Text>
                    </View>
                  )}

                  {!!item.yearCreated && (
                    <View style={styles.badgePillMuted}>
                      <Text style={styles.badgeMutedText}>{item.yearCreated}</Text>
                    </View>
                  )}
                </View>

                {Array.isArray(item.tags) && item.tags.length > 0 && (
                  <View style={styles.tagsWrap}>
                    {item.tags.map((tag, index) => (
                      <View key={`${item.id}-tag-${index}`} style={styles.tagChip}>
                        <Text style={styles.tagText}>#{tag}</Text>
                      </View>
                    ))}
                  </View>
                )}

                {(item.materials || item.story) && (
                  <View style={styles.detailsBox}>
                    {!!item.materials && (
                      <>
                        <Text style={styles.label}>Tools / Materials</Text>
                        <Text style={styles.valueText}>{item.materials}</Text>
                      </>
                    )}

                    {!!item.story && (
                      <>
                        <Text style={styles.label}>Artist Story</Text>
                        <Text style={styles.valueText}>{item.story}</Text>
                      </>
                    )}
                  </View>
                )}

                <View style={styles.metaRow}>
                  <TouchableOpacity
                    style={styles.metaItem}
                    onPress={() => handleLike(item)}
                  >
                    <Ionicons
                      name={item.likedByMe ? "heart" : "heart-outline"}
                      size={22}
                      color={item.likedByMe ? "#FF4D6D" : "#6B7280"}
                    />
                    <Text style={styles.metaText}>{item.likesCount}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.metaItem}
                    onPress={() => openCommentModal(item)}
                  >
                    <Ionicons name="chatbubble-outline" size={21} color="#6B7280" />
                    <Text style={styles.metaText}>{item.commentsCount}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.metaItem}
                    onPress={() => handleShare(item)}
                  >
                    <Ionicons name="share-social-outline" size={21} color="#6B7280" />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.metaItem}
                    onPress={() => handleSave(item)}
                  >
                    <Ionicons
                      name={item.savedByMe ? "bookmark" : "bookmark-outline"}
                      size={21}
                      color={item.savedByMe ? "#7C3AED" : "#6B7280"}
                    />
                  </TouchableOpacity>
                </View>

                <View style={styles.actionRow}>
                  <TouchableOpacity
                    style={styles.dmButton}
                    onPress={() => openDmModal(item)}
                  >
                    <Ionicons name="paper-plane-outline" size={16} color="#fff" />
                    <Text style={styles.dmButtonText}>Send DM</Text>
                  </TouchableOpacity>

                  {item.allowDownloads === true && (
                    <TouchableOpacity
                      style={styles.downloadButton}
                      onPress={() => handleDownload(item)}
                    >
                      <Ionicons name="download-outline" size={16} color="#1F2937" />
                      <Text style={styles.downloadButtonText}>Download</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <Modal visible={showCategoryModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.categoryModal}>
            <Text style={styles.categoryModalTitle}>Select Category</Text>

            <ScrollView>
              {categories.map((item) => (
                <TouchableOpacity
                  key={item}
                  style={styles.categoryModalItem}
                  onPress={() => {
                    setSelectedCategory(item);
                    setShowCategoryModal(false);
                  }}
                >
                  <Text style={styles.categoryModalText}>{item}</Text>
                  {selectedCategory === item ? (
                    <Ionicons name="checkmark" size={18} color="#7C3AED" />
                  ) : null}
                </TouchableOpacity>
              ))}
            </ScrollView>

            <TouchableOpacity
              style={styles.closeModalButton}
              onPress={() => setShowCategoryModal(false)}
            >
              <Text style={styles.closeModalButtonText}>Close</Text>
            </TouchableOpacity>
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
                      source={{ uri: item.userAvatar || DEFAULT_AVATAR }}
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

      <Modal visible={dmModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.actionModal}>
            <Text style={styles.modalTitle}>Send Message</Text>

            <TextInput
              style={styles.modalInput}
              placeholder="Write your message"
              value={messageText}
              onChangeText={setMessageText}
              multiline
            />

            <TouchableOpacity
              style={styles.primaryModalBtn}
              onPress={sendDm}
              disabled={sendingDm}
            >
              {sendingDm ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.primaryModalBtnText}>Send Message</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryModalBtn}
              onPress={() => setDmModalVisible(false)}
            >
              <Text style={styles.secondaryModalBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={postMenuVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.menuModal}>
            <View style={styles.menuHeader}>
              <Text style={styles.modalTitle}>Post options</Text>
              <TouchableOpacity onPress={closePostMenu}>
                <Ionicons name="close" size={22} color="#111827" />
              </TouchableOpacity>
            </View>

            {menuPost && menuPost.userId === currentUser?.uid ? (
              <TouchableOpacity
                style={styles.menuItem}
                onPress={handleDeletePost}
                disabled={menuLoading}
              >
                <Ionicons name="trash-outline" size={22} color="#DC2626" />
                <Text style={styles.deleteMenuText}>Delete post</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.menuItem}
                onPress={openReportModal}
                disabled={menuLoading}
              >
                <Ionicons name="flag-outline" size={22} color="#7C3AED" />
                <Text style={styles.menuText}>Report post</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.secondaryModalBtn}
              onPress={closePostMenu}
            >
              <Text style={styles.secondaryModalBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={reportModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.reportModal}>
            <View style={styles.menuHeader}>
              <Text style={styles.modalTitle}>Report post</Text>
              <TouchableOpacity
                onPress={() => {
                  setReportModalVisible(false);
                  setReportReason("");
                  setReportOtherText("");
                }}
              >
                <Ionicons name="close" size={22} color="#111827" />
              </TouchableOpacity>
            </View>

            {menuPost ? (
              <View style={styles.reportPreview}>
                <Image
                  source={{ uri: menuPost.imageUrl || DEFAULT_IMAGE }}
                  style={styles.reportPreviewImage}
                  resizeMode="cover"
                />
                <View style={styles.reportPreviewTextWrap}>
                  <Text style={styles.reportPreviewTitle}>
                    {menuPost.title || "Untitled"}
                  </Text>
                  <Text style={styles.reportPreviewOwner}>
                    by {menuPost.ownerName || "Artist"}
                  </Text>
                </View>
              </View>
            ) : null}

            <ScrollView showsVerticalScrollIndicator={false} style={styles.reportList}>
              {REPORT_REASONS.map((reason) => {
                const active = reportReason === reason;

                return (
                  <TouchableOpacity
                    key={reason}
                    style={[
                      styles.reportReasonItem,
                      active && styles.reportReasonItemActive,
                    ]}
                    onPress={() => setReportReason(reason)}
                  >
                    <Text
                      style={[
                        styles.reportReasonText,
                        active && styles.reportReasonTextActive,
                      ]}
                    >
                      {reason}
                    </Text>

                    {active ? (
                      <Ionicons name="checkmark-circle" size={20} color="#7C3AED" />
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {reportReason === "Other" ? (
              <TextInput
                style={styles.modalInput}
                placeholder="Write your reason"
                value={reportOtherText}
                onChangeText={setReportOtherText}
                multiline
              />
            ) : null}

            <TouchableOpacity
              style={styles.primaryModalBtn}
              onPress={submitReport}
              disabled={menuLoading}
            >
              {menuLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.primaryModalBtnText}>Submit Report</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryModalBtn}
              onPress={() => {
                setReportModalVisible(false);
                setReportReason("");
                setReportOtherText("");
              }}
            >
              <Text style={styles.secondaryModalBtnText}>Cancel</Text>
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

function formatDate(value) {
  const ms = getMillis(value);
  if (!ms) return "Recent post";

  const date = new Date(ms);
  return date.toLocaleDateString();
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F7FB",
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 28,
  },
  header: {
    backgroundColor: "#14112B",
    borderRadius: 28,
    padding: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
    shadowColor: "#000",
    shadowOpacity: 0.14,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  headerTextWrap: {
    flex: 1,
    paddingRight: 12,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  logo: {
    fontSize: 28,
    fontWeight: "800",
    color: "#D8B4FE",
  },
  subtitle: {
    color: "#C7C9D9",
    marginTop: 6,
    fontSize: 13,
  },
  iconBtn: {
    backgroundColor: "rgba(255,255,255,0.14)",
    padding: 11,
    borderRadius: 14,
    position: "relative",
  },
  notificationBadge: {
    position: "absolute",
    top: -6,
    right: -6,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#EF4444",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 5,
    borderWidth: 2,
    borderColor: "#14112B",
  },
  notificationBadgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "800",
  },
  searchBox: {
    backgroundColor: "#fff",
    borderRadius: 18,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "#E8EAF2",
    marginBottom: 18,
    height: 52,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    color: "#111827",
    fontSize: 14,
  },
  hero: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 22,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: "#EBECF4",
  },
  heroBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#F3E8FF",
    color: "#7C3AED",
    fontWeight: "700",
    fontSize: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    marginBottom: 12,
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: "800",
    color: "#121826",
  },
  heroText: {
    color: "#6B7280",
    marginTop: 8,
    lineHeight: 22,
  },
  heroButtons: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
  },
  exploreBtn: {
    backgroundColor: "#111827",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 14,
  },
  exploreText: {
    color: "#fff",
    fontWeight: "700",
  },
  uploadBtn: {
    backgroundColor: "#E9D5FF",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 14,
  },
  uploadText: {
    color: "#6D28D9",
    fontWeight: "700",
  },
  categoryRow: {
    gap: 10,
    marginBottom: 18,
    paddingRight: 8,
  },
  activeCategory: {
    backgroundColor: "#7C3AED",
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
  },
  activeCategoryText: {
    color: "#fff",
    fontWeight: "700",
  },
  category: {
    backgroundColor: "#fff",
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  categoryText: {
    color: "#374151",
    fontWeight: "600",
  },
  loaderWrap: {
    paddingVertical: 50,
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
  listWrap: {
    paddingBottom: 8,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 26,
    padding: 16,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: "#E9ECF4",
    shadowColor: "#0F172A",
    shadowOpacity: 0.07,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  postTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  ownerLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    paddingRight: 10,
  },
  ownerInfo: {
    flex: 1,
  },
  ownerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  ownerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: 10,
    backgroundColor: "#E5E7EB",
  },
  ownerName: {
    fontSize: 15,
    fontWeight: "800",
    color: "#111827",
  },
  ownerSub: {
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
  moreButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontWeight: "800",
    fontSize: 22,
    color: "#111827",
    marginBottom: 6,
  },
  captionText: {
    fontSize: 14,
    lineHeight: 22,
    color: "#4B5563",
    marginBottom: 14,
  },
  imageShell: {
    width: "100%",
    height: 340,
    borderRadius: 22,
    marginBottom: 14,
    backgroundColor: "#F6F7FB",
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#EEF1F6",
  },
  image: {
    width: "100%",
    height: "100%",
    backgroundColor: "#F6F7FB",
  },
  quickInfoRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 10,
  },
  badgePill: {
    backgroundColor: "#F4F0FF",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
  },
  badgeText: {
    color: "#6C2CF6",
    fontSize: 12,
    fontWeight: "700",
  },
  badgePillMuted: {
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
  },
  badgeMutedText: {
    color: "#374151",
    fontSize: 12,
    fontWeight: "700",
  },
  tagsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },
  tagChip: {
    backgroundColor: "#F3F4F6",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  tagText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#374151",
  },
  detailsBox: {
    backgroundColor: "#FAFBFD",
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: "#EDF0F5",
    marginBottom: 14,
  },
  label: {
    fontSize: 12,
    fontWeight: "800",
    color: "#374151",
    marginTop: 4,
    marginBottom: 5,
  },
  valueText: {
    fontSize: 14,
    lineHeight: 21,
    color: "#4B5563",
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 2,
    alignItems: "center",
    backgroundColor: "#F9FAFB",
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 10,
    marginBottom: 12,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
  },
  metaText: {
    fontSize: 12,
    color: "#4B5563",
    fontWeight: "700",
  },
  actionRow: {
    flexDirection: "row",
    gap: 10,
  },
  dmButton: {
    flex: 1,
    backgroundColor: "#111827",
    borderRadius: 16,
    paddingVertical: 14,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  dmButtonText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 14,
  },
  downloadButton: {
    minWidth: 120,
    backgroundColor: "#EAF2FF",
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 14,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  downloadButtonText: {
    color: "#1F2937",
    fontWeight: "800",
    fontSize: 14,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.45)",
    justifyContent: "center",
    padding: 20,
  },
  categoryModal: {
    backgroundColor: "#fff",
    borderRadius: 20,
    maxHeight: 430,
    overflow: "hidden",
  },
  categoryModalTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#111827",
    padding: 18,
    borderBottomWidth: 1,
    borderBottomColor: "#EEE",
  },
  categoryModalItem: {
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#EEE",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  categoryModalText: {
    fontSize: 15,
    color: "#333",
    fontWeight: "600",
  },
  closeModalButton: {
    padding: 16,
    alignItems: "center",
  },
  closeModalButtonText: {
    color: "#6C2CF6",
    fontWeight: "800",
  },
  actionModal: {
    backgroundColor: "#fff",
    borderRadius: 22,
    padding: 18,
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
  modalTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 12,
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
  menuModal: {
    backgroundColor: "#fff",
    borderRadius: 22,
    padding: 18,
  },
  menuHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#F9FAFB",
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  menuText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
  },
  deleteMenuText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#DC2626",
  },
  reportModal: {
    backgroundColor: "#fff",
    borderRadius: 22,
    padding: 18,
    maxHeight: "86%",
  },
  reportPreview: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderRadius: 16,
    padding: 10,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#E8ECF3",
  },
  reportPreviewImage: {
    width: 58,
    height: 58,
    borderRadius: 12,
    marginRight: 10,
    backgroundColor: "#E5E7EB",
  },
  reportPreviewTextWrap: {
    flex: 1,
  },
  reportPreviewTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#111827",
  },
  reportPreviewOwner: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 4,
  },
  reportList: {
    maxHeight: 320,
    marginBottom: 12,
  },
  reportReasonItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: "#F9FAFB",
    marginBottom: 10,
  },
  reportReasonItemActive: {
    backgroundColor: "#F4F0FF",
    borderWidth: 1,
    borderColor: "#D8B4FE",
  },
  reportReasonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
  },
  reportReasonTextActive: {
    color: "#6D28D9",
    fontWeight: "800",
  },
});
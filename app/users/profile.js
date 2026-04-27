import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  ScrollView,
  Modal,
  TextInput,
  FlatList,
  Alert,
  ActivityIndicator,
} from "react-native";
import { Ionicons, Feather, MaterialIcons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import { useRouter } from "expo-router";
import {
  doc,
  setDoc,
  onSnapshot,
  collection,
  query,
  where,
  serverTimestamp,
  addDoc,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { auth, db, storage } from "../../config/firebase";

const DEFAULT_AVATAR = "https://via.placeholder.com/300";

const EMPTY_EDIT_FORM = {
  name: "",
  username: "",
  bio: "",
  location: "",
  address: "",
  email: "",
  joined: "",
  avatar: DEFAULT_AVATAR,
};

const EMPTY_POST_MODAL = {
  visible: false,
  item: null,
};

function normaliseUsername(value) {
  return String(value || "")
    .trim()
    .replace(/^@+/, "")
    .replace(/\s+/g, "_")
    .toLowerCase();
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function getDisplayImage(item) {
  return (
    item?.imageUrl ||
    item?.image ||
    item?.postImage ||
    item?.artworkUrl ||
    item?.completedImageUrl ||
    item?.deliveryImageUrl ||
    item?.resultImageUrl ||
    DEFAULT_AVATAR
  );
}

export default function ProfileScreen() {
  const router = useRouter();
  const user = auth.currentUser;

  const [activeTab, setActiveTab] = useState("Portfolio");
  const [editVisible, setEditVisible] = useState(false);
  const [collectionVisible, setCollectionVisible] = useState(false);
  const [postPreview, setPostPreview] = useState(EMPTY_POST_MODAL);

  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [creatingCollection, setCreatingCollection] = useState(false);

  const [profile, setProfile] = useState({
    name: "",
    username: "",
    bio: "",
    location: "",
    address: "",
    email: "",
    joined: "",
    avatar: DEFAULT_AVATAR,
  });

  const [darkMode, setDarkMode] = useState(false);

  const [stats, setStats] = useState({
    followers: 0,
    following: 0,
    portfolio: 0,
    collections: 0,
    requests: 0,
  });

  const [editForm, setEditForm] = useState(EMPTY_EDIT_FORM);
  const [addressSuggestions, setAddressSuggestions] = useState([]);
  const [addressLoading, setAddressLoading] = useState(false);
  const [showAddressSuggestions, setShowAddressSuggestions] = useState(false);

  const [userPosts, setUserPosts] = useState([]);
  const [likedPosts, setLikedPosts] = useState([]);
  const [savedPosts, setSavedPosts] = useState([]);
  const [collectionsData, setCollectionsData] = useState([]);
  const [requestedArtworks, setRequestedArtworks] = useState([]);

  const [newCollectionName, setNewCollectionName] = useState("");
  const [selectedItems, setSelectedItems] = useState([]);

  const tabs = ["Portfolio", "Collections", "Liked", "Requests"];

  useEffect(() => {
    if (!user?.uid) {
      setLoading(false);
      return undefined;
    }

    setLoading(true);

    const userRef = doc(db, "users", user.uid);

    const unsubscribeUser = onSnapshot(
      userRef,
      async (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          const cleanUsername = normaliseUsername(data.username || "artist");

          setDarkMode(Boolean(data.darkMode || data.settings?.darkMode));

          const profileData = {
            name: data.name || data.displayName || user.displayName || "Artist",
            username: `@${cleanUsername || "artist"}`,
            bio: data.bio || "",
            location: data.location || "",
            address:
              data.address ||
              data.deliveryAddress ||
              data.fullAddress ||
              data.businessAddress ||
              data.locationAddress ||
              "",
            email: data.email || user.email || "",
            joined: formatJoinedDate(data.createdAt),
            avatar: data.avatar || data.photoURL || DEFAULT_AVATAR,
          };

          setProfile(profileData);
          setEditForm(profileData);
        } else {
          const fallbackProfile = {
            name: user.displayName || "Artist",
            username: "@artist",
            bio: "",
            location: "",
            address: "",
            email: user.email || "",
            joined: "Joined recently",
            avatar: DEFAULT_AVATAR,
          };

          await setDoc(
            userRef,
            {
              uid: user.uid,
              name: user.displayName || "Artist",
              email: user.email || "",
              username: "artist",
              bio: "",
              location: "",
              address: "",
              deliveryAddress: "",
              avatar: "",
              role: "user",
              darkMode: false,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );

          setProfile(fallbackProfile);
          setEditForm(fallbackProfile);
        }

        setLoading(false);
      },
      (error) => {
        console.log("User profile error:", error);
        setLoading(false);
      }
    );

    const unsubscribePosts = onSnapshot(
      query(collection(db, "posts"), where("userId", "==", user.uid)),
      (snapshot) => {
        const mappedPosts = snapshot.docs
          .map((item) => ({ id: item.id, ...item.data() }))
          .sort((a, b) => getMillis(b.createdAt) - getMillis(a.createdAt))
          .map((item) => ({
            id: item.id,
            postId: item.id,
            image: getDisplayImage(item),
            title: item.title || item.caption || "Untitled Post",
            subtitle: item.category || item.visibility || "Artwork",
            description:
              item.description || item.story || item.caption || "No description",
            category: item.category || "",
            tags: Array.isArray(item.tags) ? item.tags : [],
            materials: item.materials || "",
            story: item.story || "",
            visibility: item.visibility || "",
            allowComments: item.allowComments !== false,
            allowDownloads: item.allowDownloads === true,
            likesCount: item.likesCount || 0,
            commentsCount: item.commentsCount || 0,
            savesCount: item.savesCount || 0,
            createdAt: item.createdAt || null,
            ownerName: item.ownerName || item.userName || "Artist",
          }));

        setUserPosts(mappedPosts);
        setStats((prev) => ({ ...prev, portfolio: mappedPosts.length }));
      },
      (error) => console.log("Posts error:", error)
    );

    const unsubscribeLiked = onSnapshot(
      query(collection(db, "users", user.uid, "likedPosts")),
      (snapshot) => {
        const mapped = snapshot.docs
          .map((item) => ({ id: item.id, ...item.data() }))
          .sort((a, b) => getMillis(b.createdAt) - getMillis(a.createdAt))
          .map((item) => ({
            id: item.id,
            postId: item.postId || item.id || "",
            image: getDisplayImage(item),
            title: item.title || item.caption || "Liked post",
            subtitle: "Liked",
            description:
              item.description || item.story || item.caption || "No description",
            category: item.category || "",
            tags: Array.isArray(item.tags) ? item.tags : [],
            materials: item.materials || "",
            story: item.story || "",
            visibility: item.visibility || "",
            allowComments: item.allowComments !== false,
            allowDownloads: item.allowDownloads === true,
            likesCount: item.likesCount || 0,
            commentsCount: item.commentsCount || 0,
            savesCount: item.savesCount || 0,
            createdAt: item.createdAt || null,
            ownerName: item.ownerName || item.userName || "Artist",
          }));

        setLikedPosts(mapped);
      },
      (error) => console.log("Liked posts error:", error)
    );

    const unsubscribeSaved = onSnapshot(
      query(collection(db, "users", user.uid, "savedPosts")),
      (snapshot) => {
        const mapped = snapshot.docs
          .map((item) => ({ id: item.id, ...item.data() }))
          .sort((a, b) => getMillis(b.createdAt) - getMillis(a.createdAt))
          .map((item) => ({
            id: item.id,
            postId: item.postId || item.id || "",
            image: getDisplayImage(item),
            title: item.title || item.caption || "Saved post",
            subtitle: "Saved",
            description:
              item.description || item.story || item.caption || "No description",
            category: item.category || "",
            tags: Array.isArray(item.tags) ? item.tags : [],
            materials: item.materials || "",
            story: item.story || "",
            visibility: item.visibility || "",
            allowComments: item.allowComments !== false,
            allowDownloads: item.allowDownloads === true,
            likesCount: item.likesCount || 0,
            commentsCount: item.commentsCount || 0,
            savesCount: item.savesCount || 0,
            createdAt: item.createdAt || null,
            ownerName: item.ownerName || item.userName || "Artist",
          }));

        setSavedPosts(mapped);
      },
      (error) => console.log("Saved posts error:", error)
    );

    const unsubscribeCollections = onSnapshot(
      query(collection(db, "users", user.uid, "collections")),
      (snapshot) => {
        const list = snapshot.docs
          .map((item) => ({ id: item.id, ...item.data() }))
          .sort((a, b) => getMillis(b.createdAt) - getMillis(a.createdAt));

        setCollectionsData(list);
        setStats((prev) => ({ ...prev, collections: list.length }));
      },
      (error) => console.log("Collections error:", error)
    );

    const unsubscribeFollowers = onSnapshot(
      query(collection(db, "users", user.uid, "followers")),
      (snapshot) => setStats((prev) => ({ ...prev, followers: snapshot.size })),
      (error) => console.log("Followers error:", error)
    );

    const unsubscribeFollowing = onSnapshot(
      query(collection(db, "users", user.uid, "following")),
      (snapshot) => setStats((prev) => ({ ...prev, following: snapshot.size })),
      (error) => console.log("Following error:", error)
    );

    const unsubscribeRequests = onSnapshot(
      query(
        collection(db, "jobs"),
        where("clientId", "==", user.uid),
        where("status", "==", "completed")
      ),
      (snapshot) => {
        const mapped = snapshot.docs
          .map((item) => ({ id: item.id, ...item.data() }))
          .sort((a, b) => getMillis(b.createdAt) - getMillis(a.createdAt))
          .map((item) => ({
            id: item.id,
            title: item.title || item.service || item.skill || "Completed Request",
            subtitle:
              item.providerName ||
              item.skill ||
              item.category ||
              "Completed service",
            budget: item.budget || "",
            status: item.status || "completed",
            description: item.description || "",
            image: getDisplayImage(item),
            downloadUrl:
              item.completedImageUrl ||
              item.deliveryImageUrl ||
              item.resultImageUrl ||
              item.imageUrl ||
              item.image ||
              item.postImage ||
              "",
          }));

        setRequestedArtworks(mapped);
        setStats((prev) => ({ ...prev, requests: mapped.length }));
      },
      (error) => console.log("Requests error:", error)
    );

    return () => {
      unsubscribeUser();
      unsubscribePosts();
      unsubscribeLiked();
      unsubscribeSaved();
      unsubscribeCollections();
      unsubscribeFollowers();
      unsubscribeFollowing();
      unsubscribeRequests();
    };
  }, [user?.uid]);

  useEffect(() => {
    const searchAddress = async () => {
      const queryText = String(editForm.address || "").trim();

      if (!editVisible || queryText.length < 3) {
        setAddressSuggestions([]);
        setShowAddressSuggestions(false);
        return;
      }

      try {
        setAddressLoading(true);

        const url =
          `https://nominatim.openstreetmap.org/search?` +
          `q=${encodeURIComponent(queryText)}` +
          `&format=jsonv2&addressdetails=1&limit=5`;

        const response = await fetch(url, {
          headers: {
            Accept: "application/json",
            "User-Agent": "ArtLinker mobile app",
          },
        });

        const data = await response.json();
        const mapped = Array.isArray(data)
          ? data.map((item, index) => ({
              id: item.place_id ? String(item.place_id) : String(index),
              title: item.display_name || "",
              lat: item.lat || "",
              lon: item.lon || "",
            }))
          : [];

        setAddressSuggestions(mapped);
        setShowAddressSuggestions(mapped.length > 0);
      } catch (error) {
        console.log("Address autocomplete error:", error);
        setAddressSuggestions([]);
        setShowAddressSuggestions(false);
      } finally {
        setAddressLoading(false);
      }
    };

    const timer = setTimeout(searchAddress, 500);
    return () => clearTimeout(timer);
  }, [editForm.address, editVisible]);

  const selectablePosts = useMemo(() => {
    const map = new Map();
    [...likedPosts, ...savedPosts].forEach((item) => {
      const key = item.postId || item.id;
      if (!map.has(key)) map.set(key, item);
    });
    return Array.from(map.values());
  }, [likedPosts, savedPosts]);

  const theme = useMemo(() => getTheme(darkMode), [darkMode]);

  const professionalHeadline = useMemo(() => {
    if (profile.location) {
      return `${profile.location} based artist building a curated creative portfolio.`;
    }
    return "Creative portfolio showcasing artwork, collections, liked work, and completed commissioned requests.";
  }, [profile.location]);

  const toggleSelectItem = (item) => {
    const key = item.postId || item.id;
    const exists = selectedItems.some(
      (selected) => (selected.postId || selected.id) === key
    );

    if (exists) {
      setSelectedItems((prev) =>
        prev.filter((selected) => (selected.postId || selected.id) !== key)
      );
    } else {
      setSelectedItems((prev) => [...prev, item]);
    }
  };

  const openEditProfile = () => {
    setEditForm(profile);
    setAddressSuggestions([]);
    setShowAddressSuggestions(false);
    setEditVisible(true);
  };

  const goToSettings = () => router.push("/users/settings");
  const goToMessages = () => router.push("/users/dms");

  const openPostPreview = (item) => setPostPreview({ visible: true, item });
  const closePostPreview = () => setPostPreview(EMPTY_POST_MODAL);

  const downloadRequestImage = async (item) => {
    try {
      if (!item?.downloadUrl) {
        Alert.alert("Unavailable", "No downloadable image found for this request.");
        return;
      }

      const fileName = `artlinker_request_${item.id}.jpg`;
      const fileUri = FileSystem.documentDirectory + fileName;
      const downloadResult = await FileSystem.downloadAsync(item.downloadUrl, fileUri);
      const canShare = await Sharing.isAvailableAsync();

      if (canShare) {
        await Sharing.shareAsync(downloadResult.uri);
      } else {
        Alert.alert("Downloaded", "Image downloaded successfully.");
      }
    } catch (error) {
      console.log("DOWNLOAD REQUEST IMAGE ERROR:", error);
      Alert.alert("Error", "Could not download the image.");
    }
  };

  const pickProfileImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert("Permission needed", "Please allow gallery access.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
    });

    if (!result.canceled && result.assets?.length > 0) {
      setEditForm((prev) => ({ ...prev, avatar: result.assets[0].uri }));
    }
  };

  const uploadImageToStorage = async (uri, uid) => {
    if (!uri || uri.startsWith("http")) return uri;

    const response = await fetch(uri);
    const blob = await response.blob();
    const fileRef = ref(storage, `profileImages/${uid}/${Date.now()}.jpg`);
    await uploadBytes(fileRef, blob);
    return await getDownloadURL(fileRef);
  };

  const saveProfile = async () => {
    if (!user?.uid) {
      Alert.alert("Error", "No logged in user found.");
      return;
    }

    const cleanName = String(editForm.name || "").trim();
    const cleanUsername = normaliseUsername(editForm.username);
    const cleanEmail = String(editForm.email || "").trim();

    if (!cleanName) {
      Alert.alert("Missing name", "Please enter your full name or artist name.");
      return;
    }

    if (!cleanUsername || cleanUsername.length < 3) {
      Alert.alert("Invalid username", "Username must be at least 3 characters.");
      return;
    }

    if (cleanEmail && !isValidEmail(cleanEmail)) {
      Alert.alert("Invalid email", "Please enter a valid email address.");
      return;
    }

    try {
      setSavingProfile(true);
      const avatarUrl = await uploadImageToStorage(editForm.avatar, user.uid);

      await setDoc(
        doc(db, "users", user.uid),
        {
          uid: user.uid,
          name: cleanName,
          username: cleanUsername,
          bio: String(editForm.bio || "").trim(),
          location: String(editForm.location || "").trim(),
          address: String(editForm.address || "").trim(),
          deliveryAddress: String(editForm.address || "").trim(),
          email: cleanEmail || user.email || "",
          avatar: avatarUrl || "",
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      setProfile((prev) => ({
        ...prev,
        name: cleanName,
        username: `@${cleanUsername}`,
        bio: String(editForm.bio || "").trim(),
        location: String(editForm.location || "").trim(),
        address: String(editForm.address || "").trim(),
        email: cleanEmail || user.email || "",
        avatar: avatarUrl || prev.avatar,
      }));

      setEditVisible(false);
      setEditForm(EMPTY_EDIT_FORM);
      setAddressSuggestions([]);
      setShowAddressSuggestions(false);
      Alert.alert("Success", "Profile updated successfully.");
    } catch (error) {
      console.log("Save profile error:", error);
      Alert.alert("Error", "Could not save profile.");
    } finally {
      setSavingProfile(false);
    }
  };

  const createCollection = async () => {
    if (!user?.uid) {
      Alert.alert("Error", "No logged in user found.");
      return;
    }

    const cleanName = newCollectionName.trim();

    if (!cleanName) {
      Alert.alert("Missing name", "Please enter a collection name.");
      return;
    }

    if (selectedItems.length === 0) {
      Alert.alert("No selection", "Please select liked or saved posts.");
      return;
    }

    try {
      setCreatingCollection(true);

      await addDoc(collection(db, "users", user.uid, "collections"), {
        name: cleanName,
        itemCount: selectedItems.length,
        coverImage: selectedItems[0]?.image || "",
        items: selectedItems.map((item) => ({
          id: item.id,
          postId: item.postId || item.id || "",
          image: item.image || "",
          title: item.title || "Untitled",
        })),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setNewCollectionName("");
      setSelectedItems([]);
      setCollectionVisible(false);
      Alert.alert("Success", "Collection created successfully.");
    } catch (error) {
      console.log("Create collection error:", error);
      Alert.alert("Error", "Could not create collection.");
    } finally {
      setCreatingCollection(false);
    }
  };

  const renderArtworkGrid = (items) => {
    if (!items.length) {
      return (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyTitle}>No items yet</Text>
          <Text style={styles.emptyText}>This section is currently empty.</Text>
        </View>
      );
    }

    return (
      <View style={styles.gallery}>
        {items.map((item) => (
          <TouchableOpacity
            key={`${item.postId || item.id}-${item.subtitle || "item"}`}
            style={styles.galleryCard}
            onPress={() => openPostPreview(item)}
            activeOpacity={0.88}
          >
            <Image source={{ uri: item.image || DEFAULT_AVATAR }} style={styles.galleryImage} />
            <View style={styles.galleryOverlay}>
              <Text style={styles.galleryTitle} numberOfLines={1}>{item.title}</Text>
              {!!item.subtitle && (
                <Text style={styles.gallerySubtitle} numberOfLines={1}>{item.subtitle}</Text>
              )}
            </View>
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  const renderCollections = () => (
    <View style={styles.collectionsSection}>
      <TouchableOpacity
        style={styles.addCollectionButton}
        onPress={() => setCollectionVisible(true)}
        activeOpacity={0.85}
      >
        <View style={styles.addCollectionIcon}>
          <Feather name="plus" size={20} color="#ffffff" />
        </View>
        <View style={styles.addCollectionTextWrap}>
          <Text style={styles.addCollectionTitle}>Create Collection</Text>
          <Text style={styles.addCollectionSubtitle}>
            Add a curated collection from liked posts and saved posts
          </Text>
        </View>
      </TouchableOpacity>

      {!collectionsData.length ? (
        <View style={styles.emptyWrapNoMargin}>
          <Text style={styles.emptyTitle}>No collections yet</Text>
          <Text style={styles.emptyText}>Create your first collection using the plus button.</Text>
        </View>
      ) : (
        collectionsData.map((collectionItem) => (
          <View key={collectionItem.id} style={styles.collectionCard}>
            <View style={styles.collectionHeader}>
              <Text style={styles.collectionName}>{collectionItem.name || "Untitled Collection"}</Text>
              <Text style={styles.collectionCount}>
                {collectionItem.items?.length || 0} piece{(collectionItem.items?.length || 0) !== 1 ? "s" : ""}
              </Text>
            </View>

            <View style={styles.collectionPreviewRow}>
              {(collectionItem.items || []).slice(0, 3).map((item, index) => (
                <Image
                  key={`${collectionItem.id}-${index}`}
                  source={{ uri: item.image || DEFAULT_AVATAR }}
                  style={styles.collectionPreviewImage}
                />
              ))}
            </View>
          </View>
        ))
      )}
    </View>
  );

  const renderRequests = () => {
    if (!requestedArtworks.length) {
      return (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyTitle}>No completed requests yet</Text>
          <Text style={styles.emptyText}>Your completed artwork and service requests will appear here.</Text>
        </View>
      );
    }

    return (
      <View style={styles.requestsSection}>
        {requestedArtworks.map((item) => (
          <View key={item.id} style={styles.requestCard}>
            <Image source={{ uri: item.image || DEFAULT_AVATAR }} style={styles.requestImage} />
            <View style={styles.requestContent}>
              <View style={styles.requestTopRow}>
                <Text style={styles.requestTitle} numberOfLines={1}>{item.title}</Text>
                <View style={[styles.statusBadge, styles.statusCompleted]}>
                  <Text style={styles.statusBadgeText}>completed</Text>
                </View>
              </View>

              <Text style={styles.requestSubtitle} numberOfLines={1}>{item.subtitle}</Text>

              {!!item.description && (
                <Text style={styles.requestDescription} numberOfLines={2}>{item.description}</Text>
              )}

              {!!item.budget && <Text style={styles.requestBudget}>Budget: £{item.budget}</Text>}

              <TouchableOpacity
                style={styles.downloadButton}
                onPress={() => downloadRequestImage(item)}
                activeOpacity={0.85}
              >
                <Ionicons name="download-outline" size={16} color="#FFFFFF" />
                <Text style={styles.downloadButtonText}>Download Image</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.loaderScreen, theme.screen]} edges={["top"]}>
        <ActivityIndicator size="large" color="#f06ce9" />
        <Text style={[styles.loaderText, theme.mutedText]}>Loading profile...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, theme.screen]} edges={["top"]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.logo}>ArtLinker</Text>
        </View>

        <View style={[styles.heroCard, theme.card]}>
          <View style={styles.profileTopArea}>
            <Image source={{ uri: profile.avatar || DEFAULT_AVATAR }} style={styles.avatar} />

            <View style={styles.profileTopText}>
              <Text style={[styles.name, theme.titleText]} numberOfLines={1}>{profile.name}</Text>
              <Text style={[styles.username, theme.mutedText]}>{profile.username}</Text>
              <Text style={[styles.headline, theme.bodyText]}>{professionalHeadline}</Text>
            </View>
          </View>

          <View style={styles.actionButtonsRow}>
            <TouchableOpacity style={styles.primaryActionButton} onPress={openEditProfile} activeOpacity={0.85}>
              <Feather name="edit-2" size={15} color="#ffffff" />
              <Text style={styles.primaryActionText}>Edit Profile</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.secondaryActionButton, theme.outlineButton]} onPress={goToMessages} activeOpacity={0.85}>
              <Ionicons name="chatbubble-ellipses-outline" size={18} color={theme.icon.color} />
            </TouchableOpacity>

            <TouchableOpacity style={[styles.secondaryActionButton, theme.outlineButton]} onPress={goToSettings} activeOpacity={0.85}>
              <Ionicons name="settings-outline" size={18} color={theme.icon.color} />
            </TouchableOpacity>
          </View>

          <View style={[styles.professionalCard, theme.innerCard]}>
            <Text style={[styles.professionalCardTitle, theme.titleText]}>Professional Profile</Text>
            <Text style={[styles.bio, theme.bodyText]}>{profile.bio || "No bio added yet."}</Text>

            <View style={styles.infoWrap}>
              {!!profile.location && (
                <View style={[styles.infoChip, theme.chip]}>
                  <Ionicons name="location-outline" size={14} color={theme.subtleIcon.color} />
                  <Text style={[styles.infoText, theme.mutedText]}>{profile.location}</Text>
                </View>
              )}

              {!!profile.address && (
                <View style={[styles.infoChipWide, theme.chip]}>
                  <Ionicons name="home-outline" size={14} color={theme.subtleIcon.color} />
                  <Text style={[styles.infoText, theme.mutedText]} numberOfLines={2}>{profile.address}</Text>
                </View>
              )}

              {!!profile.email && (
                <View style={[styles.infoChip, theme.chip]}>
                  <Ionicons name="mail-outline" size={14} color={theme.subtleIcon.color} />
                  <Text style={[styles.infoText, theme.mutedText]}>{profile.email}</Text>
                </View>
              )}

              <View style={[styles.infoChip, theme.chip]}>
                <MaterialIcons name="date-range" size={14} color={theme.subtleIcon.color} />
                <Text style={[styles.infoText, theme.mutedText]}>{profile.joined}</Text>
              </View>
            </View>
          </View>

          <View style={[styles.statsCard, theme.statsCard]}>
            <View style={styles.statItem}>
              <Text style={[styles.statNumber, theme.titleText]}>{stats.portfolio}</Text>
              <Text style={[styles.statLabel, theme.mutedText]}>Portfolio</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={[styles.statNumber, theme.titleText]}>{stats.collections}</Text>
              <Text style={[styles.statLabel, theme.mutedText]}>Collections</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={[styles.statNumber, theme.titleText]}>{stats.requests}</Text>
              <Text style={[styles.statLabel, theme.mutedText]}>Requests</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={[styles.statNumber, theme.titleText]}>{stats.followers}</Text>
              <Text style={[styles.statLabel, theme.mutedText]}>Followers</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={[styles.statNumber, theme.titleText]}>{stats.following}</Text>
              <Text style={[styles.statLabel, theme.mutedText]}>Following</Text>
            </View>
          </View>
        </View>

        <View style={[styles.tabWrapper, theme.tabWrapper]}>
          {tabs.map((tab) => {
            const active = activeTab === tab;
            return (
              <TouchableOpacity
                key={tab}
                style={[styles.tabButton, active && styles.activeTabButton, active && theme.activeTabButton]}
                onPress={() => setActiveTab(tab)}
                activeOpacity={0.85}
              >
                <Text style={[styles.tabText, theme.mutedText, active && styles.activeTabText, active && theme.activeTabText]}>{tab}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {activeTab === "Portfolio" && renderArtworkGrid(userPosts)}
        {activeTab === "Collections" && renderCollections()}
        {activeTab === "Liked" && renderArtworkGrid(likedPosts)}
        {activeTab === "Requests" && renderRequests()}

        <Modal visible={editVisible} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalCard, theme.modalCard]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, theme.titleText]}>Edit Profile</Text>
                <TouchableOpacity
                  onPress={() => {
                    setEditVisible(false);
                    setAddressSuggestions([]);
                    setShowAddressSuggestions(false);
                  }}
                >
                  <Ionicons name="close" size={24} color={theme.icon.color} />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false}>
                <TouchableOpacity style={styles.imagePickerButton} onPress={pickProfileImage} activeOpacity={0.85}>
                  <Image source={{ uri: editForm.avatar || DEFAULT_AVATAR }} style={styles.modalAvatar} />
                  <Text style={styles.imagePickerText}>Change profile image</Text>
                </TouchableOpacity>

                <TextInput style={[styles.input, theme.input]} placeholder="Full name" value={editForm.name} onChangeText={(text) => setEditForm((prev) => ({ ...prev, name: text }))} />
                <TextInput style={[styles.input, theme.input]} placeholder="Username" autoCapitalize="none" value={editForm.username} onChangeText={(text) => setEditForm((prev) => ({ ...prev, username: text }))} />
                <TextInput style={[styles.input, styles.textArea, theme.input]} placeholder="Bio" multiline value={editForm.bio} onChangeText={(text) => setEditForm((prev) => ({ ...prev, bio: text }))} />
                <TextInput style={[styles.input, theme.input]} placeholder="Location" value={editForm.location} onChangeText={(text) => setEditForm((prev) => ({ ...prev, location: text }))} />

                <TextInput
                  style={[styles.input, styles.textArea, theme.input]}
                  placeholder="Address"
                  multiline
                  value={editForm.address}
                  onChangeText={(text) => {
                    setEditForm((prev) => ({ ...prev, address: text }));
                    setShowAddressSuggestions(true);
                  }}
                />

                {addressLoading && <Text style={styles.helperText}>Searching address...</Text>}

                {showAddressSuggestions && addressSuggestions.length > 0 && (
                  <View style={styles.suggestionsBox}>
                    {addressSuggestions.map((item) => (
                      <TouchableOpacity
                        key={item.id}
                        style={styles.suggestionItem}
                        onPress={() => {
                          setEditForm((prev) => ({ ...prev, address: item.title }));
                          setAddressSuggestions([]);
                          setShowAddressSuggestions(false);
                        }}
                      >
                        <Ionicons name="location-outline" size={16} color="#4a63ff" />
                        <Text style={styles.suggestionText}>{item.title}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                <TextInput style={[styles.input, theme.input]} placeholder="Email" keyboardType="email-address" autoCapitalize="none" value={editForm.email} onChangeText={(text) => setEditForm((prev) => ({ ...prev, email: text }))} />

                <TouchableOpacity style={[styles.saveButton, savingProfile && styles.disabledButton]} onPress={saveProfile} disabled={savingProfile}>
                  <Text style={styles.saveButtonText}>{savingProfile ? "Saving..." : "Save Profile"}</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </Modal>

        <Modal visible={collectionVisible} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalCardLarge, theme.modalCard]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, theme.titleText]}>New Collection</Text>
                <TouchableOpacity onPress={() => setCollectionVisible(false)}>
                  <Ionicons name="close" size={24} color={theme.icon.color} />
                </TouchableOpacity>
              </View>

              <TextInput style={[styles.input, theme.input]} placeholder="Collection name" value={newCollectionName} onChangeText={setNewCollectionName} />
              <Text style={[styles.selectTitle, theme.titleText]}>Select from liked posts and saved posts</Text>

              <FlatList
                data={selectablePosts}
                keyExtractor={(item) => item.postId || item.id}
                numColumns={2}
                showsVerticalScrollIndicator={false}
                ListEmptyComponent={
                  <View style={styles.emptyWrapNoMargin}>
                    <Text style={styles.emptyTitle}>No saved or liked posts</Text>
                    <Text style={styles.emptyText}>Like or save artworks before creating a collection.</Text>
                  </View>
                }
                contentContainerStyle={styles.selectGrid}
                renderItem={({ item }) => {
                  const selected = selectedItems.some((selectedItem) => (selectedItem.postId || selectedItem.id) === (item.postId || item.id));

                  return (
                    <TouchableOpacity style={styles.selectCard} onPress={() => toggleSelectItem(item)} activeOpacity={0.85}>
                      <Image source={{ uri: item.image || DEFAULT_AVATAR }} style={styles.selectImage} />
                      <View style={styles.selectFooter}>
                        <Text style={styles.selectLabel} numberOfLines={1}>{item.title}</Text>
                      </View>
                      {selected && (
                        <View style={styles.selectedBadge}>
                          <Ionicons name="checkmark" size={16} color="#fff" />
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                }}
              />

              <TouchableOpacity style={[styles.saveButton, creatingCollection && styles.disabledButton]} onPress={createCollection} disabled={creatingCollection}>
                <Text style={styles.saveButtonText}>{creatingCollection ? "Creating..." : "Create Collection"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        <Modal visible={postPreview.visible} animationType="fade" transparent>
          <View style={styles.previewOverlay}>
            <View style={[styles.previewCard, theme.modalCard]}>
              <View style={styles.previewHeader}>
                <Text style={[styles.previewTitle, theme.titleText]}>Artwork Details</Text>
                <TouchableOpacity onPress={closePostPreview}>
                  <Ionicons name="close" size={24} color={theme.icon.color} />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false}>
                <Image source={{ uri: postPreview.item?.image || DEFAULT_AVATAR }} style={styles.previewImage} />
                <Text style={[styles.previewPostTitle, theme.titleText]}>{postPreview.item?.title || "Untitled Post"}</Text>
                <Text style={[styles.previewOwnerText, theme.mutedText]}>{postPreview.item?.ownerName || profile.name}</Text>

                {!!postPreview.item?.description && <Text style={[styles.previewDescription, theme.bodyText]}>{postPreview.item.description}</Text>}

                <View style={styles.previewMetaWrap}>
                  {!!postPreview.item?.category && <View style={styles.previewMetaChip}><Text style={styles.previewMetaChipText}>{postPreview.item.category}</Text></View>}
                  {!!postPreview.item?.visibility && <View style={styles.previewMetaChip}><Text style={styles.previewMetaChipText}>{postPreview.item.visibility}</Text></View>}
                  {Array.isArray(postPreview.item?.tags) && postPreview.item.tags.slice(0, 4).map((tag, index) => (
                    <View key={`${tag}-${index}`} style={styles.previewMetaChip}><Text style={styles.previewMetaChipText}>{tag}</Text></View>
                  ))}
                </View>

                {!!postPreview.item?.story && <View style={styles.previewSection}><Text style={styles.previewSectionTitle}>Story</Text><Text style={styles.previewSectionText}>{postPreview.item.story}</Text></View>}
                {!!postPreview.item?.materials && <View style={styles.previewSection}><Text style={styles.previewSectionTitle}>Materials</Text><Text style={styles.previewSectionText}>{postPreview.item.materials}</Text></View>}

                <View style={styles.previewStatsRow}>
                  <View style={styles.previewStatBox}><Ionicons name="heart-outline" size={16} color="#111827" /><Text style={styles.previewStatText}>{postPreview.item?.likesCount || 0}</Text></View>
                  <View style={styles.previewStatBox}><Ionicons name="chatbubble-outline" size={16} color="#111827" /><Text style={styles.previewStatText}>{postPreview.item?.commentsCount || 0}</Text></View>
                  <View style={styles.previewStatBoxLast}><Ionicons name="bookmark-outline" size={16} color="#111827" /><Text style={styles.previewStatText}>{postPreview.item?.savesCount || 0}</Text></View>
                </View>

                <View style={styles.previewOptionsRow}>
                  <View style={styles.previewOptionChip}><Text style={styles.previewOptionText}>Comments {postPreview.item?.allowComments ? "On" : "Off"}</Text></View>
                  <View style={styles.previewOptionChip}><Text style={styles.previewOptionText}>Downloads {postPreview.item?.allowDownloads ? "On" : "Off"}</Text></View>
                </View>
              </ScrollView>
            </View>
          </View>
        </Modal>
      </ScrollView>
    </SafeAreaView>
  );
}

function getTheme(darkMode) {
  if (!darkMode) {
    return {
      screen: { backgroundColor: "#f7f8fc" },
      card: {},
      innerCard: {},
      modalCard: {},
      statsCard: {},
      tabWrapper: {},
      activeTabButton: {},
      activeTabText: {},
      titleText: {},
      bodyText: {},
      mutedText: {},
      chip: {},
      input: {},
      outlineButton: {},
      icon: { color: "#222" },
      subtleIcon: { color: "#777" },
    };
  }

  return {
    screen: { backgroundColor: "#0F172A" },
    card: { backgroundColor: "#111827", borderColor: "#263244" },
    innerCard: { backgroundColor: "#182033", borderColor: "#29364A" },
    modalCard: { backgroundColor: "#111827" },
    statsCard: { backgroundColor: "#1F2937" },
    tabWrapper: { backgroundColor: "#1F2937" },
    activeTabButton: { backgroundColor: "#374151" },
    activeTabText: { color: "#FFFFFF" },
    titleText: { color: "#F9FAFB" },
    bodyText: { color: "#D1D5DB" },
    mutedText: { color: "#A7B0C0" },
    chip: { backgroundColor: "#111827", borderColor: "#374151" },
    input: { backgroundColor: "#1F2937", borderColor: "#374151", color: "#F9FAFB" },
    outlineButton: { backgroundColor: "#1F2937", borderColor: "#374151" },
    icon: { color: "#F9FAFB" },
    subtleIcon: { color: "#A7B0C0" },
  };
}

function getMillis(value) {
  if (!value) return 0;
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (typeof value?.seconds === "number") return value.seconds * 1000;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function formatJoinedDate(timestamp) {
  if (!timestamp) return "Joined recently";

  let date;

  if (typeof timestamp?.toDate === "function") {
    date = timestamp.toDate();
  } else if (typeof timestamp?.seconds === "number") {
    date = new Date(timestamp.seconds * 1000);
  } else {
    date = new Date(timestamp);
  }

  if (Number.isNaN(date.getTime())) return "Joined recently";

  return `Joined ${date.toLocaleString("en-GB", {
    month: "long",
    year: "numeric",
  })}`;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#f7f8fc" },
  scrollContent: { paddingBottom: 28 },
  loaderScreen: { flex: 1, backgroundColor: "#f7f8fc", justifyContent: "center", alignItems: "center" },
  loaderText: { marginTop: 12, fontSize: 14, color: "#666" },
  header: { alignItems: "center", paddingTop: 10, paddingBottom: 10 },
  logo: { fontSize: 28, fontWeight: "800", color: "#f06ce9" },
  heroCard: { marginHorizontal: 14, backgroundColor: "#ffffff", borderRadius: 24, padding: 18, borderWidth: 1, borderColor: "#ececf2", shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 3, marginBottom: 14 },
  profileTopArea: { flexDirection: "row", alignItems: "center", marginBottom: 16 },
  avatar: { width: 102, height: 102, borderRadius: 51, backgroundColor: "#f2f2f2", marginRight: 14 },
  profileTopText: { flex: 1 },
  name: { fontSize: 28, fontWeight: "800", color: "#171717" },
  username: { fontSize: 14, color: "#8d8d96", marginTop: 4 },
  headline: { fontSize: 13, color: "#5f6470", lineHeight: 20, marginTop: 8, fontWeight: "600" },
  actionButtonsRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 16 },
  primaryActionButton: { flex: 1, height: 44, borderRadius: 14, backgroundColor: "#111827", alignItems: "center", justifyContent: "center", flexDirection: "row" },
  primaryActionText: { marginLeft: 8, fontSize: 14, fontWeight: "700", color: "#ffffff" },
  secondaryActionButton: { width: 44, height: 44, borderRadius: 14, borderWidth: 1, borderColor: "#dddddd", alignItems: "center", justifyContent: "center", backgroundColor: "#fafafa" },
  professionalCard: { backgroundColor: "#fafbff", borderRadius: 18, padding: 14, borderWidth: 1, borderColor: "#eef0f8", marginBottom: 14 },
  professionalCardTitle: { fontSize: 15, fontWeight: "800", color: "#171717", marginBottom: 8 },
  bio: { fontSize: 15, lineHeight: 23, color: "#333", marginBottom: 12 },
  infoWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  infoChip: { flexDirection: "row", alignItems: "center", backgroundColor: "#ffffff", paddingHorizontal: 10, paddingVertical: 8, borderRadius: 18, maxWidth: "100%", borderWidth: 1, borderColor: "#ececf2" },
  infoChipWide: { flexDirection: "row", alignItems: "flex-start", backgroundColor: "#ffffff", paddingHorizontal: 10, paddingVertical: 8, borderRadius: 18, width: "100%", borderWidth: 1, borderColor: "#ececf2" },
  infoText: { marginLeft: 5, fontSize: 13, color: "#6d6d75", flexShrink: 1 },
  statsCard: { flexDirection: "row", justifyContent: "space-between", backgroundColor: "#faf7ff", borderRadius: 18, paddingVertical: 14, paddingHorizontal: 8 },
  statItem: { flex: 1, alignItems: "center" },
  statNumber: { fontSize: 17, fontWeight: "800", color: "#1f1f1f" },
  statLabel: { fontSize: 10.5, color: "#888", marginTop: 4 },
  tabWrapper: { flexDirection: "row", marginHorizontal: 14, backgroundColor: "#f2f2f2", borderRadius: 18, padding: 4, marginBottom: 14 },
  tabButton: { flex: 1, paddingVertical: 11, alignItems: "center", borderRadius: 14 },
  activeTabButton: { backgroundColor: "#ffffff" },
  tabText: { fontSize: 13, color: "#8f8f8f", fontWeight: "600" },
  activeTabText: { color: "#333" },
  gallery: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", paddingHorizontal: 14 },
  galleryCard: { width: "48.5%", height: 220, borderRadius: 16, overflow: "hidden", marginBottom: 12, backgroundColor: "#f3f3f3" },
  galleryImage: { width: "100%", height: "100%" },
  galleryOverlay: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 10, paddingVertical: 10, backgroundColor: "rgba(0,0,0,0.32)" },
  galleryTitle: { color: "#fff", fontSize: 13, fontWeight: "700" },
  gallerySubtitle: { color: "#ececec", fontSize: 11, marginTop: 3 },
  collectionsSection: { paddingHorizontal: 14 },
  addCollectionButton: { flexDirection: "row", alignItems: "center", backgroundColor: "#171717", borderRadius: 16, padding: 14, marginBottom: 14 },
  addCollectionIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: "#f06ce9", justifyContent: "center", alignItems: "center", marginRight: 12 },
  addCollectionTextWrap: { flex: 1 },
  addCollectionTitle: { fontSize: 15, fontWeight: "700", color: "#ffffff" },
  addCollectionSubtitle: { fontSize: 12, color: "#d6d6db", marginTop: 4, lineHeight: 18 },
  collectionCard: { backgroundColor: "#ffffff", borderWidth: 1, borderColor: "#ececf2", borderRadius: 18, padding: 14, marginBottom: 12, shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  collectionHeader: { marginBottom: 12 },
  collectionName: { fontSize: 18, fontWeight: "800", color: "#1f1f1f" },
  collectionCount: { marginTop: 4, fontSize: 13, color: "#8b8b94" },
  collectionPreviewRow: { flexDirection: "row", justifyContent: "space-between" },
  collectionPreviewImage: { width: "32%", height: 95, borderRadius: 12, backgroundColor: "#f2f2f2" },
  requestsSection: { paddingHorizontal: 14 },
  requestCard: { flexDirection: "row", backgroundColor: "#ffffff", borderWidth: 1, borderColor: "#ececf2", borderRadius: 18, padding: 12, marginBottom: 12, alignItems: "flex-start" },
  requestImage: { width: 78, height: 78, borderRadius: 14, backgroundColor: "#f2f2f2", marginRight: 12 },
  requestContent: { flex: 1 },
  requestTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  requestTitle: { flex: 1, fontSize: 15, fontWeight: "800", color: "#171717" },
  requestSubtitle: { marginTop: 5, fontSize: 12, color: "#7a7f8a", fontWeight: "600" },
  requestDescription: { marginTop: 7, fontSize: 12, lineHeight: 18, color: "#4b5563" },
  requestBudget: { marginTop: 8, fontSize: 12, fontWeight: "800", color: "#111827" },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  statusCompleted: { backgroundColor: "#DCFCE7" },
  statusBadgeText: { fontSize: 11, fontWeight: "800", color: "#374151", textTransform: "capitalize" },
  downloadButton: { marginTop: 10, height: 40, borderRadius: 12, backgroundColor: "#111827", alignItems: "center", justifyContent: "center", flexDirection: "row", alignSelf: "flex-start", paddingHorizontal: 14 },
  downloadButtonText: { marginLeft: 6, fontSize: 13, fontWeight: "700", color: "#FFFFFF" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.32)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: "#ffffff", borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 24, maxHeight: "88%" },
  modalCardLarge: { backgroundColor: "#ffffff", borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 24, height: "84%" },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  modalTitle: { fontSize: 22, fontWeight: "800", color: "#1f1f1f" },
  imagePickerButton: { alignItems: "center", marginBottom: 16 },
  modalAvatar: { width: 92, height: 92, borderRadius: 46, marginBottom: 10, backgroundColor: "#f2f2f2" },
  imagePickerText: { fontSize: 14, fontWeight: "600", color: "#4a63ff" },
  input: { minHeight: 50, borderWidth: 1, borderColor: "#e3e3ea", borderRadius: 12, paddingHorizontal: 14, fontSize: 14, color: "#222", marginBottom: 12, backgroundColor: "#fafafa" },
  textArea: { minHeight: 100, textAlignVertical: "top", paddingTop: 14, paddingBottom: 14 },
  helperText: { fontSize: 12, color: "#6d6d75", marginTop: -4, marginBottom: 10 },
  suggestionsBox: { borderWidth: 1, borderColor: "#e3e3ea", backgroundColor: "#ffffff", borderRadius: 12, marginTop: -4, marginBottom: 12, overflow: "hidden" },
  suggestionItem: { flexDirection: "row", alignItems: "flex-start", paddingHorizontal: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#f1f1f4" },
  suggestionText: { flex: 1, marginLeft: 8, fontSize: 13, color: "#222", lineHeight: 18 },
  saveButton: { height: 50, borderRadius: 14, backgroundColor: "#f06ce9", alignItems: "center", justifyContent: "center", marginTop: 10 },
  disabledButton: { opacity: 0.65 },
  saveButtonText: { fontSize: 15, fontWeight: "700", color: "#ffffff" },
  selectTitle: { fontSize: 14, fontWeight: "700", color: "#333", marginBottom: 12 },
  selectGrid: { paddingBottom: 12 },
  selectCard: { width: "48.5%", marginBottom: 12, marginRight: "1.5%", borderRadius: 14, overflow: "hidden", backgroundColor: "#f4f4f6", position: "relative" },
  selectImage: { width: "100%", height: 145, backgroundColor: "#f2f2f2" },
  selectFooter: { paddingHorizontal: 10, paddingVertical: 10 },
  selectLabel: { fontSize: 13, fontWeight: "600", color: "#222" },
  selectedBadge: { position: "absolute", top: 8, right: 8, width: 26, height: 26, borderRadius: 13, backgroundColor: "#4a63ff", alignItems: "center", justifyContent: "center" },
  emptyWrap: { marginHorizontal: 14, backgroundColor: "#fafafa", borderRadius: 16, padding: 20, alignItems: "center" },
  emptyWrapNoMargin: { backgroundColor: "#fafafa", borderRadius: 16, padding: 20, alignItems: "center" },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: "#222" },
  emptyText: { fontSize: 13, color: "#888", marginTop: 6, textAlign: "center" },
  previewOverlay: { flex: 1, backgroundColor: "rgba(15, 23, 42, 0.35)", justifyContent: "center", paddingHorizontal: 16, paddingVertical: 28 },
  previewCard: { backgroundColor: "#FFFFFF", borderRadius: 24, padding: 16, maxHeight: "92%" },
  previewHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  previewTitle: { fontSize: 20, fontWeight: "800", color: "#111827" },
  previewImage: { width: "100%", height: 260, borderRadius: 18, backgroundColor: "#f3f4f6", marginBottom: 14 },
  previewPostTitle: { fontSize: 20, fontWeight: "900", color: "#111827" },
  previewOwnerText: { marginTop: 4, fontSize: 13, color: "#6B7280", fontWeight: "600" },
  previewDescription: { marginTop: 12, fontSize: 14, lineHeight: 22, color: "#374151", fontWeight: "600" },
  previewMetaWrap: { flexDirection: "row", flexWrap: "wrap", marginTop: 12 },
  previewMetaChip: { backgroundColor: "#F3F4F6", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7, marginRight: 8, marginBottom: 8 },
  previewMetaChipText: { fontSize: 12, color: "#374151", fontWeight: "700" },
  previewSection: { marginTop: 12, backgroundColor: "#FAFAFB", borderRadius: 16, padding: 12, borderWidth: 1, borderColor: "#EEF2F7" },
  previewSectionTitle: { fontSize: 13, fontWeight: "800", color: "#111827", marginBottom: 6 },
  previewSectionText: { fontSize: 13, lineHeight: 20, color: "#4B5563", fontWeight: "600" },
  previewStatsRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 14 },
  previewStatBox: { flex: 1, marginRight: 8, backgroundColor: "#F9FAFB", borderRadius: 14, paddingVertical: 12, alignItems: "center", justifyContent: "center", flexDirection: "row", borderWidth: 1, borderColor: "#EEF2F7" },
  previewStatBoxLast: { flex: 1, backgroundColor: "#F9FAFB", borderRadius: 14, paddingVertical: 12, alignItems: "center", justifyContent: "center", flexDirection: "row", borderWidth: 1, borderColor: "#EEF2F7" },
  previewStatText: { marginLeft: 6, fontSize: 13, fontWeight: "800", color: "#111827" },
  previewOptionsRow: { flexDirection: "row", flexWrap: "wrap", marginTop: 12 },
  previewOptionChip: { backgroundColor: "#111827", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, marginRight: 8, marginBottom: 8 },
  previewOptionText: { fontSize: 12, fontWeight: "700", color: "#FFFFFF" },
});

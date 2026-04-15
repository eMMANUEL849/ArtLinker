import React, { useEffect, useMemo, useState } from "react";
import {
  SafeAreaView,
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
import * as ImagePicker from "expo-image-picker";
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

export default function ProfileScreen() {
  const router = useRouter();

  const [activeTab, setActiveTab] = useState("Artworks");
  const [editVisible, setEditVisible] = useState(false);
  const [collectionVisible, setCollectionVisible] = useState(false);

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

  const [stats, setStats] = useState({
    followers: 0,
    following: 0,
    portfolio: 0,
    collections: 0,
  });

  const [editForm, setEditForm] = useState(EMPTY_EDIT_FORM);

  const [addressSuggestions, setAddressSuggestions] = useState([]);
  const [addressLoading, setAddressLoading] = useState(false);
  const [showAddressSuggestions, setShowAddressSuggestions] = useState(false);

  const [userPosts, setUserPosts] = useState([]);
  const [likedPosts, setLikedPosts] = useState([]);
  const [savedPosts, setSavedPosts] = useState([]);
  const [collectionsData, setCollectionsData] = useState([]);

  const [newCollectionName, setNewCollectionName] = useState("");
  const [selectedItems, setSelectedItems] = useState([]);

  const tabs = ["Artworks", "Collections", "Liked"];
  const user = auth.currentUser;

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const userRef = doc(db, "users", user.uid);

    const unsubscribeUser = onSnapshot(
      userRef,
      async (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();

          const profileData = {
            name: data.name || data.displayName || "Artist",
            username: data.username
              ? `@${String(data.username).replace("@", "")}`
              : "@artist",
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
              avatar: "",
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

    const postsQuery = query(
      collection(db, "posts"),
      where("userId", "==", user.uid)
    );

    const unsubscribePosts = onSnapshot(
      postsQuery,
      (snapshot) => {
        const list = snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        }));

        list.sort((a, b) => getMillis(b.createdAt) - getMillis(a.createdAt));

        const mappedPosts = list.map((item) => ({
          id: item.id,
          postId: item.id,
          image:
            item.imageUrl ||
            item.image ||
            item.postImage ||
            item.artworkUrl ||
            "",
          title: item.title || item.caption || "Untitled Post",
        }));

        setUserPosts(mappedPosts);
        setStats((prev) => ({ ...prev, portfolio: mappedPosts.length }));
      },
      (error) => {
        console.log("Posts error:", error);
      }
    );

    const likedQuery = query(collection(db, "users", user.uid, "likedPosts"));

    const unsubscribeLiked = onSnapshot(
      likedQuery,
      (snapshot) => {
        const list = snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        }));

        list.sort((a, b) => getMillis(b.createdAt) - getMillis(a.createdAt));

        setLikedPosts(
          list.map((item) => ({
            id: item.id,
            postId: item.postId || "",
            image: item.imageUrl || item.image || item.postImage || "",
            title: item.title || item.caption || "Liked post",
          }))
        );
      },
      (error) => {
        console.log("Liked posts error:", error);
      }
    );

    const savedQuery = query(collection(db, "users", user.uid, "savedPosts"));

    const unsubscribeSaved = onSnapshot(
      savedQuery,
      (snapshot) => {
        const list = snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        }));

        list.sort((a, b) => getMillis(b.createdAt) - getMillis(a.createdAt));

        setSavedPosts(
          list.map((item) => ({
            id: item.id,
            postId: item.postId || "",
            image: item.imageUrl || item.image || item.postImage || "",
            title: item.title || item.caption || "Saved post",
          }))
        );
      },
      (error) => {
        console.log("Saved posts error:", error);
      }
    );

    const collectionsQuery = query(
      collection(db, "users", user.uid, "collections")
    );

    const unsubscribeCollections = onSnapshot(
      collectionsQuery,
      (snapshot) => {
        const list = snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        }));

        list.sort((a, b) => getMillis(b.createdAt) - getMillis(a.createdAt));
        setCollectionsData(list);
        setStats((prev) => ({ ...prev, collections: list.length }));
      },
      (error) => {
        console.log("Collections error:", error);
      }
    );

    const followersQuery = query(collection(db, "users", user.uid, "followers"));
    const unsubscribeFollowers = onSnapshot(
      followersQuery,
      (snapshot) => {
        setStats((prev) => ({ ...prev, followers: snapshot.size }));
      },
      (error) => {
        console.log("Followers error:", error);
      }
    );

    const followingQuery = query(collection(db, "users", user.uid, "following"));
    const unsubscribeFollowing = onSnapshot(
      followingQuery,
      (snapshot) => {
        setStats((prev) => ({ ...prev, following: snapshot.size }));
      },
      (error) => {
        console.log("Following error:", error);
      }
    );

    return () => {
      unsubscribeUser();
      unsubscribePosts();
      unsubscribeLiked();
      unsubscribeSaved();
      unsubscribeCollections();
      unsubscribeFollowers();
      unsubscribeFollowing();
    };
  }, [user]);

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
        setShowAddressSuggestions(true);
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
    return [...likedPosts, ...savedPosts];
  }, [likedPosts, savedPosts]);

  const toggleSelectItem = (item) => {
    const exists = selectedItems.some((selected) => selected.id === item.id);

    if (exists) {
      setSelectedItems((prev) =>
        prev.filter((selected) => selected.id !== item.id)
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

  const goToSettings = () => {
    router.push("/users/settings");
  };

  const pickProfileImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert("Permission needed", "Please allow gallery access.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
    });

    if (!result.canceled && result.assets?.length > 0) {
      setEditForm((prev) => ({
        ...prev,
        avatar: result.assets[0].uri,
      }));
    }
  };

  const uploadImageToStorage = async (uri, uid) => {
    if (!uri || uri.startsWith("http")) {
      return uri;
    }

    const response = await fetch(uri);
    const blob = await response.blob();

    const fileRef = ref(storage, `profileImages/${uid}/${Date.now()}.jpg`);
    await uploadBytes(fileRef, blob);
    return await getDownloadURL(fileRef);
  };

  const saveProfile = async () => {
    if (!user) {
      Alert.alert("Error", "No logged in user found.");
      return;
    }

    try {
      setSavingProfile(true);

      const avatarUrl = await uploadImageToStorage(editForm.avatar, user.uid);
      const cleanUsername = String(editForm.username || "")
        .trim()
        .replace("@", "");

      await setDoc(
        doc(db, "users", user.uid),
        {
          name: editForm.name || "",
          username: cleanUsername || "artist",
          bio: editForm.bio || "",
          location: editForm.location || "",
          address: editForm.address || "",
          deliveryAddress: editForm.address || "",
          email: editForm.email || user.email || "",
          avatar: avatarUrl || "",
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      const updatedProfile = {
        ...profile,
        ...editForm,
        username: `@${cleanUsername || "artist"}`,
        avatar: avatarUrl || profile.avatar,
      };

      setProfile(updatedProfile);
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
    if (!user) {
      Alert.alert("Error", "No logged in user found.");
      return;
    }

    if (!newCollectionName.trim()) {
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
        name: newCollectionName.trim(),
        items: selectedItems.map((item) => ({
          id: item.id,
          postId: item.postId || "",
          image: item.image || "",
          title: item.title || "",
        })),
        createdAt: serverTimestamp(),
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
          <View key={item.id} style={styles.galleryCard}>
            <Image
              source={{ uri: item.image || DEFAULT_AVATAR }}
              style={styles.galleryImage}
            />
            <View style={styles.galleryOverlay}>
              <Text style={styles.galleryTitle} numberOfLines={1}>
                {item.title}
              </Text>
            </View>
          </View>
        ))}
      </View>
    );
  };

  const renderCollections = () => {
    return (
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
              Add a collection from liked posts and saved posts
            </Text>
          </View>
        </TouchableOpacity>

        {!collectionsData.length ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyTitle}>No collections yet</Text>
            <Text style={styles.emptyText}>
              Create your first collection using the plus button.
            </Text>
          </View>
        ) : (
          collectionsData.map((collectionItem) => (
            <View key={collectionItem.id} style={styles.collectionCard}>
              <View style={styles.collectionHeader}>
                <View>
                  <Text style={styles.collectionName}>
                    {collectionItem.name || "Untitled Collection"}
                  </Text>
                  <Text style={styles.collectionCount}>
                    {collectionItem.items?.length || 0} piece
                    {(collectionItem.items?.length || 0) !== 1 ? "s" : ""}
                  </Text>
                </View>
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
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loaderScreen}>
        <ActivityIndicator size="large" color="#f06ce9" />
        <Text style={styles.loaderText}>Loading profile...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.header}>
          <Text style={styles.logo}>ArtLinker</Text>
        </View>

        <View style={styles.heroCard}>
          <Image source={{ uri: profile.avatar || DEFAULT_AVATAR }} style={styles.avatar} />

          <View style={styles.heroTopRow}>
            <View style={styles.nameWrap}>
              <Text style={styles.name}>{profile.name}</Text>
              <Text style={styles.username}>{profile.username}</Text>
            </View>

            <View style={styles.actionButtonsRow}>
              <TouchableOpacity style={styles.editButton} onPress={openEditProfile}>
                <Feather name="edit-2" size={14} color="#222" />
                <Text style={styles.editButtonText}>Edit Profile</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.settingsButton} onPress={goToSettings}>
                <Ionicons name="settings-outline" size={18} color="#222" />
              </TouchableOpacity>
            </View>
          </View>

          <Text style={styles.bio}>{profile.bio || "No bio added yet."}</Text>

          <View style={styles.infoWrap}>
            {!!profile.location && (
              <View style={styles.infoChip}>
                <Ionicons name="location-outline" size={14} color="#777" />
                <Text style={styles.infoText}>{profile.location}</Text>
              </View>
            )}

            {!!profile.address && (
              <View style={styles.infoChipWide}>
                <Ionicons name="home-outline" size={14} color="#777" />
                <Text style={styles.infoText} numberOfLines={2}>
                  {profile.address}
                </Text>
              </View>
            )}

            {!!profile.email && (
              <View style={styles.infoChip}>
                <Ionicons name="mail-outline" size={14} color="#777" />
                <Text style={styles.infoText}>{profile.email}</Text>
              </View>
            )}

            <View style={styles.infoChip}>
              <MaterialIcons name="date-range" size={14} color="#777" />
              <Text style={styles.infoText}>{profile.joined}</Text>
            </View>
          </View>

          <View style={styles.statsCard}>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{stats.portfolio}</Text>
              <Text style={styles.statLabel}>Portfolio</Text>
            </View>

            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{stats.collections}</Text>
              <Text style={styles.statLabel}>Collections</Text>
            </View>

            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{stats.followers}</Text>
              <Text style={styles.statLabel}>Followers</Text>
            </View>

            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{stats.following}</Text>
              <Text style={styles.statLabel}>Following</Text>
            </View>
          </View>
        </View>

        <View style={styles.tabWrapper}>
          {tabs.map((tab) => {
            const active = activeTab === tab;

            return (
              <TouchableOpacity
                key={tab}
                style={[styles.tabButton, active && styles.activeTabButton]}
                onPress={() => setActiveTab(tab)}
              >
                <Text style={[styles.tabText, active && styles.activeTabText]}>
                  {tab}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {activeTab === "Artworks" && renderArtworkGrid(userPosts)}
        {activeTab === "Collections" && renderCollections()}
        {activeTab === "Liked" && renderArtworkGrid(likedPosts)}

        <Modal visible={editVisible} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Edit Profile</Text>
                <TouchableOpacity
                  onPress={() => {
                    setEditVisible(false);
                    setAddressSuggestions([]);
                    setShowAddressSuggestions(false);
                  }}
                >
                  <Ionicons name="close" size={24} color="#222" />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false}>
                <TouchableOpacity
                  style={styles.imagePickerButton}
                  onPress={pickProfileImage}
                  activeOpacity={0.85}
                >
                  <Image source={{ uri: editForm.avatar || DEFAULT_AVATAR }} style={styles.modalAvatar} />
                  <Text style={styles.imagePickerText}>Change profile image</Text>
                </TouchableOpacity>

                <TextInput
                  style={styles.input}
                  placeholder="Full name"
                  value={editForm.name}
                  onChangeText={(text) =>
                    setEditForm((prev) => ({ ...prev, name: text }))
                  }
                />

                <TextInput
                  style={styles.input}
                  placeholder="Username"
                  value={editForm.username}
                  onChangeText={(text) =>
                    setEditForm((prev) => ({ ...prev, username: text }))
                  }
                />

                <TextInput
                  style={[styles.input, styles.textArea]}
                  placeholder="Bio"
                  multiline
                  value={editForm.bio}
                  onChangeText={(text) =>
                    setEditForm((prev) => ({ ...prev, bio: text }))
                  }
                />

                <TextInput
                  style={styles.input}
                  placeholder="Location"
                  value={editForm.location}
                  onChangeText={(text) =>
                    setEditForm((prev) => ({ ...prev, location: text }))
                  }
                />

                <TextInput
                  style={[styles.input, styles.textArea]}
                  placeholder="Address"
                  multiline
                  value={editForm.address}
                  onChangeText={(text) => {
                    setEditForm((prev) => ({ ...prev, address: text }));
                    setShowAddressSuggestions(true);
                  }}
                />

                {addressLoading && (
                  <Text style={styles.helperText}>Searching address...</Text>
                )}

                {showAddressSuggestions && addressSuggestions.length > 0 && (
                  <View style={styles.suggestionsBox}>
                    {addressSuggestions.map((item) => (
                      <TouchableOpacity
                        key={item.id}
                        style={styles.suggestionItem}
                        onPress={() => {
                          setEditForm((prev) => ({
                            ...prev,
                            address: item.title,
                          }));
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

                <TextInput
                  style={styles.input}
                  placeholder="Email"
                  value={editForm.email}
                  onChangeText={(text) =>
                    setEditForm((prev) => ({ ...prev, email: text }))
                  }
                />

                <TouchableOpacity
                  style={styles.saveButton}
                  onPress={saveProfile}
                  disabled={savingProfile}
                >
                  <Text style={styles.saveButtonText}>
                    {savingProfile ? "Saving..." : "Save Profile"}
                  </Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </Modal>

        <Modal visible={collectionVisible} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <View style={styles.modalCardLarge}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>New Collection</Text>
                <TouchableOpacity onPress={() => setCollectionVisible(false)}>
                  <Ionicons name="close" size={24} color="#222" />
                </TouchableOpacity>
              </View>

              <TextInput
                style={styles.input}
                placeholder="Collection name"
                value={newCollectionName}
                onChangeText={setNewCollectionName}
              />

              <Text style={styles.selectTitle}>
                Select from liked posts and saved posts
              </Text>

              <FlatList
                data={selectablePosts}
                keyExtractor={(item) => item.id}
                numColumns={2}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.selectGrid}
                renderItem={({ item }) => {
                  const selected = selectedItems.some(
                    (selectedItem) => selectedItem.id === item.id
                  );

                  return (
                    <TouchableOpacity
                      style={styles.selectCard}
                      onPress={() => toggleSelectItem(item)}
                      activeOpacity={0.85}
                    >
                      <Image source={{ uri: item.image || DEFAULT_AVATAR }} style={styles.selectImage} />
                      <View style={styles.selectFooter}>
                        <Text style={styles.selectLabel} numberOfLines={1}>
                          {item.title}
                        </Text>
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

              <TouchableOpacity style={styles.saveButton} onPress={createCollection}>
                <Text style={styles.saveButtonText}>
                  {creatingCollection ? "Creating..." : "Create Collection"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </ScrollView>
    </SafeAreaView>
  );
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
  safeArea: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  scrollContent: {
    paddingBottom: 28,
  },
  loaderScreen: {
    flex: 1,
    backgroundColor: "#ffffff",
    justifyContent: "center",
    alignItems: "center",
  },
  loaderText: {
    marginTop: 12,
    fontSize: 14,
    color: "#666",
  },
  header: {
    alignItems: "center",
    paddingTop: 10,
    paddingBottom: 10,
  },
  logo: {
    fontSize: 28,
    fontWeight: "800",
    color: "#f06ce9",
  },
  heroCard: {
    marginHorizontal: 14,
    backgroundColor: "#ffffff",
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: "#ededf3",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
    marginBottom: 14,
  },
  avatar: {
    width: 98,
    height: 98,
    borderRadius: 49,
    marginBottom: 14,
    backgroundColor: "#f2f2f2",
  },
  heroTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
    gap: 10,
  },
  nameWrap: {
    flex: 1,
  },
  actionButtonsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  name: {
    fontSize: 28,
    fontWeight: "800",
    color: "#171717",
  },
  username: {
    fontSize: 14,
    color: "#8d8d96",
    marginTop: 4,
  },
  editButton: {
    height: 38,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#dddddd",
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    backgroundColor: "#fafafa",
  },
  editButtonText: {
    marginLeft: 6,
    fontSize: 14,
    fontWeight: "600",
    color: "#222",
  },
  settingsButton: {
    width: 38,
    height: 38,
    borderWidth: 1,
    borderColor: "#dddddd",
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fafafa",
  },
  bio: {
    fontSize: 15,
    lineHeight: 23,
    color: "#333",
    marginTop: 6,
    marginBottom: 14,
  },
  infoWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  infoChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f5f6fa",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 18,
    maxWidth: "100%",
  },
  infoChipWide: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#f5f6fa",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 18,
    width: "100%",
  },
  infoText: {
    marginLeft: 5,
    fontSize: 13,
    color: "#6d6d75",
    flexShrink: 1,
  },
  statsCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: "#faf7ff",
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 10,
  },
  statItem: {
    flex: 1,
    alignItems: "center",
  },
  statNumber: {
    fontSize: 18,
    fontWeight: "800",
    color: "#1f1f1f",
  },
  statLabel: {
    fontSize: 12,
    color: "#888",
    marginTop: 4,
  },
  tabWrapper: {
    flexDirection: "row",
    marginHorizontal: 14,
    backgroundColor: "#f2f2f2",
    borderRadius: 18,
    padding: 4,
    marginBottom: 14,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 11,
    alignItems: "center",
    borderRadius: 14,
  },
  activeTabButton: {
    backgroundColor: "#ffffff",
  },
  tabText: {
    fontSize: 13,
    color: "#8f8f8f",
    fontWeight: "600",
  },
  activeTabText: {
    color: "#333",
  },
  gallery: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    paddingHorizontal: 14,
  },
  galleryCard: {
    width: "48.5%",
    height: 210,
    borderRadius: 14,
    overflow: "hidden",
    marginBottom: 12,
    backgroundColor: "#f3f3f3",
  },
  galleryImage: {
    width: "100%",
    height: "100%",
  },
  galleryOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: "rgba(0,0,0,0.28)",
  },
  galleryTitle: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
  },
  collectionsSection: {
    paddingHorizontal: 14,
  },
  addCollectionButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#171717",
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
  },
  addCollectionIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#f06ce9",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  addCollectionTextWrap: {
    flex: 1,
  },
  addCollectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#ffffff",
  },
  addCollectionSubtitle: {
    fontSize: 12,
    color: "#d6d6db",
    marginTop: 4,
    lineHeight: 18,
  },
  collectionCard: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#ececf2",
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  collectionHeader: {
    marginBottom: 12,
  },
  collectionName: {
    fontSize: 18,
    fontWeight: "800",
    color: "#1f1f1f",
  },
  collectionCount: {
    marginTop: 4,
    fontSize: 13,
    color: "#8b8b94",
  },
  collectionPreviewRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  collectionPreviewImage: {
    width: "32%",
    height: 95,
    borderRadius: 12,
    backgroundColor: "#f2f2f2",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.32)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 24,
    maxHeight: "88%",
  },
  modalCardLarge: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 24,
    height: "84%",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#1f1f1f",
  },
  imagePickerButton: {
    alignItems: "center",
    marginBottom: 16,
  },
  modalAvatar: {
    width: 92,
    height: 92,
    borderRadius: 46,
    marginBottom: 10,
    backgroundColor: "#f2f2f2",
  },
  imagePickerText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#4a63ff",
  },
  input: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: "#e3e3ea",
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 14,
    color: "#222",
    marginBottom: 12,
    backgroundColor: "#fafafa",
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: "top",
    paddingTop: 14,
    paddingBottom: 14,
  },
  helperText: {
    fontSize: 12,
    color: "#6d6d75",
    marginTop: -4,
    marginBottom: 10,
  },
  suggestionsBox: {
    borderWidth: 1,
    borderColor: "#e3e3ea",
    backgroundColor: "#ffffff",
    borderRadius: 12,
    marginTop: -4,
    marginBottom: 12,
    overflow: "hidden",
  },
  suggestionItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f1f4",
  },
  suggestionText: {
    flex: 1,
    marginLeft: 8,
    fontSize: 13,
    color: "#222",
    lineHeight: 18,
  },
  saveButton: {
    height: 50,
    borderRadius: 14,
    backgroundColor: "#f06ce9",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
  },
  saveButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#ffffff",
  },
  selectTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#333",
    marginBottom: 12,
  },
  selectGrid: {
    paddingBottom: 12,
  },
  selectCard: {
    width: "48.5%",
    marginBottom: 12,
    marginRight: "1.5%",
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "#f4f4f6",
    position: "relative",
  },
  selectImage: {
    width: "100%",
    height: 145,
    backgroundColor: "#f2f2f2",
  },
  selectFooter: {
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  selectLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#222",
  },
  selectedBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#4a63ff",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyWrap: {
    marginHorizontal: 14,
    backgroundColor: "#fafafa",
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#222",
  },
  emptyText: {
    fontSize: 13,
    color: "#888",
    marginTop: 6,
    textAlign: "center",
  },
});
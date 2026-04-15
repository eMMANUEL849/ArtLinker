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
  Alert,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { auth, db, storage } from "../../config/firebase";

function getReviewDate(value) {
  try {
    if (!value) return "";
    if (value?.toDate) return value.toDate().toLocaleDateString();
    if (value?.seconds) return new Date(value.seconds * 1000).toLocaleDateString();
    return new Date(value).toLocaleDateString();
  } catch {
    return "";
  }
}

function getPostDate(value) {
  try {
    if (!value) return "";
    if (value?.toDate) return value.toDate().toLocaleDateString();
    if (value?.seconds) return new Date(value.seconds * 1000).toLocaleDateString();
    return new Date(value).toLocaleDateString();
  } catch {
    return "";
  }
}

function getAddressFromProfileData(data = {}) {
  return (
    data.businessAddress ||
    data.providerAddress ||
    data.address ||
    data.deliveryAddress ||
    data.fullAddress ||
    data.location?.address ||
    data.shopLocation?.address ||
    (typeof data.location === "string" ? data.location : "") ||
    ""
  );
}

function getCoordsFromProfileData(data = {}) {
  const lat =
    data.providerLat ??
    data.shopLat ??
    data.latitude ??
    data.lat ??
    data.location?.lat ??
    data.location?.latitude ??
    data.shopLocation?.lat ??
    data.shopLocation?.latitude ??
    data.coordinates?.lat ??
    data.coordinates?.latitude ??
    data.providerCoordinates?.lat ??
    data.providerCoordinates?.latitude ??
    data.deliveryCoordinates?.lat ??
    data.deliveryCoordinates?.latitude ??
    null;

  const lng =
    data.providerLng ??
    data.providerLon ??
    data.providerLong ??
    data.shopLng ??
    data.shopLon ??
    data.shopLong ??
    data.longitude ??
    data.lng ??
    data.lon ??
    data.long ??
    data.location?.lng ??
    data.location?.longitude ??
    data.shopLocation?.lng ??
    data.shopLocation?.longitude ??
    data.coordinates?.lng ??
    data.coordinates?.longitude ??
    data.providerCoordinates?.lng ??
    data.providerCoordinates?.longitude ??
    data.deliveryCoordinates?.lng ??
    data.deliveryCoordinates?.longitude ??
    null;

  if (typeof lat !== "number" || typeof lng !== "number") return null;
  return { lat, lng };
}

function buildPopularProductFromProducts(products = []) {
  if (!products.length) return null;

  const sorted = [...products].sort((a, b) => {
    const aSold = Number(a.soldCount ?? a.orders ?? a.purchases ?? 0);
    const bSold = Number(b.soldCount ?? b.orders ?? b.purchases ?? 0);
    return bSold - aSold;
  });

  const top = sorted[0];
  return {
    title: top.title || top.name || "Untitled Product",
    quantity: Number(top.soldCount ?? top.orders ?? top.purchases ?? 0),
  };
}

export default function ServiceProviderProfileScreen() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [editVisible, setEditVisible] = useState(false);

  const [postModalVisible, setPostModalVisible] = useState(false);
  const [postingArtwork, setPostingArtwork] = useState(false);
  const [postCaption, setPostCaption] = useState("");
  const [postImageUri, setPostImageUri] = useState("");

  const [profile, setProfile] = useState({
    fullName: "",
    businessName: "",
    role: "Service Provider",
    bio: "",
    avatarUrl: "",
    email: "",
    phone: "",
    businessAddress: "",
    services: [],
    isVerified: false,
    coords: null,
  });

  const [products, setProducts] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [posts, setPosts] = useState([]);

  const [editFullName, setEditFullName] = useState("");
  const [editBusinessName, setEditBusinessName] = useState("");
  const [editBio, setEditBio] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editBusinessAddress, setEditBusinessAddress] = useState("");
  const [editServices, setEditServices] = useState("");

  useEffect(() => {
    if (!auth.currentUser) {
      setLoading(false);
      return;
    }

    let profileReady = false;
    let productsReady = false;
    let reviewsReady = false;
    let postsReady = false;

    const finish = () => {
      if (profileReady && productsReady && reviewsReady && postsReady) {
        setLoading(false);
      }
    };

    const currentUid = auth.currentUser.uid;
    const userRef = doc(db, "users", currentUid);

    const unsubProfile = onSnapshot(
      userRef,
      async (docSnap) => {
        let data = {};

        if (docSnap.exists()) {
          data = docSnap.data();
        } else {
          const starter = {
            fullName: auth.currentUser.displayName || "Service Provider",
            businessName: "",
            role: "Service Provider",
            bio: "Tell customers about your services and creative expertise.",
            avatarUrl: auth.currentUser.photoURL || "",
            email: auth.currentUser.email || "",
            phone: "",
            businessAddress: "",
            address: "",
            providerAddress: "",
            services: [],
            isVerified: false,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };

          await setDoc(userRef, starter, { merge: true });
          data = starter;
        }

        const resolvedAddress = getAddressFromProfileData(data);
        const resolvedCoords = getCoordsFromProfileData(data);

        const safeProfile = {
          fullName: data.fullName || auth.currentUser.displayName || "Service Provider",
          businessName: data.businessName || "",
          role: data.role || "Service Provider",
          bio: data.bio || "Tell customers about your services and creative expertise.",
          avatarUrl: data.avatarUrl || auth.currentUser.photoURL || "",
          email: data.email || auth.currentUser.email || "",
          phone: data.phone || "",
          businessAddress: resolvedAddress,
          services: Array.isArray(data.services) ? data.services : [],
          isVerified: !!data.isVerified,
          coords: resolvedCoords,
        };

        setProfile(safeProfile);
        setEditFullName(safeProfile.fullName);
        setEditBusinessName(safeProfile.businessName);
        setEditBio(safeProfile.bio);
        setEditPhone(safeProfile.phone);
        setEditBusinessAddress(safeProfile.businessAddress);
        setEditServices(safeProfile.services.join(", "));

        profileReady = true;
        finish();
      },
      (error) => {
        console.log("Profile load error:", error);
        profileReady = true;
        finish();
        Alert.alert("Error", "Failed to load profile.");
      }
    );

    const productsQuery = query(
      collection(db, "shops"),
      where("providerId", "==", currentUid)
    );

    const unsubProducts = onSnapshot(
      productsQuery,
      (snapshot) => {
        setProducts(
          snapshot.docs.map((d) => ({
            id: d.id,
            ...d.data(),
          }))
        );
        productsReady = true;
        finish();
      },
      (error) => {
        console.log("Products load error:", error);
        productsReady = true;
        finish();
      }
    );

    const reviewsQuery = query(
      collection(db, "reviews"),
      where("providerId", "==", currentUid)
    );

    const unsubReviews = onSnapshot(
      reviewsQuery,
      (snapshot) => {
        const items = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));

        items.sort((a, b) => {
          const aTime = a.createdAt?.seconds || 0;
          const bTime = b.createdAt?.seconds || 0;
          return bTime - aTime;
        });

        setReviews(items);
        reviewsReady = true;
        finish();
      },
      (error) => {
        console.log("Reviews load error:", error);
        reviewsReady = true;
        finish();
      }
    );

    const postsQuery = query(
      collection(db, "posts"),
      where("providerId", "==", currentUid)
    );

    const unsubPosts = onSnapshot(
      postsQuery,
      (snapshot) => {
        const items = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));

        items.sort((a, b) => {
          const aTime = a.createdAt?.seconds || 0;
          const bTime = b.createdAt?.seconds || 0;
          return bTime - aTime;
        });

        setPosts(items);
        postsReady = true;
        finish();
      },
      (error) => {
        console.log("Posts load error:", error);
        postsReady = true;
        finish();
      }
    );

    return () => {
      unsubProfile();
      unsubProducts();
      unsubReviews();
      unsubPosts();
    };
  }, []);

  const stats = useMemo(() => {
    const productsCount = products.length;

    const averageRating =
      reviews.length > 0
        ? reviews.reduce((sum, item) => sum + Number(item.rating || 0), 0) / reviews.length
        : 0;

    return {
      productsCount,
      averageRating,
      reviewsCount: reviews.length,
      postsCount: posts.length,
    };
  }, [products, reviews, posts]);

  const pickProfileImage = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        Alert.alert("Permission needed", "Please allow access to your media library.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.9,
      });

      if (result.canceled || !result.assets?.length) {
        return;
      }

      const imageUri = result.assets[0].uri;

      setUploadingImage(true);

      const response = await fetch(imageUri);
      const blob = await response.blob();

      const extension = imageUri.split(".").pop()?.toLowerCase() || "jpg";
      const fileName = `profile_images/${auth.currentUser.uid}/avatar_${Date.now()}.${extension}`;

      const storageRef = ref(storage, fileName);
      await uploadBytes(storageRef, blob);

      const downloadURL = await getDownloadURL(storageRef);

      await updateDoc(doc(db, "users", auth.currentUser.uid), {
        avatarUrl: downloadURL,
        updatedAt: serverTimestamp(),
      });

      Alert.alert("Success", "Profile image updated.");
    } catch (error) {
      console.log("Profile image upload error:", error);
      Alert.alert("Error", "Failed to upload profile image.");
    } finally {
      setUploadingImage(false);
    }
  };

  const pickArtworkImage = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        Alert.alert("Permission needed", "Please allow access to your media library.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.9,
      });

      if (result.canceled || !result.assets?.length) return;

      setPostImageUri(result.assets[0].uri);
    } catch (error) {
      console.log("Pick artwork image error:", error);
      Alert.alert("Error", "Failed to pick artwork image.");
    }
  };

  const createArtworkPost = async () => {
    try {
      if (!auth.currentUser?.uid) {
        Alert.alert("Error", "You must be logged in.");
        return;
      }

      if (!postImageUri) {
        Alert.alert("Missing image", "Please choose an artwork image.");
        return;
      }

      setPostingArtwork(true);

      const response = await fetch(postImageUri);
      const blob = await response.blob();

      const extension = postImageUri.split(".").pop()?.toLowerCase() || "jpg";
      const fileName = `posts/${auth.currentUser.uid}/artwork_${Date.now()}.${extension}`;
      const storageRef = ref(storage, fileName);

      await uploadBytes(storageRef, blob);
      const imageUrl = await getDownloadURL(storageRef);

      await addDoc(collection(db, "posts"), {
        providerId: auth.currentUser.uid,
        userId: auth.currentUser.uid,
        providerName: profile.businessName || profile.fullName || "Service Provider",
        userName: profile.businessName || profile.fullName || "Service Provider",
        providerAvatar: profile.avatarUrl || "",
        userAvatar: profile.avatarUrl || "",
        imageUrl,
        caption: postCaption.trim(),
        type: "artwork",
        likesCount: 0,
        commentsCount: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setPostCaption("");
      setPostImageUri("");
      setPostModalVisible(false);

      Alert.alert("Success", "Artwork posted successfully.");
    } catch (error) {
      console.log("Create artwork post error:", error);
      Alert.alert("Error", "Failed to create artwork post.");
    } finally {
      setPostingArtwork(false);
    }
  };

  const saveProfile = async () => {
    try {
      if (!editFullName.trim()) {
        Alert.alert("Missing field", "Please enter your name.");
        return;
      }

      setSaving(true);

      const parsedServices = editServices
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);

      const trimmedAddress = editBusinessAddress.trim();

      let coords = null;
      let geocodeWorked = false;
      let geocodePermissionDenied = false;

      if (trimmedAddress) {
        try {
          const { status } = await Location.requestForegroundPermissionsAsync();

          if (status === "granted") {
            const result = await Location.geocodeAsync(trimmedAddress);
            if (result?.length) {
              coords = {
                lat: result[0].latitude,
                lng: result[0].longitude,
              };
              geocodeWorked = true;
            }
          } else {
            geocodePermissionDenied = true;
          }
        } catch (error) {
          console.log("Provider address geocode error:", error);
        }
      }

      const payload = {
        fullName: editFullName.trim(),
        businessName: editBusinessName.trim(),
        bio: editBio.trim(),
        phone: editPhone.trim(),
        businessAddress: trimmedAddress,
        address: trimmedAddress,
        providerAddress: trimmedAddress,
        email: auth.currentUser.email || profile.email || "",
        role: "Service Provider",
        services: parsedServices,
        updatedAt: serverTimestamp(),
      };

      if (coords) {
        payload.providerLat = coords.lat;
        payload.providerLng = coords.lng;
        payload.lat = coords.lat;
        payload.lng = coords.lng;
        payload.latitude = coords.lat;
        payload.longitude = coords.lng;
        payload.providerCoordinates = coords;
        payload.coordinates = coords;
        payload.location = {
          address: trimmedAddress,
          lat: coords.lat,
          lng: coords.lng,
        };
      } else {
        payload.location = {
          address: trimmedAddress,
        };
      }

      await setDoc(doc(db, "users", auth.currentUser.uid), payload, { merge: true });

      setEditVisible(false);

      if (trimmedAddress && geocodeWorked) {
        Alert.alert("Success", "Profile and business address updated successfully.");
      } else if (trimmedAddress && geocodePermissionDenied) {
        Alert.alert(
          "Saved",
          "Profile was updated, but location permission was denied, so coordinates were not saved."
        );
      } else if (trimmedAddress && !geocodeWorked) {
        Alert.alert(
          "Saved",
          "Profile was updated, but the address could not be converted into coordinates."
        );
      } else {
        Alert.alert("Success", "Profile updated successfully.");
      }
    } catch (error) {
      console.log("Save profile error:", error);
      Alert.alert("Error", "Failed to update profile.");
    } finally {
      setSaving(false);
    }
  };

  const popularProduct = useMemo(() => {
    return buildPopularProductFromProducts(products);
  }, [products]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color="#4a63ff" />
          <Text style={styles.loadingText}>Loading profile...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const displayName = profile.businessName || profile.fullName || "Service Provider";

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.headerCard}>
          <View style={styles.topIconRow}>
            <TouchableOpacity
              style={styles.iconButton}
              onPress={() => setPostModalVisible(true)}
              activeOpacity={0.85}
            >
              <Ionicons name="images-outline" size={20} color="#111827" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.iconButton}
              onPress={() => router.push("/service_provider/settings")}
              activeOpacity={0.85}
            >
              <Ionicons name="settings-outline" size={20} color="#111827" />
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.avatarWrap} onPress={pickProfileImage} activeOpacity={0.85}>
            <Image
              source={{
                uri: profile.avatarUrl || "https://via.placeholder.com/300x300.png?text=Profile",
              }}
              style={styles.avatar}
            />

            <View style={styles.cameraBadge}>
              {uploadingImage ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="camera-outline" size={16} color="#fff" />
              )}
            </View>
          </TouchableOpacity>

          <View style={styles.nameRow}>
            <Text style={styles.name}>{displayName}</Text>
            {profile.isVerified && (
              <Ionicons name="checkmark-circle" size={20} color="#2563eb" />
            )}
          </View>

          <Text style={styles.role}>{profile.role || "Service Provider"}</Text>

          {!!profile.businessAddress && (
            <View style={styles.infoRow}>
              <Ionicons name="location-outline" size={14} color="#6b7280" />
              <Text style={styles.infoText}>{profile.businessAddress}</Text>
            </View>
          )}

          {!!profile.email && (
            <View style={styles.infoRow}>
              <Ionicons name="mail-outline" size={14} color="#6b7280" />
              <Text style={styles.infoText}>{profile.email}</Text>
            </View>
          )}

          {!!profile.phone && (
            <View style={styles.infoRow}>
              <Ionicons name="call-outline" size={14} color="#6b7280" />
              <Text style={styles.infoText}>{profile.phone}</Text>
            </View>
          )}

          <Text style={styles.bio}>
            {profile.bio || "Tell customers about your services and creative expertise."}
          </Text>

          {!!profile.coords && (
            <Text style={styles.coordText}>
              Coordinates saved for delivery calculations
            </Text>
          )}

          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.primaryButton} onPress={() => setEditVisible(true)}>
              <Ionicons name="create-outline" size={16} color="#fff" />
              <Text style={styles.primaryButtonText}>Edit Profile</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => setPostModalVisible(true)}
            >
              <Ionicons name="add-circle-outline" size={16} color="#111827" />
              <Text style={styles.secondaryButtonText}>Post Artwork</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{stats.productsCount}</Text>
            <Text style={styles.statLabel}>Products</Text>
          </View>

          <View style={styles.statCard}>
            <Text style={styles.statValue}>
              {stats.averageRating > 0 ? stats.averageRating.toFixed(1) : "0.0"}
            </Text>
            <Text style={styles.statLabel}>Rating</Text>
          </View>

          <View style={styles.statCard}>
            <Text style={styles.statValue}>{stats.reviewsCount}</Text>
            <Text style={styles.statLabel}>Reviews</Text>
          </View>

          <View style={styles.statCard}>
            <Text style={styles.statValue}>{stats.postsCount}</Text>
            <Text style={styles.statLabel}>Posts</Text>
          </View>
        </View>

        <View style={styles.quickGrid}>
          <TouchableOpacity style={styles.quickCard} onPress={() => router.push("/service_provider/myshop")}>
            <Ionicons name="storefront-outline" size={22} color="#4a63ff" />
            <Text style={styles.quickText}>My Shop</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.quickCard} onPress={() => router.push("/service_provider/jobs")}>
            <Ionicons name="briefcase-outline" size={22} color="#4a63ff" />
            <Text style={styles.quickText}>Jobs</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.quickCard} onPress={() => router.push("/service_provider/upload")}>
            <Ionicons name="cloud-upload-outline" size={22} color="#4a63ff" />
            <Text style={styles.quickText}>Upload</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.quickCard} onPress={() => setPostModalVisible(true)}>
            <Ionicons name="image-outline" size={22} color="#4a63ff" />
            <Text style={styles.quickText}>Add Artwork</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Services & Skills</Text>
          <View style={styles.tagsRow}>
            {(profile.services?.length ? profile.services : ["Illustration", "Custom Design"]).map((tag) => (
              <View key={tag} style={styles.tag}>
                <Text style={styles.tagText}>{tag}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Business Overview</Text>
          <View style={styles.overviewCard}>
            <View style={styles.overviewRow}>
              <Text style={styles.overviewLabel}>Popular Product</Text>
              <Text style={styles.overviewValue}>
                {popularProduct
                  ? `${popularProduct.title}${popularProduct.quantity > 0 ? ` (${popularProduct.quantity})` : ""}`
                  : "No data yet"}
              </Text>
            </View>
            <View style={styles.overviewRow}>
              <Text style={styles.overviewLabel}>Verification</Text>
              <Text style={styles.overviewValue}>
                {profile.isVerified ? "Verified" : "Not Verified"}
              </Text>
            </View>
            <View style={styles.overviewRow}>
              <Text style={styles.overviewLabel}>Address Saved</Text>
              <Text style={styles.overviewValue}>
                {profile.businessAddress ? "Yes" : "No"}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionRow}>
            <Text style={styles.sectionTitle}>My Artwork Posts</Text>
            <TouchableOpacity onPress={() => setPostModalVisible(true)}>
              <Text style={styles.linkText}>Create Post</Text>
            </TouchableOpacity>
          </View>

          {posts.length === 0 ? (
            <View style={styles.reviewEmptyCard}>
              <Text style={styles.reviewEmptyText}>No artwork posts yet.</Text>
            </View>
          ) : (
            posts.map((post) => (
              <View key={post.id} style={styles.postCard}>
                <Image
                  source={{
                    uri: post.imageUrl || "https://via.placeholder.com/500x500.png?text=Artwork",
                  }}
                  style={styles.postImage}
                />

                <View style={styles.postContent}>
                  <View style={styles.postMetaRow}>
                    <Text style={styles.postName}>
                      {post.providerName || post.userName || displayName}
                    </Text>
                    <Text style={styles.postDate}>{getPostDate(post.createdAt)}</Text>
                  </View>

                  <Text style={styles.postCaption}>
                    {post.caption || "No caption added."}
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Ratings & Reviews</Text>

          {reviews.length === 0 ? (
            <View style={styles.reviewEmptyCard}>
              <Text style={styles.reviewEmptyText}>No reviews yet.</Text>
            </View>
          ) : (
            reviews.map((review) => (
              <View key={review.id} style={styles.reviewCard}>
                <View style={styles.reviewTopRow}>
                  <Text style={styles.reviewName}>
                    {review.userName || "Customer"}
                  </Text>
                  <Text style={styles.reviewDate}>
                    {getReviewDate(review.createdAt)}
                  </Text>
                </View>

                <View style={styles.reviewStars}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Ionicons
                      key={star}
                      name={star <= Number(review.rating || 0) ? "star" : "star-outline"}
                      size={15}
                      color="#f59e0b"
                    />
                  ))}
                </View>

                <Text style={styles.reviewText}>
                  {review.comment || "No comment provided."}
                </Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      <Modal visible={editVisible} transparent animationType="slide" onRequestClose={() => setEditVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalTopRow}>
              <Text style={styles.modalTitle}>Edit Profile</Text>
              <TouchableOpacity onPress={() => setEditVisible(false)}>
                <Ionicons name="close" size={22} color="#111827" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.inputLabel}>Full Name</Text>
              <TextInput
                style={styles.input}
                value={editFullName}
                onChangeText={setEditFullName}
                placeholder="Enter your name"
              />

              <Text style={styles.inputLabel}>Business Name</Text>
              <TextInput
                style={styles.input}
                value={editBusinessName}
                onChangeText={setEditBusinessName}
                placeholder="Enter business name"
              />

              <Text style={styles.inputLabel}>Bio</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={editBio}
                onChangeText={setEditBio}
                placeholder="Tell people about your services"
                multiline
              />

              <Text style={styles.inputLabel}>Phone</Text>
              <TextInput
                style={styles.input}
                value={editPhone}
                onChangeText={setEditPhone}
                placeholder="Enter phone number"
              />

              <Text style={styles.inputLabel}>Business Address</Text>
              <TextInput
                style={[styles.input, styles.textAreaSmall]}
                value={editBusinessAddress}
                onChangeText={setEditBusinessAddress}
                placeholder="Enter full business address"
                multiline
              />
              <Text style={styles.helperText}>
                This address is used for delivery distance calculations.
              </Text>

              <Text style={styles.inputLabel}>Services</Text>
              <TextInput
                style={styles.input}
                value={editServices}
                onChangeText={setEditServices}
                placeholder="Illustration, Portrait Art, Logo Design"
              />

              <TouchableOpacity
                style={[styles.saveButton, saving && styles.disabledButton]}
                onPress={saveProfile}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="save-outline" size={18} color="#fff" />
                    <Text style={styles.saveButtonText}>Save Changes</Text>
                  </>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={postModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setPostModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalTopRow}>
              <Text style={styles.modalTitle}>Create Artwork Post</Text>
              <TouchableOpacity
                onPress={() => {
                  setPostModalVisible(false);
                  setPostCaption("");
                  setPostImageUri("");
                }}
              >
                <Ionicons name="close" size={22} color="#111827" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.inputLabel}>Artwork Image</Text>

              <TouchableOpacity style={styles.imagePickerBox} onPress={pickArtworkImage} activeOpacity={0.85}>
                {postImageUri ? (
                  <Image source={{ uri: postImageUri }} style={styles.previewImage} />
                ) : (
                  <View style={styles.imagePickerPlaceholder}>
                    <Ionicons name="image-outline" size={34} color="#6b7280" />
                    <Text style={styles.imagePickerText}>Tap to choose artwork image</Text>
                  </View>
                )}
              </TouchableOpacity>

              <Text style={styles.inputLabel}>Caption</Text>
              <TextInput
                style={[styles.input, styles.textAreaSmall]}
                value={postCaption}
                onChangeText={setPostCaption}
                placeholder="Write something about this artwork"
                multiline
              />

              <TouchableOpacity
                style={[styles.saveButton, postingArtwork && styles.disabledButton]}
                onPress={createArtworkPost}
                disabled={postingArtwork}
              >
                {postingArtwork ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="send-outline" size={18} color="#fff" />
                    <Text style={styles.saveButtonText}>Post Artwork</Text>
                  </>
                )}
              </TouchableOpacity>
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
    backgroundColor: "#f7f8fc",
  },
  scrollContent: {
    padding: 14,
    paddingBottom: 28,
  },
  centerBox: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 10,
    color: "#6b7280",
  },
  headerCard: {
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 18,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
    position: "relative",
  },
  topIconRow: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginBottom: 8,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#f3f4f6",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarWrap: {
    position: "relative",
  },
  avatar: {
    width: 116,
    height: 116,
    borderRadius: 58,
    backgroundColor: "#eef1f7",
  },
  cameraBadge: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#4a63ff",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 3,
    borderColor: "#fff",
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 14,
  },
  name: {
    fontSize: 23,
    fontWeight: "900",
    color: "#111827",
    textAlign: "center",
  },
  role: {
    marginTop: 4,
    fontSize: 13,
    color: "#4a63ff",
    fontWeight: "700",
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
    gap: 6,
  },
  infoText: {
    color: "#6b7280",
    fontSize: 12,
    flex: 1,
    textAlign: "center",
  },
  bio: {
    marginTop: 12,
    fontSize: 13,
    color: "#6b7280",
    textAlign: "center",
    lineHeight: 19,
  },
  coordText: {
    marginTop: 8,
    fontSize: 12,
    color: "#059669",
    fontWeight: "700",
    textAlign: "center",
  },
  actionRow: {
    flexDirection: "row",
    marginTop: 16,
    gap: 10,
  },
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#4a63ff",
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 14,
  },
  primaryButtonText: {
    color: "#fff",
    fontWeight: "800",
  },
  secondaryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#eef1f7",
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 14,
  },
  secondaryButtonText: {
    color: "#111827",
    fontWeight: "800",
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginTop: 16,
  },
  statCard: {
    width: "48%",
    backgroundColor: "#fff",
    borderRadius: 20,
    paddingVertical: 18,
    paddingHorizontal: 14,
    alignItems: "center",
    marginBottom: 12,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  statValue: {
    fontSize: 20,
    fontWeight: "900",
    color: "#111827",
  },
  statLabel: {
    marginTop: 5,
    fontSize: 12,
    color: "#6b7280",
    fontWeight: "700",
  },
  quickGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginTop: 4,
  },
  quickCard: {
    width: "48%",
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 16,
    alignItems: "center",
    marginTop: 12,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  quickText: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: "800",
    color: "#111827",
  },
  section: {
    marginTop: 16,
  },
  sectionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 10,
  },
  linkText: {
    color: "#4a63ff",
    fontWeight: "800",
    fontSize: 13,
  },
  tagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  tag: {
    backgroundColor: "#eef1ff",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
    marginRight: 8,
    marginBottom: 8,
  },
  tagText: {
    color: "#4a63ff",
    fontSize: 12,
    fontWeight: "700",
  },
  overviewCard: {
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 14,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  overviewRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
    gap: 12,
  },
  overviewLabel: {
    fontSize: 13,
    color: "#6b7280",
    fontWeight: "700",
  },
  overviewValue: {
    flex: 1,
    textAlign: "right",
    fontSize: 13,
    color: "#111827",
    fontWeight: "800",
  },
  postCard: {
    backgroundColor: "#fff",
    borderRadius: 18,
    marginBottom: 12,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  postImage: {
    width: "100%",
    height: 260,
    backgroundColor: "#eef1f7",
  },
  postContent: {
    padding: 14,
  },
  postMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  postName: {
    fontSize: 14,
    fontWeight: "800",
    color: "#111827",
  },
  postDate: {
    fontSize: 11,
    color: "#9ca3af",
  },
  postCaption: {
    marginTop: 8,
    fontSize: 13,
    color: "#6b7280",
    lineHeight: 18,
  },
  reviewEmptyCard: {
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 16,
  },
  reviewEmptyText: {
    color: "#8b909c",
    fontSize: 13,
  },
  reviewCard: {
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 14,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  reviewTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  reviewName: {
    fontSize: 14,
    fontWeight: "800",
    color: "#111827",
  },
  reviewDate: {
    fontSize: 11,
    color: "#9ca3af",
  },
  reviewStars: {
    flexDirection: "row",
    marginTop: 8,
    gap: 2,
  },
  reviewText: {
    marginTop: 8,
    fontSize: 13,
    color: "#6b7280",
    lineHeight: 18,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(17,24,39,0.35)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 18,
    maxHeight: "88%",
  },
  modalTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: "#111827",
  },
  inputLabel: {
    marginTop: 12,
    marginBottom: 8,
    fontSize: 13,
    fontWeight: "700",
    color: "#374151",
  },
  input: {
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: "#111827",
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: "top",
  },
  textAreaSmall: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  helperText: {
    marginTop: 8,
    fontSize: 12,
    lineHeight: 18,
    color: "#6b7280",
  },
  imagePickerBox: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#f9fafb",
  },
  imagePickerPlaceholder: {
    height: 220,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  imagePickerText: {
    marginTop: 10,
    color: "#6b7280",
    fontSize: 13,
    textAlign: "center",
  },
  previewImage: {
    width: "100%",
    height: 260,
    backgroundColor: "#eef1f7",
  },
  saveButton: {
    marginTop: 18,
    backgroundColor: "#111827",
    borderRadius: 16,
    paddingVertical: 14,
    justifyContent: "center",
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  saveButtonText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 15,
  },
  disabledButton: {
    opacity: 0.65,
  },
});
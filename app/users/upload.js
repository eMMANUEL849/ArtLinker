import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  Modal,
  Alert,
  StatusBar,
  ActivityIndicator,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as ImagePicker from "expo-image-picker";
import {
  addDoc,
  collection,
  serverTimestamp,
  doc,
  getDoc,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { auth, db, storage } from "../../config/firebase";

export default function UploadScreen() {
  const categories = [
    "Digital Art",
    "Illustration",
    "Photography",
    "Painting",
    "3D Art",
    "Animation",
  ];

  const visibilityOptions = ["Public", "Followers Only", "Private"];

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Digital Art");
  const [tags, setTags] = useState("");
  const [yearCreated, setYearCreated] = useState("");
  const [materials, setMaterials] = useState("");
  const [location, setLocation] = useState("");
  const [story, setStory] = useState("");
  const [visibility, setVisibility] = useState("Public");
  const [allowComments, setAllowComments] = useState(true);
  const [allowDownloads, setAllowDownloads] = useState(false);

  const [selectedImage, setSelectedImage] = useState(null);
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [imageWidth, setImageWidth] = useState("");
  const [imageHeight, setImageHeight] = useState("");

  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [showVisibilityPicker, setShowVisibilityPicker] = useState(false);
  const [successBanner, setSuccessBanner] = useState("");
  const [loading, setLoading] = useState(false);
  const [profileLoading, setProfileLoading] = useState(true);

  const [profile, setProfile] = useState({
    name: "Artist",
    username: "@artist",
    avatar: "https://via.placeholder.com/300",
    email: "",
  });

  const completion = useMemo(() => {
    let score = 0;
    if (selectedImage) score += 20;
    if (title.trim()) score += 15;
    if (description.trim()) score += 15;
    if (category.trim()) score += 10;
    if (tags.trim()) score += 10;
    if (story.trim()) score += 10;
    if (materials.trim()) score += 10;
    if (yearCreated.trim()) score += 5;
    if (location.trim()) score += 5;
    return score;
  }, [
    selectedImage,
    title,
    description,
    category,
    tags,
    story,
    materials,
    yearCreated,
    location,
  ]);

  useEffect(() => {
    loadUserProfile();
  }, []);

  const loadUserProfile = async () => {
    try {
      const user = auth.currentUser;

      if (!user) {
        setProfileLoading(false);
        return;
      }

      const userRef = doc(db, "users", user.uid);
      const snapshot = await getDoc(userRef);

      if (snapshot.exists()) {
        const data = snapshot.data();

        setProfile({
          name: data.name || data.displayName || "Artist",
          username: data.username
            ? `@${String(data.username).replace("@", "")}`
            : "@artist",
          avatar:
            data.avatar ||
            data.photoURL ||
            user.photoURL ||
            "https://via.placeholder.com/300",
          email: data.email || user.email || "",
        });
      } else {
        setProfile({
          name: user.displayName || "Artist",
          username: "@artist",
          avatar: user.photoURL || "https://via.placeholder.com/300",
          email: user.email || "",
        });
      }
    } catch (error) {
      console.log("LOAD PROFILE ERROR:", error);
    } finally {
      setProfileLoading(false);
    }
  };

  const requestMediaPermission = async () => {
    const permissionResult =
      await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permissionResult.granted) {
      Alert.alert(
        "Permission needed",
        "Please allow access to your gallery to upload artwork."
      );
      return false;
    }

    return true;
  };

  const pickArtworkImage = async () => {
    const hasPermission = await requestMediaPermission();
    if (!hasPermission) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      quality: 1,
      aspect: [4, 5],
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      const asset = result.assets[0];
      setSelectedImage(asset.uri);
      setImageWidth(asset.width ? String(asset.width) : "");
      setImageHeight(asset.height ? String(asset.height) : "");
      setSuccessBanner("Artwork image selected successfully");
    }
  };

  const pickArtworkVideo = async () => {
    const hasPermission = await requestMediaPermission();
    if (!hasPermission) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["videos"],
      allowsEditing: false,
      quality: 1,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      const asset = result.assets[0];
      setSelectedVideo(asset.uri);
      setSuccessBanner("Artwork video selected successfully");
    }
  };

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setCategory("Digital Art");
    setTags("");
    setYearCreated("");
    setMaterials("");
    setLocation("");
    setStory("");
    setVisibility("Public");
    setAllowComments(true);
    setAllowDownloads(false);
    setSelectedImage(null);
    setSelectedVideo(null);
    setImageWidth("");
    setImageHeight("");
    setShowCategoryPicker(false);
    setShowVisibilityPicker(false);
    setShowSubmitModal(false);
    setSuccessBanner("");
  };

  const getFileExtension = (uri, fallback = "jpg") => {
    const cleanUri = uri.split("?")[0];
    const parts = cleanUri.split(".");
    if (parts.length < 2) return fallback;
    return parts[parts.length - 1].toLowerCase();
  };

  const uploadFileToStorage = async (fileUri, folderName) => {
    const user = auth.currentUser;

    if (!user) {
      throw new Error("User not logged in.");
    }

    const response = await fetch(fileUri);
    const blob = await response.blob();

    const extension = getFileExtension(
      fileUri,
      folderName.includes("videos") ? "mp4" : "jpg"
    );

    const filename = `${Date.now()}_${Math.random()
      .toString(36)
      .slice(2)}.${extension}`;

    const storageRef = ref(storage, `${folderName}/${user.uid}/${filename}`);

    await uploadBytes(storageRef, blob);
    const downloadURL = await getDownloadURL(storageRef);

    return downloadURL;
  };

  const buildPostData = ({ status, imageUrl, videoUrl }) => {
    const user = auth.currentUser;

    return {
      userId: user?.uid || "",
      userEmail: user?.email || "",
      userName: profile.name || "Artist",
      username: profile.username || "@artist",
      userAvatar: profile.avatar || "",
      title: title.trim(),
      description: description.trim(),
      category,
      tags: tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
      yearCreated: yearCreated.trim(),
      materials: materials.trim(),
      location: location.trim(),
      story: story.trim(),
      visibility,
      allowComments,
      allowDownloads,
      imageUrl: imageUrl || "",
      videoUrl: videoUrl || "",
      dimensions:
        imageWidth && imageHeight ? `${imageWidth} x ${imageHeight} px` : "",
      imageWidth: imageWidth ? Number(imageWidth) : null,
      imageHeight: imageHeight ? Number(imageHeight) : null,
      status,
      likesCount: 0,
      commentsCount: 0,
      savesCount: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
  };

  const createNotification = async (message) => {
    const user = auth.currentUser;
    if (!user) return;

    await addDoc(collection(db, "notifications"), {
      userId: user.uid,
      type: "post_submitted",
      title: "Post submitted",
      message,
      read: false,
      createdAt: serverTimestamp(),
    });
  };

  const handleOpenSubmitOptions = () => {
    if (!selectedImage) {
      Alert.alert("Missing artwork", "Please upload an artwork image first.");
      return;
    }

    if (!title.trim() || !description.trim()) {
      Alert.alert(
        "Missing details",
        "Please enter the artwork title and description before continuing."
      );
      return;
    }

    setShowSubmitModal(true);
  };

  const handleSaveDraft = async () => {
    const user = auth.currentUser;

    if (!user) {
      Alert.alert("Not logged in", "Please log in before saving a draft.");
      return;
    }

    try {
      setLoading(true);
      setShowSubmitModal(false);

      const uploadedImageUrl = await uploadFileToStorage(
        selectedImage,
        "posts/images"
      );

      let uploadedVideoUrl = "";
      if (selectedVideo) {
        uploadedVideoUrl = await uploadFileToStorage(
          selectedVideo,
          "posts/videos"
        );
      }

      const draftData = buildPostData({
        status: "draft",
        imageUrl: uploadedImageUrl,
        videoUrl: uploadedVideoUrl,
      });

      await addDoc(collection(db, "posts"), draftData);

      resetForm();
      Alert.alert("Draft Saved", "Your artwork has been saved to draft.");
    } catch (error) {
      console.log("SAVE DRAFT ERROR:", error);
      Alert.alert("Error", String(error?.message || error));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitPost = async () => {
    const user = auth.currentUser;

    if (!user) {
      Alert.alert("Not logged in", "Please log in before submitting a post.");
      return;
    }

    try {
      setLoading(true);
      setShowSubmitModal(false);

      const uploadedImageUrl = await uploadFileToStorage(
        selectedImage,
        "posts/images"
      );

      let uploadedVideoUrl = "";
      if (selectedVideo) {
        uploadedVideoUrl = await uploadFileToStorage(
          selectedVideo,
          "posts/videos"
        );
      }

      const postData = buildPostData({
        status: "submitted",
        imageUrl: uploadedImageUrl,
        videoUrl: uploadedVideoUrl,
      });

      await addDoc(collection(db, "posts"), postData);

      await createNotification("Your artwork has been submitted successfully.");

      resetForm();
      Alert.alert(
        "Post Submitted",
        "Your artwork has been submitted successfully."
      );
    } catch (error) {
      console.log("SUBMIT POST ERROR:", error);
      Alert.alert("Error", String(error?.message || error));
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    Alert.alert("Cancel upload", "Are you sure you want to clear this form?", [
      { text: "No", style: "cancel" },
      {
        text: "Yes",
        style: "destructive",
        onPress: resetForm,
      },
    ]);
  };

  const ToggleRow = ({ label, value, onPress, icon }) => (
    <TouchableOpacity
      style={[styles.optionRow, value && styles.optionRowActive]}
      activeOpacity={0.85}
      onPress={onPress}
    >
      <View style={styles.optionLeft}>
        <View
          style={[
            styles.optionIconWrap,
            value && styles.optionIconWrapActive,
          ]}
        >
          <Ionicons
            name={icon}
            size={18}
            color={value ? "#FFFFFF" : "#6B7280"}
          />
        </View>
        <Text style={styles.optionLabel}>{label}</Text>
      </View>

      <View style={[styles.switchFake, value && styles.switchFakeActive]}>
        <View style={[styles.switchKnob, value && styles.switchKnobActive]} />
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8F8FC" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.topBar}>
          <View>
            <Text style={styles.logo}>ArtLinker</Text>
            <Text style={styles.welcomeText}>Create a new post</Text>
          </View>

          {profileLoading ? (
            <View style={styles.avatarPlaceholder}>
              <ActivityIndicator size="small" color="#7C3AED" />
            </View>
          ) : (
            <Image source={{ uri: profile.avatar }} style={styles.avatar} />
          )}
        </View>

        {!!successBanner && (
          <View style={styles.banner}>
            <Ionicons name="checkmark-circle" size={18} color="#0F9D58" />
            <Text style={styles.bannerText}>{successBanner}</Text>
          </View>
        )}

        <View style={styles.heroCard}>
          <View style={styles.heroLeft}>
            <Text style={styles.title}>Upload Your Artwork</Text>
            <Text style={styles.subtitle}>
              Share your creativity, tell the story behind your work, and
              present your art professionally.
            </Text>
          </View>

          <View style={styles.progressWrap}>
            <Text style={styles.progressNumber}>{completion}%</Text>
            <Text style={styles.progressLabel}>Complete</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Artwork Cover</Text>
          <Text style={styles.sectionHint}>
            Add the main image that best represents your artwork
          </Text>

          <TouchableOpacity
            style={styles.uploadBox}
            activeOpacity={0.85}
            onPress={pickArtworkImage}
          >
            {selectedImage ? (
              <>
                <Image
                  source={{ uri: selectedImage }}
                  style={styles.previewImage}
                />
                <Text style={styles.uploadMainText}>
                  Tap to change artwork image
                </Text>
                {!!imageWidth && !!imageHeight && (
                  <Text style={styles.uploadSubText}>
                    {imageWidth} x {imageHeight} px
                  </Text>
                )}
              </>
            ) : (
              <>
                <Ionicons name="image-outline" size={38} color="#7C3AED" />
                <Text style={styles.uploadMainText}>
                  Tap to upload artwork image
                </Text>
                <Text style={styles.uploadSubText}>
                  Choose an image from your phone gallery
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Optional Process Video</Text>
          <Text style={styles.sectionHint}>
            Show how the artwork was created or present a short preview
          </Text>

          <TouchableOpacity
            style={styles.uploadBox}
            activeOpacity={0.85}
            onPress={pickArtworkVideo}
          >
            <Ionicons name="videocam-outline" size={38} color="#EC4899" />
            <Text style={styles.uploadMainText}>
              {selectedVideo
                ? "Video selected successfully"
                : "Tap to add a video"}
            </Text>
            <Text style={styles.uploadSubText}>
              {selectedVideo
                ? "Your artwork video is ready"
                : "Choose a video from your phone gallery"}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Basic Information</Text>
          <Text style={styles.cardSubtitle}>
            Add the key details people will first see
          </Text>

          <Text style={styles.inputLabel}>Title *</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter artwork title"
            placeholderTextColor="#9CA3AF"
            value={title}
            onChangeText={setTitle}
          />

          <Text style={styles.inputLabel}>Description *</Text>
          <TextInput
            style={styles.textArea}
            placeholder="Describe your artwork, concept, and visual style"
            placeholderTextColor="#9CA3AF"
            multiline
            textAlignVertical="top"
            value={description}
            onChangeText={setDescription}
          />

          <Text style={styles.inputLabel}>Category *</Text>
          <TouchableOpacity
            style={styles.selectBox}
            activeOpacity={0.85}
            onPress={() => setShowCategoryPicker(!showCategoryPicker)}
          >
            <Text style={styles.selectValue}>{category}</Text>
            <Ionicons
              name={showCategoryPicker ? "chevron-up" : "chevron-down"}
              size={18}
              color="#6B7280"
            />
          </TouchableOpacity>

          {showCategoryPicker && (
            <View style={styles.pickerList}>
              {categories.map((item) => (
                <TouchableOpacity
                  key={item}
                  style={styles.pickerItem}
                  onPress={() => {
                    setCategory(item);
                    setShowCategoryPicker(false);
                  }}
                >
                  <Text style={styles.pickerItemText}>{item}</Text>
                  {category === item ? (
                    <Ionicons name="checkmark" size={16} color="#7C3AED" />
                  ) : null}
                </TouchableOpacity>
              ))}
            </View>
          )}

          <Text style={styles.inputLabel}>Tags</Text>
          <TextInput
            style={styles.input}
            placeholder="portrait, abstract, fantasy"
            placeholderTextColor="#9CA3AF"
            value={tags}
            onChangeText={setTags}
          />
          <Text style={styles.helperText}>Separate tags with commas</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Artwork Details</Text>
          <Text style={styles.cardSubtitle}>
            Extra information about your artwork
          </Text>

          <Text style={styles.inputLabel}>Year Created</Text>
          <TextInput
            style={styles.input}
            placeholder="2026"
            placeholderTextColor="#9CA3AF"
            value={yearCreated}
            onChangeText={setYearCreated}
            keyboardType="numeric"
          />

          <Text style={styles.inputLabel}>Dimensions</Text>
          <View style={styles.readOnlyBox}>
            <Text style={styles.readOnlyText}>
              {imageWidth && imageHeight
                ? `${imageWidth} x ${imageHeight} px`
                : "Dimensions will be filled automatically from the image"}
            </Text>
          </View>

          <Text style={styles.inputLabel}>Materials or Tools Used</Text>
          <TextInput
            style={styles.input}
            placeholder="Procreate, Photoshop, acrylic, oil"
            placeholderTextColor="#9CA3AF"
            value={materials}
            onChangeText={setMaterials}
          />

          <Text style={styles.inputLabel}>Location Created</Text>
          <TextInput
            style={styles.input}
            placeholder="Birmingham, United Kingdom"
            placeholderTextColor="#9CA3AF"
            value={location}
            onChangeText={setLocation}
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Artist Story</Text>
          <Text style={styles.cardSubtitle}>
            Help viewers connect with the meaning behind the artwork
          </Text>

          <Text style={styles.inputLabel}>Inspiration and Process</Text>
          <TextInput
            style={styles.largeTextArea}
            placeholder="What inspired this piece? What message does it carry? How did you create it?"
            placeholderTextColor="#9CA3AF"
            multiline
            textAlignVertical="top"
            value={story}
            onChangeText={setStory}
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Post Settings</Text>
          <Text style={styles.cardSubtitle}>
            Choose how your artwork will appear on the platform
          </Text>

          <Text style={styles.inputLabel}>Visibility</Text>
          <TouchableOpacity
            style={styles.selectBox}
            activeOpacity={0.85}
            onPress={() => setShowVisibilityPicker(!showVisibilityPicker)}
          >
            <Text style={styles.selectValue}>{visibility}</Text>
            <Ionicons
              name={showVisibilityPicker ? "chevron-up" : "chevron-down"}
              size={18}
              color="#6B7280"
            />
          </TouchableOpacity>

          {showVisibilityPicker && (
            <View style={styles.pickerList}>
              {visibilityOptions.map((item) => (
                <TouchableOpacity
                  key={item}
                  style={styles.pickerItem}
                  onPress={() => {
                    setVisibility(item);
                    setShowVisibilityPicker(false);
                  }}
                >
                  <Text style={styles.pickerItemText}>{item}</Text>
                  {visibility === item ? (
                    <Ionicons name="checkmark" size={16} color="#7C3AED" />
                  ) : null}
                </TouchableOpacity>
              ))}
            </View>
          )}

          <View style={styles.optionsWrap}>
            <ToggleRow
              label="Allow comments"
              value={allowComments}
              onPress={() => setAllowComments(!allowComments)}
              icon="chatbubble-ellipses-outline"
            />
            <ToggleRow
              label="Allow downloads"
              value={allowDownloads}
              onPress={() => setAllowDownloads(!allowDownloads)}
              icon="download-outline"
            />
          </View>
        </View>

        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={styles.cancelButton}
            activeOpacity={0.85}
            onPress={handleCancel}
            disabled={loading}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.publishButton}
            activeOpacity={0.85}
            onPress={handleOpenSubmitOptions}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Ionicons
                  name="cloud-upload-outline"
                  size={16}
                  color="#FFFFFF"
                />
                <Text style={styles.publishButtonText}>Continue</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>

      <Modal
        visible={showSubmitModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSubmitModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalIcon}>
              <Ionicons name="sparkles-outline" size={24} color="#7C3AED" />
            </View>

            <Text style={styles.modalTitle}>Choose an action</Text>
            <Text style={styles.modalText}>
              Would you like to save this artwork as a draft or submit it now?
            </Text>

            <TouchableOpacity
              style={styles.draftButton}
              activeOpacity={0.85}
              onPress={handleSaveDraft}
              disabled={loading}
            >
              <Ionicons
                name="document-text-outline"
                size={18}
                color="#111827"
              />
              <Text style={styles.draftButtonText}>Save to Draft</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.submitButton}
              activeOpacity={0.85}
              onPress={handleSubmitPost}
              disabled={loading}
            >
              <Ionicons
                name="checkmark-circle-outline"
                size={18}
                color="#FFFFFF"
              />
              <Text style={styles.submitButtonText}>Submit Post</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.closeButton}
              activeOpacity={0.85}
              onPress={() => setShowSubmitModal(false)}
              disabled={loading}
            >
              <Text style={styles.closeButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8F8FC",
  },
  scrollContent: {
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 30,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  logo: {
    fontSize: 28,
    fontWeight: "800",
    color: "#7C3AED",
    letterSpacing: 0.3,
  },
  welcomeText: {
    marginTop: 4,
    fontSize: 13,
    color: "#6B7280",
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  avatarPlaceholder: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 2,
    borderColor: "#FFFFFF",
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  banner: {
    backgroundColor: "#ECFDF3",
    borderWidth: 1,
    borderColor: "#CDEFD9",
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
  },
  bannerText: {
    marginLeft: 8,
    color: "#166534",
    fontSize: 13,
    fontWeight: "600",
  },
  heroCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 18,
    marginBottom: 18,
    flexDirection: "row",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#ECECF5",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  heroLeft: {
    flex: 1,
    paddingRight: 14,
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    color: "#111827",
  },
  subtitle: {
    fontSize: 13,
    color: "#6B7280",
    marginTop: 8,
    lineHeight: 20,
  },
  progressWrap: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: "#F5F3FF",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
  },
  progressNumber: {
    fontSize: 20,
    fontWeight: "800",
    color: "#7C3AED",
  },
  progressLabel: {
    fontSize: 11,
    color: "#6B7280",
    marginTop: 2,
  },
  section: {
    marginBottom: 18,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 4,
  },
  sectionHint: {
    fontSize: 12,
    color: "#6B7280",
    marginBottom: 10,
  },
  uploadBox: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1.2,
    borderColor: "#E7E7F1",
    borderStyle: "dashed",
    borderRadius: 18,
    minHeight: 180,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
  previewImage: {
    width: "100%",
    height: 170,
    borderRadius: 14,
    marginBottom: 12,
  },
  uploadMainText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#374151",
    marginTop: 12,
    textAlign: "center",
  },
  uploadSubText: {
    fontSize: 12,
    color: "#9CA3AF",
    marginTop: 6,
    textAlign: "center",
    lineHeight: 18,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#ECECF5",
    borderRadius: 18,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#111827",
  },
  cardSubtitle: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 4,
    marginBottom: 14,
    lineHeight: 18,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#374151",
    marginBottom: 7,
    marginTop: 8,
  },
  input: {
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    height: 46,
    paddingHorizontal: 14,
    fontSize: 13,
    color: "#111827",
  },
  textArea: {
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    minHeight: 100,
    paddingHorizontal: 14,
    paddingTop: 12,
    fontSize: 13,
    color: "#111827",
  },
  largeTextArea: {
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    minHeight: 130,
    paddingHorizontal: 14,
    paddingTop: 12,
    fontSize: 13,
    color: "#111827",
  },
  selectBox: {
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    height: 46,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  selectValue: {
    fontSize: 13,
    color: "#111827",
    fontWeight: "600",
  },
  helperText: {
    fontSize: 11,
    color: "#9CA3AF",
    marginTop: 6,
  },
  readOnlyBox: {
    backgroundColor: "#F3F4F6",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    minHeight: 46,
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  readOnlyText: {
    fontSize: 13,
    color: "#4B5563",
  },
  pickerList: {
    marginTop: 8,
    backgroundColor: "#FAFAFF",
    borderWidth: 1,
    borderColor: "#ECECF5",
    borderRadius: 12,
    overflow: "hidden",
  },
  pickerItem: {
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: "#EFEFF6",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  pickerItemText: {
    fontSize: 13,
    color: "#1F2937",
    fontWeight: "500",
  },
  optionsWrap: {
    marginTop: 6,
    gap: 10,
  },
  optionRow: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#F9FAFB",
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  optionRowActive: {
    backgroundColor: "#F5F3FF",
    borderColor: "#DDD6FE",
  },
  optionLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  optionIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  optionIconWrapActive: {
    backgroundColor: "#7C3AED",
  },
  optionLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#111827",
  },
  switchFake: {
    width: 46,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#D1D5DB",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  switchFakeActive: {
    backgroundColor: "#A78BFA",
  },
  switchKnob: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
  },
  switchKnobActive: {
    alignSelf: "flex-end",
  },
  buttonRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 6,
    gap: 10,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: "#F3F4F6",
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#374151",
  },
  publishButton: {
    flex: 1.4,
    backgroundColor: "#111827",
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  publishButtonText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(17, 24, 39, 0.45)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 22,
  },
  modalCard: {
    width: "100%",
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    padding: 22,
    alignItems: "center",
  },
  modalIcon: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "#F5F3FF",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#111827",
  },
  modalText: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 20,
    color: "#6B7280",
    textAlign: "center",
    marginBottom: 18,
  },
  draftButton: {
    width: "100%",
    backgroundColor: "#F3F4F6",
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    marginBottom: 10,
  },
  draftButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
  },
  submitButton: {
    width: "100%",
    backgroundColor: "#7C3AED",
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    marginBottom: 10,
  },
  submitButtonText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  closeButton: {
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  closeButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#6B7280",
  },
});
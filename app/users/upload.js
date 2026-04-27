import React, { useMemo, useState } from "react";
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  Alert,
  ActivityIndicator,
  StatusBar,
  Switch,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { auth, db, storage } from "../../config/firebase";

const categories = [
  "Digital Art",
  "Illustration",
  "Photography",
  "Painting",
  "3D Art",
  "Animation",
  "Fantasy",
  "Character Design",
];

export default function UserUploadScreen() {
  const router = useRouter();

  const [image, setImage] = useState(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Digital Art");
  const [tags, setTags] = useState("");
  const [materials, setMaterials] = useState("");
  const [story, setStory] = useState("");
  const [allowComments, setAllowComments] = useState(true);
  const [allowDownloads, setAllowDownloads] = useState(false);
  const [visibility, setVisibility] = useState("public");
  const [loading, setLoading] = useState(false);

  const completion = useMemo(() => {
    let score = 0;
    if (image) score += 25;
    if (title.trim()) score += 25;
    if (description.trim()) score += 20;
    if (category) score += 15;
    if (tags.trim()) score += 15;
    return score;
  }, [image, title, description, category, tags]);

  const pickImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert("Permission required", "Please allow access to your gallery.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 1,
      allowsEditing: true,
      aspect: [4, 5],
    });

    if (!result.canceled) {
      setImage(result.assets[0]);
    }
  };

  const uploadImageToStorage = async () => {
    if (!image?.uri) return null;

    const response = await fetch(image.uri);
    const blob = await response.blob();

    const userId = auth.currentUser.uid;
    const fileName = `artworks/${userId}/${Date.now()}.jpg`;
    const storageRef = ref(storage, fileName);

    await uploadBytes(storageRef, blob);
    return await getDownloadURL(storageRef);
  };

  const resetForm = () => {
    setImage(null);
    setTitle("");
    setDescription("");
    setCategory("Digital Art");
    setTags("");
    setMaterials("");
    setStory("");
    setAllowComments(true);
    setAllowDownloads(false);
    setVisibility("public");
  };

  const handleUpload = async (status = "submitted") => {
    const user = auth.currentUser;

    if (!user) {
      Alert.alert("Login required", "Please log in before uploading artwork.");
      return;
    }

    if (!title.trim()) {
      Alert.alert("Missing title", "Please enter an artwork title.");
      return;
    }

    if (!image && status === "submitted") {
      Alert.alert("Missing artwork", "Please select an image before submitting.");
      return;
    }

    try {
      setLoading(true);

      const imageUrl = image ? await uploadImageToStorage() : null;

      await addDoc(collection(db, "posts"), {
        userId: user.uid,
        userEmail: user.email || "",
        title: title.trim(),
        description: description.trim(),
        category,
        tags: tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
        materials: materials.trim(),
        story: story.trim(),
        visibility,
        allowComments,
        allowDownloads,
        imageUrl,
        imageWidth: image?.width || null,
        imageHeight: image?.height || null,
        likesCount: 0,
        commentsCount: 0,
        savesCount: 0,
        status,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      Alert.alert(
        status === "draft" ? "Draft saved" : "Artwork uploaded",
        status === "draft"
          ? "Your artwork has been saved as a draft."
          : "Your artwork has been submitted successfully."
      );

      resetForm();
    } catch (error) {
      console.log("Upload error:", error);
      Alert.alert("Upload failed", error.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#111827" />
        </TouchableOpacity>

        <View>
          <Text style={styles.headerTitle}>Upload Artwork</Text>
          <Text style={styles.headerSub}>Share your creative work</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.container}>
        <TouchableOpacity style={styles.uploadBox} onPress={pickImage}>
          {image ? (
            <Image source={{ uri: image.uri }} style={styles.previewImage} />
          ) : (
            <View style={styles.emptyUpload}>
              <Ionicons name="cloud-upload-outline" size={46} color="#7C3AED" />
              <Text style={styles.uploadTitle}>Select Artwork</Text>
              <Text style={styles.uploadText}>
                Choose a high-quality image from your gallery
              </Text>
            </View>
          )}
        </TouchableOpacity>

        <View style={styles.progressCard}>
          <View style={styles.progressTop}>
            <Text style={styles.progressLabel}>Upload completion</Text>
            <Text style={styles.progressValue}>{completion}%</Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${completion}%` }]} />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Artwork Title</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter artwork title"
            value={title}
            onChangeText={setTitle}
          />

          <Text style={styles.label}>Description</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Describe your artwork"
            value={description}
            onChangeText={setDescription}
            multiline
          />

          <Text style={styles.label}>Category</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {categories.map((item) => (
              <TouchableOpacity
                key={item}
                style={[
                  styles.categoryPill,
                  category === item && styles.categoryActive,
                ]}
                onPress={() => setCategory(item)}
              >
                <Text
                  style={[
                    styles.categoryText,
                    category === item && styles.categoryTextActive,
                  ]}
                >
                  {item}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={styles.label}>Tags</Text>
          <TextInput
            style={styles.input}
            placeholder="portrait, digital, fantasy"
            value={tags}
            onChangeText={setTags}
          />

          <Text style={styles.label}>Materials / Tools Used</Text>
          <TextInput
            style={styles.input}
            placeholder="Procreate, Photoshop, Blender"
            value={materials}
            onChangeText={setMaterials}
          />

          <Text style={styles.label}>Artwork Story</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Tell people the story behind this artwork"
            value={story}
            onChangeText={setStory}
            multiline
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Visibility</Text>

          <View style={styles.visibilityRow}>
            {["public", "private"].map((item) => (
              <TouchableOpacity
                key={item}
                style={[
                  styles.visibilityBtn,
                  visibility === item && styles.visibilityActive,
                ]}
                onPress={() => setVisibility(item)}
              >
                <Ionicons
                  name={item === "public" ? "earth-outline" : "lock-closed-outline"}
                  size={18}
                  color={visibility === item ? "#FFFFFF" : "#475569"}
                />
                <Text
                  style={[
                    styles.visibilityText,
                    visibility === item && styles.visibilityTextActive,
                  ]}
                >
                  {item === "public" ? "Public" : "Private"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.settingRow}>
            <View>
              <Text style={styles.settingTitle}>Allow comments</Text>
              <Text style={styles.settingSub}>Let users comment on this artwork</Text>
            </View>
            <Switch value={allowComments} onValueChange={setAllowComments} />
          </View>

          <View style={styles.settingRow}>
            <View>
              <Text style={styles.settingTitle}>Allow downloads</Text>
              <Text style={styles.settingSub}>Let users download this artwork</Text>
            </View>
            <Switch value={allowDownloads} onValueChange={setAllowDownloads} />
          </View>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.draftBtn}
            disabled={loading}
            onPress={() => handleUpload("draft")}
          >
            <Text style={styles.draftText}>Save Draft</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.submitBtn}
            disabled={loading}
            onPress={() => handleUpload("submitted")}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="send" size={18} color="#FFFFFF" />
                <Text style={styles.submitText}>Submit Artwork</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 14,
  },
  backBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    elevation: 2,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: "#111827",
  },
  headerSub: {
    fontSize: 13,
    color: "#64748B",
    marginTop: 2,
  },
  container: {
    padding: 20,
    paddingBottom: 40,
  },
  uploadBox: {
    height: 280,
    borderRadius: 24,
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    elevation: 3,
  },
  previewImage: {
    width: "100%",
    height: "100%",
  },
  emptyUpload: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  uploadTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#111827",
    marginTop: 10,
  },
  uploadText: {
    fontSize: 14,
    color: "#64748B",
    textAlign: "center",
    marginTop: 6,
  },
  progressCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 16,
    marginTop: 18,
    elevation: 2,
  },
  progressTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  progressLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#334155",
  },
  progressValue: {
    fontSize: 14,
    fontWeight: "800",
    color: "#7C3AED",
  },
  progressTrack: {
    height: 8,
    backgroundColor: "#E2E8F0",
    borderRadius: 99,
  },
  progressFill: {
    height: 8,
    backgroundColor: "#7C3AED",
    borderRadius: 99,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 18,
    marginTop: 18,
    elevation: 2,
  },
  label: {
    fontSize: 14,
    fontWeight: "800",
    color: "#1E293B",
    marginBottom: 8,
    marginTop: 12,
  },
  input: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
    color: "#111827",
  },
  textArea: {
    height: 110,
    textAlignVertical: "top",
  },
  categoryPill: {
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 99,
    backgroundColor: "#F1F5F9",
    marginRight: 10,
  },
  categoryActive: {
    backgroundColor: "#7C3AED",
  },
  categoryText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#475569",
  },
  categoryTextActive: {
    color: "#FFFFFF",
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 14,
  },
  visibilityRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 16,
  },
  visibilityBtn: {
    flex: 1,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 13,
    borderRadius: 16,
    backgroundColor: "#F1F5F9",
  },
  visibilityActive: {
    backgroundColor: "#7C3AED",
  },
  visibilityText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#475569",
    textTransform: "capitalize",
  },
  visibilityTextActive: {
    color: "#FFFFFF",
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
  },
  settingTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#111827",
  },
  settingSub: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 3,
    maxWidth: 230,
  },
  actions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 22,
  },
  draftBtn: {
    flex: 1,
    height: 54,
    borderRadius: 16,
    backgroundColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
  },
  draftText: {
    fontSize: 15,
    fontWeight: "800",
    color: "#334155",
  },
  submitBtn: {
    flex: 1.4,
    height: 54,
    borderRadius: 16,
    backgroundColor: "#7C3AED",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  submitText: {
    fontSize: 15,
    fontWeight: "800",
    color: "#FFFFFF",
  },
});
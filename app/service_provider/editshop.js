import React, { useEffect, useMemo, useState } from "react";
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  Image,
  ActivityIndicator,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import {
  doc,
  getDoc,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import {
  ref,
  uploadBytes,
  getDownloadURL,
} from "firebase/storage";
import { auth, db, storage } from "../../config/firebase";

const itemTypes = [
  "T Shirt",
  "Drawing",
  "Online Drawing Equipment",
  "Drawing Tools",
  "Tutorial Video",
];

const drawingSizes = ["A5", "A4", "A3", "A2", "A1", "Custom"];

export default function EditShopScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [itemType, setItemType] = useState("T Shirt");
  const [price, setPrice] = useState("");
  const [size, setSize] = useState("");
  const [stock, setStock] = useState("");
  const [brand, setBrand] = useState("");
  const [color, setColor] = useState("");
  const [material, setMaterial] = useState("");
  const [videoDuration, setVideoDuration] = useState("");

  const [existingMediaUrls, setExistingMediaUrls] = useState([]);
  const [newMediaUris, setNewMediaUris] = useState([]);
  const [mediaType, setMediaType] = useState("image");

  const isDrawing = useMemo(() => itemType === "Drawing", [itemType]);
  const isTshirt = useMemo(() => itemType === "T Shirt", [itemType]);
  const isVideo = useMemo(() => itemType === "Tutorial Video", [itemType]);

  useEffect(() => {
    const loadProduct = async () => {
      try {
        if (!id) {
          Alert.alert("Error", "Product ID not found.");
          router.back();
          return;
        }

        const docRef = doc(db, "shops", String(id));
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
          Alert.alert("Error", "Product not found.");
          router.back();
          return;
        }

        const data = docSnap.data();

        if (data.providerId !== auth.currentUser?.uid) {
          Alert.alert("Access denied", "You can only edit your own product.");
          router.back();
          return;
        }

        setTitle(data.title || "");
        setDescription(data.description || "");
        setItemType(data.itemType || "T Shirt");
        setPrice(String(data.price ?? ""));
        setSize(data.size || "");
        setStock(String(data.stock ?? ""));
        setBrand(data.brand || "");
        setColor(data.color || "");
        setMaterial(data.material || "");
        setVideoDuration(data.videoDuration || "");
        setMediaType(data.mediaType || "image");

        if (Array.isArray(data.mediaUrls) && data.mediaUrls.length > 0) {
          setExistingMediaUrls(data.mediaUrls);
        } else if (data.mediaUrl) {
          setExistingMediaUrls([data.mediaUrl]);
        } else {
          setExistingMediaUrls([]);
        }
      } catch (error) {
        console.log("Load product error:", error);
        Alert.alert("Error", "Failed to load product.");
      } finally {
        setLoading(false);
      }
    };

    loadProduct();
  }, [id, router]);

  const pickMedia = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        Alert.alert("Permission needed", "Please allow access to your media library.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: isVideo
          ? ImagePicker.MediaTypeOptions.Videos
          : ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: !isVideo,
        allowsEditing: false,
        quality: 0.9,
        selectionLimit: isVideo ? 1 : 10,
      });

      if (!result.canceled) {
        const assets = result.assets || [];

        if (isVideo) {
          setNewMediaUris(assets.length ? [assets[0].uri] : []);
        } else {
          setNewMediaUris((prev) => [...prev, ...assets.map((a) => a.uri)]);
        }
      }
    } catch (error) {
      console.log("Pick media error:", error);
      Alert.alert("Error", "Failed to pick media.");
    }
  };

  const removeExistingMedia = (urlToRemove) => {
    setExistingMediaUrls((prev) => prev.filter((url) => url !== urlToRemove));
  };

  const removeNewMedia = (uriToRemove) => {
    setNewMediaUris((prev) => prev.filter((uri) => uri !== uriToRemove));
  };

  const uploadSingleFile = async (uri) => {
    const response = await fetch(uri);
    const blob = await response.blob();

    const extension = uri.split(".").pop()?.toLowerCase() || "jpg";
    const fileName = `shops/${auth.currentUser.uid}/${Date.now()}_${Math.random()
      .toString(36)
      .slice(2)}.${extension}`;

    const storageRef = ref(storage, fileName);
    await uploadBytes(storageRef, blob);
    const downloadURL = await getDownloadURL(storageRef);

    return {
      downloadURL,
      storagePath: fileName,
    };
  };

  const uploadAllNewFiles = async () => {
    const uploaded = [];

    for (const uri of newMediaUris) {
      const result = await uploadSingleFile(uri);
      uploaded.push(result);
    }

    return uploaded;
  };

  const handleSave = async () => {
    try {
      if (!title.trim()) {
        Alert.alert("Missing field", "Please enter the product title.");
        return;
      }

      if (!description.trim()) {
        Alert.alert("Missing field", "Please enter the description.");
        return;
      }

      if (!price.trim()) {
        Alert.alert("Missing field", "Please enter the price.");
        return;
      }

      const currentMediaCount = existingMediaUrls.length + newMediaUris.length;

      if (currentMediaCount === 0) {
        Alert.alert("Missing media", "Please keep or upload at least one media file.");
        return;
      }

      setSaving(true);

      const uploadedFiles = await uploadAllNewFiles();
      const uploadedUrls = uploadedFiles.map((file) => file.downloadURL);

      const finalMediaUrls = [...existingMediaUrls, ...uploadedUrls];

      const payload = {
        title: title.trim(),
        description: description.trim(),
        itemType,
        price: Number(price),
        size: size.trim() || null,
        stock: stock.trim() ? Number(stock) : 0,
        brand: brand.trim() || null,
        color: color.trim() || null,
        material: material.trim() || null,
        videoDuration: videoDuration.trim() || null,
        mediaType: isVideo ? "video" : "image",
        mediaUrl: finalMediaUrls[0] || "",
        mediaUrls: finalMediaUrls,
        updatedAt: serverTimestamp(),
      };

      await updateDoc(doc(db, "shops", String(id)), payload);

      Alert.alert("Success", "Product updated successfully.");
      router.back();
    } catch (error) {
      console.log("Update product error:", error);
      Alert.alert("Error", "Failed to update product.");
    } finally {
      setSaving(false);
    }
  };

  const renderOptions = (label, options, selectedValue, setSelectedValue) => (
    <View style={styles.optionSection}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.optionWrap}>
        {options.map((option) => {
          const selected = selectedValue === option;
          return (
            <TouchableOpacity
              key={option}
              style={[styles.optionButton, selected && styles.optionButtonActive]}
              onPress={() => setSelectedValue(option)}
            >
              <Text style={[styles.optionText, selected && styles.optionTextActive]}>
                {option}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color="#4F6BFF" />
          <Text style={styles.loadingText}>Loading product...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const allPreviewImages = [...existingMediaUrls, ...newMediaUris];

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color="#111827" />
        </TouchableOpacity>

        <Text style={styles.topTitle}>Edit Product</Text>

        <View style={styles.placeholder} />
      </View>

      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          {renderOptions("Item Type", itemTypes, itemType, (value) => {
            setItemType(value);
            if (value === "Tutorial Video") {
              setMediaType("video");
            } else {
              setMediaType("image");
            }
          })}

          <Text style={styles.label}>Title</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Enter item title"
            style={styles.input}
          />

          <Text style={styles.label}>Description</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Describe the product"
            style={[styles.input, styles.textArea]}
            multiline
          />

          <Text style={styles.label}>Price (£)</Text>
          <TextInput
            value={price}
            onChangeText={setPrice}
            placeholder="Enter price"
            keyboardType="numeric"
            style={styles.input}
          />

          <Text style={styles.label}>Stock</Text>
          <TextInput
            value={stock}
            onChangeText={setStock}
            placeholder="Enter stock"
            keyboardType="numeric"
            style={styles.input}
          />

          {(isDrawing || isTshirt) &&
            renderOptions("Size", drawingSizes, size, setSize)}

          {isTshirt && (
            <>
              <Text style={styles.label}>Color</Text>
              <TextInput
                value={color}
                onChangeText={setColor}
                placeholder="Example: Black"
                style={styles.input}
              />

              <Text style={styles.label}>Material</Text>
              <TextInput
                value={material}
                onChangeText={setMaterial}
                placeholder="Example: Cotton"
                style={styles.input}
              />
            </>
          )}

          {!isVideo && (
            <>
              <Text style={styles.label}>Brand</Text>
              <TextInput
                value={brand}
                onChangeText={setBrand}
                placeholder="Enter brand"
                style={styles.input}
              />
            </>
          )}

          {isVideo && (
            <>
              <Text style={styles.label}>Video Duration</Text>
              <TextInput
                value={videoDuration}
                onChangeText={setVideoDuration}
                placeholder="Example: 15 minutes"
                style={styles.input}
              />
            </>
          )}

          <Text style={styles.label}>
            {isVideo ? "Replace or Add Video" : "Add More Images"}
          </Text>

          <TouchableOpacity style={styles.mediaButton} onPress={pickMedia}>
            <Ionicons
              name={isVideo ? "videocam-outline" : "images-outline"}
              size={22}
              color="#fff"
            />
            <Text style={styles.mediaButtonText}>
              {isVideo ? "Choose Video" : "Choose Images"}
            </Text>
          </TouchableOpacity>

          {!!allPreviewImages.length && (
            <>
              <Text style={styles.previewTitle}>Product Media</Text>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.previewRow}
              >
                {existingMediaUrls.map((url, index) => (
                  <View key={`${url}-${index}`} style={styles.previewCard}>
                    <Image source={{ uri: url }} style={styles.previewImage} resizeMode="contain" />
                    <TouchableOpacity
                      style={styles.removeImageButton}
                      onPress={() => removeExistingMedia(url)}
                    >
                      <Ionicons name="close" size={16} color="#fff" />
                    </TouchableOpacity>
                    {index === 0 && (
                      <View style={styles.coverBadge}>
                        <Text style={styles.coverBadgeText}>Cover</Text>
                      </View>
                    )}
                  </View>
                ))}

                {newMediaUris.map((uri, index) => (
                  <View key={`${uri}-${index}`} style={styles.previewCard}>
                    <Image source={{ uri }} style={styles.previewImage} resizeMode="contain" />
                    <TouchableOpacity
                      style={styles.removeImageButton}
                      onPress={() => removeNewMedia(uri)}
                    >
                      <Ionicons name="close" size={16} color="#fff" />
                    </TouchableOpacity>
                    <View style={styles.newBadge}>
                      <Text style={styles.newBadgeText}>New</Text>
                    </View>
                  </View>
                ))}
              </ScrollView>
            </>
          )}

          <TouchableOpacity
            style={[styles.saveButton, saving && { opacity: 0.7 }]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="save-outline" size={20} color="#fff" />
                <Text style={styles.saveButtonText}>Save Changes</Text>
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
    backgroundColor: "#F7F8FC",
  },
  topBar: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
  },
  topTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#111827",
  },
  placeholder: {
    width: 42,
  },
  container: {
    padding: 18,
    paddingTop: 6,
    paddingBottom: 40,
  },
  centerBox: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 10,
    fontSize: 14,
    color: "#6B7280",
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 16,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  label: {
    fontSize: 14,
    fontWeight: "700",
    color: "#374151",
    marginBottom: 8,
    marginTop: 12,
  },
  input: {
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "ios" ? 14 : 10,
    fontSize: 14,
    color: "#111827",
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: "top",
  },
  optionSection: {
    marginTop: 6,
  },
  optionWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  optionButton: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: "#F3F4F6",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    marginBottom: 8,
  },
  optionButtonActive: {
    backgroundColor: "#4F6BFF",
    borderColor: "#4F6BFF",
  },
  optionText: {
    color: "#374151",
    fontSize: 13,
    fontWeight: "600",
  },
  optionTextActive: {
    color: "#FFFFFF",
  },
  mediaButton: {
    marginTop: 8,
    backgroundColor: "#4F6BFF",
    borderRadius: 14,
    height: 50,
    justifyContent: "center",
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  mediaButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  previewTitle: {
    marginTop: 16,
    fontSize: 14,
    fontWeight: "700",
    color: "#374151",
  },
  previewRow: {
    paddingTop: 12,
    paddingBottom: 4,
  },
  previewCard: {
    width: 130,
    height: 130,
    borderRadius: 16,
    backgroundColor: "#F3F4F6",
    marginRight: 12,
    overflow: "hidden",
    position: "relative",
    justifyContent: "center",
    alignItems: "center",
  },
  previewImage: {
    width: "100%",
    height: "100%",
  },
  removeImageButton: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(17,24,39,0.75)",
    justifyContent: "center",
    alignItems: "center",
  },
  coverBadge: {
    position: "absolute",
    left: 8,
    bottom: 8,
    backgroundColor: "#4F6BFF",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  coverBadgeText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "800",
  },
  newBadge: {
    position: "absolute",
    left: 8,
    bottom: 8,
    backgroundColor: "#111827",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  newBadgeText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "800",
  },
  saveButton: {
    marginTop: 22,
    backgroundColor: "#111827",
    height: 54,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  saveButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "800",
  },
});
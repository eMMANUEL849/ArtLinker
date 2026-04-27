import React, { useEffect, useMemo, useState } from "react";
import {
  
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
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { SafeAreaView } from "react-native-safe-area-context";
import { Video } from "expo-av";
import { Ionicons } from "@expo/vector-icons";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  serverTimestamp,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { auth, db, storage } from "../../config/firebase";

const itemTypes = [
  "T Shirt",
  "Drawing",
  "Online Drawing Equipment",
  "Drawing Tools",
  "Tutorial Video",
];

const drawingSizes = ["A5", "A4", "A3", "A2", "A1", "Custom"];
const tshirtSizes = ["Small", "Medium", "Large", "X Large", "XX Large"];
const tshirtMaterials = [
  "100% Cotton",
  "Polyester",
  "Cotton Blend",
  "Organic Cotton",
  "Heavyweight Cotton",
  "Dry Fit",
];

function formatDuration(ms) {
  if (!ms || Number(ms) <= 0) return "";
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes} min ${seconds} sec`;
}

function getExtensionFromName(name = "", uri = "") {
  const source = name || uri || "";
  const clean = source.split("?")[0];
  const parts = clean.split(".");
  return parts.length > 1 ? parts.pop().toLowerCase() : "";
}

function isVideoExtension(ext) {
  return ["mp4", "mov", "m4v", "avi", "webm", "mkv"].includes(ext);
}

function isImageExtension(ext) {
  return [
    "jpg",
    "jpeg",
    "png",
    "gif",
    "webp",
    "bmp",
    "heic",
    "heif",
    "svg",
  ].includes(ext);
}

function getFileKind(file) {
  const ext = getExtensionFromName(file?.name, file?.uri);
  const mime = String(file?.mimeType || "").toLowerCase();

  if (mime.startsWith("image/") || isImageExtension(ext)) {
    return "image";
  }

  if (mime.startsWith("video/") || isVideoExtension(ext)) {
    return "video";
  }

  return "document";
}

function getMimeType(file) {
  if (file?.mimeType) return file.mimeType;

  const ext = getExtensionFromName(file?.name, file?.uri);

  const mimeMap = {
    pdf: "application/pdf",
    psd: "image/vnd.adobe.photoshop",
    zip: "application/zip",
    rar: "application/vnd.rar",
    txt: "text/plain",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    mp4: "video/mp4",
    mov: "video/quicktime",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
  };

  return mimeMap[ext] || "application/octet-stream";
}

function uriToBlob(uri) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.onload = function () {
      resolve(xhr.response);
    };
    xhr.onerror = function () {
      reject(new TypeError("Could not convert file to blob."));
    };
    xhr.responseType = "blob";
    xhr.open("GET", uri, true);
    xhr.send(null);
  });
}

export default function UploadShopItemScreen() {
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
  const [videoDurationMs, setVideoDurationMs] = useState(0);
  const [mediaFiles, setMediaFiles] = useState([]);
  const [mediaType, setMediaType] = useState("image");
  const [loading, setLoading] = useState(false);

  const isDrawing = useMemo(() => itemType === "Drawing", [itemType]);
  const isTshirt = useMemo(() => itemType === "T Shirt", [itemType]);
  const isVideo = useMemo(() => itemType === "Tutorial Video", [itemType]);
  const isOnlineEquipment = useMemo(
    () => itemType === "Online Drawing Equipment",
    [itemType]
  );

  useEffect(() => {
    if (isVideo) {
      setMediaType("video");
    } else if (isOnlineEquipment) {
      setMediaType("mixed");
    } else {
      setMediaType("image");
    }
  }, [isVideo, isOnlineEquipment]);

  const resetMediaState = () => {
    setMediaFiles([]);
    setVideoDuration("");
    setVideoDurationMs(0);
  };

  const pickImages = async () => {
    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        Alert.alert(
          "Permission needed",
          "Please allow access to your media library."
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: isVideo
          ? ImagePicker.MediaTypeOptions.Videos
          : ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: !isVideo,
        quality: 0.9,
        allowsEditing: false,
        selectionLimit: isVideo ? 1 : 10,
      });

      if (result.canceled) return;

      const pickedAssets = result.assets || [];
      if (!pickedAssets.length) return;

      if (isVideo) {
        const asset = pickedAssets[0];
        const durationMs = Number(asset.duration || 0);

        if (durationMs > 10 * 60 * 1000) {
          Alert.alert(
            "Video too long",
            "Tutorial videos must be no more than 10 minutes."
          );
          return;
        }

        setMediaFiles([
          {
            uri: asset.uri,
            name:
              asset.fileName ||
              `tutorial-video.${asset.uri.split(".").pop() || "mp4"}`,
            mimeType: asset.mimeType || "video/mp4",
            kind: "video",
            durationMs,
          },
        ]);

        setVideoDurationMs(durationMs);
        setVideoDuration(formatDuration(durationMs));
        setMediaType("video");
      } else {
        const files = pickedAssets.map((asset, index) => ({
          uri: asset.uri,
          name:
            asset.fileName ||
            `image-${index + 1}.${asset.uri.split(".").pop() || "jpg"}`,
          mimeType: asset.mimeType || "image/jpeg",
          kind: "image",
        }));

        setMediaFiles(files);
        setMediaType("image");
      }
    } catch (error) {
      console.log("Media pick error:", error);
      Alert.alert("Error", "Failed to pick media.");
    }
  };

  const pickEquipmentFiles = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        multiple: true,
        copyToCacheDirectory: true,
        type: "*/*",
      });

      if (result.canceled) return;

      const assets = result.assets || [];
      if (!assets.length) return;

      const files = assets.map((file, index) => {
        const ext = getExtensionFromName(file.name, file.uri);
        const kind = getFileKind(file);

        return {
          uri: file.uri,
          name: file.name || `file-${index + 1}.${ext || "bin"}`,
          mimeType: getMimeType(file),
          kind,
        };
      });

      setMediaFiles(files);
      setMediaType("mixed");
    } catch (error) {
      console.log("Equipment file pick error:", error);
      Alert.alert("Error", "Failed to pick files.");
    }
  };

  const handlePickMedia = async () => {
    if (isOnlineEquipment) {
      await pickEquipmentFiles();
      return;
    }
    await pickImages();
  };

  const removeFile = (uriToRemove) => {
    const updated = mediaFiles.filter((file) => file.uri !== uriToRemove);
    setMediaFiles(updated);

    if (isVideo && updated.length === 0) {
      setVideoDuration("");
      setVideoDurationMs(0);
    }
  };

  const uploadSingleFile = async (file, folderName = "shops") => {
    try {
      const blob = await uriToBlob(file.uri);
      const extension = getExtensionFromName(file.name, file.uri) || "bin";

      const fileName = `${folderName}/${auth.currentUser.uid}/${Date.now()}_${Math.random()
        .toString(36)
        .slice(2)}.${extension}`;

      const storageRef = ref(storage, fileName);

      await uploadBytes(storageRef, blob, {
        contentType: getMimeType(file),
      });

      if (blob && typeof blob.close === "function") {
        blob.close();
      }

      const downloadURL = await getDownloadURL(storageRef);

      return {
        downloadURL,
        storagePath: fileName,
        fileName: file.name || `file.${extension}`,
        mimeType: getMimeType(file),
        kind: file.kind || null,
        durationMs: file.durationMs || null,
      };
    } catch (error) {
      console.log("Single file upload error:", file?.name, error);
      throw new Error(`Failed to upload ${file?.name || "file"}`);
    }
  };

  const uploadAllFiles = async (files) => {
    const results = [];
    for (const file of files) {
      const uploaded = await uploadSingleFile(file, "shops");
      results.push(uploaded);
    }
    return results;
  };

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setItemType("T Shirt");
    setPrice("");
    setSize("");
    setStock("");
    setBrand("");
    setColor("");
    setMaterial("");
    setVideoDuration("");
    setVideoDurationMs(0);
    setMediaFiles([]);
    setMediaType("image");
  };

  const loadProviderProfile = async () => {
    const user = auth.currentUser;
    if (!user?.uid) {
      throw new Error("You must be logged in.");
    }

    let userData = {};
    try {
      const userSnap = await getDoc(doc(db, "users", user.uid));
      if (userSnap.exists()) {
        userData = userSnap.data() || {};
      }
    } catch (error) {
      console.log("Provider profile load error:", error);
    }

    const providerName =
      userData.fullName ||
      userData.name ||
      userData.displayName ||
      user.displayName ||
      "Provider";

    const providerEmail = userData.email || userData.mail || user.email || "";
    const providerAvatar =
      userData.avatar || userData.photoURL || user.photoURL || "";
    const providerBusinessName =
      userData.businessName || userData.storeName || providerName;

    return {
      providerId: user.uid,
      providerEmail,
      providerName,
      providerAvatar,
      providerBusinessName,
    };
  };

  const handleSave = async () => {
    if (!title.trim()) {
      Alert.alert("Missing field", "Please enter the item title.");
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

    if (Number(price) <= 0) {
      Alert.alert("Invalid price", "Please enter a valid price greater than 0.");
      return;
    }

    if (!isVideo) {
      if (!stock.trim()) {
        Alert.alert("Missing field", "Please enter the stock quantity.");
        return;
      }

      if (Number(stock) < 0) {
        Alert.alert("Invalid stock", "Stock cannot be negative.");
        return;
      }
    }

    if (!mediaFiles.length) {
      Alert.alert("Missing media", "Please upload product media.");
      return;
    }

    if (isVideo) {
      if (!videoDurationMs || videoDurationMs <= 0) {
        Alert.alert(
          "Missing duration",
          "Could not read the tutorial video duration. Please reselect the video."
        );
        return;
      }

      if (videoDurationMs > 10 * 60 * 1000) {
        Alert.alert(
          "Video too long",
          "Tutorial videos must be no more than 10 minutes."
        );
        return;
      }
    }

    if (!auth.currentUser) {
      Alert.alert("Not signed in", "You must be logged in.");
      return;
    }

    try {
      setLoading(true);

      const provider = await loadProviderProfile();
      const uploadedFiles = await uploadAllFiles(mediaFiles);

      const mediaUrls = uploadedFiles.map((item) => item.downloadURL);
      const storagePaths = uploadedFiles.map((item) => item.storagePath);

      const shopItem = {
        providerId: provider.providerId,
        providerEmail: provider.providerEmail,
        providerName: provider.providerName,
        providerAvatar: provider.providerAvatar,
        providerBusinessName: provider.providerBusinessName,
        title: title.trim(),
        description: description.trim(),
        itemType,
        price: Number(price),
        size: size.trim() || null,
        stock: isVideo ? 0 : Number(stock),
        hasStock: !isVideo,
        isPaidContent: isVideo,
        unlockAfterPayment: isVideo,
        brand: brand.trim() || null,
        color: color.trim() || null,
        material: material.trim() || null,
        videoDuration: isVideo ? videoDuration : null,
        videoDurationMs: isVideo ? videoDurationMs : null,
        mediaType,
        mediaUrl: mediaUrls[0] || "",
        mediaUrls,
        storagePath: storagePaths[0] || null,
        storagePaths,
        files: uploadedFiles,
        isActive: true,
        currency: "GBP",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      console.log("SAVING SHOP ITEM:", shopItem);

      await addDoc(collection(db, "shops"), shopItem);

      Alert.alert("Success", "Shop item uploaded successfully.");
      resetForm();
    } catch (error) {
      console.log("Upload error:", error);
      Alert.alert("Error", error.message || "Failed to save item to the shop.");
    } finally {
      setLoading(false);
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
              style={[
                styles.optionButton,
                selected && styles.optionButtonActive,
              ]}
              onPress={() => setSelectedValue(option)}
            >
              <Text
                style={[styles.optionText, selected && styles.optionTextActive]}
              >
                {option}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );

  const renderFilePreview = () => {
    if (!mediaFiles.length) return null;

    if (isVideo) {
      return (
        <View style={styles.videoPreview}>
          <Ionicons name="videocam" size={42} color="#4F6BFF" />
          <Text style={styles.videoText}>1 video selected</Text>
          {!!videoDuration && (
            <Text style={styles.videoDurationText}>Duration: {videoDuration}</Text>
          )}
          <TouchableOpacity
            style={styles.removeSingleFileButton}
            onPress={() => removeFile(mediaFiles[0].uri)}
          >
            <Ionicons name="close" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <>
        <Text style={styles.previewTitle}>
          {isOnlineEquipment ? "Selected Files" : "Selected Images"}
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.previewRow}
        >
          {mediaFiles.map((file, index) => {
            const ext = getExtensionFromName(file.name, file.uri);
            const isImage = file.kind === "image";
            const isDoc = file.kind === "document";
            const isFileVideo = file.kind === "video";

            return (
              <View key={`${file.uri}-${index}`} style={styles.previewCard}>
                {isImage ? (
                  <Image
                    source={{ uri: file.uri }}
                    style={styles.previewImage}
                    resizeMode="contain"
                  />
                ) : (
                  <View style={styles.filePreviewBox}>
                    <Ionicons
                      name={
                        isDoc
                          ? "document-text-outline"
                          : isFileVideo
                          ? "videocam-outline"
                          : "attach-outline"
                      }
                      size={34}
                      color="#4F6BFF"
                    />
                    <Text style={styles.fileExtText}>
                      {(ext || "FILE").toUpperCase()}
                    </Text>
                    <Text numberOfLines={2} style={styles.fileNameText}>
                      {file.name}
                    </Text>
                  </View>
                )}

                <TouchableOpacity
                  style={styles.removeImageButton}
                  onPress={() => removeFile(file.uri)}
                >
                  <Ionicons name="close" size={16} color="#fff" />
                </TouchableOpacity>

                {!isOnlineEquipment && index === 0 && (
                  <View style={styles.coverBadge}>
                    <Text style={styles.coverBadgeText}>Cover</Text>
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>
      </>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.heading}>Upload Shop Item</Text>
          <Text style={styles.subHeading}>
            Add products, tools and tutorials to your store
          </Text>
        </View>

        <View style={styles.card}>
          {renderOptions("Item Type", itemTypes, itemType, (value) => {
            setItemType(value);
            setSize("");
            setMaterial("");
            setStock("");
            resetMediaState();
            setMediaType(
              value === "Tutorial Video"
                ? "video"
                : value === "Online Drawing Equipment"
                ? "mixed"
                : "image"
            );
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
            placeholder="Describe the product or tutorial"
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

          {!isVideo && (
            <>
              <Text style={styles.label}>Stock Quantity</Text>
              <TextInput
                value={stock}
                onChangeText={setStock}
                placeholder="Enter stock quantity"
                keyboardType="numeric"
                style={styles.input}
              />
            </>
          )}

          {isDrawing && renderOptions("Size", drawingSizes, size, setSize)}

          {isTshirt && renderOptions("Size", tshirtSizes, size, setSize)}

          {isTshirt && (
            <>
              <Text style={styles.label}>Color</Text>
              <TextInput
                value={color}
                onChangeText={setColor}
                placeholder="Example: Black, White, Red"
                style={styles.input}
              />

              {renderOptions(
                "Material",
                tshirtMaterials,
                material,
                setMaterial
              )}
            </>
          )}

          {!isVideo && (
            <>
              <Text style={styles.label}>Brand</Text>
              <TextInput
                value={brand}
                onChangeText={setBrand}
                placeholder="Enter brand name if needed"
                style={styles.input}
              />
            </>
          )}

          {isVideo && (
            <>
              <Text style={styles.label}>Video Duration</Text>
              <TextInput
                value={videoDuration}
                editable={false}
                placeholder="This will be filled automatically from the video"
                style={[styles.input, styles.disabledInput]}
              />
              <Text style={styles.helperText}>
                Tutorial videos must be no more than 10 minutes.
              </Text>
            </>
          )}

          <Text style={styles.label}>
            {isVideo
              ? "Upload Video"
              : isOnlineEquipment
              ? "Upload Any File Type"
              : "Upload Product Images"}
          </Text>

          <TouchableOpacity style={styles.mediaButton} onPress={handlePickMedia}>
            <Ionicons
              name={
                isVideo
                  ? "videocam-outline"
                  : isOnlineEquipment
                  ? "document-attach-outline"
                  : "images-outline"
              }
              size={22}
              color="#fff"
            />
            <Text style={styles.mediaButtonText}>
              {isVideo
                ? "Choose Video"
                : isOnlineEquipment
                ? "Choose Files"
                : "Choose Images"}
            </Text>
          </TouchableOpacity>

          {renderFilePreview()}

          {isVideo && mediaFiles.length > 0 && (
            <View style={styles.hiddenVideoContainer}>
              <Video
                source={{ uri: mediaFiles[0].uri }}
                style={styles.hiddenVideo}
                onLoad={(status) => {
                  const durationMs = Number(status?.durationMillis || 0);
                  if (!durationMs) return;

                  if (durationMs > 10 * 60 * 1000) {
                    Alert.alert(
                      "Video too long",
                      "Tutorial videos must be no more than 10 minutes."
                    );
                    resetMediaState();
                    return;
                  }

                  setVideoDurationMs(durationMs);
                  setVideoDuration(formatDuration(durationMs));
                }}
                shouldPlay={false}
                isMuted
              />
            </View>
          )}

          <TouchableOpacity
            style={[styles.saveButton, loading && { opacity: 0.7 }]}
            onPress={handleSave}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons
                  name="checkmark-circle-outline"
                  size={22}
                  color="#fff"
                />
                <Text style={styles.saveButtonText}>Save to Shop</Text>
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
  container: {
    padding: 18,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 18,
  },
  heading: {
    fontSize: 26,
    fontWeight: "800",
    color: "#111827",
  },
  subHeading: {
    fontSize: 14,
    color: "#6B7280",
    marginTop: 6,
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
  disabledInput: {
    color: "#6B7280",
    backgroundColor: "#F3F4F6",
  },
  helperText: {
    marginTop: 6,
    fontSize: 12,
    color: "#6B7280",
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
  filePreviewBox: {
    flex: 1,
    width: "100%",
    justifyContent: "center",
    alignItems: "center",
    padding: 10,
  },
  fileExtText: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: "800",
    color: "#111827",
  },
  fileNameText: {
    marginTop: 6,
    fontSize: 11,
    color: "#374151",
    textAlign: "center",
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
  removeSingleFileButton: {
    marginTop: 12,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#111827",
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
  videoPreview: {
    marginTop: 16,
    minHeight: 180,
    borderRadius: 16,
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  videoText: {
    marginTop: 8,
    fontSize: 15,
    fontWeight: "600",
    color: "#374151",
  },
  videoDurationText: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: "700",
    color: "#111827",
  },
  hiddenVideoContainer: {
    width: 1,
    height: 1,
    opacity: 0,
    overflow: "hidden",
  },
  hiddenVideo: {
    width: 1,
    height: 1,
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
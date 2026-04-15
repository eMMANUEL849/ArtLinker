import React, { useEffect, useMemo, useState } from "react";
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  Image,
  Linking,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { onAuthStateChanged } from "firebase/auth";
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { auth, db } from "../../config/firebase";

function formatDate(value) {
  try {
    if (!value) return "No date";
    if (typeof value?.toDate === "function") {
      return value.toDate().toLocaleDateString();
    }
    if (value?.seconds) {
      return new Date(value.seconds * 1000).toLocaleDateString();
    }
    return "No date";
  } catch {
    return "No date";
  }
}

function getInitials(name) {
  const text = String(name || "SP").trim();
  const parts = text.split(" ").filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0]?.[0] || ""}${parts[1]?.[0] || ""}`.toUpperCase();
}

function getProviderSkill(provider) {
  const rawSkill =
    provider?.skill ||
    provider?.skills ||
    provider?.specialty ||
    provider?.speciality ||
    provider?.serviceType ||
    provider?.category ||
    provider?.roleTitle ||
    "Creative Services";

  if (Array.isArray(rawSkill)) {
    return rawSkill.filter(Boolean).join(", ");
  }

  return String(rawSkill || "Creative Services");
}

function normalizeImages(provider) {
  const candidates = [
    ...(Array.isArray(provider?.workImages) ? provider.workImages : []),
    ...(Array.isArray(provider?.portfolioImages) ? provider.portfolioImages : []),
    ...(Array.isArray(provider?.galleryImages) ? provider.galleryImages : []),
    ...(Array.isArray(provider?.artworkImages) ? provider.artworkImages : []),
    ...(Array.isArray(provider?.mediaUrls) ? provider.mediaUrls : []),
    ...(Array.isArray(provider?.sampleWorks) ? provider.sampleWorks : []),
    ...(Array.isArray(provider?.postImages) ? provider.postImages : []),
  ];

  if (provider?.workImage) candidates.push(provider.workImage);
  if (provider?.portfolioImage) candidates.push(provider.portfolioImage);
  if (provider?.galleryImage) candidates.push(provider.galleryImage);
  if (provider?.imageUrl) candidates.push(provider.imageUrl);
  if (provider?.profileImage) candidates.push(provider.profileImage);
  if (provider?.photoURL) candidates.push(provider.photoURL);

  return [...new Set(candidates.filter((item) => typeof item === "string" && item.trim()))];
}

function isServiceProvider(user) {
  const role = String(user?.role || user?.accountType || user?.userType || "")
    .trim()
    .toLowerCase();

  return [
    "service_provider",
    "service provider",
    "serviceprovider",
    "provider",
    "business",
  ].includes(role);
}

function normalizeFileEntry(value, fallbackName = "Download File") {
  if (!value) return null;

  if (typeof value === "string" && value.trim()) {
    return {
      name: fallbackName,
      url: value.trim(),
    };
  }

  if (typeof value === "object") {
    const url =
      value.url ||
      value.fileUrl ||
      value.downloadURL ||
      value.downloadUrl ||
      value.uri ||
      value.imageUrl ||
      value.videoUrl;

    if (typeof url === "string" && url.trim()) {
      return {
        name:
          value.name ||
          value.fileName ||
          value.title ||
          value.label ||
          fallbackName,
        url: url.trim(),
      };
    }
  }

  return null;
}

function extractDownloadables(item) {
  const files = [];

  const possibleArrays = [
    item?.deliverables,
    item?.attachments,
    item?.files,
    item?.sentItems,
    item?.completedFiles,
    item?.finalFiles,
    item?.downloadFiles,
  ];

  possibleArrays.forEach((arr, arrIndex) => {
    if (Array.isArray(arr)) {
      arr.forEach((entry, index) => {
        const file = normalizeFileEntry(entry, `File ${arrIndex + 1}-${index + 1}`);
        if (file) files.push(file);
      });
    }
  });

  const singleFields = [
    ["deliverableUrl", "Deliverable"],
    ["downloadUrl", "Download"],
    ["fileUrl", "File"],
    ["attachmentUrl", "Attachment"],
    ["imageUrl", "Image"],
    ["finalWorkUrl", "Final Work"],
    ["completedImage", "Completed Image"],
    ["completedFileUrl", "Completed File"],
    ["artworkUrl", "Artwork"],
  ];

  singleFields.forEach(([field, label]) => {
    const file = normalizeFileEntry(item?.[field], label);
    if (file) files.push(file);
  });

  const seen = new Set();
  return files.filter((file) => {
    const key = `${file.name}-${file.url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isAcceptedStatus(status) {
  return ["Accepted", "In Progress", "Ongoing"].includes(String(status || "").trim());
}

function isCompletedStatus(status) {
  return ["Completed", "Resolved", "Closed"].includes(String(status || "").trim());
}

function canChatForStatus(status) {
  return [
    "Accepted",
    "In Progress",
    "Ongoing",
    "Completed",
    "Resolved",
    "Closed",
  ].includes(String(status || "").trim());
}

function ProviderCard({ item, onPress, imageWidth }) {
  const providerName =
    item.businessName || item.fullName || item.name || "Service Provider";
  const skill = getProviderSkill(item);
  const email = item.email || "No email";
  const location = item.locationName || item.city || item.address || "No location";
  const images = normalizeImages(item);
  const profileImage = item?.profileImage || item?.photoURL || item?.imageUrl || "";

  return (
    <TouchableOpacity
      style={styles.providerCard}
      onPress={() => onPress(item)}
      activeOpacity={0.9}
    >
      <View style={styles.providerTopRow}>
        {profileImage ? (
          <Image source={{ uri: profileImage }} style={styles.providerProfileImage} />
        ) : (
          <View style={styles.providerAvatar}>
            <Text style={styles.providerAvatarText}>{getInitials(providerName)}</Text>
          </View>
        )}

        <View style={styles.providerMainInfo}>
          <Text style={styles.providerName}>{providerName}</Text>
          <Text style={styles.providerSkillLabel}>Skill: {skill}</Text>
        </View>

        <View style={styles.requestNowBadge}>
          <Ionicons name="arrow-forward-outline" size={16} color="#4F6BFF" />
        </View>
      </View>

      <View style={styles.providerMetaWrap}>
        <View style={styles.metaChip}>
          <Ionicons name="mail-outline" size={14} color="#6B7280" />
          <Text style={styles.metaChipText}>{email}</Text>
        </View>

        <View style={styles.metaChip}>
          <Ionicons name="location-outline" size={14} color="#6B7280" />
          <Text style={styles.metaChipText}>{location}</Text>
        </View>
      </View>

      <View style={styles.workPreviewSection}>
        <View style={styles.workPreviewHeader}>
          <Text style={styles.workPreviewTitle}>Artwork Preview</Text>
          {images.length > 0 && (
            <Text style={styles.workCountText}>{images.length} item{images.length > 1 ? "s" : ""}</Text>
          )}
        </View>

        {images.length === 0 ? (
          <View style={styles.noWorkBox}>
            <Ionicons name="images-outline" size={18} color="#9CA3AF" />
            <Text style={styles.noWorkText}>No artwork uploaded yet</Text>
          </View>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            nestedScrollEnabled
            contentContainerStyle={styles.workImagesRow}
          >
            {images.map((img, index) => (
              <Image
                key={`${item.id}-${index}`}
                source={{ uri: img }}
                style={[
                  styles.workImage,
                  { width: imageWidth, height: imageWidth * 0.78 },
                ]}
                resizeMode="cover"
              />
            ))}
          </ScrollView>
        )}
      </View>
    </TouchableOpacity>
  );
}

export default function RequestsScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const imageWidth = Math.min(150, Math.max(120, width * 0.34));

  const [currentUser, setCurrentUser] = useState(null);
  const [currentUserProfile, setCurrentUserProfile] = useState(null);
  const [providers, setProviders] = useState([]);
  const [myRequests, setMyRequests] = useState([]);
  const [loadingProviders, setLoadingProviders] = useState(true);
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const [requestTitle, setRequestTitle] = useState("");
  const [requestDescription, setRequestDescription] = useState("");
  const [requestBudget, setRequestBudget] = useState("");
  const [requestSkill, setRequestSkill] = useState("");
  const [requestLocation, setRequestLocation] = useState("");

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (!user) {
        setCurrentUser(null);
        setCurrentUserProfile(null);
        router.replace("/auth/login");
        return;
      }
      setCurrentUser(user);
    });

    return () => unsubscribeAuth();
  }, [router]);

  useEffect(() => {
    if (!currentUser?.uid) return;

    const unsubscribe = onSnapshot(
      doc(db, "users", currentUser.uid),
      (snap) => {
        if (snap.exists()) {
          setCurrentUserProfile({ id: snap.id, ...snap.data() });
        } else {
          setCurrentUserProfile(null);
        }
      },
      (error) => {
        console.log("Current user profile error:", error);
      }
    );

    return () => unsubscribe();
  }, [currentUser]);

  useEffect(() => {
    setLoadingProviders(true);

    const unsubscribe = onSnapshot(
      collection(db, "users"),
      (snapshot) => {
        const items = snapshot.docs
          .map((docSnap) => ({
            id: docSnap.id,
            ...docSnap.data(),
          }))
          .filter((item) => isServiceProvider(item))
          .filter((item) => item.id !== currentUser?.uid);

        items.sort((a, b) => {
          const aName = String(a.businessName || a.fullName || a.name || "");
          const bName = String(b.businessName || b.fullName || b.name || "");
          return aName.localeCompare(bName);
        });

        setProviders(items);
        setLoadingProviders(false);
      },
      (error) => {
        console.log("Providers load error:", error);
        setLoadingProviders(false);
        Alert.alert("Error", "Failed to load service providers.");
      }
    );

    return () => unsubscribe();
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser?.uid) {
      setMyRequests([]);
      setLoadingRequests(false);
      return;
    }

    setLoadingRequests(true);

    const unsubscribe = onSnapshot(
      collection(db, "jobs"),
      (snapshot) => {
        const items = snapshot.docs
          .map((docSnap) => ({
            id: docSnap.id,
            ...docSnap.data(),
          }))
          .filter((item) => item.clientId === currentUser.uid);

        items.sort((a, b) => {
          const aTime = a.createdAt?.seconds || 0;
          const bTime = b.createdAt?.seconds || 0;
          return bTime - aTime;
        });

        setMyRequests(items);
        setLoadingRequests(false);
      },
      (error) => {
        console.log("User requests load error:", error);
        setLoadingRequests(false);
      }
    );

    return () => unsubscribe();
  }, [currentUser]);

  const stats = useMemo(() => {
    const total = myRequests.length;
    const pending = myRequests.filter((item) =>
      ["Pending", "Requested", "Awaiting Response"].includes(item.status)
    ).length;
    const active = myRequests.filter((item) =>
      ["Accepted", "In Progress", "Ongoing"].includes(item.status)
    ).length;
    const completed = myRequests.filter((item) =>
      ["Completed", "Resolved", "Closed"].includes(item.status)
    ).length;

    return [
      { id: "1", label: "My Requests", value: String(total) },
      { id: "2", label: "Pending", value: String(pending) },
      { id: "3", label: "Active", value: String(active) },
      { id: "4", label: "Completed", value: String(completed) },
    ];
  }, [myRequests]);

  const sentItems = useMemo(() => {
    return myRequests;
  }, [myRequests]);

  const openRequestModal = (provider) => {
    setSelectedProvider(provider);
    setRequestTitle("");
    setRequestDescription("");
    setRequestBudget("");
    setRequestSkill(getProviderSkill(provider));
    setRequestLocation(
      currentUserProfile?.address ||
        currentUserProfile?.locationName ||
        currentUserProfile?.city ||
        ""
    );
    setModalVisible(true);
  };

  const clearRequestForm = () => {
    setRequestTitle("");
    setRequestDescription("");
    setRequestBudget("");
    setRequestSkill("");
    setRequestLocation("");
    setSelectedProvider(null);
  };

  const handleSubmitRequest = async () => {
    if (submitting) return;

    try {
      if (!currentUser?.uid) {
        Alert.alert("Login Required", "Please log in first.");
        return;
      }

      if (!selectedProvider?.id) {
        Alert.alert("Error", "Please select a provider.");
        return;
      }

      const cleanTitle = requestTitle.trim();
      const cleanDescription = requestDescription.trim();
      const cleanSkill = requestSkill.trim();
      const cleanLocation = requestLocation.trim();
      const cleanBudget = requestBudget.trim();

      if (!cleanTitle) {
        Alert.alert("Required", "Please enter a request title.");
        return;
      }

      if (!cleanDescription) {
        Alert.alert("Required", "Please enter a request description.");
        return;
      }

      const numericBudget =
        cleanBudget && !Number.isNaN(Number(cleanBudget))
          ? Number(cleanBudget)
          : null;

      setSubmitting(true);

      const clientName =
        currentUserProfile?.fullName ||
        currentUserProfile?.name ||
        currentUser.displayName ||
        currentUser.email ||
        "Customer";

      const clientEmail = currentUserProfile?.email || currentUser.email || "";

      const providerName =
        selectedProvider.businessName ||
        selectedProvider.fullName ||
        selectedProvider.name ||
        "Service Provider";

      const providerSkill = getProviderSkill(selectedProvider);
      const providerWorkImages = normalizeImages(selectedProvider);

      const jobPayload = {
        title: cleanTitle,
        description: cleanDescription,
        details: cleanDescription,
        requestedSkill: cleanSkill || providerSkill,
        serviceType: cleanSkill || providerSkill,
        serviceName: cleanSkill || cleanTitle,
        skill: cleanSkill || providerSkill,

        clientId: currentUser.uid,
        clientName,
        clientEmail,
        customerName: clientName,
        userId: currentUser.uid,
        userName: clientName,

        providerId: selectedProvider.id,
        providerName,
        providerEmail: selectedProvider.email || "",
        providerSkill,
        providerWorkImages,

        locationName: cleanLocation || "",
        address: cleanLocation || "",

        price: numericBudget,
        budget: numericBudget,
        amount: numericBudget,

        status: "Pending",
        source: "user_request",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      const jobRef = await addDoc(collection(db, "jobs"), jobPayload);

      try {
        await addDoc(collection(db, "notifications"), {
          userId: selectedProvider.id,
          type: "new_service_request",
          title: "New Service Request",
          message: `${clientName} sent you a new request for "${cleanTitle}".`,
          providerId: selectedProvider.id,
          providerName,
          clientId: currentUser.uid,
          clientName,
          clientEmail,
          requestTitle: cleanTitle,
          requestDescription: cleanDescription,
          requestedSkill: cleanSkill || providerSkill,
          requestId: jobRef.id,
          read: false,
          createdAt: serverTimestamp(),
        });
      } catch (notificationError) {
        console.log("Notification write failed but request was saved:", notificationError);
      }

      clearRequestForm();
      setModalVisible(false);

      Alert.alert("Success", "Your request has been sent to the service provider.");
    } catch (error) {
      console.log("Submit request error:", error);
      Alert.alert(
        "Error",
        error?.message || "Failed to send request. Check Firestore rules for jobs and notifications."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownloadItem = async (file) => {
    try {
      if (!file?.url) {
        Alert.alert("No File", "No downloadable file found for this item.");
        return;
      }

      const supported = await Linking.canOpenURL(file.url);
      if (!supported) {
        Alert.alert("Error", "This file cannot be opened on your device.");
        return;
      }

      await Linking.openURL(file.url);
    } catch (error) {
      console.log("Download item error:", error);
      Alert.alert("Error", "Failed to open or download this file.");
    }
  };

  const handleOpenChat = async (item) => {
    try {
      if (!currentUser?.uid) {
        Alert.alert("Login Required", "Please log in first.");
        return;
      }

      if (!item?.providerId) {
        Alert.alert("Error", "Provider details are missing for this request.");
        return;
      }

      const providerName = item.providerName || "Service Provider";
      const chatId = `job_${item.id}`;
      const chatTitle = item.title || "Request Chat";

      await setDoc(
        doc(db, "chats", chatId),
        {
          chatId,
          jobId: item.id,
          title: chatTitle,
          clientId: currentUser.uid,
          clientName:
            currentUserProfile?.fullName ||
            currentUserProfile?.name ||
            currentUser.displayName ||
            currentUser.email ||
            "Customer",
          providerId: item.providerId,
          providerName,
          participants: [currentUser.uid, item.providerId],
          participantIds: [currentUser.uid, item.providerId],
          lastMessageAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          status: "active",
          source: "request_chat",
        },
        { merge: true }
      );

      router.push({
        pathname: "/users/dms",
        params: {
          chatId,
          jobId: item.id,
          providerId: item.providerId,
          providerName,
          title: chatTitle,
        },
      });
    } catch (error) {
      console.log("Open chat error:", error);
      Alert.alert("Error", "Failed to open chat.");
    }
  };

  const getStatusStyle = (status) => {
    if (isCompletedStatus(status)) {
      return styles.statusCompleted;
    }
    if (isAcceptedStatus(status)) {
      return styles.statusInProgress;
    }
    return styles.statusPending;
  };

  const renderProvider = ({ item }) => {
    return <ProviderCard item={item} onPress={openRequestModal} imageWidth={imageWidth} />;
  };

  const renderRequest = ({ item, showActions = false, showDownloads = false }) => {
    const providerName = item.providerName || "Service Provider";
    const title = item.title || "Untitled Request";
    const status = item.status || "Pending";
    const description = item.description || item.details || "";
    const budget = item.price || item.budget || item.amount;
    const skill = item.requestedSkill || item.skill || item.serviceType || "Service";
    const files = extractDownloadables(item);

    return (
      <View style={styles.requestCard}>
        <View style={styles.requestTopRow}>
          <View style={styles.requestIconWrap}>
            <Ionicons name="document-text-outline" size={20} color="#4F6BFF" />
          </View>

          <View style={styles.requestMainInfo}>
            <Text style={styles.requestTitle}>{title}</Text>
            <Text style={styles.requestProvider}>Provider: {providerName}</Text>
          </View>

          <View style={[styles.statusBadge, getStatusStyle(status)]}>
            <Text style={styles.statusText}>{status}</Text>
          </View>
        </View>

        <Text style={styles.requestSkillText}>Skill: {skill}</Text>

        {!!description && (
          <Text style={styles.requestDescription} numberOfLines={3}>
            {description}
          </Text>
        )}

        <View style={styles.requestMetaRow}>
          <View style={styles.requestMetaItem}>
            <Ionicons name="cash-outline" size={15} color="#6B7280" />
            <Text style={styles.requestMetaText}>
              {budget ? `£${budget}` : "No budget"}
            </Text>
          </View>

          <View style={styles.requestMetaItem}>
            <Ionicons name="calendar-outline" size={15} color="#6B7280" />
            <Text style={styles.requestMetaText}>{formatDate(item.createdAt)}</Text>
          </View>
        </View>

        {showDownloads && (
          <View style={styles.downloadSection}>
            <Text style={styles.downloadTitle}>Sent Item Downloads</Text>

            {files.length === 0 ? (
              <View style={styles.noDownloadBox}>
                <Ionicons name="download-outline" size={16} color="#9CA3AF" />
                <Text style={styles.noDownloadText}>No downloadable item yet</Text>
              </View>
            ) : (
              files.slice(0, 4).map((file, index) => (
                <TouchableOpacity
                  key={`${item.id}-file-${index}`}
                  style={styles.downloadButton}
                  onPress={() => handleDownloadItem(file)}
                  activeOpacity={0.88}
                >
                  <Ionicons name="download-outline" size={16} color="#111827" />
                  <Text style={styles.downloadButtonText} numberOfLines={1}>
                    {file.name || `Download ${index + 1}`}
                  </Text>
                </TouchableOpacity>
              ))
            )}
          </View>
        )}

        {showActions && canChatForStatus(status) && (
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={styles.chatButton}
              onPress={() => handleOpenChat(item)}
              activeOpacity={0.9}
            >
              <Ionicons name="chatbubble-ellipses-outline" size={17} color="#FFFFFF" />
              <Text style={styles.chatButtonText}>
                {isCompletedStatus(status) ? "View Chat" : "Chat with Provider"}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.headerRow}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back-outline" size={22} color="#111827" />
        </TouchableOpacity>

        <View style={styles.headerTextWrap}>
          <Text style={styles.logo}>ArtLinker</Text>
          <Text style={styles.title}>Requests</Text>
          <Text style={styles.subtitle}>
            Send a request directly to a service provider
          </Text>
        </View>

        <View style={styles.headerSpacer} />
      </View>

      <FlatList
        data={providers}
        keyExtractor={(item) => item.id}
        renderItem={renderProvider}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <>
            <View style={styles.heroCard}>
              <View style={styles.heroIconWrap}>
                <Ionicons name="briefcase-outline" size={24} color="#4F6BFF" />
              </View>
              <View style={styles.heroTextWrap}>
                <Text style={styles.heroTitle}>Request Creative Services</Text>
                <Text style={styles.heroSubtitle}>
                  Browse provider skills, view their work, and send a request.
                </Text>
              </View>
            </View>

            <View style={styles.statsGrid}>
              {stats.map((item) => (
                <View key={item.id} style={styles.statCard}>
                  <Text style={styles.statValue}>{item.value}</Text>
                  <Text style={styles.statLabel}>{item.label}</Text>
                </View>
              ))}
            </View>

            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>My Recent Requests</Text>
              <Text style={styles.sectionSubtitle}>
                Requests you have already sent
              </Text>
            </View>

            {loadingRequests ? (
              <View style={styles.inlineLoader}>
                <ActivityIndicator size="small" color="#4F6BFF" />
                <Text style={styles.inlineLoaderText}>Loading your requests...</Text>
              </View>
            ) : myRequests.length === 0 ? (
              <View style={styles.emptyRequestsBox}>
                <Ionicons name="folder-open-outline" size={36} color="#9CA3AF" />
                <Text style={styles.emptyTitle}>No requests yet</Text>
                <Text style={styles.emptyText}>
                  Once you send a request, it will appear here.
                </Text>
              </View>
            ) : (
              <View style={styles.requestsSection}>
                {myRequests.slice(0, 4).map((item) => (
                  <View key={item.id}>
                    {renderRequest({ item, showActions: true, showDownloads: false })}
                  </View>
                ))}
              </View>
            )}

            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Sent Items</Text>
              <Text style={styles.sectionSubtitle}>
                View your sent requests and download available items
              </Text>
            </View>

            {loadingRequests ? (
              <View style={styles.inlineLoader}>
                <ActivityIndicator size="small" color="#4F6BFF" />
                <Text style={styles.inlineLoaderText}>Loading sent items...</Text>
              </View>
            ) : sentItems.length === 0 ? (
              <View style={styles.emptyRequestsBox}>
                <Ionicons name="send-outline" size={36} color="#9CA3AF" />
                <Text style={styles.emptyTitle}>No sent items yet</Text>
                <Text style={styles.emptyText}>
                  Sent requests and downloadable files will appear here.
                </Text>
              </View>
            ) : (
              <View style={styles.requestsSection}>
                {sentItems.map((item) => (
                  <View key={`sent-${item.id}`}>
                    {renderRequest({ item, showActions: true, showDownloads: true })}
                  </View>
                ))}
              </View>
            )}

            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Available Service Providers</Text>
              <Text style={styles.sectionSubtitle}>
                All service provider accounts, with their skill and artwork preview
              </Text>
            </View>
          </>
        }
        ListEmptyComponent={
          loadingProviders ? (
            <View style={styles.centerBox}>
              <ActivityIndicator size="large" color="#4F6BFF" />
              <Text style={styles.loadingText}>Loading providers...</Text>
            </View>
          ) : (
            <View style={styles.emptyBox}>
              <Ionicons name="people-outline" size={42} color="#9CA3AF" />
              <Text style={styles.emptyTitle}>No providers found</Text>
              <Text style={styles.emptyText}>
                Service provider accounts will appear here once they are added.
              </Text>
            </View>
          )
        }
      />

      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => {
          clearRequestForm();
          setModalVisible(false);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>New Request</Text>
                <Text style={styles.modalSubtitle}>
                  {selectedProvider?.businessName ||
                    selectedProvider?.fullName ||
                    selectedProvider?.name ||
                    "Service Provider"}
                </Text>
              </View>

              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => {
                  clearRequestForm();
                  setModalVisible(false);
                }}
              >
                <Ionicons name="close-outline" size={22} color="#111827" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.inputLabel}>Request Title</Text>
              <TextInput
                style={styles.input}
                placeholder="Example: Custom portrait artwork"
                placeholderTextColor="#9CA3AF"
                value={requestTitle}
                onChangeText={setRequestTitle}
              />

              <Text style={styles.inputLabel}>Skill or Service Needed</Text>
              <TextInput
                style={styles.input}
                placeholder="Example: Digital Illustration"
                placeholderTextColor="#9CA3AF"
                value={requestSkill}
                onChangeText={setRequestSkill}
              />

              <Text style={styles.inputLabel}>Description</Text>
              <TextInput
                style={styles.textArea}
                placeholder="Describe exactly what you need"
                placeholderTextColor="#9CA3AF"
                value={requestDescription}
                onChangeText={setRequestDescription}
                multiline
              />

              <Text style={styles.inputLabel}>Budget</Text>
              <TextInput
                style={styles.input}
                placeholder="Example: 150"
                placeholderTextColor="#9CA3AF"
                value={requestBudget}
                onChangeText={setRequestBudget}
                keyboardType="numeric"
              />

              <Text style={styles.inputLabel}>Location</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter your location"
                placeholderTextColor="#9CA3AF"
                value={requestLocation}
                onChangeText={setRequestLocation}
              />

              <TouchableOpacity
                style={styles.submitButton}
                onPress={handleSubmitRequest}
                disabled={submitting}
                activeOpacity={0.88}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="send-outline" size={18} color="#FFFFFF" />
                    <Text style={styles.submitButtonText}>Send Request</Text>
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
    backgroundColor: "#F7F8FC",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  headerTextWrap: {
    flex: 1,
    alignItems: "center",
  },
  headerSpacer: {
    width: 52,
  },
  logo: {
    fontSize: 28,
    fontWeight: "800",
    color: "#f06ce9",
  },
  title: {
    marginTop: 4,
    fontSize: 24,
    fontWeight: "900",
    color: "#111827",
  },
  subtitle: {
    marginTop: 6,
    fontSize: 12,
    color: "#9CA3AF",
    textAlign: "center",
  },
  listContent: {
    paddingHorizontal: 14,
    paddingBottom: 24,
  },
  heroCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 16,
    marginTop: 6,
    marginBottom: 14,
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  heroIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#EEF2FF",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  heroTextWrap: {
    flex: 1,
  },
  heroTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#111827",
  },
  heroSubtitle: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 18,
    color: "#6B7280",
  },
  centerBox: {
    paddingVertical: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 10,
    color: "#6B7280",
    fontSize: 14,
  },
  inlineLoader: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 14,
    marginBottom: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  inlineLoaderText: {
    marginLeft: 8,
    fontSize: 13,
    color: "#6B7280",
    fontWeight: "600",
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  statCard: {
    width: "48%",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 12,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  statValue: {
    fontSize: 22,
    fontWeight: "800",
    color: "#111827",
  },
  statLabel: {
    marginTop: 4,
    fontSize: 12,
    color: "#6B7280",
    fontWeight: "600",
  },
  sectionCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#111827",
  },
  sectionSubtitle: {
    fontSize: 12,
    color: "#9CA3AF",
    marginTop: 4,
  },
  requestsSection: {
    marginBottom: 6,
  },
  requestCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  requestTopRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  requestIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#EEF2FF",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  requestMainInfo: {
    flex: 1,
  },
  requestTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#111827",
  },
  requestProvider: {
    marginTop: 4,
    fontSize: 12,
    color: "#6B7280",
  },
  requestSkillText: {
    marginTop: 10,
    fontSize: 12,
    fontWeight: "700",
    color: "#4F6BFF",
  },
  requestDescription: {
    marginTop: 10,
    fontSize: 12,
    lineHeight: 18,
    color: "#4B5563",
  },
  requestMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 12,
  },
  requestMetaItem: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: 16,
    marginTop: 4,
  },
  requestMetaText: {
    marginLeft: 5,
    fontSize: 12,
    color: "#6B7280",
  },
  downloadSection: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#EEF2F7",
  },
  downloadTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 10,
  },
  noDownloadBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  noDownloadText: {
    marginLeft: 8,
    fontSize: 12,
    color: "#9CA3AF",
  },
  downloadButton: {
    height: 42,
    borderRadius: 12,
    backgroundColor: "#F3F4F6",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  downloadButtonText: {
    marginLeft: 8,
    flex: 1,
    fontSize: 13,
    fontWeight: "700",
    color: "#111827",
  },
  actionRow: {
    marginTop: 14,
  },
  chatButton: {
    height: 46,
    borderRadius: 14,
    backgroundColor: "#4F6BFF",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  chatButtonText: {
    marginLeft: 8,
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
  providerCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 14,
    marginBottom: 14,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  providerTopRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  providerAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#EEF2FF",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  providerProfileImage: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 12,
    backgroundColor: "#EEF2FF",
  },
  providerAvatarText: {
    fontSize: 16,
    fontWeight: "900",
    color: "#4F6BFF",
  },
  providerMainInfo: {
    flex: 1,
  },
  providerName: {
    fontSize: 15,
    fontWeight: "800",
    color: "#111827",
  },
  providerSkillLabel: {
    marginTop: 4,
    fontSize: 12,
    color: "#4F6BFF",
    fontWeight: "700",
  },
  requestNowBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#EEF2FF",
    justifyContent: "center",
    alignItems: "center",
  },
  providerMetaWrap: {
    marginTop: 12,
    gap: 8,
  },
  metaChip: {
    flexDirection: "row",
    alignItems: "center",
  },
  metaChipText: {
    marginLeft: 6,
    fontSize: 12,
    color: "#6B7280",
    flex: 1,
  },
  workPreviewSection: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#EEF2F7",
  },
  workPreviewHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  workPreviewTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#111827",
  },
  workCountText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#6B7280",
  },
  noWorkBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  noWorkText: {
    marginLeft: 8,
    fontSize: 12,
    color: "#9CA3AF",
  },
  workImagesRow: {
    paddingRight: 8,
  },
  workImage: {
    borderRadius: 14,
    marginRight: 10,
    backgroundColor: "#F3F4F6",
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  statusPending: {
    backgroundColor: "#FEF3C7",
  },
  statusInProgress: {
    backgroundColor: "#DBEAFE",
  },
  statusCompleted: {
    backgroundColor: "#DCFCE7",
  },
  statusText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#111827",
  },
  emptyBox: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    paddingVertical: 40,
    paddingHorizontal: 20,
    alignItems: "center",
    marginTop: 10,
  },
  emptyRequestsBox: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    paddingVertical: 30,
    paddingHorizontal: 20,
    alignItems: "center",
    marginBottom: 14,
  },
  emptyTitle: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: "800",
    color: "#111827",
  },
  emptyText: {
    marginTop: 6,
    fontSize: 12,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 18,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(17,24,39,0.35)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 24,
    maxHeight: "88%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 14,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: "#111827",
  },
  modalSubtitle: {
    marginTop: 4,
    fontSize: 13,
    color: "#6B7280",
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 8,
    marginTop: 8,
  },
  input: {
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#F9FAFB",
    paddingHorizontal: 12,
    fontSize: 14,
    color: "#111827",
  },
  textArea: {
    minHeight: 110,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#F9FAFB",
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 14,
    color: "#111827",
    textAlignVertical: "top",
  },
  submitButton: {
    marginTop: 18,
    height: 50,
    borderRadius: 16,
    backgroundColor: "#4F6BFF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  submitButtonText: {
    marginLeft: 8,
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
});
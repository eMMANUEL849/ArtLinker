import React, { useEffect, useMemo, useState } from "react";
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import { onAuthStateChanged } from "firebase/auth";
import {
  addDoc,
  collection,
  doc,
  increment,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { auth, db, storage } from "../../config/firebase";

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

function getImages(item) {
  const candidates = [
    ...(Array.isArray(item?.providerWorkImages) ? item.providerWorkImages : []),
    ...(Array.isArray(item?.workImages) ? item.workImages : []),
    ...(Array.isArray(item?.portfolioImages) ? item.portfolioImages : []),
    ...(Array.isArray(item?.mediaUrls) ? item.mediaUrls : []),
  ];

  if (item?.imageUrl) candidates.push(item.imageUrl);
  if (item?.workImage) candidates.push(item.workImage);

  return [...new Set(candidates.filter((img) => typeof img === "string" && img.trim()))];
}

function mergeUniqueJobs(...lists) {
  const map = new Map();

  lists.flat().forEach((item) => {
    if (item?.id) {
      map.set(item.id, item);
    }
  });

  return Array.from(map.values()).sort((a, b) => {
    const aTime = a.createdAt?.seconds || 0;
    const bTime = b.createdAt?.seconds || 0;
    return bTime - aTime;
  });
}

function isPendingStatus(status) {
  return ["Pending", "Requested", "Awaiting Response"].includes(status);
}

function isActiveStatus(status) {
  return ["Active", "In Progress", "Ongoing"].includes(status);
}

function isCompletedStatus(status) {
  return ["Completed", "Resolved", "Closed"].includes(status);
}

function canChatForStatus(status) {
  return [
    "Active",
    "In Progress",
    "Ongoing",
    "Completed",
    "Resolved",
    "Closed",
  ].includes(String(status || "").trim());
}

async function uploadFileToStorage(uri, path) {
  const response = await fetch(uri);
  const blob = await response.blob();
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, blob);
  return await getDownloadURL(storageRef);
}

export default function ServiceProviderRequestsScreen() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [updatingId, setUpdatingId] = useState("");

  const [jobsByProviderId, setJobsByProviderId] = useState([]);
  const [jobsByProviderDocId, setJobsByProviderDocId] = useState([]);
  const [jobsByProviderUid, setJobsByProviderUid] = useState([]);
  const [jobsByProviderUserId, setJobsByProviderUserId] = useState([]);
  const [jobsByProviderEmail, setJobsByProviderEmail] = useState([]);

  useEffect(() => {
    let unsub1 = null;
    let unsub2 = null;
    let unsub3 = null;
    let unsub4 = null;
    let unsub5 = null;

    const unsubAuth = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user || null);

      if (!user) {
        setLoading(false);
        router.replace("/auth/login");
        return;
      }

      setLoading(true);

      unsub1 = onSnapshot(
        query(collection(db, "jobs"), where("providerId", "==", user.uid)),
        (snapshot) => {
          setJobsByProviderId(
            snapshot.docs.map((docSnap) => ({
              id: docSnap.id,
              ...docSnap.data(),
            }))
          );
        },
        (error) => console.log("Jobs by providerId error:", error)
      );

      unsub2 = onSnapshot(
        query(collection(db, "jobs"), where("providerDocId", "==", user.uid)),
        (snapshot) => {
          setJobsByProviderDocId(
            snapshot.docs.map((docSnap) => ({
              id: docSnap.id,
              ...docSnap.data(),
            }))
          );
        },
        (error) => console.log("Jobs by providerDocId error:", error)
      );

      unsub3 = onSnapshot(
        query(collection(db, "jobs"), where("providerUid", "==", user.uid)),
        (snapshot) => {
          setJobsByProviderUid(
            snapshot.docs.map((docSnap) => ({
              id: docSnap.id,
              ...docSnap.data(),
            }))
          );
        },
        (error) => console.log("Jobs by providerUid error:", error)
      );

      unsub4 = onSnapshot(
        query(collection(db, "jobs"), where("providerUserId", "==", user.uid)),
        (snapshot) => {
          setJobsByProviderUserId(
            snapshot.docs.map((docSnap) => ({
              id: docSnap.id,
              ...docSnap.data(),
            }))
          );
        },
        (error) => console.log("Jobs by providerUserId error:", error)
      );

      if (user.email) {
        unsub5 = onSnapshot(
          query(collection(db, "jobs"), where("providerEmail", "==", user.email)),
          (snapshot) => {
            setJobsByProviderEmail(
              snapshot.docs.map((docSnap) => ({
                id: docSnap.id,
                ...docSnap.data(),
              }))
            );
          },
          (error) => console.log("Jobs by providerEmail error:", error)
        );
      } else {
        setJobsByProviderEmail([]);
      }
    });

    return () => {
      unsubAuth();
      if (unsub1) unsub1();
      if (unsub2) unsub2();
      if (unsub3) unsub3();
      if (unsub4) unsub4();
      if (unsub5) unsub5();
    };
  }, [router]);

  useEffect(() => {
    const merged = mergeUniqueJobs(
      jobsByProviderId,
      jobsByProviderDocId,
      jobsByProviderUid,
      jobsByProviderUserId,
      jobsByProviderEmail
    );
    setJobs(merged);
    setLoading(false);
  }, [
    jobsByProviderId,
    jobsByProviderDocId,
    jobsByProviderUid,
    jobsByProviderUserId,
    jobsByProviderEmail,
  ]);

  const stats = useMemo(() => {
    const pendingRequests = jobs.filter((job) => isPendingStatus(job.status)).length;
    const activeJobs = jobs.filter((job) => isActiveStatus(job.status)).length;
    const completedJobs = jobs.filter((job) => isCompletedStatus(job.status)).length;
    const sentFiles = jobs.filter((job) => job.deliveryStatus === "Sent").length;

    return [
      { id: "1", label: "Total Jobs", value: String(jobs.length) },
      { id: "2", label: "Pending", value: String(pendingRequests) },
      { id: "3", label: "Active", value: String(activeJobs) },
      { id: "4", label: "Completed", value: String(completedJobs) },
      { id: "5", label: "Files Sent", value: String(sentFiles) },
    ];
  }, [jobs]);

  const getStatusStyle = (status) => {
    if (isCompletedStatus(status)) return styles.statusCompleted;
    if (isActiveStatus(status)) return styles.statusInProgress;
    return styles.statusPending;
  };

  const sendUserNotification = async (job, title, message, extra = {}) => {
    try {
      const clientId = job.clientId || job.userId;
      if (!clientId) return;

      await addDoc(collection(db, "notifications"), {
        userId: clientId,
        type: extra.type || "job_update",
        title,
        message,
        jobId: job.id,
        providerId: currentUser?.uid || null,
        providerName:
          job.providerName || currentUser?.displayName || currentUser?.email || "Service Provider",
        clientId,
        read: false,
        createdAt: serverTimestamp(),
        ...extra,
      });
    } catch (error) {
      console.log("Notification error:", error);
    }
  };

  const acceptJob = async (job) => {
    try {
      setUpdatingId(job.id);

      await updateDoc(doc(db, "jobs", job.id), {
        status: "Active",
        acceptedAt: serverTimestamp(),
        acceptedBy: currentUser?.uid || null,
        updatedAt: serverTimestamp(),
      });

      await sendUserNotification(
        job,
        "Request Accepted",
        `Your request "${job.title || job.serviceName || "request"}" has been accepted and is now active.`,
        {
          type: "job_accepted",
          status: "Active",
        }
      );

      Alert.alert("Success", "Request accepted and moved to Active.");
    } catch (error) {
      console.log("Accept job error:", error);
      Alert.alert("Error", error.message || "Failed to accept request.");
    } finally {
      setUpdatingId("");
    }
  };

  const updateJobStatus = async (job, newStatus, type = "job_status_update") => {
    try {
      setUpdatingId(job.id);

      await updateDoc(doc(db, "jobs", job.id), {
        status: newStatus,
        updatedAt: serverTimestamp(),
      });

      await sendUserNotification(
        job,
        "Request Updated",
        `Your request "${job.title || job.serviceName || "request"}" is now ${newStatus}.`,
        { status: newStatus, type }
      );

      Alert.alert("Success", `Request updated to ${newStatus}.`);
    } catch (error) {
      console.log("Update job status error:", error);
      Alert.alert("Error", error.message || "Failed to update request.");
    } finally {
      setUpdatingId("");
    }
  };

  const addIncomeForCompletedJob = async (job) => {
    const amount = Number(job.price || job.budget || job.amount || 0);

    if (!currentUser?.uid) {
      throw new Error("Provider account is missing.");
    }

    if (amount <= 0) {
      throw new Error("This job has no valid amount to add to income.");
    }

    const jobRef = doc(db, "jobs", job.id);
    const earningsRef = doc(db, "earnings", currentUser.uid);

    await runTransaction(db, async (transaction) => {
      const jobSnap = await transaction.get(jobRef);

      if (!jobSnap.exists()) {
        throw new Error("Job not found.");
      }

      const latestJob = jobSnap.data();

      if (latestJob.incomeAdded === true) {
        return;
      }

      transaction.update(jobRef, {
        incomeAdded: true,
        incomeAddedAt: serverTimestamp(),
        incomeAmount: amount,
        incomeProviderId: currentUser.uid,
        updatedAt: serverTimestamp(),
      });

      transaction.set(
        earningsRef,
        {
          providerId: currentUser.uid,
          providerEmail: currentUser.email || "",
          totalIncome: increment(amount),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    });

    const freshJobRef = doc(db, "jobs", job.id);

    await setDoc(
      doc(db, "earnings", currentUser.uid),
      {
        providerId: currentUser.uid,
        providerEmail: currentUser.email || "",
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    try {
      const safeTransactionId = `${currentUser.uid}_${job.id}`;

      await setDoc(
        doc(db, "earning_transactions", safeTransactionId),
        {
          providerId: currentUser.uid,
          providerEmail: currentUser.email || "",
          jobId: job.id,
          title: job.title || job.serviceName || "Service Request",
          amount,
          type: "job_completed_income",
          createdAt: serverTimestamp(),
          jobRefId: freshJobRef.id,
        },
        { merge: true }
      );
    } catch (error) {
      console.log("Earning transaction log error:", error);
    }
  };

  const handleSendItem = async (job) => {
    try {
      setUpdatingId(job.id);

      const isDrawingRequest = String(
        job.itemType || job.requestedSkill || job.skill || ""
      )
        .toLowerCase()
        .includes("drawing");

      const itemType = isDrawingRequest ? "Drawing" : "Product";

      const picked = await DocumentPicker.getDocumentAsync({
        multiple: false,
        copyToCacheDirectory: true,
        type: "*/*",
      });

      if (picked.canceled || !picked.assets || picked.assets.length === 0) {
        setUpdatingId("");
        return;
      }

      const asset = picked.assets[0];
      const filename =
        asset.name || `${Date.now()}_${itemType.toLowerCase()}_file`;
      const storagePath = `job_deliveries/${currentUser?.uid || "provider"}/${job.id}/${Date.now()}_${filename}`;
      const fileUrl = await uploadFileToStorage(asset.uri, storagePath);

      await updateDoc(doc(db, "jobs", job.id), {
        deliveryStatus: "Sent",
        sentItemType: itemType,
        deliveryFileName: filename,
        deliveryFileUrl: fileUrl,
        completedFileUrl: fileUrl,
        finalWorkUrl: fileUrl,
        sentAt: serverTimestamp(),
        status: "Completed",
        completedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await addIncomeForCompletedJob(job);

      await sendUserNotification(
        job,
        `${itemType} Sent`,
        `Your ${itemType.toLowerCase()} for "${job.title || job.serviceName || "request"}" has been sent and the request is now completed.`,
        {
          type: "job_item_sent",
          deliveryStatus: "Sent",
          sentItemType: itemType,
          deliveryFileUrl: fileUrl,
          completedFileUrl: fileUrl,
          finalWorkUrl: fileUrl,
          status: "Completed",
        }
      );

      await sendUserNotification(
        job,
        "Request Completed",
        `Your request "${job.title || job.serviceName || "request"}" has been completed.`,
        {
          type: "job_completed",
          status: "Completed",
        }
      );

      Alert.alert("Success", `${itemType} uploaded and request completed. Income added to your account.`);
    } catch (error) {
      console.log("Send item error:", error);
      Alert.alert("Error", error.message || "Failed to send file.");
    } finally {
      setUpdatingId("");
    }
  };

  const handleCompleteOnly = async (job) => {
    Alert.alert(
      "Complete Request",
      "Do you want to complete this request and add the amount to your income?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Complete",
          onPress: async () => {
            try {
              setUpdatingId(job.id);

              await updateDoc(doc(db, "jobs", job.id), {
                status: "Completed",
                completedAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              });

              await addIncomeForCompletedJob(job);

              await sendUserNotification(
                job,
                "Request Completed",
                `Your request "${job.title || job.serviceName || "request"}" has been completed.`,
                {
                  status: "Completed",
                  type: "job_completed",
                }
              );

              Alert.alert("Success", "Request completed and income updated.");
            } catch (error) {
              console.log("Complete job error:", error);
              Alert.alert("Error", error.message || "Failed to complete request.");
            } finally {
              setUpdatingId("");
            }
          },
        },
      ]
    );
  };

  const handleOpenChat = async (job) => {
    try {
      if (!currentUser?.uid) {
        Alert.alert("Login Required", "Please log in first.");
        return;
      }

      const clientId = job.clientId || job.userId;
      const clientName =
        job.clientName || job.customerName || job.userName || "Customer";

      if (!clientId) {
        Alert.alert("Error", "Client details are missing for this request.");
        return;
      }

      const chatId = `job_${job.id}`;
      const chatTitle = job.title || job.serviceName || "Request Chat";

      router.push({
        pathname: "/service_provider/dms",
        params: {
          chatId,
          jobId: job.id,
          clientId,
          clientName,
          title: chatTitle,
        },
      });
    } catch (error) {
      console.log("Open chat error:", error);
      Alert.alert("Error", "Failed to open chat.");
    }
  };

  const renderActions = (item) => {
    const status = item.status || "Pending";
    const isUpdating = updatingId === item.id;

    const isDrawingRequest = String(
      item.itemType || item.requestedSkill || item.skill || ""
    )
      .toLowerCase()
      .includes("drawing");

    return (
      <>
        <View style={styles.actionRow}>
          {isPendingStatus(status) && (
            <TouchableOpacity
              style={[styles.actionButton, styles.acceptButton]}
              onPress={() => acceptJob(item)}
              disabled={isUpdating}
            >
              {isUpdating ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <>
                  <Ionicons name="checkmark-outline" size={16} color="#FFFFFF" />
                  <Text style={styles.actionButtonText}>Accept</Text>
                </>
              )}
            </TouchableOpacity>
          )}

          {status === "Active" && (
            <TouchableOpacity
              style={[styles.actionButton, styles.progressButton]}
              onPress={() => updateJobStatus(item, "In Progress")}
              disabled={isUpdating}
            >
              {isUpdating ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <>
                  <Ionicons name="hammer-outline" size={16} color="#FFFFFF" />
                  <Text style={styles.actionButtonText}>Start Work</Text>
                </>
              )}
            </TouchableOpacity>
          )}

          {isActiveStatus(status) && (
            <TouchableOpacity
              style={[styles.actionButton, styles.sendButton]}
              onPress={() => handleSendItem(item)}
              disabled={isUpdating}
            >
              {isUpdating ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <>
                  <Ionicons
                    name={isDrawingRequest ? "brush-outline" : "cube-outline"}
                    size={16}
                    color="#FFFFFF"
                  />
                  <Text style={styles.actionButtonText}>
                    {isDrawingRequest ? "Send Drawing" : "Send Product"}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          )}

          {isActiveStatus(status) && (
            <TouchableOpacity
              style={[styles.actionButton, styles.completeButton]}
              onPress={() => handleCompleteOnly(item)}
              disabled={isUpdating}
            >
              {isUpdating ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <>
                  <Ionicons
                    name="checkmark-done-outline"
                    size={16}
                    color="#FFFFFF"
                  />
                  <Text style={styles.actionButtonText}>Complete</Text>
                </>
              )}
            </TouchableOpacity>
          )}

          {canChatForStatus(status) && (
            <TouchableOpacity
              style={[styles.actionButton, styles.chatButton]}
              onPress={() => handleOpenChat(item)}
              disabled={isUpdating}
            >
              {isUpdating ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <>
                  <Ionicons
                    name="chatbubble-ellipses-outline"
                    size={16}
                    color="#FFFFFF"
                  />
                  <Text style={styles.actionButtonText}>
                    {isCompletedStatus(status) ? "View Chat" : "Chat with User"}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>

        {item.deliveryStatus === "Sent" && (
          <View style={styles.sentInfoBox}>
            <Ionicons name="paper-plane-outline" size={16} color="#2563EB" />
            <Text style={styles.sentInfoText}>
              {item.sentItemType || "Item"} has been sent to the user
            </Text>
          </View>
        )}

        {item.incomeAdded === true && (
          <View style={styles.incomeWrap}>
            <Ionicons name="cash-outline" size={18} color="#15803D" />
            <Text style={styles.incomeText}>
              Income added: £{Number(item.incomeAmount || 0).toFixed(2)}
            </Text>
          </View>
        )}

        {isCompletedStatus(status) && (
          <View style={styles.completedWrap}>
            <Ionicons name="checkmark-circle" size={18} color="#16A34A" />
            <Text style={styles.completedText}>This request has been completed</Text>
          </View>
        )}
      </>
    );
  };

  const renderJob = ({ item }) => {
    const title = item.title || item.serviceName || "Untitled Job";
    const client =
      item.clientName || item.customerName || item.userName || "Unknown Client";
    const status = item.status || "Pending";
    const description = item.description || item.details || "";
    const price = item.price || item.budget || item.amount;
    const skill =
      item.requestedSkill ||
      item.providerSkill ||
      item.skill ||
      item.serviceType ||
      "Service";
    const location = item.locationName || item.address || "No location";
    const images = getImages(item);

    return (
      <View style={styles.jobCard}>
        <View style={styles.cardTopAccent} />

        <View style={styles.jobTopRow}>
          <View style={styles.jobIconWrap}>
            <Ionicons name="briefcase-outline" size={20} color="#4F6BFF" />
          </View>

          <View style={styles.jobMainInfo}>
            <Text style={styles.jobTitle}>{title}</Text>
            <Text style={styles.jobClient}>Client: {client}</Text>
          </View>

          <View style={[styles.statusBadge, getStatusStyle(status)]}>
            <Text style={styles.statusText}>{status}</Text>
          </View>
        </View>

        <View style={styles.infoGrid}>
          <View style={styles.infoChip}>
            <Ionicons name="sparkles-outline" size={14} color="#4F6BFF" />
            <Text style={styles.infoChipText}>Skill: {skill}</Text>
          </View>

          <View style={styles.infoChip}>
            <Ionicons name="location-outline" size={14} color="#4F6BFF" />
            <Text style={styles.infoChipText}>{location}</Text>
          </View>
        </View>

        {!!description && (
          <Text style={styles.jobDescription} numberOfLines={4}>
            {description}
          </Text>
        )}

        {images.length > 0 && (
          <View style={styles.previewSection}>
            <Text style={styles.previewTitle}>Work Preview</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.imageRow}
            >
              {images.slice(0, 6).map((img, index) => (
                <Image
                  key={`${item.id}-${index}`}
                  source={{ uri: img }}
                  style={styles.previewImage}
                  resizeMode="cover"
                />
              ))}
            </ScrollView>
          </View>
        )}

        <View style={styles.jobMetaRow}>
          <View style={styles.metaItem}>
            <Ionicons name="cash-outline" size={15} color="#6B7280" />
            <Text style={styles.metaText}>
              {price ? `£${Number(price).toFixed(2)}` : "No price set"}
            </Text>
          </View>

          <View style={styles.metaItem}>
            <Ionicons name="time-outline" size={15} color="#6B7280" />
            <Text style={styles.metaText}>{formatDate(item.createdAt)}</Text>
          </View>
        </View>

        {renderActions(item)}
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
          <Text style={styles.title}>Service Requests</Text>
          <Text style={styles.subtitle}>
            Manage active orders, send files, and complete paid requests
          </Text>
        </View>

        <View style={styles.headerSpacer} />
      </View>

      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color="#4F6BFF" />
          <Text style={styles.loadingText}>Loading requests...</Text>
        </View>
      ) : (
        <FlatList
          data={jobs}
          keyExtractor={(item) => item.id}
          renderItem={renderJob}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <>
              <View style={styles.statsGrid}>
                {stats.map((item) => (
                  <View
                    key={item.id}
                    style={[
                      styles.statCard,
                      item.label === "Active" && styles.statCardHighlight,
                    ]}
                  >
                    <Text style={styles.statValue}>{item.value}</Text>
                    <Text style={styles.statLabel}>{item.label}</Text>
                  </View>
                ))}
              </View>

              <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>All Requests</Text>
                <Text style={styles.sectionSubtitle}>
                  Accept requests, upload completed files, close jobs professionally, and keep chatting after completion
                </Text>
              </View>
            </>
          }
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Ionicons name="briefcase-outline" size={42} color="#9CA3AF" />
              <Text style={styles.emptyTitle}>No jobs found</Text>
              <Text style={styles.emptyText}>
                Requests assigned to this provider account will appear here.
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#F6F8FC",
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
    shadowOpacity: 0.06,
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
    lineHeight: 18,
  },
  listContent: {
    paddingHorizontal: 14,
    paddingBottom: 24,
  },
  centerBox: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 10,
    color: "#6B7280",
    fontSize: 14,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginTop: 6,
    marginBottom: 16,
  },
  statCard: {
    width: "48%",
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 12,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  statCardHighlight: {
    borderWidth: 1,
    borderColor: "#DBEAFE",
    backgroundColor: "#F8FBFF",
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
    borderRadius: 18,
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
    lineHeight: 18,
  },
  jobCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 14,
    marginBottom: 14,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
    overflow: "hidden",
  },
  cardTopAccent: {
    height: 4,
    backgroundColor: "#4F6BFF",
    borderRadius: 999,
    marginBottom: 12,
  },
  jobTopRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  jobIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#EEF2FF",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  jobMainInfo: {
    flex: 1,
  },
  jobTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#111827",
  },
  jobClient: {
    marginTop: 4,
    fontSize: 12,
    color: "#6B7280",
  },
  infoGrid: {
    marginTop: 12,
  },
  infoChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFF",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 9,
    marginBottom: 8,
  },
  infoChipText: {
    marginLeft: 6,
    fontSize: 12,
    color: "#4B5563",
    flex: 1,
  },
  jobDescription: {
    marginTop: 12,
    fontSize: 12,
    lineHeight: 18,
    color: "#4B5563",
  },
  previewSection: {
    marginTop: 14,
  },
  previewTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 10,
  },
  imageRow: {
    paddingRight: 8,
  },
  previewImage: {
    width: 120,
    height: 90,
    borderRadius: 14,
    marginRight: 10,
    backgroundColor: "#F3F4F6",
  },
  jobMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 12,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: 16,
    marginTop: 4,
  },
  metaText: {
    marginLeft: 5,
    fontSize: 12,
    color: "#6B7280",
  },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 16,
  },
  actionButton: {
    minWidth: 115,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
    marginRight: 10,
    marginBottom: 10,
  },
  acceptButton: {
    backgroundColor: "#2563EB",
  },
  progressButton: {
    backgroundColor: "#7C3AED",
  },
  sendButton: {
    backgroundColor: "#EA580C",
  },
  completeButton: {
    backgroundColor: "#16A34A",
  },
  chatButton: {
    backgroundColor: "#4F6BFF",
  },
  actionButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
    marginLeft: 6,
  },
  sentInfoBox: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EFF6FF",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  sentInfoText: {
    marginLeft: 8,
    fontSize: 12,
    color: "#1D4ED8",
    fontWeight: "700",
  },
  incomeWrap: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F0FDF4",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  incomeText: {
    marginLeft: 8,
    fontSize: 12,
    color: "#166534",
    fontWeight: "700",
  },
  completedWrap: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F0FDF4",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  completedText: {
    marginLeft: 8,
    fontSize: 12,
    color: "#166534",
    fontWeight: "700",
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
});
import React, { useEffect, useMemo, useState } from "react";
import {
 
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  StatusBar,
  Image,
} from "react-native";
import { Ionicons, Feather } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  collection,
  onSnapshot,
  doc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db, auth } from "../../config/firebase";

const DEFAULT_AVATAR = "https://via.placeholder.com/200x200.png?text=Provider";

function formatNumber(value) {
  return Number(value || 0).toLocaleString();
}

function formatCurrency(value) {
  return `£${Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function toDate(value) {
  try {
    if (!value) return null;
    if (typeof value?.toDate === "function") return value.toDate();
    if (value?.seconds) return new Date(value.seconds * 1000);
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed;
  } catch (error) {
    return null;
  }
}

function getTimeAgo(value) {
  const date = toDate(value);
  if (!date) return "No date";

  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes} min ago`;
  if (diffHours < 24) return `${diffHours} hr ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;

  return date.toLocaleDateString();
}

function isWithinDays(value, days = 30) {
  const date = toDate(value);
  if (!date) return false;
  const diff = Date.now() - date.getTime();
  return diff >= 0 && diff <= days * 24 * 60 * 60 * 1000;
}

function getProviderName(user) {
  return (
    user?.displayName ||
    user?.name ||
    user?.fullName ||
    "Unknown Provider"
  );
}

function getProviderImage(user) {
  return (
    user?.photoURL ||
    user?.profileImage ||
    user?.avatar ||
    user?.image ||
    DEFAULT_AVATAR
  );
}

function getProviderEmail(user) {
  return user?.email || "No email";
}

function getProviderVerification(user) {
  return Boolean(
    user?.verified ||
      user?.isVerified ||
      user?.verificationBadge ||
      user?.hasVerificationBadge
  );
}

function getProviderApproval(user) {
  return Boolean(
    user?.approvedProvider ||
      user?.providerApproved ||
      user?.isApprovedProvider
  );
}

function getProviderStatus(user) {
  return (
    user?.status ||
    user?.accountStatus ||
    user?.state ||
    "active"
  )
    .toString()
    .toLowerCase();
}

function getJobTitle(job) {
  return job?.title || job?.service || job?.skill || "Untitled Job Request";
}

function getJobDescription(job) {
  return (
    job?.description ||
    job?.details ||
    job?.message ||
    "No description provided."
  );
}

function getJobBudget(job) {
  if (typeof job?.budget === "number") return job.budget;
  if (typeof job?.price === "number") return job.price;
  if (typeof job?.amount === "number") return job.amount;
  return 0;
}

function getJobStatus(job) {
  return (
    job?.status ||
    job?.jobStatus ||
    job?.state ||
    "pending"
  )
    .toString()
    .toLowerCase();
}

function getJobProviderId(job) {
  return (
    job?.providerId ||
    job?.assignedProviderId ||
    job?.serviceProviderId ||
    ""
  );
}

function getJobClientName(job) {
  return (
    job?.clientName ||
    job?.userName ||
    job?.customerName ||
    "Unknown Client"
  );
}

function getJobSkill(job) {
  return job?.skill || job?.service || job?.category || "General";
}

function getReviewRating(review) {
  if (typeof review?.rating === "number") return review.rating;
  if (typeof review?.stars === "number") return review.stars;
  return 0;
}

export default function AdminProvidersJobsScreen() {
  const [search, setSearch] = useState("");
  const [selectedTab, setSelectedTab] = useState("jobs");
  const [selectedJobStatus, setSelectedJobStatus] = useState("all");

  const [jobs, setJobs] = useState([]);
  const [providers, setProviders] = useState([]);
  const [reviews, setReviews] = useState([]);

  const [loading, setLoading] = useState(true);
  const [selectedProvider, setSelectedProvider] = useState(null);
  const [providerMenuVisible, setProviderMenuVisible] = useState(false);
  const [selectedJob, setSelectedJob] = useState(null);
  const [jobMenuVisible, setJobMenuVisible] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    const unsubscribers = [];

    const unsubJobs = onSnapshot(
      collection(db, "jobs"),
      (snapshot) => {
        const list = snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        }));
        list.sort((a, b) => {
          const aDate = toDate(a?.createdAt)?.getTime() || 0;
          const bDate = toDate(b?.createdAt)?.getTime() || 0;
          return bDate - aDate;
        });
        setJobs(list);
        setLoading(false);
      },
      (error) => {
        console.log("jobs error:", error);
        setJobs([]);
        setLoading(false);
      }
    );
    unsubscribers.push(unsubJobs);

    const unsubUsers = onSnapshot(
      collection(db, "users"),
      (snapshot) => {
        const list = snapshot.docs
          .map((item) => ({
            id: item.id,
            ...item.data(),
          }))
          .filter((user) => user?.role === "service_provider");
        setProviders(list);
      },
      () => setProviders([])
    );
    unsubscribers.push(unsubUsers);

    const unsubReviews = onSnapshot(
      collection(db, "reviews"),
      (snapshot) => {
        const list = snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        }));
        setReviews(list);
      },
      () => setReviews([])
    );
    unsubscribers.push(unsubReviews);

    return () => {
      unsubscribers.forEach((unsubscribe) => {
        try {
          unsubscribe?.();
        } catch (error) {}
      });
    };
  }, []);

  const providerMetrics = useMemo(() => {
    return providers.map((provider) => {
      const providerJobs = jobs.filter(
        (job) => getJobProviderId(job) === provider.id
      );

      const completedJobs = providerJobs.filter(
        (job) => getJobStatus(job) === "completed"
      );

      const activeJobs = providerJobs.filter((job) =>
        ["active", "in_progress", "ongoing", "accepted"].includes(getJobStatus(job))
      );

      const pendingJobs = providerJobs.filter(
        (job) => getJobStatus(job) === "pending"
      );

      const providerReviews = reviews.filter(
        (review) =>
          review?.providerId === provider.id ||
          review?.reviewedUserId === provider.id ||
          review?.userId === provider.id
      );

      const totalRating = providerReviews.reduce(
        (sum, review) => sum + getReviewRating(review),
        0
      );

      const averageRating =
        providerReviews.length > 0 ? totalRating / providerReviews.length : 0;

      const totalRevenue = completedJobs.reduce(
        (sum, job) => sum + getJobBudget(job),
        0
      );

      return {
        ...provider,
        totalJobs: providerJobs.length,
        completedJobs: completedJobs.length,
        activeJobs: activeJobs.length,
        pendingJobs: pendingJobs.length,
        averageRating,
        reviewsCount: providerReviews.length,
        totalRevenue,
      };
    });
  }, [providers, jobs, reviews]);

  const filteredProviders = useMemo(() => {
    const q = search.trim().toLowerCase();

    return providerMetrics.filter((provider) => {
      if (!q) return true;

      return (
        getProviderName(provider).toLowerCase().includes(q) ||
        getProviderEmail(provider).toLowerCase().includes(q) ||
        (provider?.skills || "").toString().toLowerCase().includes(q) ||
        (provider?.location || "").toString().toLowerCase().includes(q)
      );
    });
  }, [providerMetrics, search]);

  const enrichedJobs = useMemo(() => {
    return jobs.map((job) => {
      const providerId = getJobProviderId(job);
      const matchedProvider =
        providerMetrics.find((provider) => provider.id === providerId) || null;

      return {
        ...job,
        matchedProvider,
      };
    });
  }, [jobs, providerMetrics]);

  const filteredJobs = useMemo(() => {
    const q = search.trim().toLowerCase();

    return enrichedJobs.filter((job) => {
      const matchesSearch =
        !q ||
        getJobTitle(job).toLowerCase().includes(q) ||
        getJobClientName(job).toLowerCase().includes(q) ||
        getJobSkill(job).toLowerCase().includes(q) ||
        getJobDescription(job).toLowerCase().includes(q) ||
        (job?.matchedProvider
          ? getProviderName(job.matchedProvider).toLowerCase().includes(q)
          : false);

      const status = getJobStatus(job);
      const matchesStatus =
        selectedJobStatus === "all" || status === selectedJobStatus;

      return matchesSearch && matchesStatus;
    });
  }, [enrichedJobs, search, selectedJobStatus]);

  const summary = useMemo(() => {
    return {
      providers: providers.length,
      approvedProviders: providers.filter((provider) =>
        getProviderApproval(provider)
      ).length,
      verifiedProviders: providers.filter((provider) =>
        getProviderVerification(provider)
      ).length,
      totalJobs: jobs.length,
      pendingJobs: jobs.filter((job) => getJobStatus(job) === "pending").length,
      completedJobs: jobs.filter((job) => getJobStatus(job) === "completed").length,
    };
  }, [providers, jobs]);

  const openProviderMenu = (provider) => {
    setSelectedProvider(provider);
    setProviderMenuVisible(true);
  };

  const closeProviderMenu = () => {
    if (actionLoading) return;
    setProviderMenuVisible(false);
    setSelectedProvider(null);
  };

  const openJobMenu = (job) => {
    setSelectedJob(job);
    setJobMenuVisible(true);
  };

  const closeJobMenu = () => {
    if (actionLoading) return;
    setJobMenuVisible(false);
    setSelectedJob(null);
  };

  const updateProvider = async (provider, updates, successMessage) => {
    try {
      setActionLoading(true);

      await updateDoc(doc(db, "users", provider.id), {
        ...updates,
        updatedAt: serverTimestamp(),
        updatedBy: auth.currentUser?.uid || null,
      });

      closeProviderMenu();
      Alert.alert("Success", successMessage);
    } catch (error) {
      console.log("update provider error:", error);
      Alert.alert("Error", "Failed to update provider.");
    } finally {
      setActionLoading(false);
    }
  };

  const approveProvider = async () => {
    if (!selectedProvider) return;

    await updateProvider(
      selectedProvider,
      {
        approvedProvider: true,
        providerApproved: true,
        isApprovedProvider: true,
      },
      "Provider approved successfully."
    );
  };

  const verifyProvider = async () => {
    if (!selectedProvider) return;

    const nextVerification = !getProviderVerification(selectedProvider);

    await updateProvider(
      selectedProvider,
      {
        verified: nextVerification,
        isVerified: nextVerification,
        verificationBadge: nextVerification,
        hasVerificationBadge: nextVerification,
      },
      nextVerification
        ? "Provider verified successfully."
        : "Provider verification removed."
    );
  };

  const suspendProvider = async () => {
    if (!selectedProvider) return;

    await updateProvider(
      selectedProvider,
      {
        status: "suspended",
        active: false,
      },
      "Provider suspended successfully."
    );
  };

  const activateProvider = async () => {
    if (!selectedProvider) return;

    await updateProvider(
      selectedProvider,
      {
        status: "active",
        active: true,
      },
      "Provider activated successfully."
    );
  };

  const updateJob = async (job, updates, successMessage) => {
    try {
      setActionLoading(true);

      await updateDoc(doc(db, "jobs", job.id), {
        ...updates,
        updatedAt: serverTimestamp(),
        updatedBy: auth.currentUser?.uid || null,
      });

      closeJobMenu();
      Alert.alert("Success", successMessage);
    } catch (error) {
      console.log("update job error:", error);
      Alert.alert("Error", "Failed to update job.");
    } finally {
      setActionLoading(false);
    }
  };

  const markJobActive = async () => {
    if (!selectedJob) return;
    await updateJob(
      selectedJob,
      { status: "active", jobStatus: "active" },
      "Job marked as active."
    );
  };

  const markJobCompleted = async () => {
    if (!selectedJob) return;
    await updateJob(
      selectedJob,
      {
        status: "completed",
        jobStatus: "completed",
        completedAt: serverTimestamp(),
      },
      "Job marked as completed."
    );
  };

  const markJobCancelled = async () => {
    if (!selectedJob) return;
    await updateJob(
      selectedJob,
      { status: "cancelled", jobStatus: "cancelled" },
      "Job marked as cancelled."
    );
  };

  const jobStatusFilters = [
    { key: "all", label: "All" },
    { key: "pending", label: "Pending" },
    { key: "active", label: "Active" },
    { key: "completed", label: "Completed" },
    { key: "cancelled", label: "Cancelled" },
  ];

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.headerCard}>
          <View style={styles.headerTopRow}>
            <View>
              <Text style={styles.logo}>ArtLinker</Text>
              <Text style={styles.headerBadge}>Providers and Jobs</Text>
            </View>

            <View style={styles.headerIconWrap}>
              <Ionicons name="briefcase-outline" size={20} color="#7C3AED" />
            </View>
          </View>

          <Text style={styles.title}>Service Provider Management</Text>
          <Text style={styles.subtitle}>
            Review job requests, monitor provider performance, approve providers, and track completed work
          </Text>
        </View>

        <View style={styles.summaryGrid}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Providers</Text>
            <Text style={styles.summaryValue}>{formatNumber(summary.providers)}</Text>
          </View>

          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Approved</Text>
            <Text style={styles.summaryValue}>
              {formatNumber(summary.approvedProviders)}
            </Text>
          </View>

          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Verified</Text>
            <Text style={styles.summaryValue}>
              {formatNumber(summary.verifiedProviders)}
            </Text>
          </View>

          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Total Jobs</Text>
            <Text style={styles.summaryValue}>{formatNumber(summary.totalJobs)}</Text>
          </View>

          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Pending Jobs</Text>
            <Text style={styles.summaryValue}>
              {formatNumber(summary.pendingJobs)}
            </Text>
          </View>

          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Completed Jobs</Text>
            <Text style={styles.summaryValue}>
              {formatNumber(summary.completedJobs)}
            </Text>
          </View>
        </View>

        <View style={styles.searchWrapper}>
          <Ionicons
            name="search"
            size={16}
            color="#9CA3AF"
            style={styles.searchIcon}
          />
          <TextInput
            style={styles.searchInput}
            placeholder="Search providers, jobs, skills, clients, or locations..."
            placeholderTextColor="#9CA3AF"
            value={search}
            onChangeText={setSearch}
          />
        </View>

        <View style={styles.tabRow}>
          <TouchableOpacity
            style={[
              styles.tabButton,
              selectedTab === "jobs" && styles.tabButtonActive,
            ]}
            onPress={() => setSelectedTab("jobs")}
            activeOpacity={0.85}
          >
            <Text
              style={[
                styles.tabButtonText,
                selectedTab === "jobs" && styles.tabButtonTextActive,
              ]}
            >
              Job Requests
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.tabButton,
              selectedTab === "providers" && styles.tabButtonActive,
            ]}
            onPress={() => setSelectedTab("providers")}
            activeOpacity={0.85}
          >
            <Text
              style={[
                styles.tabButtonText,
                selectedTab === "providers" && styles.tabButtonTextActive,
              ]}
            >
              Providers
            </Text>
          </TouchableOpacity>
        </View>

        {selectedTab === "jobs" ? (
          <>
            <Text style={styles.filterTitle}>Job Status</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterRow}
            >
              {jobStatusFilters.map((item) => {
                const active = selectedJobStatus === item.key;

                return (
                  <TouchableOpacity
                    key={item.key}
                    style={[styles.filterChip, active && styles.filterChipActive]}
                    onPress={() => setSelectedJobStatus(item.key)}
                    activeOpacity={0.85}
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        active && styles.filterChipTextActive,
                      ]}
                    >
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <View>
                  <Text style={styles.sectionTitle}>All Job Requests</Text>
                  <Text style={styles.sectionSubtitle}>
                    Review and manage service requests across the platform
                  </Text>
                </View>
              </View>

              {loading ? (
                <View style={styles.stateWrap}>
                  <ActivityIndicator size="large" color="#7C3AED" />
                  <Text style={styles.stateText}>Loading jobs...</Text>
                </View>
              ) : filteredJobs.length === 0 ? (
                <View style={styles.stateWrap}>
                  <Ionicons name="briefcase-outline" size={28} color="#9CA3AF" />
                  <Text style={styles.stateTitle}>No job requests found</Text>
                  <Text style={styles.stateText}>
                    Try a different search or filter
                  </Text>
                </View>
              ) : (
                <View style={styles.list}>
                  {filteredJobs.map((job) => (
                    <View key={job.id} style={styles.jobCard}>
                      <View style={styles.jobTopRow}>
                        <View style={styles.jobTopTextWrap}>
                          <Text style={styles.jobTitle}>{getJobTitle(job)}</Text>
                          <Text style={styles.jobMeta}>
                            {getJobSkill(job)} · {getTimeAgo(job?.createdAt)}
                          </Text>
                        </View>

                        <TouchableOpacity
                          style={styles.menuButton}
                          onPress={() => openJobMenu(job)}
                          activeOpacity={0.85}
                        >
                          <Feather
                            name="more-horizontal"
                            size={14}
                            color="#111827"
                          />
                        </TouchableOpacity>
                      </View>

                      <View style={styles.badgesRow}>
                        <View style={styles.skillBadge}>
                          <Text style={styles.skillBadgeText}>{getJobSkill(job)}</Text>
                        </View>

                        <View
                          style={[
                            styles.statusBadge,
                            getJobStatus(job) === "completed" &&
                              styles.statusBadgeCompleted,
                            getJobStatus(job) === "active" &&
                              styles.statusBadgeActive,
                            getJobStatus(job) === "cancelled" &&
                              styles.statusBadgeCancelled,
                          ]}
                        >
                          <Text
                            style={[
                              styles.statusBadgeText,
                              getJobStatus(job) === "completed" &&
                                styles.statusBadgeTextCompleted,
                              getJobStatus(job) === "active" &&
                                styles.statusBadgeTextActive,
                              getJobStatus(job) === "cancelled" &&
                                styles.statusBadgeTextCancelled,
                            ]}
                          >
                            {getJobStatus(job)}
                          </Text>
                        </View>
                      </View>

                      <Text style={styles.descriptionText} numberOfLines={3}>
                        {getJobDescription(job)}
                      </Text>

                      <View style={styles.jobInfoRow}>
                        <View style={styles.jobInfoBlock}>
                          <Text style={styles.jobInfoLabel}>Client</Text>
                          <Text style={styles.jobInfoValue}>
                            {getJobClientName(job)}
                          </Text>
                        </View>

                        <View style={styles.jobInfoBlock}>
                          <Text style={styles.jobInfoLabel}>Provider</Text>
                          <Text style={styles.jobInfoValue}>
                            {job?.matchedProvider
                              ? getProviderName(job.matchedProvider)
                              : "Unassigned"}
                          </Text>
                        </View>

                        <View style={styles.jobInfoBlock}>
                          <Text style={styles.jobInfoLabel}>Budget</Text>
                          <Text style={styles.jobInfoValue}>
                            {formatCurrency(getJobBudget(job))}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.quickActionRow}>
                        <TouchableOpacity
                          style={styles.quickActionButton}
                          onPress={() => openJobMenu(job)}
                          activeOpacity={0.85}
                        >
                          <Ionicons
                            name="flash-outline"
                            size={15}
                            color="#374151"
                          />
                          <Text style={styles.quickActionText}>Manage</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.quickPrimaryButton}
                          onPress={() => {
                            setSelectedJob(job);
                            markJobCompleted();
                          }}
                          activeOpacity={0.85}
                        >
                          <Ionicons
                            name="checkmark-circle-outline"
                            size={15}
                            color="#FFFFFF"
                          />
                          <Text style={styles.quickPrimaryText}>Complete</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </>
        ) : (
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.sectionTitle}>Provider Performance</Text>
                <Text style={styles.sectionSubtitle}>
                  Monitor service providers, approvals, ratings, and completed work
                </Text>
              </View>
            </View>

            {loading ? (
              <View style={styles.stateWrap}>
                <ActivityIndicator size="large" color="#7C3AED" />
                <Text style={styles.stateText}>Loading providers...</Text>
              </View>
            ) : filteredProviders.length === 0 ? (
              <View style={styles.stateWrap}>
                <Ionicons name="people-outline" size={28} color="#9CA3AF" />
                <Text style={styles.stateTitle}>No providers found</Text>
                <Text style={styles.stateText}>
                  Try a different search query
                </Text>
              </View>
            ) : (
              <View style={styles.list}>
                {filteredProviders.map((provider) => (
                  <View key={provider.id} style={styles.providerCard}>
                    <View style={styles.providerTopRow}>
                      <View style={styles.providerLeft}>
                        <Image
                          source={{ uri: getProviderImage(provider) }}
                          style={styles.providerAvatar}
                        />

                        <View style={styles.providerTextWrap}>
                          <View style={styles.providerNameRow}>
                            <Text style={styles.providerName}>
                              {getProviderName(provider)}
                            </Text>

                            {getProviderVerification(provider) ? (
                              <Ionicons
                                name="checkmark-circle"
                                size={16}
                                color="#2563EB"
                                style={styles.verifiedIcon}
                              />
                            ) : null}
                          </View>

                          <Text style={styles.providerEmail} numberOfLines={1}>
                            {getProviderEmail(provider)}
                          </Text>
                          <Text style={styles.providerMeta} numberOfLines={1}>
                            {(provider?.skills || provider?.skill || "No skills listed")
                              .toString()}
                          </Text>
                        </View>
                      </View>

                      <TouchableOpacity
                        style={styles.menuButton}
                        onPress={() => openProviderMenu(provider)}
                        activeOpacity={0.85}
                      >
                        <Feather
                          name="more-horizontal"
                          size={14}
                          color="#111827"
                        />
                      </TouchableOpacity>
                    </View>

                    <View style={styles.badgesRow}>
                      <View
                        style={[
                          styles.approvalBadge,
                          getProviderApproval(provider) && styles.approvalBadgeYes,
                        ]}
                      >
                        <Text
                          style={[
                            styles.approvalBadgeText,
                            getProviderApproval(provider) &&
                              styles.approvalBadgeTextYes,
                          ]}
                        >
                          {getProviderApproval(provider) ? "Approved" : "Unapproved"}
                        </Text>
                      </View>

                      <View style={styles.statusBadge}>
                        <Text style={styles.statusBadgeText}>
                          {getProviderStatus(provider)}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.performanceGrid}>
                      <View style={styles.performanceCard}>
                        <Text style={styles.performanceLabel}>Total Jobs</Text>
                        <Text style={styles.performanceValue}>
                          {formatNumber(provider.totalJobs)}
                        </Text>
                      </View>

                      <View style={styles.performanceCard}>
                        <Text style={styles.performanceLabel}>Completed</Text>
                        <Text style={styles.performanceValue}>
                          {formatNumber(provider.completedJobs)}
                        </Text>
                      </View>

                      <View style={styles.performanceCard}>
                        <Text style={styles.performanceLabel}>Rating</Text>
                        <Text style={styles.performanceValue}>
                          {provider.averageRating.toFixed(1)}
                        </Text>
                      </View>

                      <View style={styles.performanceCard}>
                        <Text style={styles.performanceLabel}>Revenue</Text>
                        <Text style={styles.performanceValue}>
                          {formatCurrency(provider.totalRevenue)}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.quickActionRow}>
                      <TouchableOpacity
                        style={styles.quickActionButton}
                        onPress={() => openProviderMenu(provider)}
                        activeOpacity={0.85}
                      >
                        <Ionicons
                          name="flash-outline"
                          size={15}
                          color="#374151"
                        />
                        <Text style={styles.quickActionText}>Manage</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.quickPrimaryButton}
                        onPress={() => {
                          setSelectedProvider(provider);
                          approveProvider();
                        }}
                        activeOpacity={0.85}
                      >
                        <Ionicons
                          name="shield-checkmark-outline"
                          size={15}
                          color="#FFFFFF"
                        />
                        <Text style={styles.quickPrimaryText}>Approve</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}
      </ScrollView>

      <Modal
        visible={providerMenuVisible}
        transparent
        animationType="fade"
        onRequestClose={closeProviderMenu}
      >
        <View style={styles.modalRoot}>
          <Pressable style={styles.modalOverlay} onPress={closeProviderMenu} />

          <View style={styles.modalSheetWrap}>
            <View style={styles.modalSheet}>
              <View style={styles.sheetHandle} />
              <Text style={styles.sheetTitle}>
                {selectedProvider
                  ? getProviderName(selectedProvider)
                  : "Provider"}
              </Text>

              <TouchableOpacity
                style={styles.actionItem}
                onPress={approveProvider}
                disabled={actionLoading}
              >
                <Ionicons
                  name="shield-checkmark-outline"
                  size={18}
                  color="#16A34A"
                />
                <Text style={styles.actionText}>Approve provider</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionItem}
                onPress={verifyProvider}
                disabled={actionLoading}
              >
                <Ionicons
                  name="checkmark-circle-outline"
                  size={18}
                  color="#2563EB"
                />
                <Text style={styles.actionText}>
                  {selectedProvider && getProviderVerification(selectedProvider)
                    ? "Remove verification"
                    : "Verify provider"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionItem}
                onPress={activateProvider}
                disabled={actionLoading}
              >
                <Ionicons
                  name="play-circle-outline"
                  size={18}
                  color="#059669"
                />
                <Text style={styles.actionText}>Activate provider</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionItem}
                onPress={suspendProvider}
                disabled={actionLoading}
              >
                <Ionicons
                  name="pause-circle-outline"
                  size={18}
                  color="#D97706"
                />
                <Text style={styles.actionText}>Suspend provider</Text>
              </TouchableOpacity>

              {actionLoading ? (
                <View style={styles.actionLoadingWrap}>
                  <ActivityIndicator size="small" color="#7C3AED" />
                </View>
              ) : null}

              <TouchableOpacity
                style={styles.cancelButton}
                onPress={closeProviderMenu}
                disabled={actionLoading}
              >
                <Text style={styles.cancelButtonText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={jobMenuVisible}
        transparent
        animationType="fade"
        onRequestClose={closeJobMenu}
      >
        <View style={styles.modalRoot}>
          <Pressable style={styles.modalOverlay} onPress={closeJobMenu} />

          <View style={styles.modalSheetWrap}>
            <View style={styles.modalSheet}>
              <View style={styles.sheetHandle} />
              <Text style={styles.sheetTitle}>
                {selectedJob ? getJobTitle(selectedJob) : "Job"}
              </Text>

              <TouchableOpacity
                style={styles.actionItem}
                onPress={markJobActive}
                disabled={actionLoading}
              >
                <Ionicons
                  name="play-circle-outline"
                  size={18}
                  color="#2563EB"
                />
                <Text style={styles.actionText}>Mark as active</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionItem}
                onPress={markJobCompleted}
                disabled={actionLoading}
              >
                <Ionicons
                  name="checkmark-circle-outline"
                  size={18}
                  color="#16A34A"
                />
                <Text style={styles.actionText}>Mark as completed</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionItem}
                onPress={markJobCancelled}
                disabled={actionLoading}
              >
                <Ionicons
                  name="close-circle-outline"
                  size={18}
                  color="#EF4444"
                />
                <Text style={styles.actionDeleteText}>Cancel job</Text>
              </TouchableOpacity>

              {actionLoading ? (
                <View style={styles.actionLoadingWrap}>
                  <ActivityIndicator size="small" color="#7C3AED" />
                </View>
              ) : null}

              <TouchableOpacity
                style={styles.cancelButton}
                onPress={closeJobMenu}
                disabled={actionLoading}
              >
                <Text style={styles.cancelButtonText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 24,
  },

  headerCard: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E9EEF5",
    borderRadius: 24,
    padding: 18,
    marginBottom: 16,
    shadowColor: "#0F172A",
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 7 },
    elevation: 4,
  },
  headerTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 14,
  },
  logo: {
    fontSize: 26,
    fontWeight: "900",
    color: "#F06CE9",
  },
  headerBadge: {
    marginTop: 6,
    alignSelf: "flex-start",
    fontSize: 11,
    fontWeight: "700",
    color: "#6D28D9",
    backgroundColor: "#F3E8FF",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  headerIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "#F5F3FF",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 26,
    fontWeight: "900",
    color: "#111827",
  },
  subtitle: {
    marginTop: 6,
    fontSize: 13,
    color: "#64748B",
    lineHeight: 19,
  },

  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  summaryCard: {
    width: "48.5%",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E9EEF5",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 12,
  },
  summaryLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#64748B",
  },
  summaryValue: {
    marginTop: 6,
    fontSize: 22,
    fontWeight: "900",
    color: "#111827",
  },

  searchWrapper: {
    position: "relative",
    justifyContent: "center",
    marginBottom: 14,
  },
  searchIcon: {
    position: "absolute",
    left: 12,
    zIndex: 1,
  },
  searchInput: {
    height: 46,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    paddingLeft: 38,
    paddingRight: 12,
    fontSize: 13,
    color: "#111827",
    fontWeight: "600",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },

  tabRow: {
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 16,
    padding: 4,
    marginBottom: 14,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    borderRadius: 12,
  },
  tabButtonActive: {
    backgroundColor: "#111827",
  },
  tabButtonText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#4B5563",
  },
  tabButtonTextActive: {
    color: "#FFFFFF",
  },

  filterTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: "#4B5563",
    marginBottom: 8,
  },
  filterRow: {
    paddingBottom: 12,
  },
  filterChip: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    marginRight: 8,
  },
  filterChipActive: {
    backgroundColor: "#111827",
    borderColor: "#111827",
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#374151",
  },
  filterChipTextActive: {
    color: "#FFFFFF",
  },

  sectionCard: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E9EEF5",
    borderRadius: 22,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#0F172A",
    shadowOpacity: 0.05,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  sectionHeader: {
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#111827",
  },
  sectionSubtitle: {
    fontSize: 12,
    color: "#9CA3AF",
    marginTop: 4,
  },

  stateWrap: {
    paddingVertical: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  stateTitle: {
    marginTop: 10,
    fontSize: 16,
    fontWeight: "800",
    color: "#111827",
  },
  stateText: {
    marginTop: 6,
    fontSize: 12,
    color: "#9CA3AF",
    textAlign: "center",
  },

  list: {
    gap: 14,
  },

  jobCard: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#EDEFF3",
    borderRadius: 18,
    padding: 14,
  },
  jobTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  jobTopTextWrap: {
    flex: 1,
    marginRight: 10,
  },
  jobTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#111827",
  },
  jobMeta: {
    marginTop: 4,
    fontSize: 12,
    color: "#94A3B8",
    fontWeight: "600",
    textTransform: "capitalize",
  },
  menuButton: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },

  badgesRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 12,
  },
  skillBadge: {
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    marginRight: 8,
    marginBottom: 8,
  },
  skillBadgeText: {
    fontSize: 11,
    color: "#4B5563",
    fontWeight: "800",
  },
  statusBadge: {
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    marginBottom: 8,
  },
  statusBadgeCompleted: {
    backgroundColor: "#DCFCE7",
  },
  statusBadgeActive: {
    backgroundColor: "#DBEAFE",
  },
  statusBadgeCancelled: {
    backgroundColor: "#FEE2E2",
  },
  statusBadgeText: {
    fontSize: 11,
    color: "#92400E",
    fontWeight: "800",
    textTransform: "capitalize",
  },
  statusBadgeTextCompleted: {
    color: "#166534",
  },
  statusBadgeTextActive: {
    color: "#1D4ED8",
  },
  statusBadgeTextCancelled: {
    color: "#B91C1C",
  },

  descriptionText: {
    fontSize: 13,
    lineHeight: 19,
    color: "#374151",
    fontWeight: "600",
    marginBottom: 12,
  },

  jobInfoRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  jobInfoBlock: {
    width: "31.5%",
    backgroundColor: "#FAFAFB",
    borderWidth: 1,
    borderColor: "#EEF2F7",
    borderRadius: 12,
    padding: 10,
  },
  jobInfoLabel: {
    fontSize: 10,
    color: "#94A3B8",
    fontWeight: "700",
    marginBottom: 4,
  },
  jobInfoValue: {
    fontSize: 12,
    color: "#111827",
    fontWeight: "800",
  },

  providerCard: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#EDEFF3",
    borderRadius: 18,
    padding: 14,
  },
  providerTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  providerLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: 10,
  },
  providerAvatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "#E5E7EB",
    marginRight: 12,
  },
  providerTextWrap: {
    flex: 1,
  },
  providerNameRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  providerName: {
    fontSize: 15,
    fontWeight: "800",
    color: "#111827",
    maxWidth: "88%",
  },
  verifiedIcon: {
    marginLeft: 6,
  },
  providerEmail: {
    marginTop: 4,
    fontSize: 12,
    color: "#6B7280",
    fontWeight: "700",
  },
  providerMeta: {
    marginTop: 4,
    fontSize: 11,
    color: "#94A3B8",
    fontWeight: "600",
  },

  approvalBadge: {
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    marginRight: 8,
    marginBottom: 8,
  },
  approvalBadgeYes: {
    backgroundColor: "#DCFCE7",
  },
  approvalBadgeText: {
    fontSize: 11,
    color: "#4B5563",
    fontWeight: "800",
  },
  approvalBadgeTextYes: {
    color: "#166534",
  },

  performanceGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  performanceCard: {
    width: "48.5%",
    backgroundColor: "#FAFAFB",
    borderWidth: 1,
    borderColor: "#EEF2F7",
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
  },
  performanceLabel: {
    fontSize: 11,
    color: "#94A3B8",
    fontWeight: "700",
    marginBottom: 4,
  },
  performanceValue: {
    fontSize: 16,
    color: "#111827",
    fontWeight: "900",
  },

  quickActionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  quickActionButton: {
    flex: 1,
    marginRight: 8,
    backgroundColor: "#F3F4F6",
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  quickActionText: {
    marginLeft: 6,
    fontSize: 12,
    fontWeight: "800",
    color: "#374151",
  },
  quickPrimaryButton: {
    flex: 1,
    backgroundColor: "#111827",
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  quickPrimaryText: {
    marginLeft: 6,
    fontSize: 12,
    fontWeight: "800",
    color: "#FFFFFF",
  },

  modalRoot: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.18)",
  },
  modalSheetWrap: {
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 24,
  },
  sheetHandle: {
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: "#D1D5DB",
    alignSelf: "center",
    marginBottom: 14,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 14,
    textAlign: "center",
  },
  actionItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  actionText: {
    marginLeft: 10,
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
  },
  actionDeleteText: {
    marginLeft: 10,
    fontSize: 14,
    fontWeight: "700",
    color: "#EF4444",
  },
  actionLoadingWrap: {
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelButton: {
    marginTop: 14,
    height: 46,
    borderRadius: 12,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#374151",
  },
});
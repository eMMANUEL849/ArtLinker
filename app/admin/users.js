import React, { useEffect, useMemo, useState } from "react";
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
  StatusBar,
  Modal,
} from "react-native";
import { Ionicons, Feather } from "@expo/vector-icons";
import {
  collection,
  onSnapshot,
  doc,
  updateDoc,
  deleteDoc,
  addDoc,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { db } from "../../config/firebase";

const DEFAULT_AVATAR = "https://via.placeholder.com/200x200.png?text=User";

function formatNumber(value) {
  return Number(value || 0).toLocaleString();
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
  if (!date) return "No recent activity";

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

function isWithinDays(value, days = 7) {
  const date = toDate(value);
  if (!date) return false;
  const diff = Date.now() - date.getTime();
  return diff >= 0 && diff <= days * 24 * 60 * 60 * 1000;
}

function getAccountType(data) {
  const role = (data?.role || "user").toLowerCase();
  const accountType = (
    data?.accountType ||
    data?.userType ||
    data?.type ||
    ""
  ).toLowerCase();

  if (role === "admin") return "admin";
  if (role === "service_provider") return "service_provider";
  if (accountType === "artist") return "artist";
  if (accountType === "buyer") return "buyer";

  return "buyer";
}

function getUserStatus(data) {
  if (typeof data?.active === "boolean") {
    return data.active ? "active" : "blocked";
  }

  const status = (
    data?.status ||
    data?.accountStatus ||
    data?.state ||
    "active"
  ).toLowerCase();

  if (["blocked", "banned"].includes(status)) return "blocked";
  if (["suspended", "pause"].includes(status)) return "suspended";
  return "active";
}

function getRoleLabel(role) {
  if (role === "service_provider") return "Service Provider";
  if (role === "admin") return "Admin";
  return "User";
}

function getAccountTypeLabel(type) {
  if (type === "artist") return "Artist";
  if (type === "buyer") return "Buyer";
  if (type === "service_provider") return "Provider";
  if (type === "admin") return "Admin";
  return "Buyer";
}

function getStatusLabel(status) {
  if (status === "blocked") return "Blocked";
  if (status === "suspended") return "Suspended";
  return "Active";
}

function getVerificationStatus(data) {
  return Boolean(
    data?.verified ||
      data?.isVerified ||
      data?.verificationBadge ||
      data?.hasVerificationBadge
  );
}

function getUserName(data) {
  return data?.displayName || data?.name || data?.fullName || "Unknown User";
}

function getUserUsername(data) {
  if (data?.username) {
    return data.username.startsWith("@") ? data.username : `@${data.username}`;
  }

  if (data?.email) {
    return `@${data.email.split("@")[0]}`;
  }

  return "@unknown";
}

function getUserImage(data) {
  return (
    data?.photoURL ||
    data?.profileImage ||
    data?.avatar ||
    data?.image ||
    DEFAULT_AVATAR
  );
}

function getActivityTime(data) {
  return (
    data?.lastSeen ||
    data?.lastActive ||
    data?.updatedAt ||
    data?.lastLoginAt ||
    data?.createdAt
  );
}

const EMPTY_NEW_ACCOUNT = {
  displayName: "",
  username: "",
  email: "",
  role: "user",
  accountType: "buyer",
  status: "active",
  avatar: "",
};

export default function AdminUsersScreen() {
  const [search, setSearch] = useState("");
  const [selectedFilter, setSelectedFilter] = useState("all");
  const [users, setUsers] = useState([]);
  const [reports, setReports] = useState([]);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState(null);

  const [addModalVisible, setAddModalVisible] = useState(false);
  const [newAccount, setNewAccount] = useState(EMPTY_NEW_ACCOUNT);
  const [creatingAccount, setCreatingAccount] = useState(false);

  const [managedAccount, setManagedAccount] = useState(null);

  useEffect(() => {
    const unsubscribers = [];

    const unsubUsers = onSnapshot(
      collection(db, "users"),
      (snapshot) => {
        const accounts = snapshot.docs.map((item) => {
          const data = item.data();
          const status = getUserStatus(data);
          const accountType = getAccountType(data);

          return {
            id: item.id,
            raw: data,
            name: getUserName(data),
            username: getUserUsername(data),
            email: data.email || "",
            role: data.role || "user",
            accountType,
            status,
            verified: getVerificationStatus(data),
            image: getUserImage(data),
            createdAt: data.createdAt || data.joinedAt || data.dateCreated || null,
            lastActive: getActivityTime(data),
          };
        });

        setUsers(accounts);
        setLoading(false);
      },
      (error) => {
        console.log("Firestore users error:", error);
        setLoading(false);
      }
    );
    unsubscribers.push(unsubUsers);

    const unsubReports = onSnapshot(
      collection(db, "reports"),
      (snapshot) => {
        const allReports = snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        }));
        setReports(allReports);
      },
      (error) => {
        console.log("Firestore reports error:", error);
        setReports([]);
      }
    );
    unsubscribers.push(unsubReports);

    const unsubPosts = onSnapshot(
      collection(db, "posts"),
      (snapshot) => {
        const allPosts = snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        }));
        setPosts(allPosts);
      },
      (error) => {
        console.log("Firestore posts error:", error);
        setPosts([]);
      }
    );
    unsubscribers.push(unsubPosts);

    return () => {
      unsubscribers.forEach((unsubscribe) => {
        try {
          unsubscribe?.();
        } catch (error) {}
      });
    };
  }, []);

  const enrichedUsers = useMemo(() => {
    return users.map((user) => {
      const userPosts = posts.filter((post) => {
        return (
          post?.userId === user.id ||
          post?.providerId === user.id ||
          post?.artistId === user.id
        );
      });

      const userReports = reports.filter((report) => {
        return (
          report?.reportedUserId === user.id ||
          report?.userId === user.id ||
          report?.reportedAgainst === user.id
        );
      });

      return {
        ...user,
        artworkCount: userPosts.length,
        reportsCount: userReports.length,
        recentReports: userReports.filter((report) =>
          isWithinDays(report?.createdAt, 30)
        ).length,
      };
    });
  }, [users, posts, reports]);

  const summary = useMemo(() => {
    return {
      total: users.length,
      artists: users.filter((item) => item.accountType === "artist").length,
      buyers: users.filter((item) => item.accountType === "buyer").length,
      providers: users.filter((item) => item.role === "service_provider").length,
      admins: users.filter((item) => item.role === "admin").length,
      verified: users.filter((item) => item.verified).length,
    };
  }, [users]);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();

    let result = enrichedUsers;

    if (selectedFilter !== "all") {
      result = result.filter((user) => {
        if (selectedFilter === "artists") return user.accountType === "artist";
        if (selectedFilter === "buyers") return user.accountType === "buyer";
        if (selectedFilter === "providers") return user.role === "service_provider";
        if (selectedFilter === "admins") return user.role === "admin";
        if (selectedFilter === "verified") return user.verified;
        if (selectedFilter === "flagged") return user.reportsCount > 0;
        return true;
      });
    }

    if (!q) return result;

    return result.filter(
      (user) =>
        user.name.toLowerCase().includes(q) ||
        user.username.toLowerCase().includes(q) ||
        user.email.toLowerCase().includes(q) ||
        user.role.toLowerCase().includes(q) ||
        user.accountType.toLowerCase().includes(q) ||
        user.status.toLowerCase().includes(q)
    );
  }, [search, enrichedUsers, selectedFilter]);

  const updateUserFields = async (userId, fields, successMessage) => {
    try {
      setActionLoadingId(userId);
      await updateDoc(doc(db, "users", userId), fields);
      Alert.alert("Success", successMessage);
    } catch (error) {
      console.log("Update user error:", error);
      Alert.alert("Error", "Failed to update account");
    } finally {
      setActionLoadingId(null);
    }
  };

  const changeStatus = async (user, newStatus) => {
    const updatePayload = {
      status: newStatus,
      active: newStatus === "active",
      updatedAt: serverTimestamp(),
    };

    await updateUserFields(
      user.id,
      updatePayload,
      `Account marked as ${getStatusLabel(newStatus).toLowerCase()}`
    );
  };

  const toggleVerification = async (user) => {
    await updateUserFields(
      user.id,
      {
        verified: !user.verified,
        isVerified: !user.verified,
        verificationBadge: !user.verified,
        hasVerificationBadge: !user.verified,
        updatedAt: serverTimestamp(),
      },
      user.verified
        ? "Verification badge removed"
        : "Verification badge granted"
    );
  };

  const changeRole = async (user, newRole) => {
    await updateUserFields(
      user.id,
      {
        role: newRole,
        updatedAt: serverTimestamp(),
      },
      `Role changed to ${getRoleLabel(newRole)}`
    );
  };

  const changeAccountType = async (user, newType) => {
    await updateUserFields(
      user.id,
      {
        accountType: newType,
        userType: newType,
        updatedAt: serverTimestamp(),
      },
      `Account type changed to ${getAccountTypeLabel(newType)}`
    );
  };

  const deleteUserAccount = async (user) => {
    try {
      setActionLoadingId(user.id);
      await deleteDoc(doc(db, "users", user.id));
      Alert.alert("Success", "Account deleted successfully");
    } catch (error) {
      console.log("Delete user error:", error);
      Alert.alert("Error", "Failed to delete account");
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleCreateAccount = async () => {
    const displayName = newAccount.displayName.trim();
    const username = newAccount.username.trim().replace(/^@+/, "");
    const email = newAccount.email.trim().toLowerCase();

    if (!displayName || !email) {
      Alert.alert("Missing details", "Please enter at least a name and email.");
      return;
    }

    const emailExists = users.some(
      (user) => user.email.trim().toLowerCase() === email
    );

    if (emailExists) {
      Alert.alert("Duplicate email", "An account with this email already exists.");
      return;
    }

    try {
      setCreatingAccount(true);

      const payload = {
        displayName,
        name: displayName,
        username: username || email.split("@")[0],
        email,
        role: newAccount.role,
        accountType: newAccount.accountType,
        userType: newAccount.accountType,
        status: newAccount.status,
        active: newAccount.status === "active",
        verified: false,
        isVerified: false,
        verificationBadge: false,
        hasVerificationBadge: false,
        photoURL: newAccount.avatar.trim() || "",
        avatar: newAccount.avatar.trim() || "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        lastSeen: serverTimestamp(),
      };

      const docRef = await addDoc(collection(db, "users"), payload);

      await setDoc(
        doc(db, "notifications", `${docRef.id}_welcome_admin_created`),
        {
          userId: docRef.id,
          title: "Account Created",
          message: "Your account has been created by an administrator.",
          type: "account_created",
          read: false,
          createdAt: serverTimestamp(),
        },
        { merge: true }
      ).catch(() => null);

      setNewAccount(EMPTY_NEW_ACCOUNT);
      setAddModalVisible(false);
      Alert.alert("Success", "Account created successfully.");
    } catch (error) {
      console.log("Create account error:", error);
      Alert.alert("Error", "Failed to create account.");
    } finally {
      setCreatingAccount(false);
    }
  };

  const handleSwitchManagedAccount = (user) => {
    setManagedAccount(user);
    Alert.alert(
      "Account view switched",
      `You are now viewing ${user.name} in admin managed mode.`
    );
  };

  const clearManagedAccount = () => {
    setManagedAccount(null);
  };

  const openUserActions = (user) => {
    Alert.alert(user.name, "Choose an action", [
      {
        text: "Switch View",
        onPress: () => handleSwitchManagedAccount(user),
      },
      {
        text: "Make User",
        onPress: () => changeRole(user, "user"),
      },
      {
        text: "Make Service Provider",
        onPress: () => changeRole(user, "service_provider"),
      },
      {
        text: "Make Admin",
        onPress: () => changeRole(user, "admin"),
      },
      {
        text: user.status === "active" ? "Suspend Account" : "Set Active",
        onPress: () =>
          changeStatus(user, user.status === "active" ? "suspended" : "active"),
      },
      {
        text: user.status === "blocked" ? "Unblock Account" : "Block Account",
        onPress: () =>
          changeStatus(user, user.status === "blocked" ? "active" : "blocked"),
      },
      {
        text: user.verified ? "Remove Verification" : "Grant Verification",
        onPress: () => toggleVerification(user),
      },
      {
        text: "Delete Account",
        style: "destructive",
        onPress: () => {
          Alert.alert(
            "Delete Account",
            `Are you sure you want to delete ${user.name}?`,
            [
              { text: "Cancel", style: "cancel" },
              {
                text: "Delete",
                style: "destructive",
                onPress: () => deleteUserAccount(user),
              },
            ]
          );
        },
      },
      {
        text: "Cancel",
        style: "cancel",
      },
    ]);
  };

  const openAccountTypeActions = (user) => {
    Alert.alert("Account Type", `Change ${user.name}'s account type`, [
      {
        text: "Artist",
        onPress: () => changeAccountType(user, "artist"),
      },
      {
        text: "Buyer",
        onPress: () => changeAccountType(user, "buyer"),
      },
      {
        text: "Cancel",
        style: "cancel",
      },
    ]);
  };

  const filterOptions = [
    { key: "all", label: "All" },
    { key: "artists", label: "Artists" },
    { key: "buyers", label: "Buyers" },
    { key: "providers", label: "Providers" },
    { key: "admins", label: "Admins" },
    { key: "verified", label: "Verified" },
    { key: "flagged", label: "Flagged" },
  ];

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.heroCard}>
          <View style={styles.heroTopRow}>
            <View>
              <Text style={styles.logo}>ArtLinker</Text>
              <Text style={styles.heroBadge}>Admin Users</Text>
            </View>

            <View style={styles.headerActions}>
              <TouchableOpacity
                style={styles.addButton}
                activeOpacity={0.85}
                onPress={() => setAddModalVisible(true)}
              >
                <Ionicons name="add" size={16} color="#FFFFFF" />
                <Text style={styles.addButtonText}>Add Account</Text>
              </TouchableOpacity>

              <View style={styles.headerIconWrap}>
                <Ionicons name="people-outline" size={20} color="#7C3AED" />
              </View>
            </View>
          </View>

          <Text style={styles.title}>User Management</Text>
          <Text style={styles.subtitle}>
            Manage artists, buyers, service providers, and administrators with full moderation control
          </Text>

          {managedAccount ? (
            <View style={styles.managedBanner}>
              <View style={styles.managedBannerLeft}>
                <Ionicons name="swap-horizontal-outline" size={16} color="#1D4ED8" />
                <Text style={styles.managedBannerText} numberOfLines={1}>
                  Viewing as: {managedAccount.name}
                </Text>
              </View>

              <TouchableOpacity
                style={styles.clearManagedButton}
                onPress={clearManagedAccount}
                activeOpacity={0.85}
              >
                <Text style={styles.clearManagedButtonText}>Clear</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>

        <View style={styles.summaryGrid}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>All Accounts</Text>
            <Text style={styles.summaryValue}>{formatNumber(summary.total)}</Text>
          </View>

          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Artists</Text>
            <Text style={styles.summaryValue}>{formatNumber(summary.artists)}</Text>
          </View>

          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Buyers</Text>
            <Text style={styles.summaryValue}>{formatNumber(summary.buyers)}</Text>
          </View>

          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Providers</Text>
            <Text style={styles.summaryValue}>{formatNumber(summary.providers)}</Text>
          </View>

          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Admins</Text>
            <Text style={styles.summaryValue}>{formatNumber(summary.admins)}</Text>
          </View>

          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Verified</Text>
            <Text style={styles.summaryValue}>{formatNumber(summary.verified)}</Text>
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
            placeholder="Search by name, email, role, type, or status"
            placeholderTextColor="#9CA3AF"
            value={search}
            onChangeText={setSearch}
          />
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          {filterOptions.map((item) => {
            const active = selectedFilter === item.key;

            return (
              <TouchableOpacity
                key={item.key}
                style={[styles.filterChip, active && styles.filterChipActive]}
                onPress={() => setSelectedFilter(item.key)}
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

        {loading ? (
          <View style={styles.loaderWrap}>
            <ActivityIndicator size="large" color="#7C3AED" />
            <Text style={styles.loadingText}>Loading accounts...</Text>
          </View>
        ) : filteredUsers.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Ionicons name="people-outline" size={26} color="#9CA3AF" />
            <Text style={styles.emptyTitle}>No accounts found</Text>
            <Text style={styles.emptySubtitle}>
              Try another search or filter
            </Text>
          </View>
        ) : (
          <View style={styles.list}>
            {filteredUsers.map((user) => (
              <View
                key={user.id}
                style={[
                  styles.userCard,
                  managedAccount?.id === user.id && styles.userCardManaged,
                ]}
              >
                <View style={styles.userTopRow}>
                  <View style={styles.userLeft}>
                    <Image source={{ uri: user.image }} style={styles.avatar} />

                    <View style={styles.userTextWrap}>
                      <View style={styles.nameRow}>
                        <Text style={styles.userName} numberOfLines={1}>
                          {user.name}
                        </Text>

                        {user.verified ? (
                          <Ionicons
                            name="checkmark-circle"
                            size={16}
                            color="#2563EB"
                            style={styles.verifiedIcon}
                          />
                        ) : null}
                      </View>

                      <Text style={styles.userUsername} numberOfLines={1}>
                        {user.username}
                      </Text>
                      <Text style={styles.userEmail} numberOfLines={1}>
                        {user.email || "No email"}
                      </Text>
                    </View>
                  </View>

                  <TouchableOpacity
                    style={styles.moreButton}
                    onPress={() => openUserActions(user)}
                    disabled={actionLoadingId === user.id}
                    activeOpacity={0.85}
                  >
                    {actionLoadingId === user.id ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Feather name="more-horizontal" size={16} color="#FFFFFF" />
                    )}
                  </TouchableOpacity>
                </View>

                <View style={styles.badgesRow}>
                  <View style={styles.roleBadge}>
                    <Text style={styles.roleBadgeText}>
                      {getRoleLabel(user.role)}
                    </Text>
                  </View>

                  <TouchableOpacity
                    style={styles.typeBadge}
                    onPress={() => openAccountTypeActions(user)}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.typeBadgeText}>
                      {getAccountTypeLabel(user.accountType)}
                    </Text>
                  </TouchableOpacity>

                  <View
                    style={[
                      styles.statusBadge,
                      user.status === "blocked" && styles.statusBadgeBlocked,
                      user.status === "suspended" && styles.statusBadgeSuspended,
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusBadgeText,
                        user.status === "blocked" && styles.statusBadgeTextBlocked,
                        user.status === "suspended" &&
                          styles.statusBadgeTextSuspended,
                      ]}
                    >
                      {getStatusLabel(user.status)}
                    </Text>
                  </View>
                </View>

                <View style={styles.metricsRow}>
                  <View style={styles.metricBlock}>
                    <Text style={styles.metricLabel}>Artworks</Text>
                    <Text style={styles.metricValue}>
                      {formatNumber(user.artworkCount)}
                    </Text>
                  </View>

                  <View style={styles.metricBlock}>
                    <Text style={styles.metricLabel}>Reports</Text>
                    <Text style={styles.metricValue}>
                      {formatNumber(user.reportsCount)}
                    </Text>
                  </View>

                  <View style={styles.metricBlock}>
                    <Text style={styles.metricLabel}>Recent Reports</Text>
                    <Text style={styles.metricValue}>
                      {formatNumber(user.recentReports)}
                    </Text>
                  </View>
                </View>

                <View style={styles.activityCard}>
                  <View style={styles.activityRow}>
                    <Ionicons name="time-outline" size={14} color="#6B7280" />
                    <Text style={styles.activityText}>
                      Last activity: {getTimeAgo(user.lastActive)}
                    </Text>
                  </View>

                  <View style={styles.activityRow}>
                    <Ionicons
                      name="calendar-outline"
                      size={14}
                      color="#6B7280"
                    />
                    <Text style={styles.activityText}>
                      Joined: {getTimeAgo(user.createdAt)}
                    </Text>
                  </View>
                </View>

                <View style={styles.actionRow}>
                  <TouchableOpacity
                    style={styles.actionButtonLight}
                    onPress={() => handleSwitchManagedAccount(user)}
                    disabled={actionLoadingId === user.id}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="swap-horizontal-outline" size={15} color="#374151" />
                    <Text style={styles.actionButtonLightText}>Switch View</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.actionButtonLight}
                    onPress={() => toggleVerification(user)}
                    disabled={actionLoadingId === user.id}
                    activeOpacity={0.85}
                  >
                    <Ionicons
                      name={
                        user.verified
                          ? "checkmark-circle-outline"
                          : "checkmark-done-outline"
                      }
                      size={15}
                      color="#374151"
                    />
                    <Text style={styles.actionButtonLightText}>
                      {user.verified ? "Remove Badge" : "Verify"}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.actionButtonDanger}
                    onPress={() =>
                      changeStatus(
                        user,
                        user.status === "blocked" ? "active" : "blocked"
                      )
                    }
                    disabled={actionLoadingId === user.id}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="ban-outline" size={15} color="#FFFFFF" />
                    <Text style={styles.actionButtonDangerText}>
                      {user.status === "blocked" ? "Unblock" : "Block"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <Modal
        visible={addModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setAddModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Add Account</Text>
                <Text style={styles.modalSubtitle}>
                  Create a new managed account in Firestore
                </Text>
              </View>

              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setAddModalVisible(false)}
                activeOpacity={0.85}
              >
                <Ionicons name="close" size={18} color="#111827" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.fieldLabel}>Full Name</Text>
              <TextInput
                style={styles.input}
                value={newAccount.displayName}
                onChangeText={(text) =>
                  setNewAccount((prev) => ({ ...prev, displayName: text }))
                }
                placeholder="Enter full name"
                placeholderTextColor="#9CA3AF"
              />

              <Text style={styles.fieldLabel}>Username</Text>
              <TextInput
                style={styles.input}
                value={newAccount.username}
                onChangeText={(text) =>
                  setNewAccount((prev) => ({ ...prev, username: text }))
                }
                placeholder="Enter username"
                placeholderTextColor="#9CA3AF"
              />

              <Text style={styles.fieldLabel}>Email</Text>
              <TextInput
                style={styles.input}
                value={newAccount.email}
                onChangeText={(text) =>
                  setNewAccount((prev) => ({ ...prev, email: text }))
                }
                placeholder="Enter email address"
                placeholderTextColor="#9CA3AF"
                autoCapitalize="none"
                keyboardType="email-address"
              />

              <Text style={styles.fieldLabel}>Avatar URL</Text>
              <TextInput
                style={styles.input}
                value={newAccount.avatar}
                onChangeText={(text) =>
                  setNewAccount((prev) => ({ ...prev, avatar: text }))
                }
                placeholder="Optional image URL"
                placeholderTextColor="#9CA3AF"
                autoCapitalize="none"
              />

              <Text style={styles.fieldLabel}>Role</Text>
              <View style={styles.optionRow}>
                {["user", "service_provider", "admin"].map((role) => {
                  const active = newAccount.role === role;
                  return (
                    <TouchableOpacity
                      key={role}
                      style={[styles.optionChip, active && styles.optionChipActive]}
                      onPress={() =>
                        setNewAccount((prev) => ({ ...prev, role }))
                      }
                      activeOpacity={0.85}
                    >
                      <Text
                        style={[
                          styles.optionChipText,
                          active && styles.optionChipTextActive,
                        ]}
                      >
                        {getRoleLabel(role)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.fieldLabel}>Account Type</Text>
              <View style={styles.optionRow}>
                {["buyer", "artist"].map((type) => {
                  const active = newAccount.accountType === type;
                  return (
                    <TouchableOpacity
                      key={type}
                      style={[styles.optionChip, active && styles.optionChipActive]}
                      onPress={() =>
                        setNewAccount((prev) => ({ ...prev, accountType: type }))
                      }
                      activeOpacity={0.85}
                    >
                      <Text
                        style={[
                          styles.optionChipText,
                          active && styles.optionChipTextActive,
                        ]}
                      >
                        {getAccountTypeLabel(type)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.fieldLabel}>Status</Text>
              <View style={styles.optionRow}>
                {["active", "suspended", "blocked"].map((status) => {
                  const active = newAccount.status === status;
                  return (
                    <TouchableOpacity
                      key={status}
                      style={[styles.optionChip, active && styles.optionChipActive]}
                      onPress={() =>
                        setNewAccount((prev) => ({ ...prev, status }))
                      }
                      activeOpacity={0.85}
                    >
                      <Text
                        style={[
                          styles.optionChipText,
                          active && styles.optionChipTextActive,
                        ]}
                      >
                        {getStatusLabel(status)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <TouchableOpacity
                style={styles.createButton}
                onPress={handleCreateAccount}
                disabled={creatingAccount}
                activeOpacity={0.85}
              >
                {creatingAccount ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="person-add-outline" size={16} color="#FFFFFF" />
                    <Text style={styles.createButtonText}>Create Account</Text>
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
    backgroundColor: "#F8FAFC",
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 24,
  },

  heroCard: {
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
  heroTopRow: {
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
  heroBadge: {
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
  headerActions: {
    alignItems: "flex-end",
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#111827",
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    marginBottom: 10,
  },
  addButtonText: {
    marginLeft: 6,
    fontSize: 12,
    fontWeight: "800",
    color: "#FFFFFF",
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
  managedBanner: {
    marginTop: 14,
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  managedBannerLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: 12,
  },
  managedBannerText: {
    marginLeft: 7,
    fontSize: 12,
    fontWeight: "700",
    color: "#1D4ED8",
  },
  clearManagedButton: {
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
  },
  clearManagedButtonText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#1D4ED8",
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
    marginBottom: 12,
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

  list: {
    gap: 14,
  },
  userCard: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E9EEF5",
    borderRadius: 22,
    padding: 14,
    shadowColor: "#0F172A",
    shadowOpacity: 0.04,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  userCardManaged: {
    borderColor: "#93C5FD",
    backgroundColor: "#F8FBFF",
  },
  userTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  userLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: 10,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    marginRight: 12,
    backgroundColor: "#E5E7EB",
  },
  userTextWrap: {
    flex: 1,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  userName: {
    fontSize: 15,
    fontWeight: "800",
    color: "#111827",
    maxWidth: "88%",
  },
  verifiedIcon: {
    marginLeft: 6,
  },
  userUsername: {
    marginTop: 3,
    fontSize: 12,
    color: "#6B7280",
    fontWeight: "700",
  },
  userEmail: {
    marginTop: 3,
    fontSize: 12,
    color: "#94A3B8",
    fontWeight: "600",
  },
  moreButton: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "#111827",
    alignItems: "center",
    justifyContent: "center",
  },

  badgesRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 14,
  },
  roleBadge: {
    backgroundColor: "#F5F3FF",
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    marginRight: 8,
    marginBottom: 8,
  },
  roleBadgeText: {
    fontSize: 11,
    color: "#6D28D9",
    fontWeight: "800",
  },
  typeBadge: {
    backgroundColor: "#EFF6FF",
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    marginRight: 8,
    marginBottom: 8,
  },
  typeBadgeText: {
    fontSize: 11,
    color: "#1D4ED8",
    fontWeight: "800",
  },
  statusBadge: {
    backgroundColor: "#ECFDF5",
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    marginBottom: 8,
  },
  statusBadgeBlocked: {
    backgroundColor: "#FEF2F2",
  },
  statusBadgeSuspended: {
    backgroundColor: "#FFF7ED",
  },
  statusBadgeText: {
    fontSize: 11,
    color: "#059669",
    fontWeight: "800",
  },
  statusBadgeTextBlocked: {
    color: "#DC2626",
  },
  statusBadgeTextSuspended: {
    color: "#B45309",
  },

  metricsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  metricBlock: {
    flex: 1,
    backgroundColor: "#FAFAFB",
    borderRadius: 14,
    padding: 10,
    marginRight: 8,
    borderWidth: 1,
    borderColor: "#EEF2F7",
  },
  metricLabel: {
    fontSize: 11,
    color: "#94A3B8",
    fontWeight: "700",
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 14,
    color: "#111827",
    fontWeight: "900",
  },

  activityCard: {
    backgroundColor: "#FAFAFB",
    borderWidth: 1,
    borderColor: "#EEF2F7",
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
  },
  activityRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 7,
  },
  activityText: {
    marginLeft: 8,
    fontSize: 12,
    color: "#4B5563",
    fontWeight: "600",
  },

  actionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  actionButtonLight: {
    flex: 1,
    marginRight: 8,
    backgroundColor: "#F3F4F6",
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  actionButtonLightText: {
    marginLeft: 5,
    fontSize: 12,
    fontWeight: "800",
    color: "#374151",
  },
  actionButtonDanger: {
    flex: 1,
    backgroundColor: "#111827",
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  actionButtonDangerText: {
    marginLeft: 5,
    fontSize: 12,
    fontWeight: "800",
    color: "#FFFFFF",
  },

  loaderWrap: {
    paddingVertical: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    marginTop: 10,
    fontSize: 13,
    color: "#6B7280",
    fontWeight: "600",
  },
  emptyWrap: {
    paddingVertical: 44,
    alignItems: "center",
  },
  emptyTitle: {
    marginTop: 10,
    fontSize: 15,
    color: "#111827",
    fontWeight: "800",
  },
  emptySubtitle: {
    marginTop: 6,
    fontSize: 12,
    color: "#6B7280",
    fontWeight: "600",
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.24)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 28,
    maxHeight: "85%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: "900",
    color: "#111827",
  },
  modalSubtitle: {
    marginTop: 4,
    fontSize: 12,
    color: "#6B7280",
    lineHeight: 18,
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: "#374151",
    marginBottom: 8,
    marginTop: 10,
  },
  input: {
    height: 46,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    paddingHorizontal: 12,
    fontSize: 13,
    color: "#111827",
    fontWeight: "600",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  optionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  optionChip: {
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    marginRight: 8,
    marginBottom: 8,
  },
  optionChipActive: {
    backgroundColor: "#111827",
    borderColor: "#111827",
  },
  optionChipText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#374151",
  },
  optionChipTextActive: {
    color: "#FFFFFF",
  },
  createButton: {
    marginTop: 18,
    backgroundColor: "#111827",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  createButtonText: {
    marginLeft: 6,
    fontSize: 13,
    fontWeight: "800",
    color: "#FFFFFF",
  },
});
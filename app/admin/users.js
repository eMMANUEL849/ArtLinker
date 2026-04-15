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
} from "react-native";
import { Ionicons, Feather } from "@expo/vector-icons";
import {
  collection,
  onSnapshot,
  doc,
  updateDoc,
  deleteDoc,
} from "firebase/firestore";
import { db } from "../../config/firebase";

export default function AdminUsersScreen() {
  const [search, setSearch] = useState("");
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState(null);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "users"),
      (snapshot) => {
        const accounts = snapshot.docs.map((item) => {
          const data = item.data();

          return {
            id: item.id,
            name: data.displayName || "Unknown User",
            username: data.email
              ? `@${data.email.split("@")[0]}`
              : "@unknown",
            email: data.email || "",
            role: data.role || "user",
            active: typeof data.active === "boolean" ? data.active : true,
            image: data.photoURL || data.profileImage || data.avatar || "",
          };
        });

        const filteredAccounts = accounts.filter(
          (item) =>
            item.role === "user" ||
            item.role === "service_provider" ||
            item.role === "admin"
        );

        setUsers(filteredAccounts);
        setLoading(false);
      },
      (error) => {
        console.log("Firestore error:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();

    if (!q) return users;

    return users.filter(
      (user) =>
        user.name.toLowerCase().includes(q) ||
        user.username.toLowerCase().includes(q) ||
        user.email.toLowerCase().includes(q) ||
        user.role.toLowerCase().includes(q)
    );
  }, [search, users]);

  const toggleBlockUser = async (user) => {
    try {
      setActionLoadingId(user.id);
      await updateDoc(doc(db, "users", user.id), {
        active: !user.active,
      });
      Alert.alert(
        "Success",
        user.active ? "Account blocked successfully" : "Account unblocked successfully"
      );
    } catch (error) {
      console.log("Block user error:", error);
      Alert.alert("Error", "Failed to update account status");
    } finally {
      setActionLoadingId(null);
    }
  };

  const switchRole = async (user) => {
    try {
      if (user.role === "admin") {
        Alert.alert("Not allowed", "Admin role cannot be switched here");
        return;
      }

      const newRole =
        user.role === "service_provider" ? "user" : "service_provider";

      setActionLoadingId(user.id);
      await updateDoc(doc(db, "users", user.id), {
        role: newRole,
      });

      Alert.alert(
        "Success",
        `Role changed to ${
          newRole === "service_provider" ? "service provider" : "user"
        }`
      );
    } catch (error) {
      console.log("Switch role error:", error);
      Alert.alert("Error", "Failed to switch role");
    } finally {
      setActionLoadingId(null);
    }
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

  const openUserActions = (user) => {
    const roleSwitchLabel =
      user.role === "admin"
        ? "Cannot switch admin role"
        : user.role === "service_provider"
        ? "Switch to User"
        : "Switch to Service Provider";

    const blockLabel = user.active ? "Block Account" : "Unblock Account";

    Alert.alert(
      user.name,
      "Choose an action",
      [
        {
          text: roleSwitchLabel,
          onPress: () => {
            if (user.role !== "admin") {
              switchRole(user);
            }
          },
        },
        {
          text: blockLabel,
          onPress: () => toggleBlockUser(user),
        },
        {
          text: "Delete Account",
          style: "destructive",
          onPress: () => {
            Alert.alert(
              "Delete Account",
              `Are you sure you want to delete ${user.name}?`,
              [
                {
                  text: "Cancel",
                  style: "cancel",
                },
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
      ]
    );
  };

  const getRoleLabel = (role) => {
    if (role === "service_provider") return "Service Provider";
    if (role === "admin") return "Admin";
    return "User";
  };

  const getStatusLabel = (active) => {
    return active ? "Active" : "Blocked";
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.header}>
          <Text style={styles.logo}>ArtLinker</Text>
          <Text style={styles.title}>User Management</Text>
          <Text style={styles.subtitle}>
            Manage users, service providers, and admins
          </Text>
        </View>

        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>All Accounts</Text>
          <Text style={styles.summaryValue}>
            Total {users.length} accounts
          </Text>
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
            placeholder="Search users..."
            placeholderTextColor="#9CA3AF"
            value={search}
            onChangeText={setSearch}
          />
        </View>

        {loading ? (
          <View style={styles.loaderWrap}>
            <ActivityIndicator size="large" color="#f06ce9" />
            <Text style={styles.loadingText}>Loading accounts...</Text>
          </View>
        ) : filteredUsers.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyText}>No accounts found</Text>
          </View>
        ) : (
          <View style={styles.list}>
            {filteredUsers.map((user) => (
              <View key={user.id} style={styles.userCard}>
                <View style={styles.userTopRow}>
                  <View style={styles.userLeft}>
                    {user.image ? (
                      <Image source={{ uri: user.image }} style={styles.avatar} />
                    ) : (
                      <View style={styles.avatarFallback}>
                        <Ionicons name="person" size={20} color="#6B7280" />
                      </View>
                    )}

                    <View style={styles.userTextWrap}>
                      <Text style={styles.userName}>{user.name}</Text>
                      <Text style={styles.userUsername}>{user.username}</Text>
                    </View>
                  </View>

                  <TouchableOpacity
                    style={styles.moreButton}
                    onPress={() => openUserActions(user)}
                    disabled={actionLoadingId === user.id}
                  >
                    {actionLoadingId === user.id ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <Feather
                        name="more-horizontal"
                        size={16}
                        color="#ffffff"
                      />
                    )}
                  </TouchableOpacity>
                </View>

                <View style={styles.statsRow}>
                  <View style={styles.statBlock}>
                    <Text style={styles.statLabel}>Email</Text>
                    <Text style={styles.statValue} numberOfLines={1}>
                      {user.email || "No email"}
                    </Text>
                  </View>

                  <View style={styles.statBlock}>
                    <Text style={styles.statLabel}>Role</Text>
                    <Text style={styles.roleText}>{getRoleLabel(user.role)}</Text>
                  </View>

                  <View style={styles.statBlock}>
                    <Text style={styles.statLabel}>Status</Text>
                    <Text
                      style={[
                        styles.statusText,
                        !user.active && styles.blockedText,
                      ]}
                    >
                      {getStatusLabel(user.active)}
                    </Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  scrollContent: {
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 24,
  },
  header: {
    alignItems: "center",
    marginBottom: 16,
  },
  logo: {
    fontSize: 24,
    fontWeight: "800",
    color: "#f06ce9",
    marginBottom: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: "900",
    color: "#111827",
  },
  subtitle: {
    marginTop: 4,
    fontSize: 11,
    color: "#9CA3AF",
    textAlign: "center",
  },
  summaryCard: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#EEF0F4",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 12,
  },
  summaryLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#4B5563",
  },
  summaryValue: {
    marginTop: 4,
    fontSize: 12,
    color: "#6B7280",
    fontWeight: "600",
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
    height: 40,
    backgroundColor: "#F3F4F6",
    borderRadius: 10,
    paddingLeft: 34,
    paddingRight: 12,
    fontSize: 13,
    color: "#111827",
    fontWeight: "600",
  },
  list: {
    gap: 12,
  },
  userCard: {
    backgroundColor: "#F3F4F6",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 16,
    padding: 12,
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
    width: 42,
    height: 42,
    borderRadius: 21,
    marginRight: 10,
  },
  avatarFallback: {
    width: 42,
    height: 42,
    borderRadius: 21,
    marginRight: 10,
    backgroundColor: "#E5E7EB",
    alignItems: "center",
    justifyContent: "center",
  },
  userTextWrap: {
    flex: 1,
  },
  userName: {
    fontSize: 14,
    fontWeight: "800",
    color: "#111827",
  },
  userUsername: {
    marginTop: 2,
    fontSize: 11,
    color: "#9CA3AF",
    fontWeight: "600",
  },
  moreButton: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "#111827",
    alignItems: "center",
    justifyContent: "center",
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  statBlock: {
    flex: 1,
    marginRight: 8,
  },
  statLabel: {
    fontSize: 11,
    color: "#9CA3AF",
    fontWeight: "600",
    marginBottom: 4,
  },
  statValue: {
    fontSize: 12,
    color: "#374151",
    fontWeight: "700",
  },
  roleText: {
    fontSize: 12,
    color: "#374151",
    fontWeight: "700",
  },
  statusText: {
    fontSize: 12,
    color: "#16A34A",
    fontWeight: "700",
  },
  blockedText: {
    color: "#DC2626",
  },
  loaderWrap: {
    paddingVertical: 40,
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
    paddingVertical: 40,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 14,
    color: "#6B7280",
    fontWeight: "600",
  },
});
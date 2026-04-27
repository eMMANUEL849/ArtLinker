import React, { useEffect, useMemo, useState } from "react";
import {
  
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StatusBar,
  Dimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import { auth, db } from "../../config/firebase";

const screenWidth = Dimensions.get("window").width;

const questionLabels = {
  easeOfNavigation: "Ease of Navigation",
  uploadProcess: "Upload Process",
  visualDesign: "Visual Design",
  responsiveness: "Responsiveness",
  messaging: "Messaging",
  overallSatisfaction: "Overall Satisfaction",
};

function formatDate(value) {
  try {
    if (!value) return "Unknown date";

    const date =
      typeof value?.toDate === "function"
        ? value.toDate()
        : value?.seconds
        ? new Date(value.seconds * 1000)
        : new Date(value);

    if (Number.isNaN(date.getTime())) return "Unknown date";

    return date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "Unknown date";
  }
}

function getQuestionAverages(feedbackItems) {
  return Object.entries(questionLabels).map(([key, label]) => {
    const scores = feedbackItems
      .map((item) => Number(item.feedbackRatings?.[key] || 0))
      .filter((score) => score > 0);

    const average = scores.length
      ? scores.reduce((sum, score) => sum + score, 0) / scores.length
      : 0;

    return {
      key,
      label,
      average: Number(average.toFixed(1)),
    };
  });
}

export default function AdminFeedbackScreen() {
  const router = useRouter();
  const user = auth.currentUser;

  const [loading, setLoading] = useState(true);
  const [feedbackItems, setFeedbackItems] = useState([]);

  const theme = useMemo(
    () => ({
      background: "#F7F8FC",
      surface: "#FFFFFF",
      surfaceAlt: "#FAFAFC",
      border: "#ECECF2",
      text: "#171717",
      textSoft: "#374151",
      textMuted: "#7B8190",
      primary: "#7C3AED",
      danger: "#EF4444",
      success: "#16A34A",
    }),
    []
  );

  const styles = useMemo(() => createStyles(theme), [theme]);

  useEffect(() => {
    if (!user?.uid) {
      setLoading(false);
      return;
    }

    const feedbackQuery = query(
  collection(db, "feedbacks"),
  orderBy("createdAt", "desc")
);
    const unsubscribe = onSnapshot(
      feedbackQuery,
      (snapshot) => {
        const items = snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        }));

        setFeedbackItems(items);
        setLoading(false);
      },
      (error) => {
        console.log("ADMIN FEEDBACK LOAD ERROR:", error);
        setFeedbackItems([]);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [user?.uid]);

  const averageScore = useMemo(() => {
    const scores = feedbackItems
      .map((item) => Number(item.averageRating || 0))
      .filter((score) => score > 0);

    if (!scores.length) return 0;

    const total = scores.reduce((sum, score) => sum + score, 0);
    return Number((total / scores.length).toFixed(1));
  }, [feedbackItems]);

  const questionAverages = useMemo(
    () => getQuestionAverages(feedbackItems),
    [feedbackItems]
  );

  const unreadCount = feedbackItems.filter((item) => !item.read).length;
  const maxBarWidth = screenWidth - 120;

  const markAsRead = async (feedbackId) => {
    try {
      await updateDoc(doc(db, "feedbacks", feedbackId), {
  read: true,
  status: "read",
});
    } catch (error) {
      console.log("MARK FEEDBACK READ ERROR:", error);
      Alert.alert("Error", "Could not mark feedback as read.");
    }
  };

  const deleteFeedback = (feedbackId) => {
    Alert.alert(
      "Delete Feedback",
      "Are you sure you want to delete this feedback?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteDoc(doc(db, "feedbacks", feedbackId));
            } catch (error) {
              console.log("DELETE FEEDBACK ERROR:", error);
              Alert.alert("Error", "Could not delete feedback.");
            }
          },
        },
      ]
    );
  };

  const renderRatingRows = (ratings = {}) => {
    return Object.entries(questionLabels).map(([key, label]) => {
      const score = Number(ratings?.[key] || 0);

      return (
        <View key={key} style={styles.ratingRow}>
          <Text style={styles.ratingLabel}>{label}</Text>

          <View style={styles.ratingRight}>
            <View style={styles.starMiniRow}>
              {[1, 2, 3, 4, 5].map((star) => (
                <Ionicons
                  key={star}
                  name={score >= star ? "star" : "star-outline"}
                  size={14}
                  color={score >= star ? "#F59E0B" : "#CBD5E1"}
                />
              ))}
            </View>

            <Text style={styles.ratingScore}>{score || "-"} / 5</Text>
          </View>
        </View>
      );
    });
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loaderScreen} edges={["top"]}>
        <StatusBar barStyle="dark-content" backgroundColor={theme.background} />
        <ActivityIndicator size="large" color={theme.primary} />
        <Text style={styles.loaderText}>Loading feedback...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <StatusBar barStyle="dark-content" backgroundColor={theme.background} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
            activeOpacity={0.85}
          >
            <Ionicons name="chevron-back" size={22} color={theme.text} />
          </TouchableOpacity>

          <Text style={styles.headerTitle}>User Feedback</Text>

          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.heroCard}>
          <Text style={styles.heroTitle}>Feedback Dashboard</Text>
          <Text style={styles.heroText}>
            Review user ratings, feedback comments, and evaluation trends.
          </Text>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{feedbackItems.length}</Text>
            <Text style={styles.statLabel}>Total Feedback</Text>
          </View>

          <View style={styles.statCard}>
            <Text style={styles.statValue}>{averageScore || "-"}</Text>
            <Text style={styles.statLabel}>Average Rating</Text>
          </View>

          <View style={styles.statCard}>
            <Text style={styles.statValue}>{unreadCount}</Text>
            <Text style={styles.statLabel}>Unread</Text>
          </View>
        </View>

        <View style={styles.graphCard}>
          <Text style={styles.sectionTitle}>Feedback Analysis Graph</Text>
          <Text style={styles.sectionSubtitle}>
            Average ratings across the main user evaluation areas.
          </Text>

          {questionAverages.map((item) => (
            <View key={item.key} style={styles.graphRow}>
              <View style={styles.graphHeader}>
                <Text style={styles.graphLabel}>{item.label}</Text>
                <Text style={styles.graphValue}>
                  {item.average ? `${item.average} / 5` : "- / 5"}
                </Text>
              </View>

              <View style={styles.graphBarTrack}>
                <View
                  style={[
                    styles.graphBarFill,
                    {
                      width: Math.max((item.average / 5) * maxBarWidth, 6),
                    },
                  ]}
                />
              </View>
            </View>
          ))}
        </View>

        {feedbackItems.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons
              name="chatbubble-ellipses-outline"
              size={42}
              color={theme.textMuted}
            />
            <Text style={styles.emptyTitle}>No feedback yet</Text>
            <Text style={styles.emptyText}>
              User feedback will appear here once it has been submitted.
            </Text>
          </View>
        ) : (
          feedbackItems.map((item) => (
            <View key={item.id} style={styles.feedbackCard}>
              <View style={styles.feedbackHeader}>
                <View style={styles.senderBlock}>
                  <Text style={styles.senderName}>
                    {item.senderName || "Unknown User"}
                  </Text>
                  <Text style={styles.senderEmail}>
                    {item.senderEmail || "No email available"}
                  </Text>
                </View>

                <View
                  style={[
                    styles.statusBadge,
                    item.read ? styles.readBadge : styles.unreadBadge,
                  ]}
                >
                  <Text
                    style={[
                      styles.statusBadgeText,
                      item.read ? styles.readBadgeText : styles.unreadBadgeText,
                    ]}
                  >
                    {item.read ? "Read" : "Unread"}
                  </Text>
                </View>
              </View>

              <Text style={styles.dateText}>{formatDate(item.createdAt)}</Text>

              <View style={styles.averageBox}>
                <Text style={styles.averageLabel}>Average Rating</Text>
                <Text style={styles.averageValue}>
                  {item.averageRating ? `${item.averageRating} / 5` : "- / 5"}
                </Text>
              </View>

              <View style={styles.ratingsBox}>
                {renderRatingRows(item.feedbackRatings)}
              </View>

              <View style={styles.messageBox}>
                <Text style={styles.messageLabel}>Feedback Comment</Text>
                <Text style={styles.messageText}>
                  {item.feedbackMessage || item.message || "No comment provided."}
                </Text>
              </View>

              <View style={styles.actionRow}>
                {!item.read ? (
                  <TouchableOpacity
                    style={styles.readButton}
                    onPress={() => markAsRead(item.id)}
                    activeOpacity={0.85}
                  >
                    <Ionicons
                      name="checkmark-circle-outline"
                      size={18}
                      color="#FFFFFF"
                    />
                    <Text style={styles.actionButtonText}>Mark as Read</Text>
                  </TouchableOpacity>
                ) : null}

                <TouchableOpacity
                  style={styles.deleteButton}
                  onPress={() => deleteFeedback(item.id)}
                  activeOpacity={0.85}
                >
                  <Ionicons name="trash-outline" size={18} color="#FFFFFF" />
                  <Text style={styles.actionButtonText}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(theme) {
  return StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: theme.background,
    },
    scrollContent: {
      paddingHorizontal: 16,
      paddingTop: 10,
      paddingBottom: 28,
    },
    loaderScreen: {
      flex: 1,
      backgroundColor: theme.background,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 24,
    },
    loaderText: {
      marginTop: 12,
      fontSize: 14,
      fontWeight: "700",
      color: theme.textMuted,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 16,
    },
    backButton: {
      width: 42,
      height: 42,
      borderRadius: 14,
      backgroundColor: theme.surface,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: theme.border,
    },
    headerTitle: {
      fontSize: 21,
      fontWeight: "900",
      color: theme.text,
    },
    headerSpacer: {
      width: 42,
      height: 42,
    },
    heroCard: {
      backgroundColor: "#14112B",
      borderRadius: 24,
      padding: 22,
      marginBottom: 16,
    },
    heroTitle: {
      fontSize: 24,
      fontWeight: "900",
      color: "#FFFFFF",
    },
    heroText: {
      marginTop: 8,
      fontSize: 13,
      lineHeight: 20,
      color: "#C7C9D9",
      fontWeight: "600",
    },
    statsRow: {
      flexDirection: "row",
      gap: 10,
      marginBottom: 14,
    },
    statCard: {
      flex: 1,
      backgroundColor: theme.surface,
      borderRadius: 18,
      padding: 14,
      borderWidth: 1,
      borderColor: theme.border,
    },
    statValue: {
      fontSize: 22,
      fontWeight: "900",
      color: theme.primary,
      textAlign: "center",
    },
    statLabel: {
      marginTop: 4,
      fontSize: 11,
      fontWeight: "800",
      color: theme.textMuted,
      textAlign: "center",
    },
    graphCard: {
      backgroundColor: theme.surface,
      borderRadius: 22,
      padding: 16,
      borderWidth: 1,
      borderColor: theme.border,
      marginBottom: 14,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: "900",
      color: theme.text,
      marginBottom: 6,
    },
    sectionSubtitle: {
      fontSize: 13,
      lineHeight: 19,
      color: theme.textMuted,
      marginBottom: 14,
      fontWeight: "600",
    },
    graphRow: {
      marginBottom: 14,
    },
    graphHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 6,
    },
    graphLabel: {
      flex: 1,
      fontSize: 12,
      fontWeight: "900",
      color: theme.textSoft,
      paddingRight: 10,
    },
    graphValue: {
      fontSize: 12,
      fontWeight: "900",
      color: theme.primary,
    },
    graphBarTrack: {
      height: 15,
      borderRadius: 999,
      backgroundColor: "#EEF1F6",
      overflow: "hidden",
    },
    graphBarFill: {
      height: 15,
      borderRadius: 999,
      backgroundColor: theme.primary,
    },
    emptyCard: {
      backgroundColor: theme.surface,
      borderRadius: 22,
      padding: 28,
      borderWidth: 1,
      borderColor: theme.border,
      alignItems: "center",
    },
    emptyTitle: {
      marginTop: 12,
      fontSize: 18,
      fontWeight: "900",
      color: theme.text,
    },
    emptyText: {
      marginTop: 6,
      fontSize: 13,
      lineHeight: 20,
      textAlign: "center",
      color: theme.textMuted,
      fontWeight: "600",
    },
    feedbackCard: {
      backgroundColor: theme.surface,
      borderRadius: 22,
      padding: 16,
      borderWidth: 1,
      borderColor: theme.border,
      marginBottom: 14,
    },
    feedbackHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      marginBottom: 6,
    },
    senderBlock: {
      flex: 1,
      paddingRight: 10,
    },
    senderName: {
      fontSize: 16,
      fontWeight: "900",
      color: theme.text,
    },
    senderEmail: {
      marginTop: 3,
      fontSize: 12,
      fontWeight: "700",
      color: theme.textMuted,
    },
    statusBadge: {
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    unreadBadge: {
      backgroundColor: "#FEF3C7",
    },
    readBadge: {
      backgroundColor: "#DCFCE7",
    },
    unreadBadgeText: {
      color: "#92400E",
    },
    readBadgeText: {
      color: "#166534",
    },
    statusBadgeText: {
      fontSize: 11,
      fontWeight: "900",
    },
    dateText: {
      fontSize: 12,
      fontWeight: "700",
      color: theme.textMuted,
      marginBottom: 12,
    },
    averageBox: {
      backgroundColor: "#F3EFFF",
      borderRadius: 16,
      padding: 14,
      marginBottom: 12,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    averageLabel: {
      fontSize: 14,
      fontWeight: "900",
      color: theme.text,
    },
    averageValue: {
      fontSize: 15,
      fontWeight: "900",
      color: theme.primary,
    },
    ratingsBox: {
      backgroundColor: theme.surfaceAlt,
      borderRadius: 16,
      padding: 12,
      borderWidth: 1,
      borderColor: theme.border,
      marginBottom: 12,
    },
    ratingRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 7,
    },
    ratingLabel: {
      flex: 1,
      fontSize: 12,
      fontWeight: "800",
      color: theme.textSoft,
      paddingRight: 8,
    },
    ratingRight: {
      alignItems: "flex-end",
    },
    starMiniRow: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 3,
    },
    ratingScore: {
      fontSize: 11,
      fontWeight: "900",
      color: theme.textMuted,
    },
    messageBox: {
      backgroundColor: "#FFFFFF",
      borderRadius: 16,
      padding: 14,
      borderWidth: 1,
      borderColor: theme.border,
    },
    messageLabel: {
      fontSize: 12,
      fontWeight: "900",
      color: theme.textSoft,
      marginBottom: 6,
    },
    messageText: {
      fontSize: 13,
      lineHeight: 20,
      color: theme.textMuted,
      fontWeight: "600",
    },
    actionRow: {
      flexDirection: "row",
      gap: 10,
      marginTop: 14,
    },
    readButton: {
      flex: 1,
      height: 46,
      borderRadius: 14,
      backgroundColor: theme.success,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
    },
    deleteButton: {
      flex: 1,
      height: 46,
      borderRadius: 14,
      backgroundColor: theme.danger,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
    },
    actionButtonText: {
      marginLeft: 7,
      fontSize: 13,
      fontWeight: "900",
      color: "#FFFFFF",
    },
  });
}
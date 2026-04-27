import React, { useMemo, useState } from "react";
import {
  
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { auth, db } from "../../config/firebase";
import {
  collection,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";
const feedbackQuestions = [
  { key: "easeOfNavigation", label: "Ease of Navigation" },
  { key: "uploadProcess", label: "Upload Process" },
  { key: "visualDesign", label: "Visual Design" },
  { key: "responsiveness", label: "Responsiveness" },
  { key: "messaging", label: "Messaging" },
  { key: "overallSatisfaction", label: "Overall Satisfaction" },
];

const initialRatings = feedbackQuestions.reduce((acc, item) => {
  acc[item.key] = 0;
  return acc;
}, {});

function getUserDisplayName(authUser) {
  return authUser?.displayName || authUser?.email?.split("@")[0] || "User";
}

export default function FeedbackScreen() {
  const router = useRouter();
  const user = auth.currentUser;

  const [ratings, setRatings] = useState(initialRatings);
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const theme = useMemo(
    () => ({
      background: "#F7F8FC",
      surface: "#FFFFFF",
      border: "#ECECF2",
      text: "#171717",
      textSoft: "#374151",
      textMuted: "#7B8190",
      primary: "#7C3AED",
      inputBg: "#FFFFFF",
    }),
    []
  );

  const styles = useMemo(() => createStyles(theme), [theme]);

  const updateRating = (key, value) => {
    setRatings((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const averageRating = useMemo(() => {
    const values = Object.values(ratings).filter((value) => value > 0);
    if (!values.length) return 0;

    const total = values.reduce((sum, value) => sum + value, 0);
    return Number((total / values.length).toFixed(1));
  }, [ratings]);

  const allQuestionsAnswered = feedbackQuestions.every(
    (item) => ratings[item.key] > 0
  );

  const submitFeedback = async () => {
  const trimmedMessage = feedbackMessage.trim();

  if (!user?.uid) {
    Alert.alert("Error", "No logged in user found.");
    return;
  }

  if (!allQuestionsAnswered) {
    Alert.alert(
      "Missing ratings",
      "Please rate every feedback question from 1 to 5."
    );
    return;
  }

  if (!trimmedMessage) {
    Alert.alert("Missing feedback", "Please write your feedback message.");
    return;
  }

  try {
    setSubmitting(true);

    await addDoc(collection(db, "feedbacks"), {
      userId: user.uid,
      senderId: user.uid,
      senderName: getUserDisplayName(user),
      senderEmail: user?.email || "",

      feedbackRatings: ratings,
      averageRating,
      feedbackMessage: trimmedMessage,

      status: "unread",
      read: false,
      type: "app_feedback",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    setRatings(initialRatings);
    setFeedbackMessage("");

    Alert.alert("Success", "Your feedback has been submitted.", [
      {
        text: "OK",
        onPress: () => router.back(),
      },
    ]);
  } catch (error) {
    console.log("SUBMIT FEEDBACK ERROR:", error);
    Alert.alert("Error", "Could not submit feedback.");
  } finally {
    setSubmitting(false);
  }
};

  const renderStars = (questionKey) => {
    return (
      <View style={styles.starRow}>
        {[1, 2, 3, 4, 5].map((star) => {
          const active = ratings[questionKey] >= star;

          return (
            <TouchableOpacity
              key={star}
              onPress={() => updateRating(questionKey, star)}
              activeOpacity={0.85}
              style={styles.starButton}
            >
              <Ionicons
                name={active ? "star" : "star-outline"}
                size={28}
                color={active ? "#F59E0B" : "#9CA3AF"}
              />
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <StatusBar barStyle="dark-content" backgroundColor={theme.background} />

      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
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
            <Ionicons
              name="chatbubble-ellipses-outline"
              size={38}
              color="#FFFFFF"
            />

            <Text style={styles.heroTitle}>Evaluate ArtLinker</Text>

            <Text style={styles.heroText}>
              Rate each area from 1 to 5 and leave a short feedback message.
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Feedback Questions</Text>
            <Text style={styles.sectionSubtitle}>
              1 means very poor and 5 means excellent.
            </Text>

            {feedbackQuestions.map((item) => (
              <View key={item.key} style={styles.questionCard}>
                <View style={styles.questionHeader}>
                  <Text style={styles.questionText}>{item.label}</Text>
                  <Text style={styles.ratingNumber}>
                    {ratings[item.key] || "-"} / 5
                  </Text>
                </View>

                {renderStars(item.key)}
              </View>
            ))}

            <View style={styles.averageBox}>
              <Text style={styles.averageLabel}>Average Rating</Text>
              <Text style={styles.averageValue}>
                {averageRating ? `${averageRating} / 5` : "- / 5"}
              </Text>
            </View>

            <Text style={styles.fieldLabel}>Feedback Message</Text>

            <TextInput
              style={styles.textArea}
              placeholder="Write your feedback message here..."
              placeholderTextColor={theme.textMuted}
              value={feedbackMessage}
              onChangeText={setFeedbackMessage}
              multiline
              textAlignVertical="top"
            />

            <TouchableOpacity
              style={[styles.submitButton, submitting && styles.disabledButton]}
              onPress={submitFeedback}
              disabled={submitting}
              activeOpacity={0.85}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="paper-plane-outline" size={18} color="#fff" />
                  <Text style={styles.submitButtonText}>Submit Feedback</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function createStyles(theme) {
  return StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: theme.background,
    },
    keyboardView: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: 16,
      paddingTop: 10,
      paddingBottom: 28,
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
      fontWeight: "800",
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
      marginTop: 14,
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
    card: {
      backgroundColor: theme.surface,
      borderRadius: 22,
      padding: 16,
      borderWidth: 1,
      borderColor: theme.border,
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
    questionCard: {
      backgroundColor: "#FAFAFC",
      borderRadius: 16,
      padding: 14,
      borderWidth: 1,
      borderColor: theme.border,
      marginBottom: 12,
    },
    questionHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 10,
    },
    questionText: {
      flex: 1,
      fontSize: 14,
      fontWeight: "800",
      color: theme.textSoft,
      paddingRight: 10,
    },
    ratingNumber: {
      fontSize: 13,
      fontWeight: "900",
      color: theme.primary,
    },
    starRow: {
      flexDirection: "row",
      alignItems: "center",
    },
    starButton: {
      marginRight: 7,
    },
    averageBox: {
      backgroundColor: "#F3EFFF",
      borderRadius: 16,
      padding: 14,
      marginTop: 4,
      marginBottom: 16,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    averageLabel: {
      fontSize: 14,
      fontWeight: "800",
      color: theme.text,
    },
    averageValue: {
      fontSize: 15,
      fontWeight: "900",
      color: theme.primary,
    },
    fieldLabel: {
      fontSize: 13,
      fontWeight: "800",
      color: theme.textSoft,
      marginBottom: 8,
    },
    textArea: {
      minHeight: 150,
      backgroundColor: theme.inputBg,
      borderRadius: 16,
      paddingHorizontal: 14,
      paddingVertical: 14,
      fontSize: 14,
      color: theme.text,
      fontWeight: "600",
      borderWidth: 1,
      borderColor: theme.border,
    },
    submitButton: {
      height: 54,
      borderRadius: 16,
      backgroundColor: theme.primary,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      marginTop: 18,
    },
    disabledButton: {
      opacity: 0.65,
    },
    submitButtonText: {
      marginLeft: 8,
      fontSize: 15,
      fontWeight: "800",
      color: "#FFFFFF",
    },
  });
}
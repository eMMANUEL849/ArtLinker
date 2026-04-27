import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  FlatList,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  addDoc,
  collection,
  onSnapshot,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { auth, db } from "../../config/firebase";

const DEFAULT_AVATAR = "https://via.placeholder.com/200";

export default function ServiceProviderDmsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const currentUser = auth.currentUser;
  const messagesListRef = useRef(null);

  const initialChatId = params?.chatId ? String(params.chatId) : "";
  const initialJobId = params?.jobId ? String(params.jobId) : "";
  const initialClientId = params?.clientId ? String(params.clientId) : "";
  const initialClientName = params?.clientName
    ? String(params.clientName)
    : "Customer";
  const initialTitle = params?.title ? String(params.title) : "Request Chat";

  const [allUserMessages, setAllUserMessages] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [selectedConversationId, setSelectedConversationId] = useState(
    initialChatId || null
  );
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [messageText, setMessageText] = useState("");
  const [loadingChats, setLoadingChats] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!currentUser) {
      setLoadingChats(false);
      return;
    }

    let sentMessages = [];
    let receivedMessages = [];

    const mergeAllMessages = () => {
      const map = new Map();

      [...sentMessages, ...receivedMessages].forEach((item) => {
        map.set(item.id, item);
      });

      const merged = Array.from(map.values()).sort(
        (a, b) => getMillis(a.createdAt) - getMillis(b.createdAt)
      );

      setAllUserMessages(merged);
      setLoadingChats(false);
    };

    const sentQuery = query(
      collection(db, "dms"),
      where("senderId", "==", currentUser.uid)
    );

    const receivedQuery = query(
      collection(db, "dms"),
      where("receiverId", "==", currentUser.uid)
    );

    const unsubscribeSent = onSnapshot(
      sentQuery,
      (snapshot) => {
        sentMessages = snapshot.docs.map((docItem) => ({
          id: docItem.id,
          ...docItem.data(),
        }));
        mergeAllMessages();
      },
      (error) => {
        console.log("SERVICE PROVIDER SENT DMS ERROR:", error);
        setLoadingChats(false);
      }
    );

    const unsubscribeReceived = onSnapshot(
      receivedQuery,
      (snapshot) => {
        receivedMessages = snapshot.docs.map((docItem) => ({
          id: docItem.id,
          ...docItem.data(),
        }));
        mergeAllMessages();
      },
      (error) => {
        console.log("SERVICE PROVIDER RECEIVED DMS ERROR:", error);
        setLoadingChats(false);
      }
    );

    return () => {
      unsubscribeSent();
      unsubscribeReceived();
    };
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) {
      setConversations([]);
      return;
    }

    const map = new Map();

    allUserMessages.forEach((item) => {
      const conversationId =
        item.conversationId ||
        item.chatId ||
        (item.jobId ? `job_${item.jobId}` : null) ||
        buildFallbackConversationId(item.senderId, item.receiverId);

      if (!conversationId) return;

      const isMine = item.senderId === currentUser.uid;
      const otherUserId = isMine ? item.receiverId : item.senderId;
      const otherUserName = isMine
        ? item.receiverName || "Customer"
        : item.senderName || "Customer";
      const otherUserAvatar = isMine
        ? item.receiverAvatar || DEFAULT_AVATAR
        : item.senderAvatar || DEFAULT_AVATAR;

      const existing = map.get(conversationId);

      const conversationData = {
        conversationId,
        chatId: item.chatId || item.conversationId || conversationId,
        jobId: item.jobId || "",
        otherUserId: otherUserId || "",
        otherUserName,
        otherUserAvatar,
        postTitle: item.postTitle || item.title || "",
        lastMessage: item.text || "",
        lastTime: item.createdAt || null,
      };

      if (!existing) {
        map.set(conversationId, conversationData);
      } else if (getMillis(item.createdAt) >= getMillis(existing.lastTime)) {
        map.set(conversationId, {
          ...existing,
          ...conversationData,
          postTitle:
            item.postTitle || item.title || existing.postTitle || "",
        });
      }
    });

    if (initialChatId && initialClientId && !map.has(initialChatId)) {
      map.set(initialChatId, {
        conversationId: initialChatId,
        chatId: initialChatId,
        jobId: initialJobId || "",
        otherUserId: initialClientId,
        otherUserName: initialClientName || "Customer",
        otherUserAvatar: DEFAULT_AVATAR,
        postTitle: initialTitle || "Request Chat",
        lastMessage: "",
        lastTime: null,
      });
    }

    const sortedConversations = Array.from(map.values()).sort(
      (a, b) => getMillis(b.lastTime) - getMillis(a.lastTime)
    );

    setConversations(sortedConversations);
  }, [
    allUserMessages,
    currentUser,
    initialChatId,
    initialJobId,
    initialClientId,
    initialClientName,
    initialTitle,
  ]);

  useEffect(() => {
    if (!selectedConversationId && conversations.length > 0) {
      setSelectedConversationId(conversations[0].conversationId);
    }
  }, [conversations, selectedConversationId]);

  useEffect(() => {
    if (!selectedConversationId) {
      setSelectedConversation(null);
      return;
    }

    const found = conversations.find(
      (item) => item.conversationId === selectedConversationId
    );

    if (found) {
      setSelectedConversation(found);
      return;
    }

    if (initialChatId && selectedConversationId === initialChatId) {
      setSelectedConversation({
        conversationId: initialChatId,
        chatId: initialChatId,
        jobId: initialJobId || "",
        otherUserId: initialClientId,
        otherUserName: initialClientName || "Customer",
        otherUserAvatar: DEFAULT_AVATAR,
        postTitle: initialTitle || "Request Chat",
        lastMessage: "",
        lastTime: null,
      });
      return;
    }

    setSelectedConversation(null);
  }, [
    selectedConversationId,
    conversations,
    initialChatId,
    initialJobId,
    initialClientId,
    initialClientName,
    initialTitle,
  ]);

  const selectedMessages = useMemo(() => {
    if (!selectedConversationId || !currentUser) return [];

    return allUserMessages.filter((item) => {
      const itemConversationId =
        item.conversationId ||
        item.chatId ||
        (item.jobId ? `job_${item.jobId}` : null) ||
        buildFallbackConversationId(item.senderId, item.receiverId);

      return itemConversationId === selectedConversationId;
    });
  }, [allUserMessages, selectedConversationId, currentUser]);

  const groupedMessages = useMemo(() => {
    const result = [];
    let lastDate = "";

    selectedMessages.forEach((item) => {
      const dateLabel = formatMessageDate(item.createdAt);

      if (dateLabel !== lastDate) {
        result.push({
          id: `date-${dateLabel}-${item.id}`,
          type: "date",
          label: dateLabel,
        });
        lastDate = dateLabel;
      }

      result.push({
        ...item,
        type: "message",
      });
    });

    return result;
  }, [selectedMessages]);

  useEffect(() => {
    setTimeout(() => {
      messagesListRef.current?.scrollToEnd?.({ animated: true });
    }, 150);
  }, [groupedMessages.length, selectedConversationId]);

  const handleSelectConversation = (conversation) => {
    setSelectedConversationId(conversation.conversationId);
  };

  const handleSendMessage = async () => {
    if (!currentUser) {
      Alert.alert("Login required", "Please log in first.");
      return;
    }

    if (!selectedConversation) {
      Alert.alert("No conversation", "Please select a conversation.");
      return;
    }

    if (!selectedConversation.otherUserId) {
      Alert.alert("Missing user", "This chat is missing the user details.");
      return;
    }

    const cleanText = messageText.trim();

    if (!cleanText) {
      Alert.alert("Missing message", "Please type a message.");
      return;
    }

    try {
      setSending(true);

      const conversationId =
        selectedConversation.conversationId ||
        selectedConversation.chatId ||
        buildFallbackConversationId(
          currentUser.uid,
          selectedConversation.otherUserId
        );

      const chatId =
        selectedConversation.chatId ||
        selectedConversation.conversationId ||
        conversationId;

      await addDoc(collection(db, "dms"), {
        conversationId,
        chatId,
        jobId: selectedConversation.jobId || "",
        senderId: currentUser.uid,
        senderName:
          currentUser.displayName || currentUser.email || "Service Provider",
        senderAvatar: currentUser.photoURL || DEFAULT_AVATAR,
        receiverId: selectedConversation.otherUserId,
        receiverName: selectedConversation.otherUserName || "Customer",
        receiverAvatar: selectedConversation.otherUserAvatar || DEFAULT_AVATAR,
        postTitle: selectedConversation.postTitle || "",
        text: cleanText,
        read: false,
        createdAt: serverTimestamp(),
      });

      try {
        await addDoc(collection(db, "notifications"), {
          userId: selectedConversation.otherUserId,
          type: "new_chat_message",
          title: "New Message",
          message: `${
            currentUser.displayName || "Service Provider"
          } sent you a message.`,
          conversationId,
          chatId,
          jobId: selectedConversation.jobId || "",
          senderId: currentUser.uid,
          senderName:
            currentUser.displayName || currentUser.email || "Service Provider",
          read: false,
          createdAt: serverTimestamp(),
        });
      } catch (notificationError) {
        console.log(
          "SERVICE PROVIDER CHAT NOTIFICATION ERROR:",
          notificationError
        );
      }

      setMessageText("");
    } catch (error) {
      console.log("SERVICE PROVIDER SEND MESSAGE ERROR:", error);
      Alert.alert("Error", error.message || "Could not send message.");
    } finally {
      setSending(false);
    }
  };

  const renderConversation = ({ item }) => {
    const active = item.conversationId === selectedConversationId;

    return (
      <TouchableOpacity
        style={[
          styles.conversationCard,
          active && styles.conversationCardActive,
        ]}
        onPress={() => handleSelectConversation(item)}
      >
        <Image
          source={{ uri: item.otherUserAvatar || DEFAULT_AVATAR }}
          style={styles.avatar}
        />

        <View style={styles.conversationTextWrap}>
          <View style={styles.conversationTopRow}>
            <Text
              style={[
                styles.conversationName,
                active && styles.conversationNameActive,
              ]}
              numberOfLines={1}
            >
              {item.otherUserName || "Customer"}
            </Text>

            <Text style={styles.conversationTime} numberOfLines={1}>
              {formatConversationTime(item.lastTime)}
            </Text>
          </View>

          {!!item.postTitle && (
            <Text style={styles.conversationPostTitle} numberOfLines={1}>
              {item.postTitle}
            </Text>
          )}

          <Text
            style={[
              styles.conversationSnippet,
              active && styles.conversationSnippetActive,
            ]}
            numberOfLines={1}
          >
            {item.lastMessage || "Open chat"}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderMessage = ({ item }) => {
    if (item.type === "date") {
      return (
        <View style={styles.dateDividerWrap}>
          <View style={styles.dateDividerLine} />
          <Text style={styles.dateDividerText}>{item.label}</Text>
          <View style={styles.dateDividerLine} />
        </View>
      );
    }

    const isMine = item.senderId === currentUser.uid;

    return (
      <View
        style={[
          styles.messageRow,
          isMine ? styles.messageRowMine : styles.messageRowOther,
        ]}
      >
        {!isMine && (
          <Image
            source={{ uri: item.senderAvatar || DEFAULT_AVATAR }}
            style={styles.messageAvatar}
          />
        )}

        <View
          style={[
            styles.messageBubble,
            isMine ? styles.messageBubbleMine : styles.messageBubbleOther,
          ]}
        >
          <Text
            style={[
              styles.messageText,
              isMine ? styles.messageTextMine : styles.messageTextOther,
            ]}
          >
            {item.text || ""}
          </Text>

          <Text
            style={[
              styles.messageTime,
              isMine ? styles.messageTimeMine : styles.messageTimeOther,
            ]}
          >
            {formatClockTime(item.createdAt)}
          </Text>
        </View>
      </View>
    );
  };

  if (!currentUser) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centerBox}>
          <Ionicons name="lock-closed-outline" size={40} color="#4F6BFF" />
          <Text style={styles.emptyTitle}>Please log in</Text>
          <Text style={styles.emptyText}>
            You need to be signed in to view your messages.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <StatusBar barStyle="dark-content" backgroundColor="#F6F8FC" />

      <KeyboardAvoidingView
        style={styles.flexOne}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Ionicons name="arrow-back-outline" size={22} color="#111827" />
          </TouchableOpacity>

          <View style={styles.headerTextWrap}>
            <Text style={styles.logo}>ArtLinker</Text>
            <Text style={styles.heading}>Provider Messages</Text>
            <Text style={styles.subheading}>
              View previous messages and continue chatting with users.
            </Text>
          </View>
        </View>

        {loadingChats && conversations.length === 0 ? (
          <View style={styles.centerBox}>
            <ActivityIndicator size="large" color="#4F6BFF" />
            <Text style={styles.loadingText}>Loading chats...</Text>
          </View>
        ) : conversations.length === 0 ? (
          <View style={styles.centerBox}>
            <Ionicons name="chatbubbles-outline" size={44} color="#B8BED0" />
            <Text style={styles.emptyTitle}>No messages yet</Text>
            <Text style={styles.emptyText}>
              User conversations will appear here when a request chat starts.
            </Text>
          </View>
        ) : (
          <View style={styles.mainWrap}>
            <View style={styles.sidebar}>
              <View style={styles.sidebarHeader}>
                <Text style={styles.sidebarTitle}>Chats</Text>
                <Text style={styles.sidebarCount}>{conversations.length}</Text>
              </View>

              <FlatList
                data={conversations}
                keyExtractor={(item) => item.conversationId}
                renderItem={renderConversation}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.sidebarListContent}
              />
            </View>

            <View style={styles.chatPanel}>
              {selectedConversation ? (
                <>
                  <View style={styles.chatHeader}>
                    <View style={styles.chatHeaderLeft}>
                      <Image
                        source={{
                          uri:
                            selectedConversation.otherUserAvatar ||
                            DEFAULT_AVATAR,
                        }}
                        style={styles.chatHeaderAvatar}
                      />
                      <View style={styles.chatHeaderTextWrap}>
                        <Text style={styles.chatHeaderName}>
                          {selectedConversation.otherUserName}
                        </Text>
                        {!!selectedConversation.postTitle && (
                          <Text style={styles.chatHeaderSub} numberOfLines={1}>
                            About: {selectedConversation.postTitle}
                          </Text>
                        )}
                      </View>
                    </View>
                  </View>

                  {groupedMessages.length === 0 ? (
                    <View style={styles.noMessageWrap}>
                      <Ionicons
                        name="chatbubble-ellipses-outline"
                        size={36}
                        color="#C0C6D4"
                      />
                      <Text style={styles.noMessageTitle}>No messages yet</Text>
                      <Text style={styles.noMessageText}>
                        Send the first message to start this conversation.
                      </Text>
                    </View>
                  ) : (
                    <FlatList
                      ref={messagesListRef}
                      data={groupedMessages}
                      keyExtractor={(item) => item.id}
                      renderItem={renderMessage}
                      style={styles.messagesArea}
                      contentContainerStyle={styles.messagesContent}
                      showsVerticalScrollIndicator={false}
                      onContentSizeChange={() =>
                        messagesListRef.current?.scrollToEnd?.({ animated: true })
                      }
                    />
                  )}

                  <View style={styles.inputRow}>
                    <TextInput
                      style={styles.input}
                      placeholder="Write a message"
                      placeholderTextColor="#9CA3AF"
                      value={messageText}
                      onChangeText={setMessageText}
                      multiline
                    />

                    <TouchableOpacity
                      style={[
                        styles.sendButton,
                        sending && styles.sendButtonDisabled,
                      ]}
                      onPress={handleSendMessage}
                      disabled={sending}
                    >
                      {sending ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Ionicons name="send" size={18} color="#fff" />
                      )}
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                <View style={styles.centerBox}>
                  <Text style={styles.emptyTitle}>Select a conversation</Text>
                  <Text style={styles.emptyText}>
                    Choose a chat to view previous and current messages.
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function buildFallbackConversationId(senderId, receiverId) {
  if (!senderId || !receiverId) return "";
  return [senderId, receiverId].sort().join("_");
}

function getMillis(value) {
  if (!value) return 0;
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (typeof value?.seconds === "number") return value.seconds * 1000;
  if (typeof value === "number") return value;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function toDateObject(value) {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function formatConversationTime(timestamp) {
  const date = toDateObject(timestamp);
  if (!date) return "";

  const now = new Date();
  const sameDay =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  if (sameDay) {
    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return date.toLocaleDateString([], {
    day: "numeric",
    month: "short",
  });
}

function formatClockTime(timestamp) {
  const date = toDateObject(timestamp);
  if (!date) return "Now";

  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatMessageDate(timestamp) {
  const date = toDateObject(timestamp);
  if (!date) return "Today";

  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const isToday =
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear();

  const isYesterday =
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear();

  if (isToday) return "Today";
  if (isYesterday) return "Yesterday";

  return date.toLocaleDateString([], {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#F6F8FC",
  },
  flexOne: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
    flexDirection: "row",
    alignItems: "flex-start",
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
    borderWidth: 1,
    borderColor: "#E8EBF3",
  },
  headerTextWrap: {
    flex: 1,
  },
  logo: {
    fontSize: 28,
    fontWeight: "800",
    color: "#F06CE9",
    marginBottom: 6,
  },
  heading: {
    fontSize: 28,
    fontWeight: "800",
    color: "#111827",
  },
  subheading: {
    fontSize: 13,
    color: "#8A90A2",
    lineHeight: 20,
    marginTop: 6,
  },
  centerBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  loadingText: {
    marginTop: 10,
    color: "#6B7280",
  },
  emptyTitle: {
    marginTop: 12,
    fontSize: 18,
    fontWeight: "800",
    color: "#111827",
  },
  emptyText: {
    marginTop: 6,
    textAlign: "center",
    color: "#8A90A2",
    lineHeight: 20,
  },
  mainWrap: {
    flex: 1,
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingBottom: 12,
    gap: 12,
  },
  sidebar: {
    width: "34%",
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#E8EBF3",
    overflow: "hidden",
  },
  sidebarHeader: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#EEF1F6",
  },
  sidebarTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#111827",
  },
  sidebarCount: {
    minWidth: 26,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    textAlign: "center",
    backgroundColor: "#DBEAFE",
    color: "#1D4ED8",
    fontSize: 12,
    fontWeight: "700",
  },
  sidebarListContent: {
    padding: 10,
  },
  conversationCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    borderRadius: 16,
    marginBottom: 8,
    backgroundColor: "#F8FAFD",
    borderWidth: 1,
    borderColor: "#F1F4F9",
  },
  conversationCardActive: {
    backgroundColor: "#DBEAFE",
    borderColor: "#93C5FD",
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    marginRight: 10,
    backgroundColor: "#E5E7EB",
  },
  conversationTextWrap: {
    flex: 1,
  },
  conversationTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  conversationName: {
    flex: 1,
    fontSize: 13,
    fontWeight: "800",
    color: "#111827",
  },
  conversationNameActive: {
    color: "#1D4ED8",
  },
  conversationTime: {
    fontSize: 10,
    color: "#9CA3AF",
  },
  conversationPostTitle: {
    fontSize: 11,
    color: "#2563EB",
    marginTop: 2,
  },
  conversationSnippet: {
    fontSize: 11,
    color: "#6B7280",
    marginTop: 4,
  },
  conversationSnippetActive: {
    color: "#1E3A8A",
  },
  chatPanel: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#E8EBF3",
    overflow: "hidden",
  },
  chatHeader: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#EEF1F6",
    backgroundColor: "#FFFFFF",
  },
  chatHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  chatHeaderTextWrap: {
    flex: 1,
  },
  chatHeaderAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    marginRight: 12,
    backgroundColor: "#E5E7EB",
  },
  chatHeaderName: {
    fontSize: 16,
    fontWeight: "800",
    color: "#111827",
  },
  chatHeaderSub: {
    fontSize: 12,
    color: "#8A90A2",
    marginTop: 2,
  },
  messagesArea: {
    flex: 1,
    backgroundColor: "#FBFCFE",
  },
  messagesContent: {
    padding: 14,
    paddingBottom: 20,
  },
  noMessageWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  noMessageTitle: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: "800",
    color: "#111827",
  },
  noMessageText: {
    marginTop: 6,
    fontSize: 12,
    color: "#8A90A2",
    textAlign: "center",
  },
  dateDividerWrap: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 10,
  },
  dateDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#E5E7EB",
  },
  dateDividerText: {
    marginHorizontal: 10,
    fontSize: 11,
    fontWeight: "700",
    color: "#9CA3AF",
  },
  messageRow: {
    flexDirection: "row",
    marginBottom: 12,
    alignItems: "flex-end",
  },
  messageRowMine: {
    justifyContent: "flex-end",
  },
  messageRowOther: {
    justifyContent: "flex-start",
  },
  messageAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    marginRight: 8,
    backgroundColor: "#E5E7EB",
  },
  messageBubble: {
    maxWidth: "76%",
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  messageBubbleMine: {
    backgroundColor: "#4F6BFF",
    borderBottomRightRadius: 6,
  },
  messageBubbleOther: {
    backgroundColor: "#EEF2F7",
    borderBottomLeftRadius: 6,
  },
  messageText: {
    fontSize: 14,
    lineHeight: 20,
  },
  messageTextMine: {
    color: "#FFFFFF",
  },
  messageTextOther: {
    color: "#111827",
  },
  messageTime: {
    fontSize: 10,
    marginTop: 6,
  },
  messageTimeMine: {
    color: "rgba(255,255,255,0.85)",
    textAlign: "right",
  },
  messageTimeOther: {
    color: "#7B8190",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: "#EEF1F6",
    backgroundColor: "#FFFFFF",
    gap: 10,
  },
  input: {
    flex: 1,
    minHeight: 48,
    maxHeight: 110,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 16,
    backgroundColor: "#F9FAFB",
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    color: "#111827",
    textAlignVertical: "top",
  },
  sendButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#4F6BFF",
    alignItems: "center",
    justifyContent: "center",
  },
  sendButtonDisabled: {
    opacity: 0.7,
  },
});
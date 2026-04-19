import React, { useEffect, useMemo, useState } from "react";
import {
  SafeAreaView,
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
import {
  collection,
  onSnapshot,
  doc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db, auth } from "../../config/firebase";

const DEFAULT_IMAGE =
  "https://via.placeholder.com/300x300.png?text=Payment";

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

function isWithinDays(value, days = 7) {
  const date = toDate(value);
  if (!date) return false;
  const diff = Date.now() - date.getTime();
  return diff >= 0 && diff <= days * 24 * 60 * 60 * 1000;
}

function getTransactionAmount(item) {
  if (typeof item?.amount === "number") return item.amount;
  if (typeof item?.totalAmount === "number") return item.totalAmount;
  if (typeof item?.total === "number") return item.total;
  if (typeof item?.grandTotal === "number") return item.grandTotal;
  if (typeof item?.price === "number") return item.price;
  if (typeof item?.subtotal === "number") return item.subtotal;
  return 0;
}

function getRevenueAmount(item) {
  return getTransactionAmount(item);
}

function getRefundAmount(item) {
  if (typeof item?.refundAmount === "number") return item.refundAmount;
  if (typeof item?.refundedAmount === "number") return item.refundedAmount;
  return 0;
}

function getPaymentStatus(item) {
  const status = (
    item?.status ||
    item?.paymentStatus ||
    item?.orderStatus ||
    "paid"
  )
    .toString()
    .toLowerCase();

  if (["refund_requested", "refund request", "refund-pending"].includes(status)) {
    return "refund_requested";
  }

  if (["refunded", "refund_complete", "refund complete"].includes(status)) {
    return "refunded";
  }

  if (["failed", "declined", "cancelled"].includes(status)) {
    return "failed";
  }

  if (["pending", "processing"].includes(status)) {
    return "pending";
  }

  return "paid";
}

function getTransactionType(item) {
  return (
    item?.type ||
    item?.paymentType ||
    item?.transactionType ||
    item?.variant ||
    "payment"
  )
    .toString()
    .toLowerCase();
}

function getBuyerName(item) {
  return (
    item?.customerName ||
    item?.buyerName ||
    item?.userName ||
    item?.clientName ||
    item?.name ||
    "Unknown Buyer"
  );
}

function getBuyerId(item) {
  return (
    item?.customerId ||
    item?.buyerId ||
    item?.userId ||
    item?.clientId ||
    ""
  );
}

function getProviderId(item) {
  if (item?.providerId) return item.providerId;

  if (Array.isArray(item?.providerBreakdown) && item.providerBreakdown[0]?.providerId) {
    return item.providerBreakdown[0].providerId;
  }

  if (Array.isArray(item?.items) && item.items[0]?.providerId) {
    return item.items[0].providerId;
  }

  return "";
}

function getProviderName(item) {
  if (item?.providerName) return item.providerName;

  if (Array.isArray(item?.providerBreakdown) && item.providerBreakdown[0]?.providerName) {
    return item.providerBreakdown[0].providerName;
  }

  if (Array.isArray(item?.items) && item.items[0]?.providerName) {
    return item.items[0].providerName;
  }

  return "Unknown Provider";
}

function getOrderReference(item) {
  return (
    item?.orderNumber ||
    item?.reference ||
    item?.paymentReference ||
    item?.transactionReference ||
    item?.receiptId ||
    item?.id ||
    "No reference"
  );
}

function getPaymentMethod(item) {
  if (item?.maskedCard) return `Card ${item.maskedCard}`;
  if (item?.paymentMethod) return item.paymentMethod;
  if (item?.method) return item.method;
  return "Unknown method";
}

function getTransactionImage(item) {
  return (
    item?.imageUrl ||
    item?.thumbnailUrl ||
    item?.mediaUrl ||
    item?.photoUrl ||
    DEFAULT_IMAGE
  );
}

function getPayoutStatus(item) {
  const status = (
    item?.payoutStatus ||
    item?.providerPayoutStatus ||
    item?.status ||
    "unpaid"
  )
    .toString()
    .toLowerCase();

  if (["paid", "completed", "sent"].includes(status)) return "paid";
  if (["processing", "pending"].includes(status)) return "pending";
  return "unpaid";
}

function getProviderPayoutAmount(item) {
  if (typeof item?.providerPayout === "number") return item.providerPayout;
  if (typeof item?.payoutAmount === "number") return item.payoutAmount;

  if (Array.isArray(item?.providerBreakdown)) {
    return item.providerBreakdown.reduce((sum, part) => {
      const amount =
        typeof part?.providerAmount === "number"
          ? part.providerAmount
          : typeof part?.amount === "number"
          ? part.amount
          : 0;
      return sum + amount;
    }, 0);
  }

  return 0;
}

export default function AdminTransactionsScreen() {
  const [search, setSearch] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [selectedType, setSelectedType] = useState("all");
  const [selectedDateRange, setSelectedDateRange] = useState("all");

  const [payments, setPayments] = useState([]);
  const [orders, setOrders] = useState([]);
  const [users, setUsers] = useState([]);

  const [loading, setLoading] = useState(true);
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    const unsubscribers = [];

    const unsubPayments = onSnapshot(
      collection(db, "payments"),
      (snapshot) => {
        setPayments(
          snapshot.docs.map((item) => ({
            id: item.id,
            _collection: "payments",
            ...item.data(),
          }))
        );
        setLoading(false);
      },
      (error) => {
        console.log("payments error:", error);
        setPayments([]);
        setLoading(false);
      }
    );
    unsubscribers.push(unsubPayments);

    const unsubOrders = onSnapshot(
      collection(db, "orders"),
      (snapshot) => {
        setOrders(
          snapshot.docs.map((item) => ({
            id: item.id,
            _collection: "orders",
            ...item.data(),
          }))
        );
      },
      () => setOrders([])
    );
    unsubscribers.push(unsubOrders);

    const unsubUsers = onSnapshot(
      collection(db, "users"),
      (snapshot) => {
        setUsers(
          snapshot.docs.map((item) => ({
            id: item.id,
            ...item.data(),
          }))
        );
      },
      () => setUsers([])
    );
    unsubscribers.push(unsubUsers);

    return () => {
      unsubscribers.forEach((unsubscribe) => {
        try {
          unsubscribe?.();
        } catch (error) {}
      });
    };
  }, []);

  const combinedTransactions = useMemo(() => {
    const combined = [...payments];

    orders.forEach((order) => {
      const alreadyExists = payments.some((payment) => payment.id === order.id);
      if (!alreadyExists) {
        combined.push(order);
      }
    });

    return combined
      .map((item) => {
        const providerId = getProviderId(item);
        const buyerId = getBuyerId(item);

        const providerUser = users.find((user) => user.id === providerId) || null;
        const buyerUser = users.find((user) => user.id === buyerId) || null;

        return {
          ...item,
          normalizedStatus: getPaymentStatus(item),
          normalizedType: getTransactionType(item),
          providerId,
          providerName:
            getProviderName(item) ||
            providerUser?.displayName ||
            providerUser?.name ||
            "Unknown Provider",
          buyerName:
            getBuyerName(item) ||
            buyerUser?.displayName ||
            buyerUser?.name ||
            "Unknown Buyer",
        };
      })
      .sort((a, b) => {
        const aDate =
          toDate(a?.createdAt || a?.paidAt || a?.updatedAt)?.getTime() || 0;
        const bDate =
          toDate(b?.createdAt || b?.paidAt || b?.updatedAt)?.getTime() || 0;
        return bDate - aDate;
      });
  }, [payments, orders, users]);

  const filteredTransactions = useMemo(() => {
    const q = search.trim().toLowerCase();

    return combinedTransactions.filter((item) => {
      const matchesSearch =
        !q ||
        getOrderReference(item).toLowerCase().includes(q) ||
        item.buyerName.toLowerCase().includes(q) ||
        item.providerName.toLowerCase().includes(q) ||
        getPaymentMethod(item).toLowerCase().includes(q);

      const matchesStatus =
        selectedStatus === "all" || item.normalizedStatus === selectedStatus;

      const matchesType =
        selectedType === "all" || item.normalizedType === selectedType;

      const createdAt = item?.createdAt || item?.paidAt || item?.updatedAt;

      const matchesDate =
        selectedDateRange === "all" ||
        (selectedDateRange === "7days" && isWithinDays(createdAt, 7)) ||
        (selectedDateRange === "30days" && isWithinDays(createdAt, 30)) ||
        (selectedDateRange === "90days" && isWithinDays(createdAt, 90));

      return matchesSearch && matchesStatus && matchesType && matchesDate;
    });
  }, [combinedTransactions, search, selectedStatus, selectedType, selectedDateRange]);

  const summary = useMemo(() => {
    const totalRevenue = combinedTransactions
      .filter((item) => item.normalizedStatus === "paid" || item.normalizedStatus === "refunded")
      .reduce((sum, item) => sum + getRevenueAmount(item), 0);

    const totalPayouts = combinedTransactions.reduce(
      (sum, item) => sum + getProviderPayoutAmount(item),
      0
    );

    const totalRefunds = combinedTransactions
      .filter(
        (item) =>
          item.normalizedStatus === "refunded" ||
          item.normalizedStatus === "refund_requested"
      )
      .reduce((sum, item) => {
        const refund = getRefundAmount(item);
        if (refund > 0) return sum + refund;
        return sum + getTransactionAmount(item);
      }, 0);

    return {
      totalTransactions: combinedTransactions.length,
      paidTransactions: combinedTransactions.filter((item) => item.normalizedStatus === "paid").length,
      refundRequests: combinedTransactions.filter((item) => item.normalizedStatus === "refund_requested").length,
      refunded: combinedTransactions.filter((item) => item.normalizedStatus === "refunded").length,
      totalRevenue,
      totalPayouts,
      totalRefunds,
    };
  }, [combinedTransactions]);

  const providerPayouts = useMemo(() => {
    const map = {};

    combinedTransactions.forEach((item) => {
      const providerId = item.providerId;
      const providerName = item.providerName;
      if (!providerId) return;

      if (!map[providerId]) {
        map[providerId] = {
          providerId,
          providerName,
          totalOrders: 0,
          totalPayout: 0,
          paidOut: 0,
          pendingPayout: 0,
        };
      }

      const payoutAmount = getProviderPayoutAmount(item);
      const payoutStatus = getPayoutStatus(item);

      map[providerId].totalOrders += 1;
      map[providerId].totalPayout += payoutAmount;

      if (payoutStatus === "paid") {
        map[providerId].paidOut += payoutAmount;
      } else {
        map[providerId].pendingPayout += payoutAmount;
      }
    });

    return Object.values(map).sort((a, b) => b.pendingPayout - a.pendingPayout);
  }, [combinedTransactions]);

  const openTransactionMenu = (item) => {
    setSelectedTransaction(item);
    setMenuVisible(true);
  };

  const closeTransactionMenu = () => {
    if (actionLoading) return;
    setMenuVisible(false);
    setSelectedTransaction(null);
  };

  const updateTransaction = async (updates, successMessage) => {
    if (!selectedTransaction) return;

    try {
      setActionLoading(true);

      await updateDoc(
        doc(db, selectedTransaction._collection || "payments", selectedTransaction.id),
        {
          ...updates,
          updatedAt: serverTimestamp(),
          updatedBy: auth.currentUser?.uid || null,
        }
      );

      closeTransactionMenu();
      Alert.alert("Success", successMessage);
    } catch (error) {
      console.log("update transaction error:", error);
      Alert.alert("Error", "Failed to update transaction.");
    } finally {
      setActionLoading(false);
    }
  };

  const markRefundRequested = async () => {
    await updateTransaction(
      {
        status: "refund_requested",
        paymentStatus: "refund_requested",
        refundRequestedAt: serverTimestamp(),
      },
      "Refund request recorded."
    );
  };

  const markRefunded = async () => {
    const amount = getTransactionAmount(selectedTransaction);

    await updateTransaction(
      {
        status: "refunded",
        paymentStatus: "refunded",
        refundAmount: amount,
        refundedAmount: amount,
        refundedAt: serverTimestamp(),
      },
      "Transaction marked as refunded."
    );
  };

  const markPayoutPaid = async () => {
    const payout = getProviderPayoutAmount(selectedTransaction);

    await updateTransaction(
      {
        payoutStatus: "paid",
        providerPayoutStatus: "paid",
        payoutAmount: payout,
        providerPayout: payout,
        payoutPaidAt: serverTimestamp(),
      },
      "Provider payout marked as paid."
    );
  };

  const markPayoutPending = async () => {
    await updateTransaction(
      {
        payoutStatus: "pending",
        providerPayoutStatus: "pending",
      },
      "Provider payout marked as pending."
    );
  };

  const statusFilters = [
    { key: "all", label: "All" },
    { key: "paid", label: "Paid" },
    { key: "pending", label: "Pending" },
    { key: "refund_requested", label: "Refund Request" },
    { key: "refunded", label: "Refunded" },
    { key: "failed", label: "Failed" },
  ];

  const typeFilters = [
    { key: "all", label: "All Types" },
    { key: "payment", label: "Payment" },
    { key: "customer_checkout", label: "Checkout" },
    { key: "provider_order", label: "Provider Order" },
  ];

  const dateFilters = [
    { key: "all", label: "All Time" },
    { key: "7days", label: "7 Days" },
    { key: "30days", label: "30 Days" },
    { key: "90days", label: "90 Days" },
  ];

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.headerCard}>
          <View style={styles.headerTopRow}>
            <View>
              <Text style={styles.logo}>ArtLinker</Text>
              <Text style={styles.headerBadge}>Transactions and Payments</Text>
            </View>

            <View style={styles.headerIconWrap}>
              <Ionicons name="card-outline" size={20} color="#7C3AED" />
            </View>
          </View>

          <Text style={styles.title}>Finance Overview</Text>
          <Text style={styles.subtitle}>
            Monitor transactions, order history, revenue, provider payouts, and refunds from one place
          </Text>
        </View>

        <View style={styles.summaryGrid}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Transactions</Text>
            <Text style={styles.summaryValue}>
              {formatNumber(summary.totalTransactions)}
            </Text>
          </View>

          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Revenue</Text>
            <Text style={styles.summaryValue}>
              {formatCurrency(summary.totalRevenue)}
            </Text>
          </View>

          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Provider Payouts</Text>
            <Text style={styles.summaryValue}>
              {formatCurrency(summary.totalPayouts)}
            </Text>
          </View>

          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Refunds</Text>
            <Text style={styles.summaryValue}>
              {formatCurrency(summary.totalRefunds)}
            </Text>
          </View>

          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Refund Requests</Text>
            <Text style={styles.summaryValue}>
              {formatNumber(summary.refundRequests)}
            </Text>
          </View>

          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Refunded</Text>
            <Text style={styles.summaryValue}>
              {formatNumber(summary.refunded)}
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
            placeholder="Search by reference, buyer, provider, or method..."
            placeholderTextColor="#9CA3AF"
            value={search}
            onChangeText={setSearch}
          />
        </View>

        <Text style={styles.filterTitle}>Status</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          {statusFilters.map((item) => {
            const active = selectedStatus === item.key;
            return (
              <TouchableOpacity
                key={item.key}
                style={[styles.filterChip, active && styles.filterChipActive]}
                onPress={() => setSelectedStatus(item.key)}
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

        <Text style={styles.filterTitle}>Type</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          {typeFilters.map((item) => {
            const active = selectedType === item.key;
            return (
              <TouchableOpacity
                key={item.key}
                style={[styles.filterChip, active && styles.filterChipActive]}
                onPress={() => setSelectedType(item.key)}
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

        <Text style={styles.filterTitle}>Date</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          {dateFilters.map((item) => {
            const active = selectedDateRange === item.key;
            return (
              <TouchableOpacity
                key={item.key}
                style={[styles.filterChip, active && styles.filterChipActive]}
                onPress={() => setSelectedDateRange(item.key)}
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
              <Text style={styles.sectionTitle}>Order History</Text>
              <Text style={styles.sectionSubtitle}>
                Full transaction and payment activity
              </Text>
            </View>
          </View>

          {loading ? (
            <View style={styles.stateWrap}>
              <ActivityIndicator size="large" color="#7C3AED" />
              <Text style={styles.stateText}>Loading transactions...</Text>
            </View>
          ) : filteredTransactions.length === 0 ? (
            <View style={styles.stateWrap}>
              <Ionicons name="receipt-outline" size={28} color="#9CA3AF" />
              <Text style={styles.stateTitle}>No transactions found</Text>
              <Text style={styles.stateText}>
                Try a different search or filter
              </Text>
            </View>
          ) : (
            <View style={styles.list}>
              {filteredTransactions.map((item) => (
                <View key={`${item._collection}_${item.id}`} style={styles.transactionCard}>
                  <View style={styles.transactionTopRow}>
                    <View style={styles.transactionLeft}>
                      <Image
                        source={{ uri: getTransactionImage(item) }}
                        style={styles.transactionImage}
                      />
                      <View style={styles.transactionTextWrap}>
                        <Text style={styles.transactionRef} numberOfLines={1}>
                          {getOrderReference(item)}
                        </Text>
                        <Text style={styles.transactionMeta} numberOfLines={1}>
                          {item.buyerName} → {item.providerName}
                        </Text>
                        <Text style={styles.transactionTime}>
                          {getTimeAgo(item?.createdAt || item?.paidAt || item?.updatedAt)}
                        </Text>
                      </View>
                    </View>

                    <TouchableOpacity
                      style={styles.menuButton}
                      onPress={() => openTransactionMenu(item)}
                      activeOpacity={0.85}
                    >
                      <Feather name="more-horizontal" size={14} color="#111827" />
                    </TouchableOpacity>
                  </View>

                  <View style={styles.badgesRow}>
                    <View style={styles.typeBadge}>
                      <Text style={styles.typeBadgeText}>{item.normalizedType}</Text>
                    </View>

                    <View
                      style={[
                        styles.statusBadge,
                        item.normalizedStatus === "paid" &&
                          styles.statusBadgePaid,
                        item.normalizedStatus === "pending" &&
                          styles.statusBadgePending,
                        item.normalizedStatus === "refund_requested" &&
                          styles.statusBadgeRefundRequested,
                        item.normalizedStatus === "refunded" &&
                          styles.statusBadgeRefunded,
                        item.normalizedStatus === "failed" &&
                          styles.statusBadgeFailed,
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusBadgeText,
                          item.normalizedStatus === "paid" &&
                            styles.statusBadgeTextPaid,
                          item.normalizedStatus === "pending" &&
                            styles.statusBadgeTextPending,
                          item.normalizedStatus === "refund_requested" &&
                            styles.statusBadgeTextRefundRequested,
                          item.normalizedStatus === "refunded" &&
                            styles.statusBadgeTextRefunded,
                          item.normalizedStatus === "failed" &&
                            styles.statusBadgeTextFailed,
                        ]}
                      >
                        {item.normalizedStatus}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.infoGrid}>
                    <View style={styles.infoBlock}>
                      <Text style={styles.infoLabel}>Amount</Text>
                      <Text style={styles.infoValue}>
                        {formatCurrency(getTransactionAmount(item))}
                      </Text>
                    </View>

                    <View style={styles.infoBlock}>
                      <Text style={styles.infoLabel}>Provider Payout</Text>
                      <Text style={styles.infoValue}>
                        {formatCurrency(getProviderPayoutAmount(item))}
                      </Text>
                    </View>

                    <View style={styles.infoBlock}>
                      <Text style={styles.infoLabel}>Payout Status</Text>
                      <Text style={styles.infoValue}>
                        {getPayoutStatus(item)}
                      </Text>
                    </View>

                    <View style={styles.infoBlock}>
                      <Text style={styles.infoLabel}>Method</Text>
                      <Text style={styles.infoValue} numberOfLines={1}>
                        {getPaymentMethod(item)}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.quickActionRow}>
                    <TouchableOpacity
                      style={styles.quickActionButton}
                      onPress={() => openTransactionMenu(item)}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="flash-outline" size={15} color="#374151" />
                      <Text style={styles.quickActionText}>Manage</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.quickPrimaryButton}
                      onPress={() => {
                        setSelectedTransaction(item);
                        markPayoutPaid();
                      }}
                      activeOpacity={0.85}
                    >
                      <Ionicons
                        name="cash-outline"
                        size={15}
                        color="#FFFFFF"
                      />
                      <Text style={styles.quickPrimaryText}>Pay Provider</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>Provider Payout Tracking</Text>
              <Text style={styles.sectionSubtitle}>
                Monitor outstanding payouts by provider
              </Text>
            </View>
          </View>

          {providerPayouts.length === 0 ? (
            <View style={styles.stateWrapSmall}>
              <Text style={styles.stateText}>No provider payouts yet</Text>
            </View>
          ) : (
            <View>
              {providerPayouts.map((provider) => (
                <View key={provider.providerId} style={styles.payoutCard}>
                  <View style={styles.payoutTopRow}>
                    <View>
                      <Text style={styles.payoutTitle}>{provider.providerName}</Text>
                      <Text style={styles.payoutMeta}>
                        {provider.totalOrders} order{provider.totalOrders > 1 ? "s" : ""}
                      </Text>
                    </View>

                    <View style={styles.pendingPayoutBadge}>
                      <Text style={styles.pendingPayoutBadgeText}>
                        Pending {formatCurrency(provider.pendingPayout)}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.payoutSummaryRow}>
                    <View style={styles.payoutInfo}>
                      <Text style={styles.payoutInfoLabel}>Total</Text>
                      <Text style={styles.payoutInfoValue}>
                        {formatCurrency(provider.totalPayout)}
                      </Text>
                    </View>

                    <View style={styles.payoutInfo}>
                      <Text style={styles.payoutInfoLabel}>Paid Out</Text>
                      <Text style={styles.payoutInfoValue}>
                        {formatCurrency(provider.paidOut)}
                      </Text>
                    </View>

                    <View style={styles.payoutInfo}>
                      <Text style={styles.payoutInfoLabel}>Pending</Text>
                      <Text style={styles.payoutInfoValue}>
                        {formatCurrency(provider.pendingPayout)}
                      </Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        onRequestClose={closeTransactionMenu}
      >
        <View style={styles.modalRoot}>
          <Pressable style={styles.modalOverlay} onPress={closeTransactionMenu} />

          <View style={styles.modalSheetWrap}>
            <View style={styles.modalSheet}>
              <View style={styles.sheetHandle} />

              <Text style={styles.sheetTitle}>
                {selectedTransaction
                  ? getOrderReference(selectedTransaction)
                  : "Transaction"}
              </Text>

              <TouchableOpacity
                style={styles.actionItem}
                onPress={markRefundRequested}
                disabled={actionLoading}
              >
                <Ionicons
                  name="return-down-back-outline"
                  size={18}
                  color="#D97706"
                />
                <Text style={styles.actionText}>Mark refund requested</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionItem}
                onPress={markRefunded}
                disabled={actionLoading}
              >
                <Ionicons
                  name="refresh-circle-outline"
                  size={18}
                  color="#DC2626"
                />
                <Text style={styles.actionDeleteText}>Mark refunded</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionItem}
                onPress={markPayoutPaid}
                disabled={actionLoading}
              >
                <Ionicons
                  name="cash-outline"
                  size={18}
                  color="#16A34A"
                />
                <Text style={styles.actionText}>Mark provider payout paid</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionItem}
                onPress={markPayoutPending}
                disabled={actionLoading}
              >
                <Ionicons
                  name="time-outline"
                  size={18}
                  color="#2563EB"
                />
                <Text style={styles.actionText}>Mark provider payout pending</Text>
              </TouchableOpacity>

              {actionLoading ? (
                <View style={styles.actionLoadingWrap}>
                  <ActivityIndicator size="small" color="#7C3AED" />
                </View>
              ) : null}

              <TouchableOpacity
                style={styles.cancelButton}
                onPress={closeTransactionMenu}
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
  stateWrapSmall: {
    paddingVertical: 18,
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
  transactionCard: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#EDEFF3",
    borderRadius: 18,
    padding: 14,
  },
  transactionTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  transactionLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: 10,
  },
  transactionImage: {
    width: 52,
    height: 52,
    borderRadius: 12,
    backgroundColor: "#E5E7EB",
    marginRight: 10,
  },
  transactionTextWrap: {
    flex: 1,
  },
  transactionRef: {
    fontSize: 14,
    fontWeight: "800",
    color: "#111827",
  },
  transactionMeta: {
    marginTop: 4,
    fontSize: 12,
    color: "#6B7280",
    fontWeight: "600",
  },
  transactionTime: {
    marginTop: 4,
    fontSize: 11,
    color: "#94A3B8",
    fontWeight: "600",
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
  typeBadge: {
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    marginRight: 8,
    marginBottom: 8,
  },
  typeBadgeText: {
    fontSize: 11,
    color: "#4B5563",
    fontWeight: "800",
    textTransform: "capitalize",
  },
  statusBadge: {
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    marginBottom: 8,
  },
  statusBadgePaid: {
    backgroundColor: "#DCFCE7",
  },
  statusBadgePending: {
    backgroundColor: "#FEF3C7",
  },
  statusBadgeRefundRequested: {
    backgroundColor: "#FFF7ED",
  },
  statusBadgeRefunded: {
    backgroundColor: "#FEE2E2",
  },
  statusBadgeFailed: {
    backgroundColor: "#F3F4F6",
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: "800",
    textTransform: "capitalize",
    color: "#4B5563",
  },
  statusBadgeTextPaid: {
    color: "#166534",
  },
  statusBadgeTextPending: {
    color: "#92400E",
  },
  statusBadgeTextRefundRequested: {
    color: "#B45309",
  },
  statusBadgeTextRefunded: {
    color: "#B91C1C",
  },
  statusBadgeTextFailed: {
    color: "#4B5563",
  },

  infoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  infoBlock: {
    width: "48.5%",
    backgroundColor: "#FAFAFB",
    borderRadius: 14,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#EEF2F7",
  },
  infoLabel: {
    fontSize: 11,
    color: "#94A3B8",
    fontWeight: "700",
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 13,
    color: "#111827",
    fontWeight: "800",
    textTransform: "capitalize",
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

  payoutCard: {
    backgroundColor: "#FAFAFB",
    borderWidth: 1,
    borderColor: "#EEF2F7",
    borderRadius: 16,
    padding: 12,
    marginBottom: 12,
  },
  payoutTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  payoutTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#111827",
  },
  payoutMeta: {
    marginTop: 4,
    fontSize: 12,
    color: "#6B7280",
    fontWeight: "600",
  },
  pendingPayoutBadge: {
    backgroundColor: "#FFF7ED",
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
  },
  pendingPayoutBadgeText: {
    fontSize: 11,
    color: "#B45309",
    fontWeight: "800",
  },
  payoutSummaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  payoutInfo: {
    flex: 1,
    marginRight: 8,
  },
  payoutInfoLabel: {
    fontSize: 11,
    color: "#94A3B8",
    fontWeight: "700",
    marginBottom: 4,
  },
  payoutInfoValue: {
    fontSize: 13,
    color: "#111827",
    fontWeight: "800",
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
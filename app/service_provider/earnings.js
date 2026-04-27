import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { collection, doc, onSnapshot, query, where } from "firebase/firestore";
import { auth, db } from "../../config/firebase";

function formatMoney(value) {
  return `£${Number(value || 0).toFixed(2)}`;
}

function formatDate(value) {
  try {
    if (!value) return "No date";
    if (typeof value?.toDate === "function") {
      return value.toDate().toLocaleDateString();
    }
    if (value?.seconds) {
      return new Date(value.seconds * 1000).toLocaleDateString();
    }
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleDateString();
    }
    return "No date";
  } catch {
    return "No date";
  }
}

function getMillis(value) {
  if (!value) return 0;
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (typeof value?.seconds === "number") return value.seconds * 1000;
  if (typeof value === "number") return value;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function getImage(item) {
  if (Array.isArray(item?.mediaUrls) && item.mediaUrls.length > 0) {
    return item.mediaUrls[0];
  }
  if (Array.isArray(item?.images) && item.images.length > 0) {
    return item.images[0];
  }
  if (item?.mediaUrl) return item.mediaUrl;
  if (item?.imageUrl) return item.imageUrl;
  return "https://via.placeholder.com/400x300.png?text=No+Image";
}

function StatCard({ icon, title, value, sub }) {
  return (
    <View style={styles.statCard}>
      <View style={styles.iconWrap}>
        <Ionicons name={icon} size={22} color="#4a63ff" />
      </View>
      <Text style={styles.statTitle}>{title}</Text>
      <Text style={styles.statValue}>{value}</Text>
      {!!sub && <Text style={styles.statSub}>{sub}</Text>}
    </View>
  );
}

function getProviderRevenue(payment) {
  if (!payment) return 0;

  if (Array.isArray(payment.items) && payment.items.length > 0) {
    return payment.items.reduce((sum, item) => {
      const qty = Number(item.quantity || 1);
      const amount =
        item.totalPrice != null
          ? Number(item.totalPrice || 0)
          : Number(item.price || 0) * qty;

      return sum + amount;
    }, 0);
  }

  return Number(
    payment.totalAmount ??
      payment.totalPrice ??
      payment.providerAmount ??
      payment.subtotal ??
      payment.amount ??
      payment.price ??
      0
  );
}

function buildPopularProductFromPayments(payments) {
  const grouped = {};

  payments.forEach((payment) => {
    if (Array.isArray(payment.items) && payment.items.length > 0) {
      payment.items.forEach((item) => {
        const key = item.productId || item.id || item.title || "unknown";

        if (!grouped[key]) {
          grouped[key] = {
            productId: key,
            title: item.title || "Untitled Product",
            itemType: item.itemType || "Item",
            quantity: 0,
            revenue: 0,
            mediaUrl: item.mediaUrl || item.imageUrl || "",
            mediaUrls: item.mediaUrls || item.images || [],
          };
        }

        const qty = Number(item.quantity || 1);
        const revenue =
          item.totalPrice != null
            ? Number(item.totalPrice || 0)
            : Number(item.price || 0) * qty;

        grouped[key].quantity += qty;
        grouped[key].revenue += revenue;
      });

      return;
    }

    const key = payment.productId || payment.id || payment.title || "unknown";

    if (!grouped[key]) {
      grouped[key] = {
        productId: key,
        title: payment.title || "Untitled Product",
        itemType: payment.itemType || "Item",
        quantity: 0,
        revenue: 0,
        mediaUrl: payment.mediaUrl || payment.imageUrl || "",
        mediaUrls: payment.mediaUrls || payment.images || [],
      };
    }

    const qty = Number(payment.quantity || 1);
    const revenue = Number(
      payment.totalAmount ??
        payment.totalPrice ??
        payment.providerAmount ??
        payment.subtotal ??
        payment.amount ??
        payment.price ??
        0
    );

    grouped[key].quantity += qty;
    grouped[key].revenue += revenue;
  });

  return (
    Object.values(grouped).sort((a, b) => {
      if (b.quantity !== a.quantity) return b.quantity - a.quantity;
      return b.revenue - a.revenue;
    })[0] || null
  );
}

export default function EarningsScreen() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [showIncomeHistory, setShowIncomeHistory] = useState(false);

  const [products, setProducts] = useState([]);
  const [payments, setPayments] = useState([]);
  const [earningsDoc, setEarningsDoc] = useState(null);
  const [earningTransactions, setEarningTransactions] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);

  useEffect(() => {
    const user = auth.currentUser;

    if (!user?.uid) {
      setLoading(false);
      return;
    }

    const providerUid = user.uid;

    let productsReady = false;
    let paymentsReady = false;
    let earningsReady = false;
    let transactionsReady = false;
    let withdrawalsReady = false;

    const done = () => {
      if (
        productsReady &&
        paymentsReady &&
        earningsReady &&
        transactionsReady &&
        withdrawalsReady
      ) {
        setLoading(false);
      }
    };

    const productsQuery = query(
      collection(db, "shops"),
      where("providerId", "==", providerUid)
    );

    const paymentsQuery = query(
      collection(db, "payments"),
      where("providerId", "==", providerUid)
    );

    const transactionsQuery = query(
      collection(db, "earning_transactions"),
      where("providerId", "==", providerUid)
    );

    const withdrawalsQuery = query(
      collection(db, "withdrawals"),
      where("providerId", "==", providerUid)
    );

    const unsubProducts = onSnapshot(
      productsQuery,
      (snapshot) => {
        const data = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }));
        setProducts(data);
        productsReady = true;
        done();
      },
      (error) => {
        console.log("Products error:", error);
        productsReady = true;
        done();
      }
    );

    const unsubPayments = onSnapshot(
      paymentsQuery,
      (snapshot) => {
        const data = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }));
        setPayments(data);
        paymentsReady = true;
        done();
      },
      (error) => {
        console.log("Payments load error:", error);
        paymentsReady = true;
        done();
      }
    );

    const unsubTransactions = onSnapshot(
      transactionsQuery,
      (snapshot) => {
        const data = snapshot.docs
          .map((docSnap) => ({
            id: docSnap.id,
            ...docSnap.data(),
          }))
          .sort((a, b) => getMillis(b.createdAt) - getMillis(a.createdAt));

        setEarningTransactions(data);
        transactionsReady = true;
        done();
      },
      (error) => {
        console.log("Earning transactions error:", error);
        transactionsReady = true;
        done();
      }
    );

    const unsubWithdrawals = onSnapshot(
      withdrawalsQuery,
      (snapshot) => {
        const data = snapshot.docs
          .map((docSnap) => ({
            id: docSnap.id,
            ...docSnap.data(),
          }))
          .sort((a, b) => getMillis(b.createdAt) - getMillis(a.createdAt));

        setWithdrawals(data);
        withdrawalsReady = true;
        done();
      },
      (error) => {
        console.log("Withdrawals error:", error);
        withdrawalsReady = true;
        done();
      }
    );

    const unsubEarnings = onSnapshot(
      doc(db, "earnings", providerUid),
      (docSnap) => {
        setEarningsDoc(
          docSnap.exists()
            ? {
                id: docSnap.id,
                ...docSnap.data(),
              }
            : null
        );
        earningsReady = true;
        done();
      },
      (error) => {
        console.log("Earnings doc error:", error);
        earningsReady = true;
        done();
      }
    );

    return () => {
      unsubProducts();
      unsubPayments();
      unsubTransactions();
      unsubWithdrawals();
      unsubEarnings();
    };
  }, []);

  const totalIncome = useMemo(() => {
    const earningsTotal = Number(earningsDoc?.totalIncome || 0);

    if (earningsTotal > 0) return earningsTotal;

    const fromTransactions = earningTransactions.reduce((sum, item) => {
      return sum + Number(item.amount || 0);
    }, 0);

    if (fromTransactions > 0) return fromTransactions;

    return payments.reduce((sum, payment) => {
      return sum + getProviderRevenue(payment);
    }, 0);
  }, [earningsDoc, earningTransactions, payments]);

  const totalWithdrawn = useMemo(() => {
    const earningsWithdrawn = Number(earningsDoc?.totalWithdrawn || 0);

    if (earningsWithdrawn > 0) return earningsWithdrawn;

    return withdrawals.reduce((sum, item) => {
      return sum + Number(item.amount || 0);
    }, 0);
  }, [earningsDoc, withdrawals]);

  const availableBalance = useMemo(() => {
    const balance = totalIncome - totalWithdrawn;
    return balance > 0 ? balance : 0;
  }, [totalIncome, totalWithdrawn]);

  const totalProducts = useMemo(() => products.length, [products]);

  const lowStockCount = useMemo(() => {
    return products.filter((item) => Number(item.stock || 0) <= 3).length;
  }, [products]);

  const totalCompletedIncomeJobs = useMemo(() => {
    return earningTransactions.length;
  }, [earningTransactions]);

  const popularProduct = useMemo(() => {
    return buildPopularProductFromPayments(payments);
  }, [payments]);

  const lowStockProducts = useMemo(() => {
    return products
      .filter((item) => Number(item.stock || 0) <= 3)
      .sort((a, b) => Number(a.stock || 0) - Number(b.stock || 0));
  }, [products]);

  const recentTransactions = useMemo(() => {
    return earningTransactions.slice(0, 20);
  }, [earningTransactions]);

  const handleWithdrawPress = () => {
    const user = auth.currentUser;

    if (!user?.uid) {
      Alert.alert("Error", "Please log in first.");
      return;
    }

    if (availableBalance <= 0) {
      Alert.alert("No Balance", "You do not have any available income to withdraw.");
      return;
    }

    router.push({
      pathname: "/service_provider/withdraw",
      params: {
        availableBalance: String(availableBalance),
        totalIncome: String(totalIncome),
        totalWithdrawn: String(totalWithdrawn),
      },
    });
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.logo}>ArtLinker</Text>
            <Text style={styles.headerSub}>Business performance overview</Text>
          </View>

          <View style={styles.headerIcon}>
            <Ionicons name="cash-outline" size={22} color="#4a63ff" />
          </View>
        </View>

        <Text style={styles.heading}>Earnings</Text>
        <Text style={styles.subheading}>
          See your total income, available balance, previous earnings and product
          performance
        </Text>

        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#4a63ff" />
            <Text style={styles.loadingText}>Loading earnings...</Text>
          </View>
        ) : (
          <>
            <View style={styles.balanceCard}>
              <View style={styles.balanceTopRow}>
                <View>
                  <Text style={styles.balanceLabel}>Total Income</Text>
                  <Text style={styles.balanceAmount}>{formatMoney(totalIncome)}</Text>
                </View>

                <View style={styles.balanceIconWrap}>
                  <Ionicons name="wallet-outline" size={24} color="#FFFFFF" />
                </View>
              </View>

              <View style={styles.balanceDivider} />

              <View style={styles.balanceBottomRow}>
                <View>
                  <Text style={styles.availableLabel}>Available Balance</Text>
                  <Text style={styles.availableAmount}>
                    {formatMoney(availableBalance)}
                  </Text>
                </View>

                <TouchableOpacity
                  style={[
                    styles.withdrawButton,
                    availableBalance <= 0 && styles.withdrawButtonDisabled,
                  ]}
                  onPress={handleWithdrawPress}
                  disabled={availableBalance <= 0}
                >
                  <Ionicons
                    name="arrow-down-circle-outline"
                    size={16}
                    color="#FFFFFF"
                  />
                  <Text style={styles.withdrawButtonText}>Withdraw</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.statsGrid}>
              <StatCard
                icon="checkmark-circle-outline"
                title="Paid Jobs"
                value={String(totalCompletedIncomeJobs)}
                sub="Completed requests credited to you"
              />
              <StatCard
                icon="card-outline"
                title="Withdrawn"
                value={formatMoney(totalWithdrawn)}
                sub="Amount already withdrawn"
              />
              <StatCard
                icon="storefront-outline"
                title="Products Listed"
                value={String(totalProducts)}
                sub="Products in your shop"
              />
              <StatCard
                icon="alert-circle-outline"
                title="Low Stock"
                value={String(lowStockCount)}
                sub="Items with stock 3 or less"
              />
            </View>

            <View style={styles.sectionCard}>
              <TouchableOpacity
                style={styles.dropdownHeader}
                onPress={() => setShowIncomeHistory((prev) => !prev)}
              >
                <View style={styles.dropdownTitleWrap}>
                  <Text style={styles.sectionTitle}>Previous Earning Income</Text>
                  <Text style={styles.dropdownSubText}>
                    View earlier income records
                  </Text>
                </View>

                <Ionicons
                  name={
                    showIncomeHistory
                      ? "chevron-up-outline"
                      : "chevron-down-outline"
                  }
                  size={20}
                  color="#4a63ff"
                />
              </TouchableOpacity>

              {showIncomeHistory && (
                <View style={styles.dropdownBody}>
                  {recentTransactions.length === 0 ? (
                    <Text style={styles.emptyText}>No income transactions yet.</Text>
                  ) : (
                    recentTransactions.map((item) => (
                      <View key={item.id} style={styles.transactionRow}>
                        <View style={styles.transactionLeft}>
                          <View style={styles.transactionIcon}>
                            <Ionicons name="cash-outline" size={18} color="#15803d" />
                          </View>

                          <View style={styles.transactionInfo}>
                            <Text style={styles.transactionTitle} numberOfLines={1}>
                              {item.title || "Service Request"}
                            </Text>
                            <Text style={styles.transactionMeta}>
                              {formatDate(item.createdAt)}
                            </Text>
                          </View>
                        </View>

                        <Text style={styles.transactionAmount}>
                          {formatMoney(item.amount || 0)}
                        </Text>
                      </View>
                    ))
                  )}
                </View>
              )}
            </View>

            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Popular Product</Text>
                <Ionicons name="trending-up-outline" size={18} color="#4a63ff" />
              </View>

              {!popularProduct ? (
                <Text style={styles.emptyText}>No popular product yet.</Text>
              ) : (
                <View style={styles.featuredCard}>
                  <Image
                    source={{ uri: getImage(popularProduct) }}
                    style={styles.featuredImage}
                    resizeMode="contain"
                  />

                  <View style={styles.featuredInfo}>
                    <Text style={styles.featuredType}>
                      {popularProduct.itemType}
                    </Text>
                    <Text style={styles.featuredTitle}>{popularProduct.title}</Text>
                    <Text style={styles.featuredMeta}>
                      Sold: {popularProduct.quantity} item(s)
                    </Text>
                    <Text style={styles.featuredAmount}>
                      {formatMoney(popularProduct.revenue)}
                    </Text>
                  </View>
                </View>
              )}
            </View>

            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Low Stock Products</Text>
                <Ionicons name="warning-outline" size={18} color="#4a63ff" />
              </View>

              {lowStockProducts.length === 0 ? (
                <Text style={styles.emptyText}>
                  You have no low stock products.
                </Text>
              ) : (
                lowStockProducts.map((item) => (
                  <View key={item.id} style={styles.lowStockRow}>
                    <Image
                      source={{ uri: getImage(item) }}
                      style={styles.lowStockImage}
                      resizeMode="contain"
                    />

                    <View style={styles.lowStockInfo}>
                      <Text style={styles.lowStockTitle} numberOfLines={1}>
                        {item.title || "Untitled Product"}
                      </Text>
                      <Text style={styles.lowStockType}>
                        {item.itemType || "Item"}
                      </Text>
                    </View>

                    <View style={styles.stockBadge}>
                      <Text style={styles.stockBadgeText}>
                        Stock: {Number(item.stock || 0)}
                      </Text>
                    </View>
                  </View>
                ))
              )}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f7f8fc",
  },
  scrollContent: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 28,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  logo: {
    fontSize: 28,
    fontWeight: "800",
    color: "#f06ce9",
  },
  headerSub: {
    marginTop: 2,
    fontSize: 12,
    color: "#8d8d98",
  },
  headerIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#ffffff",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  heading: {
    marginTop: 18,
    fontSize: 30,
    fontWeight: "800",
    color: "#1f1f1f",
  },
  subheading: {
    marginTop: 6,
    fontSize: 13,
    color: "#8f8f9a",
    lineHeight: 18,
    marginBottom: 16,
  },
  loadingBox: {
    paddingVertical: 80,
    alignItems: "center",
  },
  loadingText: {
    marginTop: 12,
    color: "#7c7f89",
    fontSize: 14,
  },
  balanceCard: {
    backgroundColor: "#4a63ff",
    borderRadius: 22,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  balanceTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  balanceLabel: {
    fontSize: 13,
    color: "rgba(255,255,255,0.85)",
    fontWeight: "700",
  },
  balanceAmount: {
    marginTop: 6,
    fontSize: 30,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  balanceIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.18)",
    justifyContent: "center",
    alignItems: "center",
  },
  balanceDivider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.16)",
    marginVertical: 14,
  },
  balanceBottomRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  availableLabel: {
    fontSize: 12,
    color: "rgba(255,255,255,0.8)",
    fontWeight: "700",
  },
  availableAmount: {
    marginTop: 4,
    fontSize: 22,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  withdrawButton: {
    backgroundColor: "#ef4444",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
  },
  withdrawButtonDisabled: {
    opacity: 0.55,
  },
  withdrawButtonText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 13,
    marginLeft: 6,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  statCard: {
    width: "48%",
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 14,
    marginBottom: 14,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#eef1ff",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 10,
  },
  statTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#6b7280",
  },
  statValue: {
    marginTop: 6,
    fontSize: 22,
    fontWeight: "900",
    color: "#111827",
  },
  statSub: {
    marginTop: 5,
    fontSize: 11,
    color: "#9ca3af",
    lineHeight: 15,
  },
  sectionCard: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 14,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#111827",
  },
  dropdownHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  dropdownTitleWrap: {
    flex: 1,
    marginRight: 12,
  },
  dropdownSubText: {
    marginTop: 4,
    fontSize: 12,
    color: "#8b909c",
  },
  dropdownBody: {
    marginTop: 14,
  },
  emptyText: {
    fontSize: 13,
    color: "#8b909c",
    lineHeight: 18,
  },
  featuredCard: {
    backgroundColor: "#f9fafb",
    borderRadius: 18,
    padding: 12,
  },
  featuredImage: {
    width: "100%",
    height: 220,
    borderRadius: 16,
    backgroundColor: "#f3f4f6",
  },
  featuredInfo: {
    marginTop: 12,
  },
  featuredType: {
    alignSelf: "flex-start",
    backgroundColor: "#eef1ff",
    color: "#4a63ff",
    fontSize: 11,
    fontWeight: "800",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    overflow: "hidden",
    marginBottom: 8,
  },
  featuredTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#111827",
  },
  featuredMeta: {
    marginTop: 6,
    fontSize: 13,
    color: "#6b7280",
    fontWeight: "600",
  },
  featuredAmount: {
    marginTop: 8,
    fontSize: 22,
    fontWeight: "900",
    color: "#4a63ff",
  },
  transactionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#f9fafb",
    borderRadius: 16,
    padding: 12,
    marginBottom: 10,
  },
  transactionLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: 10,
  },
  transactionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#ecfdf5",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },
  transactionInfo: {
    flex: 1,
  },
  transactionTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#111827",
  },
  transactionMeta: {
    marginTop: 4,
    fontSize: 12,
    color: "#6b7280",
  },
  transactionAmount: {
    fontSize: 14,
    fontWeight: "900",
    color: "#15803d",
  },
  lowStockRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f9fafb",
    borderRadius: 16,
    padding: 10,
    marginBottom: 10,
  },
  lowStockImage: {
    width: 62,
    height: 62,
    borderRadius: 12,
    backgroundColor: "#f3f4f6",
  },
  lowStockInfo: {
    flex: 1,
    marginLeft: 10,
  },
  lowStockTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#111827",
  },
  lowStockType: {
    marginTop: 4,
    fontSize: 12,
    color: "#6b7280",
  },
  stockBadge: {
    backgroundColor: "#fff3f3",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  stockBadgeText: {
    color: "#dc2626",
    fontSize: 12,
    fontWeight: "800",
  },
});
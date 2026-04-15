import React, { useEffect, useMemo, useState } from "react";
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  addDoc,
  collection,
  doc,
  increment,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import { auth, db } from "../../config/firebase";

function formatMoney(value) {
  return `£${Number(value || 0).toFixed(2)}`;
}

function sanitizeDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function formatSortCode(value) {
  const digits = sanitizeDigits(value).slice(0, 6);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
  return `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4, 6)}`;
}

function maskAccountNumber(value) {
  const digits = sanitizeDigits(value);
  if (digits.length <= 4) return digits;
  return `****${digits.slice(-4)}`;
}

function getMillis(value) {
  if (!value) return 0;
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (typeof value?.seconds === "number") return value.seconds * 1000;
  if (typeof value === "number") return value;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
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

function buildInvoiceNumber(type) {
  const now = new Date();
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  const random = Math.floor(1000 + Math.random() * 9000);
  const prefix = type === "weekly" ? "WEEK" : "MONTH";
  return `${prefix}-${year}${month}${day}-${random}`;
}

function getPeriodLabel(type) {
  const now = new Date();

  if (type === "weekly") {
    const start = new Date(now);
    const end = new Date(now);
    end.setDate(now.getDate() + 6);
    return `${start.toLocaleDateString()} - ${end.toLocaleDateString()}`;
  }

  return now.toLocaleString("default", {
    month: "long",
    year: "numeric",
  });
}

export default function WithdrawScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const [accountNumber, setAccountNumber] = useState("");
  const [sortCode, setSortCode] = useState("");
  const [invoiceType, setInvoiceType] = useState("weekly");
  const [accountName, setAccountName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [pendingWithdrawals, setPendingWithdrawals] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  const availableBalance = useMemo(() => {
    return Number(params?.availableBalance ?? 0);
  }, [params?.availableBalance]);

  const totalIncome = useMemo(() => {
    return Number(params?.totalIncome ?? 0);
  }, [params?.totalIncome]);

  const totalWithdrawn = useMemo(() => {
    return Number(params?.totalWithdrawn ?? 0);
  }, [params?.totalWithdrawn]);

  const cleanAccountNumber = sanitizeDigits(accountNumber).slice(0, 8);
  const cleanSortCode = sanitizeDigits(sortCode).slice(0, 6);

  useEffect(() => {
    const user = auth.currentUser;

    if (!user?.uid) {
      setLoadingHistory(false);
      return;
    }

    const q = query(
      collection(db, "withdrawals"),
      where("providerId", "==", user.uid)
    );

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs
          .map((docSnap) => ({
            id: docSnap.id,
            ...docSnap.data(),
          }))
          .sort((a, b) => getMillis(b.createdAt) - getMillis(a.createdAt));

        setPendingWithdrawals(
          data.filter((item) =>
            ["Pending", "Processing", "Requested"].includes(item.status)
          )
        );
        setLoadingHistory(false);
      },
      (error) => {
        console.log("Withdrawals history error:", error);
        setLoadingHistory(false);
      }
    );

    return () => unsub();
  }, []);

  const handleAccountNumberChange = (value) => {
    setAccountNumber(sanitizeDigits(value).slice(0, 8));
  };

  const handleSortCodeChange = (value) => {
    setSortCode(formatSortCode(value));
  };

  const validateForm = () => {
    const user = auth.currentUser;

    if (!user?.uid) {
      Alert.alert("Error", "Please log in first.");
      return false;
    }

    if (Number.isNaN(availableBalance) || availableBalance <= 0) {
      Alert.alert(
        "No Balance",
        "No available balance was passed from the earnings page. Please go back and try again."
      );
      return false;
    }

    if (!accountName.trim()) {
      Alert.alert("Missing Information", "Please enter the account name.");
      return false;
    }

    if (cleanAccountNumber.length !== 8) {
      Alert.alert("Invalid Account Number", "Account number must be exactly 8 digits.");
      return false;
    }

    if (cleanSortCode.length !== 6) {
      Alert.alert("Invalid Sort Code", "Sort code must be exactly 6 digits.");
      return false;
    }

    if (!invoiceType) {
      Alert.alert("Missing Invoice Type", "Please choose weekly invoice or monthly invoice.");
      return false;
    }

    return true;
  };

  const handleSubmitWithdrawal = async () => {
    if (submitting) return;
    if (!validateForm()) return;

    const user = auth.currentUser;
    if (!user?.uid) {
      Alert.alert("Error", "Please log in first.");
      return;
    }

    try {
      setSubmitting(true);

      const amount = Number(availableBalance || 0);
      const maskedAccountNumber = maskAccountNumber(cleanAccountNumber);
      const formattedSortCode = formatSortCode(cleanSortCode);
      const invoiceNumber = buildInvoiceNumber(invoiceType);
      const invoiceLabel =
        invoiceType === "weekly" ? "Weekly Invoice" : "Monthly Invoice";
      const invoicePeriod = getPeriodLabel(invoiceType);

      const withdrawalPayload = {
        providerId: user.uid,
        providerEmail: user.email || "",
        providerName: user.displayName || "",
        amount,
        status: "Pending",
        type: "income_withdrawal",
        invoiceType,
        invoiceLabel,
        invoiceNumber,
        invoicePeriod,
        bankDetails: {
          accountName: accountName.trim(),
          accountNumberMasked: maskedAccountNumber,
          sortCode: formattedSortCode,
        },
        summary: {
          totalIncome: Number(totalIncome || 0),
          totalWithdrawnBeforeRequest: Number(totalWithdrawn || 0),
          availableBalanceBeforeRequest: amount,
        },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      const withdrawalRef = await addDoc(
        collection(db, "withdrawals"),
        withdrawalPayload
      );

      await addDoc(collection(db, "invoices"), {
        providerId: user.uid,
        providerEmail: user.email || "",
        providerName: user.displayName || "",
        withdrawalId: withdrawalRef.id,
        invoiceNumber,
        invoiceType,
        invoiceLabel,
        invoicePeriod,
        amount,
        status: "Pending",
        bankDetails: {
          accountName: accountName.trim(),
          accountNumberMasked: maskedAccountNumber,
          sortCode: formattedSortCode,
        },
        issuedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await setDoc(
        doc(db, "earnings", user.uid),
        {
          providerId: user.uid,
          providerEmail: user.email || "",
          totalWithdrawn: increment(amount),
          updatedAt: serverTimestamp(),
          lastWithdrawalRequest: {
            withdrawalId: withdrawalRef.id,
            amount,
            invoiceType,
            invoiceLabel,
            invoiceNumber,
            status: "Pending",
            createdAt: serverTimestamp(),
          },
          bankDetails: {
            accountName: accountName.trim(),
            accountNumberMasked: maskedAccountNumber,
            sortCode: formattedSortCode,
          },
        },
        { merge: true }
      );

      try {
        await addDoc(collection(db, "notifications"), {
          userId: user.uid,
          providerId: user.uid,
          type: "withdrawal_submitted",
          title: "Withdrawal request submitted",
          message: `Your ${invoiceLabel.toLowerCase()} for ${formatMoney(
            amount
          )} has been submitted successfully.`,
          withdrawalId: withdrawalRef.id,
          invoiceNumber,
          status: "unread",
          read: false,
          createdAt: serverTimestamp(),
        });
      } catch (notificationError) {
        console.log("Provider notification error:", notificationError);
      }

      try {
        await addDoc(collection(db, "notifications"), {
          adminNotification: true,
          targetRole: "admin",
          type: "admin_withdrawal_request",
          title: "New withdrawal request",
          message: `${user.displayName || "A provider"} submitted a ${invoiceLabel.toLowerCase()} for ${formatMoney(
            amount
          )}.`,
          providerId: user.uid,
          providerEmail: user.email || "",
          providerName: user.displayName || "",
          withdrawalId: withdrawalRef.id,
          invoiceNumber,
          invoiceType,
          amount,
          status: "unread",
          read: false,
          createdAt: serverTimestamp(),
        });
      } catch (adminNotificationError) {
        console.log("Admin notification error:", adminNotificationError);
      }

      Alert.alert(
        "Success",
        "Withdrawal submitted successfully.",
        [
          {
            text: "OK",
            onPress: () => router.back(),
          },
        ]
      );
    } catch (error) {
      console.log("Withdrawal submit error:", error);
      Alert.alert(
        "Submit Failed",
        error?.message || "Failed to save withdrawal request."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back-outline" size={22} color="#111827" />
          </TouchableOpacity>

          <Text style={styles.headerTitle}>Withdraw</Text>

          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.heroCard}>
          <Text style={styles.heroLabel}>Available Balance</Text>
          <Text style={styles.heroAmount}>{formatMoney(availableBalance)}</Text>
          <Text style={styles.heroSub}>
            This amount was sent from your earnings page and is ready for withdrawal
          </Text>
        </View>

        <View style={styles.balanceInfoCard}>
          <View style={styles.balanceInfoRow}>
            <Text style={styles.balanceInfoLabel}>Available Balance</Text>
            <Text style={styles.balanceInfoValueStrong}>
              {formatMoney(availableBalance)}
            </Text>
          </View>

          <View style={styles.balanceInfoRow}>
            <Text style={styles.balanceInfoLabel}>Total Income</Text>
            <Text style={styles.balanceInfoValue}>{formatMoney(totalIncome)}</Text>
          </View>

          <View style={styles.balanceInfoRow}>
            <Text style={styles.balanceInfoLabel}>Already Withdrawn</Text>
            <Text style={styles.balanceInfoValue}>
              {formatMoney(totalWithdrawn)}
            </Text>
          </View>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Invoice Type</Text>
          <Text style={styles.sectionSub}>
            Choose whether this request should be recorded as weekly or monthly
          </Text>

          <View style={styles.optionRow}>
            <TouchableOpacity
              style={[
                styles.optionCard,
                invoiceType === "weekly" && styles.optionCardActive,
              ]}
              onPress={() => setInvoiceType("weekly")}
            >
              <Ionicons
                name="calendar-outline"
                size={20}
                color={invoiceType === "weekly" ? "#4a63ff" : "#6b7280"}
              />
              <Text
                style={[
                  styles.optionTitle,
                  invoiceType === "weekly" && styles.optionTitleActive,
                ]}
              >
                Weekly Invoice
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.optionCard,
                invoiceType === "monthly" && styles.optionCardActive,
              ]}
              onPress={() => setInvoiceType("monthly")}
            >
              <Ionicons
                name="document-text-outline"
                size={20}
                color={invoiceType === "monthly" ? "#4a63ff" : "#6b7280"}
              />
              <Text
                style={[
                  styles.optionTitle,
                  invoiceType === "monthly" && styles.optionTitleActive,
                ]}
              >
                Monthly Invoice
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Bank Details</Text>
          <Text style={styles.sectionSub}>
            Enter the bank account where your payout should be sent
          </Text>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Account Name</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter account name"
              placeholderTextColor="#9ca3af"
              value={accountName}
              onChangeText={setAccountName}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Account Number</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter 8 digit account number"
              placeholderTextColor="#9ca3af"
              keyboardType="number-pad"
              value={accountNumber}
              onChangeText={handleAccountNumberChange}
              maxLength={8}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Sort Code</Text>
            <TextInput
              style={styles.input}
              placeholder="00-00-00"
              placeholderTextColor="#9ca3af"
              keyboardType="number-pad"
              value={sortCode}
              onChangeText={handleSortCodeChange}
              maxLength={8}
            />
          </View>
        </View>

        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Summary</Text>

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Available Balance</Text>
            <Text style={styles.summaryValueStrong}>
              {formatMoney(availableBalance)}
            </Text>
          </View>

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Invoice Type</Text>
            <Text style={styles.summaryValue}>
              {invoiceType === "weekly" ? "Weekly Invoice" : "Monthly Invoice"}
            </Text>
          </View>
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.pendingHeader}>
            <Text style={styles.sectionTitle}>Pending Withdrawals</Text>
            <Ionicons name="time-outline" size={18} color="#4a63ff" />
          </View>

          {loadingHistory ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="small" color="#4a63ff" />
              <Text style={styles.loadingText}>Loading pending withdrawals...</Text>
            </View>
          ) : pendingWithdrawals.length === 0 ? (
            <Text style={styles.emptyText}>No pending withdrawals found.</Text>
          ) : (
            pendingWithdrawals.map((item) => (
              <View key={item.id} style={styles.pendingCard}>
                <View style={styles.pendingTop}>
                  <View>
                    <Text style={styles.pendingAmount}>
                      {formatMoney(item.amount || 0)}
                    </Text>
                    <Text style={styles.pendingMeta}>
                      {item.invoiceLabel || "Invoice"}
                    </Text>
                  </View>

                  <View style={styles.statusBadge}>
                    <Text style={styles.statusBadgeText}>
                      {item.status || "Pending"}
                    </Text>
                  </View>
                </View>

                <Text style={styles.pendingInfo}>
                  Invoice No: {item.invoiceNumber || "N/A"}
                </Text>
                <Text style={styles.pendingInfo}>
                  Period: {item.invoicePeriod || "N/A"}
                </Text>
                <Text style={styles.pendingInfo}>
                  Account: {item?.bankDetails?.accountNumberMasked || "****"}
                </Text>
                <Text style={styles.pendingInfo}>
                  Sort Code: {item?.bankDetails?.sortCode || "00-00-00"}
                </Text>
                <Text style={styles.pendingDate}>
                  Submitted: {formatDate(item.createdAt)}
                </Text>
              </View>
            ))
          )}
        </View>

        <TouchableOpacity
          style={[
            styles.submitButton,
            submitting && styles.submitButtonDisabled,
          ]}
          onPress={handleSubmitWithdrawal}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <Ionicons name="cash-outline" size={18} color="#FFFFFF" />
              <Text style={styles.submitButtonText}>Submit Withdrawal</Text>
            </>
          )}
        </TouchableOpacity>
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
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 32,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#ffffff",
    justifyContent: "center",
    alignItems: "center",
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#111827",
  },
  headerSpacer: {
    width: 42,
  },
  heroCard: {
    backgroundColor: "#4a63ff",
    borderRadius: 22,
    padding: 18,
    marginBottom: 16,
  },
  heroLabel: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 13,
    fontWeight: "700",
  },
  heroAmount: {
    marginTop: 6,
    fontSize: 30,
    fontWeight: "900",
    color: "#ffffff",
  },
  heroSub: {
    marginTop: 8,
    color: "rgba(255,255,255,0.85)",
    fontSize: 13,
    lineHeight: 18,
  },
  balanceInfoCard: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 14,
    marginBottom: 16,
    elevation: 3,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
  },
  balanceInfoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
  },
  balanceInfoLabel: {
    fontSize: 13,
    color: "#6b7280",
    fontWeight: "600",
  },
  balanceInfoValue: {
    fontSize: 13,
    color: "#111827",
    fontWeight: "700",
  },
  balanceInfoValueStrong: {
    fontSize: 15,
    color: "#15803d",
    fontWeight: "900",
  },
  sectionCard: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 14,
    marginBottom: 16,
    elevation: 3,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#111827",
  },
  sectionSub: {
    marginTop: 4,
    fontSize: 12,
    color: "#6b7280",
    marginBottom: 14,
  },
  optionRow: {
    gap: 12,
  },
  optionCard: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 16,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
  },
  optionCardActive: {
    borderColor: "#4a63ff",
    backgroundColor: "#eef2ff",
  },
  optionTitle: {
    marginLeft: 10,
    fontSize: 14,
    fontWeight: "700",
    color: "#374151",
  },
  optionTitleActive: {
    color: "#4a63ff",
  },
  inputGroup: {
    marginBottom: 14,
  },
  label: {
    marginBottom: 6,
    fontSize: 13,
    fontWeight: "700",
    color: "#374151",
  },
  input: {
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 14,
    color: "#111827",
  },
  summaryCard: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 14,
    marginBottom: 16,
    elevation: 3,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 10,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
  },
  summaryLabel: {
    fontSize: 13,
    color: "#6b7280",
    fontWeight: "600",
  },
  summaryValue: {
    fontSize: 13,
    color: "#111827",
    fontWeight: "700",
  },
  summaryValueStrong: {
    fontSize: 15,
    color: "#15803d",
    fontWeight: "900",
  },
  pendingHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  loadingWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
  },
  loadingText: {
    marginTop: 8,
    color: "#6b7280",
    fontSize: 13,
  },
  emptyText: {
    fontSize: 13,
    color: "#8b909c",
    lineHeight: 18,
  },
  pendingCard: {
    backgroundColor: "#f9fafb",
    borderRadius: 16,
    padding: 12,
    marginBottom: 10,
  },
  pendingTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  pendingAmount: {
    fontSize: 18,
    fontWeight: "900",
    color: "#111827",
  },
  pendingMeta: {
    marginTop: 3,
    fontSize: 12,
    color: "#6b7280",
    fontWeight: "600",
  },
  statusBadge: {
    backgroundColor: "#fff7ed",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  statusBadgeText: {
    color: "#ea580c",
    fontSize: 12,
    fontWeight: "800",
  },
  pendingInfo: {
    fontSize: 12,
    color: "#374151",
    marginTop: 4,
  },
  pendingDate: {
    marginTop: 8,
    fontSize: 12,
    color: "#6b7280",
    fontWeight: "600",
  },
  submitButton: {
    backgroundColor: "#111827",
    borderRadius: 16,
    paddingVertical: 15,
    justifyContent: "center",
    alignItems: "center",
    flexDirection: "row",
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    marginLeft: 8,
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "800",
  },
});
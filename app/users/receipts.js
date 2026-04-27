import React, { useEffect, useMemo, useState } from "react";
import {
 
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StatusBar,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  onSnapshot,
  query,
  where,
  deleteDoc,
  doc,
} from "firebase/firestore";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system";

import { auth, db } from "../../config/firebase";

function toDate(value) {
  try {
    if (!value) return null;
    if (typeof value?.toDate === "function") return value.toDate();
    if (value?.seconds) return new Date(value.seconds * 1000);
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  } catch {
    return null;
  }
}

function formatDate(value) {
  const date = toDate(value);
  if (!date) return "No date";
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatCurrency(value) {
  return `£${Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getReceiptTotal(receipt) {
  return (
    receipt?.total ??
    receipt?.totalAmount ??
    receipt?.amount ??
    receipt?.grandTotal ??
    0
  );
}

function getReceiptTitle(receipt) {
  return (
    receipt?.title ||
    receipt?.receiptTitle ||
    receipt?.orderTitle ||
    "Payment Receipt"
  );
}

function getReceiptStatus(receipt) {
  return receipt?.status || receipt?.paymentStatus || "Completed";
}

function getReceiptDate(receipt) {
  return receipt?.createdAt || receipt?.date || receipt?.timestamp || null;
}

function getReceiptCustomer(receipt, fallbackUser) {
  return (
    receipt?.customerName ||
    receipt?.userName ||
    receipt?.buyerName ||
    fallbackUser?.displayName ||
    receipt?.email ||
    fallbackUser?.email ||
    "Customer"
  );
}

function buildReceiptHtml(receipt, fallbackUser) {
  const title = escapeHtml(getReceiptTitle(receipt));
  const status = escapeHtml(getReceiptStatus(receipt));
  const receiptId = escapeHtml(receipt?.id || "N/A");
  const customer = escapeHtml(getReceiptCustomer(receipt, fallbackUser));
  const email = escapeHtml(receipt?.email || fallbackUser?.email || "Not provided");
  const date = escapeHtml(formatDate(getReceiptDate(receipt)));
  const total = escapeHtml(formatCurrency(getReceiptTotal(receipt)));
  const subtotal = escapeHtml(
    formatCurrency(receipt?.subtotal ?? receipt?.subTotal ?? 0)
  );
  const delivery = escapeHtml(
    formatCurrency(receipt?.deliveryFee ?? receipt?.delivery ?? 0)
  );
  const paymentMethod = escapeHtml(
    receipt?.paymentMethod || receipt?.maskedCard || "Card"
  );

  const items = Array.isArray(receipt?.items) ? receipt.items : [];

  const itemsHtml =
    items.length > 0
      ? items
          .map((item, index) => {
            const name = escapeHtml(
              item?.name || item?.title || `Item ${index + 1}`
            );
            const qty = escapeHtml(item?.quantity || 1);
            const price = escapeHtml(
              formatCurrency(item?.price ?? item?.unitPrice ?? 0)
            );
            const lineTotal = escapeHtml(
              formatCurrency(
                item?.total ??
                  (Number(item?.price ?? item?.unitPrice ?? 0) *
                    Number(item?.quantity ?? 1))
              )
            );

            return `
              <tr>
                <td>${name}</td>
                <td style="text-align:center;">${qty}</td>
                <td style="text-align:right;">${price}</td>
                <td style="text-align:right;">${lineTotal}</td>
              </tr>
            `;
          })
          .join("")
      : `
        <tr>
          <td colspan="4" style="text-align:center; color:#6b7280;">No items listed</td>
        </tr>
      `;

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body {
            font-family: Arial, sans-serif;
            color: #111827;
            padding: 28px;
          }
          .header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 24px;
            border-bottom: 2px solid #e5e7eb;
            padding-bottom: 16px;
          }
          .brand {
            font-size: 28px;
            font-weight: bold;
            color: #111827;
          }
          .sub {
            color: #6b7280;
            margin-top: 4px;
          }
          .badge {
            display: inline-block;
            padding: 8px 14px;
            border-radius: 999px;
            background: #ecfdf5;
            color: #065f46;
            font-weight: bold;
            font-size: 12px;
          }
          .section {
            margin-top: 22px;
          }
          .section-title {
            font-size: 15px;
            font-weight: bold;
            margin-bottom: 12px;
            color: #111827;
          }
          .grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 12px;
          }
          .box {
            background: #f9fafb;
            border: 1px solid #e5e7eb;
            border-radius: 12px;
            padding: 12px;
          }
          .label {
            font-size: 11px;
            color: #6b7280;
            text-transform: uppercase;
            margin-bottom: 6px;
            letter-spacing: 0.4px;
          }
          .value {
            font-size: 14px;
            font-weight: 600;
            color: #111827;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 8px;
          }
          th, td {
            border-bottom: 1px solid #e5e7eb;
            padding: 12px 8px;
            font-size: 13px;
          }
          th {
            text-align: left;
            background: #f3f4f6;
          }
          .summary {
            margin-top: 18px;
            margin-left: auto;
            width: 300px;
          }
          .summary-row {
            display: flex;
            justify-content: space-between;
            padding: 8px 0;
            border-bottom: 1px solid #e5e7eb;
          }
          .summary-total {
            display: flex;
            justify-content: space-between;
            padding: 12px 0 0 0;
            font-size: 18px;
            font-weight: bold;
          }
          .footer {
            margin-top: 40px;
            color: #6b7280;
            font-size: 12px;
            text-align: center;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="brand">Receipt</div>
            <div class="sub">${title}</div>
          </div>
          <div class="badge">${status}</div>
        </div>

        <div class="grid">
          <div class="box">
            <div class="label">Receipt ID</div>
            <div class="value">${receiptId}</div>
          </div>
          <div class="box">
            <div class="label">Date</div>
            <div class="value">${date}</div>
          </div>
          <div class="box">
            <div class="label">Customer</div>
            <div class="value">${customer}</div>
          </div>
          <div class="box">
            <div class="label">Email</div>
            <div class="value">${email}</div>
          </div>
          <div class="box">
            <div class="label">Payment Method</div>
            <div class="value">${paymentMethod}</div>
          </div>
          <div class="box">
            <div class="label">Total</div>
            <div class="value">${total}</div>
          </div>
        </div>

        <div class="section">
          <div class="section-title">Items</div>
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th style="text-align:center;">Qty</th>
                <th style="text-align:right;">Price</th>
                <th style="text-align:right;">Total</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>
        </div>

        <div class="summary">
          <div class="summary-row">
            <span>Subtotal</span>
            <span>${subtotal}</span>
          </div>
          <div class="summary-row">
            <span>Delivery</span>
            <span>${delivery}</span>
          </div>
          <div class="summary-total">
            <span>Grand Total</span>
            <span>${total}</span>
          </div>
        </div>

        <div class="footer">
          Generated from your ArtLinker receipts
        </div>
      </body>
    </html>
  `;
}

export default function ReceiptsScreen() {
  const router = useRouter();

  const [currentUser, setCurrentUser] = useState(null);
  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedReceipt, setSelectedReceipt] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user || null);
    });
    return unsubscribe;
  }, []);

 useEffect(() => {
  if (!currentUser?.uid) {
    setReceipts([]);
    setLoading(false);
    return;
  }

  setLoading(true);

  const receiptsQuery = query(
    collection(db, "receipts"),
    where("userId", "==", currentUser.uid)
  );

  const unsubscribe = onSnapshot(
    receiptsQuery,
    (snapshot) => {
      const list = snapshot.docs
        .map((item) => ({
          id: item.id,
          ...item.data(),
        }))
        .sort((a, b) => {
          const aDate = toDate(a.createdAt || a.date || a.timestamp);
          const bDate = toDate(b.createdAt || b.date || b.timestamp);
          return (bDate?.getTime() || 0) - (aDate?.getTime() || 0);
        });

      setReceipts(list);
      setLoading(false);
    },
    (error) => {
      console.log("Receipts read error:", error);
      setLoading(false);
      Alert.alert("Error", "Could not load receipts. Check your Firestore rules.");
    }
  );

  return unsubscribe;
}, [currentUser?.uid]);

  const totalSpent = useMemo(() => {
    return receipts.reduce((sum, item) => sum + Number(getReceiptTotal(item) || 0), 0);
  }, [receipts]);

  async function createReceiptPdf(receipt) {
    const html = buildReceiptHtml(receipt, currentUser);
    const { uri } = await Print.printToFileAsync({
      html,
      base64: false,
    });

    const fileName = `receipt-${receipt?.id || Date.now()}.pdf`;
    const newPath = `${FileSystem.documentDirectory}${fileName}`;

    try {
      await FileSystem.copyAsync({
        from: uri,
        to: newPath,
      });
      return newPath;
    } catch {
      return uri;
    }
  }

  async function handleDownload(receipt) {
    try {
      setActionLoading(true);
      const fileUri = await createReceiptPdf(receipt);
      Alert.alert(
        "Receipt downloaded",
        `Your PDF receipt has been created successfully.\n\nSaved at:\n${fileUri}`
      );
    } catch (error) {
      console.log("Download receipt error:", error);
      Alert.alert("Error", "Could not download this receipt.");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleShare(receipt) {
    try {
      setActionLoading(true);

      const available = await Sharing.isAvailableAsync();
      if (!available) {
        Alert.alert("Unavailable", "Sharing is not available on this device.");
        return;
      }

      const fileUri = await createReceiptPdf(receipt);

      await Sharing.shareAsync(fileUri, {
        mimeType: "application/pdf",
        dialogTitle: "Share Receipt",
        UTI: "com.adobe.pdf",
      });
    } catch (error) {
      console.log("Share receipt error:", error);
      Alert.alert("Error", "Could not share this receipt.");
    } finally {
      setActionLoading(false);
    }
  }

  function handleDelete(receipt) {
    Alert.alert(
      "Delete receipt",
      "Are you sure you want to delete this receipt? This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              setActionLoading(true);
              await deleteDoc(doc(db, "receipts", receipt.id));
              if (selectedReceipt?.id === receipt.id) {
                setSelectedReceipt(null);
              }
              Alert.alert("Deleted", "Receipt deleted successfully.");
            } catch (error) {
              console.log("Delete receipt error:", error);
              Alert.alert("Error", "Could not delete this receipt.");
            } finally {
              setActionLoading(false);
            }
          },
        },
      ]
    );
  }

  function renderReceipt({ item }) {
    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.9}
        onPress={() => setSelectedReceipt(item)}
      >
        <View style={styles.cardHeader}>
          <View style={styles.iconBox}>
            <Ionicons name="receipt-outline" size={22} color="#0F172A" />
          </View>

          <View style={styles.cardHeaderText}>
            <Text style={styles.cardTitle} numberOfLines={1}>
              {getReceiptTitle(item)}
            </Text>
            <Text style={styles.cardDate}>{formatDate(getReceiptDate(item))}</Text>
          </View>

          <View style={styles.statusBadge}>
            <Text style={styles.statusText}>{getReceiptStatus(item)}</Text>
          </View>
        </View>

        <View style={styles.cardBody}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Receipt ID</Text>
            <Text style={styles.infoValue} numberOfLines={1}>
              {item.id}
            </Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Customer</Text>
            <Text style={styles.infoValue} numberOfLines={1}>
              {getReceiptCustomer(item, currentUser)}
            </Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>{formatCurrency(getReceiptTotal(item))}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <StatusBar
        barStyle="dark-content"
        backgroundColor="#F8FAFC"
        translucent={false}
      />

      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color="#0F172A" />
        </TouchableOpacity>

        <View style={styles.headerTextWrap}>
          <Text style={styles.headerTitle}>Receipts</Text>
          <Text style={styles.headerSubtitle}>
            {receipts.length} receipt{receipts.length === 1 ? "" : "s"} •{" "}
            {formatCurrency(totalSpent)}
          </Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color="#0F172A" />
          <Text style={styles.loadingText}>Loading receipts...</Text>
        </View>
      ) : !currentUser ? (
        <View style={styles.centerState}>
          <Ionicons name="person-circle-outline" size={64} color="#94A3B8" />
          <Text style={styles.emptyTitle}>You are not signed in</Text>
          <Text style={styles.emptyText}>Sign in to view your receipts.</Text>
        </View>
      ) : receipts.length === 0 ? (
        <View style={styles.centerState}>
          <Ionicons name="document-text-outline" size={64} color="#94A3B8" />
          <Text style={styles.emptyTitle}>No receipts found</Text>
          <Text style={styles.emptyText}>
            Your completed payment receipts will appear here.
          </Text>
        </View>
      ) : (
        <FlatList
          data={receipts}
          keyExtractor={(item) => item.id}
          renderItem={renderReceipt}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}

      <Modal
        visible={!!selectedReceipt}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedReceipt(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalTopBar} />

            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Receipt details</Text>
                <Text style={styles.modalSubtitle}>
                  Review, download, share or delete this receipt
                </Text>
              </View>

              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setSelectedReceipt(null)}
              >
                <Ionicons name="close" size={22} color="#0F172A" />
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 30 }}
            >
              {selectedReceipt && (
                <>
                  <View style={styles.detailCard}>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Title</Text>
                      <Text style={styles.detailValue}>
                        {getReceiptTitle(selectedReceipt)}
                      </Text>
                    </View>

                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Receipt ID</Text>
                      <Text style={styles.detailValue}>{selectedReceipt.id}</Text>
                    </View>

                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Date</Text>
                      <Text style={styles.detailValue}>
                        {formatDate(getReceiptDate(selectedReceipt))}
                      </Text>
                    </View>

                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Customer</Text>
                      <Text style={styles.detailValue}>
                        {getReceiptCustomer(selectedReceipt, currentUser)}
                      </Text>
                    </View>

                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Status</Text>
                      <Text style={[styles.detailValue, { color: "#059669" }]}>
                        {getReceiptStatus(selectedReceipt)}
                      </Text>
                    </View>

                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Payment</Text>
                      <Text style={styles.detailValue}>
                        {selectedReceipt?.paymentMethod ||
                          selectedReceipt?.maskedCard ||
                          "Card"}
                      </Text>
                    </View>

                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Subtotal</Text>
                      <Text style={styles.detailValue}>
                        {formatCurrency(
                          selectedReceipt?.subtotal ??
                            selectedReceipt?.subTotal ??
                            0
                        )}
                      </Text>
                    </View>

                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Delivery</Text>
                      <Text style={styles.detailValue}>
                        {formatCurrency(
                          selectedReceipt?.deliveryFee ??
                            selectedReceipt?.delivery ??
                            0
                        )}
                      </Text>
                    </View>

                    <View style={[styles.detailRow, styles.detailTotalRow]}>
                      <Text style={styles.detailTotalLabel}>Total</Text>
                      <Text style={styles.detailTotalValue}>
                        {formatCurrency(getReceiptTotal(selectedReceipt))}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.itemsCard}>
                    <Text style={styles.sectionTitle}>Items</Text>

                    {Array.isArray(selectedReceipt?.items) &&
                    selectedReceipt.items.length > 0 ? (
                      selectedReceipt.items.map((item, index) => (
                        <View key={`${item?.id || item?.name || index}`} style={styles.itemRow}>
                          <View style={{ flex: 1, paddingRight: 10 }}>
                            <Text style={styles.itemName}>
                              {item?.name || item?.title || `Item ${index + 1}`}
                            </Text>
                            <Text style={styles.itemMeta}>
                              Qty: {item?.quantity || 1}
                            </Text>
                          </View>
                          <Text style={styles.itemPrice}>
                            {formatCurrency(
                              item?.total ??
                                (Number(item?.price ?? item?.unitPrice ?? 0) *
                                  Number(item?.quantity ?? 1))
                            )}
                          </Text>
                        </View>
                      ))
                    ) : (
                      <Text style={styles.noItemsText}>No items listed</Text>
                    )}
                  </View>

                  <View style={styles.actionsRow}>
                    <TouchableOpacity
                      style={styles.actionButton}
                      onPress={() => handleDownload(selectedReceipt)}
                      disabled={actionLoading}
                    >
                      <Ionicons name="download-outline" size={20} color="#0F172A" />
                      <Text style={styles.actionButtonText}>Download</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.actionButton}
                      onPress={() => handleShare(selectedReceipt)}
                      disabled={actionLoading}
                    >
                      <Ionicons name="share-social-outline" size={20} color="#0F172A" />
                      <Text style={styles.actionButtonText}>Share</Text>
                    </TouchableOpacity>
                  </View>

                  <TouchableOpacity
                    style={styles.deleteButton}
                    onPress={() => handleDelete(selectedReceipt)}
                    disabled={actionLoading}
                  >
                    <Ionicons name="trash-outline" size={20} color="#FFFFFF" />
                    <Text style={styles.deleteButtonText}>Delete receipt</Text>
                  </TouchableOpacity>

                  {actionLoading && (
                    <View style={styles.actionLoadingRow}>
                      <ActivityIndicator size="small" color="#0F172A" />
                      <Text style={styles.actionLoadingText}>
                        Processing receipt...
                      </Text>
                    </View>
                  )}
                </>
              )}
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

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 18,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  headerTextWrap: {
    marginLeft: 14,
    flex: 1,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: "#0F172A",
  },
  headerSubtitle: {
    marginTop: 4,
    fontSize: 13,
    color: "#64748B",
    fontWeight: "500",
  },

  listContent: {
    paddingHorizontal: 18,
    paddingBottom: 30,
  },

  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#000",
    shadowOpacity: Platform.OS === "ios" ? 0.05 : 0,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  iconBox: {
    width: 50,
    height: 50,
    borderRadius: 16,
    backgroundColor: "#EEF2FF",
    alignItems: "center",
    justifyContent: "center",
  },
  cardHeaderText: {
    flex: 1,
    marginLeft: 12,
    paddingRight: 10,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0F172A",
  },
  cardDate: {
    marginTop: 4,
    fontSize: 13,
    color: "#64748B",
    fontWeight: "500",
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#ECFDF5",
  },
  statusText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#065F46",
  },

  cardBody: {
    marginTop: 16,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 8,
  },
  infoLabel: {
    fontSize: 13,
    color: "#64748B",
  },
  infoValue: {
    flex: 1,
    textAlign: "right",
    fontSize: 13,
    color: "#0F172A",
    fontWeight: "600",
  },
  divider: {
    height: 1,
    backgroundColor: "#E2E8F0",
    marginVertical: 8,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  totalLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
  },
  totalValue: {
    fontSize: 22,
    fontWeight: "800",
    color: "#0F172A",
  },

  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: "#64748B",
  },
  emptyTitle: {
    marginTop: 14,
    fontSize: 20,
    fontWeight: "800",
    color: "#0F172A",
  },
  emptyText: {
    marginTop: 8,
    fontSize: 14,
    color: "#64748B",
    textAlign: "center",
    lineHeight: 21,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(2,6,23,0.42)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: "90%",
    paddingHorizontal: 18,
    paddingTop: 10,
  },
  modalTopBar: {
    width: 54,
    height: 5,
    borderRadius: 999,
    backgroundColor: "#CBD5E1",
    alignSelf: "center",
    marginBottom: 14,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#0F172A",
  },
  modalSubtitle: {
    marginTop: 4,
    fontSize: 13,
    color: "#64748B",
  },
  closeButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },

  detailCard: {
    backgroundColor: "#F8FAFC",
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  detailLabel: {
    fontSize: 13,
    color: "#64748B",
    fontWeight: "600",
  },
  detailValue: {
    flex: 1,
    textAlign: "right",
    fontSize: 14,
    color: "#0F172A",
    fontWeight: "700",
  },
  detailTotalRow: {
    borderBottomWidth: 0,
    paddingTop: 14,
  },
  detailTotalLabel: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0F172A",
  },
  detailTotalValue: {
    fontSize: 20,
    fontWeight: "800",
    color: "#0F172A",
  },

  itemsCard: {
    marginTop: 16,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#0F172A",
    marginBottom: 10,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  itemName: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0F172A",
  },
  itemMeta: {
    marginTop: 4,
    fontSize: 12,
    color: "#64748B",
  },
  itemPrice: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0F172A",
  },
  noItemsText: {
    fontSize: 14,
    color: "#64748B",
  },

  actionsRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 18,
  },
  actionButton: {
    flex: 1,
    height: 54,
    borderRadius: 16,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  actionButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
  },

  deleteButton: {
    marginTop: 14,
    height: 56,
    borderRadius: 16,
    backgroundColor: "#DC2626",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  deleteButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
  },

  actionLoadingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 16,
    marginBottom: 10,
  },
  actionLoadingText: {
    fontSize: 13,
    color: "#64748B",
    fontWeight: "600",
  },
});
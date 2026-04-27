import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useStripe } from "@stripe/stripe-react-native";
import { getFunctions, httpsCallable } from "firebase/functions";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from "firebase/firestore";
import { auth, db } from "../../config/firebase";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

function formatMoney(value) {
  return `£${Number(value || 0).toFixed(2)}`;
}

function formatOrderNumber(id) {
  return `ART-${String(id || "").slice(0, 8).toUpperCase()}`;
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function buildReceiptHtml(payment) {
  const rows = (payment.items || [])
    .map(
      (item) => `
      <tr>
        <td>${item.title || "Item"}</td>
        <td>${item.quantity || 1}</td>
        <td>${formatMoney(item.price || 0)}</td>
        <td>${formatMoney((item.price || 0) * (item.quantity || 0))}</td>
      </tr>
    `
    )
    .join("");

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body { font-family: Arial, sans-serif; padding: 28px; color: #111827; }
          .brand { font-size: 30px; font-weight: 800; color: #4a63ff; }
          .title { margin-top: 8px; font-size: 22px; font-weight: 800; }
          .muted { color: #6B7280; font-size: 13px; margin-top: 4px; }
          .section { margin-top: 20px; }
          .label { font-weight: 700; }
          table { width: 100%; border-collapse: collapse; margin-top: 14px; }
          th, td { border: 1px solid #E5E7EB; padding: 10px; text-align: left; font-size: 14px; }
          th { background: #F9FAFB; }
          .total { margin-top: 18px; font-size: 18px; font-weight: 800; }
          .pill {
            display: inline-block;
            margin-top: 10px;
            padding: 6px 10px;
            background: #EEF2FF;
            color: #3730A3;
            border-radius: 999px;
            font-size: 12px;
            font-weight: 700;
          }
        </style>
      </head>
      <body>
        <div class="brand">ArtLinker</div>
        <div class="title">Payment Receipt</div>
        <div class="muted">Order Number: ${payment.orderNumber}</div>
        <div class="muted">Receipt ID: ${payment.receiptId || payment.paymentId}</div>
        <div class="muted">Payment ID: ${payment.paymentId}</div>
        <div class="muted">Stripe Payment Intent: ${payment.stripePaymentIntentId || "N/A"}</div>
        <div class="muted">Date: ${payment.createdAtLabel}</div>
        <div class="pill">Paid</div>

        <div class="section">
          <div><span class="label">Customer:</span> ${payment.fullName}</div>
          <div><span class="label">Email:</span> ${payment.email}</div>
          <div><span class="label">Payment Method:</span> ${payment.paymentMethodSummary}</div>
        </div>

        <div class="section">
          <div class="label">Items</div>
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Qty</th>
                <th>Unit Price</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>

        <div class="section">
          <div>Subtotal: ${formatMoney(payment.subtotal)}</div>
          <div class="total">Grand Total: ${formatMoney(payment.totalPrice)}</div>
        </div>
      </body>
    </html>
  `;
}

export default function PaymentScreen() {
  const router = useRouter();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();

  const [cartItems, setCartItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState(auth.currentUser?.email || "");
  const [providerDataMap, setProviderDataMap] = useState({});

  const downloadReceipt = async (receiptData) => {
    try {
      const html = buildReceiptHtml(receiptData);
      const file = await Print.printToFileAsync({ html });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri);
      } else {
        Alert.alert("Receipt Created", `Receipt saved at: ${file.uri}`);
      }
    } catch (error) {
      console.log("Receipt download error:", error);
      Alert.alert("Receipt Error", "Unable to create or share the receipt.");
    }
  };

  useEffect(() => {
    if (!auth.currentUser?.uid) {
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, "carts"),
      where("userId", "==", auth.currentUser.uid)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const items = snapshot.docs.map((cartDoc) => ({
          id: cartDoc.id,
          ...cartDoc.data(),
        }));
        setCartItems(items);
        setLoading(false);
      },
      (error) => {
        console.log("Payment cart load error:", error);
        setLoading(false);
        Alert.alert("Error", "Failed to load checkout items.");
      }
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const loadUserDetails = async () => {
      try {
        if (!auth.currentUser?.uid) return;

        const userSnap = await getDoc(doc(db, "users", auth.currentUser.uid));

        if (!userSnap.exists()) return;

        const userData = userSnap.data() || {};

        const savedFullName =
          userData.fullName || userData.name || userData.displayName || "";
        const savedEmail =
          userData.email || userData.mail || auth.currentUser.email || "";

        if (savedFullName) setFullName(savedFullName);
        if (savedEmail) setEmail(savedEmail);
      } catch (error) {
        console.log("User details load error:", error);
      }
    };

    loadUserDetails();
  }, []);

  useEffect(() => {
    const loadProviders = async () => {
      try {
        if (!cartItems.length) {
          setProviderDataMap({});
          return;
        }

        const uniqueProviderIds = [
          ...new Set(cartItems.map((item) => item.providerId).filter(Boolean)),
        ];

        const nextMap = {};

        for (const providerId of uniqueProviderIds) {
          const itemSample =
            cartItems.find((item) => item.providerId === providerId) || {};

          let dbData = {};

          try {
            const userSnap = await getDoc(doc(db, "users", providerId));
            if (userSnap.exists()) {
              dbData = userSnap.data() || {};
            }
          } catch (error) {
            console.log("Provider read error:", error);
          }

          nextMap[providerId] = {
            providerId,
            email: dbData.email || dbData.mail || itemSample.providerEmail || "",
            fullName: dbData.fullName || dbData.name || "",
            businessName: dbData.businessName || itemSample.providerName || "",
          };
        }

        setProviderDataMap(nextMap);
      } catch (error) {
        console.log("Provider load error:", error);
      }
    };

    loadProviders();
  }, [cartItems]);

  const totalItems = useMemo(() => {
    return cartItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  }, [cartItems]);

  const subtotal = useMemo(() => {
    return cartItems.reduce(
      (sum, item) =>
        sum + Number(item.price || 0) * Number(item.quantity || 0),
      0
    );
  }, [cartItems]);

  const groupedPreview = useMemo(() => {
    const grouped = {};

    for (const item of cartItems) {
      const providerId = item.providerId || "unknown_provider";
      if (!grouped[providerId]) grouped[providerId] = [];
      grouped[providerId].push(item);
    }

    return grouped;
  }, [cartItems]);

  const totalPrice = Number(subtotal.toFixed(2));

  const validateForm = () => {
    if (!auth.currentUser) {
      Alert.alert("Login Required", "Please log in to continue.");
      return false;
    }

    if (processing) {
      Alert.alert("Please Wait", "Payment is already being processed.");
      return false;
    }

    if (cartItems.length === 0) {
      Alert.alert("Cart Empty", "Your cart is empty.");
      return false;
    }

    if (!fullName.trim()) {
      Alert.alert("Missing Name", "Please enter your full name.");
      return false;
    }

    if (!isValidEmail(email)) {
      Alert.alert("Invalid Email", "Please enter a valid email address.");
      return false;
    }

    return true;
  };

  const handlePayment = async () => {
    try {
      if (!validateForm()) return;

      setProcessing(true);

      const user = auth.currentUser;
      if (!user?.uid) throw new Error("No authenticated user found.");

      const latestCartSnapshot = await getDocs(
        query(collection(db, "carts"), where("userId", "==", user.uid))
      );

      if (latestCartSnapshot.empty) {
        Alert.alert("Cart Empty", "Your cart is empty.");
        return;
      }

      const latestCartItems = latestCartSnapshot.docs.map((cartDoc) => ({
        id: cartDoc.id,
        ...cartDoc.data(),
      }));

      const latestSubtotal = latestCartItems.reduce(
        (sum, item) =>
          sum + Number(item.price || 0) * Number(item.quantity || 0),
        0
      );

      const latestTotalItems = latestCartItems.reduce(
        (sum, item) => sum + Number(item.quantity || 0),
        0
      );

      const latestTotalPrice = Number(latestSubtotal.toFixed(2));

      if (latestTotalPrice <= 0) {
        throw new Error("Invalid payment total.");
      }

      const itemsPayload = latestCartItems.map((item) => {
        const providerInfo = providerDataMap[item.providerId] || {};

        return {
          cartId: item.id,
          productId: item.productId || "",
          providerId: item.providerId || "",
          providerEmail: providerInfo.email || item.providerEmail || "",
          providerName:
            providerInfo.businessName ||
            providerInfo.fullName ||
            item.providerName ||
            "",
          title: item.title || "",
          itemType: item.itemType || "",
          price: Number(item.price || 0),
          quantity: Number(item.quantity || 0),
          totalPrice: Number(item.price || 0) * Number(item.quantity || 0),
          mediaUrl:
            Array.isArray(item.mediaUrls) && item.mediaUrls.length > 0
              ? item.mediaUrls[0]
              : item.mediaUrl || "",
          mediaUrls: Array.isArray(item.mediaUrls)
            ? item.mediaUrls.filter(Boolean)
            : item.mediaUrl
            ? [item.mediaUrl]
            : [],
        };
      });

      const providerIds = [
        ...new Set(itemsPayload.map((item) => item.providerId).filter(Boolean)),
      ];

      const paymentRef = doc(collection(db, "payments"));
      const receiptRef = doc(collection(db, "receipts"));
      const orderNumber = formatOrderNumber(paymentRef.id);

      const functions = getFunctions(undefined, "us-central1");
      const createPaymentIntent = httpsCallable(
        functions,
        "createPaymentIntent"
      );

      const stripeResponse = await createPaymentIntent({
        amount: Math.round(latestTotalPrice * 100),
        currency: "gbp",
        orderNumber,
      });

      const { clientSecret, paymentIntentId } = stripeResponse.data || {};

      if (!clientSecret || !paymentIntentId) {
        throw new Error("Stripe payment setup failed.");
      }

      const initResult = await initPaymentSheet({
        merchantDisplayName: "ArtLinker",
        paymentIntentClientSecret: clientSecret,
        defaultBillingDetails: {
          name: fullName.trim(),
          email: email.trim().toLowerCase(),
          address: {
            country: "GB",
          },
        },
      });

      if (initResult.error) {
        throw new Error(initResult.error.message);
      }

      const paymentResult = await presentPaymentSheet();

      if (paymentResult.error) {
        throw new Error(paymentResult.error.message);
      }

      const paymentPayload = {
        recordType: "customer_checkout",
        orderNumber,
        userId: user.uid,
        providerIds,
        providerId: providerIds.length === 1 ? providerIds[0] : null,
        fullName: fullName.trim(),
        email: email.trim().toLowerCase(),
        status: "Paid",
        currency: "GBP",
        paymentProvider: "stripe",
        stripePaymentIntentId: paymentIntentId,
        paymentMethodType: "stripe_payment_sheet",
        paymentMethodBrand: "Stripe",
        paymentMethodSummary: "Paid securely with Stripe",
        totalItems: latestTotalItems,
        subtotal: latestTotalPrice,
        deliveryFee: 0,
        totalPrice: latestTotalPrice,
        deliveryAddress: "",
        deliveryCoordinates: null,
        totalDistanceKm: 0,
        deliveryBreakdown: [],
        deliveryUsedFallback: false,
        items: itemsPayload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      const receiptPayload = {
        receiptId: receiptRef.id,
        paymentId: paymentRef.id,
        orderNumber,
        userId: user.uid,
        providerIds,
        providerId: providerIds.length === 1 ? providerIds[0] : null,
        fullName: fullName.trim(),
        email: email.trim().toLowerCase(),
        status: "Paid",
        currency: "GBP",
        paymentProvider: "stripe",
        stripePaymentIntentId: paymentIntentId,
        paymentMethodType: "stripe_payment_sheet",
        paymentMethodBrand: "Stripe",
        paymentMethodSummary: "Paid securely with Stripe",
        totalItems: latestTotalItems,
        subtotal: latestTotalPrice,
        deliveryFee: 0,
        totalPrice: latestTotalPrice,
        deliveryAddress: "",
        deliveryCoordinates: null,
        totalDistanceKm: 0,
        deliveryBreakdown: [],
        items: itemsPayload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      const batch = writeBatch(db);

      batch.set(paymentRef, paymentPayload);
      batch.set(receiptRef, receiptPayload);

      for (const providerId of providerIds) {
        const providerInfo = providerDataMap[providerId] || {};
        const providerItems = itemsPayload.filter(
          (item) => item.providerId === providerId
        );

        const providerSubtotal = providerItems.reduce(
          (sum, item) => sum + Number(item.totalPrice || 0),
          0
        );

        const providerTotalItems = providerItems.reduce(
          (sum, item) => sum + Number(item.quantity || 0),
          0
        );

        const providerPaymentRef = doc(collection(db, "payments"));

        batch.set(providerPaymentRef, {
          recordType: "provider_order",
          orderNumber,
          parentPaymentId: paymentRef.id,
          stripePaymentIntentId: paymentIntentId,
          paymentProvider: "stripe",
          userId: user.uid,
          providerId,
          providerEmail: providerInfo.email || "",
          providerName:
            providerInfo.businessName || providerInfo.fullName || providerId,
          fullName: fullName.trim(),
          email: email.trim().toLowerCase(),
          status: "Paid",
          currency: "GBP",
          totalItems: providerTotalItems,
          subtotal: Number(providerSubtotal.toFixed(2)),
          providerAmount: Number(providerSubtotal.toFixed(2)),
          deliveryFee: 0,
          totalAmount: Number(providerSubtotal.toFixed(2)),
          totalPrice: Number(providerSubtotal.toFixed(2)),
          deliveryAddress: "",
          deliveryCoordinates: null,
          providerAddress: "",
          providerCoords: null,
          distanceKm: 0,
          items: providerItems,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        const providerNotificationRef = doc(collection(db, "notifications"));

        batch.set(providerNotificationRef, {
          userId: providerId,
          senderId: user.uid,
          type: "new_order",
          title: "New Order Received",
          message: `${fullName.trim()} placed an order worth ${formatMoney(
            providerSubtotal
          )}.`,
          orderNumber,
          paymentId: paymentRef.id,
          receiptId: receiptRef.id,
          stripePaymentIntentId: paymentIntentId,
          buyerId: user.uid,
          buyerEmail: email.trim().toLowerCase(),
          providerId,
          providerEmail: providerInfo.email || "",
          read: false,
          createdAt: serverTimestamp(),
        });
      }

      const customerNotificationRef = doc(collection(db, "notifications"));

      batch.set(customerNotificationRef, {
        userId: user.uid,
        senderId: user.uid,
        type: "payment_success",
        title: "Payment Successful",
        message: `Your payment of ${formatMoney(
          latestTotalPrice
        )} was successful.`,
        orderNumber,
        paymentId: paymentRef.id,
        receiptId: receiptRef.id,
        stripePaymentIntentId: paymentIntentId,
        read: false,
        createdAt: serverTimestamp(),
      });

      latestCartSnapshot.docs.forEach((cartDoc) => {
        batch.delete(cartDoc.ref);
      });

      await batch.commit();

      const receiptData = {
        ...receiptPayload,
        paymentId: paymentRef.id,
        receiptId: receiptRef.id,
        orderNumber,
        createdAtLabel: new Date().toLocaleString(),
      };

      Alert.alert(
        "Payment Successful",
        `Your order ${orderNumber} has been placed successfully.`,
        [
          {
            text: "Download Receipt",
            onPress: async () => {
              await downloadReceipt(receiptData);
              router.replace("/users/shop");
            },
          },
          {
            text: "Done",
            onPress: () => {
              router.replace("/users/shop");
            },
          },
        ]
      );
    } catch (error) {
      console.log("PAYMENT ERROR:", error);
      Alert.alert(
        "Payment Failed",
        error?.message || "Something went wrong while processing payment."
      );
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={["top"]}>
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color="#4a63ff" />
          <Text style={styles.loadingText}>Loading checkout details...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!auth.currentUser) {
    return (
      <SafeAreaView style={styles.safeArea} edges={["top"]}>
        <View style={styles.emptyBox}>
          <Ionicons name="lock-closed-outline" size={52} color="#B0B6C3" />
          <Text style={styles.emptyTitle}>Please log in</Text>
          <Text style={styles.emptyText}>
            You need to be logged in before making a payment.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (cartItems.length === 0) {
    return (
      <SafeAreaView style={styles.safeArea} edges={["top"]}>
        <View style={styles.topBar}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Ionicons name="chevron-back" size={22} color="#111827" />
          </TouchableOpacity>
          <Text style={styles.topTitle}>Secure Checkout</Text>
          <View style={styles.placeholder} />
        </View>

        <View style={styles.emptyBox}>
          <Ionicons name="card-outline" size={56} color="#B0B6C3" />
          <Text style={styles.emptyTitle}>No items to pay for</Text>
          <Text style={styles.emptyText}>
            Add items to your cart before continuing to checkout.
          </Text>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => router.push("/users/shop")}
          >
            <Text style={styles.primaryButtonText}>Go to Shop</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <View style={styles.topBar}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Ionicons name="chevron-back" size={22} color="#111827" />
        </TouchableOpacity>

        <Text style={styles.topTitle}>Secure Checkout</Text>

        <View style={styles.placeholder} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.heroCard}>
          <View style={styles.heroLeft}>
            <View style={styles.heroIcon}>
              <Ionicons
                name="shield-checkmark-outline"
                size={20}
                color="#4a63ff"
              />
            </View>
            <View>
              <Text style={styles.heroTitle}>Secure Stripe Payment</Text>
              <Text style={styles.heroSubtitle}>
                Card details are handled securely by Stripe.
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Order Summary</Text>
            <View style={styles.pill}>
              <Text style={styles.pillText}>
                {totalItems} item{totalItems > 1 ? "s" : ""}
              </Text>
            </View>
          </View>

          {Object.keys(groupedPreview).map((providerId) => {
            const providerItems = groupedPreview[providerId] || [];
            const providerInfo = providerDataMap[providerId] || {};
            const providerName =
              providerInfo.businessName ||
              providerInfo.fullName ||
              providerId ||
              "Provider";

            return (
              <View key={providerId} style={styles.providerBox}>
                <Text style={styles.providerName}>{providerName}</Text>

                {providerItems.map((item) => (
                  <View key={item.id} style={styles.itemRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemTitle}>
                        {item.title || "Untitled Product"}
                      </Text>
                      <Text style={styles.itemMeta}>
                        Qty: {item.quantity || 1} • {item.itemType || "Item"}
                      </Text>
                    </View>

                    <Text style={styles.itemAmount}>
                      {formatMoney(
                        Number(item.price || 0) * Number(item.quantity || 0)
                      )}
                    </Text>
                  </View>
                ))}
              </View>
            );
          })}

          <View style={styles.divider} />

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Subtotal</Text>
            <Text style={styles.summaryValue}>{formatMoney(subtotal)}</Text>
          </View>

          <View style={styles.summaryTotalRow}>
            <Text style={styles.summaryTotalLabel}>Total</Text>
            <Text style={styles.summaryTotalValue}>
              {formatMoney(totalPrice)}
            </Text>
          </View>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Billing Details</Text>

          <Text style={styles.inputLabel}>Full name</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter your full name"
            value={fullName}
            onChangeText={setFullName}
            placeholderTextColor="#9CA3AF"
          />

          <Text style={styles.inputLabel}>Email address</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter your email address"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            placeholderTextColor="#9CA3AF"
          />
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.securityNote}>
            <Ionicons name="lock-closed-outline" size={16} color="#0F766E" />
            <Text style={styles.securityNoteText}>
              Your card details are entered inside Stripe PaymentSheet. ArtLinker
              does not store card numbers, expiry dates, or CVV codes.
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.payButton, processing && styles.disabledButton]}
          onPress={handlePayment}
          disabled={processing}
        >
          {processing ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Ionicons
                name="shield-checkmark-outline"
                size={18}
                color="#fff"
              />
              <Text style={styles.payButtonText}>
                Confirm & Pay {formatMoney(totalPrice)}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>

      {processing && (
        <View style={styles.processingOverlay}>
          <View style={styles.processingCard}>
            <ActivityIndicator size="large" color="#4a63ff" />
            <Text style={styles.processingTitle}>Processing Payment</Text>
            <Text style={styles.processingText}>
              Please wait while Stripe confirms your payment and your receipt is
              saved.
            </Text>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#F5F7FB" },
  topBar: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
    elevation: 2,
  },
  topTitle: { fontSize: 22, fontWeight: "800", color: "#111827" },
  placeholder: { width: 42 },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 32 },
  loadingBox: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText: {
    marginTop: 12,
    color: "#6B7280",
    fontSize: 14,
    fontWeight: "600",
  },
  emptyBox: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 28,
  },
  emptyTitle: {
    marginTop: 12,
    fontSize: 20,
    fontWeight: "800",
    color: "#111827",
  },
  emptyText: {
    marginTop: 8,
    textAlign: "center",
    fontSize: 13,
    lineHeight: 20,
    color: "#6B7280",
  },
  heroCard: {
    marginTop: 6,
    backgroundColor: "#EEF2FF",
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: "#DDE5FF",
  },
  heroLeft: { flexDirection: "row", alignItems: "center" },
  heroIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  heroTitle: { fontSize: 16, fontWeight: "800", color: "#111827" },
  heroSubtitle: {
    marginTop: 3,
    fontSize: 13,
    color: "#4B5563",
    fontWeight: "500",
  },
  sectionCard: {
    marginTop: 14,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 16,
    elevation: 2,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
    gap: 10,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 12,
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#EEF2FF",
  },
  pillText: { fontSize: 12, fontWeight: "800", color: "#3730A3" },
  providerBox: {
    marginBottom: 12,
    padding: 12,
    borderRadius: 14,
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#EEF2F7",
  },
  providerName: {
    fontSize: 13,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 6,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  itemTitle: { fontSize: 14, fontWeight: "700", color: "#111827" },
  itemMeta: { marginTop: 4, fontSize: 12, color: "#6B7280" },
  itemAmount: {
    fontSize: 14,
    fontWeight: "800",
    color: "#4a63ff",
    marginLeft: 10,
  },
  divider: {
    height: 1,
    backgroundColor: "#E5E7EB",
    marginVertical: 12,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  summaryTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 6,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },
  summaryLabel: { fontSize: 14, color: "#6B7280", fontWeight: "700" },
  summaryValue: { fontSize: 14, color: "#111827", fontWeight: "800" },
  summaryTotalLabel: {
    fontSize: 18,
    color: "#111827",
    fontWeight: "900",
  },
  summaryTotalValue: {
    fontSize: 22,
    color: "#4a63ff",
    fontWeight: "900",
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#374151",
    marginBottom: 6,
  },
  input: {
    height: 50,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 14,
    paddingHorizontal: 14,
    marginBottom: 12,
    backgroundColor: "#FAFAFB",
    color: "#111827",
    fontSize: 14,
  },
  payButton: {
    marginTop: 18,
    backgroundColor: "#4a63ff",
    borderRadius: 16,
    paddingVertical: 17,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    elevation: 4,
  },
  payButtonText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  disabledButton: { opacity: 0.65 },
  primaryButton: {
    marginTop: 18,
    backgroundColor: "#4a63ff",
    paddingHorizontal: 22,
    paddingVertical: 13,
    borderRadius: 14,
  },
  primaryButtonText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  securityNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "#ECFDF5",
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: "#D1FAE5",
  },
  securityNoteText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    color: "#065F46",
    fontWeight: "600",
  },
  processingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(17,24,39,0.35)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  processingCard: {
    width: "100%",
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 22,
    alignItems: "center",
  },
  processingTitle: {
    marginTop: 14,
    fontSize: 18,
    fontWeight: "800",
    color: "#111827",
  },
  processingText: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
    color: "#6B7280",
    fontWeight: "500",
  },
});
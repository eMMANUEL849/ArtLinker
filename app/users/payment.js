import React, { useEffect, useMemo, useState } from "react";
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
  addDoc,
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
import * as Location from "expo-location";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

function formatMoney(value) {
  return `£${Number(value || 0).toFixed(2)}`;
}

function maskCardNumber(value) {
  const clean = String(value || "").replace(/\s/g, "");
  if (clean.length < 4) return "****";
  return `**** **** **** ${clean.slice(-4)}`;
}

function sanitizeCardNumber(value) {
  const cleaned = String(value || "")
    .replace(/[^\d]/g, "")
    .slice(0, 16);
  const parts = cleaned.match(/.{1,4}/g);
  return parts ? parts.join(" ") : cleaned;
}

function sanitizeExpiry(value) {
  const cleaned = String(value || "")
    .replace(/[^\d]/g, "")
    .slice(0, 4);
  if (cleaned.length <= 2) return cleaned;
  return `${cleaned.slice(0, 2)}/${cleaned.slice(2)}`;
}

function toRad(value) {
  return (value * Math.PI) / 180;
}

function haversineDistanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function getCoordsFromAnySource(source) {
  const lat =
    source?.providerLat ??
    source?.shopLat ??
    source?.latitude ??
    source?.lat ??
    source?.location?.lat ??
    source?.location?.latitude ??
    source?.shopLocation?.lat ??
    source?.shopLocation?.latitude ??
    source?.coordinates?.lat ??
    source?.coordinates?.latitude ??
    source?.deliveryCoordinates?.lat ??
    source?.deliveryCoordinates?.latitude ??
    null;

  const lng =
    source?.providerLng ??
    source?.providerLon ??
    source?.providerLong ??
    source?.shopLng ??
    source?.shopLon ??
    source?.shopLong ??
    source?.longitude ??
    source?.lng ??
    source?.lon ??
    source?.long ??
    source?.location?.lng ??
    source?.location?.longitude ??
    source?.shopLocation?.lng ??
    source?.shopLocation?.longitude ??
    source?.coordinates?.lng ??
    source?.coordinates?.longitude ??
    source?.deliveryCoordinates?.lng ??
    source?.deliveryCoordinates?.longitude ??
    null;

  if (typeof lat !== "number" || typeof lng !== "number") return null;
  return { lat, lng };
}

function getAddressFromAnySource(source) {
  return (
    source?.address ||
    source?.deliveryAddress ||
    source?.providerAddress ||
    source?.shopAddress ||
    source?.businessAddress ||
    source?.fullAddress ||
    source?.location?.address ||
    source?.shopLocation?.address ||
    ""
  );
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

  const providerRows = (payment.deliveryBreakdown || [])
    .map(
      (provider) => `
      <tr>
        <td>${provider.providerName || provider.providerEmail || provider.providerId || "Provider"}</td>
        <td>${provider.distanceKm?.toFixed?.(2) ?? provider.distanceKm ?? 0} km</td>
        <td>${formatMoney(provider.fee || 0)}</td>
      </tr>
    `
    )
    .join("");

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body {
            font-family: Arial, sans-serif;
            padding: 24px;
            color: #111827;
          }
          .brand {
            font-size: 30px;
            font-weight: 800;
            color: #f06ce9;
          }
          .title {
            margin-top: 8px;
            font-size: 22px;
            font-weight: 800;
          }
          .muted {
            color: #6B7280;
            font-size: 13px;
            margin-top: 4px;
          }
          .section {
            margin-top: 20px;
          }
          .label {
            font-weight: 700;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 14px;
          }
          th, td {
            border: 1px solid #E5E7EB;
            padding: 10px;
            text-align: left;
            font-size: 14px;
          }
          th {
            background: #F9FAFB;
          }
          .total {
            margin-top: 18px;
            font-size: 18px;
            font-weight: 800;
          }
        </style>
      </head>
      <body>
        <div class="brand">ArtLinker</div>
        <div class="title">Payment Receipt</div>
        <div class="muted">Receipt ID: ${payment.paymentId}</div>
        <div class="muted">Date: ${payment.createdAtLabel}</div>

        <div class="section">
          <div><span class="label">Customer:</span> ${payment.fullName}</div>
          <div><span class="label">Email:</span> ${payment.email}</div>
          <div><span class="label">Payment Method:</span> ${payment.maskedCard}</div>
          <div><span class="label">Delivery Address:</span> ${payment.deliveryAddress}</div>
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
            <tbody>
              ${rows}
            </tbody>
          </table>
        </div>

        <div class="section">
          <div class="label">Delivery Breakdown</div>
          <table>
            <thead>
              <tr>
                <th>Provider</th>
                <th>Distance</th>
                <th>Delivery Fee</th>
              </tr>
            </thead>
            <tbody>
              ${providerRows}
            </tbody>
          </table>
        </div>

        <div class="section">
          <div>Subtotal: ${formatMoney(payment.subtotal)}</div>
          <div>Delivery: ${formatMoney(payment.deliveryFee)}</div>
          <div class="total">Grand Total: ${formatMoney(payment.totalPrice)}</div>
        </div>
      </body>
    </html>
  `;
}

export default function PaymentScreen() {
  const router = useRouter();

  const [cartItems, setCartItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState(auth.currentUser?.email || "");
  const [cardName, setCardName] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvv, setCvv] = useState("");

  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryCoords, setDeliveryCoords] = useState(null);
  const [deliveryLoading, setDeliveryLoading] = useState(true);

  const [providerLookupLoading, setProviderLookupLoading] = useState(false);
  const [providerDataMap, setProviderDataMap] = useState({});

  const resetFormAndScreen = () => {
    setCartItems([]);
    setCardName("");
    setCardNumber("");
    setExpiry("");
    setCvv("");
    setDeliveryAddress("");
    setDeliveryCoords(null);
    setProviderDataMap({});
    setFullName("");
    setEmail(auth.currentUser?.email || "");
  };

  useEffect(() => {
    if (!auth.currentUser) {
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
        const items = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
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
    const loadUserDeliveryAddress = async () => {
      try {
        if (!auth.currentUser?.uid) {
          setDeliveryLoading(false);
          return;
        }

        setDeliveryLoading(true);

        const userSnap = await getDoc(doc(db, "users", auth.currentUser.uid));

        if (!userSnap.exists()) {
          setDeliveryAddress("");
          setDeliveryCoords(null);
          setDeliveryLoading(false);
          return;
        }

        const userData = userSnap.data() || {};

        const savedFullName =
          userData.fullName || userData.name || userData.displayName || "";
        const savedEmail =
          userData.email || userData.mail || auth.currentUser.email || "";
        const savedAddress = getAddressFromAnySource(userData);
        let savedCoords = getCoordsFromAnySource(userData);

        if (savedFullName) {
          setFullName(savedFullName);
        }

        if (savedEmail) {
          setEmail(savedEmail);
        }

        setDeliveryAddress(savedAddress || "");

        if (!savedCoords && savedAddress) {
          try {
            const { status } = await Location.requestForegroundPermissionsAsync();

            if (status !== "granted") {
              console.log("Location permission not granted for geocoding");
              setDeliveryCoords(null);
              setDeliveryLoading(false);
              return;
            }

            const result = await Location.geocodeAsync(savedAddress);

            if (result?.length) {
              savedCoords = {
                lat: result[0].latitude,
                lng: result[0].longitude,
              };
            }
          } catch (error) {
            console.log("User address geocode error:", error);
          }
        }

        setDeliveryCoords(savedCoords || null);
      } catch (error) {
        console.log("User delivery load error:", error);
        setDeliveryAddress("");
        setDeliveryCoords(null);
      } finally {
        setDeliveryLoading(false);
      }
    };

    loadUserDeliveryAddress();
  }, []);

  useEffect(() => {
    const loadProviders = async () => {
      try {
        if (!cartItems.length) {
          setProviderDataMap({});
          return;
        }

        setProviderLookupLoading(true);

        const uniqueProviderIds = [
          ...new Set(cartItems.map((item) => item.providerId).filter(Boolean)),
        ];

        const nextMap = {};

        for (const providerId of uniqueProviderIds) {
          const relatedItems = cartItems.filter(
            (item) => item.providerId === providerId
          );
          const itemSample = relatedItems[0] || {};

          let dbData = {};
          try {
            const userSnap = await getDoc(doc(db, "users", providerId));
            if (userSnap.exists()) {
              dbData = userSnap.data() || {};
            }
          } catch (error) {
            console.log("Provider read error:", error);
          }

          let coords =
            getCoordsFromAnySource(dbData) || getCoordsFromAnySource(itemSample);

          const address =
            getAddressFromAnySource(dbData) ||
            getAddressFromAnySource(itemSample);

          if (!coords && address) {
            try {
              const result = await Location.geocodeAsync(address);
              if (result?.length) {
                coords = {
                  lat: result[0].latitude,
                  lng: result[0].longitude,
                };
              }
            } catch (error) {
              console.log("Provider geocode error:", providerId, error);
            }
          }

          nextMap[providerId] = {
            providerId,
            email: dbData.email || dbData.mail || itemSample.providerEmail || "",
            fullName: dbData.fullName || dbData.name || "",
            businessName: dbData.businessName || itemSample.providerName || "",
            address,
            coords,
          };
        }

        setProviderDataMap(nextMap);
      } catch (error) {
        console.log("Provider load error:", error);
      } finally {
        setProviderLookupLoading(false);
      }
    };

    loadProviders();
  }, [cartItems]);

  const totalItems = useMemo(() => {
    return cartItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  }, [cartItems]);

  const subtotal = useMemo(() => {
    return cartItems.reduce(
      (sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0),
      0
    );
  }, [cartItems]);

  const deliveryPreview = useMemo(() => {
    if (!deliveryCoords) {
      return {
        providers: [],
        totalDistanceKm: 0,
        deliveryFee: 0,
        usedFallback: false,
      };
    }

    const grouped = {};
    let usedFallback = false;

    for (const item of cartItems) {
      const providerId = item.providerId || "unknown_provider";
      if (!grouped[providerId]) {
        grouped[providerId] = [];
      }
      grouped[providerId].push(item);
    }

    const providers = Object.keys(grouped).map((providerId) => {
      const info = providerDataMap[providerId] || {};
      const coords = info.coords || null;

      let distanceKm = 0;
      let fee = 0;

      if (coords) {
        distanceKm = haversineDistanceKm(
          coords.lat,
          coords.lng,
          deliveryCoords.lat,
          deliveryCoords.lng
        );
        fee = 2.5 + distanceKm * 0.85;
      } else {
        usedFallback = true;
        distanceKm = 0;
        fee = 4.99;
      }

      return {
        providerId,
        providerEmail: info.email || "",
        providerName: info.businessName || info.fullName || providerId,
        providerAddress: info.address || "",
        providerCoords: coords,
        distanceKm: Number(distanceKm.toFixed(2)),
        fee: Number(fee.toFixed(2)),
      };
    });

    const totalDistanceKm = providers.reduce(
      (sum, provider) => sum + Number(provider.distanceKm || 0),
      0
    );

    const deliveryFee = providers.reduce(
      (sum, provider) => sum + Number(provider.fee || 0),
      0
    );

    return {
      providers,
      totalDistanceKm: Number(totalDistanceKm.toFixed(2)),
      deliveryFee: Number(deliveryFee.toFixed(2)),
      usedFallback,
    };
  }, [cartItems, deliveryCoords, providerDataMap]);

  const deliveryFee = deliveryPreview.deliveryFee;
  const totalPrice = subtotal + deliveryFee;

  const validateForm = () => {
    if (!auth.currentUser) {
      Alert.alert("Login Required", "Please log in to continue.");
      return false;
    }

    if (processing) {
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

    if (!email.trim()) {
      Alert.alert("Missing Email", "Please enter your email address.");
      return false;
    }

    if (!deliveryAddress.trim()) {
      Alert.alert(
        "Missing Delivery Address",
        "No delivery address was found on your user profile."
      );
      return false;
    }

    if (!deliveryCoords) {
      Alert.alert(
        "Invalid Delivery Address",
        "Your saved address could not be located. Please update your address in your profile."
      );
      return false;
    }

    if (!cardName.trim()) {
      Alert.alert("Missing Card Name", "Please enter the name on the card.");
      return false;
    }

    const cleanCard = cardNumber.replace(/\s/g, "");
    if (cleanCard.length !== 16) {
      Alert.alert(
        "Invalid Card Number",
        "Please enter a valid 16 digit card number."
      );
      return false;
    }

    if (expiry.length !== 5 || !expiry.includes("/")) {
      Alert.alert("Invalid Expiry", "Please enter expiry in MM/YY format.");
      return false;
    }

    if (cvv.length < 3) {
      Alert.alert("Invalid CVV", "Please enter a valid CVV.");
      return false;
    }

    return true;
  };

  const downloadReceipt = async (paymentData) => {
    try {
      const html = buildReceiptHtml(paymentData);
      const file = await Print.printToFileAsync({ html });

      const canShare = await Sharing.isAvailableAsync();

      if (canShare) {
        await Sharing.shareAsync(file.uri, {
          mimeType: "application/pdf",
          dialogTitle: "Download Receipt",
          UTI: "com.adobe.pdf",
        });
      } else {
        Alert.alert("Receipt Ready", `Receipt saved at ${file.uri}`);
      }
    } catch (error) {
      console.log("Receipt error:", error);
      Alert.alert("Error", "Failed to create receipt.");
    }
  };

  const handlePayment = async () => {
    try {
      if (!validateForm()) return;

      setProcessing(true);

      const user = auth.currentUser;

      const itemsPayload = cartItems.map((item) => {
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
          providerAddress: providerInfo.address || "",
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
          providerCoords: providerInfo.coords || null,
        };
      });

      const deliveryBreakdown = deliveryPreview.providers.map((provider) => ({
        providerId: provider.providerId,
        providerEmail: provider.providerEmail || "",
        providerName: provider.providerName || "",
        providerAddress: provider.providerAddress || "",
        providerCoords: provider.providerCoords || null,
        distanceKm: Number(provider.distanceKm || 0),
        fee: Number(provider.fee || 0),
      }));

      const providerIds = [
        ...new Set(itemsPayload.map((item) => item.providerId).filter(Boolean)),
      ];

      const paymentPayload = {
        recordType: "customer_checkout",
        userId: user.uid,
        providerIds,
        providerId: providerIds.length === 1 ? providerIds[0] : null,
        fullName: fullName.trim(),
        email: email.trim(),
        cardName: cardName.trim(),
        maskedCard: maskCardNumber(cardNumber),
        status: "Paid",
        currency: "GBP",
        totalItems,
        subtotal: Number(subtotal.toFixed(2)),
        deliveryFee: Number(deliveryFee.toFixed(2)),
        totalPrice: Number(totalPrice.toFixed(2)),
        deliveryAddress: deliveryAddress.trim(),
        deliveryCoordinates: deliveryCoords,
        totalDistanceKm: deliveryPreview.totalDistanceKm,
        deliveryBreakdown,
        deliveryUsedFallback: deliveryPreview.usedFallback,
        items: itemsPayload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      const paymentRef = await addDoc(collection(db, "payments"), paymentPayload);

      for (const provider of deliveryBreakdown) {
        const providerItems = itemsPayload.filter(
          (item) => item.providerId === provider.providerId
        );

        const providerSubtotal = providerItems.reduce(
          (sum, item) => sum + Number(item.totalPrice || 0),
          0
        );

        const providerTotalItems = providerItems.reduce(
          (sum, item) => sum + Number(item.quantity || 0),
          0
        );

        await addDoc(collection(db, "payments"), {
          recordType: "provider_order",
          parentPaymentId: paymentRef.id,
          userId: user.uid,
          providerId: provider.providerId || "",
          providerEmail: provider.providerEmail || "",
          providerName: provider.providerName || "",
          fullName: fullName.trim(),
          email: email.trim(),
          status: "Paid",
          currency: "GBP",
          totalItems: providerTotalItems,
          subtotal: Number(providerSubtotal.toFixed(2)),
          providerAmount: Number(providerSubtotal.toFixed(2)),
          deliveryFee: Number((provider.fee || 0).toFixed(2)),
          totalAmount: Number((providerSubtotal + Number(provider.fee || 0)).toFixed(2)),
          totalPrice: Number((providerSubtotal + Number(provider.fee || 0)).toFixed(2)),
          deliveryAddress: deliveryAddress.trim(),
          deliveryCoordinates: deliveryCoords,
          providerAddress: provider.providerAddress || "",
          providerCoords: provider.providerCoords || null,
          distanceKm: Number(provider.distanceKm || 0),
          items: providerItems,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      await addDoc(collection(db, "notifications"), {
        userId: user.uid,
        senderId: user.uid,
        type: "payment_success",
        title: "Payment Successful",
        message: `Your payment of ${formatMoney(totalPrice)} was successful.`,
        paymentId: paymentRef.id,
        read: false,
        createdAt: serverTimestamp(),
      });

      for (const provider of deliveryBreakdown) {
        const providerItems = itemsPayload.filter(
          (item) => item.providerId === provider.providerId
        );

        const providerAmount = providerItems.reduce(
          (sum, item) => sum + Number(item.totalPrice || 0),
          0
        );

        if (provider.providerId) {
          await addDoc(collection(db, "notifications"), {
            userId: provider.providerId,
            senderId: user.uid,
            type: "new_order",
            title: "New Order Received",
            message: `${fullName.trim()} placed an order worth ${formatMoney(
              providerAmount
            )}. Delivery fee: ${formatMoney(provider.fee)}.`,
            paymentId: paymentRef.id,
            buyerId: user.uid,
            buyerEmail: email.trim(),
            providerId: provider.providerId,
            providerEmail: provider.providerEmail || "",
            providerAddress: provider.providerAddress || "",
            deliveryAddress: deliveryAddress.trim(),
            read: false,
            createdAt: serverTimestamp(),
          });
        }
      }

      const cartSnapshot = await getDocs(
        query(collection(db, "carts"), where("userId", "==", user.uid))
      );

      const batch = writeBatch(db);
      cartSnapshot.docs.forEach((cartDoc) => {
        batch.delete(cartDoc.ref);
      });
      await batch.commit();

      const receiptData = {
        ...paymentPayload,
        paymentId: paymentRef.id,
        createdAtLabel: new Date().toLocaleString(),
      };

      Alert.alert("Payment Successful", "Your order has been placed.", [
        {
          text: "Download Receipt",
          onPress: async () => {
            await downloadReceipt(receiptData);
            resetFormAndScreen();
          },
        },
        {
          text: "OK",
          onPress: () => {
            resetFormAndScreen();
          },
        },
      ]);
    } catch (error) {
      console.log("Payment error:", error);
      Alert.alert("Error", error.message || "Failed to process payment.");
    } finally {
      setProcessing(false);
    }
  };

  if (loading || deliveryLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color="#4a63ff" />
          <Text style={styles.loadingText}>Loading payment details...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!auth.currentUser) {
    return (
      <SafeAreaView style={styles.safeArea}>
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
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.topBar}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Ionicons name="chevron-back" size={22} color="#111827" />
          </TouchableOpacity>
          <Text style={styles.topTitle}>Payment</Text>
          <View style={styles.placeholder} />
        </View>

        <View style={styles.emptyBox}>
          <Ionicons name="card-outline" size={56} color="#B0B6C3" />
          <Text style={styles.emptyTitle}>No items to pay for</Text>
          <Text style={styles.emptyText}>
            Add items to your cart before continuing to payment.
          </Text>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => router.push("/(users)/shop")}
          >
            <Text style={styles.primaryButtonText}>Go to Shop</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color="#111827" />
        </TouchableOpacity>

        <Text style={styles.topTitle}>Payment</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Order Summary</Text>

          {cartItems.map((item) => (
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

          <View style={styles.divider} />

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Items</Text>
            <Text style={styles.summaryValue}>{totalItems}</Text>
          </View>

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Subtotal</Text>
            <Text style={styles.summaryValue}>{formatMoney(subtotal)}</Text>
          </View>

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Delivery</Text>
            <Text style={styles.summaryValue}>{formatMoney(deliveryFee)}</Text>
          </View>

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Distance</Text>
            <Text style={styles.summaryValue}>
              {deliveryCoords
                ? `${deliveryPreview.totalDistanceKm.toFixed(2)} km`
                : "No saved address"}
            </Text>
          </View>

          <View style={styles.summaryRow}>
            <Text style={styles.summaryTotalLabel}>Total</Text>
            <Text style={styles.summaryTotalValue}>{formatMoney(totalPrice)}</Text>
          </View>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Billing Details</Text>

          <TextInput
            style={styles.input}
            placeholder="Full name"
            value={fullName}
            onChangeText={setFullName}
            placeholderTextColor="#9CA3AF"
          />

          <TextInput
            style={styles.input}
            placeholder="Email address"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            placeholderTextColor="#9CA3AF"
          />
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Delivery Address</Text>

          <View style={styles.readOnlyBox}>
            <Ionicons name="location-outline" size={18} color="#4a63ff" />
            <Text style={styles.readOnlyText}>
              {deliveryAddress || "No delivery address found on your profile."}
            </Text>
          </View>

          {deliveryCoords ? (
            <Text style={styles.deliveryInfoText}>
              Delivery distance: {deliveryPreview.totalDistanceKm.toFixed(2)} km
              {"\n"}
              Delivery fee: {formatMoney(deliveryFee)}
            </Text>
          ) : (
            <Text style={styles.warningText}>
              Your saved address could not be located. Update your address in your
              profile before paying.
            </Text>
          )}

          {providerLookupLoading && (
            <Text style={styles.deliveryInfoText}>
              Loading service provider address...
            </Text>
          )}

          {deliveryCoords && deliveryPreview.providers.length > 0 && (
            <View style={styles.breakdownBox}>
              <Text style={styles.breakdownTitle}>Provider Delivery Breakdown</Text>

              {deliveryPreview.providers.map((provider) => (
                <Text key={provider.providerId} style={styles.breakdownText}>
                  {provider.providerName || provider.providerId} •{" "}
                  {provider.distanceKm.toFixed(2)} km • {formatMoney(provider.fee)}
                </Text>
              ))}

              {deliveryPreview.usedFallback && (
                <Text style={styles.fallbackText}>
                  Some providers do not have a saved address or coordinates, so a
                  fallback delivery fee was used.
                </Text>
              )}
            </View>
          )}
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Card Details</Text>

          <TextInput
            style={styles.input}
            placeholder="Name on card"
            value={cardName}
            onChangeText={setCardName}
            placeholderTextColor="#9CA3AF"
          />

          <TextInput
            style={styles.input}
            placeholder="Card number"
            value={cardNumber}
            onChangeText={(value) => setCardNumber(sanitizeCardNumber(value))}
            keyboardType={Platform.OS === "ios" ? "number-pad" : "numeric"}
            maxLength={19}
            placeholderTextColor="#9CA3AF"
          />

          <View style={styles.row}>
            <TextInput
              style={[styles.input, styles.halfInput]}
              placeholder="MM/YY"
              value={expiry}
              onChangeText={(value) => setExpiry(sanitizeExpiry(value))}
              keyboardType={Platform.OS === "ios" ? "number-pad" : "numeric"}
              maxLength={5}
              placeholderTextColor="#9CA3AF"
            />

            <TextInput
              style={[styles.input, styles.halfInput]}
              placeholder="CVV"
              value={cvv}
              onChangeText={(value) =>
                setCvv(String(value || "").replace(/[^\d]/g, "").slice(0, 4))
              }
              keyboardType={Platform.OS === "ios" ? "number-pad" : "numeric"}
              secureTextEntry
              maxLength={4}
              placeholderTextColor="#9CA3AF"
            />
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
              <Ionicons name="card-outline" size={18} color="#fff" />
              <Text style={styles.payButtonText}>Pay {formatMoney(totalPrice)}</Text>
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
    backgroundColor: "#F7F8FC",
  },
  topBar: {
    paddingHorizontal: 14,
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
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
  },
  topTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#111827",
  },
  placeholder: {
    width: 42,
  },
  scrollContent: {
    paddingHorizontal: 14,
    paddingBottom: 30,
  },
  loadingBox: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 10,
    color: "#6B7280",
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
    lineHeight: 18,
    color: "#6B7280",
  },
  sectionCard: {
    marginTop: 14,
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 14,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 12,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
  },
  itemMeta: {
    marginTop: 4,
    fontSize: 12,
    color: "#6B7280",
  },
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
  summaryLabel: {
    fontSize: 14,
    color: "#6B7280",
    fontWeight: "700",
  },
  summaryValue: {
    fontSize: 14,
    color: "#111827",
    fontWeight: "800",
  },
  summaryTotalLabel: {
    fontSize: 18,
    color: "#111827",
    fontWeight: "900",
  },
  summaryTotalValue: {
    fontSize: 20,
    color: "#4a63ff",
    fontWeight: "900",
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 14,
    paddingHorizontal: 14,
    marginBottom: 12,
    backgroundColor: "#FAFAFB",
    color: "#111827",
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
  },
  halfInput: {
    flex: 1,
  },
  payButton: {
    marginTop: 18,
    backgroundColor: "#4a63ff",
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  payButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "800",
  },
  disabledButton: {
    opacity: 0.7,
  },
  primaryButton: {
    marginTop: 18,
    backgroundColor: "#4a63ff",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 14,
  },
  primaryButtonText: {
    color: "#fff",
    fontWeight: "800",
  },
  deliveryInfoText: {
    marginTop: 12,
    fontSize: 13,
    lineHeight: 19,
    color: "#374151",
    fontWeight: "600",
  },
  warningText: {
    marginTop: 12,
    fontSize: 13,
    lineHeight: 19,
    color: "#B45309",
    fontWeight: "700",
  },
  readOnlyBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 12,
  },
  readOnlyText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    color: "#111827",
    fontWeight: "600",
  },
  breakdownBox: {
    marginTop: 12,
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    padding: 10,
  },
  breakdownTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 6,
  },
  breakdownText: {
    fontSize: 12,
    color: "#4B5563",
    marginBottom: 4,
  },
  fallbackText: {
    marginTop: 8,
    fontSize: 12,
    color: "#B45309",
    fontWeight: "600",
  },
});
import React, { useEffect, useMemo, useState } from "react";
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { auth, db } from "../../config/firebase";

export default function CartScreen() {
  const router = useRouter();
  const [cartItems, setCartItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState("");

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
        console.log("Cart load error:", error);
        setLoading(false);
        Alert.alert("Error", "Failed to load cart.");
      }
    );

    return () => unsubscribe();
  }, []);

  const totalItems = useMemo(() => {
    return cartItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  }, [cartItems]);

  const totalPrice = useMemo(() => {
    return cartItems.reduce(
      (sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0),
      0
    );
  }, [cartItems]);

  const removeFromCart = async (item) => {
    try {
      setWorkingId(item.id);

      const cartRef = doc(db, "carts", item.id);
      await deleteDoc(cartRef);

      Alert.alert("Removed", "Item removed from cart.");
    } catch (error) {
      console.log("Remove cart error:", error);
      Alert.alert("Error", error.message || "Failed to remove item.");
    } finally {
      setWorkingId("");
    }
  };

  const handleCheckout = () => {
    if (cartItems.length === 0) {
      Alert.alert("Cart Empty", "Add items to your cart before checkout.");
      return;
    }

    router.push("/users/payment");
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color="#111827" />
        </TouchableOpacity>

        <View>
          <Text style={styles.topTitle}>My Cart</Text>
          <Text style={styles.topSub}>{totalItems} item(s)</Text>
        </View>

        <View style={styles.placeholder} />
      </View>

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color="#4a63ff" />
          <Text style={styles.loadingText}>Loading cart...</Text>
        </View>
      ) : cartItems.length === 0 ? (
        <View style={styles.emptyBox}>
          <Ionicons name="cart-outline" size={56} color="#b5b8c3" />
          <Text style={styles.emptyTitle}>Your cart is empty</Text>
          <Text style={styles.emptyText}>
            Add products from the shop to see them here.
          </Text>

          <TouchableOpacity
            style={styles.shopButton}
            onPress={() => router.push("/users/shop")}
          >
            <Text style={styles.shopButtonText}>Go to Shop</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            {cartItems.map((item) => {
              const image =
                Array.isArray(item.mediaUrls) && item.mediaUrls.length > 0
                  ? item.mediaUrls[0]
                  : item.mediaUrl ||
                    "https://via.placeholder.com/400x300.png?text=No+Image";

              return (
                <View key={item.id} style={styles.cartCard}>
                  <Image
                    source={{ uri: image }}
                    style={styles.cartImage}
                    resizeMode="contain"
                  />

                  <View style={styles.cartInfo}>
                    <Text style={styles.itemType}>{item.itemType || "Item"}</Text>
                    <Text style={styles.itemTitle}>
                      {item.title || "Untitled Product"}
                    </Text>

                    <View style={styles.infoRow}>
                      <Text style={styles.infoText}>Qty: {item.quantity || 1}</Text>
                      {!!item.size && (
                        <Text style={styles.infoText}>Size: {item.size}</Text>
                      )}
                    </View>

                    <Text style={styles.itemPrice}>
                      £
                      {(
                        Number(item.price || 0) * Number(item.quantity || 0)
                      ).toFixed(2)}
                    </Text>

                    <TouchableOpacity
                      style={styles.removeButton}
                      onPress={() => removeFromCart(item)}
                      disabled={workingId === item.id}
                    >
                      {workingId === item.id ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <>
                          <Ionicons name="trash-outline" size={16} color="#fff" />
                          <Text style={styles.removeButtonText}>Remove</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </ScrollView>

          <View style={styles.summaryBox}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Items</Text>
              <Text style={styles.summaryValue}>{totalItems}</Text>
            </View>

            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Total</Text>
              <Text style={styles.summaryTotal}>£{totalPrice.toFixed(2)}</Text>
            </View>

            <TouchableOpacity
              style={styles.checkoutButton}
              onPress={handleCheckout}
            >
              <Text style={styles.checkoutButtonText}>Proceed to Checkout</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f7f8fc",
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
    textAlign: "center",
  },
  topSub: {
    marginTop: 2,
    fontSize: 12,
    color: "#8a8f99",
    textAlign: "center",
  },
  placeholder: {
    width: 42,
  },
  loadingBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    marginTop: 10,
    color: "#7d828d",
  },
  emptyBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 30,
  },
  emptyTitle: {
    marginTop: 14,
    fontSize: 20,
    fontWeight: "800",
    color: "#22262f",
  },
  emptyText: {
    marginTop: 8,
    fontSize: 13,
    color: "#8b909c",
    textAlign: "center",
    lineHeight: 18,
  },
  shopButton: {
    marginTop: 18,
    backgroundColor: "#4a63ff",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 14,
  },
  shopButtonText: {
    color: "#fff",
    fontWeight: "800",
  },
  scrollContent: {
    paddingHorizontal: 14,
    paddingBottom: 150,
  },
  cartCard: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 12,
    marginBottom: 14,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  cartImage: {
    width: 110,
    height: 110,
    borderRadius: 14,
    backgroundColor: "#f4f5f9",
  },
  cartInfo: {
    flex: 1,
    marginLeft: 12,
    justifyContent: "space-between",
  },
  itemType: {
    alignSelf: "flex-start",
    backgroundColor: "#eef1ff",
    color: "#4a63ff",
    fontSize: 11,
    fontWeight: "800",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    overflow: "hidden",
    marginBottom: 6,
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#1c1f28",
  },
  infoRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 6,
  },
  infoText: {
    marginRight: 12,
    fontSize: 12,
    color: "#666c78",
    fontWeight: "600",
  },
  itemPrice: {
    marginTop: 8,
    fontSize: 18,
    fontWeight: "900",
    color: "#4a63ff",
  },
  removeButton: {
    marginTop: 10,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#111827",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  removeButtonText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 12,
  },
  summaryBox: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#fff",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 24,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: -3 },
    elevation: 8,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  summaryLabel: {
    fontSize: 14,
    color: "#6d7380",
    fontWeight: "700",
  },
  summaryValue: {
    fontSize: 14,
    color: "#1a1f28",
    fontWeight: "800",
  },
  summaryTotal: {
    fontSize: 22,
    color: "#4a63ff",
    fontWeight: "900",
  },
  checkoutButton: {
    marginTop: 14,
    backgroundColor: "#4a63ff",
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
  },
  checkoutButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "800",
  },
});
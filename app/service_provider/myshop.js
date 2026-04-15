import React, { useEffect, useMemo, useState } from "react";
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
  Dimensions,
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

const { width } = Dimensions.get("window");
const CARD_WIDTH = width - 28;

function getStockState(stock) {
  const value = Number(stock || 0);

  if (value <= 0) {
    return {
      label: "Out of Stock",
      text: "Out of stock",
      bg: "#FEF2F2",
      color: "#DC2626",
      icon: "close-circle-outline",
    };
  }

  if (value <= 5) {
    return {
      label: "Low Stock",
      text: `Low stock: ${value}`,
      bg: "#FFF7ED",
      color: "#EA580C",
      icon: "alert-circle-outline",
    };
  }

  return {
    label: "In Stock",
    text: `Stock: ${value}`,
    bg: "#EEFDF3",
    color: "#16A34A",
    icon: "checkmark-circle-outline",
  };
}

function MyProductCard({ item, deleting, onDelete, onEdit }) {
  const [activeImage, setActiveImage] = useState(0);

  const images = useMemo(() => {
    if (Array.isArray(item.mediaUrls) && item.mediaUrls.length > 0) {
      return item.mediaUrls.filter(Boolean);
    }
    if (item.mediaUrl) {
      return [item.mediaUrl];
    }
    return ["https://via.placeholder.com/800x600.png?text=No+Image"];
  }, [item]);

  const stockInfo = useMemo(() => getStockState(item.stock), [item.stock]);

  const handleImageScroll = (event) => {
    const x = event.nativeEvent.contentOffset.x;
    const index = Math.round(x / (CARD_WIDTH - 24));
    setActiveImage(index);
  };

  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <View style={styles.typeBadge}>
          <Text style={styles.typeBadgeText}>{item.itemType || "Item"}</Text>
        </View>

        <View style={[styles.stockBadge, { backgroundColor: stockInfo.bg }]}>
          <Ionicons name={stockInfo.icon} size={14} color={stockInfo.color} />
          <Text style={[styles.stockBadgeText, { color: stockInfo.color }]}>
            {stockInfo.text}
          </Text>
        </View>
      </View>

      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleImageScroll}
        style={styles.imageSlider}
      >
        {images.map((img, index) => (
          <View key={`${item.id}-${index}`} style={styles.imageSlide}>
            <Image
              source={{ uri: img }}
              style={styles.cardImage}
              resizeMode="contain"
            />
          </View>
        ))}
      </ScrollView>

      {images.length > 1 && (
        <View style={styles.dotsRow}>
          {images.map((_, index) => (
            <View
              key={index}
              style={[styles.dot, activeImage === index && styles.activeDot]}
            />
          ))}
        </View>
      )}

      <View style={styles.cardBody}>
        <View style={styles.titleRow}>
          <Text style={styles.cardTitle}>{item.title || "Untitled Product"}</Text>
          <View
            style={[
              styles.stockStatusPill,
              {
                backgroundColor: stockInfo.bg,
                borderColor: stockInfo.color + "22",
              },
            ]}
          >
            <Text style={[styles.stockStatusText, { color: stockInfo.color }]}>
              {stockInfo.label}
            </Text>
          </View>
        </View>

        {!!item.description && (
          <Text style={styles.cardDescription} numberOfLines={3}>
            {item.description}
          </Text>
        )}

        <View style={styles.metaRow}>
          {!!item.size && <Text style={styles.metaText}>Size: {item.size}</Text>}
          {!!item.brand && <Text style={styles.metaText}>Brand: {item.brand}</Text>}
          {!!item.color && <Text style={styles.metaText}>Color: {item.color}</Text>}
          {!!item.material && (
            <Text style={styles.metaText}>Material: {item.material}</Text>
          )}
        </View>

        <View style={styles.footerRow}>
          <View>
            <Text style={styles.priceText}>£{Number(item.price || 0).toFixed(2)}</Text>
            <Text style={styles.stockHintText}>
              This updates automatically when a user buys the product
            </Text>
          </View>

          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.editButton} onPress={() => onEdit(item)}>
              <Ionicons name="create-outline" size={16} color="#111827" />
              <Text style={styles.editButtonText}>Edit</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.deleteButton, deleting && styles.disabledButton]}
              onPress={() => onDelete(item)}
              disabled={deleting}
            >
              {deleting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="trash-outline" size={16} color="#fff" />
                  <Text style={styles.deleteButtonText}>Delete</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
}

export default function MyShopScreen() {
  const router = useRouter();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState("");

  useEffect(() => {
    if (!auth.currentUser) {
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, "shops"),
      where("providerId", "==", auth.currentUser.uid)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const items = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }));

        items.sort((a, b) => {
          const aTime = a.createdAt?.seconds || 0;
          const bTime = b.createdAt?.seconds || 0;
          return bTime - aTime;
        });

        setProducts(items);
        setLoading(false);
      },
      (error) => {
        console.log("My shop load error:", error);
        setLoading(false);
        Alert.alert("Error", "Failed to load your shop items.");
      }
    );

    return () => unsubscribe();
  }, []);

  const handleDelete = (item) => {
    Alert.alert(
      "Delete Product",
      `Are you sure you want to delete "${item.title || "this product"}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              setDeletingId(item.id);
              await deleteDoc(doc(db, "shops", item.id));
              Alert.alert("Deleted", "Product deleted successfully.");
            } catch (error) {
              console.log("Delete product error:", error);
              Alert.alert("Error", "Failed to delete product.");
            } finally {
              setDeletingId("");
            }
          },
        },
      ]
    );
  };

  const handleEdit = (item) => {
    router.push({
      pathname: "/service_provider/editshop",
      params: { id: item.id },
    });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <View>
          <Text style={styles.logo}>ArtLinker</Text>
          <Text style={styles.headerSub}>Manage your shop products</Text>
        </View>

        <TouchableOpacity
          style={styles.addButton}
          onPress={() => router.push("/service_provider/upload")}
        >
          <Ionicons name="add" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      <Text style={styles.heading}>My Shop</Text>
      <Text style={styles.subheading}>
        View, manage and update the products you have uploaded
      </Text>

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color="#4a63ff" />
          <Text style={styles.loadingText}>Loading your products...</Text>
        </View>
      ) : products.length === 0 ? (
        <View style={styles.emptyBox}>
          <Ionicons name="storefront-outline" size={56} color="#b5b8c3" />
          <Text style={styles.emptyTitle}>No products yet</Text>
          <Text style={styles.emptyText}>
            Start by uploading your first product to your shop.
          </Text>

          <TouchableOpacity
            style={styles.emptyUploadButton}
            onPress={() => router.push("/service_provider/upload")}
          >
            <Text style={styles.emptyUploadButtonText}>Upload Product</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {products.map((item) => (
            <MyProductCard
              key={item.id}
              item={item}
              deleting={deletingId === item.id}
              onDelete={handleDelete}
              onEdit={handleEdit}
            />
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f7f8fc",
    paddingHorizontal: 14,
    paddingTop: 10,
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
  addButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#4a63ff",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 8,
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
    marginBottom: 14,
  },
  loadingBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    marginTop: 12,
    color: "#7c7f89",
    fontSize: 14,
  },
  emptyBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  emptyTitle: {
    marginTop: 14,
    fontSize: 20,
    fontWeight: "800",
    color: "#202127",
  },
  emptyText: {
    marginTop: 8,
    fontSize: 13,
    color: "#8a8d97",
    textAlign: "center",
    lineHeight: 18,
  },
  emptyUploadButton: {
    marginTop: 18,
    backgroundColor: "#4a63ff",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 14,
  },
  emptyUploadButtonText: {
    color: "#fff",
    fontWeight: "800",
  },
  scrollContent: {
    paddingBottom: 30,
    gap: 16,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 12,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
    marginBottom: 16,
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  typeBadge: {
    backgroundColor: "#eef1ff",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  typeBadgeText: {
    color: "#4a63ff",
    fontSize: 12,
    fontWeight: "800",
  },
  stockBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  stockBadgeText: {
    fontSize: 12,
    fontWeight: "700",
  },
  imageSlider: {
    marginBottom: 10,
  },
  imageSlide: {
    width: CARD_WIDTH - 24,
    height: 250,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#f4f5f9",
    justifyContent: "center",
    alignItems: "center",
  },
  cardImage: {
    width: "100%",
    height: "100%",
  },
  dotsRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 10,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: "#d1d5e2",
    marginHorizontal: 4,
  },
  activeDot: {
    width: 18,
    backgroundColor: "#4a63ff",
  },
  cardBody: {
    paddingTop: 4,
  },
  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 8,
  },
  cardTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: "800",
    color: "#1d1f26",
  },
  stockStatusPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
  },
  stockStatusText: {
    fontSize: 11,
    fontWeight: "800",
  },
  cardDescription: {
    marginTop: 7,
    fontSize: 13,
    color: "#7d808c",
    lineHeight: 18,
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 10,
  },
  metaText: {
    marginRight: 12,
    marginBottom: 6,
    fontSize: 12,
    color: "#5f6470",
    fontWeight: "600",
  },
  footerRow: {
    marginTop: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  priceText: {
    fontSize: 22,
    fontWeight: "900",
    color: "#4a63ff",
  },
  stockHintText: {
    marginTop: 4,
    fontSize: 11,
    color: "#8A8F98",
    fontWeight: "600",
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  editButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#eef1f7",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
  },
  editButtonText: {
    color: "#111827",
    fontSize: 13,
    fontWeight: "800",
  },
  deleteButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#111827",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
  },
  deleteButtonText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "800",
  },
  disabledButton: {
    opacity: 0.6,
  },
});
import React, { useEffect, useMemo, useState } from "react";
import {

  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
  Dimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { onAuthStateChanged } from "firebase/auth";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { auth, db } from "../../config/firebase";

const { width } = Dimensions.get("window");
const CARD_WIDTH = width - 28;

function getTimeLabel(value) {
  try {
    let date = null;

    if (!value) return "Just now";
    if (typeof value?.toDate === "function") date = value.toDate();
    else if (value?.seconds) date = new Date(value.seconds * 1000);
    else if (typeof value === "number") date = new Date(value);
    else if (value instanceof Date) date = value;

    if (!date) return "Just now";

    const diff = Date.now() - date.getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins} min ago`;
    if (hours < 24) return `${hours} hr ago`;
    if (days < 7) return `${days} day ago`;

    return date.toLocaleDateString();
  } catch {
    return "Just now";
  }
}

function StarRating({ value, onChange, size = 18, readonly = false }) {
  return (
    <View style={styles.starRow}>
      {[1, 2, 3, 4, 5].map((star) => (
        <TouchableOpacity
          key={star}
          onPress={() => !readonly && onChange?.(star)}
          disabled={readonly}
        >
          <Ionicons
            name={star <= value ? "star" : "star-outline"}
            size={size}
            color="#F59E0B"
            style={{ marginRight: 4 }}
          />
        </TouchableOpacity>
      ))}
    </View>
  );
}

function ReviewItem({ review }) {
  return (
    <View style={styles.reviewItem}>
      <View style={styles.reviewItemTop}>
        <View>
          <Text style={styles.reviewUserName}>
            {review.userName || "Anonymous User"}
          </Text>
          <StarRating value={Number(review.rating || 0)} size={14} readonly />
        </View>
        <Text style={styles.reviewTime}>
          {getTimeLabel(review.updatedAt || review.createdAt)}
        </Text>
      </View>

      {!!review.comment && (
        <Text style={styles.reviewCommentText}>{review.comment}</Text>
      )}
    </View>
  );
}

function ProductCard({
  item,
  onAddToCart,
  adding,
  avgRating,
  reviewCount,
  onSubmitReview,
  reviewSaving,
  productReviews,
}) {
  const [activeImage, setActiveImage] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState("");

  const images = useMemo(() => {
    if (Array.isArray(item.mediaUrls) && item.mediaUrls.length > 0) {
      return item.mediaUrls.filter(Boolean);
    }

    if (item.mediaUrl) {
      return [item.mediaUrl];
    }

    return ["https://via.placeholder.com/800x600.png?text=No+Image"];
  }, [item]);

  const handleImageScroll = (event) => {
    const x = event.nativeEvent.contentOffset.x;
    const index = Math.round(x / (CARD_WIDTH - 24));
    setActiveImage(index);
  };

  const increaseQty = () => {
    const stock = Number(item.stock || 0);
    setQuantity((prev) => Math.min(prev + 1, Math.max(stock, 1)));
  };

  const decreaseQty = () => {
    setQuantity((prev) => Math.max(prev - 1, 1));
  };

  const handleReviewSubmit = async () => {
    const success = await onSubmitReview(item, rating, reviewText);

    if (success) {
      setRating(0);
      setReviewText("");
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.imageHeaderRow}>
        <View style={styles.typePill}>
          <Text style={styles.typePillText}>{item.itemType || "Item"}</Text>
        </View>

        <View style={styles.stockPill}>
          <Ionicons name="cube-outline" size={14} color="#4a63ff" />
          <Text style={styles.stockPillText}>
            Stock: {Number(item.stock || 0)}
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
        <Text style={styles.cardTitle}>{item.title || "Untitled Product"}</Text>

        {!!item.description && (
          <Text style={styles.cardDescription} numberOfLines={3}>
            {item.description}
          </Text>
        )}

        <View style={styles.metaRow}>
          {!!item.size && <Text style={styles.metaText}>Size: {item.size}</Text>}
          {!!item.brand && (
            <Text style={styles.metaText}>Brand: {item.brand}</Text>
          )}
          {!!item.color && (
            <Text style={styles.metaText}>Color: {item.color}</Text>
          )}
        </View>

        <View style={styles.bottomRow}>
          <View>
            <Text style={styles.cardPrice}>
              £{Number(item.price || 0).toFixed(2)}
            </Text>

            <View style={styles.avgRatingWrap}>
              <Ionicons name="star" size={14} color="#F59E0B" />
              <Text style={styles.avgRatingText}>
                {Number(avgRating || 0).toFixed(1)} ({reviewCount || 0} reviews)
              </Text>
            </View>
          </View>

          <View style={styles.qtyWrap}>
            <TouchableOpacity style={styles.qtyButton} onPress={decreaseQty}>
              <Ionicons name="remove" size={18} color="#111827" />
            </TouchableOpacity>

            <Text style={styles.qtyText}>{quantity}</Text>

            <TouchableOpacity style={styles.qtyButton} onPress={increaseQty}>
              <Ionicons name="add" size={18} color="#111827" />
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity
          style={[
            styles.cartAddButton,
            (adding || Number(item.stock || 0) <= 0) && styles.disabledButton,
          ]}
          onPress={() => onAddToCart(item, quantity)}
          disabled={adding || Number(item.stock || 0) <= 0}
        >
          {adding ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Ionicons name="cart-outline" size={16} color="#fff" />
              <Text style={styles.cartAddButtonText}>
                {Number(item.stock || 0) <= 0
                  ? "Out of Stock"
                  : `Add ${quantity} to Cart`}
              </Text>
            </>
          )}
        </TouchableOpacity>

        <View style={styles.reviewSection}>
          <Text style={styles.reviewTitle}>Rate and Review</Text>

          <StarRating value={rating} onChange={setRating} size={20} />

          <TextInput
            style={styles.reviewInput}
            placeholder="Write your review"
            placeholderTextColor="#999"
            multiline
            value={reviewText}
            onChangeText={setReviewText}
          />

          <TouchableOpacity
            style={styles.reviewButton}
            onPress={handleReviewSubmit}
            disabled={reviewSaving}
          >
            {reviewSaving ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Ionicons name="send-outline" size={16} color="#fff" />
                <Text style={styles.reviewButtonText}>Submit Review</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.previousReviewsSection}>
          <Text style={styles.previousReviewsTitle}>Previous Reviews</Text>

          {productReviews.length === 0 ? (
            <Text style={styles.noReviewsText}>
              No reviews yet for this product.
            </Text>
          ) : (
            productReviews
              .slice(0, 5)
              .map((review) => <ReviewItem key={review.id} review={review} />)
          )}
        </View>
      </View>
    </View>
  );
}

export default function ShopScreen() {
  const router = useRouter();

  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [products, setProducts] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addingId, setAddingId] = useState("");
  const [reviewSavingId, setReviewSavingId] = useState("");
  const [currentUser, setCurrentUser] = useState(null);
  const [currentUserProfile, setCurrentUserProfile] = useState(null);
  const [cartCount, setCartCount] = useState(0);

  const categories = [
    "All",
    "T Shirt",
    "Drawing",
    "Online Drawing Equipment",
    "Drawing Tools",
    "Tutorial Video",
  ];

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user || null);
    });

    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    if (!currentUser?.uid) {
      setCurrentUserProfile(null);
      return;
    }

    const unsubscribe = onSnapshot(
      doc(db, "users", currentUser.uid),
      (snap) => {
        if (snap.exists()) {
          setCurrentUserProfile({ id: snap.id, ...snap.data() });
        } else {
          setCurrentUserProfile(null);
        }
      },
      (error) => {
        console.log("Current user profile error:", error);
      }
    );

    return () => unsubscribe();
  }, [currentUser]);

  useEffect(() => {
    setLoading(true);

    const q = query(collection(db, "shops"));

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
        console.log("Shop load error:", error);
        setLoading(false);
        Alert.alert("Error", "Failed to load shop items.");
      }
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const q = query(collection(db, "reviews"));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const items = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }));

        items.sort((a, b) => {
          const aTime = a.updatedAt?.seconds || a.createdAt?.seconds || 0;
          const bTime = b.updatedAt?.seconds || b.createdAt?.seconds || 0;
          return bTime - aTime;
        });

        setReviews(items);
      },
      (error) => {
        console.log("Reviews load error:", error);
      }
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!currentUser) {
      setCartCount(0);
      return;
    }

    const q = query(
      collection(db, "carts"),
      where("userId", "==", currentUser.uid)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const total = snapshot.docs.reduce((sum, docSnap) => {
          const data = docSnap.data();
          return sum + Number(data.quantity || 0);
        }, 0);

        setCartCount(total);
      },
      (error) => {
        console.log("Cart count error:", error);
        setCartCount(0);
      }
    );

    return () => unsubscribe();
  }, [currentUser]);

  const filteredProducts = useMemo(() => {
    return products.filter((item) => {
      const title = String(item.title || "").toLowerCase();
      const description = String(item.description || "").toLowerCase();
      const itemType = String(item.itemType || "").toLowerCase();
      const searchValue = search.toLowerCase().trim();

      const matchesSearch =
        !searchValue ||
        title.includes(searchValue) ||
        description.includes(searchValue) ||
        itemType.includes(searchValue);

      const matchesCategory =
        activeCategory === "All" || item.itemType === activeCategory;

      return matchesSearch && matchesCategory;
    });
  }, [products, search, activeCategory]);

  const reviewStatsByProduct = useMemo(() => {
    const grouped = {};

    for (const review of reviews) {
      const productId = review.productId;
      if (!productId) continue;

      if (!grouped[productId]) {
        grouped[productId] = {
          total: 0,
          count: 0,
        };
      }

      grouped[productId].total += Number(review.rating || 0);
      grouped[productId].count += 1;
    }

    const result = {};
    for (const productId of Object.keys(grouped)) {
      const entry = grouped[productId];
      result[productId] = {
        avgRating: entry.count > 0 ? entry.total / entry.count : 0,
        reviewCount: entry.count,
      };
    }

    return result;
  }, [reviews]);

  const reviewsByProduct = useMemo(() => {
    const grouped = {};

    for (const review of reviews) {
      if (!review.productId) continue;
      if (!grouped[review.productId]) grouped[review.productId] = [];
      grouped[review.productId].push(review);
    }

    return grouped;
  }, [reviews]);

  const handleAddToCart = async (product, quantity) => {
  try {
    if (!currentUser?.uid) {
      Alert.alert("Login Required", "Please log in first.");
      return;
    }

    const wantedQty = Number(quantity || 0);

    if (wantedQty <= 0) {
      Alert.alert("Error", "Please choose a valid quantity.");
      return;
    }

    setAddingId(product.id);

    const productRef = doc(db, "shops", product.id);
    const cartRef = doc(db, "carts", `${currentUser.uid}_${product.id}`);

    await runTransaction(db, async (transaction) => {
      const productSnap = await transaction.get(productRef);
      const cartSnap = await transaction.get(cartRef);

      if (!productSnap.exists()) {
        throw new Error("Product no longer exists.");
      }

      const productData = productSnap.data();
      const currentStock = Number(productData.stock || 0);

      if (currentStock <= 0) {
        throw new Error("This product is out of stock.");
      }

      if (wantedQty > currentStock) {
        throw new Error(`Only ${currentStock} item(s) left in stock.`);
      }

      const existingCart = cartSnap.exists() ? cartSnap.data() : null;
      const existingQty = Number(existingCart?.quantity || 0);
      const newQty = existingQty + wantedQty;
      const price = Number(productData.price || 0);

      if (newQty > currentStock) {
        throw new Error(
          `You already have ${existingQty} in cart. Only ${currentStock} item(s) currently available.`
        );
      }

      transaction.update(productRef, {
        stock: currentStock - wantedQty,
        updatedAt: serverTimestamp(),
      });

      transaction.set(
        cartRef,
        {
          userId: currentUser.uid,
          productId: product.id,
          providerId: productData.providerId || null,
          providerEmail: productData.providerEmail || null,
          providerName: productData.providerName || null,
          title: productData.title || "",
          description: productData.description || "",
          itemType: productData.itemType || "",
          price,
          quantity: newQty,
          totalPrice: price * newQty,
          mediaUrl: productData.mediaUrl || "",
          mediaUrls: Array.isArray(productData.mediaUrls)
            ? productData.mediaUrls.filter(Boolean)
            : productData.mediaUrl
              ? [productData.mediaUrl]
              : [],
          size: productData.size || null,
          brand: productData.brand || null,
          color: productData.color || null,
          material: productData.material || null,
          createdAt: existingCart?.createdAt || serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    });

    Alert.alert("Added", `${wantedQty} item(s) added to cart.`);
  } catch (error) {
    console.log("Add to cart error:", error);
    Alert.alert("Error", error.message || "Failed to add product to cart.");
  } finally {
    setAddingId("");
  }
};

  const handleSubmitReview = async (product, rating, comment) => {
    try {
      if (!currentUser) {
        Alert.alert("Login Required", "Please log in first.");
        return false;
      }

      if (!rating) {
        Alert.alert("Rating Required", "Please select a star rating.");
        return false;
      }

      setReviewSavingId(product.id);

      const reviewRef = doc(db, "reviews", `${currentUser.uid}_${product.id}`);
      const existingReviewSnap = await getDoc(reviewRef);

      const cleanComment = comment?.trim() || "";
      const userName =
        currentUserProfile?.fullName ||
        currentUserProfile?.name ||
        currentUser.displayName ||
        currentUser.email ||
        "Anonymous User";

      await runTransaction(db, async (transaction) => {
        transaction.set(
          reviewRef,
          {
            userId: currentUser.uid,
            userName,
            userEmail: currentUser.email || "",
            productId: product.id,
            providerId: product.providerId || null,
            providerEmail: product.providerEmail || null,
            title: product.title || "",
            rating: Number(rating),
            comment: cleanComment,
            createdAt: existingReviewSnap.exists()
              ? existingReviewSnap.data()?.createdAt || serverTimestamp()
              : serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      });

      if (product.providerId) {
        await addDoc(collection(db, "notifications"), {
          userId: product.providerId,
          type: "product_review",
          title: "New Product Review",
          message: `${userName} reviewed "${product.title || "your product"}" with ${rating} star${rating > 1 ? "s" : ""}.`,
          productId: product.id,
          reviewerId: currentUser.uid,
          reviewerName: userName,
          rating: Number(rating),
          comment: cleanComment,
          read: false,
          createdAt: serverTimestamp(),
        });
      }

      Alert.alert("Success", "Your review has been submitted.");
      return true;
    } catch (error) {
      console.log("Review save error:", error);
      Alert.alert("Error", error.message || "Failed to save review.");
      return false;
    } finally {
      setReviewSavingId("");
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.header}>
          <View style={styles.brandBlock}>
            <Text style={styles.logo}>ArtLinker</Text>
            <Text style={styles.headerSub}>Creative shop marketplace</Text>
          </View>

          <View style={styles.headerRightColumn}>
            <TouchableOpacity
              style={styles.cartButton}
              onPress={() => router.push("/users/cart")}
              activeOpacity={0.85}
            >
              <Ionicons name="cart-outline" size={22} color="#222" />
              {cartCount > 0 && (
                <View style={styles.cartBadge}>
                  <Text style={styles.cartBadgeText}>
                    {cartCount > 99 ? "99+" : cartCount}
                  </Text>
                </View>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.requestButtonUnderCart}
              onPress={() => router.push("/users/requests")}
              activeOpacity={0.85}
            >
              <Ionicons
                name="document-text-outline"
                size={16}
                color="#4a63ff"
              />
              <Text style={styles.requestButtonUnderCartText}>Requests</Text>
            </TouchableOpacity>
          </View>
        </View>

        <Text style={styles.heading}>Shop</Text>
        <Text style={styles.subheading}>
          Discover artwork, tools, learning videos and creative products from
          providers
        </Text>

        <View style={styles.searchWrapper}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search products"
            placeholderTextColor="#999"
            value={search}
            onChangeText={setSearch}
          />
          <Ionicons
            name="search"
            size={20}
            color="#777"
            style={styles.searchIcon}
          />
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryRow}
        >
          {categories.map((category) => {
            const active = activeCategory === category;

            return (
              <TouchableOpacity
                key={category}
                style={[
                  styles.categoryButton,
                  active && styles.categoryButtonActive,
                ]}
                onPress={() => setActiveCategory(category)}
                activeOpacity={0.85}
              >
                <Text
                  style={[
                    styles.categoryText,
                    active && styles.categoryTextActive,
                  ]}
                >
                  {category}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#4a63ff" />
            <Text style={styles.loadingText}>Loading products...</Text>
          </View>
        ) : filteredProducts.length === 0 ? (
          <View style={styles.emptyBox}>
            <Ionicons name="storefront-outline" size={50} color="#b2b2bb" />
            <Text style={styles.emptyTitle}>No products found</Text>
            <Text style={styles.emptyText}>Try another search or category.</Text>
          </View>
        ) : (
          <View style={styles.productsList}>
            {filteredProducts.map((item) => {
              const stats = reviewStatsByProduct[item.id] || {
                avgRating: 0,
                reviewCount: 0,
              };

              return (
                <ProductCard
                  key={item.id}
                  item={item}
                  onAddToCart={handleAddToCart}
                  adding={addingId === item.id}
                  avgRating={stats.avgRating}
                  reviewCount={stats.reviewCount}
                  onSubmitReview={handleSubmitReview}
                  reviewSaving={reviewSavingId === item.id}
                  productReviews={reviewsByProduct[item.id] || []}
                />
              );
            })}
          </View>
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
    alignItems: "flex-start",
  },
  brandBlock: {
    flex: 1,
    paddingRight: 12,
  },
  logo: {
    fontSize: 28,
    fontWeight: "800",
    color: "#f06ce9",
    letterSpacing: 0.3,
  },
  headerSub: {
    marginTop: 4,
    fontSize: 12,
    color: "#8d8d98",
    lineHeight: 18,
  },
  headerRightColumn: {
    alignItems: "center",
  },
  cartButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#ffffff",
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
    borderWidth: 1,
    borderColor: "#eef0f6",
  },
  cartBadge: {
    position: "absolute",
    top: -3,
    right: -2,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#ff3b5f",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 5,
  },
  cartBadgeText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "800",
  },
  requestButtonUnderCart: {
    marginTop: 10,
    minWidth: 96,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
    borderWidth: 1,
    borderColor: "#e8ecff",
  },
  requestButtonUnderCartText: {
    marginLeft: 6,
    fontSize: 12,
    fontWeight: "800",
    color: "#4a63ff",
    letterSpacing: 0.2,
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
  searchWrapper: {
    position: "relative",
    justifyContent: "center",
  },
  searchInput: {
    backgroundColor: "#ffffff",
    borderRadius: 18,
    height: 48,
    paddingLeft: 14,
    paddingRight: 42,
    fontSize: 14,
    color: "#222",
    borderWidth: 1,
    borderColor: "#ececf1",
    shadowColor: "#000",
    shadowOpacity: 0.03,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  searchIcon: {
    position: "absolute",
    right: 14,
  },
  categoryRow: {
    paddingTop: 16,
    paddingBottom: 16,
    paddingRight: 8,
  },
  categoryButton: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: "#eef1f7",
    marginRight: 10,
  },
  categoryButtonActive: {
    backgroundColor: "#4a63ff",
  },
  categoryText: {
    fontSize: 14,
    color: "#6f7481",
    fontWeight: "700",
  },
  categoryTextActive: {
    color: "#ffffff",
  },
  loadingBox: {
    paddingVertical: 60,
    alignItems: "center",
  },
  loadingText: {
    marginTop: 12,
    color: "#7c7f89",
    fontSize: 14,
  },
  emptyBox: {
    paddingVertical: 70,
    alignItems: "center",
  },
  emptyTitle: {
    marginTop: 12,
    fontSize: 18,
    fontWeight: "700",
    color: "#202127",
  },
  emptyText: {
    marginTop: 6,
    fontSize: 13,
    color: "#8a8d97",
  },
  productsList: {
    gap: 16,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 22,
    padding: 12,
    shadowColor: "#000",
    shadowOpacity: 0.07,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
    borderWidth: 1,
    borderColor: "#f0f2f7",
  },
  imageHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  typePill: {
    backgroundColor: "#eef1ff",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  typePillText: {
    color: "#4a63ff",
    fontSize: 12,
    fontWeight: "800",
  },
  stockPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#f7f8fd",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  stockPillText: {
    color: "#4a63ff",
    fontSize: 12,
    fontWeight: "700",
  },
  imageSlider: {
    marginBottom: 10,
  },
  imageSlide: {
    width: CARD_WIDTH - 24,
    height: 250,
    borderRadius: 18,
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
  cardTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#1d1f26",
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
  bottomRow: {
    marginTop: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardPrice: {
    fontSize: 22,
    fontWeight: "900",
    color: "#4a63ff",
  },
  avgRatingWrap: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
  },
  avgRatingText: {
    marginLeft: 5,
    fontSize: 12,
    fontWeight: "700",
    color: "#6B7280",
  },
  qtyWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F3F4F6",
    borderRadius: 14,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  qtyButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
  },
  qtyText: {
    marginHorizontal: 12,
    fontSize: 15,
    fontWeight: "800",
    color: "#111827",
  },
  cartAddButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#111827",
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderRadius: 14,
    marginTop: 14,
  },
  cartAddButtonText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "800",
  },
  disabledButton: {
    opacity: 0.6,
  },
  reviewSection: {
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
  },
  reviewTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 10,
  },
  starRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  reviewInput: {
    minHeight: 90,
    backgroundColor: "#F9FAFB",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 13,
    color: "#111827",
    textAlignVertical: "top",
  },
  reviewButton: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#4a63ff",
    paddingVertical: 12,
    borderRadius: 14,
  },
  reviewButtonText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "800",
    marginLeft: 6,
  },
  previousReviewsSection: {
    marginTop: 18,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
  },
  previousReviewsTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 10,
  },
  noReviewsText: {
    fontSize: 13,
    color: "#8a8d97",
  },
  reviewItem: {
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#EEF2F7",
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
  },
  reviewItemTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10,
  },
  reviewUserName: {
    fontSize: 13,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 4,
  },
  reviewTime: {
    fontSize: 11,
    color: "#8a8d97",
    fontWeight: "600",
  },
  reviewCommentText: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 18,
    color: "#4B5563",
  },
});
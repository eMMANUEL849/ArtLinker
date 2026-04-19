import React, { useEffect, useMemo, useState } from "react";
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../../config/firebase";

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

function sameDay(a, b) {
  return (
    a &&
    b &&
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function getArtworkTitle(item) {
  return item?.title || item?.caption || item?.name || "Untitled Artwork";
}

function getArtworkCategory(item) {
  return item?.category || item?.type || item?.artCategory || "Other";
}

function getArtworkLikes(item) {
  if (typeof item?.likes === "number") return item.likes;
  if (typeof item?.likesCount === "number") return item.likesCount;
  if (typeof item?.totalLikes === "number") return item.totalLikes;
  if (Array.isArray(item?.likedBy)) return item.likedBy.length;
  if (Array.isArray(item?.likes)) return item.likes.length;
  return 0;
}

function getArtworkComments(item) {
  if (typeof item?.comments === "number") return item.comments;
  if (typeof item?.commentsCount === "number") return item.commentsCount;
  if (typeof item?.totalComments === "number") return item.totalComments;
  if (Array.isArray(item?.comments)) return item.comments.length;
  return 0;
}

function getArtworkSaves(item) {
  if (typeof item?.saves === "number") return item.saves;
  if (typeof item?.savesCount === "number") return item.savesCount;
  if (typeof item?.totalSaves === "number") return item.totalSaves;
  if (Array.isArray(item?.savedBy)) return item.savedBy.length;
  if (Array.isArray(item?.saves)) return item.saves.length;
  return 0;
}

function getArtworkViews(item) {
  if (typeof item?.views === "number") return item.views;
  if (typeof item?.viewsCount === "number") return item.viewsCount;
  if (typeof item?.totalViews === "number") return item.totalViews;
  if (Array.isArray(item?.viewedBy)) return item.viewedBy.length;
  return 0;
}

function getPaymentAmount(item) {
  if (typeof item?.amount === "number") return item.amount;
  if (typeof item?.totalAmount === "number") return item.totalAmount;
  if (typeof item?.total === "number") return item.total;
  if (typeof item?.grandTotal === "number") return item.grandTotal;
  if (typeof item?.price === "number") return item.price;
  return 0;
}

function getPaymentStatus(item) {
  return (
    item?.status ||
    item?.paymentStatus ||
    item?.orderStatus ||
    "paid"
  )
    .toString()
    .toLowerCase();
}

function getDayLabel(date) {
  return date.toLocaleDateString(undefined, { weekday: "short" });
}

function getHourBucket(date) {
  if (!date) return null;
  return date.getHours();
}

function getLastNDays(n) {
  const days = [];
  const now = new Date();

  for (let i = n - 1; i >= 0; i -= 1) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    d.setHours(0, 0, 0, 0);
    days.push(d);
  }

  return days;
}

function getHeatColorClass(value, max) {
  if (!max || value <= 0) return "#F3F4F6";
  const ratio = value / max;
  if (ratio < 0.2) return "#E9D5FF";
  if (ratio < 0.4) return "#D8B4FE";
  if (ratio < 0.6) return "#C084FC";
  if (ratio < 0.8) return "#A855F7";
  return "#7E22CE";
}

export default function AdminAnalyticsScreen() {
  const [timeRange, setTimeRange] = useState("30days");

  const [users, setUsers] = useState([]);
  const [posts, setPosts] = useState([]);
  const [artworks, setArtworks] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribers = [];

    const unsubUsers = onSnapshot(
      collection(db, "users"),
      (snapshot) => {
        setUsers(
          snapshot.docs.map((item) => ({
            id: item.id,
            ...item.data(),
          }))
        );
        setLoading(false);
      },
      () => {
        setUsers([]);
        setLoading(false);
      }
    );
    unsubscribers.push(unsubUsers);

    const unsubPosts = onSnapshot(
      collection(db, "posts"),
      (snapshot) => {
        setPosts(
          snapshot.docs.map((item) => ({
            id: item.id,
            _collection: "posts",
            ...item.data(),
          }))
        );
      },
      () => setPosts([])
    );
    unsubscribers.push(unsubPosts);

    const unsubArtworks = onSnapshot(
      collection(db, "artworks"),
      (snapshot) => {
        setArtworks(
          snapshot.docs.map((item) => ({
            id: item.id,
            _collection: "artworks",
            ...item.data(),
          }))
        );
      },
      () => setArtworks([])
    );
    unsubscribers.push(unsubArtworks);

    const unsubPayments = onSnapshot(
      collection(db, "payments"),
      (snapshot) => {
        setPayments(
          snapshot.docs.map((item) => ({
            id: item.id,
            ...item.data(),
          }))
        );
      },
      () => setPayments([])
    );
    unsubscribers.push(unsubPayments);

    return () => {
      unsubscribers.forEach((unsubscribe) => {
        try {
          unsubscribe?.();
        } catch (error) {}
      });
    };
  }, []);

  const artworkSource = useMemo(() => {
    return posts.length > 0 ? posts : artworks;
  }, [posts, artworks]);

  const rangeDays = useMemo(() => {
    if (timeRange === "7days") return 7;
    if (timeRange === "90days") return 90;
    return 30;
  }, [timeRange]);

  const filteredUsers = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - rangeDays);

    return users.filter((user) => {
      const createdAt = toDate(user?.createdAt || user?.joinedAt || user?.dateCreated);
      return createdAt && createdAt >= cutoff;
    });
  }, [users, rangeDays]);

  const filteredArtworks = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - rangeDays);

    return artworkSource.filter((item) => {
      const createdAt = toDate(item?.createdAt);
      return createdAt && createdAt >= cutoff;
    });
  }, [artworkSource, rangeDays]);

  const filteredPayments = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - rangeDays);

    return payments.filter((item) => {
      const createdAt = toDate(item?.createdAt || item?.paidAt || item?.updatedAt);
      return createdAt && createdAt >= cutoff;
    });
  }, [payments, rangeDays]);

  const userGrowthData = useMemo(() => {
    const days = getLastNDays(Math.min(rangeDays, 14));

    return days.map((day) => {
      const count = users.filter((user) => {
        const createdAt = toDate(user?.createdAt || user?.joinedAt || user?.dateCreated);
        return createdAt && sameDay(createdAt, day);
      }).length;

      return {
        label: getDayLabel(day),
        value: count,
      };
    });
  }, [users, rangeDays]);

  const uploadGrowthData = useMemo(() => {
    const days = getLastNDays(Math.min(rangeDays, 14));

    return days.map((day) => {
      const count = artworkSource.filter((item) => {
        const createdAt = toDate(item?.createdAt);
        return createdAt && sameDay(createdAt, day);
      }).length;

      return {
        label: getDayLabel(day),
        value: count,
      };
    });
  }, [artworkSource, rangeDays]);

  const popularArtworks = useMemo(() => {
    return [...filteredArtworks]
      .map((item) => {
        const likes = getArtworkLikes(item);
        const comments = getArtworkComments(item);
        const saves = getArtworkSaves(item);
        const views = getArtworkViews(item);
        const score = likes + comments * 2 + saves * 2 + views * 0.2;

        return {
          id: item.id,
          title: getArtworkTitle(item),
          category: getArtworkCategory(item),
          likes,
          comments,
          saves,
          views,
          score,
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }, [filteredArtworks]);

  const popularCategories = useMemo(() => {
    const categoryMap = {};

    filteredArtworks.forEach((item) => {
      const category = getArtworkCategory(item);
      if (!categoryMap[category]) {
        categoryMap[category] = {
          category,
          artworks: 0,
          likes: 0,
          comments: 0,
          saves: 0,
          views: 0,
          score: 0,
        };
      }

      categoryMap[category].artworks += 1;
      categoryMap[category].likes += getArtworkLikes(item);
      categoryMap[category].comments += getArtworkComments(item);
      categoryMap[category].saves += getArtworkSaves(item);
      categoryMap[category].views += getArtworkViews(item);
    });

    return Object.values(categoryMap)
      .map((item) => ({
        ...item,
        score:
          item.likes + item.comments * 2 + item.saves * 2 + item.views * 0.2,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);
  }, [filteredArtworks]);

  const engagementHeatmap = useMemo(() => {
    const hours = Array.from({ length: 24 }, (_, i) => i);
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    const grid = days.map((dayLabel, dayIndex) => {
      return {
        dayLabel,
        values: hours.map((hour) => {
          const value = filteredArtworks.reduce((sum, item) => {
            const createdAt = toDate(item?.createdAt);
            if (!createdAt) return sum;

            const matchesDay = createdAt.getDay() === dayIndex;
            const matchesHour = getHourBucket(createdAt) === hour;

            if (!matchesDay || !matchesHour) return sum;

            return (
              sum +
              getArtworkLikes(item) +
              getArtworkComments(item) +
              getArtworkSaves(item)
            );
          }, 0);

          return value;
        }),
      };
    });

    return grid;
  }, [filteredArtworks]);

  const heatmapMax = useMemo(() => {
    let max = 0;
    engagementHeatmap.forEach((row) => {
      row.values.forEach((value) => {
        if (value > max) max = value;
      });
    });
    return max;
  }, [engagementHeatmap]);

  const conversionMetrics = useMemo(() => {
    const totalViews = filteredArtworks.reduce(
      (sum, item) => sum + getArtworkViews(item),
      0
    );

    const totalPurchases = filteredPayments.filter((item) => {
      const status = getPaymentStatus(item);
      return status === "paid" || status === "completed";
    }).length;

    const totalRevenue = filteredPayments.reduce(
      (sum, item) => sum + getPaymentAmount(item),
      0
    );

    const viewToPurchaseRate =
      totalViews > 0 ? (totalPurchases / totalViews) * 100 : 0;

    const avgRevenuePerPurchase =
      totalPurchases > 0 ? totalRevenue / totalPurchases : 0;

    return {
      totalViews,
      totalPurchases,
      totalRevenue,
      viewToPurchaseRate,
      avgRevenuePerPurchase,
    };
  }, [filteredArtworks, filteredPayments]);

  const overview = useMemo(() => {
    const totalEngagement = filteredArtworks.reduce((sum, item) => {
      return (
        sum +
        getArtworkLikes(item) +
        getArtworkComments(item) +
        getArtworkSaves(item)
      );
    }, 0);

    return {
      newUsers: filteredUsers.length,
      uploads: filteredArtworks.length,
      engagement: totalEngagement,
      revenue: conversionMetrics.totalRevenue,
    };
  }, [filteredUsers, filteredArtworks, conversionMetrics]);

  const chartMaxUsers = Math.max(...userGrowthData.map((item) => item.value), 1);
  const chartMaxUploads = Math.max(...uploadGrowthData.map((item) => item.value), 1);
  const categoryMaxScore = Math.max(...popularCategories.map((item) => item.score), 1);

  const timeFilters = [
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
              <Text style={styles.headerBadge}>Analytics and Insights</Text>
            </View>

            <View style={styles.headerIconWrap}>
              <Ionicons name="bar-chart-outline" size={20} color="#7C3AED" />
            </View>
          </View>

          <Text style={styles.title}>Platform Analytics</Text>
          <Text style={styles.subtitle}>
            Track growth trends, popular content, engagement patterns, and conversion performance
          </Text>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          {timeFilters.map((item) => {
            const active = timeRange === item.key;
            return (
              <TouchableOpacity
                key={item.key}
                style={[styles.filterChip, active && styles.filterChipActive]}
                onPress={() => setTimeRange(item.key)}
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

        {loading ? (
          <View style={styles.stateWrap}>
            <ActivityIndicator size="large" color="#7C3AED" />
            <Text style={styles.stateText}>Loading analytics...</Text>
          </View>
        ) : (
          <>
            <View style={styles.summaryGrid}>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>New Users</Text>
                <Text style={styles.summaryValue}>
                  {formatNumber(overview.newUsers)}
                </Text>
              </View>

              <View style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>Uploads</Text>
                <Text style={styles.summaryValue}>
                  {formatNumber(overview.uploads)}
                </Text>
              </View>

              <View style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>Engagement</Text>
                <Text style={styles.summaryValue}>
                  {formatNumber(overview.engagement)}
                </Text>
              </View>

              <View style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>Revenue</Text>
                <Text style={styles.summaryValue}>
                  {formatCurrency(overview.revenue)}
                </Text>
              </View>
            </View>

            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>User Growth Trends</Text>
              <Text style={styles.sectionSubtitle}>
                New user sign ups over recent days
              </Text>

              <View style={styles.chartWrap}>
                {userGrowthData.map((item, index) => (
                  <View key={`${item.label}_${index}`} style={styles.barGroup}>
                    <View style={styles.barTrack}>
                      <View
                        style={[
                          styles.barFillUsers,
                          {
                            height: `${(item.value / chartMaxUsers) * 100}%`,
                          },
                        ]}
                      />
                    </View>
                    <Text style={styles.barValue}>{item.value}</Text>
                    <Text style={styles.barLabel}>{item.label}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Upload Trends</Text>
              <Text style={styles.sectionSubtitle}>
                Artwork uploads over recent days
              </Text>

              <View style={styles.chartWrap}>
                {uploadGrowthData.map((item, index) => (
                  <View key={`${item.label}_${index}`} style={styles.barGroup}>
                    <View style={styles.barTrack}>
                      <View
                        style={[
                          styles.barFillUploads,
                          {
                            height: `${(item.value / chartMaxUploads) * 100}%`,
                          },
                        ]}
                      />
                    </View>
                    <Text style={styles.barValue}>{item.value}</Text>
                    <Text style={styles.barLabel}>{item.label}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Most Popular Artworks</Text>
              <Text style={styles.sectionSubtitle}>
                Best performing artwork based on likes, comments, saves, and views
              </Text>

              {popularArtworks.length === 0 ? (
                <View style={styles.emptyWrap}>
                  <Text style={styles.emptyText}>No artwork data available</Text>
                </View>
              ) : (
                popularArtworks.map((item, index) => (
                  <View key={item.id} style={styles.rankCard}>
                    <View style={styles.rankBadge}>
                      <Text style={styles.rankBadgeText}>#{index + 1}</Text>
                    </View>

                    <View style={styles.rankTextWrap}>
                      <Text style={styles.rankTitle} numberOfLines={1}>
                        {item.title}
                      </Text>
                      <Text style={styles.rankMeta} numberOfLines={1}>
                        {item.category}
                      </Text>
                      <Text style={styles.rankStats}>
                        {item.likes} likes · {item.comments} comments · {item.saves} saves · {item.views} views
                      </Text>
                    </View>

                    <View style={styles.rankScoreWrap}>
                      <Text style={styles.rankScore}>{Math.round(item.score)}</Text>
                      <Text style={styles.rankScoreLabel}>score</Text>
                    </View>
                  </View>
                ))
              )}
            </View>

            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Most Popular Categories</Text>
              <Text style={styles.sectionSubtitle}>
                Top categories ranked by combined engagement
              </Text>

              {popularCategories.length === 0 ? (
                <View style={styles.emptyWrap}>
                  <Text style={styles.emptyText}>No category data available</Text>
                </View>
              ) : (
                popularCategories.map((item) => (
                  <View key={item.category} style={styles.categoryRow}>
                    <View style={styles.categoryHeaderRow}>
                      <Text style={styles.categoryName}>{item.category}</Text>
                      <Text style={styles.categoryScore}>
                        {Math.round(item.score)}
                      </Text>
                    </View>

                    <View style={styles.progressTrack}>
                      <View
                        style={[
                          styles.progressFill,
                          {
                            width: `${(item.score / categoryMaxScore) * 100}%`,
                          },
                        ]}
                      />
                    </View>

                    <Text style={styles.categoryMeta}>
                      {item.artworks} artworks · {item.likes} likes · {item.comments} comments · {item.saves} saves · {item.views} views
                    </Text>
                  </View>
                ))
              )}
            </View>

            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Engagement Heatmap</Text>
              <Text style={styles.sectionSubtitle}>
                Engagement intensity by day and hour based on uploaded content activity
              </Text>

              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View>
                  <View style={styles.heatHeaderRow}>
                    <View style={styles.heatDayLabelSpacer} />
                    {[0, 4, 8, 12, 16, 20].map((hour) => (
                      <Text key={hour} style={styles.heatHourLabel}>
                        {hour}
                      </Text>
                    ))}
                  </View>

                  {engagementHeatmap.map((row) => (
                    <View key={row.dayLabel} style={styles.heatRow}>
                      <Text style={styles.heatDayLabel}>{row.dayLabel}</Text>

                      <View style={styles.heatCellRow}>
                        {row.values.map((value, idx) => (
                          <View
                            key={`${row.dayLabel}_${idx}`}
                            style={[
                              styles.heatCell,
                              {
                                backgroundColor: getHeatColorClass(value, heatmapMax),
                              },
                            ]}
                          />
                        ))}
                      </View>
                    </View>
                  ))}
                </View>
              </ScrollView>

              <View style={styles.heatLegendRow}>
                <Text style={styles.heatLegendText}>Low</Text>
                <View style={styles.heatLegendScale}>
                  {[0.1, 0.3, 0.5, 0.7, 1].map((step, idx) => (
                    <View
                      key={idx}
                      style={[
                        styles.heatLegendBox,
                        {
                          backgroundColor: getHeatColorClass(step * heatmapMax, heatmapMax),
                        },
                      ]}
                    />
                  ))}
                </View>
                <Text style={styles.heatLegendText}>High</Text>
              </View>
            </View>

            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Conversion Metrics</Text>
              <Text style={styles.sectionSubtitle}>
                Performance from content visibility to purchases
              </Text>

              <View style={styles.conversionGrid}>
                <View style={styles.conversionCard}>
                  <Text style={styles.conversionLabel}>Views</Text>
                  <Text style={styles.conversionValue}>
                    {formatNumber(conversionMetrics.totalViews)}
                  </Text>
                </View>

                <View style={styles.conversionCard}>
                  <Text style={styles.conversionLabel}>Purchases</Text>
                  <Text style={styles.conversionValue}>
                    {formatNumber(conversionMetrics.totalPurchases)}
                  </Text>
                </View>

                <View style={styles.conversionCard}>
                  <Text style={styles.conversionLabel}>View to Purchase</Text>
                  <Text style={styles.conversionValue}>
                    {conversionMetrics.viewToPurchaseRate.toFixed(2)}%
                  </Text>
                </View>

                <View style={styles.conversionCard}>
                  <Text style={styles.conversionLabel}>Avg Revenue / Purchase</Text>
                  <Text style={styles.conversionValue}>
                    {formatCurrency(conversionMetrics.avgRevenuePerPurchase)}
                  </Text>
                </View>
              </View>

              <View style={styles.funnelCard}>
                <Text style={styles.funnelTitle}>Simple Conversion Funnel</Text>

                <View style={styles.funnelStep}>
                  <View style={[styles.funnelBar, { width: "100%" }]} />
                  <Text style={styles.funnelText}>
                    Views: {formatNumber(conversionMetrics.totalViews)}
                  </Text>
                </View>

                <View style={styles.funnelStep}>
                  <View
                    style={[
                      styles.funnelBarSecondary,
                      {
                        width: `${
                          conversionMetrics.totalViews > 0
                            ? Math.max(
                                (conversionMetrics.totalPurchases /
                                  conversionMetrics.totalViews) *
                                  100,
                                8
                              )
                            : 8
                        }%`,
                      },
                    ]}
                  />
                  <Text style={styles.funnelText}>
                    Purchases: {formatNumber(conversionMetrics.totalPurchases)}
                  </Text>
                </View>
              </View>
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

  stateWrap: {
    paddingVertical: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  stateText: {
    marginTop: 10,
    fontSize: 13,
    color: "#6B7280",
    fontWeight: "600",
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
  sectionTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#111827",
  },
  sectionSubtitle: {
    fontSize: 12,
    color: "#9CA3AF",
    marginTop: 4,
    marginBottom: 14,
  },

  chartWrap: {
    height: 190,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingTop: 10,
  },
  barGroup: {
    flex: 1,
    alignItems: "center",
    marginHorizontal: 2,
  },
  barTrack: {
    width: "70%",
    height: 120,
    backgroundColor: "#F3F4F6",
    borderRadius: 999,
    justifyContent: "flex-end",
    overflow: "hidden",
  },
  barFillUsers: {
    width: "100%",
    backgroundColor: "#7C3AED",
    borderRadius: 999,
    minHeight: 4,
  },
  barFillUploads: {
    width: "100%",
    backgroundColor: "#2563EB",
    borderRadius: 999,
    minHeight: 4,
  },
  barValue: {
    marginTop: 8,
    fontSize: 11,
    fontWeight: "800",
    color: "#111827",
  },
  barLabel: {
    marginTop: 4,
    fontSize: 10,
    fontWeight: "700",
    color: "#6B7280",
  },

  rankCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FAFAFB",
    borderWidth: 1,
    borderColor: "#EEF2F7",
    borderRadius: 16,
    padding: 12,
    marginBottom: 10,
  },
  rankBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#111827",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  rankBadgeText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
  },
  rankTextWrap: {
    flex: 1,
  },
  rankTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#111827",
  },
  rankMeta: {
    fontSize: 12,
    color: "#7C3AED",
    marginTop: 4,
    fontWeight: "700",
  },
  rankStats: {
    fontSize: 11,
    color: "#6B7280",
    marginTop: 4,
    fontWeight: "600",
  },
  rankScoreWrap: {
    alignItems: "flex-end",
    marginLeft: 10,
  },
  rankScore: {
    fontSize: 16,
    fontWeight: "900",
    color: "#111827",
  },
  rankScoreLabel: {
    fontSize: 10,
    color: "#9CA3AF",
    fontWeight: "700",
  },

  categoryRow: {
    marginBottom: 14,
  },
  categoryHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  categoryName: {
    fontSize: 13,
    fontWeight: "800",
    color: "#111827",
  },
  categoryScore: {
    fontSize: 12,
    fontWeight: "800",
    color: "#7C3AED",
  },
  progressTrack: {
    height: 10,
    backgroundColor: "#F3F4F6",
    borderRadius: 999,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#7C3AED",
    borderRadius: 999,
  },
  categoryMeta: {
    marginTop: 6,
    fontSize: 11,
    color: "#6B7280",
    fontWeight: "600",
    lineHeight: 16,
  },

  heatHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  heatDayLabelSpacer: {
    width: 34,
  },
  heatHourLabel: {
    width: 48,
    fontSize: 10,
    color: "#94A3B8",
    fontWeight: "700",
    textAlign: "center",
  },
  heatRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  heatDayLabel: {
    width: 34,
    fontSize: 11,
    color: "#6B7280",
    fontWeight: "700",
  },
  heatCellRow: {
    flexDirection: "row",
  },
  heatCell: {
    width: 12,
    height: 12,
    borderRadius: 3,
    marginRight: 3,
  },
  heatLegendRow: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  heatLegendText: {
    fontSize: 11,
    color: "#6B7280",
    fontWeight: "700",
  },
  heatLegendScale: {
    flexDirection: "row",
    marginHorizontal: 10,
  },
  heatLegendBox: {
    width: 14,
    height: 14,
    borderRadius: 4,
    marginHorizontal: 2,
  },

  conversionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  conversionCard: {
    width: "48.5%",
    backgroundColor: "#FAFAFB",
    borderWidth: 1,
    borderColor: "#EEF2F7",
    borderRadius: 16,
    padding: 12,
    marginBottom: 10,
  },
  conversionLabel: {
    fontSize: 11,
    color: "#94A3B8",
    fontWeight: "700",
    marginBottom: 4,
  },
  conversionValue: {
    fontSize: 16,
    color: "#111827",
    fontWeight: "900",
  },

  funnelCard: {
    marginTop: 8,
    backgroundColor: "#FAFAFB",
    borderWidth: 1,
    borderColor: "#EEF2F7",
    borderRadius: 16,
    padding: 12,
  },
  funnelTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 12,
  },
  funnelStep: {
    marginBottom: 12,
  },
  funnelBar: {
    height: 12,
    backgroundColor: "#7C3AED",
    borderRadius: 999,
    marginBottom: 6,
  },
  funnelBarSecondary: {
    height: 12,
    backgroundColor: "#2563EB",
    borderRadius: 999,
    marginBottom: 6,
  },
  funnelText: {
    fontSize: 11,
    color: "#6B7280",
    fontWeight: "700",
  },

  emptyWrap: {
    paddingVertical: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    fontSize: 12,
    color: "#6B7280",
    fontWeight: "600",
  },
});

import axios from 'axios';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';

import {
    ActivityIndicator,
    RefreshControl,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

import api from '../services/api';
import { useAuthStore } from '../store/auth';

const C = {
  bg: '#F8F7F4',
  white: '#FFFFFF',
  dark: '#252525',
  muted: '#858585',
  orange: '#F59E0B',
  orangeLight: '#FFF3D9',
  green: '#16865B',
  greenLight: '#E5F5EC',
  red: '#D94B4B',
  redLight: '#FCEAEA',
  blue: '#4169A1',
  blueLight: '#EAF0FF',
  border: '#EEECE7',
};

type Order = {
  _id: string;
  createdAt?: string;
  totalAmount?: number;
  orderStatus?: string;
  paymentStatus?: string;
  items?: {
    name: string;
    quantity: number;
    price: number;
  }[];
  user?: {
    name?: string;
    phone?: string;
  } | null;
};

type OrdersResponse = {
  success: boolean;
  count: number;
  orders: Order[];
  message?: string;
};

const ACTIVE_STATUSES = [
  'confirmed',
  'preparing',
  'out_for_delivery',
];

const money = (value: number) =>
  `₹${Number(value || 0).toLocaleString('en-IN')}`;

const formatTime = (value?: string) => {
  if (!value) return 'Time unavailable';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return 'Time unavailable';

  return date.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatStatus = (status?: string) => {
  if (!status) return 'Unknown';

  return status
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
};

const getTodayStart = () => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
};

export default function DashboardScreen() {
  const router = useRouter();
  const token = useAuthStore((state) => state.token);

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  // ==========================================
  // FETCH ORDERS
  // ==========================================

  const fetchOrders = useCallback(
    async (isRefresh = false, silent = false) => {
      if (!token) {
        setError('Admin session not found. Please login again.');
        setLoading(false);
        router.replace('/login');
        return;
      }

      try {
        if (isRefresh) setRefreshing(true);
        else if (!silent) setLoading(true);

        if (!silent) setError('');

        const response = await api.get<OrdersResponse>(
          '/orders/admin/all',
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (
          !response.data.success ||
          !Array.isArray(response.data.orders)
        ) {
          throw new Error(
            response.data.message || 'Invalid orders response.'
          );
        }

        setOrders(response.data.orders);
        setError('');
      } catch (err) {
        console.error('Dashboard orders error:', err);

        if (axios.isAxiosError(err)) {
          if (
            err.response?.status === 401 ||
            err.response?.status === 403
          ) {
            await useAuthStore.getState().logout();
            router.replace('/login');
            return;
          }

          if (!silent) {
            setError(
              err.response?.data?.message ||
                `Unable to load orders (${err.response?.status || 'Network error'}).`
            );
          }
        } else if (!silent) {
          setError(
            err instanceof Error
              ? err.message
              : 'Something went wrong.'
          );
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token, router]
  );

  // ==========================================
  // AUTO REFRESH EVERY 15 SECONDS
  // ==========================================

  useFocusEffect(
    useCallback(() => {
      fetchOrders();

      const interval = setInterval(() => {
        fetchOrders(false, true);
      }, 15000);

      return () => clearInterval(interval);
    }, [fetchOrders])
  );

  // ==========================================
  // DASHBOARD CALCULATIONS
  // ==========================================

  const todayStart = getTodayStart();

  const todayOrders = orders.filter((order) => {
    if (!order.createdAt) return false;

    const date = new Date(order.createdAt);

    return (
      !Number.isNaN(date.getTime()) &&
      date >= todayStart
    );
  });

  const activeOrders = orders.filter((order) =>
    ACTIVE_STATUSES.includes(order.orderStatus || '')
  );

  const pendingOrders = orders.filter(
    (order) => order.orderStatus === 'pending'
  );

  const preparingOrders = orders.filter(
    (order) => order.orderStatus === 'preparing'
  );

  const completedOrders = orders.filter(
    (order) => order.orderStatus === 'delivered'
  );

  const cancelledOrders = orders.filter(
    (order) => order.orderStatus === 'cancelled'
  );

  const todayRevenue = todayOrders
    .filter((order) => order.orderStatus !== 'cancelled')
    .reduce(
      (total, order) =>
        total + Number(order.totalAmount || 0),
      0
    );

  // ==========================================
  // LOGOUT
  // ==========================================

  const handleLogout = async () => {
    await useAuthStore.getState().logout();
    router.replace('/login');
  };

  // ==========================================
  // DASHBOARD UI
  // ==========================================

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingBottom: activeOrders.length > 0 ? 115 : 35,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => fetchOrders(true)}
            tintColor={C.orange}
          />
        }
      >
        {/* HEADER */}

        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>
              EATWELL RESTAURANT
            </Text>

            <Text style={styles.heading}>
              Dashboard
            </Text>

            <Text style={styles.headerSubtitle}>
              Here's your business overview
            </Text>
          </View>

          <TouchableOpacity
            style={styles.profile}
            onPress={() => router.push('/settings' as any)}
          >
            <Text style={styles.profileText}>E</Text>
          </TouchableOpacity>
        </View>

        {/* WELCOME BANNER */}

        <View style={styles.banner}>
          <View style={{ flex: 1 }}>
            <Text style={styles.bannerLabel}>
              ADMIN OVERVIEW
            </Text>

            <Text style={styles.bannerTitle}>
              Good food.{' \n'}Great business.
            </Text>

            <Text style={styles.bannerSubtitle}>
              Keep your restaurant running smoothly.
            </Text>
          </View>

          <Text style={styles.bannerEmoji}>🍔</Text>
        </View>

        {/* ERROR */}

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorTitle}>
              Couldn't load dashboard
            </Text>

            <Text style={styles.errorMessage}>
              {error}
            </Text>

            <TouchableOpacity
              style={styles.retryButton}
              onPress={() => fetchOrders()}
            >
              <Text style={styles.retryText}>
                Try again
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* LOADING */}

        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator
              size="large"
              color={C.orange}
            />

            <Text style={styles.loadingText}>
              Loading restaurant data...
            </Text>
          </View>
        ) : (
          <>
            {/* REVENUE */}

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>
                Today's Revenue
              </Text>

              <Text style={styles.liveLabel}>
                ● LIVE DATA
              </Text>
            </View>

            <View style={styles.revenueCard}>
              <View style={styles.revenueTop}>
                <View style={styles.revenueIcon}>
                  <Text style={{ fontSize: 22 }}>
                    💰
                  </Text>
                </View>

                <Text style={styles.revenueCaption}>
                  From today's orders
                </Text>
              </View>

              <Text style={styles.revenueAmount}>
                {money(todayRevenue)}
              </Text>

              <Text style={styles.revenueNote}>
                Based on non-cancelled orders
              </Text>
            </View>

            {/* ORDER OVERVIEW */}

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>
                Order Overview
              </Text>

              <Text style={styles.sectionHint}>
                All time
              </Text>
            </View>

            <View style={styles.statsGrid}>
              <StatCard
                icon="📦"
                label="Total Orders"
                value={orders.length}
                color={C.orangeLight}
              />

              <StatCard
                icon="🛍️"
                label="Today's Orders"
                value={todayOrders.length}
                color={C.blueLight}
              />

              <StatCard
                icon="⏳"
                label="Pending"
                value={pendingOrders.length}
                color="#FFF0E9"
              />

              <StatCard
                icon="👨‍🍳"
                label="Preparing"
                value={preparingOrders.length}
                color={C.orangeLight}
              />

              <StatCard
                icon="🚚"
                label="Active Orders"
                value={activeOrders.length}
                color={C.blueLight}
              />

              <StatCard
                icon="✅"
                label="Delivered"
                value={completedOrders.length}
                color={C.greenLight}
              />

              <StatCard
                icon="🚫"
                label="Cancelled"
                value={cancelledOrders.length}
                color={C.redLight}
              />
            </View>

            {/* QUICK ACTIONS */}

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>
                Quick Actions
              </Text>
            </View>

            <View style={styles.actionsGrid}>
              <ActionCard
                icon="📋"
                title="All Orders"
                subtitle={`${orders.length} orders`}
                onPress={() => router.push('/orders' as any)}
              />

              <ActionCard
                icon="🍔"
                title="Food Menu"
                subtitle="Manage food items"
                onPress={() => router.push('/menu' as any)}
              />

              <ActionCard
                icon="📊"
                title="Analytics"
                subtitle="Business performance"
                onPress={() => router.push('/analytics' as any)}
              />

              <ActionCard
                icon="⚙️"
                title="Settings"
                subtitle="Restaurant settings"
                onPress={() => router.push('/settings' as any)}
              />
            </View>

            {/* RECENT ORDERS */}

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>
                Recent Orders
              </Text>

              <TouchableOpacity
                onPress={() => router.push('/orders' as any)}
              >
                <Text style={styles.viewAll}>
                  View all →
                </Text>
              </TouchableOpacity>
            </View>

            {orders.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyEmoji}>📋</Text>

                <Text style={styles.emptyTitle}>
                  No orders yet
                </Text>

                <Text style={styles.emptySubtitle}>
                  New customer orders will appear here.
                </Text>
              </View>
            ) : (
              orders.slice(0, 5).map((order) => (
                <View
                  key={order._id}
                  style={styles.orderCard}
                >
                  <View style={styles.orderTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.orderId}>
                        #{order._id.slice(-7).toUpperCase()}
                      </Text>

                      <Text style={styles.orderCustomer}>
                        {order.user?.name || 'Customer'}
                      </Text>

                      <Text style={styles.orderTime}>
                        {formatTime(order.createdAt)}
                      </Text>
                    </View>

                    <View style={styles.orderRight}>
                      <Text style={styles.orderAmount}>
                        {money(Number(order.totalAmount || 0))}
                      </Text>

                      <StatusPill
                        status={order.orderStatus}
                      />
                    </View>
                  </View>

                  <View style={styles.orderDivider} />

                  <Text
                    style={styles.orderItems}
                    numberOfLines={2}
                  >
                    {order.items
                      ?.map(
                        (item) =>
                          `${item.name} × ${item.quantity}`
                      )
                      .join(', ') || 'Order items unavailable'}
                  </Text>

                  <Text style={styles.orderPayment}>
                    Payment: {formatStatus(order.paymentStatus)}
                  </Text>
                </View>
              ))
            )}

            {/* LOGOUT */}

            <TouchableOpacity
              style={styles.logoutButton}
              onPress={handleLogout}
            >
              <Text style={styles.logoutText}>
                Logout
              </Text>
            </TouchableOpacity>
          </>
        )}

        <Text style={styles.footer}>
          EATWELL ADMIN • VERSION 1.0.0
        </Text>
      </ScrollView>

      {/* FLOATING ACTIVE ORDERS BUTTON */}

      {activeOrders.length > 0 && (
        <TouchableOpacity
          activeOpacity={0.85}
          style={styles.floatingActiveButton}
          onPress={() => router.push('/orders' as any)}
        >
          <View style={styles.activeIcon}>
            <Text style={{ fontSize: 21 }}>🛵</Text>
          </View>

          <View style={{ flex: 1 }}>
            <Text style={styles.activeTitle}>
              Active Orders
            </Text>

            <Text style={styles.activeSubtitle}>
              {activeOrders.length} order(s) need attention
            </Text>
          </View>

          <View style={styles.activeCount}>
            <Text style={styles.activeCountText}>
              {activeOrders.length}
            </Text>
          </View>

          <Text style={styles.activeArrow}>›</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ==========================================
// STAT CARD
// ==========================================

function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: string;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <View style={styles.statCard}>
      <View
        style={[
          styles.statIcon,
          { backgroundColor: color },
        ]}
      >
        <Text style={{ fontSize: 19 }}>{icon}</Text>
      </View>

      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// ==========================================
// ACTION CARD
// ==========================================

function ActionCard({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: string;
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={styles.actionCard}
      activeOpacity={0.75}
      onPress={onPress}
    >
      <View style={styles.actionIcon}>
        <Text style={{ fontSize: 21 }}>{icon}</Text>
      </View>

      <Text style={styles.actionTitle}>{title}</Text>
      <Text style={styles.actionSubtitle}>{subtitle}</Text>
    </TouchableOpacity>
  );
}

// ==========================================
// STATUS PILL
// ==========================================

function StatusPill({ status }: { status?: string }) {
  const value = status || 'unknown';

  const color =
    value === 'delivered'
      ? C.green
      : value === 'cancelled'
        ? C.red
        : value === 'pending'
          ? '#C17A00'
          : C.blue;

  const background =
    value === 'delivered'
      ? C.greenLight
      : value === 'cancelled'
        ? C.redLight
        : value === 'pending'
          ? C.orangeLight
          : C.blueLight;

  return (
    <View
      style={[
        styles.statusPill,
        { backgroundColor: background },
      ]}
    >
      <Text style={[styles.statusText, { color }]}>
        {formatStatus(status)}
      </Text>
    </View>
  );
}

// ==========================================
// STYLES
// ==========================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
  },

  header: {
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  eyebrow: {
    color: C.orange,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 2,
  },

  heading: {
    color: C.dark,
    fontSize: 27,
    fontWeight: '900',
    marginTop: 5,
  },

  headerSubtitle: {
    color: C.muted,
    fontSize: 12,
    marginTop: 4,
  },

  profile: {
    width: 46,
    height: 46,
    borderRadius: 16,
    backgroundColor: C.orange,
    alignItems: 'center',
    justifyContent: 'center',
  },

  profileText: {
    color: C.white,
    fontSize: 24,
    fontWeight: '900',
  },

  banner: {
    marginHorizontal: 20,
    padding: 21,
    borderRadius: 22,
    backgroundColor: '#252525',
    flexDirection: 'row',
    alignItems: 'center',
  },

  bannerLabel: {
    color: '#FFC45A',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 2,
  },

  bannerTitle: {
    color: C.white,
    fontSize: 27,
    fontWeight: '900',
    lineHeight: 33,
    marginTop: 10,
  },

  bannerSubtitle: {
    color: '#D0D0D0',
    fontSize: 11,
    marginTop: 9,
  },

  bannerEmoji: {
    fontSize: 55,
    marginLeft: 8,
  },

  sectionHeader: {
    marginHorizontal: 22,
    marginTop: 27,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  sectionTitle: {
    color: C.dark,
    fontSize: 17,
    fontWeight: '900',
  },

  sectionHint: {
    color: C.muted,
    fontSize: 10,
  },

  liveLabel: {
    color: C.green,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1,
  },

  revenueCard: {
    marginHorizontal: 20,
    padding: 19,
    borderRadius: 19,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.border,
  },

  revenueTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  revenueIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: C.greenLight,
    alignItems: 'center',
    justifyContent: 'center',
  },

  revenueCaption: {
    color: C.muted,
    fontSize: 12,
  },

  revenueAmount: {
    color: C.dark,
    fontSize: 32,
    fontWeight: '900',
    marginTop: 17,
  },

  revenueNote: {
    color: C.muted,
    fontSize: 10,
    marginTop: 5,
  },

  statsGrid: {
    paddingHorizontal: 20,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },

  statCard: {
    width: '48%',
    flexGrow: 1,
    backgroundColor: C.white,
    borderRadius: 17,
    padding: 15,
    borderWidth: 1,
    borderColor: C.border,
  },

  statIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },

  statValue: {
    color: C.dark,
    fontSize: 25,
    fontWeight: '900',
    marginTop: 13,
  },

  statLabel: {
    color: C.muted,
    fontSize: 11,
    fontWeight: '600',
    marginTop: 3,
  },

  actionsGrid: {
    paddingHorizontal: 20,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },

  actionCard: {
    width: '48%',
    flexGrow: 1,
    backgroundColor: C.white,
    borderRadius: 17,
    padding: 15,
    borderWidth: 1,
    borderColor: C.border,
  },

  actionIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: C.orangeLight,
    alignItems: 'center',
    justifyContent: 'center',
  },

  actionTitle: {
    color: C.dark,
    fontSize: 14,
    fontWeight: '900',
    marginTop: 12,
  },

  actionSubtitle: {
    color: C.muted,
    fontSize: 10,
    marginTop: 4,
  },

  viewAll: {
    color: C.orange,
    fontSize: 12,
    fontWeight: '800',
  },

  orderCard: {
    marginHorizontal: 20,
    marginBottom: 12,
    padding: 16,
    backgroundColor: C.white,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: C.border,
  },

  orderTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },

  orderId: {
    color: C.dark,
    fontSize: 13,
    fontWeight: '900',
  },

  orderCustomer: {
    color: C.dark,
    fontSize: 12,
    marginTop: 6,
    fontWeight: '700',
  },

  orderTime: {
    color: C.muted,
    fontSize: 10,
    marginTop: 4,
  },

  orderRight: {
    alignItems: 'flex-end',
    gap: 8,
  },

  orderAmount: {
    color: C.dark,
    fontSize: 15,
    fontWeight: '900',
  },

  statusPill: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
  },

  statusText: {
    fontSize: 9,
    fontWeight: '900',
  },

  orderDivider: {
    height: 1,
    backgroundColor: C.border,
    marginVertical: 12,
  },

  orderItems: {
    color: C.dark,
    fontSize: 11,
    lineHeight: 17,
  },

  orderPayment: {
    color: C.muted,
    fontSize: 10,
    marginTop: 8,
  },

  emptyCard: {
    marginHorizontal: 20,
    padding: 25,
    backgroundColor: C.white,
    borderRadius: 18,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.border,
  },

  emptyEmoji: {
    fontSize: 35,
  },

  emptyTitle: {
    color: C.dark,
    fontSize: 14,
    fontWeight: '900',
    marginTop: 12,
  },

  emptySubtitle: {
    color: C.muted,
    fontSize: 11,
    textAlign: 'center',
    marginTop: 7,
  },

  loadingBox: {
    padding: 45,
    alignItems: 'center',
  },

  loadingText: {
    color: C.muted,
    fontSize: 12,
    marginTop: 12,
  },

  errorBox: {
    marginHorizontal: 20,
    marginTop: 20,
    padding: 17,
    borderRadius: 15,
    backgroundColor: C.redLight,
  },

  errorTitle: {
    color: C.red,
    fontSize: 14,
    fontWeight: '900',
  },

  errorMessage: {
    color: C.dark,
    fontSize: 11,
    marginTop: 7,
  },

  retryButton: {
    alignSelf: 'flex-start',
    marginTop: 12,
    backgroundColor: C.white,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 9,
  },

  retryText: {
    color: C.red,
    fontSize: 11,
    fontWeight: '900',
  },

  logoutButton: {
    marginHorizontal: 20,
    marginTop: 25,
    padding: 15,
    backgroundColor: C.redLight,
    borderRadius: 13,
    alignItems: 'center',
  },

  logoutText: {
    color: C.red,
    fontWeight: '800',
    fontSize: 13,
  },

  footer: {
    textAlign: 'center',
    color: '#A5A29B',
    fontSize: 9,
    letterSpacing: 2,
    marginTop: 23,
    marginBottom: 30,
  },

  // FLOATING ACTIVE ORDERS

  floatingActiveButton: {
    position: 'absolute',
    bottom: 18,
    left: 16,
    right: 16,
    minHeight: 72,
    backgroundColor: '#252525',
    borderRadius: 19,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.2,
    shadowRadius: 9,
  },

  activeIcon: {
    width: 43,
    height: 43,
    borderRadius: 14,
    backgroundColor: '#3A3328',
    alignItems: 'center',
    justifyContent: 'center',
  },

  activeTitle: {
    color: C.white,
    fontSize: 14,
    fontWeight: '900',
  },

  activeSubtitle: {
    color: '#BDBDBD',
    fontSize: 10,
    marginTop: 4,
  },

  activeCount: {
    minWidth: 29,
    height: 29,
    paddingHorizontal: 7,
    borderRadius: 15,
    backgroundColor: C.orange,
    alignItems: 'center',
    justifyContent: 'center',
  },

  activeCountText: {
    color: C.white,
    fontSize: 12,
    fontWeight: '900',
  },

  activeArrow: {
    color: C.white,
    fontSize: 28,
    fontWeight: '400',
  },
});

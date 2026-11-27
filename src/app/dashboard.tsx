import axios from 'axios';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
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

type Order = {
  _id: string;
  createdAt?: string;
  totalAmount?: number;
  orderStatus?: string;
  paymentStatus?: string;
  paymentMethod?: string;
  orderType?: 'online' | 'offline' | string;
  items?: {
    name?: string;
    quantity?: number;
    price?: number;
  }[];
  user?: {
    name?: string;
    phone?: string;
  } | null;
};

type OrdersResponse = {
  success: boolean;
  orders: Order[];
  message?: string;
};

const C = {
  bg: '#F6F5F2',
  white: '#FFFFFF',
  ink: '#20211F',
  muted: '#858780',
  subtle: '#A5A69F',
  orange: '#F59E0B',
  orangeDark: '#D97706',
  orangeSoft: '#FFF3D9',
  green: '#16865B',
  greenSoft: '#E5F5EC',
  blue: '#4169A1',
  blueSoft: '#EAF0FF',
  red: '#D94B4B',
  redSoft: '#FCEAEA',
  border: '#ECEBE6',
  dark: '#242522',
};

const ACTIVE = ['confirmed', 'preparing', 'out_for_delivery'];

const money = (n: number) =>
  `₹${Number(n || 0).toLocaleString('en-IN', {
    maximumFractionDigits: 2,
  })}`;

const orderType = (o: Order): 'online' | 'offline' =>
  o.orderType?.toLowerCase() === 'offline' ? 'offline' : 'online';

const paid = (o: Order) =>
  o.paymentStatus?.toLowerCase() === 'paid' &&
  o.orderStatus !== 'cancelled';

const statusText = (s?: string) =>
  (s || 'unknown')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, x => x.toUpperCase());

const timeText = (s?: string) => {
  if (!s) return 'Time unavailable';

  const d = new Date(s);

  return Number.isNaN(d.getTime())
    ? 'Time unavailable'
    : d.toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
};

export default function DashboardScreen() {
  const router = useRouter();
  const token = useAuthStore(s => s.token);

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // ==========================================
  // FETCH ORDERS FROM DATABASE
  // ==========================================

  const fetchOrders = useCallback(
    async (refresh = false, silent = false) => {
      if (!token) {
        setError('Admin session not found. Please login again.');
        setLoading(false);
        router.replace('/login');
        return;
      }

      try {
        if (refresh) setRefreshing(true);
        else if (!silent) setLoading(true);

        if (!silent) setError('');

        const res = await api.get<OrdersResponse>(
          '/orders/admin/all',
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        );

        if (
          !res.data.success ||
          !Array.isArray(res.data.orders)
        ) {
          throw new Error(
            res.data.message || 'Invalid orders response.',
          );
        }

        setOrders(res.data.orders);
        setLastUpdated(new Date());
        setError('');
      } catch (e) {
        console.error('Dashboard orders error:', e);

        if (axios.isAxiosError(e)) {
          if (
            e.response?.status === 401 ||
            e.response?.status === 403
          ) {
            await useAuthStore.getState().logout();
            router.replace('/login');
            return;
          }

          if (!silent) {
            setError(
              e.response?.data?.message ||
                `Unable to load orders (${
                  e.response?.status || 'Network error'
                }).`,
            );
          }
        } else if (!silent) {
          setError(
            e instanceof Error
              ? e.message
              : 'Something went wrong.',
          );
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token, router],
  );

  // ==========================================
  // AUTO REFRESH EVERY 15 SECONDS
  // ==========================================

  useFocusEffect(
    useCallback(() => {
      fetchOrders();

      const timer = setInterval(() => {
        fetchOrders(false, true);
      }, 15000);

      return () => clearInterval(timer);
    }, [fetchOrders]),
  );

  // ==========================================
  // DASHBOARD CALCULATIONS
  // ==========================================

  const data = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    const today = orders.filter(
      o =>
        o.createdAt &&
        new Date(o.createdAt) >= start,
    );

    const online = today.filter(
      o => orderType(o) === 'online',
    );

    const offline = today.filter(
      o => orderType(o) === 'offline',
    );

    const revenue = (list: Order[]) =>
      list
        .filter(paid)
        .reduce(
          (sum, o) =>
            sum + Number(o.totalAmount || 0),
          0,
        );

    return {
      today,
      online,
      offline,

      onlineRevenue: revenue(online),
      offlineRevenue: revenue(offline),
      totalRevenue: revenue(today),

      allOnline: orders.filter(
        o => orderType(o) === 'online',
      ).length,

      allOffline: orders.filter(
        o => orderType(o) === 'offline',
      ).length,

      pending: orders.filter(
        o => o.orderStatus === 'pending',
      ).length,

      preparing: orders.filter(
        o => o.orderStatus === 'preparing',
      ).length,

      active: orders.filter(
        o => ACTIVE.includes(o.orderStatus || ''),
      ),

      delivered: orders.filter(
        o => o.orderStatus === 'delivered',
      ).length,

      cancelled: orders.filter(
        o => o.orderStatus === 'cancelled',
      ).length,
    };
  }, [orders]);

  const onlinePct =
    data.totalRevenue > 0
      ? Math.round(
          (data.onlineRevenue / data.totalRevenue) * 100,
        )
      : 0;

  const offlinePct =
    data.totalRevenue > 0
      ? Math.round(
          (data.offlineRevenue / data.totalRevenue) * 100,
        )
      : 0;

  const go = (path: string) =>
    router.push(path as any);

  const logout = async () => {
    await useAuthStore.getState().logout();
    router.replace('/login');
  };

  // ==========================================
  // DASHBOARD UI
  // ==========================================

  return (
    <View style={s.container}>
      <StatusBar barStyle="dark-content" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingBottom: data.active.length ? 112 : 35,
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

        <View style={s.header}>
          <View>
            <Text style={s.eyebrow}>
              EATWELL • RESTAURANT MANAGEMENT
            </Text>

            <Text style={s.heading}>
              Dashboard
            </Text>

            <Text style={s.subheading}>
              Your business, at a glance.
            </Text>
          </View>

          <TouchableOpacity
            style={s.avatar}
            onPress={() => go('/settings')}
          >
            <Text style={s.avatarText}>E</Text>
          </TouchableOpacity>
        </View>

        {/* HERO BANNER */}

        <View style={s.hero}>
          <View style={{ flex: 1 }}>
            <Text style={s.heroEyebrow}>
              GOOD FOOD. GREAT BUSINESS.
            </Text>

            <Text style={s.heroTitle}>
              Welcome back, Admin
            </Text>

            <Text style={s.heroSub}>
              Keep your restaurant running smoothly today.
            </Text>

            <View style={s.liveRow}>
              <View style={s.liveDot} />

              <Text style={s.liveText}>
                LIVE ORDER SYNC
              </Text>
            </View>
          </View>

          <Text style={s.heroEmoji}>🍔</Text>

          <View style={s.heroOrb} />
        </View>

        {/* ERROR */}

        {error ? (
          <View style={s.errorBox}>
            <Text style={s.errorTitle}>
              Couldn't load dashboard
            </Text>

            <Text style={s.errorText}>
              {error}
            </Text>

            <TouchableOpacity
              style={s.retry}
              onPress={() => fetchOrders()}
            >
              <Text style={s.retryText}>
                Try again
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* LOADING */}

        {loading ? (
          <View style={s.loading}>
            <ActivityIndicator
              size="large"
              color={C.orange}
            />

            <Text style={s.muted}>
              Loading live restaurant data...
            </Text>
          </View>
        ) : (
          <>
            {/* REVENUE */}

            <Section
              title="Today's revenue"
              subtitle="Paid orders · Cancelled orders excluded"
              right="TODAY"
            />

            <View style={s.revenueCard}>
              <View style={s.revenueTop}>
                <View style={s.rupeeIcon}>
                  <Text style={s.rupee}>₹</Text>
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={s.revenueLabel}>
                    Total collected revenue
                  </Text>

                  <Text style={s.mutedSmall}>
                    Online + Offline
                  </Text>
                </View>

                <Text style={s.liveBadge}>
                  ● LIVE
                </Text>
              </View>

              <Text style={s.totalRevenue}>
                {money(data.totalRevenue)}
              </Text>

              <View style={s.divider} />

              <View style={s.split}>
                <View style={{ flex: 1 }}>
                  <Text style={s.channelLabel}>
                    🟠 Online
                  </Text>

                  <Text style={s.splitAmount}>
                    {money(data.onlineRevenue)}
                  </Text>

                  <Text style={s.mutedSmall}>
                    {onlinePct}% of revenue
                  </Text>
                </View>

                <View style={s.verticalDivider} />

                <View style={{ flex: 1 }}>
                  <Text style={s.channelLabel}>
                    🟢 Offline / POS
                  </Text>

                  <Text style={s.splitAmount}>
                    {money(data.offlineRevenue)}
                  </Text>

                  <Text style={s.mutedSmall}>
                    {offlinePct}% of revenue
                  </Text>
                </View>
              </View>
            </View>

            {/* SALES CHANNELS */}

            <Section
              title="Sales channels"
              subtitle="Today's order volume"
            />

            <View style={s.twoColumns}>
              <View style={s.channelCard}>
                <View style={s.channelHead}>
                  <Text style={s.channelIcon}>📱</Text>

                  <Text style={s.onlineTag}>
                    ONLINE
                  </Text>
                </View>

                <Text style={s.channelCount}>
                  {data.online.length}
                </Text>

                <Text style={s.mutedSmall}>
                  Customer app orders
                </Text>

                <Text style={s.channelMoney}>
                  {money(data.onlineRevenue)}
                </Text>
              </View>

              <View style={s.channelCard}>
                <View style={s.channelHead}>
                  <Text style={s.channelIcon}>🧾</Text>

                  <Text style={s.offlineTag}>
                    OFFLINE POS
                  </Text>
                </View>

                <Text style={s.channelCount}>
                  {data.offline.length}
                </Text>

                <Text style={s.mutedSmall}>
                  Counter bills
                </Text>

                <Text style={s.channelMoney}>
                  {money(data.offlineRevenue)}
                </Text>
              </View>
            </View>

            {/* ORDER OVERVIEW */}

            <Section
              title="Order overview"
              subtitle="All-time order status"
              action="Manage orders ›"
              onAction={() => go('/orders')}
            />

            <View style={s.statsGrid}>
              <Stat
                icon="📦"
                label="All orders"
                value={orders.length}
                tint={C.orangeSoft}
              />

              <Stat
                icon="⏳"
                label="Pending"
                value={data.pending}
                tint="#FFF0E9"
              />

              <Stat
                icon="👨‍🍳"
                label="Preparing"
                value={data.preparing}
                tint={C.orangeSoft}
              />

              <Stat
                icon="🛵"
                label="Active"
                value={data.active.length}
                tint={C.blueSoft}
              />

              <Stat
                icon="✅"
                label="Delivered"
                value={data.delivered}
                tint={C.greenSoft}
              />

              <Stat
                icon="🚫"
                label="Cancelled"
                value={data.cancelled}
                tint={C.redSoft}
              />
            </View>

            {/* QUICK ACTIONS */}

            <Section
              title="Quick actions"
              subtitle="Manage your restaurant"
            />

            <View style={s.actionsGrid}>
              <Action
                icon="🛍️"
                title="Online orders"
                detail={`${data.allOnline} total orders`}
                tint={C.orangeSoft}
                onPress={() => go('/orders')}
              />

              <Action
                icon="🧾"
                title="POS billing"
                detail="Create counter bill"
                tint={C.greenSoft}
                onPress={() => go('/pos')}
              />

              <Action
                icon="🍔"
                title="Food menu"
                detail="Manage products"
                tint={C.orangeSoft}
                onPress={() => go('/menu')}
              />

              <Action
                icon="📂"
                title="Categories"
                detail="Manage food categories"
                tint={C.blueSoft}
                onPress={() => go('/categories')}
              />

              <Action
                icon="🚚"
                title="Delivery"
                detail="Track deliveries"
                tint={C.blueSoft}
                onPress={() => go('/delivery')}
              />

              <Action
                icon="📊"
                title="Analytics"
                detail="Revenue and reports"
                tint={C.greenSoft}
                onPress={() => go('/analytics')}
              />
            </View>

            {/* RECENT ORDERS */}

            <Section
              title="Recent orders"
              subtitle="Latest restaurant activity"
              action="View all ›"
              onAction={() => go('/orders')}
            />

            {orders.length === 0 ? (
              <View style={s.empty}>
                <Text style={{ fontSize: 34 }}>
                  📋
                </Text>

                <Text style={s.emptyTitle}>
                  No orders yet
                </Text>

                <Text style={s.mutedSmall}>
                  Customer orders and POS bills will appear here.
                </Text>
              </View>
            ) : (
              [...orders]
                .sort(
                  (a, b) =>
                    new Date(b.createdAt || 0).getTime() -
                    new Date(a.createdAt || 0).getTime(),
                )
                .slice(0, 6)
                .map(o => (
                  <TouchableOpacity
                    key={o._id}
                    style={s.orderCard}
                    activeOpacity={0.85}
                    onPress={() => go('/orders')}
                  >
                    <View style={s.orderHead}>
                      <View style={{ flex: 1 }}>
                        <View style={s.orderTitleRow}>
                          <Text style={s.orderId}>
                            #{o._id.slice(-7).toUpperCase()}
                          </Text>

                          <TypePill type={orderType(o)} />
                        </View>

                        <Text style={s.customer}>
                          {o.user?.name ||
                            (orderType(o) === 'offline'
                              ? 'Walk-in customer'
                              : 'Customer')}
                        </Text>

                        <Text style={s.mutedSmall}>
                          {timeText(o.createdAt)}
                        </Text>
                      </View>

                      <View style={{ alignItems: 'flex-end', gap: 7 }}>
                        <Text style={s.orderAmount}>
                          {money(Number(o.totalAmount || 0))}
                        </Text>

                        <StatusPill status={o.orderStatus} />
                      </View>
                    </View>

                    <View style={s.divider} />

                    <Text
                      style={s.orderItems}
                      numberOfLines={2}
                    >
                      {o.items
                        ?.map(
                          i =>
                            `${i.name || 'Item'} × ${i.quantity || 1}`,
                        )
                        .join(', ') || 'Order items unavailable'}
                    </Text>

                    <View style={s.orderFoot}>
                      <Text style={s.mutedSmall}>
                        Payment: {statusText(o.paymentStatus)}
                        {o.paymentMethod
                          ? ` · ${statusText(o.paymentMethod)}`
                          : ''}
                      </Text>

                      <Text style={s.viewOrder}>
                        View ›
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))
            )}

            {/* LAST SYNC */}

            <Text style={s.syncText}>
              {lastUpdated
                ? `Last synced ${lastUpdated.toLocaleTimeString('en-IN', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}`
                : 'Waiting for sync'}
            </Text>

            <Text style={s.version}>
              EATWELL ADMIN • 2.0
            </Text>

            {/* LOGOUT */}

            <TouchableOpacity
              style={s.logout}
              onPress={logout}
            >
              <Text style={s.logoutText}>
                Log out
              </Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>

      {/* FLOATING ACTIVE ORDERS */}

      {data.active.length > 0 && !loading ? (
        <TouchableOpacity
          style={s.floating}
          activeOpacity={0.88}
          onPress={() => go('/orders')}
        >
          <Text style={{ fontSize: 21 }}>🛵</Text>

          <View style={{ flex: 1 }}>
            <Text style={s.floatingTitle}>
              Orders need attention
            </Text>

            <Text style={s.floatingSub}>
              {data.active.length} active order(s) in progress
            </Text>
          </View>

          <View style={s.floatingCount}>
            <Text
              style={{
                color: C.white,
                fontWeight: '900',
              }}
            >
              {data.active.length}
            </Text>
          </View>

          <Text style={{ color: C.white, fontSize: 24 }}>
            ›
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

// ==========================================
// SECTION HEADER
// ==========================================

function Section({
  title,
  subtitle,
  right,
  action,
  onAction,
}: {
  title: string;
  subtitle?: string;
  right?: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View style={s.section}>
      <View>
        <Text style={s.sectionTitle}>
          {title}
        </Text>

        {subtitle ? (
          <Text style={s.sectionSub}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      {action ? (
        <TouchableOpacity onPress={onAction}>
          <Text style={s.sectionAction}>
            {action}
          </Text>
        </TouchableOpacity>
      ) : right ? (
        <Text style={s.today}>
          {right}
        </Text>
      ) : null}
    </View>
  );
}

// ==========================================
// STAT CARD
// ==========================================

function Stat({
  icon,
  label,
  value,
  tint,
}: {
  icon: string;
  label: string;
  value: number;
  tint: string;
}) {
  return (
    <View style={s.stat}>
      <View
        style={[
          s.statIcon,
          { backgroundColor: tint },
        ]}
      >
        <Text style={{ fontSize: 17 }}>
          {icon}
        </Text>
      </View>

      <Text style={s.statValue}>
        {value}
      </Text>

      <Text style={s.statLabel}>
        {label}
      </Text>
    </View>
  );
}

// ==========================================
// QUICK ACTION CARD
// ==========================================

function Action({
  icon,
  title,
  detail,
  tint,
  onPress,
}: {
  icon: string;
  title: string;
  detail: string;
  tint: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={s.action}
      activeOpacity={0.8}
      onPress={onPress}
    >
      <View
        style={[
          s.actionIcon,
          { backgroundColor: tint },
        ]}
      >
        <Text style={{ fontSize: 20 }}>
          {icon}
        </Text>
      </View>

      <Text style={s.actionTitle}>
        {title}
      </Text>

      <Text style={s.actionDetail}>
        {detail}
      </Text>

      <Text style={s.actionArrow}>
        ↗
      </Text>
    </TouchableOpacity>
  );
}

// ==========================================
// ONLINE / OFFLINE PILL
// ==========================================

function TypePill({
  type,
}: {
  type: 'online' | 'offline';
}) {
  const off = type === 'offline';

  return (
    <View
      style={[
        s.typePill,
        {
          backgroundColor: off
            ? C.greenSoft
            : C.orangeSoft,
        },
      ]}
    >
      <Text
        style={{
          color: off ? C.green : C.orangeDark,
          fontSize: 8,
          fontWeight: '900',
        }}
      >
        {off ? 'OFFLINE' : 'ONLINE'}
      </Text>
    </View>
  );
}

// ==========================================
// ORDER STATUS PILL
// ==========================================

function StatusPill({
  status,
}: {
  status?: string;
}) {
  const v = status || 'unknown';

  const color =
    v === 'delivered'
      ? C.green
      : v === 'cancelled'
        ? C.red
        : v === 'pending'
          ? '#C17A00'
          : C.blue;

  const bg =
    v === 'delivered'
      ? C.greenSoft
      : v === 'cancelled'
        ? C.redSoft
        : v === 'pending'
          ? C.orangeSoft
          : C.blueSoft;

  return (
    <View
      style={[
        s.statusPill,
        { backgroundColor: bg },
      ]}
    >
      <Text
        style={{
          color,
          fontSize: 8,
          fontWeight: '900',
        }}
      >
        {statusText(status)}
      </Text>
    </View>
  );
}

// ==========================================
// STYLES
// ==========================================

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
  },

  header: {
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 19,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  eyebrow: {
    color: C.orangeDark,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.5,
  },

  heading: {
    color: C.ink,
    fontSize: 29,
    fontWeight: '900',
    marginTop: 5,
  },

  subheading: {
    color: C.muted,
    fontSize: 12,
    marginTop: 4,
  },

  avatar: {
    width: 47,
    height: 47,
    borderRadius: 16,
    backgroundColor: C.dark,
    alignItems: 'center',
    justifyContent: 'center',
  },

  avatarText: {
    color: C.white,
    fontSize: 23,
    fontWeight: '900',
  },

  hero: {
    marginHorizontal: 20,
    padding: 21,
    minHeight: 165,
    borderRadius: 23,
    backgroundColor: C.dark,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
  },

  heroEyebrow: {
    color: '#FFC45A',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.2,
  },

  heroTitle: {
    color: C.white,
    fontSize: 23,
    fontWeight: '900',
    marginTop: 12,
  },

  heroSub: {
    color: '#C9CAC4',
    fontSize: 11,
    marginTop: 7,
    lineHeight: 17,
    maxWidth: 220,
  },

  liveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 15,
  },

  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#64D49B',
  },

  liveText: {
    color: '#B8C9BE',
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1,
  },

  heroEmoji: {
    fontSize: 53,
    marginLeft: 5,
    zIndex: 2,
  },

  heroOrb: {
    position: 'absolute',
    width: 170,
    height: 170,
    borderRadius: 90,
    right: -60,
    top: 35,
    backgroundColor: '#35362F',
  },

  section: {
    marginHorizontal: 22,
    marginTop: 27,
    marginBottom: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  sectionTitle: {
    color: C.ink,
    fontSize: 17,
    fontWeight: '900',
  },

  sectionSub: {
    color: C.muted,
    fontSize: 10,
    marginTop: 4,
  },

  sectionAction: {
    color: C.orangeDark,
    fontSize: 10,
    fontWeight: '900',
  },

  today: {
    color: C.orangeDark,
    backgroundColor: C.orangeSoft,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    fontSize: 9,
    fontWeight: '900',
  },

  revenueCard: {
    marginHorizontal: 20,
    padding: 19,
    borderRadius: 21,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.border,
  },

  revenueTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },

  rupeeIcon: {
    width: 43,
    height: 43,
    borderRadius: 14,
    backgroundColor: C.greenSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },

  rupee: {
    color: C.green,
    fontSize: 23,
    fontWeight: '900',
  },

  revenueLabel: {
    color: C.ink,
    fontSize: 12,
    fontWeight: '800',
  },

  mutedSmall: {
    color: C.muted,
    fontSize: 9,
    marginTop: 4,
  },

  liveBadge: {
    color: C.green,
    backgroundColor: C.greenSoft,
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 7,
    fontSize: 8,
    fontWeight: '900',
  },

  totalRevenue: {
    color: C.ink,
    fontSize: 34,
    fontWeight: '900',
    marginTop: 18,
  },

  divider: {
    height: 1,
    backgroundColor: C.border,
    marginVertical: 12,
  },

  split: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  verticalDivider: {
    width: 1,
    height: 48,
    backgroundColor: C.border,
    marginHorizontal: 13,
  },

  channelLabel: {
    color: C.muted,
    fontSize: 10,
    fontWeight: '700',
  },

  splitAmount: {
    color: C.ink,
    fontSize: 17,
    fontWeight: '900',
    marginTop: 8,
  },

  twoColumns: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 11,
  },

  channelCard: {
    flex: 1,
    padding: 15,
    borderRadius: 18,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.border,
  },

  channelHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  channelIcon: {
    fontSize: 22,
  },

  onlineTag: {
    color: C.orangeDark,
    fontSize: 8,
    fontWeight: '900',
  },

  offlineTag: {
    color: C.green,
    fontSize: 8,
    fontWeight: '900',
  },

  channelCount: {
    color: C.ink,
    fontSize: 27,
    fontWeight: '900',
    marginTop: 13,
  },

  channelMoney: {
    color: C.ink,
    fontSize: 13,
    fontWeight: '900',
    marginTop: 10,
  },

  statsGrid: {
    paddingHorizontal: 20,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },

  stat: {
    width: '31%',
    flexGrow: 1,
    minWidth: 95,
    backgroundColor: C.white,
    borderRadius: 16,
    padding: 13,
    borderWidth: 1,
    borderColor: C.border,
  },

  statIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },

  statValue: {
    color: C.ink,
    fontSize: 23,
    fontWeight: '900',
    marginTop: 12,
  },

  statLabel: {
    color: C.muted,
    fontSize: 10,
    fontWeight: '700',
    marginTop: 3,
  },

  actionsGrid: {
    paddingHorizontal: 20,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 11,
  },

  action: {
    width: '31%',
    flexGrow: 1,
    minWidth: 100,
    backgroundColor: C.white,
    borderRadius: 17,
    padding: 13,
    borderWidth: 1,
    borderColor: C.border,
  },

  actionIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },

  actionTitle: {
    color: C.ink,
    fontSize: 12,
    fontWeight: '900',
    marginTop: 11,
  },

  actionDetail: {
    color: C.muted,
    fontSize: 9,
    marginTop: 4,
    lineHeight: 13,
  },

  actionArrow: {
    color: C.orangeDark,
    fontSize: 15,
    fontWeight: '900',
    position: 'absolute',
    right: 12,
    top: 12,
  },

  orderCard: {
    marginHorizontal: 20,
    marginBottom: 10,
    padding: 15,
    backgroundColor: C.white,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: C.border,
  },

  orderHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },

  orderTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    flexWrap: 'wrap',
  },

  orderId: {
    color: C.ink,
    fontSize: 12,
    fontWeight: '900',
  },

  typePill: {
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 6,
  },

  customer: {
    color: C.ink,
    fontSize: 11,
    marginTop: 7,
    fontWeight: '700',
  },

  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 7,
  },

  orderAmount: {
    color: C.ink,
    fontSize: 14,
    fontWeight: '900',
  },

  orderItems: {
    color: C.ink,
    fontSize: 10,
    lineHeight: 16,
  },

  orderFoot: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },

  viewOrder: {
    color: C.orangeDark,
    fontSize: 9,
    fontWeight: '900',
  },

  empty: {
    marginHorizontal: 20,
    padding: 25,
    backgroundColor: C.white,
    borderRadius: 18,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.border,
  },

  emptyTitle: {
    color: C.ink,
    fontSize: 14,
    fontWeight: '900',
    marginTop: 11,
  },

  loading: {
    padding: 45,
    alignItems: 'center',
    gap: 12,
  },

  muted: {
    color: C.muted,
    fontSize: 11,
  },

  errorBox: {
    marginHorizontal: 20,
    marginTop: 18,
    padding: 16,
    borderRadius: 15,
    backgroundColor: C.redSoft,
  },

  errorTitle: {
    color: C.red,
    fontSize: 13,
    fontWeight: '900',
  },

  errorText: {
    color: C.ink,
    fontSize: 10,
    marginTop: 6,
  },

  retry: {
    alignSelf: 'flex-start',
    marginTop: 11,
    backgroundColor: C.white,
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 8,
  },

  retryText: {
    color: C.red,
    fontSize: 10,
    fontWeight: '900',
  },

  syncText: {
    color: C.muted,
    fontSize: 9,
    textAlign: 'center',
    marginTop: 22,
  },

  version: {
    color: C.subtle,
    fontSize: 8,
    letterSpacing: 1.3,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: 5,
  },

  logout: {
    marginHorizontal: 20,
    marginTop: 18,
    padding: 13,
    backgroundColor: C.redSoft,
    borderRadius: 12,
    alignItems: 'center',
  },

  logoutText: {
    color: C.red,
    fontWeight: '900',
    fontSize: 11,
  },

  floating: {
    position: 'absolute',
    bottom: 16,
    left: 15,
    right: 15,
    minHeight: 70,
    backgroundColor: C.dark,
    borderRadius: 19,
    paddingHorizontal: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.18,
    shadowRadius: 9,
  },

  floatingTitle: {
    color: C.white,
    fontSize: 12,
    fontWeight: '900',
  },

  floatingSub: {
    color: '#BDBEB7',
    fontSize: 9,
    marginTop: 4,
  },

  floatingCount: {
    minWidth: 28,
    height: 28,
    paddingHorizontal: 7,
    borderRadius: 15,
    backgroundColor: C.orange,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
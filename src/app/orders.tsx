import axios from 'axios';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';

import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import api, { API_BASE_URL } from '../services/api';
import { useAuthStore } from '../store/auth';

// ==========================================
// TYPES
// ==========================================

type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'preparing'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled';

type PaymentStatus = 'pending' | 'paid' | 'failed';

type OrderItem = {
  foodId: string;
  name: string;
  image?: string;
  price: number;
  quantity: number;
};

type Address = {
  label?: string;
  fullAddress?: string;
  landmark?: string;
  city?: string;
  state?: string;
  pincode?: string;
};

type Customer = {
  _id?: string;
  name?: string;
  phone?: string;
  email?: string;
} | null;

type Order = {
  _id: string;
  createdAt?: string;
  updatedAt?: string;

  items: OrderItem[];

  user?: Customer;

  deliveryAddress?: Address;

  subtotal: number;
  deliveryFee: number;
  totalAmount: number;

  paymentMethod?: string;
  paymentStatus: PaymentStatus;
  paymentId?: string;
  paymentScreenshot?: string;

  orderStatus: OrderStatus;

  estimatedDeliveryMinutes?: number;
  estimatedDeliveryTime?: string;

  orderType?: 'online' | 'offline' | string;
};

type OrdersResponse = {
  success: boolean;
  orders: Order[];
  message?: string;
};

// ==========================================
// CONSTANTS
// ==========================================

const C = {
  bg: '#F6F5F2',
  white: '#FFFFFF',
  ink: '#20211F',
  muted: '#858780',
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

const FILTERS = [
  { label: 'All Orders', value: 'all' },
  { label: 'Pending', value: 'pending' },
  { label: 'Confirmed', value: 'confirmed' },
  { label: 'Preparing', value: 'preparing' },
  { label: 'Out for delivery', value: 'out_for_delivery' },
  { label: 'Delivered', value: 'delivered' },
  { label: 'Cancelled', value: 'cancelled' },
] as const;

const money = (value: number) =>
  `₹${Number(value || 0).toLocaleString('en-IN', {
    maximumFractionDigits: 2,
  })}`;

const titleCase = (value?: string) =>
  (value || 'Unknown')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase());

const formatDate = (value?: string) => {
  if (!value) return 'Date unavailable';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Date unavailable';
  }

  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const getScreenshotUrl = (path?: string) => {
  if (!path) return '';

  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }

  const base = API_BASE_URL.replace(/\/api\/?$/, '');

  return `${base}${path.startsWith('/') ? '' : '/'}${path}`;
};

const getNextStatuses = (
  status: OrderStatus,
): OrderStatus[] => {
  switch (status) {
    case 'pending':
      return ['confirmed', 'cancelled'];

    case 'confirmed':
      return ['preparing', 'cancelled'];

    case 'preparing':
      return ['out_for_delivery', 'cancelled'];

    case 'out_for_delivery':
      return ['delivered'];

    default:
      return [];
  }
};

// ==========================================
// MAIN SCREEN
// ==========================================

export default function OrdersScreen() {
  const router = useRouter();

  const token = useAuthStore(state => state.token);

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<string>('all');

  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const [screenshotVisible, setScreenshotVisible] = useState(false);

  // ========================================
  // FETCH ORDERS
  // ========================================

  const fetchOrders = useCallback(
    async (refresh = false, silent = false) => {
      if (!token) {
        setLoading(false);
        router.replace('/login');
        return;
      }

      try {
        if (refresh) {
          setRefreshing(true);
        } else if (!silent) {
          setLoading(true);
        }

        if (!silent) {
          setError('');
        }

        const response = await api.get<OrdersResponse>(
          '/orders/admin/all',
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        );

        if (
          !response.data.success ||
          !Array.isArray(response.data.orders)
        ) {
          throw new Error(
            response.data.message || 'Unable to fetch orders.',
          );
        }

        setOrders(response.data.orders);
        setError('');
      } catch (err) {
        console.error('Orders fetch error:', err);

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
                'Unable to connect to the server.',
            );
          }
        } else if (!silent) {
          setError(
            err instanceof Error
              ? err.message
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

  // ========================================
  // AUTO REFRESH
  // ========================================

  useFocusEffect(
    useCallback(() => {
      fetchOrders();

      const interval = setInterval(() => {
        fetchOrders(false, true);
      }, 15000);

      return () => clearInterval(interval);
    }, [fetchOrders]),
  );

  // ========================================
  // FILTER AND SEARCH
  // ========================================

  const filteredOrders = useMemo(() => {
    let result = [...orders];

    if (filter !== 'all') {
      result = result.filter(
        order => order.orderStatus === filter,
      );
    }

    const query = search.trim().toLowerCase();

    if (query) {
      result = result.filter(order => {
        const id = order._id.toLowerCase();
        const name = order.user?.name?.toLowerCase() || '';
        const phone = order.user?.phone || '';

        return (
          id.includes(query) ||
          name.includes(query) ||
          phone.includes(query)
        );
      });
    }

    return result.sort(
      (a, b) =>
        new Date(b.createdAt || 0).getTime() -
        new Date(a.createdAt || 0).getTime(),
    );
  }, [orders, filter, search]);

  // ========================================
  // ORDER COUNTS
  // ========================================

  const counts = useMemo(() => {
    return {
      all: orders.length,

      pending: orders.filter(
        o => o.orderStatus === 'pending',
      ).length,

      confirmed: orders.filter(
        o => o.orderStatus === 'confirmed',
      ).length,

      preparing: orders.filter(
        o => o.orderStatus === 'preparing',
      ).length,

      out_for_delivery: orders.filter(
        o => o.orderStatus === 'out_for_delivery',
      ).length,

      delivered: orders.filter(
        o => o.orderStatus === 'delivered',
      ).length,

      cancelled: orders.filter(
        o => o.orderStatus === 'cancelled',
      ).length,
    };
  }, [orders]);

  // ========================================
  // UPDATE ORDER STATUS
  // ========================================

  const updateStatus = async (
    order: Order,
    newStatus: OrderStatus,
  ) => {
    const executeUpdate = async () => {
      try {
        setUpdatingId(order._id);

        const response = await api.patch(
          `/orders/admin/${order._id}/status`,
          {
            orderStatus: newStatus,
          },
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        );

        if (!response.data.success) {
          throw new Error(
            response.data.message || 'Status update failed.',
          );
        }

        const updatedOrder = response.data.order as Order;

        setOrders(previous =>
          previous.map(item =>
            item._id === order._id
              ? updatedOrder
              : item,
          ),
        );

        setSelectedOrder(updatedOrder);
      } catch (err) {
        console.error('Status update error:', err);

        const message = axios.isAxiosError(err)
          ? err.response?.data?.message ||
            'Unable to update order status.'
          : err instanceof Error
            ? err.message
            : 'Something went wrong.';

        Alert.alert('Update failed', message);
      } finally {
        setUpdatingId(null);
      }
    };

    const actionLabel =
      newStatus === 'cancelled'
        ? 'cancel this order'
        : `mark this order as ${titleCase(newStatus)}`;

    Alert.alert(
      'Confirm action',
      `Are you sure you want to ${actionLabel}?`,
      [
        {
          text: 'No',
          style: 'cancel',
        },
        {
          text: 'Yes, continue',
          onPress: () => {
            void executeUpdate();
          },
        },
      ],
    );
  };

  // ========================================
  // VERIFY PAYMENT
  // ========================================

  const updatePayment = async (
    order: Order,
    paymentStatus: PaymentStatus,
  ) => {
    const executeUpdate = async () => {
      try {
        setUpdatingId(order._id);

        const response = await api.patch(
          `/orders/admin/${order._id}/payment`,
          {
            paymentStatus,
            paymentId: order.paymentId,
          },
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        );

        if (!response.data.success) {
          throw new Error(
            response.data.message || 'Payment update failed.',
          );
        }

        const updatedOrder = response.data.order as Order;

        setOrders(previous =>
          previous.map(item =>
            item._id === order._id
              ? updatedOrder
              : item,
          ),
        );

        setSelectedOrder(updatedOrder);

        Alert.alert(
          'Payment updated',
          `Payment marked as ${paymentStatus}.`,
        );
      } catch (err) {
        console.error('Payment update error:', err);

        const message = axios.isAxiosError(err)
          ? err.response?.data?.message ||
            'Unable to update payment.'
          : err instanceof Error
            ? err.message
            : 'Something went wrong.';

        Alert.alert('Payment update failed', message);
      } finally {
        setUpdatingId(null);
      }
    };

    Alert.alert(
      'Payment verification',
      `Mark payment as ${paymentStatus}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: () => {
            void executeUpdate();
          },
        },
      ],
    );
  };

  // ========================================
  // LOGOUT
  // ========================================

  const logout = async () => {
    await useAuthStore.getState().logout();
    router.replace('/login');
  };

  // ========================================
  // UI
  // ========================================

  return (
    <View style={s.container}>
      <StatusBar barStyle="dark-content" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => fetchOrders(true)}
            tintColor={C.orange}
          />
        }
        contentContainerStyle={{
          paddingBottom: 40,
        }}
      >
        {/* HEADER */}

        <View style={s.header}>
          <View>
            <Text style={s.eyebrow}>
              EATWELL ADMIN
            </Text>

            <Text style={s.heading}>
              Orders
            </Text>

            <Text style={s.subtitle}>
              Manage your customer orders
            </Text>
          </View>

          <TouchableOpacity
            style={s.backButton}
            onPress={() => router.back()}
          >
            <Text style={s.backText}>‹</Text>
          </TouchableOpacity>
        </View>

        {/* SUMMARY */}

        <View style={s.summaryCard}>
          <View style={s.summaryTop}>
            <View>
              <Text style={s.summaryLabel}>
                TOTAL ORDERS
              </Text>

              <Text style={s.summaryNumber}>
                {orders.length}
              </Text>
            </View>

            <View style={s.summaryIcon}>
              <Text style={{ fontSize: 26 }}>📦</Text>
            </View>
          </View>

          <View style={s.summaryBottom}>
            <SummaryItem
              label="Pending"
              value={counts.pending}
              color="#FFC45A"
            />

            <SummaryItem
              label="Preparing"
              value={counts.preparing}
              color="#8AB5FF"
            />

            <SummaryItem
              label="Delivered"
              value={counts.delivered}
              color="#71D9A6"
            />
          </View>
        </View>

        {/* SEARCH */}

        <View style={s.searchBox}>
          <Text style={s.searchIcon}>⌕</Text>

          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search order ID, customer or phone..."
            placeholderTextColor={C.muted}
            style={s.searchInput}
            autoCapitalize="none"
            returnKeyType="search"
          />

          {search.length > 0 ? (
            <TouchableOpacity
              onPress={() => setSearch('')}
            >
              <Text style={s.clearSearch}>✕</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {/* FILTERS */}

        <Text style={s.filterHeading}>
          ORDER STATUS
        </Text>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.filterContainer}
        >
          {FILTERS.map(item => {
            const active = filter === item.value;

            const count =
              item.value === 'all'
                ? counts.all
                : counts[item.value as keyof typeof counts];

            return (
              <TouchableOpacity
                key={item.value}
                onPress={() => setFilter(item.value)}
                style={[
                  s.filterButton,
                  active && s.filterActive,
                ]}
              >
                <Text
                  style={[
                    s.filterText,
                    active && s.filterTextActive,
                  ]}
                >
                  {item.label}
                </Text>

                <View
                  style={[
                    s.filterCount,
                    active && s.filterCountActive,
                  ]}
                >
                  <Text
                    style={[
                      s.filterCountText,
                      active && s.filterCountTextActive,
                    ]}
                  >
                    {count}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* ORDER LIST HEADER */}

        <View style={s.listHeader}>
          <View>
            <Text style={s.listTitle}>
              {filter === 'all'
                ? 'All Orders'
                : titleCase(filter)}
            </Text>

            <Text style={s.listSubtitle}>
              {filteredOrders.length} order(s) found
            </Text>
          </View>

          <TouchableOpacity
            style={s.refreshButton}
            onPress={() => fetchOrders(true)}
          >
            <Text style={s.refreshText}>↻ Refresh</Text>
          </TouchableOpacity>
        </View>

        {/* LOADING */}

        {loading ? (
          <View style={s.loading}>
            <ActivityIndicator
              size="large"
              color={C.orange}
            />

            <Text style={s.muted}>
              Fetching orders from database...
            </Text>
          </View>
        ) : null}

        {/* ERROR */}

        {!loading && error ? (
          <View style={s.errorBox}>
            <Text style={s.errorTitle}>
              Unable to load orders
            </Text>

            <Text style={s.errorMessage}>
              {error}
            </Text>

            <TouchableOpacity
              style={s.retryButton}
              onPress={() => fetchOrders()}
            >
              <Text style={s.retryText}>
                Try again
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* EMPTY */}

        {!loading &&
        !error &&
        filteredOrders.length === 0 ? (
          <View style={s.empty}>
            <Text style={{ fontSize: 42 }}>📭</Text>

            <Text style={s.emptyTitle}>
              No orders found
            </Text>

            <Text style={s.emptySubtitle}>
              Try changing your filter or search.
            </Text>

            <TouchableOpacity
              style={s.resetButton}
              onPress={() => {
                setFilter('all');
                setSearch('');
              }}
            >
              <Text style={s.resetText}>
                Reset filters
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* ORDERS */}

        {!loading &&
          filteredOrders.map(order => (
            <OrderCard
              key={order._id}
              order={order}
              updating={updatingId === order._id}
              onPress={() => setSelectedOrder(order)}
              onStatusChange={newStatus =>
                updateStatus(order, newStatus)
              }
            />
          ))}

        {/* FOOTER */}

        <Text style={s.footer}>
          EATWELL ADMIN • ORDER MANAGEMENT
        </Text>
      </ScrollView>

      {/* ================================== */}
      {/* ORDER DETAILS MODAL */}
      {/* ================================== */}

      <Modal
        visible={!!selectedOrder}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedOrder(null)}
      >
        <View style={s.modalOverlay}>
          <View style={s.modalContent}>
            <View style={s.modalHeader}>
              <View>
                <Text style={s.modalEyebrow}>
                  ORDER DETAILS
                </Text>

                <Text style={s.modalTitle}>
                  #{selectedOrder?._id.slice(-8).toUpperCase()}
                </Text>
              </View>

              <TouchableOpacity
                style={s.closeButton}
                onPress={() => setSelectedOrder(null)}
              >
                <Text style={s.closeText}>✕</Text>
              </TouchableOpacity>
            </View>

            {selectedOrder ? (
              <ScrollView
                showsVerticalScrollIndicator={false}
              >
                {/* STATUS */}

                <View style={s.detailSection}>
                  <Text style={s.detailHeading}>
                    ORDER STATUS
                  </Text>

                  <View style={s.detailStatusRow}>
                    <StatusBadge
                      status={selectedOrder.orderStatus}
                    />

                    <Text style={s.detailDate}>
                      {formatDate(selectedOrder.createdAt)}
                    </Text>
                  </View>
                </View>

                {/* CUSTOMER */}

                <View style={s.detailSection}>
                  <Text style={s.detailHeading}>
                    CUSTOMER INFORMATION
                  </Text>

                  <DetailRow
                    label="Name"
                    value={selectedOrder.user?.name || 'Customer'}
                  />

                  <DetailRow
                    label="Phone"
                    value={selectedOrder.user?.phone || 'Not available'}
                  />

                  <DetailRow
                    label="Email"
                    value={selectedOrder.user?.email || 'Not available'}
                  />
                </View>

                {/* ADDRESS */}

                <View style={s.detailSection}>
                  <Text style={s.detailHeading}>
                    DELIVERY ADDRESS
                  </Text>

                  <Text style={s.addressText}>
                    {selectedOrder.deliveryAddress?.fullAddress ||
                      'Address unavailable'}
                  </Text>

                  {selectedOrder.deliveryAddress?.landmark ? (
                    <Text style={s.addressExtra}>
                      Landmark: {selectedOrder.deliveryAddress.landmark}
                    </Text>
                  ) : null}

                  <Text style={s.addressExtra}>
                    {[
                      selectedOrder.deliveryAddress?.city,
                      selectedOrder.deliveryAddress?.state,
                      selectedOrder.deliveryAddress?.pincode,
                    ]
                      .filter(Boolean)
                      .join(', ')}
                  </Text>
                </View>

                {/* ITEMS */}

                <View style={s.detailSection}>
                  <Text style={s.detailHeading}>
                    ORDER ITEMS ({selectedOrder.items?.length || 0})
                  </Text>

                  {selectedOrder.items?.map((item, index) => (
                    <View
                      key={`${item.foodId}-${index}`}
                      style={s.itemRow}
                    >
                      <View style={s.itemInfo}>
                        <Text style={s.itemName}>
                          {item.name}
                        </Text>

                        <Text style={s.itemQuantity}>
                          Qty: {item.quantity}
                        </Text>
                      </View>

                      <Text style={s.itemPrice}>
                        {money(item.price * item.quantity)}
                      </Text>
                    </View>
                  ))}
                </View>

                {/* BILL */}

                <View style={s.detailSection}>
                  <Text style={s.detailHeading}>
                    BILL SUMMARY
                  </Text>

                  <DetailRow
                    label="Subtotal"
                    value={money(selectedOrder.subtotal)}
                  />

                  <DetailRow
                    label="Delivery fee"
                    value={money(selectedOrder.deliveryFee)}
                  />

                  <View style={s.totalRow}>
                    <Text style={s.totalLabel}>
                      Total amount
                    </Text>

                    <Text style={s.totalValue}>
                      {money(selectedOrder.totalAmount)}
                    </Text>
                  </View>
                </View>

                {/* PAYMENT */}

                <View style={s.detailSection}>
                  <Text style={s.detailHeading}>
                    PAYMENT INFORMATION
                  </Text>

                  <DetailRow
                    label="Method"
                    value={titleCase(selectedOrder.paymentMethod)}
                  />

                  <DetailRow
                    label="Payment ID"
                    value={selectedOrder.paymentId || 'Not available'}
                  />

                  <View style={s.paymentRow}>
                    <Text style={s.detailLabel}>
                      Payment status
                    </Text>

                    <PaymentBadge
                      status={selectedOrder.paymentStatus}
                    />
                  </View>

                  {selectedOrder.paymentScreenshot ? (
                    <TouchableOpacity
                      style={s.screenshotButton}
                      onPress={() => setScreenshotVisible(true)}
                    >
                      <Text style={s.screenshotButtonText}>
                        View payment screenshot ↗
                      </Text>
                    </TouchableOpacity>
                  ) : null}

                  {selectedOrder.paymentStatus === 'pending' ? (
                    <View style={s.paymentActions}>
                      <TouchableOpacity
                        style={s.verifyButton}
                        disabled={updatingId === selectedOrder._id}
                        onPress={() =>
                          updatePayment(selectedOrder, 'paid')
                        }
                      >
                        <Text style={s.verifyText}>
                          Verify payment
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={s.failButton}
                        disabled={updatingId === selectedOrder._id}
                        onPress={() =>
                          updatePayment(selectedOrder, 'failed')
                        }
                      >
                        <Text style={s.failText}>
                          Mark failed
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}
                </View>

                {/* STATUS ACTIONS */}

                {getNextStatuses(selectedOrder.orderStatus).length > 0 ? (
                  <View style={s.detailSection}>
                    <Text style={s.detailHeading}>
                      UPDATE ORDER
                    </Text>

                    {getNextStatuses(selectedOrder.orderStatus).map(
                      status => (
                        <TouchableOpacity
                          key={status}
                          style={[
                            s.statusAction,
                            status === 'cancelled' && s.cancelAction,
                          ]}
                          disabled={updatingId === selectedOrder._id}
                          onPress={() =>
                            updateStatus(selectedOrder, status)
                          }
                        >
                          {updatingId === selectedOrder._id ? (
                            <ActivityIndicator color={C.white} />
                          ) : (
                            <Text style={s.statusActionText}>
                              {status === 'cancelled'
                                ? 'Cancel order'
                                : `Mark as ${titleCase(status)}`}
                            </Text>
                          )}
                        </TouchableOpacity>
                      ),
                    )}
                  </View>
                ) : (
                  <View style={s.detailSection}>
                    <Text style={s.completedMessage}>
                      This order is {titleCase(selectedOrder.orderStatus)}.
                    </Text>
                  </View>
                )}
              </ScrollView>
            ) : null}
          </View>
        </View>
      </Modal>

      {/* PAYMENT SCREENSHOT MODAL */}

      <Modal
        visible={screenshotVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setScreenshotVisible(false)}
      >
        <View style={s.imageOverlay}>
          <TouchableOpacity
            style={s.imageClose}
            onPress={() => setScreenshotVisible(false)}
          >
            <Text style={{ color: C.white, fontSize: 23 }}>✕</Text>
          </TouchableOpacity>

          {selectedOrder?.paymentScreenshot ? (
            <Image
              source={{
                uri: getScreenshotUrl(
                  selectedOrder.paymentScreenshot,
                ),
              }}
              style={s.screenshotImage}
              resizeMode="contain"
            />
          ) : null}
        </View>
      </Modal>
    </View>
  );
}

// ==========================================
// SUMMARY ITEM
// ==========================================

function SummaryItem({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <View style={s.summaryItem}>
      <View style={s.summaryItemTop}>
        <View
          style={[
            s.summaryDot,
            { backgroundColor: color },
          ]}
        />

        <Text style={s.summaryItemValue}>
          {value}
        </Text>
      </View>

      <Text style={s.summaryItemLabel}>
        {label}
      </Text>
    </View>
  );
}

// ==========================================
// ORDER CARD
// ==========================================

function OrderCard({
  order,
  updating,
  onPress,
  onStatusChange,
}: {
  order: Order;
  updating: boolean;
  onPress: () => void;
  onStatusChange: (status: OrderStatus) => void;
}) {
  const nextStatuses = getNextStatuses(order.orderStatus);

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      style={s.orderCard}
      onPress={onPress}
    >
      <View style={s.cardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={s.orderId}>
            #{order._id.slice(-8).toUpperCase()}
          </Text>

          <Text style={s.orderDate}>
            {formatDate(order.createdAt)}
          </Text>
        </View>

        <StatusBadge status={order.orderStatus} />
      </View>

      <View style={s.cardDivider} />

      <View style={s.customerRow}>
        <View style={s.customerIcon}>
          <Text style={{ fontSize: 17 }}>👤</Text>
        </View>

        <View style={{ flex: 1 }}>
          <Text style={s.customerName}>
            {order.user?.name || 'Customer'}
          </Text>

          <Text style={s.customerPhone}>
            {order.user?.phone || 'Phone unavailable'}
          </Text>
        </View>

        <Text style={s.orderTotal}>
          {money(order.totalAmount)}
        </Text>
      </View>

      <View style={s.itemsPreview}>
        {order.items?.slice(0, 3).map((item, index) => (
          <Text
            key={`${item.foodId}-${index}`}
            style={s.previewItem}
            numberOfLines={1}
          >
            {item.name} × {item.quantity}
          </Text>
        ))}

        {(order.items?.length || 0) > 3 ? (
          <Text style={s.moreItems}>
            +{order.items.length - 3} more items
          </Text>
        ) : null}
      </View>

      <View style={s.cardFooter}>
        <View>
          <Text style={s.paymentLabel}>
            PAYMENT
          </Text>

          <PaymentBadge status={order.paymentStatus} />
        </View>

        <TouchableOpacity
          style={s.detailsButton}
          onPress={onPress}
        >
          <Text style={s.detailsText}>
            Details ↗
          </Text>
        </TouchableOpacity>
      </View>

      {nextStatuses.length > 0 ? (
        <View style={s.cardActions}>
          {nextStatuses.map(status => (
            <TouchableOpacity
              key={status}
              disabled={updating}
              style={[
                s.cardActionButton,
                status === 'cancelled' && s.cardCancelButton,
              ]}
              onPress={() => onStatusChange(status)}
            >
              {updating ? (
                <ActivityIndicator size="small" color={C.white} />
              ) : (
                <Text style={s.cardActionText}>
                  {status === 'cancelled'
                    ? 'Cancel'
                    : titleCase(status)}
                </Text>
              )}
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

// ==========================================
// STATUS BADGE
// ==========================================

function StatusBadge({
  status,
}: {
  status: OrderStatus;
}) {
  const colors: Record<
    OrderStatus,
    { text: string; background: string }
  > = {
    pending: {
      text: '#B77900',
      background: C.orangeSoft,
    },
    confirmed: {
      text: C.blue,
      background: C.blueSoft,
    },
    preparing: {
      text: C.orangeDark,
      background: C.orangeSoft,
    },
    out_for_delivery: {
      text: C.blue,
      background: C.blueSoft,
    },
    delivered: {
      text: C.green,
      background: C.greenSoft,
    },
    cancelled: {
      text: C.red,
      background: C.redSoft,
    },
  };

  const color = colors[status] || colors.pending;

  return (
    <View
      style={[
        s.statusBadge,
        { backgroundColor: color.background },
      ]}
    >
      <Text
        style={[
          s.statusBadgeText,
          { color: color.text },
        ]}
      >
        {titleCase(status)}
      </Text>
    </View>
  );
}

// ==========================================
// PAYMENT BADGE
// ==========================================

function PaymentBadge({
  status,
}: {
  status: PaymentStatus;
}) {
  const color =
    status === 'paid'
      ? C.green
      : status === 'failed'
        ? C.red
        : '#B77900';

  const background =
    status === 'paid'
      ? C.greenSoft
      : status === 'failed'
        ? C.redSoft
        : C.orangeSoft;

  return (
    <View
      style={[
        s.paymentBadge,
        { backgroundColor: background },
      ]}
    >
      <Text
        style={[
          s.paymentBadgeText,
          { color },
        ]}
      >
        {titleCase(status)}
      </Text>
    </View>
  );
}

// ==========================================
// DETAIL ROW
// ==========================================

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <View style={s.detailRow}>
      <Text style={s.detailLabel}>
        {label}
      </Text>

      <Text style={s.detailValue}>
        {value}
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
    paddingHorizontal: 21,
    paddingTop: 52,
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

  subtitle: {
    color: C.muted,
    fontSize: 11,
    marginTop: 4,
  },

  backButton: {
    width: 43,
    height: 43,
    borderRadius: 14,
    backgroundColor: C.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: C.border,
  },

  backText: {
    color: C.ink,
    fontSize: 30,
    marginTop: -5,
  },

  summaryCard: {
    marginHorizontal: 20,
    padding: 19,
    borderRadius: 22,
    backgroundColor: C.dark,
  },

  summaryTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  summaryLabel: {
    color: '#BFC0B9',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.2,
  },

  summaryNumber: {
    color: C.white,
    fontSize: 37,
    fontWeight: '900',
    marginTop: 5,
  },

  summaryIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: '#393A33',
    alignItems: 'center',
    justifyContent: 'center',
  },

  summaryBottom: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#45463E',
    paddingTop: 15,
    marginTop: 15,
  },

  summaryItem: {
    flex: 1,
  },

  summaryItemTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },

  summaryDot: {
    width: 7,
    height: 7,
    borderRadius: 5,
  },

  summaryItemValue: {
    color: C.white,
    fontSize: 17,
    fontWeight: '900',
  },

  summaryItemLabel: {
    color: '#BFC0B9',
    fontSize: 9,
    marginTop: 4,
  },

  searchBox: {
    marginHorizontal: 20,
    marginTop: 20,
    paddingHorizontal: 14,
    height: 51,
    backgroundColor: C.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  searchIcon: {
    fontSize: 25,
    color: C.muted,
  },

  searchInput: {
    flex: 1,
    color: C.ink,
    fontSize: 11,
    paddingVertical: 0,
  },

  clearSearch: {
    color: C.muted,
    fontSize: 16,
    padding: 5,
  },

  filterHeading: {
    color: C.muted,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.2,
    marginHorizontal: 22,
    marginTop: 24,
    marginBottom: 10,
  },

  filterContainer: {
    paddingHorizontal: 20,
    gap: 8,
  },

  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 11,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.border,
  },

  filterActive: {
    backgroundColor: C.dark,
    borderColor: C.dark,
  },

  filterText: {
    color: C.muted,
    fontSize: 10,
    fontWeight: '800',
  },

  filterTextActive: {
    color: C.white,
  },

  filterCount: {
    backgroundColor: C.bg,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
  },

  filterCountActive: {
    backgroundColor: '#46473F',
  },

  filterCountText: {
    color: C.muted,
    fontSize: 8,
    fontWeight: '900',
  },

  filterCountTextActive: {
    color: C.white,
  },

  listHeader: {
    marginHorizontal: 21,
    marginTop: 26,
    marginBottom: 13,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  listTitle: {
    color: C.ink,
    fontSize: 18,
    fontWeight: '900',
  },

  listSubtitle: {
    color: C.muted,
    fontSize: 10,
    marginTop: 4,
  },

  refreshButton: {
    paddingHorizontal: 11,
    paddingVertical: 8,
    backgroundColor: C.orangeSoft,
    borderRadius: 9,
  },

  refreshText: {
    color: C.orangeDark,
    fontSize: 9,
    fontWeight: '900',
  },

  orderCard: {
    marginHorizontal: 20,
    marginBottom: 12,
    padding: 15,
    borderRadius: 18,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.border,
  },

  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },

  orderId: {
    color: C.ink,
    fontSize: 13,
    fontWeight: '900',
  },

  orderDate: {
    color: C.muted,
    fontSize: 9,
    marginTop: 5,
  },

  statusBadge: {
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 8,
  },

  statusBadgeText: {
    fontSize: 8,
    fontWeight: '900',
  },

  cardDivider: {
    height: 1,
    backgroundColor: C.border,
    marginVertical: 13,
  },

  customerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  customerIcon: {
    width: 37,
    height: 37,
    borderRadius: 12,
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },

  customerName: {
    color: C.ink,
    fontSize: 11,
    fontWeight: '900',
  },

  customerPhone: {
    color: C.muted,
    fontSize: 9,
    marginTop: 4,
  },

  orderTotal: {
    color: C.ink,
    fontSize: 16,
    fontWeight: '900',
  },

  itemsPreview: {
    marginTop: 14,
    padding: 11,
    backgroundColor: C.bg,
    borderRadius: 11,
  },

  previewItem: {
    color: C.ink,
    fontSize: 10,
    marginBottom: 5,
  },

  moreItems: {
    color: C.orangeDark,
    fontSize: 9,
    fontWeight: '900',
    marginTop: 3,
  },

  cardFooter: {
    marginTop: 13,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  paymentLabel: {
    color: C.muted,
    fontSize: 8,
    fontWeight: '900',
    marginBottom: 5,
  },

  paymentBadge: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 7,
    alignSelf: 'flex-start',
  },

  paymentBadgeText: {
    fontSize: 8,
    fontWeight: '900',
  },

  detailsButton: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: C.orangeSoft,
    borderRadius: 9,
  },

  detailsText: {
    color: C.orangeDark,
    fontSize: 9,
    fontWeight: '900',
  },

  cardActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 13,
  },

  cardActionButton: {
    flexGrow: 1,
    backgroundColor: C.dark,
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },

  cardCancelButton: {
    backgroundColor: C.red,
  },

  cardActionText: {
    color: C.white,
    fontSize: 9,
    fontWeight: '900',
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
    padding: 20,
    borderRadius: 15,
    backgroundColor: C.redSoft,
  },

  errorTitle: {
    color: C.red,
    fontSize: 14,
    fontWeight: '900',
  },

  errorMessage: {
    color: C.ink,
    fontSize: 10,
    marginTop: 7,
  },

  retryButton: {
    alignSelf: 'flex-start',
    padding: 10,
    backgroundColor: C.white,
    borderRadius: 8,
    marginTop: 12,
  },

  retryText: {
    color: C.red,
    fontSize: 10,
    fontWeight: '900',
  },

  empty: {
    marginHorizontal: 20,
    padding: 30,
    backgroundColor: C.white,
    borderRadius: 18,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.border,
  },

  emptyTitle: {
    color: C.ink,
    fontSize: 15,
    fontWeight: '900',
    marginTop: 12,
  },

  emptySubtitle: {
    color: C.muted,
    fontSize: 10,
    marginTop: 6,
    textAlign: 'center',
  },

  resetButton: {
    backgroundColor: C.dark,
    borderRadius: 9,
    paddingHorizontal: 15,
    paddingVertical: 10,
    marginTop: 16,
  },

  resetText: {
    color: C.white,
    fontSize: 10,
    fontWeight: '900',
  },

  footer: {
    textAlign: 'center',
    color: C.muted,
    fontSize: 8,
    letterSpacing: 1,
    fontWeight: '800',
    marginTop: 20,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },

  modalContent: {
    backgroundColor: C.bg,
    borderTopLeftRadius: 25,
    borderTopRightRadius: 25,
    padding: 20,
    paddingBottom: 35,
    height: '91%',
  },

  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    marginBottom: 10,
  },

  modalEyebrow: {
    color: C.orangeDark,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.2,
  },

  modalTitle: {
    color: C.ink,
    fontSize: 20,
    fontWeight: '900',
    marginTop: 5,
  },

  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: C.white,
    alignItems: 'center',
    justifyContent: 'center',
  },

  closeText: {
    color: C.ink,
    fontSize: 15,
  },

  detailSection: {
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },

  detailHeading: {
    color: C.muted,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1,
    marginBottom: 12,
  },

  detailStatusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },

  detailDate: {
    color: C.muted,
    fontSize: 9,
    flexShrink: 1,
    textAlign: 'right',
  },

  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 6,
  },

  detailLabel: {
    color: C.muted,
    fontSize: 10,
  },

  detailValue: {
    color: C.ink,
    fontSize: 10,
    fontWeight: '800',
    textAlign: 'right',
    flexShrink: 1,
  },

  addressText: {
    color: C.ink,
    fontSize: 11,
    lineHeight: 19,
  },

  addressExtra: {
    color: C.muted,
    fontSize: 10,
    marginTop: 5,
  },

  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },

  itemInfo: {
    flex: 1,
  },

  itemName: {
    color: C.ink,
    fontSize: 11,
    fontWeight: '800',
  },

  itemQuantity: {
    color: C.muted,
    fontSize: 9,
    marginTop: 4,
  },

  itemPrice: {
    color: C.ink,
    fontSize: 11,
    fontWeight: '900',
  },

  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingTop: 12,
    marginTop: 8,
  },

  totalLabel: {
    color: C.ink,
    fontSize: 12,
    fontWeight: '900',
  },

  totalValue: {
    color: C.green,
    fontSize: 17,
    fontWeight: '900',
  },

  paymentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
  },

  screenshotButton: {
    backgroundColor: C.blueSoft,
    padding: 12,
    borderRadius: 10,
    marginTop: 13,
    alignItems: 'center',
  },

  screenshotButtonText: {
    color: C.blue,
    fontSize: 10,
    fontWeight: '900',
  },

  paymentActions: {
    flexDirection: 'row',
    gap: 9,
    marginTop: 12,
  },

  verifyButton: {
    flex: 1,
    backgroundColor: C.green,
    padding: 12,
    borderRadius: 10,
    alignItems: 'center',
  },

  verifyText: {
    color: C.white,
    fontSize: 10,
    fontWeight: '900',
  },

  failButton: {
    flex: 1,
    backgroundColor: C.redSoft,
    padding: 12,
    borderRadius: 10,
    alignItems: 'center',
  },

  failText: {
    color: C.red,
    fontSize: 10,
    fontWeight: '900',
  },

  statusAction: {
    backgroundColor: C.dark,
    padding: 14,
    borderRadius: 11,
    alignItems: 'center',
    marginBottom: 9,
  },

  cancelAction: {
    backgroundColor: C.red,
  },

  statusActionText: {
    color: C.white,
    fontSize: 11,
    fontWeight: '900',
  },

  completedMessage: {
    color: C.green,
    fontSize: 11,
    fontWeight: '800',
  },

  imageOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  imageClose: {
    position: 'absolute',
    top: 55,
    right: 22,
    zIndex: 2,
    padding: 10,
  },

  screenshotImage: {
    width: '94%',
    height: '75%',
  },
});
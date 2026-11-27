import * as Print from 'expo-print';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View
} from 'react-native';

import api from '../services/api';
import { useAuthStore } from '../store/auth';

// ==========================================
// TYPES
// ==========================================

type Food = {
  _id?: string;
  id: string;
  name: string;
  description?: string;
  price: number;
  category: string;
  image?: any;
  rating?: number;
  isAvailable: boolean;
};

type CartItem = Food & {
  quantity: number;
};

type PosOrderItem = {
  foodId: string;
  name: string;
  image?: string;
  price: number;
  quantity: number;
  itemTotal: number;
};

type PosOrder = {
  _id: string;
  orderNumber: string;
  orderType: 'POS';
  diningType: 'DINE_IN';
  customerName?: string;
  customerPhone?: string;
  items: PosOrderItem[];
  subtotal: number;
  totalAmount: number;
  paymentMethod: 'CASH' | 'UPI';
  paymentStatus: string;
  orderStatus: string;
  createdAt: string;
};

type PosSummary = {
  totalBills: number;
  totalSales: number;
  totalItems: number;
  averageBill: number;
};

type ApiResponse<T> = {
  success: boolean;
  message?: string;
  data?: T;
};

// ==========================================
// CONSTANTS
// ==========================================

const C = {
  bg: '#F5F6F8',
  white: '#FFFFFF',
  ink: '#202124',
  muted: '#7A7F87',
  subtle: '#A3A7AE',
  border: '#E9EBEF',

  primary: '#F59E0B',
  primaryDark: '#D97706',
  primarySoft: '#FFF3D9',

  green: '#16865B',
  greenSoft: '#E5F5EC',

  blue: '#4169A1',
  blueSoft: '#EAF0FF',

  red: '#D94B4B',
  redSoft: '#FCEAEA',

  dark: '#242522',
};

const GRID_GAP = 12;
const PAGE_PADDING = 14;
const MAX_CONTENT_WIDTH = 1200;

const TOP_PADDING =
  Platform.OS === 'android'
    ? (StatusBar.currentHeight || 24) + 10
    : Platform.OS === 'ios'
      ? 54
      : 16;

const money = (value: number) =>
  `₹${Number(value || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;

const getFoodImageUri = (image?: any): string | undefined => {
  const extract = (value: any): string | undefined => {
    if (!value) return undefined;
    if (typeof value === 'string') return value.trim() || undefined;
    if (Array.isArray(value)) return extract(value[0]);
    if (typeof value === 'object') {
      return extract(
        value.url || value.secure_url || value.path || value.uri ||
        value.imageUrl || value.image || value.filename
      );
    }
    return undefined;
  };

  const imagePath = extract(image);
  if (!imagePath || imagePath === '[object Object]') return undefined;
  if (/^(https?:\/\/|data:|blob:)/i.test(imagePath)) return imagePath;

  const baseURL = api.defaults.baseURL || 'https://eat-well-5924.onrender.com/api';
  const serverOrigin = baseURL.replace(/\/api\/?$/i, '').replace(/\/+$/, '');
  const cleanPath = imagePath.replace(/^\.\//, '');
  return `${serverOrigin}${cleanPath.startsWith('/') ? cleanPath : `/${cleanPath}`}`;
};

const normalizeFood = (raw: any): Food => {
  const rawCategory = raw?.category;
  const category = typeof rawCategory === 'string'
    ? rawCategory
    : rawCategory?.name || raw?.categoryName || 'Other';
  const image = raw?.image ?? raw?.imageUrl ?? raw?.photo ?? raw?.images ?? raw?.foodImage;
  const id = String(raw?.id ?? raw?._id ?? raw?.foodId ?? '');
  return {
    ...raw,
    id,
    _id: String(raw?._id ?? id),
    name: String(raw?.name ?? raw?.foodName ?? 'Food item'),
    description: raw?.description ?? '',
    price: Number(raw?.price ?? raw?.sellingPrice ?? raw?.salePrice ?? 0),
    category,
    image,
    isAvailable: raw?.isAvailable ?? raw?.available ?? raw?.status !== 'unavailable',
  } as Food;
};

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

const getTodayDate = () => {
  const date = new Date();

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
};

// ==========================================
// COMPONENT
// ==========================================

export default function PosBillingScreen() {
  const router = useRouter();
  const token = useAuthStore((state) => state.token);

  const { width, height } = useWindowDimensions();

  const columns = width >= 1100 ? 5 : width >= 800 ? 4 : width >= 560 ? 3 : 2;
  const contentWidth = Math.min(width - PAGE_PADDING * 2, MAX_CONTENT_WIDTH);
  const cardWidth = Math.floor(
    (contentWidth - GRID_GAP * (columns - 1)) / columns
  );

  // ----------------------------------------
  // STATES
  // ----------------------------------------

  const [foods, setFoods] = useState<Food[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [creatingBill, setCreatingBill] = useState(false);

  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] =
    useState('All');
  const [pageStep, setPageStep] = useState<'menu' | 'checkout'>('menu');

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');

  const [paymentMethod, setPaymentMethod] =
    useState<'CASH' | 'UPI'>('CASH');

  const [summary, setSummary] = useState<PosSummary>({
    totalBills: 0,
    totalSales: 0,
    totalItems: 0,
    averageBill: 0,
  });

  const [history, setHistory] = useState<PosOrder[]>([]);
  const [historySearch, setHistorySearch] = useState('');
  const [historyVisible, setHistoryVisible] = useState(false);

  const [confirmVisible, setConfirmVisible] = useState(false);
  const [receiptVisible, setReceiptVisible] = useState(false);

  const [lastOrder, setLastOrder] = useState<PosOrder | null>(
    null
  );

  const [error, setError] = useState('');

  // ----------------------------------------
  // ANIMATIONS
  // ----------------------------------------

  const stepAnim = useRef(new Animated.Value(1)).current;
  const cartBarAnim = useRef(new Animated.Value(0)).current;
  const badgeScale = useRef(new Animated.Value(1)).current;

  // ----------------------------------------
  // AUTH HEADERS
  // ----------------------------------------

  const authHeaders = useMemo(
    () => ({
      Authorization: `Bearer ${token}`,
    }),
    [token]
  );

  // ----------------------------------------
  // LOAD FOODS
  // ----------------------------------------

  const loadFoods = useCallback(async () => {
    if (!token) {
      setLoading(false);
      router.replace('/login');
      return;
    }

    try {
      const response = await api.get('/foods/admin/all', {
        headers: authHeaders,
      });

      const result = response.data;
      const list = Array.isArray(result)
        ? result
        : result?.foods ?? result?.data?.foods ?? result?.items ??
        (Array.isArray(result?.data) ? result.data : []) ?? [];

      const normalized = (Array.isArray(list) ? list : [])
        .map(normalizeFood)
        .filter((food: Food) => food.id && food.name && food.isAvailable !== false);
      setFoods(normalized);

      setError('');
    } catch (err: any) {
      console.error(
        'POS food loading error:',
        err?.response?.data || err
      );

      setError(
        err?.response?.data?.message ||
        'Unable to load the food menu.'
      );
    } finally {
      setLoading(false);
    }
  }, [token, authHeaders, router]);

  // ----------------------------------------
  // LOAD SALES SUMMARY
  // ----------------------------------------

  const loadSummary = useCallback(async () => {
    if (!token) return;

    try {
      const today = getTodayDate();

      const response = await api.get(
        '/orders/admin/pos/summary',
        {
          headers: authHeaders,
          params: {
            startDate: today,
            endDate: today,
          },
        }
      );

      if (response.data.success) {
        setSummary(
          response.data.summary || {
            totalBills: 0,
            totalSales: 0,
            totalItems: 0,
            averageBill: 0,
          }
        );
      }
    } catch (err) {
      console.error('POS summary error:', err);
    }
  }, [token, authHeaders]);

  // ----------------------------------------
  // LOAD POS HISTORY
  // ----------------------------------------

  const loadHistory = useCallback(async () => {
    if (!token) return;

    try {
      const response = await api.get(
        '/orders/admin/pos',
        {
          headers: authHeaders,
          params: {
            page: 1,
            limit: 50,
          },
        }
      );

      if (response.data.success) {
        setHistory(response.data.orders || []);
      }
    } catch (err) {
      console.error('POS history error:', err);
    }
  }, [token, authHeaders]);

  // ----------------------------------------
  // INITIAL LOAD / SCREEN FOCUS
  // ----------------------------------------

  useFocusEffect(
    useCallback(() => {
      loadFoods();
      loadSummary();
    }, [loadFoods, loadSummary])
  );

  // ----------------------------------------
  // REFRESH
  // ----------------------------------------

  const refreshAll = async () => {
    setRefreshing(true);

    await Promise.all([
      loadFoods(),
      loadSummary(),
    ]);

    setRefreshing(false);
  };

  // ----------------------------------------
  // CATEGORIES
  // ----------------------------------------

  const categories = useMemo(() => {
    const unique = Array.from(
      new Set(
        foods
          .map((food) => food.category)
          .filter(Boolean)
      )
    );

    return ['All', ...unique];
  }, [foods]);

  // ----------------------------------------
  // FILTER FOODS
  // ----------------------------------------

  const filteredFoods = useMemo(() => {
    const query = search.trim().toLowerCase();

    return foods.filter((food) => {
      const matchesCategory =
        selectedCategory === 'All' ||
        food.category === selectedCategory;

      const matchesSearch =
        !query ||
        food.name.toLowerCase().includes(query) ||
        food.category.toLowerCase().includes(query) ||
        food.description?.toLowerCase().includes(query);

      return matchesCategory && matchesSearch;
    });
  }, [foods, search, selectedCategory]);

  // ----------------------------------------
  // CART TOTALS
  // ----------------------------------------

  const cartCount = useMemo(
    () =>
      cart.reduce(
        (total, item) => total + item.quantity,
        0
      ),
    [cart]
  );

  const subtotal = useMemo(
    () =>
      cart.reduce(
        (total, item) =>
          total + item.price * item.quantity,
        0
      ),
    [cart]
  );

  const totalAmount = subtotal;

  // ----------------------------------------
  // ANIMATION EFFECTS
  // ----------------------------------------

  useEffect(() => {
    stepAnim.setValue(0);
    Animated.timing(stepAnim, {
      toValue: 1,
      duration: 260,
      useNativeDriver: true,
    }).start();
  }, [pageStep, stepAnim]);

  useEffect(() => {
    Animated.spring(cartBarAnim, {
      toValue: cartCount > 0 ? 1 : 0,
      friction: 9,
      tension: 70,
      useNativeDriver: true,
    }).start();

    if (cartCount > 0) {
      Animated.sequence([
        Animated.timing(badgeScale, {
          toValue: 1.3,
          duration: 110,
          useNativeDriver: true,
        }),
        Animated.spring(badgeScale, {
          toValue: 1,
          friction: 5,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [cartCount, cartBarAnim, badgeScale]);

  // ----------------------------------------
  // ADD TO CART
  // ----------------------------------------

  const addToCart = (food: Food) => {
    setCart((current) => {
      const existing = current.find(
        (item) => item.id === food.id
      );

      if (existing) {
        if (existing.quantity >= 99) {
          Alert.alert(
            'Quantity limit',
            'Maximum quantity is 99.'
          );

          return current;
        }

        return current.map((item) =>
          item.id === food.id
            ? {
              ...item,
              quantity: item.quantity + 1,
            }
            : item
        );
      }

      return [
        ...current,
        {
          ...food,
          quantity: 1,
        },
      ];
    });
  };

  // ----------------------------------------
  // CHANGE QUANTITY
  // ----------------------------------------

  const changeQuantity = (
    foodId: string,
    change: number
  ) => {
    setCart((current) =>
      current
        .map((item) => {
          if (item.id !== foodId) return item;

          return {
            ...item,
            quantity: item.quantity + change,
          };
        })
        .filter((item) => item.quantity > 0)
    );
  };

  // ----------------------------------------
  // REMOVE ITEM
  // ----------------------------------------

  const removeFromCart = (foodId: string) => {
    setCart((current) =>
      current.filter((item) => item.id !== foodId)
    );
  };

  // ----------------------------------------
  // CLEAR CART
  // ----------------------------------------

  const clearCart = () => {
    setCart([]);
    setCustomerName('');
    setCustomerPhone('');
    setPaymentMethod('CASH');
  };

  // ----------------------------------------
  // CREATE BILL
  // ----------------------------------------

  const createBill = async () => {
    if (cart.length === 0) {
      Alert.alert(
        'Cart empty',
        'Please add food items first.'
      );
      return;
    }

    if (!token) {
      router.replace('/login');
      return;
    }

    try {
      setCreatingBill(true);

      const payload = {
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        paymentMethod,

        items: cart.map((item) => ({
          foodId: item.id,
          quantity: item.quantity,
        })),
      };

      const response = await api.post(
        '/orders/admin/pos',
        payload,
        {
          headers: authHeaders,
        }
      );

      if (!response.data.success || !response.data.order) {
        throw new Error(
          response.data.message || 'Bill creation failed.'
        );
      }

      const order = response.data.order as PosOrder;

      setLastOrder(order);
      setConfirmVisible(false);
      setReceiptVisible(true);

      clearCart();

      await Promise.all([
        loadSummary(),
        loadHistory(),
      ]);
    } catch (err: any) {
      console.error(
        'POS bill creation error:',
        err?.response?.data || err
      );

      Alert.alert(
        'Bill failed',
        err?.response?.data?.message ||
        err?.message ||
        'Unable to create bill. Please try again.'
      );
    } finally {
      setCreatingBill(false);
    }
  };

  // ----------------------------------------
  // PRINT RECEIPT
  // ----------------------------------------

  const printBill = async (order: PosOrder) => {
    const escapeHtml = (value: unknown) => String(value ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const rows = (order.items || []).map((item) => `
      <tr><td>${escapeHtml(item.name)}<br/><small>${item.quantity} × ${money(item.price)}</small></td>
      <td style="text-align:right">${escapeHtml(money(item.itemTotal))}</td></tr>`).join('');
    const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1" />
      <style>body{font-family:Arial,sans-serif;padding:20px;color:#222;max-width:420px;margin:auto}
      h1{text-align:center;margin:0;font-size:26px}p{text-align:center;margin:5px 0 16px;color:#666}
      .meta{font-size:13px;line-height:1.7}.line{border-top:1px dashed #999;margin:14px 0}
      table{width:100%;border-collapse:collapse;font-size:14px}td{padding:8px 0;vertical-align:top}
      small{color:#666}.total{font-size:20px;font-weight:bold}.center{text-align:center}</style></head><body>
      <h1>EatWell</h1><p>GOOD FOOD. GOOD MOOD.</p><div class="line"></div>
      <div class="meta"><b>Bill:</b> ${escapeHtml(order.orderNumber)}<br/><b>Date:</b> ${escapeHtml(formatDate(order.createdAt))}<br/>
      <b>Customer:</b> ${escapeHtml(order.customerName || 'Walk-in customer')}<br/><b>Phone:</b> ${escapeHtml(order.customerPhone || '—')}</div>
      <div class="line"></div><table>${rows}</table><div class="line"></div>
      <div class="total">Total: ${escapeHtml(money(order.totalAmount))}</div>
      <div class="meta">Payment: ${escapeHtml(order.paymentMethod)} · PAID</div><div class="line"></div>
      <p class="center">Thank you for visiting EatWell!</p></body></html>`;
    try {
      await Print.printAsync({ html });
    } catch (err: any) {
      Alert.alert('Print unavailable', err?.message || 'Could not open the print dialog.');
    }
  };

  // ----------------------------------------
  // HISTORY SEARCH
  // ----------------------------------------

  const filteredHistory = useMemo(() => {
    const query = historySearch.trim().toLowerCase();

    if (!query) return history;

    return history.filter((order) => {
      return (
        order.orderNumber?.toLowerCase().includes(query) ||
        order.customerName?.toLowerCase().includes(query) ||
        order.customerPhone?.toLowerCase().includes(query)
      );
    });
  }, [history, historySearch]);

  // ----------------------------------------
  // ANIMATED STYLES
  // ----------------------------------------

  const stepStyle = {
    opacity: stepAnim,
    transform: [
      {
        translateY: stepAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [16, 0],
        }),
      },
    ],
  };

  const cartBarStyle = {
    opacity: cartBarAnim,
    transform: [
      {
        translateY: cartBarAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [120, 0],
        }),
      },
    ],
  };

  // ==========================================
  // UI
  // ==========================================

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar barStyle="dark-content" />

      {/* ---------------------------------- */}
      {/* HEADER */}
      {/* ---------------------------------- */}

      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.logoBox}>
            <Text style={styles.logoText}>E</Text>
          </View>

          <View>
            <Text style={styles.brandName}>EatWell POS</Text>

            <View style={styles.statusRow}>
              <View style={styles.onlineDot} />
              <Text style={styles.statusText}>
                Counter active · Dine-In
              </Text>
            </View>
          </View>
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.historyButton,
            pressed && styles.pressedDim,
          ]}
          onPress={async () => {
            setHistoryVisible(true);
            await loadHistory();
          }}
        >
          <Text style={styles.historyButtonIcon}>▤</Text>
          <Text style={styles.historyButtonText}>History</Text>
        </Pressable>
      </View>

      {/* ---------------------------------- */}
      {/* STEP CONTENT */}
      {/* ---------------------------------- */}

      <Animated.View style={[styles.stepWrap, stepStyle]}>
        {pageStep === 'menu' ? (
          <View style={styles.flex}>
            {/* SEARCH + CATEGORIES */}
            <View style={styles.filterBar}>
              <View style={styles.filterInner}>
                <View style={styles.searchRow}>
                  <View style={styles.searchBox}>
                    <Text style={styles.searchIcon}>⌕</Text>

                    <TextInput
                      value={search}
                      onChangeText={setSearch}
                      placeholder="Search products..."
                      placeholderTextColor={C.subtle}
                      style={styles.searchInput}
                      returnKeyType="search"
                    />

                    {!!search && (
                      <Pressable
                        onPress={() => setSearch('')}
                        style={styles.clearSearch}
                        hitSlop={8}
                      >
                        <Text style={styles.clearSearchText}>×</Text>
                      </Pressable>
                    )}
                  </View>

                  <Pressable
                    style={({ pressed }) => [
                      styles.refreshButton,
                      pressed && styles.pressedDim,
                    ]}
                    onPress={loadFoods}
                  >
                    <Text style={styles.refreshIcon}>↻</Text>
                  </Pressable>
                </View>

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.categoryRow}
                  keyboardShouldPersistTaps="handled"
                >
                  {categories.map((category) => {
                    const active = selectedCategory === category;
                    const count =
                      category === 'All'
                        ? foods.length
                        : foods.filter((f) => f.category === category).length;

                    return (
                      <Pressable
                        key={category}
                        onPress={() => setSelectedCategory(category)}
                        style={[
                          styles.categoryChip,
                          active && styles.categoryChipActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.categoryText,
                            active && styles.categoryTextActive,
                          ]}
                        >
                          {category}
                        </Text>

                        <View
                          style={[
                            styles.categoryCountBox,
                            active && styles.categoryCountBoxActive,
                          ]}
                        >
                          <Text
                            style={[
                              styles.categoryCount,
                              active && styles.categoryCountActive,
                            ]}
                          >
                            {count}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            </View>

            {/* SCROLLABLE MENU */}
            <ScrollView
              style={styles.flex}
              contentContainerStyle={styles.menuContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={refreshAll}
                  tintColor={C.primary}
                  colors={[C.primary]}
                />
              }
            >
              <View style={styles.container}>
                {/* SUMMARY */}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.summaryRow}
                >
                  <SummaryCard
                    icon="₹"
                    label="Today's sales"
                    value={money(summary.totalSales)}
                    color={C.primary}
                    softColor={C.primarySoft}
                  />

                  <SummaryCard
                    icon="▤"
                    label="Today's bills"
                    value={String(summary.totalBills)}
                    color={C.blue}
                    softColor={C.blueSoft}
                  />

                  <SummaryCard
                    icon="🍴"
                    label="Items sold"
                    value={String(summary.totalItems)}
                    color={C.green}
                    softColor={C.greenSoft}
                  />

                  <SummaryCard
                    icon="↗"
                    label="Average bill"
                    value={money(summary.averageBill)}
                    color="#8B5CF6"
                    softColor="#F1EAFE"
                  />
                </ScrollView>

                {/* ERROR */}
                {!!error && (
                  <View style={styles.errorBox}>
                    <Text style={styles.errorText}>{error}</Text>

                    <Pressable onPress={loadFoods} hitSlop={8}>
                      <Text style={styles.retryText}>Retry</Text>
                    </Pressable>
                  </View>
                )}

                {/* COUNT ROW */}
                <View style={styles.foodCountRow}>
                  <Text style={styles.foodCountText}>
                    {filteredFoods.length} products
                  </Text>

                  <Text style={styles.foodCountHint}>
                    Tap a product to add
                  </Text>
                </View>

                {/* PRODUCTS */}
                {loading ? (
                  <View style={styles.loadingBox}>
                    <ActivityIndicator size="large" color={C.primary} />
                    <Text style={styles.loadingText}>Loading menu...</Text>
                  </View>
                ) : filteredFoods.length === 0 ? (
                  <View style={styles.emptyMenu}>
                    <Text style={styles.emptyMenuIcon}>🍽</Text>
                    <Text style={styles.emptyMenuTitle}>No products found</Text>
                    <Text style={styles.emptyMenuText}>
                      Try another category or search
                    </Text>
                  </View>
                ) : (
                  <View style={styles.productGrid}>
                    {filteredFoods.map((food) => {
                      const cartItem = cart.find((item) => item.id === food.id);

                      return (
                        <FoodCard
                          key={food.id}
                          food={food}
                          width={cardWidth}
                          quantity={cartItem?.quantity || 0}
                          onAdd={() => addToCart(food)}
                          onDecrease={() => changeQuantity(food.id, -1)}
                        />
                      );
                    })}
                  </View>
                )}
              </View>
            </ScrollView>

            {/* FLOATING CART BAR */}
            <Animated.View
              pointerEvents={cartCount > 0 ? 'auto' : 'none'}
              style={[styles.cartBarWrap, cartBarStyle]}
            >
              <Pressable
                onPress={() => setPageStep('checkout')}
                style={({ pressed }) => [
                  styles.cartBar,
                  pressed && styles.cartBarPressed,
                ]}
              >
                <View style={styles.cartBarLeft}>
                  <Animated.View
                    style={[
                      styles.cartBarBadge,
                      { transform: [{ scale: badgeScale }] },
                    ]}
                  >
                    <Text style={styles.cartBarBadgeText}>{cartCount}</Text>
                  </Animated.View>

                  <View>
                    <Text style={styles.cartBarLabel}>
                      {cartCount} item{cartCount === 1 ? '' : 's'} selected
                    </Text>

                    <Text style={styles.cartBarTotal}>{money(subtotal)}</Text>
                  </View>
                </View>

                <View style={styles.cartBarAction}>
                  <Text style={styles.cartBarActionText}>Checkout</Text>
                  <Text style={styles.cartBarActionArrow}>→</Text>
                </View>
              </Pressable>
            </Animated.View>
          </View>
        ) : (
          <View style={styles.flex}>
            <ScrollView
              style={styles.flex}
              contentContainerStyle={styles.checkoutContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.checkoutContainer}>
                {/* TITLE ROW */}
                <View style={styles.checkoutTitleRow}>
                  <Pressable
                    onPress={() => setPageStep('menu')}
                    style={({ pressed }) => [
                      styles.backButton,
                      pressed && styles.pressedDim,
                    ]}
                  >
                    <Text style={styles.backButtonText}>←</Text>
                  </Pressable>

                  <View style={styles.flex}>
                    <Text style={styles.pageTitle}>Checkout</Text>
                    <Text style={styles.pageSubtitle}>
                      Review items, add customer and pay
                    </Text>
                  </View>

                  <View style={styles.stepBadge}>
                    <Text style={styles.stepBadgeText}>2 / 2</Text>
                  </View>
                </View>

                {/* BILL ITEMS */}
                <View style={styles.sectionCard}>
                  <View style={styles.sectionHeader}>
                    <View>
                      <Text style={styles.sectionTitle}>Bill summary</Text>
                      <Text style={styles.sectionSubtitle}>
                        {cartCount} total item{cartCount === 1 ? '' : 's'}
                      </Text>
                    </View>

                    <Pressable
                      onPress={() => setPageStep('menu')}
                      style={({ pressed }) => [
                        styles.editItemsButton,
                        pressed && styles.pressedDim,
                      ]}
                    >
                      <Text style={styles.editItemsText}>+ Add more</Text>
                    </Pressable>
                  </View>

                  {cart.length === 0 ? (
                    <View style={styles.emptyCart}>
                      <Text style={styles.emptyCartIcon}>🛒</Text>
                      <Text style={styles.emptyCartTitle}>Cart is empty</Text>
                      <Text style={styles.emptyCartText}>
                        Go back to the menu and add some items
                      </Text>
                    </View>
                  ) : (
                    cart.map((item, index) => (
                      <CartItemRow
                        key={item.id}
                        item={item}
                        isLast={index === cart.length - 1}
                        onDecrease={() => changeQuantity(item.id, -1)}
                        onIncrease={() => changeQuantity(item.id, 1)}
                        onRemove={() => removeFromCart(item.id)}
                      />
                    ))
                  )}

                  <View style={styles.billTotals}>
                    <View style={styles.totalRow}>
                      <Text style={styles.totalLabel}>Subtotal</Text>
                      <Text style={styles.totalValue}>{money(subtotal)}</Text>
                    </View>

                    <View style={styles.totalRow}>
                      <Text style={styles.totalLabel}>Discount</Text>
                      <Text style={styles.totalValue}>₹0</Text>
                    </View>

                    <View style={styles.totalRow}>
                      <Text style={styles.totalLabel}>Tax</Text>
                      <Text style={styles.totalValue}>₹0</Text>
                    </View>

                    <View style={styles.totalDivider} />

                    <View style={styles.totalRow}>
                      <Text style={styles.grandTotalLabel}>Total payable</Text>
                      <Text style={styles.grandTotalValue}>
                        {money(totalAmount)}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* CUSTOMER */}
                <View style={styles.sectionCard}>
                  <Text style={styles.sectionTitle}>Customer information</Text>
                  <Text style={styles.sectionSubtitle}>
                    Walk-in customer details are optional
                  </Text>

                  <Text style={styles.inputLabel}>Customer name</Text>
                  <TextInput
                    value={customerName}
                    onChangeText={setCustomerName}
                    placeholder="Enter customer name"
                    placeholderTextColor={C.subtle}
                    style={styles.checkoutInput}
                    maxLength={100}
                  />

                  <Text style={styles.inputLabel}>Phone number</Text>
                  <TextInput
                    value={customerPhone}
                    onChangeText={setCustomerPhone}
                    placeholder="Enter phone number"
                    placeholderTextColor={C.subtle}
                    style={styles.checkoutInput}
                    keyboardType="phone-pad"
                    maxLength={15}
                  />
                </View>

                {/* PAYMENT */}
                <View style={styles.sectionCard}>
                  <Text style={styles.sectionTitle}>Payment method</Text>

                  <View style={styles.paymentOptions}>
                    <PaymentOption
                      label="Cash"
                      subtitle="Cash payment"
                      icon="💵"
                      active={paymentMethod === 'CASH'}
                      onPress={() => setPaymentMethod('CASH')}
                    />

                    <PaymentOption
                      label="UPI"
                      subtitle="Digital payment"
                      icon="📱"
                      active={paymentMethod === 'UPI'}
                      onPress={() => setPaymentMethod('UPI')}
                    />
                  </View>

                  <Text style={styles.secureNote}>
                    ✓ Secure admin billing · {paymentMethod}
                  </Text>
                </View>
              </View>
            </ScrollView>

            {/* STICKY BOTTOM BAR */}
            <View style={styles.bottomBar}>
              <View style={styles.bottomBarInner}>
                <View>
                  <Text style={styles.bottomBarLabel}>Total payable</Text>
                  <Text style={styles.bottomBarTotal}>
                    {money(totalAmount)}
                  </Text>
                </View>

                <Pressable
                  disabled={!cart.length}
                  onPress={() => setConfirmVisible(true)}
                  style={({ pressed }) => [
                    styles.checkoutButton,
                    !cart.length && styles.checkoutButtonDisabled,
                    pressed && !!cart.length && styles.checkoutButtonPressed,
                  ]}
                >
                  <Text style={styles.checkoutButtonText}>Generate bill</Text>
                  <Text style={styles.checkoutButtonArrow}>→</Text>
                </Pressable>
              </View>
            </View>
          </View>
        )}
      </Animated.View>

      {/* ====================================== */}
      {/* CHECKOUT CONFIRMATION MODAL */}
      {/* ====================================== */}

      <Modal
        visible={confirmVisible}
        transparent
        animationType="slide"
        onRequestClose={() => {
          if (!creatingBill) {
            setConfirmVisible(false);
          }
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />

            <View style={styles.confirmIconBox}>
              <Text style={styles.confirmIcon}>🧾</Text>
            </View>

            <Text style={styles.confirmTitle}>Confirm bill</Text>

            <Text style={styles.confirmSubtitle}>
              Please verify the order before completing payment.
            </Text>

            <View style={styles.confirmDetails}>
              <View style={styles.confirmRow}>
                <Text style={styles.confirmLabel}>Items</Text>
                <Text style={styles.confirmValue}>{cartCount}</Text>
              </View>

              <View style={styles.confirmRow}>
                <Text style={styles.confirmLabel}>Payment</Text>
                <Text style={styles.confirmValue}>{paymentMethod}</Text>
              </View>

              <View style={styles.confirmRow}>
                <Text style={styles.confirmLabel}>Customer</Text>
                <Text style={styles.confirmValue}>
                  {customerName.trim() || 'Walk-in customer'}
                </Text>
              </View>

              <View style={styles.confirmTotalRow}>
                <Text style={styles.confirmTotalLabel}>Total payable</Text>
                <Text style={styles.confirmTotalValue}>
                  {money(totalAmount)}
                </Text>
              </View>
            </View>

            <Pressable
              disabled={creatingBill}
              onPress={createBill}
              style={({ pressed }) => [
                styles.confirmButton,
                pressed && styles.checkoutButtonPressed,
              ]}
            >
              {creatingBill ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.confirmButtonText}>Complete payment</Text>
              )}
            </Pressable>

            <Pressable
              disabled={creatingBill}
              onPress={() => setConfirmVisible(false)}
              style={styles.cancelConfirmButton}
            >
              <Text style={styles.cancelConfirmText}>Go back</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* ====================================== */}
      {/* RECEIPT MODAL */}
      {/* ====================================== */}

      <Modal
        visible={receiptVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setReceiptVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.sheet, { maxHeight: height * 0.92 }]}>
            <View style={styles.sheetHandle} />

            <View style={styles.receiptTop}>
              <View style={styles.receiptSuccessIcon}>
                <Text style={styles.receiptSuccessText}>✓</Text>
              </View>

              <Text style={styles.receiptSuccessTitle}>Bill completed</Text>

              <Text style={styles.receiptSuccessSubtitle}>
                Payment marked as paid
              </Text>
            </View>

            <ScrollView
              style={[styles.receiptScroll, { maxHeight: height * 0.42 }]}
              showsVerticalScrollIndicator={false}
            >
              {lastOrder && (
                <View style={styles.receiptPaper}>
                  <Text style={styles.receiptBrand}>EatWell</Text>

                  <Text style={styles.receiptTagline}>
                    GOOD FOOD. GOOD MOOD.
                  </Text>

                  <View style={styles.receiptDivider} />

                  <Text style={styles.receiptOrderNumber}>
                    {lastOrder.orderNumber}
                  </Text>

                  <Text style={styles.receiptDate}>
                    {formatDate(lastOrder.createdAt)}
                  </Text>

                  <Text style={styles.receiptDineIn}>DINE-IN BILL</Text>

                  {!!lastOrder.customerName && (
                    <Text style={styles.receiptCustomer}>
                      Customer: {lastOrder.customerName}
                    </Text>
                  )}

                  {!!lastOrder.customerPhone && (
                    <Text style={styles.receiptCustomer}>
                      Phone: {lastOrder.customerPhone}
                    </Text>
                  )}

                  <View style={styles.receiptDivider} />

                  <View style={styles.receiptItemsHeader}>
                    <Text style={styles.receiptItemName}>Item</Text>
                    <Text style={styles.receiptItemAmount}>Amount</Text>
                  </View>

                  {lastOrder.items?.map((item, index) => (
                    <View
                      key={`${item.foodId}-${index}`}
                      style={styles.receiptItemRow}
                    >
                      <View style={styles.receiptItemLeft}>
                        <Text style={styles.receiptItemTitle}>{item.name}</Text>

                        <Text style={styles.receiptItemQty}>
                          {item.quantity} × {money(item.price)}
                        </Text>
                      </View>

                      <Text style={styles.receiptItemAmount}>
                        {money(item.itemTotal)}
                      </Text>
                    </View>
                  ))}

                  <View style={styles.receiptDivider} />

                  <View style={styles.receiptTotalRow}>
                    <Text style={styles.receiptTotalLabel}>Total</Text>

                    <Text style={styles.receiptTotalValue}>
                      {money(lastOrder.totalAmount)}
                    </Text>
                  </View>

                  <Text style={styles.receiptPayment}>
                    Payment: {lastOrder.paymentMethod}
                  </Text>

                  <Text style={styles.receiptPaid}>PAID</Text>

                  <View style={styles.receiptDivider} />

                  <Text style={styles.receiptThankYou}>
                    Thank you for visiting EatWell!
                  </Text>
                </View>
              )}
            </ScrollView>

            <View style={styles.receiptActionRow}>
              <Pressable
                style={({ pressed }) => [
                  styles.receiptPrintButton,
                  pressed && styles.pressedDim,
                ]}
                onPress={() => lastOrder && printBill(lastOrder)}
              >
                <Text style={styles.receiptPrintText}>🖨  Print bill</Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.receiptDoneButton,
                  pressed && styles.pressedDim,
                ]}
                onPress={() => {
                  setReceiptVisible(false);
                  setPageStep('menu');
                }}
              >
                <Text style={styles.receiptDoneText}>Done</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ====================================== */}
      {/* BILL HISTORY MODAL */}
      {/* ====================================== */}

      <Modal
        visible={historyVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setHistoryVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => setHistoryVisible(false)}
          />

          <View style={[styles.sheet, { height: height * 0.88 }]}>
            <View style={styles.sheetHandle} />

            <View style={styles.historyModalHeader}>
              <View>
                <Text style={styles.historyModalTitle}>POS bill history</Text>
                <Text style={styles.historyModalSubtitle}>
                  Recent counter orders
                </Text>
              </View>

              <Pressable
                style={styles.modalCloseButton}
                onPress={() => setHistoryVisible(false)}
              >
                <Text style={styles.modalCloseText}>×</Text>
              </Pressable>
            </View>

            <View style={styles.historySearchBox}>
              <Text style={styles.searchIcon}>⌕</Text>

              <TextInput
                value={historySearch}
                onChangeText={setHistorySearch}
                placeholder="Search bill, customer or phone"
                placeholderTextColor={C.subtle}
                style={styles.searchInput}
              />
            </View>

            <ScrollView
              style={styles.historyScroll}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  tintColor={C.primary}
                  colors={[C.primary]}
                  onRefresh={async () => {
                    setRefreshing(true);
                    await loadHistory();
                    setRefreshing(false);
                  }}
                />
              }
            >
              {filteredHistory.length === 0 ? (
                <View style={styles.historyEmpty}>
                  <Text style={styles.emptyCartIcon}>🧾</Text>

                  <Text style={styles.emptyCartTitle}>No bills found</Text>

                  <Text style={styles.emptyCartText}>
                    Completed POS bills will appear here
                  </Text>
                </View>
              ) : (
                filteredHistory.map((order) => (
                  <View key={order._id} style={styles.historyOrderCard}>
                    <View style={styles.historyOrderTop}>
                      <View>
                        <Text style={styles.historyOrderNumber}>
                          {order.orderNumber}
                        </Text>

                        <Text style={styles.historyOrderDate}>
                          {formatDate(order.createdAt)}
                        </Text>
                      </View>

                      <Text style={styles.historyOrderAmount}>
                        {money(order.totalAmount)}
                      </Text>
                    </View>

                    <View style={styles.historyOrderBottom}>
                      <Text style={styles.historyOrderCustomer}>
                        {order.customerName || 'Walk-in customer'}
                      </Text>

                      <View style={styles.historyPaidBadge}>
                        <Text style={styles.historyPaidText}>
                          {order.paymentMethod} · PAID
                        </Text>
                      </View>
                    </View>
                  </View>
                ))
              )}
            </ScrollView>

            <Pressable
              style={({ pressed }) => [
                styles.historyCloseButton,
                pressed && styles.pressedDim,
              ]}
              onPress={() => setHistoryVisible(false)}
            >
              <Text style={styles.historyCloseText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

// ==========================================
// SUMMARY CARD
// ==========================================

function SummaryCard({
  icon,
  label,
  value,
  color,
  softColor,
}: {
  icon: string;
  label: string;
  value: string;
  color: string;
  softColor: string;
}) {
  return (
    <View style={styles.summaryCard}>
      <View
        style={[
          styles.summaryIconBox,
          { backgroundColor: softColor },
        ]}
      >
        <Text style={[styles.summaryIcon, { color }]}>{icon}</Text>
      </View>

      <View style={styles.summaryTextBox}>
        <Text style={styles.summaryLabel} numberOfLines={1}>
          {label}
        </Text>

        <Text style={styles.summaryValue} numberOfLines={1}>
          {value}
        </Text>
      </View>
    </View>
  );
}

// ==========================================
// FOOD CARD
// ==========================================

function FoodCard({
  food,
  width,
  quantity,
  onAdd,
  onDecrease,
}: {
  food: Food;
  width: number;
  quantity: number;
  onAdd: () => void;
  onDecrease: () => void;
}) {
  const imageUri = getFoodImageUri(food.image);
  const [imageFailed, setImageFailed] = useState(false);
  const selected = quantity > 0;

  return (
    <Pressable
      onPress={onAdd}
      style={({ pressed }) => [
        styles.foodCard,
        { width },
        selected && styles.foodCardSelected,
        pressed && styles.foodCardPressed,
      ]}
    >
      <View style={[styles.foodImageWrap, { height: Math.round(width * 0.75) }]}>
        {imageUri && !imageFailed ? (
          <Image
            source={{ uri: imageUri }}
            style={styles.foodImage}
            resizeMode="cover"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <View style={styles.foodImagePlaceholder}>
            <Text style={styles.foodPlaceholderIcon}>🍽</Text>
          </View>
        )}

        {selected && (
          <View style={styles.foodQuantityBadge}>
            <Text style={styles.foodQuantityText}>{quantity}</Text>
          </View>
        )}
      </View>

      <View style={styles.foodCardBody}>
        <Text style={styles.foodName} numberOfLines={2}>
          {food.name}
        </Text>

        <Text style={styles.foodCategory} numberOfLines={1}>
          {food.category}
        </Text>

        <Text style={styles.foodPrice}>{money(food.price)}</Text>

        {selected ? (
          <View style={styles.cardStepper}>
            <Pressable
              onPress={onDecrease}
              style={({ pressed }) => [
                styles.cardStepperButton,
                pressed && styles.pressedDim,
              ]}
              hitSlop={4}
            >
              <Text style={styles.cardStepperText}>−</Text>
            </Pressable>

            <Text style={styles.cardStepperValue}>{quantity}</Text>

            <Pressable
              onPress={onAdd}
              style={({ pressed }) => [
                styles.cardStepperButton,
                styles.cardStepperButtonPlus,
                pressed && styles.pressedDim,
              ]}
              hitSlop={4}
            >
              <Text style={[styles.cardStepperText, styles.cardStepperTextPlus]}>
                +
              </Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.addFoodButton}>
            <Text style={styles.addFoodButtonText}>+ Add</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

// ==========================================
// CART ITEM
// ==========================================

function CartItemRow({
  item,
  isLast,
  onDecrease,
  onIncrease,
  onRemove,
}: {
  item: CartItem;
  isLast?: boolean;
  onDecrease: () => void;
  onIncrease: () => void;
  onRemove: () => void;
}) {
  const imageUri = getFoodImageUri(item.image);

  return (
    <View style={[styles.cartItem, isLast && styles.cartItemLast]}>
      {imageUri ? (
        <Image
          source={{ uri: imageUri }}
          style={styles.cartItemImage}
          resizeMode="cover"
        />
      ) : (
        <View style={styles.cartItemImagePlaceholder}>
          <Text>🍽</Text>
        </View>
      )}

      <View style={styles.cartItemInfo}>
        <Text style={styles.cartItemName} numberOfLines={2}>
          {item.name}
        </Text>

        <Text style={styles.cartItemPrice}>{money(item.price)} each</Text>

        <View style={styles.quantityControl}>
          <Pressable
            onPress={onDecrease}
            style={({ pressed }) => [
              styles.quantityButton,
              pressed && styles.pressedDim,
            ]}
            hitSlop={4}
          >
            <Text style={styles.quantityButtonText}>−</Text>
          </Pressable>

          <Text style={styles.quantityValue}>{item.quantity}</Text>

          <Pressable
            onPress={onIncrease}
            style={({ pressed }) => [
              styles.quantityButton,
              styles.quantityButtonPlus,
              pressed && styles.pressedDim,
            ]}
            hitSlop={4}
          >
            <Text style={[styles.quantityButtonText, styles.quantityButtonTextPlus]}>
              +
            </Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.cartItemRight}>
        <Text style={styles.cartItemTotal}>
          {money(item.price * item.quantity)}
        </Text>

        <Pressable onPress={onRemove} hitSlop={8}>
          <Text style={styles.removeItemText}>Remove</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ==========================================
// PAYMENT OPTION
// ==========================================

function PaymentOption({
  label,
  subtitle,
  icon,
  active,
  onPress,
}: {
  label: string;
  subtitle: string;
  icon: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.paymentOption,
        active && styles.paymentOptionActive,
      ]}
    >
      <View
        style={[
          styles.paymentIconBox,
          active && styles.paymentIconBoxActive,
        ]}
      >
        <Text style={styles.paymentIcon}>{icon}</Text>
      </View>

      <View style={styles.paymentOptionText}>
        <Text
          style={[
            styles.paymentOptionLabel,
            active && styles.paymentOptionLabelActive,
          ]}
        >
          {label}
        </Text>

        <Text style={styles.paymentOptionSubtitle}>{subtitle}</Text>
      </View>

      <View
        style={[
          styles.radioOuter,
          active && styles.radioOuterActive,
        ]}
      >
        {active && <View style={styles.radioInner} />}
      </View>
    </Pressable>
  );
}

// ==========================================
// STYLES
// ==========================================

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: C.bg,
  },

  flex: {
    flex: 1,
  },

  stepWrap: {
    flex: 1,
  },

  pressedDim: {
    opacity: 0.7,
  },

  // HEADER
  header: {
    backgroundColor: C.white,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    paddingHorizontal: PAGE_PADDING,
    paddingTop: TOP_PADDING,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },

  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    flexShrink: 1,
  },

  logoBox: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },

  logoText: {
    color: C.white,
    fontSize: 23,
    fontWeight: '900',
  },

  brandName: {
    color: C.ink,
    fontSize: 18,
    fontWeight: '800',
  },

  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },

  onlineDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: C.green,
  },

  statusText: {
    color: C.muted,
    fontSize: 11,
    fontWeight: '600',
  },

  historyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.dark,
    paddingHorizontal: 14,
    minHeight: 42,
    borderRadius: 12,
    gap: 7,
  },

  historyButtonIcon: {
    color: C.white,
    fontSize: 17,
  },

  historyButtonText: {
    color: C.white,
    fontSize: 13,
    fontWeight: '700',
  },

  // FILTER BAR
  filterBar: {
    backgroundColor: C.white,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    paddingTop: 12,
  },

  filterInner: {
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
  },

  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: PAGE_PADDING,
  },

  searchBox: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: '#FAFAFB',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 13,
    gap: 8,
  },

  searchIcon: {
    color: C.muted,
    fontSize: 22,
  },

  searchInput: {
    flex: 1,
    color: C.ink,
    fontSize: 15,
    paddingVertical: 0,
    outlineStyle: 'none' as any,
  },

  clearSearch: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },

  clearSearchText: {
    color: C.muted,
    fontSize: 18,
    lineHeight: 20,
  },

  refreshButton: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },

  refreshIcon: {
    color: C.ink,
    fontSize: 22,
  },

  // CATEGORIES
  categoryRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: PAGE_PADDING,
    paddingVertical: 12,
  },

  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 40,
    paddingLeft: 15,
    paddingRight: 8,
    borderRadius: 20,
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.border,
  },

  categoryChipActive: {
    backgroundColor: C.dark,
    borderColor: C.dark,
  },

  categoryText: {
    color: C.ink,
    fontSize: 13,
    fontWeight: '700',
  },

  categoryTextActive: {
    color: C.white,
  },

  categoryCountBox: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: C.white,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },

  categoryCountBoxActive: {
    backgroundColor: C.primary,
  },

  categoryCount: {
    color: C.muted,
    fontSize: 11,
    fontWeight: '800',
  },

  categoryCountActive: {
    color: C.white,
  },

  // MENU CONTENT
  menuContent: {
    padding: PAGE_PADDING,
    paddingBottom: 130,
  },

  container: {
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
  },

  // SUMMARY
  summaryRow: {
    gap: 10,
    paddingRight: PAGE_PADDING,
    paddingBottom: 4,
  },

  summaryCard: {
    width: 158,
    backgroundColor: C.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    padding: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  summaryIconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },

  summaryIcon: {
    fontSize: 18,
    fontWeight: '900',
  },

  summaryTextBox: {
    flex: 1,
  },

  summaryLabel: {
    color: C.muted,
    fontSize: 11,
    fontWeight: '600',
  },

  summaryValue: {
    color: C.ink,
    fontSize: 17,
    fontWeight: '900',
    marginTop: 3,
  },

  // ERROR
  errorBox: {
    backgroundColor: C.redSoft,
    borderRadius: 12,
    padding: 14,
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },

  errorText: {
    color: C.red,
    fontSize: 13,
    flex: 1,
  },

  retryText: {
    color: C.red,
    fontWeight: '800',
  },

  foodCountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 18,
    marginBottom: 12,
  },

  foodCountText: {
    color: C.ink,
    fontSize: 15,
    fontWeight: '800',
  },

  foodCountHint: {
    color: C.subtle,
    fontSize: 12,
  },

  // PRODUCTS
  productGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GRID_GAP,
  },

  foodCard: {
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: C.border,
    backgroundColor: C.white,
    overflow: 'hidden',
  },

  foodCardSelected: {
    borderColor: C.primary,
    backgroundColor: '#FFFCF5',
  },

  foodCardPressed: {
    transform: [{ scale: 0.97 }],
  },

  foodImageWrap: {
    backgroundColor: C.bg,
    position: 'relative',
  },

  foodImage: {
    width: '100%',
    height: '100%',
  },

  foodImagePlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  foodPlaceholderIcon: {
    fontSize: 34,
  },

  foodQuantityBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 7,
  },

  foodQuantityText: {
    color: C.white,
    fontSize: 13,
    fontWeight: '900',
  },

  foodCardBody: {
    padding: 11,
  },

  foodName: {
    color: C.ink,
    fontSize: 14,
    fontWeight: '800',
    minHeight: 36,
    lineHeight: 18,
  },

  foodCategory: {
    color: C.muted,
    fontSize: 11,
    marginTop: 3,
  },

  foodPrice: {
    color: C.ink,
    fontSize: 16,
    fontWeight: '900',
    marginTop: 8,
  },

  addFoodButton: {
    height: 40,
    marginTop: 10,
    borderRadius: 12,
    backgroundColor: C.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },

  addFoodButtonText: {
    color: C.primaryDark,
    fontSize: 13,
    fontWeight: '900',
  },

  cardStepper: {
    height: 40,
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: C.primarySoft,
    borderRadius: 12,
    paddingHorizontal: 4,
  },

  cardStepperButton: {
    width: 34,
    height: 32,
    borderRadius: 9,
    backgroundColor: C.white,
    alignItems: 'center',
    justifyContent: 'center',
  },

  cardStepperButtonPlus: {
    backgroundColor: C.primary,
  },

  cardStepperText: {
    color: C.primaryDark,
    fontSize: 20,
    fontWeight: '900',
    lineHeight: 22,
  },

  cardStepperTextPlus: {
    color: C.white,
  },

  cardStepperValue: {
    color: C.ink,
    fontSize: 15,
    fontWeight: '900',
  },

  // LOADING / EMPTY
  loadingBox: {
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },

  loadingText: {
    color: C.muted,
    fontSize: 13,
  },

  emptyMenu: {
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
  },

  emptyMenuIcon: {
    fontSize: 42,
    marginBottom: 10,
  },

  emptyMenuTitle: {
    color: C.ink,
    fontSize: 16,
    fontWeight: '800',
  },

  emptyMenuText: {
    color: C.muted,
    fontSize: 12,
    marginTop: 6,
    textAlign: 'center',
  },

  // FLOATING CART BAR
  cartBarWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: PAGE_PADDING,
    paddingBottom: Platform.OS === 'ios' ? 28 : 16,
    alignItems: 'center',
  },

  cartBar: {
    width: '100%',
    maxWidth: 640,
    minHeight: 68,
    borderRadius: 20,
    backgroundColor: C.dark,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },

  cartBarPressed: {
    transform: [{ scale: 0.98 }],
  },

  cartBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flexShrink: 1,
  },

  cartBarBadge: {
    minWidth: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },

  cartBarBadgeText: {
    color: C.white,
    fontSize: 16,
    fontWeight: '900',
  },

  cartBarLabel: {
    color: '#C9CBD0',
    fontSize: 12,
    fontWeight: '600',
  },

  cartBarTotal: {
    color: C.white,
    fontSize: 19,
    fontWeight: '900',
    marginTop: 2,
  },

  cartBarAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: C.primary,
    borderRadius: 14,
    paddingHorizontal: 16,
    height: 46,
  },

  cartBarActionText: {
    color: '#29251B',
    fontSize: 14,
    fontWeight: '900',
  },

  cartBarActionArrow: {
    color: '#29251B',
    fontSize: 18,
    fontWeight: '900',
  },

  // CHECKOUT
  checkoutContent: {
    padding: PAGE_PADDING,
    paddingBottom: 24,
  },

  checkoutContainer: {
    width: '100%',
    maxWidth: 680,
    alignSelf: 'center',
    gap: 14,
  },

  checkoutTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },

  backButton: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },

  backButtonText: {
    color: C.ink,
    fontSize: 22,
    fontWeight: '800',
  },

  pageTitle: {
    color: C.ink,
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.4,
  },

  pageSubtitle: {
    color: C.muted,
    fontSize: 12,
    marginTop: 3,
  },

  stepBadge: {
    backgroundColor: C.primarySoft,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },

  stepBadgeText: {
    color: C.primaryDark,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.5,
  },

  sectionCard: {
    backgroundColor: C.white,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.border,
    padding: 16,
  },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },

  sectionTitle: {
    color: C.ink,
    fontSize: 17,
    fontWeight: '900',
  },

  sectionSubtitle: {
    color: C.muted,
    fontSize: 12,
    marginTop: 4,
  },

  editItemsButton: {
    backgroundColor: C.primarySoft,
    borderRadius: 11,
    paddingHorizontal: 13,
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },

  editItemsText: {
    color: C.primaryDark,
    fontSize: 13,
    fontWeight: '900',
  },

  inputLabel: {
    color: C.ink,
    fontSize: 12,
    fontWeight: '800',
    marginTop: 16,
  },

  checkoutInput: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: '#FAFAFB',
    borderRadius: 13,
    paddingHorizontal: 14,
    color: C.ink,
    fontSize: 16,
    marginTop: 8,
    outlineStyle: 'none' as any,
  },

  emptyCart: {
    minHeight: 160,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },

  emptyCartIcon: {
    fontSize: 30,
    marginBottom: 8,
  },

  emptyCartTitle: {
    color: C.ink,
    fontSize: 14,
    fontWeight: '800',
  },

  emptyCartText: {
    color: C.muted,
    fontSize: 12,
    marginTop: 6,
    textAlign: 'center',
    lineHeight: 17,
  },

  // CART ITEM
  cartItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },

  cartItemLast: {
    borderBottomWidth: 0,
  },

  cartItemImage: {
    width: 56,
    height: 56,
    borderRadius: 13,
    backgroundColor: C.bg,
  },

  cartItemImagePlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 13,
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },

  cartItemInfo: {
    flex: 1,
    minWidth: 0,
  },

  cartItemName: {
    color: C.ink,
    fontSize: 14,
    fontWeight: '800',
  },

  cartItemPrice: {
    color: C.muted,
    fontSize: 12,
    marginTop: 3,
  },

  quantityControl: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 10,
  },

  quantityButton: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },

  quantityButtonPlus: {
    backgroundColor: C.primary,
  },

  quantityButtonText: {
    color: C.ink,
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 22,
  },

  quantityButtonTextPlus: {
    color: C.white,
  },

  quantityValue: {
    color: C.ink,
    fontSize: 15,
    fontWeight: '900',
    minWidth: 20,
    textAlign: 'center',
  },

  cartItemRight: {
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
    gap: 9,
  },

  cartItemTotal: {
    color: C.ink,
    fontSize: 14,
    fontWeight: '900',
  },

  removeItemText: {
    color: C.red,
    fontSize: 12,
    fontWeight: '700',
  },

  // TOTALS
  billTotals: {
    marginTop: 8,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: C.border,
    gap: 11,
  },

  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  totalLabel: {
    color: C.muted,
    fontSize: 13,
  },

  totalValue: {
    color: C.ink,
    fontSize: 13,
    fontWeight: '700',
  },

  totalDivider: {
    height: 1,
    backgroundColor: C.border,
  },

  grandTotalLabel: {
    color: C.ink,
    fontSize: 15,
    fontWeight: '900',
  },

  grandTotalValue: {
    color: C.ink,
    fontSize: 24,
    fontWeight: '900',
  },

  // PAYMENT
  paymentOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 14,
  },

  paymentOption: {
    flex: 1,
    minWidth: 140,
    minHeight: 68,
    borderWidth: 1.5,
    borderColor: C.border,
    borderRadius: 16,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  paymentOptionActive: {
    borderColor: C.primary,
    backgroundColor: '#FFFCF5',
  },

  paymentIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },

  paymentIconBoxActive: {
    backgroundColor: C.primarySoft,
  },

  paymentIcon: {
    fontSize: 20,
  },

  paymentOptionText: {
    flex: 1,
    minWidth: 0,
  },

  paymentOptionLabel: {
    color: C.ink,
    fontSize: 14,
    fontWeight: '800',
  },

  paymentOptionLabelActive: {
    color: C.primaryDark,
  },

  paymentOptionSubtitle: {
    color: C.muted,
    fontSize: 11,
    marginTop: 3,
  },

  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: C.subtle,
    alignItems: 'center',
    justifyContent: 'center',
  },

  radioOuterActive: {
    borderColor: C.primary,
  },

  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: C.primary,
  },

  secureNote: {
    color: C.subtle,
    fontSize: 11,
    textAlign: 'center',
    marginTop: 16,
  },

  // BOTTOM BAR (CHECKOUT)
  bottomBar: {
    backgroundColor: C.white,
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingHorizontal: PAGE_PADDING,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 28 : 14,
    alignItems: 'center',
  },

  bottomBarInner: {
    width: '100%',
    maxWidth: 680,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },

  bottomBarLabel: {
    color: C.muted,
    fontSize: 12,
    fontWeight: '600',
  },

  bottomBarTotal: {
    color: C.ink,
    fontSize: 22,
    fontWeight: '900',
    marginTop: 2,
  },

  checkoutButton: {
    flex: 1,
    maxWidth: 260,
    height: 54,
    borderRadius: 16,
    backgroundColor: C.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },

  checkoutButtonDisabled: {
    backgroundColor: '#D8D9DC',
  },

  checkoutButtonPressed: {
    backgroundColor: C.primaryDark,
  },

  checkoutButtonText: {
    color: C.white,
    fontSize: 15,
    fontWeight: '900',
  },

  checkoutButtonArrow: {
    color: C.white,
    fontSize: 20,
    fontWeight: '800',
  },

  // MODALS / SHEETS
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(18, 20, 24, 0.55)',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },

  modalBackdrop: {
    ...StyleSheet.absoluteFill,
  },

  sheet: {
    width: '100%',
    maxWidth: 560,
    backgroundColor: C.white,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
  },

  sheetHandle: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: C.border,
    alignSelf: 'center',
    marginBottom: 16,
  },

  // CONFIRM
  confirmIconBox: {
    width: 58,
    height: 58,
    borderRadius: 18,
    backgroundColor: C.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },

  confirmIcon: {
    fontSize: 28,
  },

  confirmTitle: {
    color: C.ink,
    fontSize: 22,
    fontWeight: '900',
    textAlign: 'center',
    marginTop: 14,
  },

  confirmSubtitle: {
    color: C.muted,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
    marginTop: 8,
  },

  confirmDetails: {
    backgroundColor: C.bg,
    borderRadius: 16,
    padding: 16,
    marginTop: 20,
    gap: 13,
  },

  confirmRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },

  confirmLabel: {
    color: C.muted,
    fontSize: 13,
  },

  confirmValue: {
    color: C.ink,
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'right',
    flexShrink: 1,
  },

  confirmTotalRow: {
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingTop: 13,
    marginTop: 3,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  confirmTotalLabel: {
    color: C.ink,
    fontSize: 14,
    fontWeight: '800',
  },

  confirmTotalValue: {
    color: C.primaryDark,
    fontSize: 22,
    fontWeight: '900',
  },

  confirmButton: {
    height: 54,
    borderRadius: 16,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
  },

  confirmButtonText: {
    color: C.white,
    fontSize: 15,
    fontWeight: '900',
  },

  cancelConfirmButton: {
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },

  cancelConfirmText: {
    color: C.muted,
    fontSize: 14,
    fontWeight: '700',
  },

  // RECEIPT
  receiptTop: {
    alignItems: 'center',
    paddingBottom: 14,
  },

  receiptSuccessIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: C.greenSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },

  receiptSuccessText: {
    color: C.green,
    fontSize: 27,
    fontWeight: '900',
  },

  receiptSuccessTitle: {
    color: C.ink,
    fontSize: 21,
    fontWeight: '900',
    marginTop: 10,
  },

  receiptSuccessSubtitle: {
    color: C.muted,
    fontSize: 12,
    marginTop: 4,
  },

  receiptScroll: {
    flexGrow: 0,
  },

  receiptPaper: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 14,
    padding: 18,
    backgroundColor: '#FFFEFC',
  },

  receiptBrand: {
    color: C.ink,
    fontSize: 23,
    fontWeight: '900',
    textAlign: 'center',
  },

  receiptTagline: {
    color: C.muted,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 2,
    textAlign: 'center',
    marginTop: 3,
  },

  receiptDivider: {
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    borderStyle: 'dashed',
    marginVertical: 13,
  },

  receiptOrderNumber: {
    color: C.ink,
    fontSize: 13,
    fontWeight: '900',
    textAlign: 'center',
  },

  receiptDate: {
    color: C.muted,
    fontSize: 11,
    textAlign: 'center',
    marginTop: 5,
  },

  receiptDineIn: {
    color: C.primaryDark,
    fontSize: 11,
    fontWeight: '900',
    textAlign: 'center',
    marginTop: 9,
  },

  receiptCustomer: {
    color: C.ink,
    fontSize: 12,
    marginTop: 7,
  },

  receiptItemsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },

  receiptItemName: {
    color: C.muted,
    fontSize: 11,
    fontWeight: '800',
  },

  receiptItemAmount: {
    color: C.ink,
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'right',
  },

  receiptItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },

  receiptItemLeft: {
    flex: 1,
  },

  receiptItemTitle: {
    color: C.ink,
    fontSize: 13,
    fontWeight: '700',
  },

  receiptItemQty: {
    color: C.muted,
    fontSize: 11,
    marginTop: 4,
  },

  receiptTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  receiptTotalLabel: {
    color: C.ink,
    fontSize: 14,
    fontWeight: '900',
  },

  receiptTotalValue: {
    color: C.ink,
    fontSize: 20,
    fontWeight: '900',
  },

  receiptPayment: {
    color: C.muted,
    fontSize: 12,
    marginTop: 12,
    textAlign: 'center',
  },

  receiptPaid: {
    color: C.green,
    fontSize: 13,
    fontWeight: '900',
    textAlign: 'center',
    marginTop: 7,
  },

  receiptThankYou: {
    color: C.ink,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    marginVertical: 8,
  },

  receiptActionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },

  receiptPrintButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: 15,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },

  receiptPrintText: {
    color: '#29251B',
    fontSize: 15,
    fontWeight: '900',
  },

  receiptDoneButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: 15,
    backgroundColor: C.dark,
    alignItems: 'center',
    justifyContent: 'center',
  },

  receiptDoneText: {
    color: C.white,
    fontSize: 15,
    fontWeight: '900',
  },

  // HISTORY
  historyModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },

  historyModalTitle: {
    color: C.ink,
    fontSize: 20,
    fontWeight: '900',
  },

  historyModalSubtitle: {
    color: C.muted,
    fontSize: 12,
    marginTop: 4,
  },

  modalCloseButton: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },

  modalCloseText: {
    color: C.ink,
    fontSize: 26,
    lineHeight: 28,
  },

  historySearchBox: {
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.bg,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 13,
    gap: 8,
  },

  historyScroll: {
    flex: 1,
    marginTop: 14,
  },

  historyOrderCard: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    backgroundColor: C.white,
  },

  historyOrderTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },

  historyOrderNumber: {
    color: C.ink,
    fontSize: 14,
    fontWeight: '900',
  },

  historyOrderDate: {
    color: C.muted,
    fontSize: 11,
    marginTop: 5,
  },

  historyOrderAmount: {
    color: C.ink,
    fontSize: 17,
    fontWeight: '900',
  },

  historyOrderBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },

  historyOrderCustomer: {
    color: C.muted,
    fontSize: 12,
  },

  historyPaidBadge: {
    backgroundColor: C.greenSoft,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },

  historyPaidText: {
    color: C.green,
    fontSize: 10,
    fontWeight: '900',
  },

  historyEmpty: {
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
  },

  historyCloseButton: {
    height: 50,
    borderRadius: 14,
    backgroundColor: C.dark,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },

  historyCloseText: {
    color: C.white,
    fontSize: 14,
    fontWeight: '800',
  },
});
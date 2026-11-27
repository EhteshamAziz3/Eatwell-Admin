import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Pressable,
    RefreshControl,
    SafeAreaView,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import api from '../services/api';
import { useAuthStore } from '../store/auth';

type OrderStatus =
    | 'pending'
    | 'confirmed'
    | 'preparing'
    | 'out_for_delivery'
    | 'delivered'
    | 'cancelled'
    | string;

type OrderItem = {
    foodId?: string;
    name?: string;
    price?: number | string;
    quantity?: number | string;
};

type Order = {
    _id: string;
    items?: OrderItem[];
    subtotal?: number | string;
    deliveryFee?: number | string;
    totalAmount?: number | string;
    orderStatus?: OrderStatus;
    paymentStatus?: string;
    paymentMethod?: string;
    createdAt?: string;
    customerName?: string;
    user?: { name?: string } | string | null;
};

type RangeKey = 7 | 30 | 90;

const RANGE_OPTIONS: RangeKey[] = [7, 30, 90];
const money = (value: number) =>
    `₹${Math.round(value).toLocaleString('en-IN')}`;
const number = (value: unknown) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};
const shortDate = (date: Date) =>
    date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
const dayKey = (date: Date) =>
    `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

function getOrderDate(order: Order) {
    const date = order.createdAt ? new Date(order.createdAt) : null;
    return date && !Number.isNaN(date.getTime()) ? date : null;
}

function getTotal(order: Order) {
    return number(order.totalAmount) ||
        number(order.subtotal) + number(order.deliveryFee);
}

function StatCard({
    title,
    value,
    subtitle,
    icon,
    color,
}: {
    title: string;
    value: string;
    subtitle: string;
    icon: keyof typeof Ionicons.glyphMap;
    color: string;
}) {
    return (
        <View style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: `${color}18` }]}>
                <Ionicons name={icon} size={21} color={color} />
            </View>
            <Text style={styles.statTitle}>{title}</Text>
            <Text style={styles.statValue} numberOfLines={1}>{value}</Text>
            <Text style={styles.statSubtitle}>{subtitle}</Text>
        </View>
    );
}

function SectionTitle({ title, trailing }: { title: string; trailing?: string }) {
    return (
        <View style={styles.sectionTitleRow}>
            <Text style={styles.sectionTitle}>{title}</Text>
            {!!trailing && <Text style={styles.sectionTrailing}>{trailing}</Text>}
        </View>
    );
}

export default function AnalyticsScreen() {
    const token = useAuthStore((state) => state.token);
    const [orders, setOrders] = useState<Order[]>([]);
    const [range, setRange] = useState<RangeKey>(7);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState('');

    const loadOrders = useCallback(async (refresh = false) => {
        if (!token) {
            setError('Admin login required. Please sign in again.');
            setLoading(false);
            setRefreshing(false);
            return;
        }

        refresh ? setRefreshing(true) : setLoading(true);
        setError('');

        try {
            const response = await api.get('/orders/admin/all', {
                headers: { Authorization: `Bearer ${token}` },
            });

            const list = response?.data?.orders;
            if (!Array.isArray(list)) {
                throw new Error('Orders response is not in the expected format.');
            }
            setOrders(list);
        } catch (e: any) {
            setError(
                e?.response?.data?.message ||
                e?.message ||
                'Could not load analytics from the server.',
            );
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [token]);

    useFocusEffect(
        useCallback(() => {
            loadOrders();
        }, [loadOrders]),
    );

    const analytics = useMemo(() => {
        const today = new Date();
        const start = new Date(today);
        start.setHours(0, 0, 0, 0);
        start.setDate(start.getDate() - (range - 1));

        const filtered = orders.filter((order) => {
            const date = getOrderDate(order);
            return date && date >= start && date <= today;
        });

        const validOrders = filtered.filter(
            (order) => order.orderStatus !== 'cancelled',
        );
        const delivered = validOrders.filter(
            (order) => order.orderStatus === 'delivered',
        );
        const paid = validOrders.filter(
            (order) => String(order.paymentStatus || '').toLowerCase() === 'paid',
        );

        const grossSales = validOrders.reduce((sum, order) => sum + getTotal(order), 0);
        const paidRevenue = paid.reduce((sum, order) => sum + getTotal(order), 0);
        const averageOrderValue = validOrders.length
            ? grossSales / validOrders.length
            : 0;

        const statuses = [
            { key: 'pending', label: 'New orders', color: '#F59E0B' },
            { key: 'confirmed', label: 'Confirmed', color: '#3B82F6' },
            { key: 'preparing', label: 'Preparing', color: '#8B5CF6' },
            { key: 'out_for_delivery', label: 'On the way', color: '#F97316' },
            { key: 'delivered', label: 'Delivered', color: '#16A34A' },
            { key: 'cancelled', label: 'Cancelled', color: '#EF4444' },
        ].map((status) => ({
            ...status,
            count: filtered.filter((order) => order.orderStatus === status.key).length,
        }));

        const daily = Array.from({ length: range }, (_, index) => {
            const date = new Date(start);
            date.setDate(start.getDate() + index);
            const key = dayKey(date);
            const dayOrders = validOrders.filter((order) => {
                const orderDate = getOrderDate(order);
                return orderDate && dayKey(orderDate) === key;
            });
            return {
                key,
                label: range === 7
                    ? date.toLocaleDateString('en-IN', { weekday: 'short' })
                    : date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
                value: dayOrders.reduce((sum, order) => sum + getTotal(order), 0),
                count: dayOrders.length,
            };
        });

        const itemMap = new Map<string, { quantity: number; sales: number }>();
        validOrders.forEach((order) => {
            (order.items || []).forEach((item) => {
                const name = String(item.name || 'Unnamed item');
                const quantity = Math.max(0, number(item.quantity));
                const sales = number(item.price) * quantity;
                const current = itemMap.get(name) || { quantity: 0, sales: 0 };
                current.quantity += quantity;
                current.sales += sales;
                itemMap.set(name, current);
            });
        });

        const topItems = Array.from(itemMap.entries())
            .map(([name, data]) => ({ name, ...data }))
            .sort((a, b) => b.quantity - a.quantity)
            .slice(0, 5);

        const paymentPending = validOrders.filter(
            (order) => String(order.paymentStatus || '').toLowerCase() !== 'paid',
        ).length;

        return {
            filtered,
            validOrders,
            delivered,
            paid,
            grossSales,
            paidRevenue,
            averageOrderValue,
            statuses,
            daily,
            topItems,
            paymentPending,
        };
    }, [orders, range]);

    const maxDaily = Math.max(...analytics.daily.map((item) => item.value), 1);
    const maxStatus = Math.max(...analytics.statuses.map((item) => item.count), 1);
    const itemMax = Math.max(...analytics.topItems.map((item) => item.quantity), 1);

    if (loading && !refreshing) {
        return (
            <SafeAreaView style={styles.safe}>
                <StatusBar barStyle="dark-content" />
                <View style={styles.center}>
                    <ActivityIndicator size="large" color="#6D28D9" />
                    <Text style={styles.loadingText}>Loading analytics...</Text>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.safe}>
            <StatusBar barStyle="dark-content" />
            <ScrollView
                contentContainerStyle={styles.content}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={() => loadOrders(true)}
                        tintColor="#6D28D9"
                    />
                }
                showsVerticalScrollIndicator={false}
            >
                <View style={styles.header}>
                    <View>
                        <Text style={styles.eyebrow}>EATWELL ADMIN</Text>
                        <Text style={styles.heading}>Analytics</Text>
                        <Text style={styles.headerSub}>Sales and order performance</Text>
                    </View>
                    <Pressable style={styles.refreshButton} onPress={() => loadOrders(true)}>
                        <Ionicons name="refresh" size={20} color="#5B21B6" />
                    </Pressable>
                </View>

                <View style={styles.rangeRow}>
                    {RANGE_OPTIONS.map((days) => (
                        <Pressable
                            key={days}
                            onPress={() => setRange(days)}
                            style={[styles.rangeButton, range === days && styles.rangeButtonActive]}
                        >
                            <Text style={[styles.rangeText, range === days && styles.rangeTextActive]}>
                                {days} days
                            </Text>
                        </Pressable>
                    ))}
                </View>

                {!!error && (
                    <View style={styles.errorBox}>
                        <Ionicons name="alert-circle-outline" size={20} color="#B91C1C" />
                        <View style={{ flex: 1 }}>
                            <Text style={styles.errorText}>{error}</Text>
                            <Pressable onPress={() => loadOrders(true)}>
                                <Text style={styles.retryText}>Try again</Text>
                            </Pressable>
                        </View>
                    </View>
                )}

                <View style={styles.statsGrid}>
                    <StatCard
                        title="Gross sales"
                        value={money(analytics.grossSales)}
                        subtitle="Excludes cancelled orders"
                        icon="cash-outline"
                        color="#7C3AED"
                    />
                    <StatCard
                        title="Paid revenue"
                        value={money(analytics.paidRevenue)}
                        subtitle="Orders marked paid"
                        icon="wallet-outline"
                        color="#059669"
                    />
                    <StatCard
                        title="Orders"
                        value={String(analytics.filtered.length)}
                        subtitle={`${analytics.delivered.length} delivered`}
                        icon="receipt-outline"
                        color="#2563EB"
                    />
                    <StatCard
                        title="Average order"
                        value={money(analytics.averageOrderValue)}
                        subtitle="Per non-cancelled order"
                        icon="stats-chart-outline"
                        color="#EA580C"
                    />
                </View>

                <View style={styles.panel}>
                    <SectionTitle title="Sales trend" trailing={`${range} days`} />
                    <Text style={styles.panelSubtitle}>Order value by day</Text>
                    <View style={styles.chart}>
                        {analytics.daily.map((day) => {
                            const height = Math.max(4, (day.value / maxDaily) * 132);
                            return (
                                <View key={day.key} style={styles.barColumn}>
                                    <Text style={styles.barValue}>
                                        {day.value >= 1000 ? `${(day.value / 1000).toFixed(1)}k` : Math.round(day.value)}
                                    </Text>
                                    <View style={styles.barTrack}>
                                        <View style={[styles.bar, { height }]} />
                                    </View>
                                    <Text style={styles.barLabel} numberOfLines={1}>{day.label}</Text>
                                </View>
                            );
                        })}
                    </View>
                    <View style={styles.chartFooter}>
                        <View style={styles.legendDot} />
                        <Text style={styles.legendText}>Sales from non-cancelled orders</Text>
                    </View>
                </View>

                <View style={styles.panel}>
                    <SectionTitle title="Order status" trailing={`${analytics.filtered.length} total`} />
                    <Text style={styles.panelSubtitle}>Current status of orders in this period</Text>
                    {analytics.statuses.map((status) => (
                        <View key={status.key} style={styles.statusRow}>
                            <View style={styles.statusLabelRow}>
                                <View style={[styles.statusDot, { backgroundColor: status.color }]} />
                                <Text style={styles.statusName}>{status.label}</Text>
                                <Text style={styles.statusCount}>{status.count}</Text>
                            </View>
                            <View style={styles.statusTrack}>
                                <View
                                    style={[
                                        styles.statusFill,
                                        {
                                            backgroundColor: status.color,
                                            width: `${(status.count / maxStatus) * 100}%`,
                                        },
                                    ]}
                                />
                            </View>
                        </View>
                    ))}
                </View>

                <View style={styles.panel}>
                    <SectionTitle title="Best-selling items" trailing="Top 5" />
                    <Text style={styles.panelSubtitle}>Ranked by quantity ordered</Text>
                    {analytics.topItems.length === 0 ? (
                        <Text style={styles.emptyText}>No item sales recorded in this period.</Text>
                    ) : (
                        analytics.topItems.map((item, index) => (
                            <View key={item.name} style={styles.itemRow}>
                                <View style={styles.rank}>
                                    <Text style={styles.rankText}>{index + 1}</Text>
                                </View>
                                <View style={styles.itemMain}>
                                    <View style={styles.itemTextRow}>
                                        <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
                                        <Text style={styles.itemQuantity}>{item.quantity} sold</Text>
                                    </View>
                                    <View style={styles.itemTrack}>
                                        <View
                                            style={[
                                                styles.itemFill,
                                                { width: `${(item.quantity / itemMax) * 100}%` },
                                            ]}
                                        />
                                    </View>
                                </View>
                                <Text style={styles.itemSales}>{money(item.sales)}</Text>
                            </View>
                        ))
                    )}
                </View>

                <View style={styles.bottomCards}>
                    <View style={styles.bottomCard}>
                        <View style={styles.bottomIconWrap}>
                            <Ionicons name="card-outline" size={20} color="#B45309" />
                        </View>
                        <Text style={styles.bottomLabel}>Payment to verify</Text>
                        <Text style={styles.bottomValue}>{analytics.paymentPending}</Text>
                        <Text style={styles.bottomHint}>Orders not marked paid</Text>
                    </View>
                    <View style={styles.bottomCard}>
                        <View style={styles.bottomIconWrap}>
                            <Ionicons name="checkmark-circle-outline" size={20} color="#15803D" />
                        </View>
                        <Text style={styles.bottomLabel}>Paid orders</Text>
                        <Text style={styles.bottomValue}>{analytics.paid.length}</Text>
                        <Text style={styles.bottomHint}>Payment status = paid</Text>
                    </View>
                </View>

                <Text style={styles.footerNote}>
                    Analytics are calculated from orders returned by your connected EatWell API.
                    Pull down to refresh.
                </Text>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: {
        flex: 1,
        backgroundColor: '#F7F7FB'
    },
    content: { 
        paddingHorizontal: 18, 
        paddingTop: 52, 
        paddingBottom: 36 
    },
    center: { 
        flex: 1, 
        alignItems: 'center', 
        justifyContent: 'center', 
        backgroundColor: '#F7F7FB' 
    },
    loadingText: { marginTop: 12, color: '#64748B', fontSize: 15, fontWeight: '600' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
    eyebrow: { color: '#7C3AED', fontSize: 11, fontWeight: '900', letterSpacing: 1.6, marginBottom: 5 },
    heading: { color: '#111827', fontSize: 30, fontWeight: '900', letterSpacing: -0.7 },
    headerSub: { color: '#64748B', fontSize: 14, marginTop: 5 },
    refreshButton: { width: 46, height: 46, borderRadius: 15, backgroundColor: '#EDE9FE', alignItems: 'center', justifyContent: 'center' },
    rangeRow: { flexDirection: 'row', backgroundColor: '#EDEDF3', borderRadius: 14, padding: 4, marginBottom: 16 },
    rangeButton: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 11 },
    rangeButtonActive: { backgroundColor: '#FFFFFF', shadowColor: '#111827', shadowOpacity: 0.07, shadowRadius: 5, elevation: 2 },
    rangeText: { color: '#64748B', fontSize: 13, fontWeight: '700' },
    rangeTextActive: { color: '#5B21B6' },
    errorBox: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', padding: 14, borderRadius: 14, backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA', marginBottom: 16 },
    errorText: { color: '#991B1B', fontSize: 13, lineHeight: 19 },
    retryText: { color: '#B91C1C', fontWeight: '800', marginTop: 7 },
    statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 16 },
    statCard: { width: '48%', flexGrow: 1, minWidth: 140, backgroundColor: '#FFFFFF', borderRadius: 18, padding: 15, borderWidth: 1, borderColor: '#ECECF2' },
    statIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
    statTitle: { color: '#64748B', fontSize: 12, fontWeight: '700' },
    statValue: { color: '#111827', fontSize: 23, fontWeight: '900', marginTop: 5 },
    statSubtitle: { color: '#94A3B8', fontSize: 11, marginTop: 6 },
    panel: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 17, borderWidth: 1, borderColor: '#ECECF2', marginBottom: 16 },
    sectionTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    sectionTitle: { color: '#111827', fontSize: 18, fontWeight: '900' },
    sectionTrailing: { color: '#7C3AED', fontSize: 12, fontWeight: '800' },
    panelSubtitle: { color: '#94A3B8', fontSize: 12, marginTop: 5, marginBottom: 18 },
    chart: { height: 190, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 5 },
    barColumn: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%' },
    barValue: { color: '#94A3B8', fontSize: 9, marginBottom: 6 },
    barTrack: { width: '70%', height: 132, justifyContent: 'flex-end', backgroundColor: '#F3F0FA', borderRadius: 8, overflow: 'hidden' },
    bar: { width: '100%', backgroundColor: '#8B5CF6', borderRadius: 8 },
    barLabel: { color: '#64748B', fontSize: 10, marginTop: 8, maxWidth: 42 },
    chartFooter: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 15 },
    legendDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#8B5CF6' },
    legendText: { color: '#94A3B8', fontSize: 11 },
    statusRow: { marginBottom: 14 },
    statusLabelRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 7 },
    statusDot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
    statusName: { flex: 1, color: '#475569', fontSize: 13, fontWeight: '600' },
    statusCount: { color: '#111827', fontSize: 13, fontWeight: '900' },
    statusTrack: { height: 7, backgroundColor: '#F1F5F9', borderRadius: 10, overflow: 'hidden' },
    statusFill: { height: '100%', borderRadius: 10 },
    emptyText: { color: '#94A3B8', fontSize: 13, paddingVertical: 12 },
    itemRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 15 },
    rank: { width: 28, height: 28, borderRadius: 9, backgroundColor: '#F3E8FF', alignItems: 'center', justifyContent: 'center' },
    rankText: { color: '#7C3AED', fontSize: 12, fontWeight: '900' },
    itemMain: { flex: 1 },
    itemTextRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 },
    itemName: { flex: 1, color: '#334155', fontSize: 12, fontWeight: '700' },
    itemQuantity: { color: '#64748B', fontSize: 11, fontWeight: '700' },
    itemTrack: { height: 5, backgroundColor: '#F1F5F9', borderRadius: 10, overflow: 'hidden' },
    itemFill: { height: '100%', backgroundColor: '#A78BFA', borderRadius: 10 },
    itemSales: { color: '#111827', fontSize: 12, fontWeight: '800', minWidth: 48, textAlign: 'right' },
    bottomCards: { flexDirection: 'row', gap: 12, marginBottom: 18 },
    bottomCard: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 18, padding: 15, borderWidth: 1, borderColor: '#ECECF2' },
    bottomIconWrap: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#F8FAFC', alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
    bottomLabel: { color: '#64748B', fontSize: 12, fontWeight: '700' },
    bottomValue: { color: '#111827', fontSize: 25, fontWeight: '900', marginTop: 4 },
    bottomHint: { color: '#94A3B8', fontSize: 10, marginTop: 5 },
    footerNote: {
        color: '#94A3B8',
        fontSize: 11,
        lineHeight: 17,
        textAlign: 'center',
        paddingHorizontal: 12,
        marginTop: 2
    },
});

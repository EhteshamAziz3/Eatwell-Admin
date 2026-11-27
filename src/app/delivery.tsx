import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import type { ReactNode } from 'react';
import { useCallback, useMemo, useState } from 'react';
import {
    ActivityIndicator, Alert, Image, Linking, Modal, Platform, Pressable,
    RefreshControl, SafeAreaView, ScrollView, StatusBar, StyleSheet,
    Text, TextInput, View,
} from 'react-native';
import api from '../services/api';
import { useAuthStore } from '../store/auth';

type Status = 'pending' | 'confirmed' | 'preparing' | 'out_for_delivery' | 'delivered' | 'cancelled';
type Payment = 'pending' | 'paid' | 'failed';
type FoodItem = { foodId?: string; name?: string; image?: string; price?: number; quantity?: number };
type Address = { label?: string; fullAddress?: string; landmark?: string; city?: string; state?: string; pincode?: string };
type Customer = { _id?: string; name?: string; phone?: string; email?: string };
type Order = {
    _id: string; items?: FoodItem[]; user?: Customer | string | null;
    customerName?: string; customerPhone?: string; deliveryAddress?: Address;
    subtotal?: number; deliveryFee?: number; totalAmount?: number;
    paymentMethod?: string; paymentStatus?: Payment | string; paymentId?: string;
    paymentScreenshot?: string; orderStatus?: Status | string;
    estimatedDeliveryMinutes?: number; estimatedDeliveryTime?: string;
    createdAt?: string; updatedAt?: string;
};

const API_ORIGIN = 'https://eat-well-5924.onrender.com';
const FILTERS: { key: 'all' | Status; label: string }[] = [
    { key: 'all', label: 'All' }, { key: 'pending', label: 'New' },
    { key: 'confirmed', label: 'Confirmed' }, { key: 'preparing', label: 'Preparing' },
    { key: 'out_for_delivery', label: 'On the way' }, { key: 'delivered', label: 'Delivered' },
    { key: 'cancelled', label: 'Cancelled' },
];
const NEXT: Partial<Record<Status, Status>> = {
    pending: 'confirmed', confirmed: 'preparing', preparing: 'out_for_delivery',
    out_for_delivery: 'delivered',
};

const money = (n?: number) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const idShort = (id: string) => id.slice(-6).toUpperCase();
const statusLabel = (s?: string) => (s || 'pending').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
const statusColor = (s?: string) => ({
    pending: '#B45309', confirmed: '#2563EB', preparing: '#7C3AED',
    out_for_delivery: '#EA580C', delivered: '#15803D', cancelled: '#DC2626',
} as Record<string, string>)[s || 'pending'] || '#64748B';
const dateLabel = (s?: string) => {
    if (!s) return 'Date unavailable';
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? 'Date unavailable' : d.toLocaleString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
};
const customerOf = (o: Order) => {
    const u = o.user && typeof o.user === 'object' ? o.user : null;
    return { name: o.customerName || u?.name || 'Customer', phone: o.customerPhone || u?.phone || '' };
};
const addressOf = (o: Order) => {
    const a = o.deliveryAddress;
    if (!a) return 'Delivery address not provided';
    return [a.fullAddress, a.landmark ? `Landmark: ${a.landmark}` : '',
    [a.city, a.state, a.pincode].filter(Boolean).join(', ')].filter(Boolean).join('\n');
};
const imageUrl = (s?: string) => !s ? '' : /^https?:\/\//i.test(s) ? s : `${API_ORIGIN}${s.startsWith('/') ? '' : '/'}${s}`;

export default function DeliveryScreen() {
    const token = useAuthStore(state => state.token);
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [busy, setBusy] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState<'all' | Status>('all');
    const [selected, setSelected] = useState<Order | null>(null);
    const [showPaymentImage, setShowPaymentImage] = useState(false);

    const loadOrders = useCallback(async (loader = true) => {
        if (!token) { setLoading(false); return; }
        try {
            if (loader) setLoading(true);
            const res = await api.get('/orders/admin/all', { headers: { Authorization: `Bearer ${token}` } });
            setOrders(Array.isArray(res.data?.orders) ? res.data.orders : []);
        } catch (e: any) {
            console.error('Delivery orders fetch:', e?.response?.data || e);
            Alert.alert('Unable to load orders', e?.response?.data?.message || 'Check the admin orders endpoint and login session.');
        } finally { setLoading(false); setRefreshing(false); }
    }, [token]);

    useFocusEffect(useCallback(() => { loadOrders(); return undefined; }, [loadOrders]));

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return orders.filter(o => {
            const statusOK = filter === 'all' || o.orderStatus === filter;
            const c = customerOf(o);
            const text = [o._id, idShort(o._id), c.name, c.phone, ...(o.items || []).map(i => i.name || '')].join(' ').toLowerCase();
            return statusOK && (!q || text.includes(q));
        });
    }, [orders, filter, search]);

    const stats = useMemo(() => ({
        total: orders.length,
        pending: orders.filter(o => o.orderStatus === 'pending').length,
        active: orders.filter(o => ['confirmed', 'preparing', 'out_for_delivery'].includes(String(o.orderStatus))).length,
        delivered: orders.filter(o => o.orderStatus === 'delivered').length,
        payPending: orders.filter(o => o.paymentStatus === 'pending').length,
    }), [orders]);

    const updateStatus = async (order: Order, next: Status) => {
        if (!token || busy) return;
        const perform = async () => {
            try {
                setBusy(order._id);
                await api.patch(`/orders/admin/${order._id}/status`, { orderStatus: next },
                    { headers: { Authorization: `Bearer ${token}` } });
                setOrders(old => old.map(o => o._id === order._id ? { ...o, orderStatus: next } : o));
                setSelected(old => old?._id === order._id ? { ...old, orderStatus: next } : old);
            } catch (e: any) {
                Alert.alert('Status update failed', e?.response?.data?.message || 'Please try again.');
            } finally { setBusy(null); }
        };
        Alert.alert('Update order?', `Order #${idShort(order._id)} → ${statusLabel(next)}`, [
            { text: 'Cancel', style: 'cancel' }, { text: 'Update', onPress: () => void perform() },
        ]);
    };

    const updatePayment = async (order: Order, paymentStatus: Payment) => {
        if (!token || busy) return;
        Alert.alert('Verify payment?', `Mark order #${idShort(order._id)} as ${paymentStatus}?`, [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Confirm', onPress: () => void (async () => {
                    try {
                        setBusy(order._id);
                        await api.patch(`/orders/admin/${order._id}/payment`,
                            { paymentStatus, paymentId: order.paymentId },
                            { headers: { Authorization: `Bearer ${token}` } });
                        setOrders(old => old.map(o => o._id === order._id ? { ...o, paymentStatus } : o));
                        setSelected(old => old?._id === order._id ? { ...old, paymentStatus } : old);
                    } catch (e: any) {
                        Alert.alert('Payment update failed', e?.response?.data?.message || 'Please try again.');
                    } finally { setBusy(null); }
                })()
            },
        ]);
    };

    const callCustomer = (phone: string) => {
        if (!phone) { Alert.alert('Phone unavailable', 'No customer phone number is saved.'); return; }
        Linking.openURL(`tel:${phone}`).catch(() => Alert.alert('Unable to call', 'Could not open phone app.'));
    };
    const openMap = (order: Order) => {
        const address = addressOf(order).replace(/\n/g, ', ');
        if (address === 'Delivery address not provided') { Alert.alert('Address unavailable', address); return; }
        Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`)
            .catch(() => Alert.alert('Unable to open map', 'Could not open Maps.'));
    };

    const card = (o: Order) => {
        const c = customerOf(o);
        const count = (o.items || []).reduce((n, i) => n + Number(i.quantity || 0), 0);
        const next = NEXT[o.orderStatus as Status];
        return (
            <Pressable key={o._id} onPress={() => setSelected(o)} style={({ pressed }) => [s.card, pressed && s.pressed]}>
                <View style={s.rowBetween}>
                    <View style={{ flex: 1 }}>
                        <Text style={s.orderId}>Order #{idShort(o._id)}</Text>
                        <Text style={s.muted}>{dateLabel(o.createdAt)}</Text>
                    </View>
                    <View style={[s.badge, { backgroundColor: `${statusColor(o.orderStatus)}15` }]}>
                        <View style={[s.dot, { backgroundColor: statusColor(o.orderStatus) }]} />
                        <Text style={[s.badgeText, { color: statusColor(o.orderStatus) }]}>{statusLabel(o.orderStatus)}</Text>
                    </View>
                </View>
                <View style={s.separator} />
                <View style={s.row}>
                    <View style={s.avatar}><Ionicons name="person-outline" size={20} color="#5145CD" /></View>
                    <View style={{ flex: 1 }}>
                        <Text style={s.customerName}>{c.name}</Text>
                        <Text style={s.muted}>{c.phone || 'Phone not provided'}</Text>
                    </View>
                    {!!c.phone && <Pressable style={s.callBtn} onPress={() => callCustomer(c.phone)}>
                        <Ionicons name="call-outline" size={17} color="#5145CD" /><Text style={s.callText}>Call</Text>
                    </Pressable>}
                </View>
                <View style={[s.row, { alignItems: 'flex-start', marginTop: 12 }]}>
                    <Ionicons name="location-outline" size={18} color="#64748B" />
                    <Text style={[s.address, { flex: 1 }]} numberOfLines={2}>{addressOf(o).replace(/\n/g, ', ')}</Text>
                </View>
                <View style={s.itemsBox}>
                    <Text style={s.itemsText} numberOfLines={2}>
                        {(o.items || []).map(i => `${i.name || 'Item'} × ${i.quantity || 1}`).join(' • ') || 'No items'}
                    </Text>
                    <Text style={s.muted}>{count} item{count === 1 ? '' : 's'}</Text>
                </View>
                <View style={[s.rowBetween, { marginTop: 14, flexWrap: 'wrap', gap: 12 }]}>
                    <View>
                        <Text style={s.muted}>Order total</Text>
                        <Text style={s.total}>{money(o.totalAmount)}</Text>
                        <Text style={s.paymentLine}>{(o.paymentMethod || 'UPI').toUpperCase()} · {statusLabel(o.paymentStatus)}</Text>
                    </View>
                    {next ? <Pressable disabled={busy === o._id} style={[s.primaryBtn, busy === o._id && { opacity: .6 }]}
                        onPress={() => updateStatus(o, next)}>
                        {busy === o._id ? <ActivityIndicator color="#fff" /> : <>
                            <Text style={s.primaryText}>{next === 'confirmed' ? 'Accept order' : next === 'preparing' ? 'Start preparing' : 'Dispatch'}</Text>
                            <Ionicons name="arrow-forward" size={16} color="#fff" />
                        </>}
                    </Pressable> : <Text style={s.closed}>{o.orderStatus === 'delivered' ? '✓ Delivered' : 'Order closed'}</Text>}
                </View>
            </Pressable>
        );
    };

    return (
        <SafeAreaView style={s.safe}>
            <StatusBar barStyle="dark-content" />
            <View style={s.page}>
                <View style={s.header}>
                    <View style={{ flex: 1 }}>
                        <Text style={s.eyebrow}>EATWELL · OPERATIONS</Text>
                        <Text style={s.title}>Delivery orders</Text>
                        <Text style={s.subtitle}>Manage incoming orders and delivery progress.</Text>
                    </View>
                    <Pressable style={s.refresh} onPress={() => { setRefreshing(true); loadOrders(false); }}>
                        <Ionicons name="refresh" size={19} color="#334155" /><Text style={s.refreshText}>Refresh</Text>
                    </Pressable>
                </View>

                <View style={s.stats}>
                    <Stat label="All orders" value={stats.total} icon="receipt-outline" color="#5145CD" />
                    <Stat label="New orders" value={stats.pending} icon="notifications-outline" color="#D97706" />
                    <Stat label="In progress" value={stats.active} icon="bicycle-outline" color="#0D9488" />
                    <Stat label="Delivered" value={stats.delivered} icon="checkmark-circle-outline" color="#15803D" />
                </View>

                <View style={s.toolbar}>
                    <View style={s.searchBox}>
                        <Ionicons name="search-outline" size={19} color="#94A3B8" />
                        <TextInput value={search} onChangeText={setSearch} placeholder="Search ID, customer, phone or item"
                            placeholderTextColor="#94A3B8" style={s.searchInput} />
                        {!!search && <Pressable onPress={() => setSearch('')}><Ionicons name="close-circle" size={19} color="#94A3B8" /></Pressable>}
                    </View>
                    <View style={s.pendingPill}><Ionicons name="card-outline" size={17} color="#B45309" />
                        <Text style={s.pendingText}>{stats.payPending} payment pending</Text></View>
                </View>

                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filters}>
                    {FILTERS.map(f => {
                        const active = filter === f.key;
                        const n = f.key === 'all' ? orders.length : orders.filter(o => o.orderStatus === f.key).length;
                        return <Pressable key={f.key} onPress={() => setFilter(f.key)} style={[s.filter, active && s.filterActive]}>
                            <Text style={[s.filterText, active && s.filterTextActive]}>{f.label}</Text>
                            <View style={[s.filterNum, active && s.filterNumActive]}><Text style={[s.filterNumText, active && s.filterNumTextActive]}>{n}</Text></View>
                        </Pressable>;
                    })}
                </ScrollView>

                <View style={s.listHeader}><Text style={s.listTitle}>Order queue</Text><Text style={s.muted}>{filtered.length} result(s)</Text></View>
                {loading ? <View style={s.loading}><ActivityIndicator size="large" color="#5145CD" /><Text style={s.muted}>Loading orders...</Text></View> :
                    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 13, paddingBottom: 24 }}
                        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadOrders(false); }} tintColor="#5145CD" />}>
                        {filtered.length ? filtered.map(card) : <View style={s.empty}>
                            <Ionicons name="file-tray-outline" size={34} color="#94A3B8" />
                            <Text style={s.emptyTitle}>No orders found</Text>
                            <Text style={s.muted}>{search ? 'Try another search.' : 'Orders for this status will appear here.'}</Text>
                            {(search || filter !== 'all') && <Pressable style={s.clearBtn} onPress={() => { setSearch(''); setFilter('all'); }}><Text style={s.clearText}>Clear filters</Text></Pressable>}
                        </View>}
                    </ScrollView>}
            </View>

            <Modal visible={!!selected} transparent animationType="slide" onRequestClose={() => setSelected(null)}>
                <View style={s.backdrop}>
                    <View style={s.sheet}>
                        <View style={s.sheetHeader}>
                            <View><Text style={s.eyebrow}>ORDER DETAILS</Text><Text style={s.sheetTitle}>#{selected ? idShort(selected._id) : ''}</Text></View>
                            <Pressable style={s.close} onPress={() => setSelected(null)}><Ionicons name="close" size={22} color="#475569" /></Pressable>
                        </View>
                        {selected && <ScrollView contentContainerStyle={{ paddingBottom: 25 }} showsVerticalScrollIndicator={false}>
                            <View style={[s.rowBetween, { marginTop: 16 }]}>
                                <Text style={s.sectionTitle}>Order status</Text>
                                <View style={[s.badge, { backgroundColor: `${statusColor(selected.orderStatus)}15` }]}>
                                    <View style={[s.dot, { backgroundColor: statusColor(selected.orderStatus) }]} />
                                    <Text style={[s.badgeText, { color: statusColor(selected.orderStatus) }]}>{statusLabel(selected.orderStatus)}</Text>
                                </View>
                            </View>
                            <Text style={s.muted}>{dateLabel(selected.createdAt)}</Text>

                            <Section title="Customer">
                                <Text style={s.customerName}>{customerOf(selected).name}</Text>
                                <Text style={s.detailText}>{customerOf(selected).phone || 'Phone not provided'}</Text>
                                {!!customerOf(selected).phone && <OutlineButton icon="call-outline" label="Call customer" onPress={() => callCustomer(customerOf(selected).phone)} />}
                            </Section>
                            <Section title="Delivery address">
                                <Text style={s.detailText}>{addressOf(selected)}</Text>
                                <OutlineButton icon="map-outline" label="Open in Maps" onPress={() => openMap(selected)} />
                            </Section>
                            <Section title="Items">
                                {(selected.items || []).map((item, i) => <View key={`${item.foodId || item.name}-${i}`} style={s.itemRow}>
                                    <View style={s.foodThumb}>{item.image ? <Image source={{ uri: imageUrl(item.image) }} style={{ width: '100%', height: '100%' }} /> : <Ionicons name="fast-food-outline" size={20} color="#94A3B8" />}</View>
                                    <View style={{ flex: 1 }}><Text style={s.itemName}>{item.name || 'Food item'}</Text><Text style={s.detailText}>Qty {item.quantity || 1}</Text></View>
                                    <Text style={s.itemPrice}>{money(Number(item.price || 0) * Number(item.quantity || 1))}</Text>
                                </View>)}
                                <View style={s.separator} />
                                <Amount label="Subtotal" value={money(selected.subtotal)} />
                                <Amount label="Delivery fee" value={money(selected.deliveryFee)} />
                                <Amount label="Total" value={money(selected.totalAmount)} bold />
                            </Section>
                            <Section title="Payment">
                                <Text style={s.customerName}>{(selected.paymentMethod || 'UPI').toUpperCase()}</Text>
                                <Text style={s.detailText}>Status: {statusLabel(selected.paymentStatus)}</Text>
                                {!!selected.paymentId && <Text style={s.detailText}>Reference: {selected.paymentId}</Text>}
                                {selected.paymentStatus === 'pending' && <Pressable style={s.verifyBtn} disabled={busy === selected._id} onPress={() => updatePayment(selected, 'paid')}>
                                    {busy === selected._id ? <ActivityIndicator color="#fff" /> : <Text style={s.verifyText}>Mark payment as paid</Text>}
                                </Pressable>}
                                {!!selected.paymentScreenshot && <OutlineButton icon="image-outline" label="View payment screenshot" onPress={() => setShowPaymentImage(true)} />}
                            </Section>
                            <Section title="Update delivery status">
                                <View style={s.statusGrid}>
                                    {FILTERS.filter(f => f.key !== 'all').map(f => {
                                        const current = selected.orderStatus === f.key;
                                        return <Pressable key={f.key} disabled={current || busy === selected._id}
                                            onPress={() => updateStatus(selected, f.key as Status)}
                                            style={[s.statusOption, current && { borderColor: statusColor(f.key), backgroundColor: `${statusColor(f.key)}10` }]}>
                                            <Text style={[s.statusOptionText, current && { color: statusColor(f.key) }]}>{current ? '✓ ' : ''}{f.label}</Text>
                                        </Pressable>;
                                    })}
                                </View>
                                <Text style={s.hint}>Status is saved to the order and shown in customer order tracking.</Text>
                            </Section>
                        </ScrollView>}
                    </View>
                </View>
            </Modal>

            <Modal visible={showPaymentImage} transparent animationType="fade" onRequestClose={() => setShowPaymentImage(false)}>
                <View style={s.imageBackdrop}>
                    <Pressable style={s.imageClose} onPress={() => setShowPaymentImage(false)}><Ionicons name="close" size={26} color="#fff" /></Pressable>
                    {selected?.paymentScreenshot ? <Image source={{ uri: imageUrl(selected.paymentScreenshot) }} style={s.paymentImage} resizeMode="contain" /> : <Text style={{ color: '#fff' }}>Image unavailable</Text>}
                </View>
            </Modal>
        </SafeAreaView>
    );
}

function Stat({ label, value, icon, color }: { label: string; value: number; icon: keyof typeof Ionicons.glyphMap; color: string }) {
    return <View style={s.stat}><View style={[s.statIcon, { backgroundColor: `${color}15` }]}><Ionicons name={icon} size={19} color={color} /></View><Text style={s.statValue}>{value}</Text><Text style={s.statLabel}>{label}</Text></View>;
}
function Section({ title, children }: { title: string; children: ReactNode }) {
    return <View style={s.section}><Text style={s.sectionTitle}>{title}</Text>{children}</View>;
}
function OutlineButton({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
    return <Pressable style={s.outlineBtn} onPress={onPress}><Ionicons name={icon} size={17} color="#5145CD" /><Text style={s.outlineText}>{label}</Text></Pressable>;
}
function Amount({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
    return <View style={s.amount}><Text style={[s.amountLabel, bold && s.amountBold]}>{label}</Text><Text style={[s.amountValue, bold && s.amountBold]}>{value}</Text></View>;
}

const s = StyleSheet.create({
    safe: { flex: 1, backgroundColor: '#F5F6FA' },
    page: { flex: 1, paddingTop: Platform.OS === 'android' ? 18 : 14, paddingHorizontal: 22, paddingBottom: 10 },
    header: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 20 },
    eyebrow: { fontSize: 11, letterSpacing: 1.6, fontWeight: '900', color: '#6B5DD3', marginBottom: 6 },
    title: { fontSize: 29, lineHeight: 36, fontWeight: '900', color: '#172033' },
    subtitle: { fontSize: 14, color: '#64748B', marginTop: 5 },
    refresh: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 13, paddingHorizontal: 13, paddingVertical: 11 },
    refreshText: { fontSize: 13, fontWeight: '800', color: '#334155' },
    stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
    stat: { flex: 1, minWidth: 115, backgroundColor: '#fff', borderRadius: 17, padding: 14, borderWidth: 1, borderColor: '#E9EAF0' },
    statIcon: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
    statValue: { fontSize: 25, fontWeight: '900', color: '#172033' },
    statLabel: { fontSize: 12, color: '#64748B', fontWeight: '700', marginTop: 3 },
    toolbar: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 13 },
    searchBox: { flex: 1, minWidth: 230, height: 49, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 13, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 13 },
    searchInput: { flex: 1, fontSize: 14, color: '#172033', paddingVertical: 0, outlineStyle: 'none' as any },
    pendingPill: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12, paddingVertical: 12, backgroundColor: '#FFF7ED', borderColor: '#FED7AA', borderWidth: 1, borderRadius: 12 },
    pendingText: { fontSize: 12, fontWeight: '800', color: '#9A3412' },
    filters: { gap: 8, paddingBottom: 13 },
    filter: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 11, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E2E8F0' },
    filterActive: { backgroundColor: '#5145CD', borderColor: '#5145CD' },
    filterText: { fontSize: 12, fontWeight: '800', color: '#475569' },
    filterTextActive: { color: '#fff' },
    filterNum: { minWidth: 21, height: 21, borderRadius: 7, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F1F5F9' },
    filterNumActive: { backgroundColor: '#FFFFFF25' },
    filterNumText: { fontSize: 10, fontWeight: '900', color: '#475569' },
    filterNumTextActive: { color: '#fff' },
    listHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
    listTitle: { fontSize: 19, fontWeight: '900', color: '#172033' },
    muted: { fontSize: 12, color: '#64748B', marginTop: 4 },
    card: { backgroundColor: '#fff', borderRadius: 18, padding: 16, borderWidth: 1, borderColor: '#E7E9F0', shadowColor: '#101828', shadowOpacity: .035, shadowRadius: 9, shadowOffset: { width: 0, height: 3 }, elevation: 1 },
    pressed: { opacity: .88 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
    orderId: { fontSize: 16, fontWeight: '900', color: '#172033' },
    badge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 9, paddingVertical: 7, borderRadius: 9 },
    dot: { width: 7, height: 7, borderRadius: 4 },
    badgeText: { fontSize: 11, fontWeight: '900' },
    separator: { height: 1, backgroundColor: '#F1F5F9', marginVertical: 13 },
    avatar: { width: 40, height: 40, borderRadius: 13, backgroundColor: '#F0EEFF', alignItems: 'center', justifyContent: 'center' },
    customerName: { fontSize: 14, fontWeight: '900', color: '#172033' },
    callBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 9, borderWidth: 1, borderColor: '#D8D4FE', backgroundColor: '#F7F6FF' },
    callText: { fontSize: 12, fontWeight: '900', color: '#5145CD' },
    address: { fontSize: 12, lineHeight: 18, color: '#475569' },
    itemsBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 12, padding: 11, borderRadius: 11, backgroundColor: '#F8FAFC' },
    itemsText: { flex: 1, fontSize: 12, lineHeight: 18, color: '#334155', fontWeight: '700' },
    total: { fontSize: 22, fontWeight: '900', color: '#172033', marginTop: 2 },
    paymentLine: { fontSize: 10, color: '#64748B', marginTop: 4 },
    primaryBtn: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 14, borderRadius: 11, backgroundColor: '#5145CD' },
    primaryText: { fontSize: 12, fontWeight: '900', color: '#fff' },
    closed: { fontSize: 12, fontWeight: '900', color: '#64748B' },
    loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
    empty: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', borderRadius: 18, padding: 40, borderWidth: 1, borderColor: '#E7E9F0' },
    emptyTitle: { fontSize: 18, fontWeight: '900', color: '#172033', marginTop: 12, marginBottom: 5 },
    clearBtn: { marginTop: 15, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, backgroundColor: '#F0EEFF' },
    clearText: { fontSize: 12, fontWeight: '900', color: '#5145CD' },
    backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,23,42,.48)' },
    sheet: { maxHeight: '94%', backgroundColor: '#fff', borderTopLeftRadius: 25, borderTopRightRadius: 25, paddingTop: 20, paddingHorizontal: 21, paddingBottom: Platform.OS === 'ios' ? 28 : 18 },
    sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 15, borderBottomWidth: 1, borderBottomColor: '#EEF2F7' },
    sheetTitle: { fontSize: 24, fontWeight: '900', color: '#172033', marginTop: 3 },
    close: { width: 40, height: 40, borderRadius: 13, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
    section: { paddingTop: 18, paddingBottom: 17, borderBottomWidth: 1, borderBottomColor: '#EEF2F7' },
    sectionTitle: { fontSize: 14, fontWeight: '900', color: '#172033', marginBottom: 9 },
    detailText: { fontSize: 13, lineHeight: 20, color: '#475569', marginTop: 4 },
    outlineBtn: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 10, paddingHorizontal: 11, paddingVertical: 9, borderRadius: 9, borderWidth: 1, borderColor: '#D8D4FE', backgroundColor: '#F7F6FF' },
    outlineText: { fontSize: 12, fontWeight: '900', color: '#5145CD' },
    itemRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 11 },
    foodThumb: { width: 40, height: 40, borderRadius: 10, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    itemName: { fontSize: 13, fontWeight: '900', color: '#172033' },
    itemPrice: { fontSize: 13, fontWeight: '900', color: '#172033' },
    amount: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
    amountLabel: { fontSize: 12, color: '#64748B' },
    amountValue: { fontSize: 12, fontWeight: '700', color: '#334155' },
    amountBold: { fontSize: 15, fontWeight: '900', color: '#172033' },
    verifyBtn: { alignSelf: 'flex-start', marginTop: 10, paddingHorizontal: 13, paddingVertical: 10, borderRadius: 10, backgroundColor: '#15803D' },
    verifyText: { color: '#fff', fontSize: 12, fontWeight: '900' },
    statusGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    statusOption: { paddingHorizontal: 10, paddingVertical: 9, borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 9 },
    statusOptionText: { fontSize: 11, fontWeight: '900', color: '#475569' },
    hint: { fontSize: 11, lineHeight: 17, color: '#94A3B8', marginTop: 10 },
    imageBackdrop: { flex: 1, backgroundColor: 'rgba(2,6,23,.95)', alignItems: 'center', justifyContent: 'center', padding: 20 },
    imageClose: { position: 'absolute', top: Platform.OS === 'android' ? 42 : 55, right: 20, zIndex: 2, width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFFFFF25', alignItems: 'center', justifyContent: 'center' },
    paymentImage: { width: '100%', height: '80%' },
});

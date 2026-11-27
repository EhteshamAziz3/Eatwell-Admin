import { File } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { fetch as expoFetch } from 'expo/fetch';
import { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Image,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    View,
} from 'react-native';

import api from '../services/api';
import { useAuthStore } from '../store/auth';

// Relative backend image paths ko full URL mein convert karta hai.
// Absolute URLs (including Cloudinary) unchanged return hoti hain.
const getFoodImageUri = (
    image?: string | null
): string | undefined => {
    if (typeof image !== 'string' || !image.trim()) {
        return undefined;
    }

    const imagePath = image.trim();

    // Invalid old database value ko URL mat banana.
    if (imagePath === '[object Object]') {
        return undefined;
    }

    // Absolute URLs (including Cloudinary) unchanged.
    if (/^(https?:\/\/|data:|blob:)/i.test(imagePath)) {
        return imagePath;
    }

    const baseURL =
        api.defaults.baseURL ||
        'https://eat-well-5924.onrender.com/api';

    const serverOrigin = baseURL
        .replace(/\/api\/?$/i, '')
        .replace(/\/+$/, '');

    return `${serverOrigin}${imagePath.startsWith('/') ? imagePath : `/${imagePath}`}`;
};

interface Category {
    _id: string;
    name: string;
    image?: string;
    isActive: boolean;
    foodCount?: number;
}

interface Food {
    id: string;
    name: string;
    description: string;
    price: number;
    category: string;
    image: string;
    rating: number;
    isPopular: boolean;
    isAvailable: boolean;
}

interface FoodForm {
    name: string;
    description: string;
    price: string;
    category: string;
    image: string;
    rating: string;
    isPopular: boolean;
}

const EMPTY_FORM: FoodForm = {
    name: '',
    description: '',
    price: '',
    category: '',
    image: '',
    rating: '0',
    isPopular: false,
};

export default function MenuScreen() {
    const token = useAuthStore((state) => state.token);

    const [foods, setFoods] = useState<Food[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [categoriesLoading, setCategoriesLoading] = useState(false);
    const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [modalVisible, setModalVisible] = useState(false);
    const [editingFood, setEditingFood] = useState<Food | null>(null);
    const [form, setForm] = useState<FoodForm>(EMPTY_FORM);
    const [selectedImage, setSelectedImage] =
        useState<ImagePicker.ImagePickerAsset | null>(null);
    const [search, setSearch] = useState('');



    const authHeaders = {
        Authorization: `Bearer ${token}`,
    };

    const loadFoods = useCallback(async () => {
        if (!token) {
            setLoading(false);
            return;
        }

        try {
            setLoading(true);

            const response = await api.get('/foods/admin/all', {
                headers: authHeaders,
            });

            const result = response.data;
            const list = Array.isArray(result)
                ? result
                : result.foods ?? result.data ?? [];

            setFoods(list);
        } catch (error: any) {
            console.error(
                'Food loading error:',
                error?.response?.data || error
            );

            Alert.alert(
                'Error',
                error?.response?.data?.message ||
                'Food menu load nahi ho saka.'
            );
        } finally {
            setLoading(false);
        }
    }, [token]);

    useEffect(() => {
        loadFoods();
    }, [loadFoods]);

    const loadCategories = useCallback(async () => {
        if (!token) {
            setCategories([]);
            return;
        }

        try {
            setCategoriesLoading(true);

            const response = await api.get('/categories/admin/all', {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });

            const result = response.data;

            const categoryList: Category[] = Array.isArray(result)
                ? result
                : Array.isArray(result?.categories)
                    ? result.categories
                    : Array.isArray(result?.data?.categories)
                        ? result.data.categories
                        : Array.isArray(result?.data)
                            ? result.data
                            : Array.isArray(result?.result?.categories)
                                ? result.result.categories
                                : [];

            setCategories(categoryList);

            console.log('Menu categories:', categoryList);
        } catch (error: any) {
            console.error(
                'Menu categories fetch error:',
                error?.response?.data || error
            );

            setCategories([]);

            Alert.alert(
                'Categories error',
                error?.response?.data?.message ||
                'Categories load nahi ho paayi.'
            );
        } finally {
            setCategoriesLoading(false);
        }
    }, [token]);

    const updateForm = (
        key: keyof FoodForm,
        value: string | boolean
    ) => {
        setForm((previous) => ({
            ...previous,
            [key]: value,
        }));
    };

    const openAddModal = () => {
        setEditingFood(null);
        setForm(EMPTY_FORM);
        setSelectedImage(null);
        setCategoryDropdownOpen(false);
        setModalVisible(true);

        loadCategories();
    };

    const openEditModal = (food: Food) => {
        setEditingFood(food);

        setForm({
            name: food.name,
            description: food.description,
            price: String(food.price),
            category: food.category,
            image: food.image || '',
            rating: String(food.rating ?? 0),
            isPopular: Boolean(food.isPopular),
        });

        setSelectedImage(null);
        setCategoryDropdownOpen(false);
        setModalVisible(true);

        loadCategories();
    };

    const chooseImage = async () => {
        try {
            const permission =
                await ImagePicker.requestMediaLibraryPermissionsAsync();

            if (!permission.granted) {
                Alert.alert(
                    'Gallery permission',
                    'Food photo select karne ke liye gallery permission allow karo.'
                );
                return;
            }

            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsEditing: true,
                aspect: [1, 1],
                quality: 0.8,
            });

            if (result.canceled || !result.assets?.length) {
                return;
            }

            const asset = result.assets[0];
            const allowedTypes = [
                'image/jpeg',
                'image/png',
                'image/webp',
            ];

            if (
                asset.mimeType &&
                !allowedTypes.includes(asset.mimeType)
            ) {
                Alert.alert(
                    'Unsupported image',
                    'Please JPG, PNG ya WEBP photo select karo.'
                );
                return;
            }

            setSelectedImage(asset);
        } catch (error) {
            console.error('Image picker error:', error);
            Alert.alert('Error', 'Gallery open nahi ho saki.');
        }
    };

    const removeFoodImage = () => {
        setSelectedImage(null);
        setForm((previous) => ({
            ...previous,
            image: '',
        }));
    };

    const saveFood = async () => {
        const price = Number(form.price);
        const rating = Number(form.rating);

        if (
            !form.name.trim() ||
            !form.description.trim() ||
            !form.category.trim() ||
            !form.price.trim()
        ) {
            Alert.alert(
                'Missing details',
                'Saari required details fill karo.'
            );
            return;
        }

        if (!Number.isFinite(price) || price < 0) {
            Alert.alert('Invalid price', 'Valid food price enter karo.');
            return;
        }

        if (
            !Number.isFinite(rating) ||
            rating < 0 ||
            rating > 5
        ) {
            Alert.alert(
                'Invalid rating',
                'Rating 0 se 5 ke beech honi chahiye.'
            );
            return;
        }

        const formData = new FormData();

        formData.append('name', form.name.trim());
        formData.append('description', form.description.trim());
        formData.append('price', String(price));
        formData.append('category', form.category.trim());
        formData.append('rating', String(rating));
        formData.append('isPopular', String(form.isPopular));
        formData.append(
            'isAvailable',
            String(editingFood?.isAvailable ?? true)
        );

        try {
            setSaving(true);

            if (selectedImage) {
                if (Platform.OS === 'web') {
                    const webAsset =
                        selectedImage as ImagePicker.ImagePickerAsset & {
                            file?: File;
                        };

                    if (webAsset.file) {
                        formData.append(
                            'image',
                            webAsset.file,
                            selectedImage.fileName || 'food-image.jpg'
                        );
                    } else {
                        const imageResponse = await fetch(
                            selectedImage.uri
                        );

                        if (!imageResponse.ok) {
                            throw new Error(
                                'Selected image could not be read.'
                            );
                        }

                        const imageBlob = await imageResponse.blob();

                        formData.append(
                            'image',
                            imageBlob,
                            selectedImage.fileName || 'food-image.jpg'
                        );
                    }
                } else {
                    const mimeType =
                        selectedImage.mimeType || 'image/jpeg';

                    const extension =
                        mimeType === 'image/png'
                            ? 'png'
                            : mimeType === 'image/webp'
                                ? 'webp'
                                : 'jpg';

                    const imageFile = new File(selectedImage.uri);

                    formData.append(
                        'image',
                        imageFile,
                        selectedImage.fileName ||
                        imageFile.name ||
                        `food-image.${extension}`
                    );
                }
            } else {
                // Existing valid image preserve karo.
                const existingImage =
                    typeof form.image === 'string' &&
                        form.image !== '[object Object]'
                        ? form.image.trim()
                        : '';

                if (existingImage) {
                    formData.append('image', existingImage);
                }
            }

            const baseURL = (
                api.defaults.baseURL ||
                'https://eat-well-5924.onrender.com/api'
            ).replace(/\/+$/, '');

            const requestURL = editingFood
                ? `${baseURL}/foods/${editingFood.id}`
                : `${baseURL}/foods`;

            const response = await expoFetch(requestURL, {
                method: editingFood ? 'PUT' : 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                },
                body: formData,
            });

            const responseText = await response.text();

            let responseData: any = {};

            try {
                responseData = responseText
                    ? JSON.parse(responseText)
                    : {};
            } catch {
                responseData = {};
            }

            if (!response.ok) {
                throw new Error(
                    responseData?.message ||
                    responseText ||
                    'Food save nahi ho saka.'
                );
            }

            Alert.alert(
                'Success',
                editingFood
                    ? 'Food successfully updated.'
                    : 'Food successfully added.'
            );

            setModalVisible(false);
            setEditingFood(null);
            setForm(EMPTY_FORM);
            setSelectedImage(null);

            await loadFoods();
        } catch (error: any) {
            console.error(
                'Save food error:',
                error?.message || error
            );

            Alert.alert(
                'Error',
                error?.message || 'Food save nahi ho saka.'
            );
        } finally {
            setSaving(false);
        }
    };

    const deleteFood = (food: Food) => {
        Alert.alert(
            'Delete Food',
            `Are you sure you want to delete "${food.name}"?`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await api.delete(`/foods/${food.id}`, {
                                headers: authHeaders,
                            });

                            setFoods((previous) =>
                                previous.filter(
                                    (item) => item.id !== food.id
                                )
                            );

                            Alert.alert(
                                'Deleted',
                                'Food successfully deleted.'
                            );
                        } catch (error: any) {
                            console.error(
                                'Delete food error:',
                                error?.response?.data || error
                            );

                            Alert.alert(
                                'Error',
                                error?.response?.data?.message ||
                                'Food delete nahi hua.'
                            );
                        }
                    },
                },
            ]
        );
    };

    const toggleAvailability = async (food: Food) => {
        try {
            await api.patch(
                `/foods/${food.id}/availability`,
                { isAvailable: !food.isAvailable },
                { headers: authHeaders }
            );

            setFoods((previous) =>
                previous.map((item) =>
                    item.id === food.id
                        ? {
                            ...item,
                            isAvailable: !item.isAvailable,
                        }
                        : item
                )
            );
        } catch (error: any) {
            console.error(
                'Availability error:',
                error?.response?.data || error
            );

            Alert.alert(
                'Error',
                error?.response?.data?.message ||
                'Availability update nahi ho saki.'
            );
        }
    };

    const filteredFoods = foods.filter((food) => {
        const query = search.toLowerCase();

        return (
            food.name.toLowerCase().includes(query) ||
            food.category.toLowerCase().includes(query)
        );
    });

    const renderFood = ({
        item,
    }: {
        item: Food;
    }) => (
        <View style={styles.foodCard}>
            {getFoodImageUri(item.image) ? (
                <Image
                    source={{ uri: getFoodImageUri(item.image) }}
                    style={styles.foodImage}
                    resizeMode="cover"
                />
            ) : (
                <View
                    style={[
                        styles.foodImage,
                        styles.imagePlaceholder,
                    ]}
                >
                    <Text style={styles.placeholderText}>
                        No Image
                    </Text>
                </View>
            )}

            <View style={styles.foodDetails}>
                <View style={styles.foodTitleRow}>
                    <Text
                        style={styles.foodName}
                        numberOfLines={1}
                    >
                        {item.name}
                    </Text>

                    {item.isPopular && (
                        <View style={styles.popularBadge}>
                            <Text style={styles.popularText}>
                                POPULAR
                            </Text>
                        </View>
                    )}
                </View>

                <Text style={styles.categoryText}>
                    {item.category}
                </Text>

                <Text
                    style={styles.foodDescription}
                    numberOfLines={2}
                >
                    {item.description}
                </Text>

                <Text style={styles.price}>
                    ₹{item.price}
                </Text>

                <View style={styles.availabilityRow}>
                    <Text style={styles.availabilityText}>
                        {item.isAvailable
                            ? 'Available'
                            : 'Unavailable'}
                    </Text>

                    <Switch
                        value={item.isAvailable}
                        onValueChange={() =>
                            toggleAvailability(item)
                        }
                        trackColor={{
                            false: '#D1D5DB',
                            true: '#86EFAC',
                        }}
                        thumbColor={
                            item.isAvailable
                                ? '#16A34A'
                                : '#F3F4F6'
                        }
                    />
                </View>

                <View style={styles.actionRow}>
                    <Pressable
                        style={styles.editButton}
                        onPress={() => openEditModal(item)}
                    >
                        <Text style={styles.editButtonText}>
                            Edit
                        </Text>
                    </Pressable>

                    <Pressable
                        style={styles.deleteButton}
                        onPress={() => deleteFood(item)}
                    >
                        <Text style={styles.deleteButtonText}>
                            Delete
                        </Text>
                    </Pressable>
                </View>
            </View>
        </View>
    );

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Pressable
                    onPress={() => router.back()}
                    style={styles.backButton}
                >
                    <Text style={styles.backText}>‹</Text>
                </Pressable>

                <View style={styles.headerTextContainer}>
                    <Text style={styles.headerTitle}>
                        Food Menu
                    </Text>
                    <Text style={styles.headerSubtitle}>
                        Manage your restaurant menu
                    </Text>
                </View>

                <Pressable
                    style={styles.addButton}
                    onPress={openAddModal}
                >
                    <Text style={styles.addButtonText}>
                        + Add
                    </Text>
                </Pressable>
            </View>

            <View style={styles.summaryCard}>
                <View>
                    <Text style={styles.summaryLabel}>
                        Total Food Items
                    </Text>
                    <Text style={styles.summaryNumber}>
                        {foods.length}
                    </Text>
                </View>

                <View>
                    <Text style={styles.summaryLabel}>
                        Available
                    </Text>
                    <Text style={styles.summaryNumber}>
                        {
                            foods.filter(
                                (food) => food.isAvailable
                            ).length
                        }
                    </Text>
                </View>

                <View>
                    <Text style={styles.summaryLabel}>
                        Unavailable
                    </Text>
                    <Text style={styles.summaryNumber}>
                        {
                            foods.filter(
                                (food) => !food.isAvailable
                            ).length
                        }
                    </Text>
                </View>
            </View>

            <TextInput
                style={styles.searchInput}
                placeholder="Search food or category..."
                placeholderTextColor="#9CA3AF"
                value={search}
                onChangeText={setSearch}
            />

            {loading ? (
                <View style={styles.loader}>
                    <ActivityIndicator
                        size="large"
                        color="#16A34A"
                    />
                    <Text style={styles.loaderText}>
                        Loading food menu...
                    </Text>
                </View>
            ) : (
                <FlatList
                    data={filteredFoods}
                    keyExtractor={(item) => item.id}
                    renderItem={renderFood}
                    contentContainerStyle={styles.listContent}
                    refreshing={loading}
                    onRefresh={loadFoods}
                    ListEmptyComponent={
                        <View style={styles.emptyContainer}>
                            <Text style={styles.emptyTitle}>
                                No Food Found
                            </Text>
                            <Text style={styles.emptyText}>
                                Add your first food item to get started.
                            </Text>
                        </View>
                    }
                />
            )}

            <Modal
                visible={modalVisible}
                animationType="slide"
                transparent
                onRequestClose={() => {
                    setModalVisible(false);
                    setCategoryDropdownOpen(false);
                }}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContainer}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>
                                {editingFood
                                    ? 'Edit Food'
                                    : 'Add New Food'}
                            </Text>

                            <Pressable
                                onPress={() => {
                                    setModalVisible(false);
                                    setCategoryDropdownOpen(false);
                                }}
                            >
                                <Text style={styles.closeButton}>
                                    ✕
                                </Text>
                            </Pressable>
                        </View>

                        <ScrollView
                            showsVerticalScrollIndicator={false}
                            keyboardShouldPersistTaps="handled"
                        >
                            <Text style={styles.inputLabel}>
                                Food Name *
                            </Text>
                            <TextInput
                                style={styles.input}
                                placeholder="Enter food name"
                                value={form.name}
                                onChangeText={(value) =>
                                    updateForm('name', value)
                                }
                            />

                            <Text style={styles.inputLabel}>
                                Description *
                            </Text>
                            <TextInput
                                style={[
                                    styles.input,
                                    styles.multilineInput,
                                ]}
                                placeholder="Enter food description"
                                value={form.description}
                                onChangeText={(value) =>
                                    updateForm('description', value)
                                }
                                multiline
                            />

                            <Text style={styles.inputLabel}>
                                Price (₹) *
                            </Text>
                            <TextInput
                                style={styles.input}
                                placeholder="Enter price"
                                keyboardType="decimal-pad"
                                value={form.price}
                                onChangeText={(value) =>
                                    updateForm('price', value)
                                }
                            />


                            <Text style={styles.inputLabel}>
                                Category *
                            </Text>

                            <Pressable
                                style={[
                                    styles.input,
                                    {
                                        minHeight: 50,
                                        justifyContent: 'center',
                                        flexDirection: 'row',
                                        alignItems: 'center',
                                    },
                                ]}
                                onPress={() => {
                                    setCategoryDropdownOpen((previous) => !previous);
                                }}
                            >
                                <Text
                                    style={{
                                        flex: 1,
                                        color: form.category ? '#111827' : '#9CA3AF',
                                        fontSize: 14,
                                    }}
                                >
                                    {categoriesLoading
                                        ? 'Loading categories...'
                                        : form.category || 'Select a category'}
                                </Text>

                                <Text style={{ color: '#6B7280', fontSize: 16 }}>
                                    {categoryDropdownOpen ? '▲' : '▼'}
                                </Text>
                            </Pressable>

                            {categoryDropdownOpen && (
                                <View
                                    style={{
                                        borderWidth: 1,
                                        borderColor: '#E5E7EB',
                                        borderRadius: 12,
                                        backgroundColor: '#FFFFFF',
                                        marginTop: 6,
                                        marginBottom: 12,
                                        overflow: 'hidden',
                                    }}
                                >
                                    {categoriesLoading ? (
                                        <View style={{ padding: 18, alignItems: 'center' }}>
                                            <ActivityIndicator color="#16A34A" />
                                            <Text style={{ marginTop: 8, color: '#6B7280' }}>
                                                Loading categories...
                                            </Text>
                                        </View>
                                    ) : categories.length === 0 ? (
                                        <View style={{ padding: 16 }}>
                                            <Text style={{ color: '#6B7280' }}>
                                                No categories found.
                                            </Text>
                                            <Text style={{ color: '#9CA3AF', marginTop: 5 }}>
                                                Pehle Categories section mein category create karo.
                                            </Text>
                                        </View>
                                    ) : (
                                        <ScrollView
                                            nestedScrollEnabled
                                            style={{ maxHeight: 220 }}
                                            keyboardShouldPersistTaps="handled"
                                        >
                                            {categories.map((category) => (
                                                <Pressable
                                                    key={category._id}
                                                    onPress={() => {
                                                        updateForm('category', category.name);
                                                        setCategoryDropdownOpen(false);
                                                    }}
                                                    style={{
                                                        paddingHorizontal: 15,
                                                        paddingVertical: 13,
                                                        borderBottomWidth: 1,
                                                        borderBottomColor: '#F3F4F6',
                                                        backgroundColor:
                                                            form.category === category.name
                                                                ? '#F0FDF4'
                                                                : '#FFFFFF',
                                                    }}
                                                >
                                                    <Text
                                                        style={{
                                                            color: '#111827',
                                                            fontSize: 14,
                                                            fontWeight:
                                                                form.category === category.name
                                                                    ? '700'
                                                                    : '500',
                                                        }}
                                                    >
                                                        {category.name}
                                                        {!category.isActive ? ' (Inactive)' : ''}
                                                    </Text>
                                                </Pressable>
                                            ))}
                                        </ScrollView>
                                    )}
                                </View>
                            )}


                            <Text style={styles.inputLabel}>
                                Food Photo
                            </Text>

                            {selectedImage ? (
                                <Image
                                    source={{
                                        uri: selectedImage.uri,
                                    }}
                                    style={styles.imagePreview}
                                    resizeMode="cover"
                                />
                            ) : getFoodImageUri(form.image) ? (
                                <Image
                                    source={{
                                        uri: getFoodImageUri(form.image),
                                    }}
                                    style={styles.imagePreview}
                                    resizeMode="cover"
                                />
                            ) : (
                                <View
                                    style={[
                                        styles.imagePreview,
                                        styles.imagePlaceholder,
                                    ]}
                                >
                                    <Text style={styles.placeholderText}>
                                        No Image
                                    </Text>
                                </View>
                            )}

                            <View style={styles.imageActions}>
                                <Pressable
                                    style={styles.chooseImageButton}
                                    onPress={chooseImage}
                                >
                                    <Text
                                        style={styles.chooseImageButtonText}
                                    >
                                        {selectedImage || form.image
                                            ? 'Change Photo'
                                            : 'Choose Photo'}
                                    </Text>
                                </Pressable>

                                {(selectedImage || form.image) && (
                                    <Pressable
                                        style={styles.removeImageButton}
                                        onPress={removeFoodImage}
                                    >
                                        <Text
                                            style={styles.removeImageButtonText}
                                        >
                                            Remove
                                        </Text>
                                    </Pressable>
                                )}
                            </View>

                            <Text style={styles.inputLabel}>
                                Rating (0–5)
                            </Text>
                            <TextInput
                                style={styles.input}
                                placeholder="0"
                                keyboardType="decimal-pad"
                                value={form.rating}
                                onChangeText={(value) =>
                                    updateForm('rating', value)
                                }
                            />

                            <View style={styles.popularRow}>
                                <View>
                                    <Text style={styles.popularLabel}>
                                        Popular Food
                                    </Text>
                                    <Text
                                        style={styles.popularDescription}
                                    >
                                        Show this item as popular
                                    </Text>
                                </View>

                                <Switch
                                    value={form.isPopular}
                                    onValueChange={(value) =>
                                        updateForm('isPopular', value)
                                    }
                                    trackColor={{
                                        false: '#D1D5DB',
                                        true: '#86EFAC',
                                    }}
                                    thumbColor={
                                        form.isPopular
                                            ? '#16A34A'
                                            : '#F3F4F6'
                                    }
                                />
                            </View>

                            <Pressable
                                style={[
                                    styles.saveButton,
                                    saving && styles.disabledButton,
                                ]}
                                onPress={saveFood}
                                disabled={saving}
                            >
                                {saving ? (
                                    <ActivityIndicator
                                        color="#FFFFFF"
                                    />
                                ) : (
                                    <Text style={styles.saveButtonText}>
                                        {editingFood
                                            ? 'Update Food'
                                            : 'Add Food'}
                                    </Text>
                                )}
                            </Pressable>

                            <View style={{ height: 20 }} />
                        </ScrollView>
                    </View>
                </View>
            </Modal>
        </View>
    );
}
const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F8FAFC',
        paddingTop: 52,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 18,
        paddingBottom: 18,
    },
    backButton: {
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: '#FFFFFF',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    backText: {
        fontSize: 32,
        color: '#111827',
        lineHeight: 36,
    },
    headerTextContainer: {
        flex: 1,
    },
    headerTitle: {
        fontSize: 23,
        fontWeight: '800',
        color: '#111827',
    },
    headerSubtitle: {
        fontSize: 12,
        color: '#6B7280',
        marginTop: 3,
    },
    addButton: {
        backgroundColor: '#16A34A',
        paddingHorizontal: 17,
        paddingVertical: 11,
        borderRadius: 12,
    },
    addButtonText: {
        color: '#FFFFFF',
        fontWeight: '700',
    },
    summaryCard: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        backgroundColor: '#FFFFFF',
        marginHorizontal: 18,
        padding: 17,
        borderRadius: 16,
        marginBottom: 16,
        elevation: 2,
    },
    summaryLabel: {
        fontSize: 11,
        color: '#6B7280',
    },
    summaryNumber: {
        fontSize: 23,
        fontWeight: '800',
        color: '#111827',
        marginTop: 5,
    },
    searchInput: {
        backgroundColor: '#FFFFFF',
        marginHorizontal: 18,
        marginBottom: 14,
        paddingHorizontal: 16,
        height: 48,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#E5E7EB',
        color: '#111827',
    },
    listContent: {
        paddingHorizontal: 18,
        paddingBottom: 35,
    },
    foodCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 12,
        marginBottom: 13,
        flexDirection: 'row',
        elevation: 2,
    },
    foodImage: {
        width: 105,
        height: 125,
        borderRadius: 12,
        backgroundColor: '#E5E7EB',
    },
    imagePlaceholder: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    placeholderText: {
        fontSize: 11,
        color: '#6B7280',
    },
    foodDetails: {
        flex: 1,
        marginLeft: 12,
    },
    foodTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    foodName: {
        fontSize: 15,
        fontWeight: '800',
        color: '#111827',
        flex: 1,
    },
    popularBadge: {
        backgroundColor: '#FEF3C7',
        paddingHorizontal: 6,
        paddingVertical: 4,
        borderRadius: 5,
        marginLeft: 5,
    },
    popularText: {
        fontSize: 8,
        color: '#92400E',
        fontWeight: '800',
    },
    categoryText: {
        fontSize: 11,
        color: '#16A34A',
        fontWeight: '700',
        marginTop: 4,
    },
    foodDescription: {
        fontSize: 11,
        color: '#6B7280',
        marginTop: 5,
    },
    price: {
        fontSize: 17,
        fontWeight: '800',
        color: '#111827',
        marginTop: 6,
    },
    availabilityRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 2,
    },
    availabilityText: {
        fontSize: 11,
        color: '#6B7280',
    },
    actionRow: {
        flexDirection: 'row',
        gap: 8,
        marginTop: 5,
    },
    editButton: {
        flex: 1,
        backgroundColor: '#EFF6FF',
        paddingVertical: 8,
        alignItems: 'center',
        borderRadius: 8,
    },
    editButtonText: {
        color: '#2563EB',
        fontSize: 12,
        fontWeight: '700',
    },
    deleteButton: {
        flex: 1,
        backgroundColor: '#FEF2F2',
        paddingVertical: 8,
        alignItems: 'center',
        borderRadius: 8,
    },
    deleteButtonText: {
        color: '#DC2626',
        fontSize: 12,
        fontWeight: '700',
    },
    loader: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    loaderText: {
        marginTop: 10,
        color: '#6B7280',
    },
    emptyContainer: {
        alignItems: 'center',
        paddingTop: 70,
    },
    emptyTitle: {
        fontSize: 18,
        fontWeight: '800',
        color: '#111827',
    },
    emptyText: {
        fontSize: 13,
        color: '#6B7280',
        marginTop: 7,
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    modalContainer: {
        backgroundColor: '#FFFFFF',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        padding: 20,
        maxHeight: '90%',
    },
    modalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 18,
    },
    modalTitle: {
        fontSize: 21,
        fontWeight: '800',
        color: '#111827',
    },
    closeButton: {
        fontSize: 22,
        color: '#6B7280',
        padding: 5,
    },
    inputLabel: {
        fontSize: 13,
        fontWeight: '700',
        color: '#374151',
        marginBottom: 7,
        marginTop: 12,
    },
    input: {
        borderWidth: 1,
        borderColor: '#E5E7EB',
        borderRadius: 11,
        paddingHorizontal: 13,
        paddingVertical: 12,
        fontSize: 14,
        color: '#111827',
        backgroundColor: '#FFFFFF',
    },
    multilineInput: {
        height: 85,
        textAlignVertical: 'top',
    },
    imagePreview: {
        width: 140,
        height: 140,
        borderRadius: 12,
        backgroundColor: '#E5E7EB',
        marginBottom: 10,
    },
    imageActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    chooseImageButton: {
        backgroundColor: '#E5FBEA',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: 10,
    },
    chooseImageButtonText: {
        color: '#15803D',
        fontWeight: '700',
        fontSize: 13,
    },
    removeImageButton: {
        backgroundColor: '#FEF2F2',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: 10,
    },
    removeImageButtonText: {
        color: '#DC2626',
        fontWeight: '700',
        fontSize: 13,
    },
    popularRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 20,
        paddingVertical: 12,
    },
    popularLabel: {
        fontSize: 14,
        fontWeight: '700',
        color: '#111827',
    },
    popularDescription: {
        fontSize: 11,
        color: '#6B7280',
        marginTop: 3,
    },
    saveButton: {
        backgroundColor: '#16A34A',
        borderRadius: 12,
        paddingVertical: 15,
        alignItems: 'center',
        marginTop: 15,
    },
    disabledButton: {
        opacity: 0.6,
    },
    saveButtonText: {
        color: '#FFFFFF',
        fontSize: 15,
        fontWeight: '800',
    },
});
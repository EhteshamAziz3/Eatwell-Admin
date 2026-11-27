
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';

import {
    ActivityIndicator,
    Alert,
    Image,
    Modal,
    Platform,
    Pressable,
    RefreshControl,
    ScrollView,
    StatusBar,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    View,
} from 'react-native';

import api from '../services/api';
import { useAuthStore } from '../store/auth';

// ==========================================
// TYPES
// ==========================================

interface Category {
  _id: string;
  name: string;
  image: string;
  isActive: boolean;
  foodCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

interface CategoryForm {
  name: string;
  image: string;
  isActive: boolean;
}

type CategoryFilter = 'all' | 'active' | 'inactive';

const EMPTY_FORM: CategoryForm = {
  name: '',
  image: '',
  isActive: true,
};

// ==========================================
// COLORS
// ==========================================

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

// ==========================================
// IMAGE URL HELPER
// ==========================================

const getCategoryImageUri = (
  image?: string | null
): string | undefined => {
  if (!image || typeof image !== 'string') {
    return undefined;
  }

  const cleanImage = image.trim();

  if (!cleanImage || cleanImage === '[object Object]') {
    return undefined;
  }

  if (/^(https?:\/\/|data:|blob:)/i.test(cleanImage)) {
    return cleanImage;
  }

  const baseURL =
    api.defaults.baseURL ||
    'https://eat-well-5924.onrender.com/api';

  const origin = baseURL
    .replace(/\/api\/?$/i, '')
    .replace(/\/+$/, '');

  return `${origin}${
    cleanImage.startsWith('/')
      ? cleanImage
      : `/${cleanImage}`
  }`;
};

// ==========================================
// SCREEN
// ==========================================

export default function CategoriesScreen() {
  const router = useRouter();
  const token = useAuthStore((state) => state.token);

  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [modalVisible, setModalVisible] = useState(false);
  const [editingCategory, setEditingCategory] =
    useState<Category | null>(null);

  const [form, setForm] = useState<CategoryForm>(EMPTY_FORM);

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<CategoryFilter>('all');

  const [errorMessage, setErrorMessage] = useState('');
  const [busyCategoryId, setBusyCategoryId] = useState<string | null>(
    null
  );

  const [deleteCategory, setDeleteCategory] =
    useState<Category | null>(null);

  // ==========================================
  // AUTH HEADERS
  // ==========================================

  const authHeaders = {
    Authorization: `Bearer ${token}`,
  };

  // ==========================================
  // LOAD CATEGORIES
  // ==========================================

  const loadCategories = useCallback(
    async (isRefresh = false) => {
      if (!token) {
        setLoading(false);
        router.replace('/login');
        return;
      }

      try {
        if (isRefresh) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        setErrorMessage('');

        const response = await api.get(
          '/categories/admin/all',
          {
            headers: authHeaders,
          }
        );

        const result = response.data;

const list: Category[] = Array.isArray(result)
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

console.log('Categories fetched:', list);

setCategories(list);
      } catch (error: any) {
        console.error(
          'Categories loading error:',
          error?.response?.data || error
        );

        const message =
          error?.response?.data?.message ||
          'Categories load nahi ho paayi.';

        setErrorMessage(message);

        if (!isRefresh) {
          Alert.alert('Error', message);
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token]
  );

  // Refresh whenever screen comes into focus
  useFocusEffect(
    useCallback(() => {
      loadCategories();
    }, [loadCategories])
  );

  // ==========================================
  // FORM HELPERS
  // ==========================================

  const updateForm = (
    key: keyof CategoryForm,
    value: string | boolean
  ) => {
    setForm((previous) => ({
      ...previous,
      [key]: value,
    }));
  };

  const openAddModal = () => {
    setEditingCategory(null);
    setForm(EMPTY_FORM);
    setModalVisible(true);
  };

  const openEditModal = (category: Category) => {
    setEditingCategory(category);

    setForm({
      name: category.name,
      image: category.image || '',
      isActive: category.isActive,
    });

    setModalVisible(true);
  };

  const closeModal = () => {
    if (saving) return;

    setModalVisible(false);
    setEditingCategory(null);
    setForm(EMPTY_FORM);
  };

  // ==========================================
  // ADD / UPDATE CATEGORY
  // ==========================================

  const saveCategory = async () => {
    const cleanName = form.name.trim();
    const cleanImage = form.image.trim();

    if (!cleanName) {
      Alert.alert(
        'Category name required',
        'Please enter a category name.'
      );
      return;
    }

    if (cleanName.length > 50) {
      Alert.alert(
        'Name too long',
        'Category name maximum 50 characters ka hona chahiye.'
      );
      return;
    }

    if (!token) {
      Alert.alert('Session expired', 'Please login again.');
      router.replace('/login');
      return;
    }

    try {
      setSaving(true);

      const payload = {
        name: cleanName,
        image: cleanImage,
        isActive: form.isActive,
      };

      if (editingCategory) {
        await api.put(
          `/categories/${editingCategory._id}`,
          payload,
          {
            headers: authHeaders,
          }
        );

        Alert.alert(
          'Success',
          'Category updated successfully.'
        );
      } else {
        await api.post(
          '/categories',
          payload,
          {
            headers: authHeaders,
          }
        );

        Alert.alert(
          'Success',
          'Category added successfully.'
        );
      }

      setModalVisible(false);
      setEditingCategory(null);
      setForm(EMPTY_FORM);

      await loadCategories();
    } catch (error: any) {
      console.error(
        'Category save error:',
        error?.response?.data || error
      );

      const message =
        error?.response?.data?.message ||
        'Category save nahi ho paayi.';

      Alert.alert('Unable to save', message);
    } finally {
      setSaving(false);
    }
  };

  // ==========================================
  // ACTIVE / INACTIVE TOGGLE
  // ==========================================

  const toggleCategoryStatus = async (
    category: Category,
    nextValue: boolean
  ) => {
    if (!token) {
      router.replace('/login');
      return;
    }

    try {
      setBusyCategoryId(category._id);

      await api.put(
        `/categories/${category._id}`,
        {
          isActive: nextValue,
        },
        {
          headers: authHeaders,
        }
      );

      setCategories((previous) =>
        previous.map((item) =>
          item._id === category._id
            ? {
                ...item,
                isActive: nextValue,
              }
            : item
        )
      );
    } catch (error: any) {
      console.error(
        'Category status update error:',
        error?.response?.data || error
      );

      Alert.alert(
        'Error',
        error?.response?.data?.message ||
          'Category status update nahi ho saka.'
      );
    } finally {
      setBusyCategoryId(null);
    }
  };

  // ==========================================
  // DELETE CATEGORY
  // ==========================================

  const confirmDeleteCategory = async () => {
    if (!deleteCategory) return;

    const category = deleteCategory;

    if (Number(category.foodCount || 0) > 0) {
      Alert.alert(
        'Cannot delete category',
        `${category.foodCount} food item(s) abhi "${category.name}" category mein assigned hain. Pehle un foods ki category change karo.`
      );

      setDeleteCategory(null);
      return;
    }

    try {
      setBusyCategoryId(category._id);

      await api.delete(
        `/categories/${category._id}`,
        {
          headers: authHeaders,
        }
      );

      setCategories((previous) =>
        previous.filter((item) => item._id !== category._id)
      );

      setDeleteCategory(null);

      Alert.alert(
        'Deleted',
        'Category deleted successfully.'
      );
    } catch (error: any) {
      console.error(
        'Category delete error:',
        error?.response?.data || error
      );

      Alert.alert(
        'Unable to delete',
        error?.response?.data?.message ||
          'Category delete nahi ho paayi.'
      );

      setDeleteCategory(null);
    } finally {
      setBusyCategoryId(null);
    }
  };

  // ==========================================
  // FILTERING
  // ==========================================

  const filteredCategories = categories.filter((category) => {
    const query = search.trim().toLowerCase();

    const matchesSearch =
      category.name.toLowerCase().includes(query);

    const matchesFilter =
      filter === 'all' ||
      (filter === 'active' && category.isActive) ||
      (filter === 'inactive' && !category.isActive);

    return matchesSearch && matchesFilter;
  });

  const totalCategories = categories.length;

  const activeCategories = categories.filter(
    (category) => category.isActive
  ).length;

  const inactiveCategories =
    totalCategories - activeCategories;

  const totalFoods = categories.reduce(
    (sum, category) => sum + Number(category.foodCount || 0),
    0
  );

  // ==========================================
  // CATEGORY CARD
  // ==========================================

  const renderCategoryCard = (category: Category) => {
    const imageUri = getCategoryImageUri(category.image);

    const isBusy = busyCategoryId === category._id;

    return (
      <View
        key={category._id}
        style={styles.categoryCard}
      >
        <View style={styles.cardTop}>
          <View style={styles.categoryImageWrapper}>
            {imageUri ? (
              <Image
                source={{ uri: imageUri }}
                style={styles.categoryImage}
                resizeMode="cover"
              />
            ) : (
              <View style={styles.imagePlaceholder}>
                <Text style={styles.placeholderEmoji}>🍽️</Text>
              </View>
            )}
          </View>

          <View style={styles.categoryInfo}>
            <Text
              style={styles.categoryName}
              numberOfLines={2}
            >
              {category.name}
            </Text>

            <Text style={styles.foodCount}>
              {Number(category.foodCount || 0)} food item(s)
            </Text>

            <View
              style={[
                styles.statusBadge,
                category.isActive
                  ? styles.activeBadge
                  : styles.inactiveBadge,
              ]}
            >
              <Text
                style={[
                  styles.statusText,
                  category.isActive
                    ? styles.activeText
                    : styles.inactiveText,
                ]}
              >
                {category.isActive ? 'Active' : 'Inactive'}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.cardDivider} />

        <View style={styles.cardBottom}>
          <View style={styles.statusControl}>
            <Text style={styles.statusControlLabel}>
              {category.isActive ? 'Enabled' : 'Disabled'}
            </Text>

            {isBusy ? (
              <ActivityIndicator
                size="small"
                color={C.orange}
              />
            ) : (
              <Switch
                value={category.isActive}
                onValueChange={(value) =>
                  toggleCategoryStatus(category, value)
                }
                trackColor={{
                  false: '#D9D9D9',
                  true: '#F8DCA7',
                }}
                thumbColor={
                  category.isActive
                    ? C.orange
                    : '#FFFFFF'
                }
                disabled={busyCategoryId !== null}
              />
            )}
          </View>

          <View style={styles.cardActions}>
            <Pressable
              style={styles.editButton}
              onPress={() => openEditModal(category)}
              disabled={busyCategoryId !== null}
            >
              <Text style={styles.editButtonText}>
                Edit
              </Text>
            </Pressable>

            <Pressable
              style={[
                styles.deleteButton,
                Number(category.foodCount || 0) > 0 &&
                  styles.deleteButtonDisabled,
              ]}
              onPress={() => setDeleteCategory(category)}
              disabled={busyCategoryId !== null}
            >
              <Text style={styles.deleteButtonText}>
                Delete
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  };

  // ==========================================
  // LOADING SCREEN
  // ==========================================

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar barStyle="dark-content" />

        <ActivityIndicator
          size="large"
          color={C.orange}
        />

        <Text style={styles.loadingText}>
          Loading categories...
        </Text>
      </View>
    );
  }

  // ==========================================
  // MAIN UI
  // ==========================================

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadCategories(true)}
            tintColor={C.orange}
          />
        }
        contentContainerStyle={styles.scrollContent}
      >
        {/* HEADER */}

        <View style={styles.header}>
          <View>
            <Text style={styles.pageEyebrow}>
              EATWELL ADMIN
            </Text>

            <Text style={styles.pageTitle}>
              Categories
            </Text>

            <Text style={styles.pageSubtitle}>
              Manage your food categories
            </Text>
          </View>

          <Pressable
            style={styles.addButton}
            onPress={openAddModal}
          >
            <Text style={styles.addButtonText}>
              + Add Category
            </Text>
          </Pressable>
        </View>

        {/* ERROR */}

        {!!errorMessage && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>
              {errorMessage}
            </Text>

            <Pressable
              onPress={() => loadCategories()}
            >
              <Text style={styles.retryText}>
                Retry
              </Text>
            </Pressable>
          </View>
        )}

        {/* STATS */}

        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>
              Total Categories
            </Text>

            <Text style={styles.statValue}>
              {totalCategories}
            </Text>

            <Text style={styles.statHint}>
              All categories
            </Text>
          </View>

          <View style={styles.statCard}>
            <Text style={styles.statLabel}>
              Active
            </Text>

            <Text
              style={[
                styles.statValue,
                { color: C.green },
              ]}
            >
              {activeCategories}
            </Text>

            <Text style={styles.statHint}>
              Available to customers
            </Text>
          </View>

          <View style={styles.statCard}>
            <Text style={styles.statLabel}>
              Inactive
            </Text>

            <Text
              style={[
                styles.statValue,
                { color: C.red },
              ]}
            >
              {inactiveCategories}
            </Text>

            <Text style={styles.statHint}>
              Hidden from customers
            </Text>
          </View>

          <View style={styles.statCard}>
            <Text style={styles.statLabel}>
              Food Items
            </Text>

            <Text
              style={[
                styles.statValue,
                { color: C.blue },
              ]}
            >
              {totalFoods}
            </Text>

            <Text style={styles.statHint}>
              Across categories
            </Text>
          </View>
        </View>

        {/* SEARCH */}

        <View style={styles.searchContainer}>
          <Text style={styles.searchIcon}>⌕</Text>

          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search categories..."
            placeholderTextColor={C.muted}
            style={styles.searchInput}
            returnKeyType="search"
          />

          {search.length > 0 && (
            <Pressable
              onPress={() => setSearch('')}
            >
              <Text style={styles.clearSearch}>
                ✕
              </Text>
            </Pressable>
          )}
        </View>

        {/* FILTERS */}

        <View style={styles.filterRow}>
          {(
            [
              ['all', 'All'],
              ['active', 'Active'],
              ['inactive', 'Inactive'],
            ] as [CategoryFilter, string][]
          ).map(([value, label]) => {
            const selected = filter === value;

            return (
              <Pressable
                key={value}
                style={[
                  styles.filterButton,
                  selected && styles.filterButtonActive,
                ]}
                onPress={() => setFilter(value)}
              >
                <Text
                  style={[
                    styles.filterButtonText,
                    selected && styles.filterButtonTextActive,
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}

          <Text style={styles.resultCount}>
            {filteredCategories.length} results
          </Text>
        </View>

        {/* CATEGORY LIST */}

        {filteredCategories.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyEmoji}>
              🗂️
            </Text>

            <Text style={styles.emptyTitle}>
              {search || filter !== 'all'
                ? 'No categories found'
                : 'No categories yet'}
            </Text>

            <Text style={styles.emptyDescription}>
              {search || filter !== 'all'
                ? 'Try changing your search or filter.'
                : 'Create your first category to organize your menu.'}
            </Text>

            {!search && filter === 'all' && (
              <Pressable
                style={styles.emptyAddButton}
                onPress={openAddModal}
              >
                <Text style={styles.emptyAddButtonText}>
                  + Create Category
                </Text>
              </Pressable>
            )}
          </View>
        ) : (
          <View style={styles.categoryList}>
            {filteredCategories.map(renderCategoryCard)}
          </View>
        )}

        <Text style={styles.footerText}>
          EatWell Admin • Category Management
        </Text>
      </ScrollView>

      {/* ======================================
          ADD / EDIT MODAL
      ====================================== */}

      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        onRequestClose={closeModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.modalHeader}>
                <View>
                  <Text style={styles.modalEyebrow}>
                    CATEGORY MANAGEMENT
                  </Text>

                  <Text style={styles.modalTitle}>
                    {editingCategory
                      ? 'Edit Category'
                      : 'New Category'}
                  </Text>
                </View>

                <Pressable
                  style={styles.closeButton}
                  onPress={closeModal}
                  disabled={saving}
                >
                  <Text style={styles.closeButtonText}>
                    ✕
                  </Text>
                </Pressable>
              </View>

              {/* CATEGORY NAME */}

              <Text style={styles.inputLabel}>
                Category Name *
              </Text>

              <TextInput
                value={form.name}
                onChangeText={(value) =>
                  updateForm('name', value)
                }
                placeholder="e.g. Burgers, Pizza, Drinks"
                placeholderTextColor={C.muted}
                style={styles.input}
                maxLength={50}
                autoCapitalize="words"
              />

              <Text style={styles.inputHint}>
                Maximum 50 characters
              </Text>

              {/* IMAGE URL */}

              <Text style={styles.inputLabel}>
                Category Image URL
              </Text>

              <TextInput
                value={form.image}
                onChangeText={(value) =>
                  updateForm('image', value)
                }
                placeholder="https://example.com/category.jpg"
                placeholderTextColor={C.muted}
                style={styles.input}
                autoCapitalize="none"
                keyboardType="url"
              />

              <Text style={styles.inputHint}>
                Paste image URL or Cloudinary URL. Image is optional.
              </Text>

              {/* IMAGE PREVIEW */}

              {!!getCategoryImageUri(form.image) && (
                <View style={styles.previewContainer}>
                  <Image
                    source={{
                      uri: getCategoryImageUri(form.image),
                    }}
                    style={styles.previewImage}
                    resizeMode="cover"
                    onError={() => {
                      // Invalid preview URL; save can still be attempted.
                    }}
                  />

                  <Text style={styles.previewLabel}>
                    Image Preview
                  </Text>
                </View>
              )}

              {/* STATUS */}

              <View style={styles.modalStatusRow}>
                <View>
                  <Text style={styles.inputLabel}>
                    Category Status
                  </Text>

                  <Text style={styles.statusDescription}>
                    {form.isActive
                      ? 'Customers can see this category.'
                      : 'This category is hidden from customers.'}
                  </Text>
                </View>

                <Switch
                  value={form.isActive}
                  onValueChange={(value) =>
                    updateForm('isActive', value)
                  }
                  trackColor={{
                    false: '#D9D9D9',
                    true: '#F8DCA7',
                  }}
                  thumbColor={
                    form.isActive
                      ? C.orange
                      : '#FFFFFF'
                  }
                />
              </View>

              {/* ACTIONS */}

              <View style={styles.modalActions}>
                <Pressable
                  style={styles.cancelButton}
                  onPress={closeModal}
                  disabled={saving}
                >
                  <Text style={styles.cancelButtonText}>
                    Cancel
                  </Text>
                </Pressable>

                <Pressable
                  style={[
                    styles.saveButton,
                    saving && styles.saveButtonDisabled,
                  ]}
                  onPress={saveCategory}
                  disabled={saving}
                >
                  {saving ? (
                    <ActivityIndicator
                      color="#FFFFFF"
                      size="small"
                    />
                  ) : (
                    <Text style={styles.saveButtonText}>
                      {editingCategory
                        ? 'Save Changes'
                        : 'Create Category'}
                    </Text>
                  )}
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ======================================
          DELETE CONFIRMATION MODAL
      ====================================== */}

      <Modal
        visible={!!deleteCategory}
        animationType="fade"
        transparent
        onRequestClose={() => setDeleteCategory(null)}
      >
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmCard}>
            <View style={styles.confirmIcon}>
              <Text style={styles.confirmEmoji}>
                🗑️
              </Text>
            </View>

            <Text style={styles.confirmTitle}>
              Delete Category?
            </Text>

            <Text style={styles.confirmDescription}>
              Are you sure you want to delete{' '}
              <Text style={styles.confirmCategoryName}>
                {deleteCategory?.name}
              </Text>
              ?
            </Text>

            {Number(deleteCategory?.foodCount || 0) > 0 && (
              <View style={styles.warningBox}>
                <Text style={styles.warningText}>
                  This category has {deleteCategory?.foodCount}{' '}
                  food item(s). You must reassign them before deleting.
                </Text>
              </View>
            )}

            <View style={styles.confirmActions}>
              <Pressable
                style={styles.cancelButton}
                onPress={() => setDeleteCategory(null)}
                disabled={busyCategoryId !== null}
              >
                <Text style={styles.cancelButtonText}>
                  Cancel
                </Text>
              </Pressable>

              <Pressable
                style={[
                  styles.confirmDeleteButton,
                  Number(deleteCategory?.foodCount || 0) > 0 &&
                    styles.confirmDeleteDisabled,
                ]}
                onPress={confirmDeleteCategory}
                disabled={
                  busyCategoryId !== null ||
                  Number(deleteCategory?.foodCount || 0) > 0
                }
              >
                <Text style={styles.confirmDeleteText}>
                  Delete
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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

  scrollContent: {
    padding: 22,
    paddingBottom: 40,
  },

  loadingContainer: {
    flex: 1,
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },

  loadingText: {
    marginTop: 14,
    fontSize: 14,
    color: C.muted,
  },

  // HEADER

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
    flexWrap: 'wrap',
    gap: 16,
  },

  pageEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2,
    color: C.orange,
    marginBottom: 6,
  },

  pageTitle: {
    fontSize: 30,
    fontWeight: '800',
    color: C.dark,
  },

  pageSubtitle: {
    fontSize: 13,
    color: C.muted,
    marginTop: 5,
  },

  addButton: {
    backgroundColor: C.orange,
    paddingHorizontal: 18,
    paddingVertical: 13,
    borderRadius: 12,
  },

  addButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
  },

  // ERROR

  errorBanner: {
    backgroundColor: C.redLight,
    borderRadius: 12,
    padding: 14,
    marginBottom: 18,
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

  // STATS

  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 22,
  },

  statCard: {
    flexGrow: 1,
    flexBasis: 140,
    backgroundColor: C.white,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: C.border,
  },

  statLabel: {
    fontSize: 12,
    color: C.muted,
    fontWeight: '600',
  },

  statValue: {
    fontSize: 28,
    fontWeight: '800',
    color: C.dark,
    marginTop: 8,
  },

  statHint: {
    fontSize: 11,
    color: C.muted,
    marginTop: 5,
  },

  // SEARCH

  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 14,
    paddingHorizontal: 15,
    height: 50,
    marginBottom: 16,
  },

  searchIcon: {
    fontSize: 25,
    color: C.muted,
    marginRight: 10,
  },

  searchInput: {
    flex: 1,
    fontSize: 14,
    color: C.dark,
    outlineStyle: 'none' as any,
  },

  clearSearch: {
    color: C.muted,
    fontSize: 18,
    paddingLeft: 10,
  },

  // FILTER

  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20,
  },

  filterButton: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 30,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.border,
  },

  filterButtonActive: {
    backgroundColor: C.dark,
    borderColor: C.dark,
  },

  filterButtonText: {
    color: C.muted,
    fontSize: 12,
    fontWeight: '700',
  },

  filterButtonTextActive: {
    color: '#FFFFFF',
  },

  resultCount: {
    marginLeft: 'auto',
    fontSize: 12,
    color: C.muted,
  },

  // CATEGORY LIST

  categoryList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },

  categoryCard: {
    flexGrow: 1,
    flexBasis: 280,
    maxWidth: Platform.OS === 'web' ? 420 : undefined,
    backgroundColor: C.white,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: C.border,
  },

  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },

  categoryImageWrapper: {
    width: 76,
    height: 76,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#F4F1EA',
  },

  categoryImage: {
    width: '100%',
    height: '100%',
  },

  imagePlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  placeholderEmoji: {
    fontSize: 30,
  },

  categoryInfo: {
    flex: 1,
  },

  categoryName: {
    fontSize: 17,
    fontWeight: '800',
    color: C.dark,
  },

  foodCount: {
    fontSize: 12,
    color: C.muted,
    marginTop: 5,
  },

  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 30,
    marginTop: 9,
  },

  activeBadge: {
    backgroundColor: C.greenLight,
  },

  inactiveBadge: {
    backgroundColor: C.redLight,
  },

  statusText: {
    fontSize: 10,
    fontWeight: '800',
  },

  activeText: {
    color: C.green,
  },

  inactiveText: {
    color: C.red,
  },

  cardDivider: {
    height: 1,
    backgroundColor: C.border,
    marginVertical: 15,
  },

  cardBottom: {
    gap: 12,
  },

  statusControl: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  statusControlLabel: {
    fontSize: 12,
    color: C.muted,
    fontWeight: '600',
  },

  cardActions: {
    flexDirection: 'row',
    gap: 10,
  },

  editButton: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: C.orangeLight,
    paddingVertical: 11,
    borderRadius: 10,
  },

  editButtonText: {
    color: '#A56800',
    fontSize: 12,
    fontWeight: '800',
  },

  deleteButton: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: C.redLight,
    paddingVertical: 11,
    borderRadius: 10,
  },

  deleteButtonDisabled: {
    opacity: 0.55,
  },

  deleteButtonText: {
    color: C.red,
    fontSize: 12,
    fontWeight: '800',
  },

  // EMPTY

  emptyContainer: {
    backgroundColor: C.white,
    borderRadius: 18,
    padding: 30,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.border,
  },

  emptyEmoji: {
    fontSize: 42,
    marginBottom: 14,
  },

  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: C.dark,
    textAlign: 'center',
  },

  emptyDescription: {
    fontSize: 13,
    color: C.muted,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 8,
    maxWidth: 300,
  },

  emptyAddButton: {
    marginTop: 20,
    backgroundColor: C.orange,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
  },

  emptyAddButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
  },

  footerText: {
    textAlign: 'center',
    fontSize: 11,
    color: C.muted,
    marginTop: 30,
  },

  // FORM MODAL

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 18,
  },

  modalContainer: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '90%',
    backgroundColor: C.white,
    borderRadius: 22,
    padding: 22,
  },

  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },

  modalEyebrow: {
    color: C.orange,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
  },

  modalTitle: {
    color: C.dark,
    fontSize: 23,
    fontWeight: '800',
    marginTop: 6,
  },

  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },

  closeButtonText: {
    fontSize: 17,
    color: C.muted,
  },

  inputLabel: {
    fontSize: 13,
    color: C.dark,
    fontWeight: '800',
    marginBottom: 9,
  },

  input: {
    height: 48,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 14,
    color: C.dark,
    marginBottom: 6,
    backgroundColor: '#FCFBF9',
    outlineStyle: 'none' as any,
  },

  inputHint: {
    fontSize: 11,
    color: C.muted,
    marginBottom: 20,
    lineHeight: 16,
  },

  previewContainer: {
    marginBottom: 20,
    alignItems: 'flex-start',
  },

  previewImage: {
    width: 100,
    height: 100,
    borderRadius: 14,
    backgroundColor: C.bg,
  },

  previewLabel: {
    fontSize: 11,
    color: C.muted,
    marginTop: 7,
  },

  modalStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: C.bg,
    borderRadius: 14,
    padding: 14,
    marginTop: 2,
    marginBottom: 24,
  },

  statusDescription: {
    fontSize: 11,
    color: C.muted,
    marginTop: 5,
    maxWidth: 240,
    lineHeight: 16,
  },

  modalActions: {
    flexDirection: 'row',
    gap: 12,
  },

  cancelButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.bg,
    paddingVertical: 13,
    borderRadius: 12,
  },

  cancelButtonText: {
    color: C.dark,
    fontSize: 13,
    fontWeight: '800',
  },

  saveButton: {
    flex: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.orange,
    paddingVertical: 13,
    borderRadius: 12,
  },

  saveButtonDisabled: {
    opacity: 0.7,
  },

  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },

  // DELETE CONFIRMATION

  confirmOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },

  confirmCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: C.white,
    borderRadius: 22,
    padding: 24,
    alignItems: 'center',
  },

  confirmIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: C.redLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },

  confirmEmoji: {
    fontSize: 26,
  },

  confirmTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: C.dark,
    textAlign: 'center',
  },

  confirmDescription: {
    fontSize: 13,
    color: C.muted,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 10,
  },

  confirmCategoryName: {
    color: C.dark,
    fontWeight: '800',
  },

  warningBox: {
    backgroundColor: C.orangeLight,
    borderRadius: 12,
    padding: 12,
    marginTop: 16,
    width: '100%',
  },

  warningText: {
    color: '#A56800',
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },

  confirmActions: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
    marginTop: 22,
  },

  confirmDeleteButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.red,
    paddingVertical: 13,
    borderRadius: 12,
  },

  confirmDeleteDisabled: {
    opacity: 0.45,
  },

  confirmDeleteText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
});


import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

const TOKEN_KEY = 'eatwell_admin_token';
const USER_KEY = 'eatwell_admin_user';

export interface AdminUser {
  phone: string;
  role: 'admin';
}

interface AuthState {
  token: string | null;
  user: AdminUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  setAuth: (token: string, user: AdminUser) => Promise<void>;
  logout: () => Promise<void>;
  restoreAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,
  isAuthenticated: false,
  isLoading: true,

  setAuth: async (token, user) => {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));

    set({
      token,
      user,
      isAuthenticated: true,
      isLoading: false,
    });
  },

  logout: async () => {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(USER_KEY);

    set({
      token: null,
      user: null,
      isAuthenticated: false,
      isLoading: false,
    });
  },

  restoreAuth: async () => {
    try {
      const token = await SecureStore.getItemAsync(TOKEN_KEY);
      const savedUser = await SecureStore.getItemAsync(USER_KEY);

      if (token && savedUser) {
        const user = JSON.parse(savedUser) as AdminUser;

        if (user.role === 'admin') {
          set({
            token,
            user,
            isAuthenticated: true,
            isLoading: false,
          });
          return;
        }
      }

      await SecureStore.deleteItemAsync(TOKEN_KEY);
      await SecureStore.deleteItemAsync(USER_KEY);
    } catch (error) {
      console.error('Admin session restore failed:', error);
    }

    set({
      token: null,
      user: null,
      isAuthenticated: false,
      isLoading: false,
    });
  },
}));

import { create } from 'zustand'

export const useAuthStore = create(
  (set, get) => ({
    user: null,
    token: null,
    isAuthenticated: false,
    authChecked: false,

    setUser: (user) => set({ user }),
    setToken: (token) => set({ token, isAuthenticated: !!token }),

    login: (user) => set({ user, isAuthenticated: true, authChecked: true }),

    logout: () => set({ user: null, token: null, isAuthenticated: false, authChecked: true }),

    setAuthChecked: (user) => set({
      user: user || null,
      isAuthenticated: !!user,
      authChecked: true,
    }),

    updateUser: (userData) => set((state) => ({ 
      user: { ...state.user, ...userData } 
    })),
  })
)

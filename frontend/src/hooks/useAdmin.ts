import { create } from 'zustand';

interface AdminState {
  isAdminMode: boolean;
  isValidated: boolean;
  adminKey: string | null;
  validateKey: (key: string, expectedKey: string) => boolean;
  enableAdminMode: () => void;
  disableAdminMode: () => void;
  getAdminKey: () => string | null;
}

export const useAdminStore = create<AdminState>()((set, get) => ({
  isAdminMode: false,
  isValidated: false,
  adminKey: null,

  validateKey: (key: string, expectedKey: string): boolean => {
    if (key === expectedKey) {
      set({ isValidated: true, adminKey: key, isAdminMode: true });
      return true;
    }
    return false;
  },

  enableAdminMode: () => {
    if (get().isValidated) {
      set({ isAdminMode: true });
    }
  },

  disableAdminMode: () => {
    set({ isAdminMode: false });
  },

  getAdminKey: (): string | null => {
    return get().adminKey;
  },
}));

export const useAdminActions = () => {
  const store = useAdminStore();
  return {
    validateKey: store.validateKey,
    enableAdminMode: store.enableAdminMode,
    disableAdminMode: store.disableAdminMode,
    getAdminKey: store.getAdminKey,
    isAdminMode: store.isAdminMode,
    isValidated: store.isValidated,
  };
};

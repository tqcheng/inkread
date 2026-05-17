import { create } from 'zustand';

interface AdminState {
  isAdminMode: boolean;
  disableAdminMode: () => void;
}

export const useAdminStore = create<AdminState>()((set) => ({
  isAdminMode: false,

  disableAdminMode: () => {
    set({ isAdminMode: false });
  },
}));

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface UIState {
  viewMode: 'grid' | 'list';
  isAdminMode: boolean;
  selectedBooks: Set<number>;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  actions: {
    setViewMode: (mode: 'grid' | 'list') => void;
    toggleAdminMode: () => void;
    toggleBookSelection: (bookId: number) => void;
    clearSelection: () => void;
    setSort: (sortBy: string, sortOrder: 'asc' | 'desc') => void;
  };
}

export const useUIStore = create<UIState>()(
  persist(
    (set, get) => ({
      viewMode: 'grid',
      isAdminMode: false,
      selectedBooks: new Set(),
      sortBy: 'created_at',
      sortOrder: 'desc',
      actions: {
        setViewMode: (mode) => set({ viewMode: mode }),
        toggleAdminMode: () => set({ isAdminMode: !get().isAdminMode }),
        toggleBookSelection: (bookId) => {
          const newSelected = new Set(get().selectedBooks);
          if (newSelected.has(bookId)) {
            newSelected.delete(bookId);
          } else {
            newSelected.add(bookId);
          }
          set({ selectedBooks: newSelected });
        },
        clearSelection: () => set({ selectedBooks: new Set() }),
        setSort: (sortBy, sortOrder) => set({ sortBy, sortOrder }),
      },
    }),
    {
      name: 'inkread-ui-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        viewMode: state.viewMode,
        sortBy: state.sortBy,
        sortOrder: state.sortOrder,
      }),
    }
  )
);

export const useUIActions = () => useUIStore((state) => state.actions);

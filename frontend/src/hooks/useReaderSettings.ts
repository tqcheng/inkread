import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

type FontSize = 16 | 18 | 20 | 22 | 24;
type LineHeight = 1.6 | 1.7 | 1.8;
type Theme = 'day' | 'night' | 'eye' | 'parchment';
type ReadingMode = 'scroll' | 'page';

interface ReaderSettingsState {
  fontSize: FontSize;
  lineHeight: LineHeight;
  theme: Theme;
  readingMode: ReadingMode;
  setFontSize: (size: FontSize) => void;
  setLineHeight: (height: LineHeight) => void;
  setTheme: (theme: Theme) => void;
  setReadingMode: (mode: ReadingMode) => void;
}

export const useReaderSettings = create<ReaderSettingsState>()(
  persist(
    (set) => ({
      fontSize: 18,
      lineHeight: 1.7,
      theme: 'day',
      readingMode: 'page',
      setFontSize: (size: FontSize) => set({ fontSize: size }),
      setLineHeight: (height: LineHeight) => set({ lineHeight: height }),
      setTheme: (theme: Theme) => set({ theme }),
      setReadingMode: (mode: ReadingMode) => set({ readingMode: mode }),
    }),
    {
      name: 'inkread-reader-settings',
      storage: createJSONStorage(() => localStorage),
    }
  )
);

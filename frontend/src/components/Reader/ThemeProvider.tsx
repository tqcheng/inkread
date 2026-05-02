import { ReactNode, useEffect } from 'react';
import { useReaderSettings } from '../../hooks/useReaderSettings';

type Theme = 'day' | 'night' | 'eye' | 'parchment';

interface ThemeConfig {
  bg: string;
  bgSide: string;
  text: string;
  name: string;
}

const themes: Record<Theme, ThemeConfig> = {
  day: { bg: '#fff', bgSide: '#f0f0f0', text: '#333', name: '白天' },
  night: { bg: '#1a1a1a', bgSide: '#111111', text: '#ccc', name: '夜间' },
  eye: { bg: '#c7edcc', bgSide: '#b0d6b8', text: '#333', name: '护眼' },
  parchment: { bg: '#f4ecd8', bgSide: '#e8dcc0', text: '#333', name: '羊皮纸' },
};

interface ThemeProviderProps {
  children: ReactNode;
}

export default function ThemeProvider({ children }: ThemeProviderProps) {
  const theme = useReaderSettings((state) => state.theme);
  const config = themes[theme];

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--bg-color', config.bg);
    root.style.setProperty('--bg-color-side', config.bgSide);
    root.style.setProperty('--text-color', config.text);
    document.body.style.backgroundColor = config.bg;
    document.body.style.color = config.text;
    document.body.style.transition = 'background-color 0.3s, color 0.3s';
  }, [theme, config]);

  return <>{children}</>;
}

export { themes };
export type { Theme, ThemeConfig };

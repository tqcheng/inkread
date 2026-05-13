import { ReactNode, useEffect } from 'react';
import { useReaderSettings } from '../../hooks/useReaderSettings';

type Theme = 'day' | 'night' | 'eye' | 'parchment';

interface ThemeConfig {
  bg: string;
  bgSide: string;
  text: string;
  name: string;
  stageBorder: string;
  stageShadow: string;
  toolbarBg: string;
  toolbarBorder: string;
  highlight: string;
}

const themes: Record<Theme, ThemeConfig> = {
  day: {
    bg: '#fbfaf7',
    bgSide: '#ece8e0',
    text: '#2d2923',
    name: '白天',
    stageBorder: 'rgba(115, 104, 87, 0.16)',
    stageShadow: '0 28px 80px rgba(72, 61, 48, 0.16)',
    toolbarBg: 'rgba(251, 250, 247, 0.86)',
    toolbarBorder: 'rgba(115, 104, 87, 0.14)',
    highlight: '#f6d88f',
  },
  night: {
    bg: '#171412',
    bgSide: '#0f0d0c',
    text: '#dfd7cf',
    name: '夜间',
    stageBorder: 'rgba(255, 255, 255, 0.08)',
    stageShadow: '0 28px 90px rgba(0, 0, 0, 0.42)',
    toolbarBg: 'rgba(23, 20, 18, 0.82)',
    toolbarBorder: 'rgba(255, 255, 255, 0.08)',
    highlight: '#7d5e1f',
  },
  eye: {
    bg: '#dce9d8',
    bgSide: '#c4d6c0',
    text: '#243126',
    name: '护眼',
    stageBorder: 'rgba(58, 89, 63, 0.14)',
    stageShadow: '0 28px 80px rgba(60, 92, 64, 0.14)',
    toolbarBg: 'rgba(220, 233, 216, 0.84)',
    toolbarBorder: 'rgba(58, 89, 63, 0.14)',
    highlight: '#e9c76b',
  },
  parchment: {
    bg: '#f1e7d1',
    bgSide: '#dfcfb0',
    text: '#332b20',
    name: '羊皮纸',
    stageBorder: 'rgba(124, 94, 50, 0.18)',
    stageShadow: '0 30px 88px rgba(102, 77, 42, 0.18)',
    toolbarBg: 'rgba(241, 231, 209, 0.86)',
    toolbarBorder: 'rgba(124, 94, 50, 0.16)',
    highlight: '#efcc78',
  },
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
    root.style.setProperty('--reader-stage-border', config.stageBorder);
    root.style.setProperty('--reader-stage-shadow', config.stageShadow);
    root.style.setProperty('--reader-toolbar-bg', config.toolbarBg);
    root.style.setProperty('--reader-toolbar-border', config.toolbarBorder);
    root.style.setProperty('--reader-highlight', config.highlight);
    document.body.style.backgroundColor = config.bgSide;
    document.body.style.color = config.text;
    document.body.style.transition = 'background-color 0.3s, color 0.3s';
  }, [theme, config]);

  return <>{children}</>;
}

export { themes };
export type { Theme, ThemeConfig };

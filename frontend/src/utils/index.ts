import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function stringToColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  let color = '#';
  for (let i = 0; i < 3; i++) {
    const value = (hash >> (i * 8)) & 0xff;
    color += ('00' + value.toString(16)).substr(-2);
  }
  return color;
}

export function getGradientColors(str: string): string {
  const color1 = stringToColor(str);
  const color2 = stringToColor(str + 'salt');
  return `linear-gradient(135deg, ${color1} 0%, ${color2} 100%)`;
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

export const CATEGORIES = [
  { id: 'classical', label: '古典', color: 'bg-amber-500' },
  { id: 'modern', label: '现代', color: 'bg-blue-500' },
  { id: 'wuxia', label: '武侠', color: 'bg-red-500' },
  { id: 'fantasy', label: '玄幻', color: 'bg-purple-500' },
  { id: 'scifi', label: '科幻', color: 'bg-cyan-500' },
  { id: 'anime', label: '动漫', color: 'bg-pink-500' },
  { id: 'urban', label: '都市', color: 'bg-green-500' },
] as const;

export const SORT_OPTIONS = [
  { id: 'created_at', label: '加入时间' },
  { id: 'title', label: '文件名' },
  { id: 'file_size', label: '大小' },
  { id: 'category_confidence', label: 'AI置信度' },
] as const;
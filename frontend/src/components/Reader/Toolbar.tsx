import { useState } from 'react';
import { useReaderSettings } from '../../hooks/useReaderSettings';
import { themes } from './ThemeProvider';
import { ChevronLeft, Menu, Sun, Moon, Eye, BookOpen, Type, AlignJustify, ArrowLeft, ArrowRight, List, X, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { Chapter, BookSearchResult } from '../../api/types';
import { useBookSearch } from '../../hooks/useBookSearch';

export interface ToolbarProps {
  bookTitle?: string;
  currentPage?: number;
  totalPages?: number;
  canPrev?: boolean;
  canNext?: boolean;
  chapters?: Chapter[];
  onPrev?: () => void;
  onNext?: () => void;
  onChapterClick?: (chapter: Chapter) => void;
  show: boolean;
  currentChapterTitle?: string;
  bookId: number;
  onSearchResultClick?: (offset: number, query: string) => void;
}

export function Toolbar({ 
  bookTitle = '书籍', 
  currentPage = 1, 
  totalPages = 1, 
  canPrev,
  canNext,
  chapters = [],
  onPrev, 
  onNext,
  onChapterClick,
  currentChapterTitle,
  show,
  bookId,
  onSearchResultClick,
}: ToolbarProps) {
  const { theme, setTheme, fontSize, setFontSize, lineHeight, setLineHeight, readingMode, setReadingMode } = useReaderSettings();
  const navigate = useNavigate();
  const [showSettings, setShowSettings] = useState(false);
  const [showTOC, setShowTOC] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const { data: searchData, isLoading: searchLoading, error: searchError } = useBookSearch(
    bookId,
    searchQuery,
    showSearch
  );

  const themeIcons = {
    day: <Sun size={20} />,
    night: <Moon size={20} />,
    eye: <Eye size={20} />,
    parchment: <BookOpen size={20} />,
  };

  const fontSizes = [16, 18, 20, 22, 24] as const;
  const lineHeights = [1.6, 1.7, 1.8] as const;

  const progress = totalPages > 0 ? Math.round(((currentPage + 1) / totalPages) * 100) : 0;
  const prevDisabled = canPrev ?? currentPage <= 0;
  const nextDisabled = canNext ?? currentPage >= totalPages - 1;

  if (!show) return null;

  return (
    <>
      {/* Top Toolbar */}
      <div className="fixed top-0 left-0 right-0 h-14 bg-white/95 dark:bg-gray-900/95 border-b border-gray-200 dark:border-gray-700 flex items-center px-4 z-50">
        <button onClick={() => navigate('/')} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
          <ChevronLeft size={24} />
        </button>
        <h1 className="flex-1 text-center font-semibold text-lg truncate">{bookTitle}</h1>
        <div className="flex items-center gap-1">
          <button onClick={() => { setShowTOC(!showTOC); setShowSearch(false); }} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg" title="目录">
            <List size={24} />
          </button>
          <button onClick={() => { setShowSearch(!showSearch); setShowTOC(false); }} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg" title="搜索">
            <Search size={24} />
          </button>
        </div>
      </div>

      {/* Bottom Toolbar */}
      <div className="fixed bottom-0 left-0 right-0 h-16 bg-white/95 dark:bg-gray-900/95 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between px-4 z-50">
        <span className="text-sm text-gray-600 dark:text-gray-400">
          {readingMode === 'scroll' && currentChapterTitle
            ? currentChapterTitle
            : `${progress}%`}
        </span>
        
        <div className="flex items-center gap-2">
          {/* Font Size */}
          <div className="hidden sm:flex items-center gap-1 mr-4">
            <Type size={16} className="text-gray-500" />
            {fontSizes.map(size => (
              <button
                key={size}
                onClick={() => setFontSize(size)}
                className={`w-8 h-8 rounded flex items-center justify-center text-xs ${fontSize === size ? 'bg-blue-500 text-white' : 'hover:bg-gray-100 dark:hover:bg-gray-800'}`}
              >
                {size}
              </button>
            ))}
          </div>

          {/* Theme */}
          <div className="hidden sm:flex items-center gap-1 mr-4">
            {(Object.keys(themes) as Array<keyof typeof themes>).map((t) => (
              <button
                key={t}
                onClick={() => setTheme(t)}
                className={`w-8 h-8 rounded flex items-center justify-center ${theme === t ? 'bg-blue-500 text-white' : 'hover:bg-gray-100 dark:hover:bg-gray-800'}`}
                style={theme === t ? {} : { backgroundColor: themes[t].bg, color: themes[t].text }}
                title={themes[t].name}
              >
                {themeIcons[t]}
              </button>
            ))}
          </div>

          {/* Menu Button */}
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
            title="设置"
          >
            <Menu size={24} />
          </button>

          {/* Navigation */}
          {readingMode !== 'scroll' && (
            <>
              <button
                onClick={onPrev}
                disabled={prevDisabled}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg disabled:opacity-50"
              >
                <ArrowLeft size={24} />
              </button>
              <button
                onClick={onNext}
                disabled={nextDisabled}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg disabled:opacity-50"
              >
                <ArrowRight size={24} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="fixed bottom-16 left-0 right-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 p-4 z-40 shadow-lg">
          <div className="max-w-2xl mx-auto space-y-4">
            {/* Font Size */}
            <div>
              <label className="text-sm font-medium mb-2 block">字号</label>
              <div className="flex gap-2">
                {fontSizes.map(size => (
                  <button
                    key={size}
                    onClick={() => setFontSize(size)}
                    className={`w-10 h-10 rounded-lg flex items-center justify-center ${fontSize === size ? 'bg-blue-500 text-white' : 'bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>

            {/* Line Height */}
            <div>
              <label className="text-sm font-medium mb-2 block">行高</label>
              <div className="flex gap-2">
                {lineHeights.map(height => (
                  <button
                    key={height}
                    onClick={() => setLineHeight(height)}
                    className={`px-4 py-2 rounded-lg ${lineHeight === height ? 'bg-blue-500 text-white' : 'bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
                  >
                    {height}
                  </button>
                ))}
              </div>
            </div>

            {/* Theme */}
            <div>
              <label className="text-sm font-medium mb-2 block">主题</label>
              <div className="flex gap-2">
                {(Object.keys(themes) as Array<keyof typeof themes>).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTheme(t)}
                    className={`w-12 h-10 rounded-lg flex items-center justify-center gap-1 ${theme === t ? 'bg-blue-500 text-white' : 'bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
                    style={theme === t ? {} : { backgroundColor: themes[t].bg, color: themes[t].text }}
                  >
                    {themeIcons[t]}
                    <span className="text-xs ml-1">{themes[t].name}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Reading Mode */}
            <div>
              <label className="text-sm font-medium mb-2 block">阅读模式</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setReadingMode('page')}
                  className={`flex-1 py-2 px-4 rounded-lg flex items-center justify-center gap-2 ${readingMode === 'page' ? 'bg-blue-500 text-white' : 'bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
                >
                  <AlignJustify size={18} />
                  翻页
                </button>
                <button
                  onClick={() => setReadingMode('scroll')}
                  className={`flex-1 py-2 px-4 rounded-lg flex items-center justify-center gap-2 ${readingMode === 'scroll' ? 'bg-blue-500 text-white' : 'bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
                >
                  <AlignJustify size={18} />
                  滚动
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TOC Sidebar */}
      {showTOC && (
        <div className="fixed top-14 right-0 bottom-16 w-72 bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 z-40 shadow-lg overflow-y-auto">
          <div className="sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 p-4 flex items-center justify-between">
            <h2 className="font-semibold">目录</h2>
            <button onClick={() => setShowTOC(false)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded">
              <X size={20} />
            </button>
          </div>
          <div className="p-2">
            {chapters.length > 0 ? (
              chapters.map((chapter) => (
                <button
                  key={chapter.id}
                  onClick={() => {
                    onChapterClick?.(chapter);
                    setShowTOC(false);
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-sm truncate"
                >
                  {chapter.title || `第 ${(chapter.chapter_index ?? 0) + 1} 章`}
                </button>
              ))
            ) : (
              <p className="text-gray-500 text-sm p-3">暂无目录</p>
            )}
          </div>
        </div>
      )}

      {/* Search Sidebar */}
      {showSearch && (
        <div className="fixed top-14 right-0 bottom-16 w-80 bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 z-40 shadow-lg flex flex-col">
          <div className="sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 p-4">
            <h2 className="font-semibold mb-2">搜索</h2>
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="输入关键词..."
                className="w-full px-3 py-2.5 pr-8 rounded-lg bg-gray-100 dark:bg-gray-800 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X size={16} />
                </button>
              )}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {searchError && (
              <div className="p-3 text-sm text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg mb-2">
                搜索失败，请稍后重试
              </div>
            )}
            {!searchQuery.trim() && (
              <p className="text-gray-500 text-sm p-3 text-center">请输入搜索关键词</p>
            )}
            {searchQuery.trim() && !searchLoading && searchData?.results.length === 0 && (
              <p className="text-gray-500 text-sm p-3 text-center">未找到匹配内容</p>
            )}
            {searchLoading && (
              <p className="text-gray-500 text-sm p-3 text-center">搜索中...</p>
            )}
            {searchData?.results.map((result: BookSearchResult, index: number) => (
              <button
                key={index}
                onClick={() => {
                  onSearchResultClick?.(result.offset, searchQuery);
                  setShowSearch(false);
                }}
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-base mb-1"
              >
                <p className="text-sm text-gray-400 line-clamp-3">
                  <span className="font-medium text-gray-700 dark:text-gray-300">({result.position_percent}%)</span>...{highlightText(result.context, searchQuery)}
                </p>
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function highlightText(text: string, term: string): React.ReactNode {
  if (!term || !text) return text;
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
  return parts.map((part, i) =>
    part.toLowerCase() === term.toLowerCase()
      ? <mark key={i} className="bg-yellow-300 dark:bg-yellow-600 rounded-sm px-0.5">{part}</mark>
      : part
  );
}

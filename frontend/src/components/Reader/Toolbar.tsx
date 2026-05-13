import { useEffect, useState } from 'react';
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
  onPageJump?: (pageIndex: number) => void;
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
  onPageJump,
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
  const [pageJumpValue, setPageJumpValue] = useState(String(currentPage + 1));

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
  const prevDisabled = canPrev != null ? !canPrev : currentPage <= 0;
  const nextDisabled = canNext != null ? !canNext : currentPage >= totalPages - 1;
  const isPageMode = readingMode !== 'scroll';
  const pageSummary =
    currentChapterTitle && isPageMode
      ? `${currentChapterTitle} · ${Math.min(currentPage + 1, totalPages)} / ${totalPages}`
      : `${progress}%`;

  useEffect(() => {
    setPageJumpValue(String(currentPage + 1));
  }, [currentPage]);

  useEffect(() => {
    if (!show) {
      setShowSettings(false);
      setShowTOC(false);
      setShowSearch(false);
    }
  }, [show]);

  const handlePageJumpSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!onPageJump || totalPages <= 0) {
      return;
    }

    const trimmedValue = pageJumpValue.trim();
    if (!/^\d+$/.test(trimmedValue)) {
      setPageJumpValue(String(currentPage + 1));
      return;
    }

    const parsedPage = Number(trimmedValue);
    const clampedPage = Math.max(1, Math.min(parsedPage, totalPages));
    setPageJumpValue(String(clampedPage));
    onPageJump(clampedPage - 1);
  };

  return (
    <>
      {/* Top Toolbar */}
      <div
        className={`pointer-events-none fixed top-0 left-0 right-0 z-50 px-4 pt-3 transition-all duration-200 sm:px-6 ${
          show ? 'translate-y-0 opacity-100' : '-translate-y-3 opacity-0'
        }`}
      >
        <div
          className="pointer-events-auto mx-auto flex h-14 max-w-5xl items-center rounded-2xl border px-3 shadow-sm backdrop-blur-xl"
          style={{
            backgroundColor: 'var(--reader-toolbar-bg)',
            borderColor: 'var(--reader-toolbar-border)',
          }}
        >
          <button onClick={() => navigate('/')} className="rounded-xl p-2 transition-colors hover:bg-black/5">
            <ChevronLeft size={22} />
          </button>
          <div className="min-w-0 flex-1 px-3">
            <h1 className="truncate text-sm font-semibold tracking-[0.18em] text-[var(--text-color)]/85">
              {bookTitle}
            </h1>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => { setShowTOC(!showTOC); setShowSearch(false); }}
              className="rounded-xl p-2 transition-colors hover:bg-black/5"
              title="目录"
            >
              <List size={20} />
            </button>
            <button
              onClick={() => { setShowSearch(!showSearch); setShowTOC(false); }}
              className="rounded-xl p-2 transition-colors hover:bg-black/5"
              title="搜索"
            >
              <Search size={20} />
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Toolbar */}
      <div
        className={`pointer-events-none fixed bottom-0 left-0 right-0 z-50 px-4 pb-3 transition-all duration-200 sm:px-6 ${
          show ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'
        }`}
      >
        <div
          className="pointer-events-auto mx-auto flex min-h-16 max-w-5xl items-center justify-between gap-3 rounded-[22px] border px-4 py-3 shadow-sm backdrop-blur-xl"
          style={{
            backgroundColor: 'var(--reader-toolbar-bg)',
            borderColor: 'var(--reader-toolbar-border)',
          }}
        >
          <div className="min-w-0">
            <span className="block truncate text-sm text-[var(--text-color)]/78">
              {pageSummary}
            </span>
          </div>

          <div className="flex items-center gap-2">
          {/* Font Size */}
          <div className="hidden sm:flex items-center gap-1 mr-4">
            <Type size={16} className="text-[var(--text-color)]/55" />
            {fontSizes.map(size => (
              <button
                key={size}
                onClick={() => setFontSize(size)}
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs transition-colors ${fontSize === size ? 'bg-black/80 text-white' : 'hover:bg-black/5'}`}
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
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${theme === t ? 'bg-black/80 text-white' : 'hover:bg-black/5'}`}
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
            className="rounded-xl p-2 transition-colors hover:bg-black/5"
            title="设置"
          >
            <Menu size={24} />
          </button>

          {/* Navigation */}
          {isPageMode && (
            <>
              <button
                onClick={onPrev}
                disabled={prevDisabled}
                aria-label="上一页"
                className="rounded-xl p-2 transition-colors hover:bg-black/5 disabled:opacity-50"
              >
                <ArrowLeft size={24} />
              </button>
              <button
                onClick={onNext}
                disabled={nextDisabled}
                aria-label="下一页"
                className="rounded-xl p-2 transition-colors hover:bg-black/5 disabled:opacity-50"
              >
                <ArrowRight size={24} />
              </button>
              {onPageJump && totalPages > 0 && (
                <form onSubmit={handlePageJumpSubmit} className="ml-2 flex items-center gap-2">
                  <span className="whitespace-nowrap text-xs text-[var(--text-color)]/55">
                    {currentPage + 1} / {totalPages}
                  </span>
                  <input
                    aria-label="跳转到页码"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={pageJumpValue}
                    onChange={(event) => setPageJumpValue(event.target.value)}
                    className="w-14 rounded-full border px-2 py-1 text-sm"
                    style={{
                      borderColor: 'var(--reader-toolbar-border)',
                      backgroundColor: 'color-mix(in srgb, var(--reader-toolbar-bg) 78%, white 22%)',
                    }}
                  />
                  <button
                    type="submit"
                    aria-label="跳转页码"
                    className="rounded-full px-3 py-1 text-sm transition-colors hover:bg-black/5"
                  >
                    跳转
                  </button>
                </form>
              )}
            </>
          )}
        </div>
      </div>
      </div>

      {/* Settings Panel */}
      {show && showSettings && (
        <div
          className="fixed bottom-20 left-4 right-4 z-40 rounded-[24px] border p-4 shadow-lg backdrop-blur-xl sm:left-6 sm:right-6"
          style={{
            backgroundColor: 'var(--reader-toolbar-bg)',
            borderColor: 'var(--reader-toolbar-border)',
          }}
        >
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

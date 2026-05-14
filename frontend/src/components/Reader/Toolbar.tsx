import { useEffect, useState } from 'react';
import { useReaderSettings } from '../../hooks/useReaderSettings';
import { themes } from './ThemeProvider';
import { ChevronLeft, Menu, Sun, Moon, Eye, BookOpen, AlignJustify, ArrowLeft, ArrowRight, List, X, Search } from 'lucide-react';
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
  const toolbarPointerClass = show ? 'pointer-events-auto' : 'pointer-events-none';
  const displayPage = totalPages > 0 ? Math.min(currentPage + 1, totalPages) : 0;
  const statusTitle = currentChapterTitle || bookTitle;
  const statusMeta = isPageMode && totalPages > 0
    ? `${displayPage} / ${totalPages} · ${progress}%`
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

  const toggleSettings = () => {
    setShowSettings((previous) => {
      const next = !previous;
      if (next) {
        setShowTOC(false);
        setShowSearch(false);
      }
      return next;
    });
  };

  const toggleTOC = () => {
    setShowTOC((previous) => {
      const next = !previous;
      if (next) {
        setShowSettings(false);
        setShowSearch(false);
      }
      return next;
    });
  };

  const toggleSearch = () => {
    setShowSearch((previous) => {
      const next = !previous;
      if (next) {
        setShowSettings(false);
        setShowTOC(false);
      }
      return next;
    });
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
          className={`${toolbarPointerClass} mx-auto flex h-14 max-w-5xl items-center rounded-2xl border px-3 shadow-sm backdrop-blur-xl`}
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
              onClick={toggleTOC}
              className="rounded-xl p-2 transition-colors hover:bg-black/5"
              title="目录"
            >
              <List size={20} />
            </button>
            <button
              onClick={toggleSearch}
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
          className={`${toolbarPointerClass} mx-auto flex min-h-16 max-w-5xl items-center justify-between gap-3 rounded-[22px] border px-4 py-3 shadow-sm backdrop-blur-xl`}
          style={{
            backgroundColor: 'var(--reader-toolbar-bg)',
            borderColor: 'var(--reader-toolbar-border)',
          }}
        >
          <div className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-[var(--text-color)]/84">
              {statusTitle}
            </span>
            <span className="mt-0.5 block truncate text-xs tracking-[0.12em] text-[var(--text-color)]/56">
              {statusMeta}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={toggleSettings}
              className="rounded-xl p-2 transition-colors hover:bg-black/5"
              title="设置"
            >
              <Menu size={22} />
            </button>

            {isPageMode && (
              <>
              {/* Navigation */}
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
              </>
            )}
          </div>
        </div>
      </div>

      {/* Settings Panel */}
      {show && showSettings && (
        <>
          <button
            type="button"
            data-testid="settings-backdrop"
            aria-label="关闭设置遮罩"
            onClick={() => setShowSettings(false)}
            className="fixed inset-0 z-30 bg-black/10 backdrop-blur-[2px]"
          />
          <div
            className="fixed top-14 right-0 bottom-16 z-40 flex w-80 max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden border-l shadow-lg backdrop-blur-xl sm:w-96"
            style={{
              backgroundColor: 'var(--reader-toolbar-bg)',
              borderColor: 'var(--reader-toolbar-border)',
            }}
          >
            <div
              className="flex items-start justify-between gap-4 border-b p-4"
              style={{ borderColor: 'var(--reader-toolbar-border)' }}
            >
                <div>
                  <h2 className="text-base font-semibold text-[var(--text-color)]">
                    阅读设置
                  </h2>
                  <p className="mt-1 text-sm text-[var(--text-color)]/58">
                    调整排版与翻页方式，当前进度保持在 {statusMeta}
                  </p>
                </div>
                <button
                  onClick={() => setShowSettings(false)}
                  className="rounded-xl p-2 transition-colors hover:bg-black/5"
                  aria-label="关闭设置"
                >
                  <X size={20} />
                </button>
              </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-4">
                <section
                  className="rounded-2xl border p-4"
                  style={{ borderColor: 'var(--reader-toolbar-border)' }}
                >
                  <label className="mb-3 block text-sm font-medium text-[var(--text-color)]/76">
                    文字
                  </label>
                  <div className="mb-4 flex flex-wrap gap-2">
                    {fontSizes.map(size => (
                      <button
                        key={size}
                        onClick={() => setFontSize(size)}
                        className="h-10 rounded-full px-4 text-sm transition-colors"
                        style={{
                          backgroundColor:
                            fontSize === size
                              ? 'var(--text-color)'
                              : 'color-mix(in srgb, var(--reader-toolbar-bg) 78%, white 22%)',
                          color: fontSize === size ? 'var(--bg-color)' : 'var(--text-color)',
                        }}
                      >
                        {size}
                      </button>
                    ))}
                  </div>

                  <label className="mb-3 block text-sm font-medium text-[var(--text-color)]/76">
                    行高
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {lineHeights.map(height => (
                      <button
                        key={height}
                        onClick={() => setLineHeight(height)}
                        className="rounded-full px-4 py-2 text-sm transition-colors"
                        style={{
                          backgroundColor:
                            lineHeight === height
                              ? 'var(--text-color)'
                              : 'color-mix(in srgb, var(--reader-toolbar-bg) 78%, white 22%)',
                          color: lineHeight === height ? 'var(--bg-color)' : 'var(--text-color)',
                        }}
                      >
                        {height}
                      </button>
                    ))}
                  </div>
                </section>

                <section
                  className="rounded-2xl border p-4"
                  style={{ borderColor: 'var(--reader-toolbar-border)' }}
                >
                  <label className="mb-3 block text-sm font-medium text-[var(--text-color)]/76">
                    主题
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {(Object.keys(themes) as Array<keyof typeof themes>).map((t) => (
                      <button
                        key={t}
                        onClick={() => setTheme(t)}
                        className="flex h-10 items-center justify-center gap-2 rounded-full px-4 text-sm transition-colors"
                        style={{
                          backgroundColor:
                            theme === t
                              ? 'var(--text-color)'
                              : themes[t].bg,
                          color: theme === t ? 'var(--bg-color)' : themes[t].text,
                        }}
                      >
                        {themeIcons[t]}
                        <span>{themes[t].name}</span>
                      </button>
                    ))}
                  </div>
                </section>

                <section
                  className="rounded-2xl border p-4"
                  style={{ borderColor: 'var(--reader-toolbar-border)' }}
                >
                  <label className="mb-3 block text-sm font-medium text-[var(--text-color)]/76">
                    阅读模式
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setReadingMode('page')}
                      className="flex-1 rounded-2xl px-4 py-3 text-sm transition-colors"
                      style={{
                        backgroundColor:
                          readingMode === 'page'
                            ? 'var(--text-color)'
                            : 'color-mix(in srgb, var(--reader-toolbar-bg) 78%, white 22%)',
                        color: readingMode === 'page' ? 'var(--bg-color)' : 'var(--text-color)',
                      }}
                    >
                      <span className="flex items-center justify-center gap-2">
                        <AlignJustify size={18} />
                        翻页
                      </span>
                    </button>
                    <button
                      onClick={() => setReadingMode('scroll')}
                      className="flex-1 rounded-2xl px-4 py-3 text-sm transition-colors"
                      style={{
                        backgroundColor:
                          readingMode === 'scroll'
                            ? 'var(--text-color)'
                            : 'color-mix(in srgb, var(--reader-toolbar-bg) 78%, white 22%)',
                        color: readingMode === 'scroll' ? 'var(--bg-color)' : 'var(--text-color)',
                      }}
                    >
                      <span className="flex items-center justify-center gap-2">
                        <AlignJustify size={18} />
                        滚动
                      </span>
                    </button>
                  </div>
                </section>

                {isPageMode && onPageJump && totalPages > 0 && (
                  <section
                    className="rounded-2xl border p-4"
                    style={{ borderColor: 'var(--reader-toolbar-border)' }}
                  >
                    <label className="mb-3 block text-sm font-medium text-[var(--text-color)]/76">
                      跳转页码
                    </label>
                    <form onSubmit={handlePageJumpSubmit} className="flex items-center gap-3">
                      <input
                        aria-label="跳转到页码"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={pageJumpValue}
                        onChange={(event) => setPageJumpValue(event.target.value)}
                        className="w-20 rounded-full border px-3 py-2 text-sm"
                        style={{
                          borderColor: 'var(--reader-toolbar-border)',
                          backgroundColor: 'color-mix(in srgb, var(--reader-toolbar-bg) 78%, white 22%)',
                        }}
                      />
                      <span className="text-sm text-[var(--text-color)]/58">
                        共 {totalPages} 页
                      </span>
                      <button
                        type="submit"
                        aria-label="跳转页码"
                        className="rounded-full px-4 py-2 text-sm transition-colors hover:bg-black/5"
                      >
                        跳转
                      </button>
                    </form>
                  </section>
                )}
              </div>
          </div>
        </>
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

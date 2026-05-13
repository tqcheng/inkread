import { useParams } from 'react-router-dom';
import { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { useBookQuery, useBookContentQuery } from '../hooks/useBooks';
import { useReaderSettings } from '../hooks/useReaderSettings';
import { useAuth } from '../hooks/useAuth';
import { usePageChapterContent } from '../hooks/usePageChapterContent';
import ThemeProvider from '../components/Reader/ThemeProvider';
import { Toolbar } from '../components/Reader/Toolbar';
import { TextContent } from '../components/Reader/TextContent';
import { PageContent } from '../components/Reader/page-mode/PageContent';
import { PageReaderShell } from '../components/Reader/page-mode/PageReaderShell';
import { usePageReaderController } from '../components/Reader/page-mode/usePageReaderController';
import { booksApi } from '../api/books';
import LoginOverlay from '../components/LoginOverlay';
import type { Chapter } from '../api/types';

interface ChapterBlock {
  title: string;
  startOffset: number;
  endOffset: number;
  text: string;
}

interface PageAnchorRequest {
  chapterIndex: number;
  kind: 'byte' | 'char' | 'start' | 'end';
  value?: number;
}

// Book progress is persisted as book-global byte offsets, while the page controller
// reads chapter-local character offsets. This converts bytes -> chars for restore/jumps.
function byteOffsetToCharIndex(text: string, byteOffset: number): number {
  const encoder = new TextEncoder();
  let bytes = 0;
  for (let i = 0; i < text.length; i += 1) {
    bytes += encoder.encode(text[i]).length;
    if (bytes > byteOffset) return i;
  }
  return text.length;
}

// Inverse of byteOffsetToCharIndex for page-mode progress persistence:
// chapter-local character offsets -> chapter-local byte offsets.
function charIndexToByteOffset(text: string, charIndex: number): number {
  const encoder = new TextEncoder();
  let bytes = 0;
  const safeCharIndex = Math.max(0, Math.min(charIndex, text.length));

  for (let i = 0; i < safeCharIndex; i += 1) {
    bytes += encoder.encode(text[i]).length;
  }

  return bytes;
}

function getChapterTitle(chapter: Chapter | undefined, fallbackIndex: number): string {
  return chapter?.title || `第 ${((chapter?.chapter_index ?? fallbackIndex) + 1)} 章`;
}

function getChapterArrayIndexForOffset(chapters: Chapter[], absoluteByteOffset: number): number {
  if (chapters.length === 0) {
    return 0;
  }

  const matchingIndex = chapters.findIndex((chapter) =>
    absoluteByteOffset >= chapter.position_start &&
    (chapter.position_end == null || absoluteByteOffset < chapter.position_end)
  );

  if (matchingIndex >= 0) {
    return matchingIndex;
  }

  if (absoluteByteOffset < chapters[0].position_start) {
    return 0;
  }

  return chapters.length - 1;
}

function getDefaultChapterIndex(chapters: Chapter[]): number {
  const firstContentChapter = chapters.findIndex(
    (chapter) => chapter.position_end != null && chapter.position_end - chapter.position_start > 50
  );

  return firstContentChapter >= 0 ? firstContentChapter : 0;
}

export default function Reader() {
  const { id } = useParams<{ id: string }>();
  const bookId = id ? parseInt(id, 10) : 0;

  const { data: book } = useBookQuery(bookId);
  const {
    readingMode,
    fontSize,
    lineHeight,
  } = useReaderSettings();
  const [currentChapterIndex, setCurrentChapterIndex] = useState(0);

  const isScrollMode = readingMode === 'scroll';
  const isPageMode = readingMode === 'page';

  const scrollQueryEnabled = isScrollMode;
  const { data: scrollContent } = useBookContentQuery(
    bookId,
    0,
    200000,
    book?.chapters?.length ? currentChapterIndex : undefined,
    scrollQueryEnabled
  );

  const firstChapterStart = book?.chapters?.[0]?.position_start || 0;
  const shouldFetchPreContent = isScrollMode && currentChapterIndex === 0 && firstChapterStart > 0;
  const { data: preContent } = useBookContentQuery(
    bookId,
    0,
    firstChapterStart,
    undefined,
    shouldFetchPreContent
  );

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const contentColumnRef = useRef<HTMLDivElement>(null);
  const [showToolbar, setShowToolbar] = useState(true);
  const progressSaveTimeoutRef = useRef<number>();
  const lastScrollTopRef = useRef<number>(0);
  const [chapterProgress, setChapterProgress] = useState(0);
  const initialRestoreRef = useRef(true);
  const searchTargetOffsetRef = useRef<number | null>(null);
  const [highlightQuery, setHighlightQuery] = useState<string | null>(null);
  const [viewportSize, setViewportSize] = useState(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));
  const [pageInitialAnchor, setPageInitialAnchor] = useState(0);
  const [pageAnchorRequest, setPageAnchorRequest] = useState<PageAnchorRequest | null>(null);

  const { token, isEnabled, isLoading: authLoading, checkStatus } = useAuth();

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  useEffect(() => {
    if (!isPageMode) {
      return undefined;
    }

    const handleResize = () => {
      setViewportSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    handleResize();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [isPageMode]);

  const chapterBlocks = useMemo<ChapterBlock[]>(() => {
    if (!book || !isScrollMode) return [];

    const pre = currentChapterIndex === 0 ? (preContent?.content || '') : '';
    const content = scrollContent?.content || '';
    const currentChapter = book.chapters?.[currentChapterIndex];
    const title = currentChapter?.title ||
      (book.chapters?.length ? `第 ${currentChapterIndex + 1} 章` : '正文');
    const fullText = pre + content;

    return [{
      title,
      startOffset: pre ? 0 : (currentChapter?.position_start || 0),
      endOffset: pre
        ? (currentChapter?.position_end || fullText.length)
        : ((currentChapter?.position_start || 0) + content.length),
      text: fullText,
    }];
  }, [book, currentChapterIndex, isScrollMode, preContent?.content, scrollContent?.content]);

  const displayChapterNum = useMemo(() => {
    if (!isScrollMode || !book?.chapters?.length) return null;
    const chapter = book.chapters[currentChapterIndex];
    return chapter?.chapter_index != null ? chapter.chapter_index : currentChapterIndex + 1;
  }, [book?.chapters, currentChapterIndex, isScrollMode]);

  const displayTotalChapters = useMemo(() => {
    if (!isScrollMode || !book?.chapters?.length) return 0;
    const lastChapter = book.chapters[book.chapters.length - 1];
    return lastChapter?.chapter_index != null ? lastChapter.chapter_index : book.chapters.length;
  }, [book?.chapters, isScrollMode]);

  const pageChapters = isPageMode ? (book?.chapters || []) : [];
  const {
    contentByIndex,
    errorsByIndex,
    loadingByIndex,
  } = usePageChapterContent(bookId, pageChapters, currentChapterIndex);

  const currentPageChapter = book?.chapters?.[currentChapterIndex];
  const currentPageChapterText = contentByIndex[currentChapterIndex] || '';
  const currentPageChapterError = errorsByIndex[currentChapterIndex] || null;
  const isCurrentPageChapterLoading = loadingByIndex[currentChapterIndex] ?? false;

  const {
    pages: chapterPages,
    currentPage,
    currentPageIndex,
    setCurrentPageIndex,
    anchorOffset,
  } = usePageReaderController({
    chapterIndex: currentChapterIndex,
    chapterText: currentPageChapterText,
    viewportWidth: viewportSize.width,
    viewportHeight: viewportSize.height,
    fontSize,
    lineHeight,
    initialAnchor: pageInitialAnchor,
  });

  useEffect(() => {
    if (!isPageMode || !pageAnchorRequest) {
      return;
    }

    if (pageAnchorRequest.chapterIndex !== currentChapterIndex || isCurrentPageChapterLoading) {
      return;
    }

    if (currentPageChapterError) {
      setPageInitialAnchor(0);
      setPageAnchorRequest(null);
      return;
    }

    let nextAnchor = 0;

    if (pageAnchorRequest.kind === 'char') {
      nextAnchor = pageAnchorRequest.value || 0;
    } else if (pageAnchorRequest.kind === 'byte') {
      nextAnchor = byteOffsetToCharIndex(currentPageChapterText, pageAnchorRequest.value || 0);
    } else if (pageAnchorRequest.kind === 'end') {
      nextAnchor = Math.max(currentPageChapterText.length - 1, 0);
    }

    setPageInitialAnchor(Math.max(0, Math.min(nextAnchor, currentPageChapterText.length)));
    setPageAnchorRequest(null);
  }, [
    currentChapterIndex,
    currentPageChapterError,
    currentPageChapterText,
    isCurrentPageChapterLoading,
    isPageMode,
    pageAnchorRequest,
  ]);

  const queuePageAnchorRequest = useCallback((request: PageAnchorRequest) => {
    setCurrentChapterIndex(request.chapterIndex);
    setPageAnchorRequest(request);

    if (request.kind === 'char') {
      setPageInitialAnchor(Math.max(0, request.value || 0));
    } else if (request.kind === 'start') {
      setPageInitialAnchor(0);
    }
  }, []);

  const handlePagePrev = useCallback(() => {
    if (!isPageMode) {
      return;
    }

    if (currentPageIndex > 0) {
      setCurrentPageIndex(currentPageIndex - 1);
      return;
    }

    if (currentChapterIndex > 0) {
      queuePageAnchorRequest({
        chapterIndex: currentChapterIndex - 1,
        kind: 'end',
      });
    }
  }, [currentChapterIndex, currentPageIndex, isPageMode, queuePageAnchorRequest, setCurrentPageIndex]);

  const handlePageNext = useCallback(() => {
    if (!isPageMode) {
      return;
    }

    if (currentPageIndex >= 0 && currentPageIndex < chapterPages.length - 1) {
      setCurrentPageIndex(currentPageIndex + 1);
      return;
    }

    if (currentChapterIndex < (book?.chapters?.length || 0) - 1) {
      queuePageAnchorRequest({
        chapterIndex: currentChapterIndex + 1,
        kind: 'start',
      });
    }
  }, [
    book?.chapters?.length,
    chapterPages.length,
    currentChapterIndex,
    currentPageIndex,
    isPageMode,
    queuePageAnchorRequest,
    setCurrentPageIndex,
  ]);

  useEffect(() => {
    if (!initialRestoreRef.current || !book?.chapters?.length) return;

    if (isPageMode) {
      if (book.last_read_position != null) {
        const targetChapterIndex = getChapterArrayIndexForOffset(book.chapters, book.last_read_position);
        const targetChapter = book.chapters[targetChapterIndex];
        const chapterLocalByteOffset = Math.max(
          0,
          book.last_read_position - (targetChapter?.position_start || 0)
        );

        queuePageAnchorRequest({
          chapterIndex: targetChapterIndex,
          kind: 'byte',
          value: chapterLocalByteOffset,
        });
      } else {
        const defaultChapterIndex = getDefaultChapterIndex(book.chapters);
        queuePageAnchorRequest({
          chapterIndex: defaultChapterIndex,
          kind: 'start',
        });
      }

      initialRestoreRef.current = false;
      return;
    }

    if (book.last_read_position != null) {
      const firstChapter = book.chapters[0];
      if (firstChapter && book.last_read_position < firstChapter.position_start) {
        setCurrentChapterIndex(0);
        initialRestoreRef.current = false;
        return;
      }
      const chapterIndex = book.chapters.findIndex(
        (chapter: Chapter) => book.last_read_position >= chapter.position_start &&
          (!chapter.position_end || book.last_read_position < chapter.position_end)
      );
      if (chapterIndex >= 0) {
        setCurrentChapterIndex(chapterIndex);
        initialRestoreRef.current = false;
        return;
      }
    }

    const firstContentChapter = getDefaultChapterIndex(book.chapters);
    if (firstContentChapter > 0) {
      setCurrentChapterIndex(firstContentChapter);
    }
    initialRestoreRef.current = false;
  }, [book?.chapters, book?.last_read_position, isPageMode, queuePageAnchorRequest]);

  const handleScroll = useCallback(() => {
    const scrollContainer = scrollContainerRef.current;
    const contentColumn = contentColumnRef.current;
    if (!scrollContainer || !contentColumn || !isScrollMode) return;

    const contentTop = contentColumn.offsetTop;
    const contentHeight = contentColumn.offsetHeight;
    const visibleStart = scrollContainer.scrollTop;
    const effectiveHeight = contentHeight - scrollContainer.clientHeight;
    const progress = effectiveHeight > 0
      ? Math.round(Math.max(0, Math.min(100, ((visibleStart - contentTop) / effectiveHeight) * 100)))
      : 0;
    setChapterProgress(progress);

    if (progressSaveTimeoutRef.current) {
      window.clearTimeout(progressSaveTimeoutRef.current);
    }
    progressSaveTimeoutRef.current = window.setTimeout(() => {
      const block = chapterBlocks[0];
      if (!block || !bookId) return;
      const chapterTextRatio = block.text.length > 0
        ? Math.min(progress / 100, 1)
        : 0;
      const scrollOffset = Math.round(chapterTextRatio * block.text.length);
      booksApi.updateProgress(bookId, {
        position: block.startOffset + scrollOffset,
        chapter: block.title,
      });
    }, 3000);
  }, [bookId, chapterBlocks, isScrollMode]);

  useEffect(() => {
    if (!isScrollMode || !scrollContainerRef.current || !contentColumnRef.current) return;

    const block = chapterBlocks[0];
    if (!block) return;

    const scrollContainer = scrollContainerRef.current;
    const contentColumn = contentColumnRef.current;

    if (searchTargetOffsetRef.current != null && block.text.length > 0) {
      const offsetInByte = searchTargetOffsetRef.current - block.startOffset;
      const charIndex = byteOffsetToCharIndex(block.text, offsetInByte);
      const progress = Math.max(0, Math.min(1, charIndex / block.text.length));
      const contentHeight = contentColumn.offsetHeight;
      const targetScroll = contentColumn.offsetTop + progress * Math.max(0, contentHeight - scrollContainer.clientHeight);
      scrollContainer.scrollTop = targetScroll;
      searchTargetOffsetRef.current = null;
    } else if (initialRestoreRef.current && book?.last_read_position != null && book?.chapters?.length) {
      const offsetInByte = book.last_read_position - block.startOffset;
      if (offsetInByte >= 0 && block.text.length > 0) {
        const charIndex = byteOffsetToCharIndex(block.text, offsetInByte);
        const progress = charIndex / block.text.length;
        const contentHeight = contentColumn.offsetHeight;
        const targetScroll = contentColumn.offsetTop + progress * Math.max(0, contentHeight - scrollContainer.clientHeight);
        scrollContainer.scrollTop = targetScroll;
      }
      initialRestoreRef.current = false;
    } else {
      scrollContainer.scrollTop = 0;
    }
  }, [book?.chapters?.length, book?.last_read_position, chapterBlocks, currentChapterIndex, isScrollMode]);

  useEffect(() => {
    if (!isPageMode || !bookId || !currentPage || !currentPageChapter) {
      return undefined;
    }

    if (progressSaveTimeoutRef.current) {
      window.clearTimeout(progressSaveTimeoutRef.current);
    }

    progressSaveTimeoutRef.current = window.setTimeout(() => {
      const chapterLocalByteOffset = charIndexToByteOffset(currentPageChapterText, anchorOffset);
      const absoluteByteOffset = currentPageChapter.position_start + chapterLocalByteOffset;

      booksApi.updateProgress(bookId, {
        position: absoluteByteOffset,
        chapter: getChapterTitle(currentPageChapter, currentChapterIndex),
      });
    }, 3000);

    return () => {
      if (progressSaveTimeoutRef.current) {
        window.clearTimeout(progressSaveTimeoutRef.current);
      }
    };
  }, [
    anchorOffset,
    bookId,
    currentChapterIndex,
    currentPage,
    currentPageChapter,
    currentPageChapterText,
    isPageMode,
  ]);

  useEffect(() => {
    return () => {
      if (progressSaveTimeoutRef.current) {
        window.clearTimeout(progressSaveTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isPageMode) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isEditable = target instanceof HTMLElement && (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      );

      if (event.key === 'Escape') {
        if (showToolbar) {
          event.preventDefault();
          setShowToolbar(false);
        }
        return;
      }

      if (isEditable) {
        return;
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        handlePagePrev();
      } else if (event.key === 'ArrowRight' || event.key === ' ') {
        event.preventDefault();
        handlePageNext();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handlePageNext, handlePagePrev, isPageMode, showToolbar]);

  const handlePointerDown = () => {
    if (scrollContainerRef.current) {
      lastScrollTopRef.current = scrollContainerRef.current.scrollTop;
    }
  };

  const handlePointerUp = (event: React.MouseEvent | React.TouchEvent) => {
    if (!isScrollMode) return;

    const currentScrollTop = scrollContainerRef.current?.scrollTop ?? lastScrollTopRef.current;
    if (Math.abs(currentScrollTop - lastScrollTopRef.current) > 5) {
      return;
    }

    const clientX = 'changedTouches' in event ? event.changedTouches[0].clientX : event.clientX;
    const screenWidth = window.innerWidth;
    if (clientX >= screenWidth * 0.4 && clientX <= screenWidth * 0.6) {
      setShowToolbar((previous) => !previous);
    }
  };

  const goToPrevChapter = () => {
    if (currentChapterIndex > 0) {
      setCurrentChapterIndex(currentChapterIndex - 1);
    }
  };

  const goToNextChapter = () => {
    if (currentChapterIndex < (book?.chapters?.length || 1) - 1) {
      setCurrentChapterIndex(currentChapterIndex + 1);
    }
  };

  const handleChapterClick = (chapter: Chapter) => {
    const chapterIndex = book?.chapters?.findIndex((candidate: Chapter) => candidate.id === chapter.id) ?? 0;
    const nextChapterIndex = chapterIndex >= 0 ? chapterIndex : 0;

    if (isPageMode) {
      queuePageAnchorRequest({
        chapterIndex: nextChapterIndex,
        kind: 'start',
      });
      return;
    }

    setCurrentChapterIndex(nextChapterIndex);
  };

  const handleSearchResultClick = (offset: number, query: string) => {
    setHighlightQuery(query);

    if (!book?.chapters?.length) {
      return;
    }

    const targetChapterIndex = getChapterArrayIndexForOffset(book.chapters, offset);
    const targetChapter = book.chapters[targetChapterIndex];

    if (isPageMode) {
      queuePageAnchorRequest({
        chapterIndex: targetChapterIndex,
        kind: 'byte',
        value: Math.max(0, offset - (targetChapter?.position_start || 0)),
      });
      return;
    }

    searchTargetOffsetRef.current = offset;
    setCurrentChapterIndex(targetChapterIndex);
  };

  if (!book) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--bg-color)' }}>
        <div className="text-lg">加载中...</div>
      </div>
    );
  }

  const currentBlock = chapterBlocks[0];
  const currentChapterTitle = isPageMode
    ? getChapterTitle(currentPageChapter, currentChapterIndex)
    : (currentBlock?.title || '');

  const pageContent = currentPageChapterError ? (
    <div className="h-full flex items-center justify-center px-6 text-center">
      <div className="space-y-4">
        <p className="text-base font-medium">当前章节加载失败</p>
        <p className="text-sm text-gray-500 dark:text-gray-400">{currentPageChapterError}</p>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={handlePagePrev}
            disabled={currentChapterIndex === 0}
            className="px-4 py-2 rounded-lg text-sm bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            ← 上一章
          </button>
          <button
            onClick={handlePageNext}
            disabled={currentChapterIndex >= (book.chapters?.length || 1) - 1}
            className="px-4 py-2 rounded-lg text-sm bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            下一章 →
          </button>
        </div>
      </div>
    </div>
  ) : currentPage ? (
    <PageContent page={currentPage} highlight={highlightQuery} />
  ) : (
    <div className="h-full flex items-center justify-center">
      <div className="text-lg">{isCurrentPageChapterLoading ? '加载中...' : '暂无分页内容'}</div>
    </div>
  );
  const canPagePrev = currentPageIndex > 0 || currentChapterIndex > 0;
  const canPageNext =
    (currentPageIndex >= 0 && currentPageIndex < chapterPages.length - 1) ||
    currentChapterIndex < (book.chapters?.length || 0) - 1;

  return (
    <ThemeProvider>
      {isEnabled && !token && !authLoading && <LoginOverlay />}
      <div
        className={`h-screen flex flex-col ${isScrollMode ? 'overflow-y-auto' : 'overflow-hidden'}`}
        style={{ backgroundColor: 'var(--bg-color-side)', color: 'var(--text-color)' }}
        ref={scrollContainerRef}
        onScroll={handleScroll}
        onMouseDown={handlePointerDown}
        onMouseUp={handlePointerUp}
        onTouchStart={handlePointerDown}
        onTouchEnd={handlePointerUp}
      >
        <Toolbar
          currentPage={isPageMode ? currentPageIndex : 0}
          totalPages={isPageMode ? chapterPages.length : 1}
          canPrev={isPageMode ? canPagePrev : undefined}
          canNext={isPageMode ? canPageNext : undefined}
          chapters={book.chapters || []}
          onPrev={handlePagePrev}
          onNext={handlePageNext}
          onChapterClick={handleChapterClick}
          show={showToolbar}
          bookTitle={book.title}
          currentChapterTitle={currentChapterTitle}
          bookId={bookId}
          onSearchResultClick={handleSearchResultClick}
        />

        {isPageMode ? (
          <PageReaderShell
            pageContent={pageContent}
            onPrev={handlePagePrev}
            onNext={handlePageNext}
            onToggleToolbar={() => setShowToolbar((previous) => !previous)}
          />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr min(65%, 768px) 1fr', minHeight: '100vh' }}>
            <div style={{ backgroundColor: 'var(--bg-color-side)' }} />
            <div ref={contentColumnRef} className="pt-14 pb-16 px-6" style={{ backgroundColor: 'var(--bg-color)' }}>
              {currentBlock ? (
                <>
                  <TextContent content={currentBlock.text} baseOffset={currentBlock.startOffset} highlight={highlightQuery} />
                  <div className="flex justify-between items-center mt-8 pt-6 pb-4 border-t border-gray-200 dark:border-gray-700">
                    <button
                      onClick={goToPrevChapter}
                      disabled={currentChapterIndex === 0}
                      className="px-4 py-2 rounded-lg text-sm bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      ← 上一章
                    </button>
                    <span className="text-xs text-gray-400">
                      {displayChapterNum} / {displayTotalChapters} · {chapterProgress}%
                    </span>
                    <button
                      onClick={goToNextChapter}
                      disabled={currentChapterIndex >= (book?.chapters?.length || 1) - 1}
                      className="px-4 py-2 rounded-lg text-sm bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      下一章 →
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-center" style={{ minHeight: '50vh' }}>
                  <div className="text-lg">加载中...</div>
                </div>
              )}
            </div>
            <div style={{ backgroundColor: 'var(--bg-color-side)' }} />
          </div>
        )}
      </div>
    </ThemeProvider>
  );
}

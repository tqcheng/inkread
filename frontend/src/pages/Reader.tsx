import { useParams } from 'react-router-dom';
import { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { useBookQuery, useBookContentQuery } from '../hooks/useBooks';
import { useReaderSettings } from '../hooks/useReaderSettings';
import { useTextPagination } from '../hooks/useTextPagination';
import ThemeProvider from '../components/Reader/ThemeProvider';
import { Toolbar } from '../components/Reader/Toolbar';
import { TextContent } from '../components/Reader/TextContent';
import { booksApi } from '../api/books';
import type { Chapter } from '../api/types';

interface ChapterBlock {
  title: string;
  startOffset: number;
  endOffset: number;
  text: string;
}

function sliceChapters(content: string, chapters: Chapter[]): ChapterBlock[] {
  if (!chapters || chapters.length === 0) {
    return [{
      title: '正文',
      startOffset: 0,
      endOffset: content.length,
      text: content,
    }];
  }

  const blocks: ChapterBlock[] = [];
  for (let i = 0; i < chapters.length; i++) {
    const ch = chapters[i];
    const start = Math.min(ch.position_start, content.length);
    const end = ch.position_end != null
      ? Math.min(ch.position_end, content.length)
      : (i + 1 < chapters.length
          ? Math.min(chapters[i + 1].position_start, content.length)
          : content.length);

    if (end > start) {
      blocks.push({
        title: ch.title || `第 ${(ch.chapter_index ?? i) + 1} 章`,
        startOffset: start,
        endOffset: end,
        text: content.slice(start, end),
      });
    }
  }

  return blocks;
}

export default function Reader() {
  const { id } = useParams<{ id: string }>();
  const bookId = id ? parseInt(id) : 0;

  const { data: book } = useBookQuery(bookId);
  const { readingMode } = useReaderSettings();
  const [currentChapterIndex, setCurrentChapterIndex] = useState(0);

  // Scroll mode: fetch single chapter by chapter_index
  const { data: scrollContent } = useBookContentQuery(bookId, 0, 0,
    readingMode === 'scroll' ? currentChapterIndex : undefined
  );
  // Page mode: fetch bulk content by offset
  const { data: pageContent } = useBookContentQuery(bookId, 0, 200000,
    readingMode === 'page' ? undefined : undefined
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const contentColumnRef = useRef<HTMLDivElement>(null);
  const [showToolbar, setShowToolbar] = useState(true);
  const scrollTimeoutRef = useRef<number>();
  const lastScrollTopRef = useRef<number>(0);
  const [chapterProgress, setChapterProgress] = useState(0);
  const initialRestoreRef = useRef(true);

  const { pages, currentPage, totalPages, goToNext, goToPrev, goToOffset } = useTextPagination(
    readingMode === 'page' ? (pageContent?.content || '') : '',
    containerRef
  );

  // Chapter blocks: in scroll mode, single chapter; in page mode, all loaded chapters
  const chapterBlocks = useMemo(() => {
    if (!book) return [];
    if (readingMode === 'scroll') {
      const content = scrollContent?.content || '';
      const ch = book.chapters?.[currentChapterIndex];
      const title = ch?.title || (book.chapters?.length ? `第 ${currentChapterIndex + 1} 章` : '正文');
      return [{
        title,
        startOffset: ch?.position_start || 0,
        endOffset: (ch?.position_start || 0) + content.length,
        text: content,
      }];
    }
    return sliceChapters(pageContent?.content || '', book.chapters || []);
  }, [readingMode, scrollContent?.content, pageContent?.content, book, currentChapterIndex]);

  const displayChapterNum = useMemo(() => {
    if (readingMode !== 'scroll' || !book?.chapters?.length) return null;
    const ch = book.chapters[currentChapterIndex];
    return ch?.chapter_index != null ? ch.chapter_index : currentChapterIndex + 1;
  }, [readingMode, book?.chapters, currentChapterIndex]);

  const displayTotalChapters = useMemo(() => {
    if (readingMode !== 'scroll' || !book?.chapters?.length) return 0;
    const last = book.chapters[book.chapters.length - 1];
    return last?.chapter_index != null ? last.chapter_index : book.chapters.length;
  }, [readingMode, book?.chapters]);

  // Scroll tracking within current chapter and progress save
  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    const contentEl = contentColumnRef.current;
    if (!el || !contentEl || readingMode !== 'scroll') return;

    const contentTop = contentEl.offsetTop;
    const contentHeight = contentEl.offsetHeight;
    const visibleStart = el.scrollTop;
    const effectiveHeight = contentHeight - el.clientHeight;
    const progress = effectiveHeight > 0
      ? Math.round(Math.max(0, Math.min(100, ((visibleStart - contentTop) / effectiveHeight) * 100)))
      : 0;
    setChapterProgress(progress);

    if (scrollTimeoutRef.current) {
      window.clearTimeout(scrollTimeoutRef.current);
    }
    scrollTimeoutRef.current = window.setTimeout(() => {
      const block = chapterBlocks[0];
      if (!block || !bookId) return;
      const chapterTextRatio = block.text.length > 0
        ? Math.min(progress / 100, 1)
        : 0;
      const scrollOffset = Math.round(chapterTextRatio * block.text.length);
      const ch = book?.chapters?.[currentChapterIndex];
      booksApi.updateProgress(bookId, {
        position: (ch?.position_start || 0) + scrollOffset,
        chapter: block.title,
      });
    }, 3000);
  }, [readingMode, bookId, chapterBlocks, currentChapterIndex, book?.chapters]);

  // Restore reading position on first load, skip volume markers if no saved position
  useEffect(() => {
    if (!initialRestoreRef.current || !book?.chapters?.length) return;

    if (readingMode === 'page') {
      goToOffset(book?.last_read_position || 0);
      initialRestoreRef.current = false;
      return;
    }

    if (book?.last_read_position) {
      const idx = book.chapters.findIndex(
        (c: Chapter) => book.last_read_position! >= c.position_start &&
          (!c.position_end || book.last_read_position! < c.position_end)
      );
      if (idx >= 0) {
        setCurrentChapterIndex(idx);
        initialRestoreRef.current = false;
        return;
      }
    }

    // No saved position: jump past volume markers to first real chapter
    const first = book.chapters.findIndex(
      (c: Chapter) => c.position_end != null && c.position_end - c.position_start > 50
    );
    if (first > 0) setCurrentChapterIndex(first);
    initialRestoreRef.current = false;
  }, [book?.last_read_position, book?.chapters, readingMode]);

  // Scroll to saved position on first load, scroll to top on chapter navigation
  useEffect(() => {
    if (readingMode !== 'scroll' || !scrollContainerRef.current || !contentColumnRef.current) return;

    const block = chapterBlocks[0];
    if (!block) return;

    if (initialRestoreRef.current && book?.last_read_position && book?.chapters?.length) {
      const ch = book.chapters[currentChapterIndex];
      if (ch) {
        const offsetInChapter = book.last_read_position - ch.position_start;
        if (offsetInChapter > 0 && block.text.length > 0) {
          const progress = offsetInChapter / block.text.length;
          const contentEl = contentColumnRef.current;
          const contentHeight = contentEl.offsetHeight;
          const el = scrollContainerRef.current;
          const targetScroll = contentEl.offsetTop + progress * Math.max(0, contentHeight - el.clientHeight);
          el.scrollTop = targetScroll;
        }
      }
      initialRestoreRef.current = false;
    } else {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [currentChapterIndex, readingMode, chapterBlocks]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) {
        window.clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  // Click vs scroll discrimination + center-only tap zone in scroll mode
  const handlePointerDown = () => {
    if (scrollContainerRef.current) {
      lastScrollTopRef.current = scrollContainerRef.current.scrollTop;
    }
  };

  const handlePointerUp = (e: React.MouseEvent | React.TouchEvent) => {
    if (readingMode !== 'scroll') return;

    const currentScrollTop = scrollContainerRef.current?.scrollTop ?? lastScrollTopRef.current;
    if (Math.abs(currentScrollTop - lastScrollTopRef.current) > 5) {
      return;
    }

    const clientX = 'changedTouches' in e ? e.changedTouches[0].clientX : e.clientX;
    const screenWidth = window.innerWidth;
    if (clientX >= screenWidth * 0.4 && clientX <= screenWidth * 0.6) {
      setShowToolbar((prev) => !prev);
    }
  };

  const handleContainerClick = (e: React.MouseEvent) => {
    if (readingMode === 'scroll') return;

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const width = rect.width;

    if (x < width * 0.3) {
      goToPrev();
    } else if (x > width * 0.7) {
      goToNext();
    } else {
      setShowToolbar((prev) => !prev);
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
    if (readingMode === 'page') {
      goToOffset(chapter.position_start);
    } else {
      const idx = book?.chapters?.findIndex((c: Chapter) => c.position_start === chapter.position_start) ?? 0;
      setCurrentChapterIndex(idx >= 0 ? idx : 0);
    }
  };

  if (!book) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--bg-color)' }}>
        <div className="text-lg">加载中...</div>
      </div>
    );
  }

  const currentBlock = chapterBlocks[0];
  const currentChapterTitle = currentBlock?.title || '';

  return (
    <ThemeProvider>
      <div className={`h-screen flex flex-col ${readingMode === 'scroll' ? 'overflow-y-auto' : 'overflow-hidden'}`}
        style={{ backgroundColor: 'var(--bg-color-side)', color: 'var(--text-color)' }}
        ref={scrollContainerRef}
        onScroll={handleScroll}
        onMouseDown={handlePointerDown}
        onMouseUp={handlePointerUp}
        onTouchStart={handlePointerDown}
        onTouchEnd={handlePointerUp}
      >
        <Toolbar
          currentPage={currentPage}
          totalPages={totalPages}
          chapters={book.chapters || []}
          onPrev={goToPrev}
          onNext={goToNext}
          onChapterClick={handleChapterClick}
          show={showToolbar}
          bookTitle={book.title}
          currentChapterTitle={currentChapterTitle}
        />

        {readingMode === 'page' ? (
          <div
            ref={containerRef}
            className="flex-1 flex items-center justify-center pt-14 pb-16 px-6 w-[65%] max-w-3xl mx-auto"
            onClick={handleContainerClick}
            style={{ overflow: 'hidden' }}
          >
            {pages.length > 0 && (
              <TextContent content={pages[currentPage].content} />
            )}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr min(65%, 768px) 1fr', minHeight: '100vh' }}>
            <div style={{ backgroundColor: 'var(--bg-color-side)' }} />
            <div ref={contentColumnRef} className="pt-14 pb-16 px-6" style={{ backgroundColor: 'var(--bg-color)' }}>
              {currentBlock ? (
                <>
                  <TextContent content={currentBlock.text} baseOffset={currentBlock.startOffset} />
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

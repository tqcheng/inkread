import { useState, useEffect, useRef, useCallback } from 'react';
import { useReaderSettings } from './useReaderSettings';

export interface Page {
  startOffset: number;
  endOffset: number;
  content: string;
}

interface PaginationConfig {
  containerHeight: number;
  fontSize: number;
  lineHeight: number;
  paddingY: number;
}

function calculatePages(text: string, config: PaginationConfig): Page[] {
  const availableHeight = config.containerHeight - config.paddingY * 2;
  const lineHeightPx = config.fontSize * config.lineHeight;
  const linesPerPage = Math.floor(availableHeight / lineHeightPx);
  const charsPerPage = linesPerPage * 25 * 0.9;

  const paragraphs = text.split(/\n\s*\n/);
  const pages: Page[] = [];
  let currentPage = '';
  let currentOffset = 0;
  let pageStartOffset = 0;

  for (const para of paragraphs) {
    if (currentPage.length + para.length > charsPerPage && currentPage.length > 0) {
      pages.push({
        startOffset: pageStartOffset,
        endOffset: currentOffset,
        content: currentPage.trim()
      });
      pageStartOffset = currentOffset;
      currentPage = '';
    }
    currentPage += para + '\n\n';
    currentOffset += para.length + 2;
  }

  if (currentPage.length > 0) {
    pages.push({
      startOffset: pageStartOffset,
      endOffset: currentOffset,
      content: currentPage.trim()
    });
  }

  return pages;
}

export function useTextPagination(text: string, containerRef: React.RefObject<HTMLElement>) {
  const { fontSize, lineHeight } = useReaderSettings();
  const [pages, setPages] = useState<Page[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [currentOffset, setCurrentOffset] = useState(0);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const lastOffsetRef = useRef(0);

  const updatePages = useCallback(() => {
    if (!containerRef.current || !text) return;

    const config: PaginationConfig = {
      containerHeight: containerRef.current.clientHeight,
      fontSize,
      lineHeight,
      paddingY: 32,
    };

    const newPages = calculatePages(text, config);
    setPages(newPages);

    if (lastOffsetRef.current > 0) {
      const pageIndex = newPages.findIndex(
        page => lastOffsetRef.current >= page.startOffset && lastOffsetRef.current < page.endOffset
      );
      if (pageIndex >= 0) {
        setCurrentPage(pageIndex);
      }
    }
  }, [text, fontSize, lineHeight, containerRef]);

  useEffect(() => {
    if (!containerRef.current) return;

    const ro = new ResizeObserver(() => {
      updatePages();
    });
    ro.observe(containerRef.current);
    resizeObserverRef.current = ro;

    return () => {
      ro.disconnect();
    };
  }, [updatePages]);

  useEffect(() => {
    if (!containerRef.current) {
      const timer = setTimeout(() => updatePages(), 100);
      return () => clearTimeout(timer);
    }
    updatePages();
  }, [updatePages]);

  const goToPage = useCallback((page: number) => {
    if (page >= 0 && page < pages.length) {
      setCurrentPage(page);
      const offset = pages[page].startOffset;
      setCurrentOffset(offset);
      lastOffsetRef.current = offset;
    }
  }, [pages]);

  const goToNext = useCallback(() => {
    goToPage(currentPage + 1);
  }, [currentPage, goToPage]);

  const goToPrev = useCallback(() => {
    goToPage(currentPage - 1);
  }, [currentPage, goToPage]);

  const goToOffset = useCallback((offset: number) => {
    setCurrentOffset(offset);
    lastOffsetRef.current = offset;
    const pageIndex = pages.findIndex(
      page => offset >= page.startOffset && offset < page.endOffset
    );
    if (pageIndex >= 0) {
      setCurrentPage(pageIndex);
    }
  }, [pages]);

  useEffect(() => {
    if (pages.length > 0 && currentPage >= 0 && currentPage < pages.length) {
      const offset = pages[currentPage].startOffset;
      setCurrentOffset(offset);
      lastOffsetRef.current = offset;
    }
  }, [currentPage, pages]);

  return {
    pages,
    currentPage,
    setCurrentPage: goToPage,
    totalPages: pages.length,
    goToPage,
    goToNext,
    goToPrev,
    goToOffset,
    currentOffset,
  };
}

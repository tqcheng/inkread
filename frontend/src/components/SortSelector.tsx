import { ArrowDownAZ, ArrowUpAZ } from 'lucide-react';
import { SORT_OPTIONS } from '../utils';

interface SortSelectorProps {
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  onSortChange: (sortBy: string, sortOrder: 'asc' | 'desc') => void;
  currentPage?: number;
  totalPages?: number;
  onPageChange?: (page: number) => void;
}

export default function SortSelector({
  sortBy,
  sortOrder,
  onSortChange,
  currentPage = 1,
  totalPages = 1,
  onPageChange,
}: SortSelectorProps) {
  const pageOptions = Array.from({ length: totalPages }, (_, index) => index + 1);

  return (
    <div className="flex items-center gap-2">
      {totalPages > 1 && onPageChange && (
        <select
          aria-label="跳转到结果页"
          value={currentPage}
          onChange={(e) => onPageChange(Number(e.target.value))}
          className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {pageOptions.map((page) => (
            <option key={page} value={page}>
              第 {page} 页
            </option>
          ))}
        </select>
      )}
      <select
        value={sortBy}
        onChange={(e) => onSortChange(e.target.value, sortOrder)}
        className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {SORT_OPTIONS.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
      <button
        onClick={() => onSortChange(sortBy, sortOrder === 'asc' ? 'desc' : 'asc')}
        aria-label={sortOrder === 'asc' ? '切换为降序排序' : '切换为升序排序'}
        className="p-2 bg-white border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {sortOrder === 'asc' ? <ArrowUpAZ className="w-5 h-5" /> : <ArrowDownAZ className="w-5 h-5" />}
      </button>
    </div>
  );
}

import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useBooksQuery, useToggleFavoriteMutation } from '../hooks/useBooks';
import { useUIStore } from '../store/useUIStore';
import { useAdminStore } from '../hooks/useAdmin';
import { adminApi } from '../api/admin';
import { useQueryClient } from '@tanstack/react-query';
import { Settings } from 'lucide-react';
import SearchBar from '../components/SearchBar';
import TagFilter from '../components/TagFilter';
import ViewToggle from '../components/ViewToggle';
import SortSelector from '../components/SortSelector';
import BookCard from '../components/BookCard';
import Pagination from '../components/Pagination';
import AdminBar from '../components/AdminBar';

export default function Home() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [showFavoriteOnly, setShowFavoriteOnly] = useState(false);

  const { viewMode, isAdminMode, selectedBooks, sortBy, sortOrder } = useUIStore();
  const actions = useUIStore((state) => state.actions);

  const { data, isLoading, error } = useBooksQuery({
    search: search || undefined,
    category: selectedCategories.length === 1 ? selectedCategories[0] : undefined,
    sort: sortBy,
    order: sortOrder,
    page,
    page_size: 20,
    is_favorite: showFavoriteOnly ? true : undefined,
  });

  const queryClient = useQueryClient();
  const { disableAdminMode } = useAdminStore();

  const toggleFavoriteMutation = useToggleFavoriteMutation();

  const handleSearch = useCallback((query: string) => {
    setSearch(query);
    setPage(1);
  }, []);

  const handleToggleCategory = useCallback((category: string) => {
    if (category === '') {
      setSelectedCategories([]);
      setShowFavoriteOnly(false);
    } else {
      setShowFavoriteOnly(false);
      if (selectedCategories.includes(category)) {
        setSelectedCategories([]);
      } else {
        setSelectedCategories([category]);
      }
    }
    setPage(1);
  }, [selectedCategories]);

  const handleToggleFavoriteFilter = useCallback(() => {
    setSelectedCategories([]);
    setShowFavoriteOnly(prev => !prev);
    setPage(1);
  }, []);

  const handleSortChange = useCallback((newSortBy: string, newSortOrder: 'asc' | 'desc') => {
    actions.setSort(newSortBy, newSortOrder);
    setPage(1);
  }, [actions]);

  const handleToggleBookFavorite = useCallback((book: any) => {
    toggleFavoriteMutation.mutate({ id: book.id, isFavorite: !book.is_favorite });
  }, [toggleFavoriteMutation]);

  const handleBatchDelete = useCallback(async () => {
    try {
      await adminApi.batchDelete(Array.from(selectedBooks));
      actions.clearSelection();
      disableAdminMode();
      queryClient.invalidateQueries({ queryKey: ['books'] });
    } catch (error) {
      console.error('Batch delete failed:', error);
    }
  }, [selectedBooks, actions, disableAdminMode, queryClient]);

  const handleBookSelect = useCallback((bookId: number) => {
    if (isAdminMode) {
      actions.toggleBookSelection(bookId);
    }
  }, [isAdminMode, actions]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-bold text-gray-800">📚 InkRead</h1>
            <div className="flex items-center gap-2">
              <button
                onClick={actions.toggleAdminMode}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isAdminMode
                    ? 'bg-red-500 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {isAdminMode ? '退出管理' : '管理'}
              </button>
              <Link
                to="/admin"
                className="p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
                title="管理界面"
              >
                <Settings className="w-5 h-5" />
              </Link>
            </div>
          </div>

          {/* Search Bar */}
          <SearchBar onSearch={handleSearch} className="mb-4" />

          {/* Filters Row */}
          <div className="flex items-center justify-between gap-4">
            <TagFilter
              selectedCategories={selectedCategories}
              onToggleCategory={handleToggleCategory}
              showFavorite={true}
              isFavoriteSelected={showFavoriteOnly}
              onToggleFavorite={handleToggleFavoriteFilter}
            />
            <ViewToggle
              viewMode={viewMode}
              onViewModeChange={actions.setViewMode}
            />
          </div>

          {/* Sort Row */}
          <div className="flex items-center justify-between mt-4">
            <div className="text-sm text-gray-500">
              {data?.total ?? 0} 本书籍
            </div>
            <SortSelector
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSortChange={handleSortChange}
            />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-gray-500">加载中...</div>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-red-500">加载失败: {error.message}</div>
          </div>
        ) : data?.items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64">
            <div className="text-6xl mb-4">📖</div>
            <div className="text-gray-500 text-lg">暂无书籍</div>
            <div className="text-gray-400 text-sm mt-2">
              点击右侧菜单扫描文件夹添加书籍
            </div>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {data?.items.map((book) => (
              <BookCard
                key={book.id}
                book={book}
                viewMode="grid"
                isSelected={selectedBooks.has(book.id)}
                onSelect={handleBookSelect}
                onToggleFavorite={handleToggleBookFavorite}
                showCheckbox={isAdminMode}
              />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {data?.items.map((book) => (
              <BookCard
                key={book.id}
                book={book}
                viewMode="list"
                isSelected={selectedBooks.has(book.id)}
                onSelect={handleBookSelect}
                onToggleFavorite={handleToggleBookFavorite}
                showCheckbox={isAdminMode}
              />
            ))}
          </div>
        )}

        {/* Pagination */}
        {data && data.pages > 1 && (
          <Pagination
            currentPage={page}
            totalPages={data.pages}
            onPageChange={setPage}
          />
        )}
      </main>

      {/* Admin Bar */}
      <AdminBar
        selectedCount={selectedBooks.size}
        onClearSelection={actions.clearSelection}
        onBatchDelete={handleBatchDelete}
        expectedAdminKey="changeme"
      />
    </div>
  );
}

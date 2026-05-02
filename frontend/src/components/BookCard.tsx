import { Star, Check, MoreHorizontal } from 'lucide-react';
import { Book } from '../api/types';
import { cn, getGradientColors, formatFileSize, formatDate, CATEGORIES } from '../utils';
import { useNavigate } from 'react-router-dom';

interface BookCardProps {
  book: Book;
  viewMode: 'grid' | 'list';
  onSelect?: (bookId: number) => void;
  isSelected?: boolean;
  onToggleFavorite?: (book: Book) => void;
  showCheckbox?: boolean;
}

export default function BookCard({
  book,
  viewMode,
  onSelect,
  isSelected,
  onToggleFavorite,
  showCheckbox,
}: BookCardProps) {
  const navigate = useNavigate();
  const category = CATEGORIES.find(c => c.id === book.category);
  const hasLowConfidence = (book.category_confidence ?? 1) < 0.7;

  const handleCardClick = () => {
    if (showCheckbox && onSelect) {
      onSelect(book.id);
    } else {
      navigate(`/reader/${book.id}`);
    }
  };

  const handleFavoriteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleFavorite?.(book);
  };

  if (viewMode === 'list') {
    return (
      <div
        onClick={handleCardClick}
        className={cn(
          'flex items-center gap-4 p-4 bg-white rounded-xl border-2 cursor-pointer transition-all',
          isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-100 hover:border-gray-200 hover:shadow-sm',
          hasLowConfidence && !isSelected && 'border-yellow-200'
        )}
      >
        {showCheckbox && (
          <div
            onClick={(e) => {
              e.stopPropagation();
              onSelect?.(book.id);
            }}
            className={cn(
              'w-7 h-7 rounded-full border-2 flex items-center justify-center transition-colors flex-shrink-0',
              isSelected
                ? 'bg-blue-500 border-blue-500'
                : 'bg-white/90 border-gray-300 hover:border-blue-400'
            )}
          >
            {isSelected && <Check className="w-5 h-5 text-white" />}
          </div>
        )}
        <div
          className="w-16 h-20 rounded-lg flex-shrink-0 flex items-center justify-center text-white font-bold text-xl"
          style={{ background: getGradientColors(book.title) }}
        >
          {book.title.charAt(0)}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-800 truncate">{book.title}</h3>
          <p className="text-sm text-gray-500 truncate">{book.filename}</p>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-xs text-gray-400">{formatFileSize(book.file_size ?? 0)}</span>
            <span className="text-xs text-gray-400">{formatDate(book.created_at)}</span>
            {book.tags_source && (
              <span className={cn(
                'px-2 py-0.5 rounded-full text-xs',
                book.tags_source === 'ai' ? 'bg-purple-100 text-purple-700' :
                book.tags_source === 'manual' ? 'bg-blue-100 text-blue-700' :
                'bg-gray-100 text-gray-600'
              )}>
                {book.tags_source === 'ai' ? 'AI' : book.tags_source === 'manual' ? '手动' : '文件名'}
              </span>
            )}
          </div>
        </div>
        <button
          onClick={handleFavoriteClick}
          className="p-2 text-gray-400 hover:text-yellow-500 transition-colors"
        >
          <Star className={cn('w-5 h-5', book.is_favorite && 'fill-yellow-400 text-yellow-400')} />
        </button>
        <button className="p-2 text-gray-400 hover:text-gray-600">
          <MoreHorizontal className="w-5 h-5" />
        </button>
      </div>
    );
  }

  return (
    <div
      onClick={handleCardClick}
      className={cn(
        'bg-white rounded-2xl border-2 overflow-hidden cursor-pointer transition-all group',
        isSelected ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-100 hover:border-gray-200 hover:shadow-md',
        hasLowConfidence && !isSelected && 'border-yellow-200'
      )}
    >
      <div className="relative">
        <div
          className="aspect-[3/4] flex items-center justify-center text-white font-bold text-4xl"
          style={{ background: getGradientColors(book.title) }}
        >
          {book.title.charAt(0)}
        </div>
        <button
          onClick={handleFavoriteClick}
          className="absolute top-2 right-2 p-2 bg-white/90 rounded-full shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <Star className={cn('w-5 h-5', book.is_favorite ? 'fill-yellow-400 text-yellow-400' : 'text-gray-400')} />
        </button>
        {hasLowConfidence && (
          <div className="absolute top-2 left-2 px-2 py-1 bg-yellow-400 text-yellow-900 text-xs font-semibold rounded-full">
            低置信度
          </div>
        )}
        {showCheckbox && (
          <div
            className="absolute bottom-3 left-3 z-10"
            onClick={(e) => {
              e.stopPropagation();
              onSelect?.(book.id);
            }}
          >
            <div
              className={cn(
                'w-7 h-7 rounded-full border-2 flex items-center justify-center transition-colors shadow-md',
                isSelected
                  ? 'bg-blue-500 border-blue-500'
                  : 'bg-white/90 border-gray-300 hover:border-blue-400'
              )}
            >
              {isSelected && <Check className="w-5 h-5 text-white" />}
            </div>
          </div>
        )}
      </div>
      <div className="p-4">
        <h3 className="font-semibold text-gray-800 truncate mb-2">{book.title}</h3>
        <div className="flex items-center gap-2 flex-wrap">
          {category && (
            <span className={cn('px-2 py-0.5 rounded-full text-xs text-white', category.color)}>
              {category.label}
            </span>
          )}
          {book.tags?.slice(0, 2).map((tag) => (
            <span key={tag} className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-xs">
              {tag}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
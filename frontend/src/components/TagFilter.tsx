import { Star } from 'lucide-react';
import { CATEGORIES, cn } from '../utils';

interface TagFilterProps {
  selectedCategories: string[];
  onToggleCategory: (category: string) => void;
  showFavorite?: boolean;
  isFavoriteSelected?: boolean;
  onToggleFavorite?: () => void;
}

export default function TagFilter({
  selectedCategories,
  onToggleCategory,
  showFavorite = false,
  isFavoriteSelected = false,
  onToggleFavorite,
}: TagFilterProps) {
  return (
    <div className="w-full overflow-x-auto pb-2">
      <div className="flex gap-2 min-w-max">
        {/* All button */}
        <button
          onClick={() => onToggleCategory('')}
          className={cn(
            'px-4 py-2 rounded-full text-sm font-medium transition-all duration-200',
            'border-2',
            selectedCategories.length === 0 && !isFavoriteSelected
              ? 'bg-gray-800 text-white border-transparent shadow-md'
              : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
          )}
        >
          全部
        </button>

        {/* Category buttons */}
        {CATEGORIES.map((category) => {
          const isSelected = selectedCategories.includes(category.id);
          return (
            <button
              key={category.id}
              onClick={() => onToggleCategory(category.id)}
              className={cn(
                'px-4 py-2 rounded-full text-sm font-medium transition-all duration-200',
                'border-2',
                isSelected
                  ? `${category.color} text-white border-transparent shadow-md`
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
              )}
            >
              {category.label}
            </button>
          );
        })}

        {/* Favorite button */}
        {showFavorite && onToggleFavorite && (
          <button
            onClick={onToggleFavorite}
            className={cn(
              'px-4 py-2 rounded-full text-sm font-medium transition-all duration-200',
              'border-2 flex items-center gap-1',
              isFavoriteSelected
                ? 'bg-yellow-400 text-yellow-900 border-transparent shadow-md'
                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
            )}
          >
            <Star className={cn('w-4 h-4', isFavoriteSelected && 'fill-yellow-400')} />
            收藏
          </button>
        )}
      </div>
    </div>
  );
}
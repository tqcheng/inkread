import { Grid, List } from 'lucide-react';
import { cn } from '../utils';

interface ViewToggleProps {
  viewMode: 'grid' | 'list';
  onViewModeChange: (mode: 'grid' | 'list') => void;
}

export default function ViewToggle({ viewMode, onViewModeChange }: ViewToggleProps) {
  return (
    <div className="flex bg-white border border-gray-200 rounded-lg p-1">
      <button
        onClick={() => onViewModeChange('grid')}
        className={cn(
          'p-2 rounded-md transition-all',
          viewMode === 'grid'
            ? 'bg-blue-500 text-white shadow-sm'
            : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
        )}
      >
        <Grid className="w-5 h-5" />
      </button>
      <button
        onClick={() => onViewModeChange('list')}
        className={cn(
          'p-2 rounded-md transition-all',
          viewMode === 'list'
            ? 'bg-blue-500 text-white shadow-sm'
            : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
        )}
      >
        <List className="w-5 h-5" />
      </button>
    </div>
  );
}
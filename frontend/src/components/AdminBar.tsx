import { Trash2 } from 'lucide-react';
import { useState } from 'react';

interface AdminBarProps {
  selectedCount: number;
  onClearSelection: () => void;
  onBatchDelete: () => Promise<void> | void;
}

export default function AdminBar({
  selectedCount,
  onClearSelection,
  onBatchDelete,
}: AdminBarProps) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await onBatchDelete();
      setShowConfirm(false);
    } catch (error) {
      console.error('Batch delete failed:', error);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCancel = () => {
    setShowConfirm(false);
  };

  if (selectedCount === 0) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
      <div className="bg-gray-900 text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-4">
        <span className="font-medium">已选择 {selectedCount} 本书籍</span>
        <button
          onClick={onClearSelection}
          className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition-colors"
        >
          取消选择
        </button>
        {showConfirm ? (
          <div className="flex items-center gap-3">
            <div className="text-sm">
              <div className="font-medium">确认删除选中的书籍记录？</div>
              <div className="text-gray-300">此操作只会删除数据库记录，不会删除原始源文件。</div>
            </div>
            <button
              onClick={handleDelete}
              disabled={isDeleting}
              className="px-4 py-2 bg-red-600 hover:bg-red-500 rounded-lg text-sm transition-colors disabled:opacity-50"
            >
              确认删除
            </button>
            <button
              onClick={handleCancel}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition-colors"
            >
              取消
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowConfirm(true)}
            className="px-4 py-2 bg-red-600 hover:bg-red-500 rounded-lg text-sm transition-colors flex items-center gap-2"
          >
            <Trash2 className="w-4 h-4" />
            批量删除
          </button>
        )}
      </div>
    </div>
  );
}

import { Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import type { BatchDeleteOptions } from '../api/types';

interface AdminBarProps {
  selectedCount: number;
  onClearSelection: () => void;
  onBatchDelete: (options: BatchDeleteOptions) => Promise<void> | void;
}

export default function AdminBar({
  selectedCount,
  onClearSelection,
  onBatchDelete,
}: AdminBarProps) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteSourceFiles, setDeleteSourceFiles] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  useEffect(() => {
    if (selectedCount === 0) {
      setDeleteError('');
      setDeleteSourceFiles(false);
      setShowConfirm(false);
    }
  }, [selectedCount]);

  const handleDelete = async () => {
    setIsDeleting(true);
    setDeleteError('');
    try {
      await onBatchDelete({ deleteSourceFiles });
      setDeleteError('');
      setDeleteSourceFiles(false);
      setShowConfirm(false);
    } catch (error) {
      console.error('Batch delete failed:', error);
      setDeleteError('删除失败，请重试。');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCancel = () => {
    setDeleteError('');
    setDeleteSourceFiles(false);
    setShowConfirm(false);
  };

  const handleOpenConfirm = () => {
    setDeleteError('');
    setShowConfirm(true);
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
              <label className="mt-2 flex items-center gap-2 text-gray-200">
                <input
                  type="checkbox"
                  checked={deleteSourceFiles}
                  onChange={(event) => setDeleteSourceFiles(event.target.checked)}
                  className="h-4 w-4 rounded border-gray-500 bg-gray-800"
                />
                同时删除原始文件
              </label>
              <div className="text-gray-300">
                {deleteSourceFiles
                  ? '只有原始文件删除成功的书籍才会从数据库中移除。失败的书籍会保留。'
                  : '此操作只会删除数据库记录，不会删除原始源文件。'}
              </div>
              {deleteError && (
                <div className="mt-2 text-red-300" role="alert">{deleteError}</div>
              )}
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
            onClick={handleOpenConfirm}
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

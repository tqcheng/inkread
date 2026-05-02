import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useAdminActions } from '../hooks/useAdmin';

interface AdminBarProps {
  selectedCount: number;
  onClearSelection: () => void;
  onBatchDelete: () => void;
  expectedAdminKey: string;
}

export default function AdminBar({
  selectedCount,
  onClearSelection,
  onBatchDelete,
  expectedAdminKey,
}: AdminBarProps) {
  const [adminKey, setAdminKey] = useState('');
  const [showInput, setShowInput] = useState(false);
  const [error, setError] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const { validateKey } = useAdminActions();

  const handleDelete = async () => {
    if (validateKey(adminKey, expectedAdminKey)) {
      setIsDeleting(true);
      try {
        onBatchDelete();
        setAdminKey('');
        setShowInput(false);
        setError('');
      } finally {
        setIsDeleting(false);
      }
    } else {
      setError('密钥错误');
    }
  };

  const handleCancel = () => {
    setShowInput(false);
    setAdminKey('');
    setError('');
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
        {showInput ? (
          <div className="flex items-center gap-2">
            <input
              type="password"
              placeholder="输入 ADMIN_KEY"
              value={adminKey}
              onChange={(e) => setAdminKey(e.target.value)}
              className="px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-sm focus:outline-none focus:border-blue-500"
            />
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
            onClick={() => setShowInput(true)}
            className="px-4 py-2 bg-red-600 hover:bg-red-500 rounded-lg text-sm transition-colors flex items-center gap-2"
          >
            <Trash2 className="w-4 h-4" />
            批量删除
          </button>
        )}
        {error && <span className="text-red-400 text-sm">{error}</span>}
      </div>
    </div>
  );
}

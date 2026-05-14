import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FolderSearch, RefreshCw, CheckCircle, XCircle, Clock, Loader2, Database, AlertTriangle, Trash2 } from 'lucide-react';
import { useScanSummary, useScanStatus, useTriggerScanMutation } from '../hooks/useScan';
import { adminApi } from '../api/admin';
import type { DedupGroup, DedupSummaryResponse } from '../api/types';
import { useAdminStore } from '../hooks/useAdmin';
import { useQueryClient } from '@tanstack/react-query';
import { BOOKS_QUERY_KEY, BOOK_QUERY_KEY } from '../hooks/useBooks';
import SecuritySettingsSection from '../components/SecuritySettingsSection';

const ADMIN_KEY = 'changeme';

export default function Admin() {
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);
  const { data: summary, refetch: refetchSummary } = useScanSummary();
  const { data: currentStatus, isLoading: isStatusLoading } = useScanStatus(currentTaskId);
  const triggerScan = useTriggerScanMutation();
  const queryClient = useQueryClient();
  const validateKey = useAdminStore(state => state.validateKey);

  // Database maintenance state
  const [orphanedCount, setOrphanedCount] = useState<number | null>(null);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [resetPassword, setResetPassword] = useState('');
  const [resetError, setResetError] = useState('');
  const [resetting, setResetting] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [cleanResult, setCleanResult] = useState<string>('');
  const [dedupSummary, setDedupSummary] = useState<DedupSummaryResponse | null>(null);
  const [dedupGroups, setDedupGroups] = useState<DedupGroup[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [selectedKeepByHash, setSelectedKeepByHash] = useState<Record<string, number>>({});
  const [deleteSourceFilesByHash, setDeleteSourceFilesByHash] = useState<Record<string, boolean>>({});
  const [isDedupLoading, setIsDedupLoading] = useState(true);
  const [dedupError, setDedupError] = useState<string | null>(null);

  const loadDedupData = async () => {
    setIsDedupLoading(true);
    setDedupError(null);

    try {
      const [summaryData, groupsData] = await Promise.all([
        adminApi.getDedupSummary(),
        adminApi.getDedupGroups(),
      ]);

      setDedupSummary(summaryData);
      setDedupGroups(groupsData.items);
      setSelectedKeepByHash((prev) => {
        const next: Record<string, number> = {};

        groupsData.items.forEach((group) => {
          const currentSelection = prev[group.content_md5];
          const hasCurrentSelection = group.items.some((item) => item.id === currentSelection);

          next[group.content_md5] = hasCurrentSelection
            ? currentSelection
            : group.recommended_keep_book_id;
        });

        return next;
      });
    } catch {
      setDedupSummary(null);
      setDedupGroups([]);
      setDedupError('重复书籍加载失败，请稍后重试');
    } finally {
      setIsDedupLoading(false);
    }
  };

  // Validate admin key and fetch orphaned books count
  useEffect(() => {
    validateKey(ADMIN_KEY, ADMIN_KEY);
    adminApi.getOrphanedBooksCount().then(data => {
      setOrphanedCount(data.orphaned_books);
    }).catch(() => {});
    loadDedupData().catch(() => {});
  }, [validateKey]);

  const handleCleanup = async () => {
    setCleaning(true);
    setCleanResult('');
    try {
      const result = await adminApi.cleanupOrphanedBooks();
      setCleanResult(`已删除 ${result.deleted} 本孤立书籍`);
      setOrphanedCount(0);
    } catch {
      setCleanResult('清理失败');
    } finally {
      setCleaning(false);
    }
  };

  const handleReset = async () => {
    setResetting(true);
    setResetError('');
    try {
      await adminApi.resetDatabase();
      setShowResetDialog(false);
      setResetPassword('');
      queryClient.invalidateQueries();
    } catch (err: any) {
      setResetError(err?.message || '重置失败');
    } finally {
      setResetting(false);
    }
  };

  const handleScan = async () => {
    try {
      const result = await triggerScan.mutateAsync(undefined);
      setCurrentTaskId(result.task_id);
    } catch (error) {
      console.error('Scan failed:', error);
    }
  };

  const handleResolveGroup = async (group: DedupGroup, mode: 'soft_delete' | 'hard_delete') => {
    const selectedKeepBookId = selectedKeepByHash[group.content_md5];
    const deleteSourceFilesEnabled = deleteSourceFilesByHash[group.content_md5] ?? false;

    if (mode === 'hard_delete' && !deleteSourceFilesEnabled) {
      return;
    }

    const keepBookId = group.items.some((item) => item.id === selectedKeepBookId)
      ? selectedKeepBookId
      : group.items.find((item) => item.id === group.recommended_keep_book_id)?.id;

    if (!keepBookId) {
      return;
    }

    if (selectedKeepBookId !== keepBookId) {
      setSelectedKeepByHash((prev) => ({
        ...prev,
        [group.content_md5]: keepBookId,
      }));
    }

    const deleteBookIds = group.items
      .filter((item) => item.id !== keepBookId)
      .map((item) => item.id);

    if (deleteBookIds.length === 0) {
      return;
    }

    await adminApi.resolveDedupGroup({
      content_md5: group.content_md5,
      keep_book_id: keepBookId,
      delete_book_ids: deleteBookIds,
      mode,
      delete_source_files: deleteSourceFilesEnabled,
    });

    await Promise.all([
      loadDedupData(),
      queryClient.invalidateQueries({ queryKey: BOOKS_QUERY_KEY }),
      queryClient.invalidateQueries({ queryKey: [BOOK_QUERY_KEY] }),
    ]);
  };

  useEffect(() => {
    if (summary?.running && summary.running > 0) {
      refetchSummary();
    }
  }, [currentStatus, summary, refetchSummary]);

  // Invalidate books list when scan completes, so homepage refreshes
  useEffect(() => {
    if (currentStatus?.status === 'completed' || currentStatus?.status === 'failed') {
      queryClient.invalidateQueries({ queryKey: BOOKS_QUERY_KEY });
      loadDedupData().catch(() => {});
    }
  }, [currentStatus?.status, queryClient]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'failed':
        return <XCircle className="w-5 h-5 text-red-500" />;
      case 'running':
      case 'pending':
        return <Clock className="w-5 h-5 text-blue-500" />;
      default:
        return <Clock className="w-5 h-5 text-gray-400" />;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'completed':
        return '完成';
      case 'failed':
        return '失败';
      case 'running':
        return '扫描中';
      case 'pending':
        return '等待中';
      default:
        return status;
    }
  };

  const getProgressPercent = () => {
    if (!currentStatus?.progress) return 0;
    const { current, total } = currentStatus.progress;
    if (total === 0) return 0;
    return Math.round((current / total) * 100);
  };

  const isScanning = currentStatus?.status === 'running' || currentStatus?.status === 'pending';

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-800">📚 InkRead - 管理界面</h1>
            <Link
              to="/"
              className="px-4 py-2 bg-gray-100 text-gray-600 hover:bg-gray-200 rounded-lg text-sm font-medium transition-colors"
            >
              返回阅读
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Scan Section */}
        <section className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <FolderSearch className="w-8 h-8 text-blue-500" />
              <div>
                <h2 className="text-lg font-semibold text-gray-800">📁 扫描文件夹</h2>
                <p className="text-sm text-gray-500">扫描 books 目录导入书籍</p>
              </div>
            </div>
            <button
              onClick={handleScan}
              disabled={triggerScan.isPending || isScanning}
              className={`px-6 py-3 rounded-lg font-medium flex items-center gap-2 transition-colors ${
                triggerScan.isPending || isScanning
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-blue-500 text-white hover:bg-blue-600'
              }`}
            >
              {triggerScan.isPending || isScanning ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  扫描中...
                </>
              ) : (
                <>
                  <RefreshCw className="w-5 h-5" />
                  一键扫描
                </>
              )}
            </button>
          </div>

          {/* Progress Bar */}
          {isScanning && currentStatus && (
            <div className="mt-4">
              <div className="flex items-center justify-between text-sm text-gray-600 mb-2">
                <span>
                  已扫描 {currentStatus.progress.current}/{currentStatus.progress.total} 个文件
                </span>
                <span>{getProgressPercent()}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${getProgressPercent()}%` }}
                />
              </div>
              {currentStatus.result && (
                <div className="mt-2 text-sm text-gray-500">
                  新增书籍: {currentStatus.result.new_books || 0} | 
                  错误: {currentStatus.result.errors || 0}
                </div>
              )}
            </div>
          )}

          {/* Last Scan Result */}
          {currentStatus?.status === 'completed' && (
            <div className="mt-4 p-3 bg-green-50 rounded-lg text-green-700 text-sm">
              ✅ 扫描完成！共扫描 {currentStatus.progress.total} 个文件，新增 {currentStatus.result?.new_books || 0} 本书籍
            </div>
          )}

          {currentStatus?.status === 'failed' && (
            <div className="mt-4 p-3 bg-red-50 rounded-lg text-red-700 text-sm">
              ❌ 扫描失败: {currentStatus.error}
            </div>
          )}
        </section>

        {/* Statistics Section */}
        <section className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">📊 统计信息</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="text-2xl font-bold text-gray-800">
                {(summary?.completed || 0) + (summary?.running || 0) + (summary?.failed || 0)}
              </div>
              <div className="text-sm text-gray-500">总扫描次数</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="text-2xl font-bold text-blue-500">{summary?.running || 0}</div>
              <div className="text-sm text-gray-500">进行中</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="text-2xl font-bold text-green-500">{summary?.completed || 0}</div>
              <div className="text-sm text-gray-500">已完成</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="text-2xl font-bold text-red-500">{summary?.failed || 0}</div>
              <div className="text-sm text-gray-500">失败</div>
            </div>
          </div>
        </section>

        {/* Scan History */}
        <section className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">📋 最近扫描任务</h2>
          {isStatusLoading && currentTaskId ? (
            <div className="flex items-center justify-center py-8 text-gray-500">
              <Loader2 className="w-6 h-6 animate-spin mr-2" />
              加载中...
            </div>
          ) : currentStatus ? (
            <div className="border rounded-lg divide-y">
              <div key={currentStatus.task_id} className="p-4 flex items-center gap-4">
                {getStatusIcon(currentStatus.status)}
                <div className="flex-1">
                  <div className="font-medium text-gray-800">
                    任务 {currentStatus.task_id.slice(0, 8)}...
                  </div>
                  <div className="text-sm text-gray-500">
                    {getStatusText(currentStatus.status)}
                    {currentStatus.progress.total > 0 && ` - ${currentStatus.progress.current}/${currentStatus.progress.total}`}
                  </div>
                </div>
                <div className="text-sm text-gray-400">
                  {currentStatus.completed_at
                    ? new Date(currentStatus.completed_at).toLocaleString('zh-CN')
                    : currentStatus.started_at
                    ? new Date(currentStatus.started_at).toLocaleString('zh-CN')
                    : currentStatus.created_at
                    ? new Date(currentStatus.created_at).toLocaleString('zh-CN')
                    : '-'}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              暂无扫描记录
            </div>
          )}
        </section>

        <section className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">重复书籍</h2>
          {isDedupLoading ? (
            <div className="text-sm text-gray-500" role="status">重复书籍加载中...</div>
          ) : dedupError ? (
            <div className="text-sm text-red-600" role="alert">{dedupError}</div>
          ) : (
            <>
              <p className="text-sm text-gray-500 mb-4">
                重复组 {dedupSummary?.duplicate_groups ?? 0}，重复书籍 {dedupSummary?.duplicate_books ?? 0}，已忽略 {dedupSummary?.ignored_groups ?? 0}
              </p>
              <div className="space-y-4">
                {dedupGroups.length === 0 ? (
                  <div className="text-sm text-gray-500">暂无重复书籍</div>
                ) : (
                  dedupGroups.map((group) => (
                    <div key={group.content_md5} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <div className="font-medium text-gray-800">
                            {group.content_md5.slice(0, 8)}... ({group.count})
                          </div>
                          <div className="text-sm text-gray-500">
                            建议保留 ID {group.recommended_keep_book_id}
                          </div>
                        </div>
                        <button
                          type="button"
                          aria-label="展开重复组"
                          aria-expanded={expandedGroups[group.content_md5] ?? false}
                          onClick={() => setExpandedGroups((prev) => ({
                            ...prev,
                            [group.content_md5]: !prev[group.content_md5],
                          }))}
                          className="px-3 py-2 text-sm rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
                        >
                          {expandedGroups[group.content_md5] ? '收起' : '展开'}
                        </button>
                      </div>
                      {expandedGroups[group.content_md5] && (
                        <div className="mt-4 space-y-4">
                          <div className="space-y-2">
                            {group.items.map((item) => (
                              <label
                                key={item.id}
                                className="flex items-start gap-3 border rounded-lg p-3 cursor-pointer"
                              >
                                <input
                                  type="radio"
                                  name={`keep-${group.content_md5}`}
                                  aria-label={item.title}
                                  checked={selectedKeepByHash[group.content_md5] === item.id}
                                  onChange={() => setSelectedKeepByHash((prev) => ({
                                    ...prev,
                                    [group.content_md5]: item.id,
                                  }))}
                                  className="mt-1"
                                />
                                <span className="flex-1">
                                  <span className="block font-medium text-gray-800">{item.title}</span>
                                  <span className="block text-sm text-gray-500">
                                    {item.filename} | 阅读进度 {item.last_read_position} | 章节 {item.chapter_count}
                                  </span>
                                </span>
                              </label>
                            ))}
                          </div>
                          {(() => {
                            const deleteSourceFilesEnabled = deleteSourceFilesByHash[group.content_md5] ?? false;

                            return (
                              <>
                                <label className="flex items-center gap-2 text-sm text-red-600">
                                  <input
                                    type="checkbox"
                                    checked={deleteSourceFilesEnabled}
                                    onChange={(event) => setDeleteSourceFilesByHash((prev) => ({
                                      ...prev,
                                      [group.content_md5]: event.target.checked,
                                    }))}
                                  />
                                  同时删除被移除副本的原始文件
                                </label>
                                {deleteSourceFilesEnabled ? (
                                  <p className="text-xs text-red-500">将直接删除磁盘文件，无法恢复。</p>
                                ) : (
                                  <p className="text-xs text-gray-500">先勾选上方选项，才能执行硬删除。</p>
                                )}
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    onClick={() => handleResolveGroup(group, 'soft_delete')}
                                    className="px-4 py-2 rounded-lg bg-orange-500 text-white hover:bg-orange-600 transition-colors"
                                  >
                                    软删除其余
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleResolveGroup(group, 'hard_delete')}
                                    disabled={!deleteSourceFilesEnabled}
                                    title={deleteSourceFilesEnabled ? '将删除书籍记录和原始文件' : '先勾选“同时删除被移除副本的原始文件”'}
                                    className={`px-4 py-2 rounded-lg text-white transition-colors ${
                                      deleteSourceFilesEnabled
                                        ? 'bg-red-500 hover:bg-red-600'
                                        : 'bg-red-300 cursor-not-allowed'
                                    }`}
                                  >
                                    硬删除其余
                                  </button>
                                </div>
                              </>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </section>

        {/* Security Settings Section */}
        <SecuritySettingsSection />

        {/* Database Maintenance Section */}
        <section className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <div className="flex items-center gap-3 mb-4">
            <Database className="w-6 h-6 text-gray-600" />
            <h2 className="text-lg font-semibold text-gray-800">🗄️ 数据库维护</h2>
          </div>
          
          <div className="space-y-4">
            {/* Cleanup orphaned books */}
            <div className="border rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <Trash2 className="w-5 h-5 text-orange-500" />
                    <span className="font-medium text-gray-800">清理孤立书籍</span>
                  </div>
                  <p className="text-sm text-gray-500 mt-1">
                    {orphanedCount === null ? '检测中...' : `检测到 ${orphanedCount} 本书籍文件已不存在`}
                  </p>
                </div>
                <button
                  onClick={handleCleanup}
                  disabled={cleaning || orphanedCount === 0 || orphanedCount === null}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    cleaning || orphanedCount === 0 || orphanedCount === null
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      : 'bg-orange-500 text-white hover:bg-orange-600'
                  }`}
                >
                  {cleaning ? '清理中...' : '清理数据库'}
                </button>
              </div>
              {cleanResult && (
                <div className="mt-3 text-sm text-green-600">{cleanResult}</div>
              )}
            </div>

            {/* Reset database */}
            <div className="border border-red-200 rounded-lg p-4 bg-red-50">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-red-500" />
                    <span className="font-medium text-red-700">重置数据库（危险操作）</span>
                  </div>
                  <p className="text-sm text-red-600 mt-1">
                    将删除所有书籍和设置
                  </p>
                </div>
                <button
                  onClick={() => setShowResetDialog(true)}
                  className="px-4 py-2 rounded-lg font-medium bg-red-500 text-white hover:bg-red-600 transition-colors"
                >
                  重置数据库
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Reset Dialog */}
        {showResetDialog && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">输入管理员密码确认重置</h3>
              <input
                type="password"
                value={resetPassword}
                onChange={(e) => setResetPassword(e.target.value)}
                placeholder="输入 ADMIN_KEY"
                className="w-full px-4 py-2 border rounded-lg mb-4 focus:outline-none focus:ring-2 focus:ring-red-500"
                onKeyDown={(e) => e.key === 'Enter' && handleReset()}
              />
              {resetError && (
                <div className="text-red-500 text-sm mb-4">{resetError}</div>
              )}
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => {
                    setShowResetDialog(false);
                    setResetPassword('');
                    setResetError('');
                  }}
                  className="px-4 py-2 rounded-lg font-medium bg-gray-100 text-gray-600 hover:bg-gray-200"
                >
                  取消
                </button>
                <button
                  onClick={handleReset}
                  disabled={resetting || !resetPassword}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    resetting || !resetPassword
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      : 'bg-red-500 text-white hover:bg-red-600'
                  }`}
                >
                  {resetting ? '重置中...' : '确认重置'}
                </button>
              </div>
            </div>
          </div>
        )}


      </main>
    </div>
  );
}

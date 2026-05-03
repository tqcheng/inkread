import { useState, useEffect } from 'react';
import { Shield, Loader2 } from 'lucide-react';
import { authApi } from '../api/auth';
import { adminApi } from '../api/admin';
import type { AuthStatus } from '../api/types';

const TOKEN_KEY = 'app_auth_token';

export default function SecuritySettingsSection() {
  const [status, setStatus] = useState<AuthStatus>({ enabled: false, has_password: false });
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'success' | 'error'>('success');

  useEffect(() => {
    authApi.getStatus().then((s) => {
      setStatus(s);
      setEnabled(s.enabled);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const showMessage = (msg: string, type: 'success' | 'error') => {
    setMessage(msg);
    setMessageType(type);
    setTimeout(() => setMessage(''), 3000);
  };

  const invalidateLocalToken = () => {
    localStorage.removeItem(TOKEN_KEY);
  };

  const handleToggle = async () => {
    if (!enabled) {
      // Turning ON — if password exists, just enable; otherwise show form
      if (status.has_password) {
        setSaving(true);
        try {
          await adminApi.updateSecuritySettings({ enabled: true });
          setStatus((s) => ({ ...s, enabled: true }));
          setEnabled(true);
          invalidateLocalToken();
          showMessage('密码保护已开启', 'success');
        } catch (err: any) {
          showMessage(err?.message || err?.detail || '操作失败', 'error');
        } finally {
          setSaving(false);
        }
      } else {
        setEnabled(true);
      }
      return;
    }
    // Turning OFF — no password needed
    setSaving(true);
    try {
      await adminApi.updateSecuritySettings({ enabled: false });
      setStatus((s) => ({ ...s, enabled: false }));
      setEnabled(false);
      invalidateLocalToken();
      showMessage('密码保护已关闭', 'success');
    } catch (err: any) {
      showMessage(err?.message || err?.detail || '操作失败', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSetPassword = async () => {
    if (!newPassword || !confirmPassword) {
      showMessage('请填写新密码和确认密码', 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      showMessage('两次输入的密码不一致', 'error');
      return;
    }
    setSaving(true);
    try {
      await adminApi.updateSecuritySettings({
        enabled: true,
        new_password: newPassword,
        ...(status.has_password ? { current_password: currentPassword } : {}),
      });
      setStatus({ enabled: true, has_password: true });
      setEnabled(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      invalidateLocalToken();
      showMessage('密码已设置，保护已开启', 'success');
    } catch (err: any) {
      showMessage(err?.message || err?.detail || '操作失败', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      showMessage('请填写所有密码字段', 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      showMessage('两次输入的密码不一致', 'error');
      return;
    }
    setSaving(true);
    try {
      await adminApi.updateSecuritySettings({
        enabled: true,
        current_password: currentPassword,
        new_password: newPassword,
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      invalidateLocalToken();
      showMessage('密码修改成功，需要重新登录', 'success');
    } catch (err: any) {
      showMessage(err?.message || err?.detail || '修改失败', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <section className="bg-white rounded-xl shadow-sm p-6 mb-6">
        <div className="flex items-center justify-center py-4">
          <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
        </div>
      </section>
    );
  }

  return (
    <section className="bg-white rounded-xl shadow-sm p-6 mb-6">
      <div className="flex items-center gap-3 mb-4">
        <Shield className="w-6 h-6 text-gray-600" />
        <h2 className="text-lg font-semibold text-gray-800">安全设置</h2>
      </div>

      {message && (
        <div
          className={`mb-4 p-3 rounded-lg text-sm ${
            messageType === 'success'
              ? 'bg-green-50 text-green-700'
              : 'bg-red-50 text-red-700'
          }`}
        >
          {message}
        </div>
      )}

      {/* Toggle */}
      <div className="border rounded-lg p-4 mb-4">
        <div className="flex items-center justify-between">
          <div>
            <span className="font-medium text-gray-800">启动密码保护</span>
            <p className="text-sm text-gray-500 mt-1">
              {status.enabled ? '已开启 — 访问首页需要密码' : '已关闭'}
            </p>
          </div>
          <button
            onClick={handleToggle}
            disabled={saving}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              enabled ? 'bg-blue-500' : 'bg-gray-300'
            } ${saving ? 'opacity-50' : ''}`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                enabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {/* Set password form */}
        {enabled && !status.has_password && (
          <div className="mt-4 pt-4 border-t">
            <p className="text-sm text-gray-600 mb-3">首次启用，请先设置密码</p>
            <div className="space-y-3">
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="新密码"
                disabled={saving}
                className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="确认密码"
                disabled={saving}
                className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={handleSetPassword}
                disabled={saving || !newPassword || !confirmPassword}
                className={`px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors ${
                  saving || !newPassword || !confirmPassword
                    ? 'bg-gray-300 cursor-not-allowed'
                    : 'bg-blue-500 hover:bg-blue-600'
                }`}
              >
                {saving ? '保存中...' : '设置密码并开启'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Change Password */}
      {status.enabled && status.has_password && (
        <div className="border rounded-lg p-4">
          <h3 className="font-medium text-gray-800 mb-3">修改密码</h3>
          <div className="space-y-3">
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="当前密码"
              disabled={saving}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="新密码"
              disabled={saving}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="确认新密码"
              disabled={saving}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={handleChangePassword}
              disabled={saving || !currentPassword || !newPassword || !confirmPassword}
              className={`px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors ${
                saving || !currentPassword || !newPassword || !confirmPassword
                  ? 'bg-gray-300 cursor-not-allowed'
                  : 'bg-blue-500 hover:bg-blue-600'
              }`}
            >
              {saving ? '保存中...' : '修改密码'}
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-2">修改密码后，所有已登录的设备都需要重新输入密码</p>
        </div>
      )}
    </section>
  );
}

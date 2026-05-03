import { useState, useEffect } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

export default function LoginOverlay() {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const { login, isLoading, error, clearError } = useAuth();

  useEffect(() => {
    return () => clearError();
  }, []);

  const handleLogin = async () => {
    if (!password.trim()) return;
    await login(password.trim());
    if (!error) setPassword('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xl">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-sm mx-4">
        <div className="text-center mb-6">
          <div className="text-4xl mb-3">📚</div>
          <h1 className="text-2xl font-bold text-gray-800">InkRead</h1>
          <p className="text-sm text-gray-500 mt-2">请输入启动密码</p>
        </div>

        <div className="relative mb-4">
          <input
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (error) clearError();
            }}
            onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            placeholder="输入密码"
            autoFocus
            disabled={isLoading}
            className="w-full px-4 py-3 pr-12 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-base"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
          </button>
        </div>

        {error && (
          <div className="text-red-500 text-sm text-center mb-4">{error}</div>
        )}

        <button
          onClick={handleLogin}
          disabled={isLoading || !password.trim()}
          className={`w-full py-3 rounded-xl font-medium text-white transition-colors ${
            isLoading || !password.trim()
              ? 'bg-gray-300 cursor-not-allowed'
              : 'bg-blue-500 hover:bg-blue-600'
          }`}
        >
          {isLoading ? '验证中...' : '登录'}
        </button>
      </div>
    </div>
  );
}

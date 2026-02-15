import React, { useState } from 'react';
import { UserPlus, LogIn, AlertCircle, Mail, KeyRound } from 'lucide-react';
import { authService } from '../services/authService';
import { User } from '../types';
import KnoweiaLogo from './KnoweiaLogo';

interface AuthScreenProps {
  onLogin: (user: User) => void;
}

const AuthScreen: React.FC<AuthScreenProps> = ({ onLogin }) => {
  const [isRegistering, setIsRegistering] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    verificationCode: '',
  });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setError('');
  };

  const handleRequestCode = async () => {
    if (!isRegistering) {
      return;
    }
    if (!formData.email) {
      setError('请先填写邮箱');
      return;
    }

    setError('');
    setNotice('');
    setIsSendingCode(true);
    try {
      const result = await authService.requestEmailCode(formData.email);
      const devHint = result.dev_code ? `（开发环境验证码: ${result.dev_code}）` : '';
      setNotice(`验证码已发送，请在 ${result.expires_in_seconds} 秒内使用。${devHint}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '发送验证码失败');
    } finally {
      setIsSendingCode(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!formData.email || !formData.password) {
      setError('请填写邮箱和密码');
      return;
    }

    if (isRegistering) {
      if (!formData.name) {
        setError('注册需要填写昵称');
        return;
      }
      if (!formData.verificationCode) {
        setError('注册需要填写邮箱验证码');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const user = isRegistering
        ? await authService.register({
            email: formData.email,
            verificationCode: formData.verificationCode,
            password: formData.password,
            displayName: formData.name,
          })
        : await authService.login({
            email: formData.email,
            password: formData.password,
          });
      onLogin(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="mb-8 text-center">
        <div className="inline-block rounded-2xl shadow-xl shadow-blue-200/60 ring-1 ring-blue-100 overflow-hidden mb-4">
          <KnoweiaLogo className="w-[72px] h-[72px] block" />
        </div>
        <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Knoweia</h1>
        <p className="text-sm font-medium text-gray-500 uppercase tracking-widest mt-2">AI Learning Platform</p>
      </div>

      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
        <div className="px-8 py-6 border-b border-gray-50 bg-gray-50/50 flex justify-between items-center">
          <h2 className="text-lg font-bold text-gray-800">{isRegistering ? '创建账户' : '欢迎回来'}</h2>
          <button
            onClick={() => {
              setIsRegistering(!isRegistering);
              setError('');
              setNotice('');
              setFormData({ name: '', email: '', password: '', verificationCode: '' });
            }}
            className="text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors"
          >
            {isRegistering ? '已有账号？登录' : '没有账号？注册'}
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-5">
          {error && (
            <div className="p-3 bg-red-50 border border-red-100 rounded-lg flex items-center gap-2 text-sm text-red-600 animate-in fade-in slide-in-from-top-2">
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          {notice && <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg text-sm text-blue-700">{notice}</div>}

          {isRegistering && (
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-500 uppercase">昵称</label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                placeholder="Student Name"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-gray-500 uppercase">邮箱</label>
            <div className="flex gap-2">
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                className="flex-1 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                placeholder="name@example.com"
              />
              {isRegistering && (
                <button
                  type="button"
                  onClick={handleRequestCode}
                  disabled={isSendingCode}
                  className="px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm font-semibold hover:bg-gray-50 disabled:opacity-50"
                >
                  <span className="inline-flex items-center gap-1">
                    <Mail size={14} />
                    发送验证码
                  </span>
                </button>
              )}
            </div>
            {!isRegistering && <p className="text-[11px] text-gray-500">登录使用邮箱 + 密码。</p>}
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-gray-500 uppercase">密码</label>
            <div className="relative">
              <input
                type="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                placeholder="至少 8 位"
              />
              <KeyRound size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
            </div>
          </div>

          {isRegistering && (
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-500 uppercase">邮箱验证码</label>
              <input
                type="text"
                name="verificationCode"
                value={formData.verificationCode}
                onChange={handleChange}
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                placeholder="输入验证码"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3 bg-black text-white font-bold rounded-xl shadow-lg hover:bg-gray-800 transition-all flex items-center justify-center gap-2 mt-4 disabled:opacity-60"
          >
            {isRegistering ? <UserPlus size={18} /> : <LogIn size={18} />}
            {isRegistering ? '立即注册' : '登录'}
          </button>
        </form>
      </div>

      <p className="mt-8 text-xs text-gray-400">Desktop Environment v1.1</p>
    </div>
  );
};

export default AuthScreen;

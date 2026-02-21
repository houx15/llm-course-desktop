import React, { useEffect, useMemo, useState } from 'react';
import { X, Save, Key, HardDrive, Database, Eye, EyeOff, ExternalLink, ChevronDown, Check } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const PROVIDERS = [
  { id: 'gemini', name: 'Google Gemini', defaultModel: 'gemini-3-flash-preview', helpUrl: 'https://aistudio.google.com/app/apikey' },
  { id: 'gpt', name: 'OpenAI GPT', defaultModel: 'gpt-4o', helpUrl: 'https://platform.openai.com/api-keys' },
  { id: 'deepseek', name: 'DeepSeek', defaultModel: 'deepseek-chat', helpUrl: 'https://platform.deepseek.com/api_keys' },
  {
    id: 'qwen',
    name: 'Aliyun Qwen (通义千问)',
    defaultModel: 'qwen-turbo',
    helpUrl: 'https://help.aliyun.com/zh/dashscope/developer-reference/activate-dashscope-and-create-an-api-key',
  },
  { id: 'glm', name: 'Zhipu GLM (智谱)', defaultModel: 'glm-4', helpUrl: 'https://open.bigmodel.cn/usercenter/apikeys' },
  { id: 'kimi', name: 'Moonshot Kimi', defaultModel: 'moonshot-v1-8k', helpUrl: 'https://platform.moonshot.cn/console/api-keys' },
];

type ProviderConfig = {
  key: string;
  model: string;
  rememberKey: boolean;
};

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'storage' | 'api'>('storage');
  const [storageRoot, setStorageRoot] = useState('');
  const [rememberLogin, setRememberLogin] = useState(true);

  const [activeProviderId, setActiveProviderId] = useState('gemini');
  const [configs, setConfigs] = useState<Record<string, ProviderConfig>>({});
  const [showKey, setShowKey] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!isOpen || !window.tutorApp) {
      return;
    }

    const load = async () => {
      const settings = await window.tutorApp!.getSettings();
      setStorageRoot(settings.storageRoot || '');
      setRememberLogin(settings.rememberLogin !== false);
      setActiveProviderId(settings.activeProvider || 'gemini');

      const mergedConfigs: Record<string, ProviderConfig> = {};
      for (const provider of PROVIDERS) {
        const saved = settings.modelConfigs?.[provider.id];
        const key = (await window.tutorApp!.getLlmKey(provider.id)).key;
        mergedConfigs[provider.id] = {
          key,
          model: saved?.model || provider.defaultModel,
          rememberKey: Boolean(settings.rememberKeys?.[provider.id]),
        };
      }
      setConfigs(mergedConfigs);
      setNotice('');
    };

    load().catch((err) => {
      setNotice(err instanceof Error ? err.message : '加载设置失败');
    });
  }, [isOpen]);

  const updateConfig = (field: keyof ProviderConfig, value: string | boolean) => {
    setConfigs((prev) => ({
      ...prev,
      [activeProviderId]: {
        ...prev[activeProviderId],
        [field]: value,
      },
    }));
  };

  const handleChooseStorageRoot = async () => {
    if (!window.tutorApp) {
      return;
    }

    const result = await window.tutorApp.chooseStorageRoot();
    if (!result.canceled && result.path) {
      setStorageRoot(result.path);
    }
  };

  const handleSave = async () => {
    if (!window.tutorApp) {
      return;
    }

    setIsSaving(true);
    setNotice('');
    try {
      const rememberKeys: Record<string, boolean> = {};
      const modelConfigs: Record<string, { model: string }> = {};

      for (const provider of PROVIDERS) {
        const conf = configs[provider.id] || { key: '', model: provider.defaultModel, rememberKey: false };
        rememberKeys[provider.id] = Boolean(conf.rememberKey);
        modelConfigs[provider.id] = { model: conf.model || provider.defaultModel };

        if (conf.rememberKey && conf.key) {
          await window.tutorApp.saveLlmKey(provider.id, conf.key);
        }
        if (!conf.rememberKey) {
          await window.tutorApp.deleteLlmKey(provider.id);
        }
      }

      await window.tutorApp.setSettings({
        storageRoot,
        rememberLogin,
        rememberKeys,
        modelConfigs,
        activeProvider: activeProviderId,
      });

      if (!rememberLogin) {
        await window.tutorApp.clearAuth();
      }

      onClose();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : '保存失败');
    } finally {
      setIsSaving(false);
    }
  };

  const currentProvider = useMemo(() => PROVIDERS.find((p) => p.id === activeProviderId) || PROVIDERS[0], [activeProviderId]);
  const currentConfig = configs[activeProviderId] || { key: '', model: currentProvider.defaultModel, rememberKey: false };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white rounded-xl shadow-2xl w-[680px] max-h-[90vh] flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
          <h2 className="text-lg font-bold text-gray-800">设置</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded-full transition-colors text-gray-500">
            <X size={20} />
          </button>
        </div>

        <div className="flex flex-1 min-h-0">
          <div className="w-48 bg-gray-50 border-r border-gray-200 p-3 space-y-1">
            <button
              onClick={() => setActiveTab('storage')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-all ${
                activeTab === 'storage' ? 'bg-white text-blue-600 shadow-sm ring-1 ring-gray-200' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <HardDrive size={16} />
              存储
            </button>
            <button
              onClick={() => setActiveTab('api')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-all ${
                activeTab === 'api' ? 'bg-white text-blue-600 shadow-sm ring-1 ring-gray-200' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <Key size={16} />
              模型设置
            </button>
          </div>

          <div className="flex-1 p-6 overflow-y-auto bg-white">
            {activeTab === 'storage' && (
              <div className="space-y-6">
                <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <Database size={16} className="text-blue-500" /> 本地存储
                </h3>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-500 uppercase">Storage Root</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={storageRoot}
                      onChange={(e) => setStorageRoot(e.target.value)}
                      className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none font-mono text-gray-700"
                    />
                    <button
                      onClick={handleChooseStorageRoot}
                      className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 text-sm font-medium whitespace-nowrap"
                    >
                      选择文件夹
                    </button>
                  </div>
                  <p className="text-[10px] text-gray-400">本地 bundles/session/workspace 的根目录。</p>
                </div>

                <label className="flex items-center gap-2 text-sm text-gray-600">
                  <input type="checkbox" checked={rememberLogin} onChange={(e) => setRememberLogin(e.target.checked)} />
                  记住登录状态（保存 refresh token）
                </label>
              </div>
            )}

            {activeTab === 'api' && (
              <div className="space-y-6">
                <h3 className="text-sm font-bold text-gray-900 mb-5 flex items-center gap-2">
                  <Key size={16} className="text-blue-500" /> 模型 API 配置
                </h3>

                <div className="mb-6 space-y-2">
                  <label className="text-xs font-bold text-gray-500 uppercase">选择服务提供商</label>
                  <div className="relative">
                    <select
                      value={activeProviderId}
                      onChange={(e) => {
                        setActiveProviderId(e.target.value);
                        setShowKey(false);
                      }}
                      className="w-full appearance-none pl-4 pr-10 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-gray-800 focus:ring-2 focus:ring-blue-500 outline-none cursor-pointer"
                    >
                      {PROVIDERS.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                  </div>
                </div>

                <div className="p-5 border border-gray-200 rounded-xl bg-gray-50/30 space-y-5 relative">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-500 uppercase flex items-center justify-between">
                      模型名称
                      <span className="text-[10px] font-normal text-gray-400">Default: {currentProvider.defaultModel}</span>
                    </label>
                    <input
                      type="text"
                      placeholder={currentProvider.defaultModel}
                      value={currentConfig.model}
                      onChange={(e) => updateConfig('model', e.target.value)}
                      className="w-full px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-500 uppercase">API Key</label>
                    <div className="relative">
                      <input
                        type={showKey ? 'text' : 'password'}
                        placeholder="sk-..."
                        value={currentConfig.key}
                        onChange={(e) => updateConfig('key', e.target.value)}
                        className="w-full pl-4 pr-10 py-2 bg-white border border-gray-200 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                      />
                      <button
                        onClick={() => setShowKey(!showKey)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
                      >
                        {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  </div>

                  <label className="flex items-center gap-2 text-sm text-gray-600">
                    <input
                      type="checkbox"
                      checked={currentConfig.rememberKey}
                      onChange={(e) => updateConfig('rememberKey', e.target.checked)}
                    />
                    记住此 Provider Key（保存到系统安全存储）
                  </label>

                  <div className="pt-2">
                    <a
                      href={currentProvider.helpUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 font-medium hover:underline"
                    >
                      <ExternalLink size={12} />
                      如何获取 {currentProvider.name} API Key?
                    </a>
                  </div>
                </div>

                <div className="mt-4 flex items-start gap-2 text-xs text-gray-400 bg-gray-50 p-3 rounded-lg">
                  <Check size={14} className="mt-0.5 text-green-500 shrink-0" />
                  <p>API Key 不会存入 localStorage。仅在你勾选“记住”后写入系统安全存储。</p>
                </div>
              </div>
            )}

            {notice && <p className="mt-4 text-sm text-red-600">{notice}</p>}
          </div>
        </div>

        <div className="p-4 border-t border-gray-200 bg-gray-50 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-4 py-2 text-sm font-bold text-white bg-black hover:bg-gray-800 rounded-lg shadow-sm flex items-center gap-2 transition-colors disabled:opacity-60"
          >
            <Save size={16} /> 保存设置
          </button>
        </div>
      </div>
    </div>
  );
};

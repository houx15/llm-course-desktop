import React, { useEffect, useMemo, useState } from 'react';
import { X, Save, Key, HardDrive, Database, Eye, EyeOff, ExternalLink, ChevronDown, Check, Info, RefreshCw, FolderOpen } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const PROVIDERS = [
  { id: 'gemini',   name: 'Google Gemini',         defaultModel: 'gemini-2.0-flash',  llmFormat: 'custom',    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/', helpUrl: 'https://aistudio.google.com/app/apikey' },
  { id: 'gpt',      name: 'OpenAI GPT',             defaultModel: 'gpt-4o',            llmFormat: 'openai',    baseUrl: '',                                                           helpUrl: 'https://platform.openai.com/api-keys' },
  { id: 'deepseek', name: 'DeepSeek',               defaultModel: 'deepseek-chat',     llmFormat: 'custom',    baseUrl: 'https://api.deepseek.com',                                   helpUrl: 'https://platform.deepseek.com/api_keys' },
  { id: 'qwen',     name: 'Aliyun Qwen (通义千问)', defaultModel: 'qwen-turbo',         llmFormat: 'custom',    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',         helpUrl: 'https://help.aliyun.com/zh/dashscope/developer-reference/activate-dashscope-and-create-an-api-key' },
  { id: 'glm',      name: 'Zhipu GLM (智谱)',       defaultModel: 'glm-4',             llmFormat: 'custom',    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',                       helpUrl: 'https://open.bigmodel.cn/usercenter/apikeys' },
  { id: 'kimi',     name: 'Moonshot Kimi',          defaultModel: 'moonshot-v1-8k',    llmFormat: 'custom',    baseUrl: 'https://api.moonshot.cn/v1',                                 helpUrl: 'https://platform.moonshot.cn/console/api-keys' },
];

type ProviderConfig = {
  key: string;
  model: string;
  rememberKey: boolean;
};

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'storage' | 'api' | 'about'>('storage');
  const [storageRoot, setStorageRoot] = useState('');
  const [rememberLogin, setRememberLogin] = useState(true);

  const [activeProviderId, setActiveProviderId] = useState('gpt');
  const [configs, setConfigs] = useState<Record<string, ProviderConfig>>({});
  const [llmFormat, setLlmFormat] = useState('custom');
  const [llmBaseUrl, setLlmBaseUrl] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState('');

  // About tab state
  const [appVersion, setAppVersion] = useState('');
  const [sidecarVersion, setSidecarVersion] = useState('');
  const [logFile, setLogFile] = useState('');
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'checking' | 'up-to-date' | 'update-available' | 'error'>('idle');
  const [updateMessage, setUpdateMessage] = useState('');

  useEffect(() => {
    if (!isOpen || !window.tutorApp) {
      return;
    }

    const load = async () => {
      const settings = await window.tutorApp!.getSettings();
      setStorageRoot(settings.storageRoot || '');
      setRememberLogin(settings.rememberLogin !== false);
      const providerId = settings.activeProvider || 'gpt';
      setActiveProviderId(providerId);
      const presetProvider = PROVIDERS.find((p) => p.id === providerId);
      setLlmFormat(settings.llmFormat || presetProvider?.llmFormat || 'custom');
      setLlmBaseUrl(settings.llmBaseUrl !== undefined ? settings.llmBaseUrl : (presetProvider?.baseUrl || ''));

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

      // Load version info for About tab
      try {
        const [ver, index, logs] = await Promise.all([
          window.tutorApp!.getVersion(),
          window.tutorApp!.getBundleIndex(),
          window.tutorApp!.getRuntimeLogs(),
        ]);
        setAppVersion(ver || '');
        const runtimeEntry = Object.values((index?.python_runtime || {}) as Record<string, any>)[0];
        setSidecarVersion(runtimeEntry?.version || '(未安装)');
        setLogFile((logs as any)?.logFile || '');
      } catch {
        // non-fatal
      }
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
        llmFormat,
        llmBaseUrl,
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

  const handleCheckUpdates = async () => {
    if (!window.tutorApp || updateStatus === 'checking') return;
    setUpdateStatus('checking');
    setUpdateMessage('');
    try {
      const index = await window.tutorApp.getBundleIndex();
      const installed: Record<string, string> = {};
      for (const [scopeId, entry] of Object.entries((index?.python_runtime || {}) as Record<string, any>)) {
        if (entry?.version) installed[scopeId] = entry.version;
      }
      const result = await window.tutorApp.checkAppUpdates({
        desktop_version: appVersion || '0.0.0',
        sidecar_version: sidecarVersion && sidecarVersion !== '(未安装)' ? sidecarVersion : '0.0.0',
        installed,
      });
      if (result.ok && result.data?.updates?.length > 0) {
        setUpdateStatus('update-available');
        setUpdateMessage(`发现 ${result.data.updates.length} 个更新`);
      } else if (result.ok) {
        setUpdateStatus('up-to-date');
        setUpdateMessage('已是最新版本');
      } else {
        setUpdateStatus('error');
        setUpdateMessage(`检查失败 (${result.status})`);
      }
    } catch (err) {
      setUpdateStatus('error');
      setUpdateMessage(err instanceof Error ? err.message : '检查失败');
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
            <button
              onClick={() => setActiveTab('about')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-all ${
                activeTab === 'about' ? 'bg-white text-blue-600 shadow-sm ring-1 ring-gray-200' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <Info size={16} />
              关于
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
                        const pid = e.target.value;
                        setActiveProviderId(pid);
                        const p = PROVIDERS.find((x) => x.id === pid);
                        if (p) { setLlmFormat(p.llmFormat); setLlmBaseUrl(p.baseUrl); }
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

                <div className="mb-6 grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-500 uppercase">接口格式</label>
                    <select
                      value={llmFormat}
                      onChange={(e) => setLlmFormat(e.target.value)}
                      className="w-full appearance-none px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-800 focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                      <option value="openai">OpenAI</option>
                      <option value="anthropic">Anthropic</option>
                      <option value="custom">Custom (OpenAI-compat)</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-500 uppercase">Base URL</label>
                    <input
                      type="text"
                      value={llmBaseUrl}
                      onChange={(e) => setLlmBaseUrl(e.target.value)}
                      placeholder="https://api.openai.com"
                      className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500 outline-none"
                    />
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

            {activeTab === 'about' && (
              <div className="space-y-6">
                <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                  <Info size={16} className="text-blue-500" /> 关于 &amp; 更新
                </h3>

                {/* Version rows */}
                <div className="space-y-3">
                  {[
                    { label: '应用版本', value: appVersion || '…' },
                    { label: 'Sidecar 版本', value: sidecarVersion || '…' },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex items-center justify-between py-2 border-b border-gray-100">
                      <span className="text-sm text-gray-600">{label}</span>
                      <span className="text-sm font-mono font-semibold text-gray-800">{value}</span>
                    </div>
                  ))}
                </div>

                {/* Check updates button */}
                <button
                  onClick={handleCheckUpdates}
                  disabled={updateStatus === 'checking'}
                  className="flex items-center gap-2 px-4 py-2 bg-black text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-60 transition-colors"
                >
                  <RefreshCw size={14} className={updateStatus === 'checking' ? 'animate-spin' : ''} />
                  {updateStatus === 'checking' ? '检查中…' : '检查更新'}
                </button>

                {updateMessage && (
                  <p className={`text-sm font-medium ${
                    updateStatus === 'update-available' ? 'text-blue-600' :
                    updateStatus === 'up-to-date' ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {updateMessage}
                  </p>
                )}

                {/* Log file path */}
                {logFile && (
                  <div className="space-y-1.5 pt-2 border-t border-gray-100">
                    <p className="text-xs font-bold text-gray-500 uppercase">Sidecar 日志文件</p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 text-[11px] font-mono bg-gray-50 border border-gray-200 rounded px-2 py-1.5 text-gray-600 truncate">
                        {logFile}
                      </code>
                      <button
                        title="在 Finder 中显示"
                        onClick={() => window.tutorApp?.openExternal('file://' + logFile.replace(/[^/]+$/, ''))}
                        className="p-1.5 text-gray-400 hover:text-gray-700 border border-gray-200 rounded hover:bg-gray-50"
                      >
                        <FolderOpen size={14} />
                      </button>
                    </div>
                    <p className="text-[10px] text-gray-400">发生错误时，用文本编辑器打开此文件查看详细日志。</p>
                  </div>
                )}
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

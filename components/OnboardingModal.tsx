import React, { useEffect, useState } from 'react';
import { Eye, EyeOff, ExternalLink } from 'lucide-react';

interface Provider {
  id: string;
  name: string;
  defaultModel: string;
  llmFormat: string;
  baseUrl: string;
  helpUrl: string;
}

const PROVIDERS: Provider[] = [
  { id: 'gemini',   name: 'Google Gemini',         defaultModel: 'gemini-2.0-flash', llmFormat: 'custom', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/', helpUrl: 'https://aistudio.google.com/app/apikey' },
  { id: 'gpt',      name: 'OpenAI GPT',             defaultModel: 'gpt-4o',           llmFormat: 'openai', baseUrl: '',                                                           helpUrl: 'https://platform.openai.com/api-keys' },
  { id: 'deepseek', name: 'DeepSeek',               defaultModel: 'deepseek-chat',    llmFormat: 'custom', baseUrl: 'https://api.deepseek.com',                                   helpUrl: 'https://platform.deepseek.com/api_keys' },
  { id: 'qwen',     name: 'Aliyun Qwen (通义千问)', defaultModel: 'qwen-turbo',        llmFormat: 'custom', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',         helpUrl: 'https://help.aliyun.com/zh/dashscope/developer-reference/activate-dashscope-and-create-an-api-key' },
  { id: 'glm',      name: 'Zhipu GLM (智谱)',       defaultModel: 'glm-4',            llmFormat: 'custom', baseUrl: 'https://open.bigmodel.cn/api/paas/v4',                       helpUrl: 'https://open.bigmodel.cn/usercenter/apikeys' },
  { id: 'kimi',     name: 'Moonshot Kimi',          defaultModel: 'moonshot-v1-8k',   llmFormat: 'custom', baseUrl: 'https://api.moonshot.cn/v1',                                 helpUrl: 'https://platform.moonshot.cn/console/api-keys' },
];

interface Props {
  onComplete: () => void;
}

export const OnboardingModal: React.FC<Props> = ({ onComplete }) => {
  const [providerId, setProviderId] = useState('gpt');
  const [llmFormat, setLlmFormat] = useState('openai');
  const [llmBaseUrl, setLlmBaseUrl] = useState('');
  const [llmModel, setLlmModel] = useState('gpt-4o');
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [storageRoot, setStorageRoot] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load current storageRoot default on mount
  useEffect(() => {
    if (!window.tutorApp) return;
    window.tutorApp.getSettings()
      .then((s) => setStorageRoot(s.storageRoot || ''))
      .catch(() => setError('Failed to load settings'));
  }, []);

  const provider = PROVIDERS.find((p) => p.id === providerId) || PROVIDERS[0];

  const handleChooseStorage = async () => {
    if (!window.tutorApp) return;
    const result = await window.tutorApp.chooseStorageRoot();
    if (!result.canceled && result.path) {
      setStorageRoot(result.path);
    }
  };

  const handleOpenHelpUrl = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    if (window.tutorApp) {
      window.tutorApp.openExternal(provider.helpUrl);
    }
  };

  const handleSubmit = async () => {
    if (!apiKey.trim() || saving || !window.tutorApp) return;
    setSaving(true);
    setError(null);
    try {
      const currentSettings = await window.tutorApp.getSettings();
      // Save LLM key to secure storage
      await window.tutorApp.saveLlmKey(providerId, apiKey.trim());
      // Save settings: activeProvider, storageRoot, rememberKeys, modelConfigs
      await window.tutorApp.setSettings({
        activeProvider: providerId,
        storageRoot,
        llmFormat,
        llmBaseUrl,
        rememberKeys: { ...currentSettings.rememberKeys, [providerId]: true },
        modelConfigs: { ...currentSettings.modelConfigs, [providerId]: { model: llmModel || provider.defaultModel } },
      });
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      {/* No onClick on backdrop — cannot be dismissed by clicking outside */}
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Welcome! Let's get started</h2>
        <p className="text-gray-500 mb-6 text-sm">
          Configure your AI provider to begin learning.
        </p>

        {/* Provider selector */}
        <div className="mb-4">
          <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">AI Provider</label>
          <select
            className="w-full appearance-none px-3 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-800 bg-gray-50 focus:ring-2 focus:ring-blue-500 outline-none cursor-pointer"
            value={providerId}
            onChange={(e) => {
              const pid = e.target.value;
              setProviderId(pid);
              const p = PROVIDERS.find((x) => x.id === pid);
              if (p) { setLlmFormat(p.llmFormat); setLlmBaseUrl(p.baseUrl); setLlmModel(p.defaultModel); }
              setApiKey(''); setShowKey(false);
            }}
          >
            {PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        {/* LLM Format + Base URL */}
        <div className="mb-4 grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">接口格式</label>
            <select
              className="w-full appearance-none px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 focus:ring-2 focus:ring-blue-500 outline-none"
              value={llmFormat}
              onChange={(e) => setLlmFormat(e.target.value)}
            >
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
              <option value="custom">Custom (OpenAI-compat)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Base URL</label>
            <input
              type="text"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono bg-white focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="https://api.openai.com"
              value={llmBaseUrl}
              onChange={(e) => setLlmBaseUrl(e.target.value)}
            />
          </div>
        </div>

        {/* Model */}
        <div className="mb-4">
          <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">模型名称</label>
          <input
            type="text"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono bg-white focus:ring-2 focus:ring-blue-500 outline-none"
            placeholder="e.g. gpt-4o"
            value={llmModel}
            onChange={(e) => setLlmModel(e.target.value)}
          />
        </div>

        {/* API Key */}
        <div className="mb-4">
          <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5 flex items-center justify-between">
            API Key
            <a
              href="#"
              onClick={handleOpenHelpUrl}
              className="inline-flex items-center gap-1 text-blue-500 hover:text-blue-700 hover:underline font-normal normal-case text-[11px]"
            >
              <ExternalLink size={11} />
              Get key
            </a>
          </label>
          <div className="relative">
            <input
              type={showKey ? 'text' : 'password'}
              className="w-full pl-4 pr-10 py-2 border border-gray-200 rounded-lg text-sm font-mono bg-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              placeholder="Paste your API key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              autoFocus
            />
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
              onClick={() => setShowKey((v) => !v)}
              tabIndex={-1}
            >
              {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </div>

        {/* Storage root */}
        <div className="mb-6">
          <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Storage Location</label>
          <div className="flex gap-2">
            <input
              type="text"
              readOnly
              className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono bg-gray-50 truncate"
              value={storageRoot}
              placeholder="Default location"
            />
            <button
              type="button"
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 whitespace-nowrap transition-colors"
              onClick={handleChooseStorage}
            >
              Choose
            </button>
          </div>
          <p className="mt-1 text-[10px] text-gray-400">Where course bundles and workspace files are stored.</p>
        </div>

        {error && (
          <p className="mb-4 text-sm text-red-600">{error}</p>
        )}

        <button
          type="button"
          disabled={!apiKey.trim() || saving}
          onClick={handleSubmit}
          className="w-full py-3 rounded-xl bg-blue-600 text-white font-semibold disabled:opacity-40 hover:bg-blue-700 transition-colors"
        >
          {saving ? 'Saving…' : 'Get Started'}
        </button>
      </div>
    </div>
  );
};

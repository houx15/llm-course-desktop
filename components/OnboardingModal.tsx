import React, { useEffect, useState } from 'react';
import { Eye, EyeOff, ExternalLink } from 'lucide-react';

interface Provider {
  id: string;
  name: string;
  defaultModel: string;
  helpUrl: string;
}

const PROVIDERS: Provider[] = [
  { id: 'gemini',   name: 'Google Gemini',      defaultModel: 'gemini-2.5-flash-preview',  helpUrl: 'https://aistudio.google.com/app/apikey' },
  { id: 'gpt',      name: 'OpenAI GPT',          defaultModel: 'gpt-4o',                    helpUrl: 'https://platform.openai.com/api-keys' },
  { id: 'deepseek', name: 'DeepSeek',            defaultModel: 'deepseek-chat',             helpUrl: 'https://platform.deepseek.com/api_keys' },
  { id: 'qwen',     name: 'Aliyun Qwen (通义千问)', defaultModel: 'qwen-turbo',             helpUrl: 'https://bailian.console.aliyun.com/' },
  { id: 'glm',      name: 'Zhipu GLM (智谱)',     defaultModel: 'glm-4',                     helpUrl: 'https://open.bigmodel.cn/usercenter/apikeys' },
  { id: 'kimi',     name: 'Moonshot Kimi',       defaultModel: 'moonshot-v1-8k',            helpUrl: 'https://platform.moonshot.cn/console/api-keys' },
];

interface Props {
  onComplete: () => void;
}

export function OnboardingModal({ onComplete }: Props) {
  const [providerId, setProviderId] = useState('gpt');
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [storageRoot, setStorageRoot] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Load current storageRoot default on mount
  useEffect(() => {
    if (!window.tutorApp) return;
    window.tutorApp.getSettings().then((s) => {
      setStorageRoot(s.storageRoot || '');
    });
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
    setError('');
    try {
      // Save LLM key to secure storage
      await window.tutorApp.saveLlmKey(providerId, apiKey.trim());
      // Save settings: activeProvider, storageRoot, rememberKeys, modelConfigs
      await window.tutorApp.setSettings({
        activeProvider: providerId,
        storageRoot,
        rememberKeys: { [providerId]: true },
        modelConfigs: { [providerId]: { model: provider.defaultModel } },
      });
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      {/* No onClick on backdrop — cannot be dismissed by clicking outside */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md mx-4 p-8">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Welcome! Let's get started</h2>
        <p className="text-gray-500 dark:text-gray-400 mb-6 text-sm">
          Configure your AI provider to begin learning.
        </p>

        {/* Provider selector */}
        <div className="mb-4">
          <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">AI Provider</label>
          <select
            className="w-full appearance-none px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-800 dark:text-white bg-gray-50 dark:bg-gray-700 focus:ring-2 focus:ring-blue-500 outline-none cursor-pointer"
            value={providerId}
            onChange={(e) => { setProviderId(e.target.value); setApiKey(''); setShowKey(false); }}
          >
            {PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
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
              className="w-full pl-4 pr-10 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm font-mono bg-white dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
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
              className="flex-1 px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm font-mono bg-gray-50 dark:bg-gray-700 dark:text-white truncate"
              value={storageRoot}
              placeholder="Default location"
            />
            <button
              type="button"
              className="px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 whitespace-nowrap transition-colors"
              onClick={handleChooseStorage}
            >
              Choose
            </button>
          </div>
          <p className="mt-1 text-[10px] text-gray-400">Where course bundles and workspace files are stored.</p>
        </div>

        {error && (
          <p className="mb-4 text-sm text-red-600 dark:text-red-400">{error}</p>
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
}

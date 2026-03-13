import React, { useEffect, useState } from 'react';
import { Eye, EyeOff, ExternalLink, ChevronDown } from 'lucide-react';

interface Provider {
  id: string;
  name: string;
  defaultModel: string;
  llmFormat: string;
  baseUrl: string;
  helpUrl: string;
}

const PROVIDERS: Provider[] = [
  { id: 'gemini',   name: 'Google Gemini',         defaultModel: 'gemini-2.0-flash', llmFormat: 'custom', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/', helpUrl: 'https://ai.google.dev/gemini-api/docs/api-key' },
  { id: 'gpt',      name: 'OpenAI GPT',             defaultModel: 'gpt-5-mini',           llmFormat: 'openai', baseUrl: '', helpUrl: 'https://platform.openai.com/api-keys' },
  { id: 'claude', name: 'Anthropic Claude', defaultModel: 'claude-haiku-4-5-20251001', llmFormat: 'anthropic', baseUrl: 'https://api.anthropic.com', helpUrl: 'https://docs.anthropic.com/en/docs/initial-setup#prerequisites' },
  { id: 'deepseek', name: 'DeepSeek',               defaultModel: 'deepseek-chat',    llmFormat: 'custom', baseUrl: 'https://api.deepseek.com',                                   helpUrl: 'https://platform.deepseek.com/api_keys' },
  { id: 'qwen',     name: 'Aliyun Qwen (通义千问)', defaultModel: 'qwen3.5-flash',     llmFormat: 'custom', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',         helpUrl: 'https://help.aliyun.com/zh/model-studio/getting-started/first-api-call-to-qwen' },
  { id: 'glm',      name: 'Zhipu GLM (智谱)',       defaultModel: 'glm-4',            llmFormat: 'custom', baseUrl: 'https://open.bigmodel.cn/api/paas/v4',                       helpUrl: 'https://open.bigmodel.cn/dev/howuse/introduction' },
  { id: 'kimi',     name: 'Moonshot Kimi',          defaultModel: 'kimi-k2-0905-preview',   llmFormat: 'custom', baseUrl: 'https://api.moonshot.cn/v1',                                 helpUrl: 'https://platform.moonshot.cn/docs/guide/get-api-key' },
  { id: 'minimax', name: 'Minimax', defaultModel: 'MiniMax-M2.1-highspeed', llmFormat: 'custom', baseUrl: 'https://api.minimaxi.com/v1', helpUrl: 'https://platform.minimaxi.com/docs/guides/quickstart-preparation' },
];

interface Props {
  onComplete: () => void;
}

export const OnboardingModal: React.FC<Props> = ({ onComplete }) => {
  const [providerId, setProviderId] = useState('gpt');
  const [llmFormat, setLlmFormat] = useState('openai');
  const [llmBaseUrl, setLlmBaseUrl] = useState('');
  const [llmModel, setLlmModel] = useState(PROVIDERS.find(p => p.id === 'gpt')?.defaultModel ?? 'gpt-5-mini');
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [storageRoot, setStorageRoot] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [storageWarnings, setStorageWarnings] = useState<string[]>([]);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'fail'>('idle');

  // Load current storageRoot default on mount
  useEffect(() => {
    if (!window.tutorApp) return;
    window.tutorApp.getSettings()
      .then((s) => setStorageRoot(s.storageRoot || ''))
      .catch(() => setError('Failed to load settings'));
  }, []);

  const provider = PROVIDERS.find((p) => p.id === providerId) || PROVIDERS[0];

  // Reset test status when any config field changes
  const resetTest = () => { setTestStatus('idle'); setError(null); };

  const handleChooseStorage = async () => {
    if (!window.tutorApp) return;
    const result = await window.tutorApp.chooseStorageRoot();
    if (!result.canceled && result.path) {
      setStorageRoot(result.path);
      setStorageWarnings(result.warnings || []);
    }
  };

  const handleOpenHelpUrl = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    if (window.tutorApp) {
      window.tutorApp.openExternal(provider.helpUrl);
    }
  };

  const handleTest = async () => {
    if (!apiKey.trim() || !window.tutorApp?.testLlmKey) return;
    setTestStatus('testing');
    setError(null);
    try {
      const result = await window.tutorApp.testLlmKey({
        format: llmFormat,
        baseUrl: llmBaseUrl,
        apiKey: apiKey.trim(),
        model: llmModel || provider.defaultModel,
      });
      if (result.ok) {
        setTestStatus('success');
      } else {
        setTestStatus('fail');
        setError(result.error || '测试失败');
      }
    } catch (err) {
      setTestStatus('fail');
      setError(err instanceof Error ? err.message : '测试失败');
    }
  };

  const handleSubmit = async () => {
    if (!apiKey.trim() || saving || !window.tutorApp || testStatus !== 'success') return;
    setSaving(true);
    setError(null);
    try {
      const currentSettings = await window.tutorApp.getSettings();
      // Save LLM key to secure storage
      await window.tutorApp.saveLlmKey(providerId, apiKey.trim());
      // Save settings: activeProvider, storageRoot, modelConfigs
      await window.tutorApp.setSettings({
        activeProvider: providerId,
        storageRoot,
        llmFormat,
        llmBaseUrl,
        modelConfigs: { ...currentSettings.modelConfigs, [providerId]: { model: llmModel || provider.defaultModel } },
      });
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const buttonLabel = (() => {
    if (saving) return 'Saving…';
    if (testStatus === 'testing') return '测试中...';
    if (testStatus === 'success') return '测试成功，开始学习';
    if (testStatus === 'fail') return '测试失败，检查一下参数吧';
    return '测试一下';
  })();

  const buttonClass = (() => {
    if (testStatus === 'success') return 'bg-green-600 hover:bg-green-700';
    if (testStatus === 'fail') return 'bg-red-500 hover:bg-red-600';
    return 'bg-blue-600 hover:bg-blue-700';
  })();

  const handleButtonClick = () => {
    if (testStatus === 'success') {
      handleSubmit();
    } else if (testStatus !== 'testing' && !saving) {
      handleTest();
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
          <div className="relative">
            <select
              className="w-full appearance-none px-3 py-2 pr-8 border border-gray-200 rounded-lg text-sm font-medium text-gray-800 bg-gray-50 focus:ring-2 focus:ring-blue-500 outline-none cursor-pointer"
              value={providerId}
              onChange={(e) => {
                const pid = e.target.value;
                setProviderId(pid);
                const p = PROVIDERS.find((x) => x.id === pid);
                if (p) { setLlmFormat(p.llmFormat); setLlmBaseUrl(p.baseUrl); setLlmModel(p.defaultModel); }
                setApiKey(''); setShowKey(false);
                resetTest();
              }}
            >
              {PROVIDERS.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>
        </div>

        {/* LLM Format + Base URL */}
        <div className="mb-4 grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">接口格式</label>
            <div className="relative">
              <select
                className="w-full appearance-none px-3 py-2 pr-8 border border-gray-200 rounded-lg text-sm bg-gray-50 focus:ring-2 focus:ring-blue-500 outline-none"
                value={llmFormat}
                onChange={(e) => { setLlmFormat(e.target.value); resetTest(); }}
              >
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
                <option value="custom">Custom (OpenAI-compat)</option>
              </select>
              <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Base URL</label>
            <input
              type="text"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono bg-white focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="https://api.openai.com"
              value={llmBaseUrl}
              onChange={(e) => { setLlmBaseUrl(e.target.value); resetTest(); }}
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
            onChange={(e) => { setLlmModel(e.target.value); resetTest(); }}
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
              onChange={(e) => { setApiKey(e.target.value); resetTest(); }}
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
          {storageWarnings.length > 0 && (
            <div className="mt-2 space-y-1">
              {storageWarnings.map((w, i) => (
                <p key={i} className="text-xs text-amber-600 leading-snug">{w}</p>
              ))}
            </div>
          )}
        </div>

        {error && (
          <p className="mb-4 text-sm text-red-600">{error}</p>
        )}

        <button
          type="button"
          disabled={!apiKey.trim() || testStatus === 'testing' || saving}
          onClick={handleButtonClick}
          className={`w-full py-3 rounded-xl text-white font-semibold disabled:opacity-40 transition-colors ${buttonClass}`}
        >
          {buttonLabel}
        </button>
      </div>
    </div>
  );
};

interface RuntimeConfig {
  pythonPath?: string;
  llmProvider: 'anthropic' | 'openai' | 'custom';
  llmApiKey: string;
  llmModel?: string;
  llmBaseUrl?: string;
}

type RawStreamEvent = {
  type?: string;
  [key: string]: any;
};

type RuntimePreflightResult = {
  ok: boolean;
  phase?: 'health' | 'contract' | 'ready';
  reason?: string;
  status?: number;
  contract_version?: string;
  contract?: any;
  stderr?: string;
  runtime?: any;
};

export type NormalizedStreamEvent =
  | { type: 'start' }
  | { type: 'companion_chunk'; content: string }
  | { type: 'companion_complete' }
  | { type: 'roadmap_update'; phase: 'start' | 'complete' }
  | { type: 'memo_update'; phase: 'start' | 'complete'; turnIndex?: number; report?: string }
  | { type: 'done'; turnIndex?: number }
  | { type: 'expert_consultation'; phase: 'start' | 'complete' | 'error'; payload: any }
  | { type: 'error'; message: string }
  | { type: string; [key: string]: any };

const mapProvider = (providerId: string) => {
  switch (providerId) {
    case 'gpt':
      return { llmProvider: 'openai' as const, defaultModel: 'gpt-4o' };
    case 'deepseek':
      return { llmProvider: 'custom' as const, defaultModel: 'deepseek-chat', baseUrl: 'https://api.deepseek.com' };
    case 'qwen':
      return {
        llmProvider: 'custom' as const,
        defaultModel: 'qwen-turbo',
        baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      };
    case 'glm':
      return { llmProvider: 'custom' as const, defaultModel: 'glm-4', baseUrl: 'https://open.bigmodel.cn/api/paas/v4' };
    case 'kimi':
      return { llmProvider: 'custom' as const, defaultModel: 'moonshot-v1-8k', baseUrl: 'https://api.moonshot.cn/v1' };
    case 'gemini':
    default:
      // Gemini exposes an OpenAI-compatible endpoint; 'custom' provider uses that.
      return { llmProvider: 'custom' as const, defaultModel: 'gemini-2.0-flash', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/' };
  }
};

const SIDECAR_BASE_URL = 'http://127.0.0.1:8000';

const normalizeBaseUrl = (url: string) => url.replace(/\/+$/, '');

const parseSsePayload = (raw: string): RawStreamEvent | null => {
  const value = raw.trim();
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    // Handle Python dict-like payload: {'type': 'start'}
    const typeMatch = value.match(/['"]type['"]\s*:\s*['"]([^'"]+)['"]/);
    const turnMatch = value.match(/['"]turn_index['"]\s*:\s*(\d+)/);
    if (typeMatch) {
      return {
        type: typeMatch[1],
        turn_index: turnMatch ? Number(turnMatch[1]) : undefined,
      };
    }
    return null;
  }
};

const normalizeEvent = (raw: RawStreamEvent): NormalizedStreamEvent => {
  const type = raw?.type || '';

  if (type === 'complete') {
    return { type: 'done', turnIndex: raw.turn_index };
  }

  if (type === 'consultation_start') {
    return { type: 'expert_consultation', phase: 'start', payload: raw };
  }
  if (type === 'consultation_complete') {
    return { type: 'expert_consultation', phase: 'complete', payload: raw };
  }
  if (type === 'consultation_error') {
    return { type: 'expert_consultation', phase: 'error', payload: raw };
  }

  if (type === 'error') {
    return { type: 'error', message: String(raw.message || 'Unknown sidecar error') };
  }

  return raw as NormalizedStreamEvent;
};

const loadRuntimeBootstrap = async () => {
  if (!window.tutorApp) {
    throw new Error('tutorApp API unavailable');
  }

  const settings = await window.tutorApp.getSettings();
  const activeProvider = settings.activeProvider || 'gpt';
  const providerMeta = mapProvider(activeProvider);
  const modelConfig = settings.modelConfigs?.[activeProvider];
  const model = modelConfig?.model || providerMeta.defaultModel;
  const keyResult = await window.tutorApp.getLlmKey(activeProvider);

  // Prefer explicit user-configured format/baseUrl; fall back to per-provider defaults.
  const llmFormat = (settings.llmFormat as RuntimeConfig['llmProvider']) || providerMeta.llmProvider;
  const llmBaseUrl = settings.llmBaseUrl || providerMeta.baseUrl || '';

  return {
    settings,
    activeProvider,
    providerMeta,
    model,
    apiKey: keyResult.key || '',
    llmFormat,
    llmBaseUrl,
  };
};

export type SidecarSetupStatus =
  | { phase: 'idle' }
  | { phase: 'checking' }
  | { phase: 'downloading'; percent: number }
  | { phase: 'installing' }
  | { phase: 'ready' }
  | { phase: 'error'; message: string };

type RuntimeStartFailureStage = 'sidecar' | 'bootstrap' | 'runtime_start';

export type RuntimeStartResult = {
  started: boolean;
  pid?: number;
  reason?: string;
  stderr?: string;
  runtime_source?: string;
  python_source?: string;
  contract_version?: string;
  contract_status?: number;
  failureStage?: RuntimeStartFailureStage;
};

export const runtimeManager = {
  async ensureSidecarBundle(): Promise<{ ready: boolean; error?: string }> {
    if (!window.tutorApp?.ensureSidecarReady) {
      return { ready: true };
    }
    return window.tutorApp.ensureSidecarReady();
  },

  async start(): Promise<RuntimeStartResult> {
    if (!window.tutorApp) {
      return { started: false, reason: 'tutorApp unavailable', failureStage: 'bootstrap' };
    }

    let sidecar: { ready: boolean; error?: string };
    try {
      sidecar = await this.ensureSidecarBundle();
    } catch (err) {
      return {
        started: false,
        reason: err instanceof Error ? err.message : 'Sidecar bundle setup failed',
        failureStage: 'sidecar',
      };
    }
    if (!sidecar.ready) {
      return {
        started: false,
        reason: sidecar.error || 'Sidecar bundle is not ready',
        failureStage: 'sidecar',
      };
    }

    let boot: Awaited<ReturnType<typeof loadRuntimeBootstrap>>;
    try {
      boot = await loadRuntimeBootstrap();
    } catch (err) {
      return {
        started: false,
        reason: err instanceof Error ? err.message : 'Runtime bootstrap failed',
        failureStage: 'bootstrap',
      };
    }
    if (!boot.apiKey) {
      return { started: false, reason: 'missing api key', failureStage: 'bootstrap' };
    }

    const runtimeConfig: RuntimeConfig = {
      llmProvider: boot.llmFormat,
      llmApiKey: boot.apiKey,
      llmModel: boot.model,
      llmBaseUrl: boot.llmBaseUrl || undefined,
    };

    try {
      const runtimeResult = await window.tutorApp.startRuntime(runtimeConfig);
      if (!runtimeResult.started) {
        return { ...runtimeResult, failureStage: 'runtime_start' };
      }
      return runtimeResult;
    } catch (err) {
      return {
        started: false,
        reason: err instanceof Error ? err.message : 'Runtime start failed',
        failureStage: 'runtime_start',
      };
    }
  },

  async stop() {
    if (!window.tutorApp) {
      return { stopped: false };
    }
    return window.tutorApp.stopRuntime();
  },

  async health() {
    if (!window.tutorApp) {
      return { healthy: false };
    }
    return window.tutorApp.runtimeHealth();
  },

  async preflight(): Promise<RuntimePreflightResult> {
    if (!window.tutorApp) {
      return { ok: false, phase: 'health', reason: 'tutorApp unavailable' };
    }
    return window.tutorApp.runtimePreflight();
  },

  async ensureStarted() {
    const health = await this.health();
    if (health.healthy) {
      const preflight = await this.preflight();
      if (preflight.ok) {
        return { started: true };
      }
      return {
        started: false,
        reason: preflight.reason || `Sidecar preflight failed (${preflight.phase || 'unknown'})`,
      };
    }

    const started = await this.start();
    if (!started.started) {
      return started;
    }

    const preflight = await this.preflight();
    if (!preflight.ok) {
      return {
        started: false,
        reason: preflight.reason || `Sidecar preflight failed (${preflight.phase || 'unknown'})`,
      };
    }
    return { started: true };
  },

  async createSession(chapterId: string) {
    const started = await this.ensureStarted();
    if (!started.started) {
      throw new Error(started.reason || 'Failed to start sidecar');
    }

    if (!window.tutorApp) {
      throw new Error('tutorApp API unavailable');
    }

    const data = await window.tutorApp.createRuntimeSession({ chapterId });
    return {
      sessionId: String(data.session_id),
      initialMessage: String(data.initial_message || ''),
    };
  },

  async streamMessage(sessionId: string, message: string, onEvent: (event: NormalizedStreamEvent) => void) {
    if (!window.tutorApp) {
      throw new Error('tutorApp API unavailable');
    }

    const baseUrl = normalizeBaseUrl(SIDECAR_BASE_URL);

    const response = await fetch(`${baseUrl}/api/session/${encodeURIComponent(sessionId)}/message/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    });

    if (!response.ok || !response.body) {
      const text = await response.text().catch(() => '');
      throw new Error(text || `Stream request failed (${response.status})`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split('\n\n');
      buffer = blocks.pop() || '';

      for (const block of blocks) {
        const lines = block
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line.startsWith('data:'));

        for (const line of lines) {
          const raw = line.replace(/^data:\s*/, '');
          const parsed = parseSsePayload(raw);
          if (!parsed) {
            continue;
          }
          const normalized = normalizeEvent(parsed);
          onEvent(normalized);

          if (normalized.type === 'companion_start') {
            onEvent({ type: 'roadmap_update', phase: 'start' });
          }
          if (normalized.type === 'companion_complete') {
            onEvent({ type: 'roadmap_update', phase: 'complete' });
          }
          if (normalized.type === 'done') {
            onEvent({ type: 'memo_update', phase: 'start', turnIndex: normalized.turnIndex });
            try {
              const report = await this.getDynamicReport(sessionId);
              onEvent({
                type: 'memo_update',
                phase: 'complete',
                turnIndex: normalized.turnIndex,
                report,
              });
            } catch {
              onEvent({
                type: 'memo_update',
                phase: 'complete',
                turnIndex: normalized.turnIndex,
                report: '',
              });
            }
          }
        }
      }
    }
  },

  async getDynamicReport(sessionId: string) {
    if (!window.tutorApp) {
      throw new Error('tutorApp API unavailable');
    }

    const baseUrl = normalizeBaseUrl(SIDECAR_BASE_URL);
    const response = await fetch(`${baseUrl}/api/session/${encodeURIComponent(sessionId)}/dynamic_report`);
    if (!response.ok) {
      throw new Error(`Get report failed (${response.status})`);
    }
    const data = await response.json();
    return String(data.report || '');
  },

  async endSession(sessionId: string) {
    if (!window.tutorApp) {
      throw new Error('tutorApp API unavailable');
    }

    const baseUrl = normalizeBaseUrl(SIDECAR_BASE_URL);
    const response = await fetch(`${baseUrl}/api/session/${encodeURIComponent(sessionId)}/end`, { method: 'POST' });
    if (!response.ok) {
      throw new Error(`End session failed (${response.status})`);
    }
    return response.json();
  },
};

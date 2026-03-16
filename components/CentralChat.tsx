import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Message, Chapter, SkipReason, SkipTaskResult } from '../types';
import { runtimeManager, NormalizedStreamEvent } from '../services/runtimeManager';
import SkipReasonModal from './SkipReasonModal';
import { syncQueue } from '../services/syncQueue';
import { fetchSessionState, fetchSessionStateById, listWorkspaceSubmittedFiles } from '../services/backendClient';
import { codeWorkspace } from '../services/codeWorkspace';
import { Bot, User, SendHorizontal, Loader2, Terminal, Maximize2, Minimize2, Copy, Check, Square, SkipForward } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vs } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface ChatInputInjection {
  id: number;
  text: string;
  send?: boolean;
  replace?: boolean;
}

interface CentralChatProps {
  chapter: Chapter;
  courseId: string;
  requestedSessionId?: string | null;
  onSessionIdChange?: (sessionId: string) => void;
  onStartCoding?: () => void;
  onRuntimeEvent?: (event: NormalizedStreamEvent) => void;
  onOpenInEditor?: (payload: { code: string; language?: string }) => void;
  injectedInput?: ChatInputInjection | null;
  onInjectedHandled?: (injectionId: number) => void;
  hasRemainingTasks?: boolean;
  onTaskSkipped?: (result: SkipTaskResult, reason?: string, reasonText?: string) => void;
}

const MAX_CHARS = 5000;

const CodeBlock: React.FC<{ code: string; language: string }> = ({ code, language }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <div className="relative group/code my-3 rounded-lg border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 bg-gray-50 border-b border-gray-200">
        <span className="text-xs text-gray-400">{language}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 px-2 py-0.5 text-xs text-gray-400 hover:text-gray-700 rounded transition-colors"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? '已复制' : '复制'}
        </button>
      </div>
      <SyntaxHighlighter
        children={code}
        style={vs}
        language={language}
        PreTag="div"
        customStyle={{
          margin: 0,
          borderRadius: 0,
          fontSize: '0.875rem',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
          overflowX: 'auto',
        }}
        codeTagProps={{
          style: {
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
          },
        }}
      />
    </div>
  );
};

const CentralChat: React.FC<CentralChatProps> = ({
  chapter,
  courseId,
  requestedSessionId,
  onSessionIdChange,
  onStartCoding,
  onRuntimeEvent,
  onOpenInEditor,
  injectedInput,
  onInjectedHandled,
  hasRemainingTasks = true,
  onTaskSkipped,
}) => {
  const chapterId = chapter.id.includes('/') ? chapter.id.split('/').pop()! : chapter.id;
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [sessionStarted, setSessionStarted] = useState(false);
  const [initProgress, setInitProgress] = useState(0);
  const [initMode, setInitMode] = useState<'idle' | 'creating' | 'restoring'>('idle');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [recovering, setRecovering] = useState(false);
  const [isSkipping, setIsSkipping] = useState(false);
  const [showSkipReasonModal, setShowSkipReasonModal] = useState(false);
  const [pendingSkipTaskId, setPendingSkipTaskId] = useState<string | null>(null);
  const handledInjectionIdRef = useRef<number | null>(null);
  const [expanded, setExpanded] = useState(false);
  const composingRef = useRef(false);
  const expandedTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Persist token usage per turn so it survives re-entry
  // Key: `${sessionId}:${turnIndex}` → { input, output }
  const tokenUsageCacheRef = useRef<Map<string, { input: number; output: number }>>(new Map());

  const getLatestBundleVersion = async (): Promise<string | undefined> => {
    try {
      const indexData = await window.tutorApp?.getBundleIndex();
      const entry = indexData?.chapter?.[chapter.id] ||
        indexData?.chapter?.[chapterId] ||
        Object.entries(indexData?.chapter || {}).find(([k]: [string, any]) => k.endsWith(`/${chapterId}`))?.[1] ||
        null;
      return entry?.version || undefined;
    } catch {
      return undefined;
    }
  };

  const isSyncableCodeFile = (name: string) => {
    const lower = String(name || '').toLowerCase();
    return lower.endsWith('.py') || lower.endsWith('.ipynb');
  };

  const restoreWorkspaceFilesFromBackend = async () => {
    const listing = await listWorkspaceSubmittedFiles();
    const candidates = (listing.files || [])
      .filter((file) => file.chapter_id === chapterId || file.chapter_id === chapter.id)
      .filter((file) => isSyncableCodeFile(file.filename))
      .filter((file) => Boolean(file.download_url))
      .sort((a, b) => Number(new Date(b.submitted_at)) - Number(new Date(a.submitted_at)));

    const latestByName = new Map<string, { filename: string; download_url?: string | null }>();
    for (const file of candidates) {
      if (!latestByName.has(file.filename)) {
        latestByName.set(file.filename, file);
      }
    }

    for (const file of latestByName.values()) {
      if (!file.download_url) continue;
      const response = await fetch(file.download_url);
      if (!response.ok) {
        console.warn('[CentralChat] Failed to download submitted file:', file.filename, response.status);
        continue;
      }
      const content = await response.text();
      await codeWorkspace.writeFile(chapter.id, file.filename, content);
    }
  };

  const autoResizeTextarea = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 300)}px`;
  };

  // Auto-resize textarea when inputValue changes programmatically (e.g. injection)
  useEffect(() => {
    if (!expanded) {
      requestAnimationFrame(() => autoResizeTextarea());
    }
  }, [inputValue, expanded]);

  // Focus expanded textarea when expanded mode opens
  useEffect(() => {
    if (expanded && expandedTextareaRef.current) {
      expandedTextareaRef.current.focus();
      const len = expandedTextareaRef.current.value.length;
      expandedTextareaRef.current.setSelectionRange(len, len);
    }
  }, [expanded]);

  const turnsToMessages = (
    turns: Array<{ user_message: string; companion_response: string; token_usage?: Record<string, { input_tokens: number; output_tokens: number }> }>,
    sid?: string,
  ): Message[] => {
    return turns.flatMap((t, idx) => {
      const result: Message[] = [];
      if (t.user_message && !t.user_message.startsWith('[系统：')) result.push({ role: 'user', text: t.user_message });
      if (t.companion_response) {
        // Prefer persisted token_usage from sidecar, fall back to in-memory cache
        let tokenUsage: { input: number; output: number } | undefined;
        if (t.token_usage) {
          const totalInput = Object.values(t.token_usage).reduce((s, v) => s + (v.input_tokens || 0), 0);
          const totalOutput = Object.values(t.token_usage).reduce((s, v) => s + (v.output_tokens || 0), 0);
          tokenUsage = { input: totalInput, output: totalOutput };
        } else {
          tokenUsage = sid ? tokenUsageCacheRef.current.get(`${sid}:${idx}`) : undefined;
        }
        result.push({ role: 'model', text: t.companion_response, ...(tokenUsage ? { tokenUsage } : {}) });
      }
      return result;
    });
  };

  const startInitProgress = (mode: 'creating' | 'restoring') => {
    setInitMode(mode);
    setIsInitializing(false);
    setRecovering(false);
    setIsLoading(true);
    setInitProgress(8);

    const timer = setInterval(() => {
      setInitProgress((p) => {
        if (p >= 92) {
          clearInterval(timer);
          return p;
        }
        const step = p < 40 ? 5 : p < 75 ? 3 : 1;
        return Math.min(92, p + step);
      });
    }, 350);

    return () => clearInterval(timer);
  };

  // Helper: reattach a known session (local or after restore) and set up chat state
  const reattachAndLoadSession = async (
    targetSessionId: string,
    cancelled: () => boolean,
    sessionBundleVersion?: string,
  ) => {
    await runtimeManager.reattachSession({
      sessionId: targetSessionId,
      chapterId,
      courseId,
      chapterScopeId: chapter.id,
      bundleVersion: sessionBundleVersion || null,
    });
    const [turns, report] = await Promise.all([
      runtimeManager.getSessionHistory(targetSessionId),
      runtimeManager.getDynamicReport(targetSessionId).catch(() => ''),
    ]);
    if (cancelled()) return;

    setSessionId(targetSessionId);
    const msgs = turnsToMessages(turns, targetSessionId);
    // Always prepend the initial bot greeting — it's not part of any turn
    setMessages([{ role: 'model', text: chapter.initialMessage }, ...msgs]);
    if (report) {
      onRuntimeEvent?.({ type: 'memo_update', phase: 'complete', report });
    }
    setSessionStarted(true);
  };

  // Helper: restore a session from backend state and reattach
  const restoreFromBackend = async (
    targetSessionId: string,
    state: {
      turns?: Array<{
        turn_index: number;
        user_message: string;
        companion_response: string;
        turn_outcome: Record<string, unknown>;
        created_at: string;
      }>;
      memory?: Record<string, unknown>;
      report_md?: string;
      agent_state?: Record<string, unknown> | null;
    },
    cancelled: () => boolean,
    sessionBundleVersion?: string,
  ) => {
    const stopProgress = startInitProgress('restoring');
    const recoveredTurns = state.turns || [];
    let sidecarTurns: Array<{ user_message: string; companion_response: string }> = [];
    let report = '';
    try {
      await window.tutorApp!.restoreSessionState({
        sessionId: targetSessionId,
        chapterId,
        turns: recoveredTurns,
        memoryJson: state.memory ?? {},
        reportMd: state.report_md ?? '',
        agentState: state.agent_state ?? undefined,
      });
      setInitProgress((p) => Math.max(p, 55));
      await restoreWorkspaceFilesFromBackend().catch((error) => {
        console.warn('[CentralChat] Failed to restore backend workspace files:', error);
      });
      setInitProgress((p) => Math.max(p, 75));
      await runtimeManager.reattachSession({
        sessionId: targetSessionId,
        chapterId,
        courseId,
        chapterScopeId: chapter.id,
        bundleVersion: sessionBundleVersion || null,
      });
      setInitProgress((p) => Math.max(p, 88));
      [sidecarTurns, report] = await Promise.all([
        runtimeManager.getSessionHistory(targetSessionId),
        runtimeManager.getDynamicReport(targetSessionId).catch(() => ''),
      ]);
    } finally {
      stopProgress();
    }
    if (cancelled()) return;
    setInitProgress(100);
    await new Promise((r) => setTimeout(r, 250));
    setSessionId(targetSessionId);
    const sourceTurns = sidecarTurns.length > 0 ? sidecarTurns : recoveredTurns.map((t) => ({
      user_message: t.user_message,
      companion_response: t.companion_response,
    }));
    const msgs = turnsToMessages(sourceTurns, targetSessionId);
    // Always prepend the initial bot greeting — it's not part of any turn
    setMessages([{ role: 'model', text: chapter.initialMessage }, ...msgs]);
    if (report) {
      onRuntimeEvent?.({ type: 'memo_update', phase: 'complete', report });
    }
    setSessionStarted(true);
  };

  // Helper: create a brand-new session
  const createNewSession = async (cancelled: () => boolean) => {
    const stopProgress = startInitProgress('creating');
    try {
      const bundleVersion = await getLatestBundleVersion();
      const created = await runtimeManager.createSession({
        chapterId,
        courseId,
        chapterScopeId: chapter.id,
        bundleVersion: bundleVersion || null,
      });
      if (cancelled()) return;
      setInitProgress(100);
      await new Promise((r) => setTimeout(r, 250));
      setSessionId(created.sessionId);
      onSessionIdChange?.(created.sessionId);
      setMessages([{ role: 'model', text: created.initialMessage || chapter.initialMessage }]);
      setSessionStarted(true);
    } catch (createErr) {
      if (cancelled()) return;
      console.warn('[CentralChat] Create session failed:', createErr);
      setSessionStarted(false);
    } finally {
      stopProgress();
    }
  };

  useEffect(() => {
    let cancelled = false;
    const isCancelled = () => cancelled;
    setIsInitializing(true);
    setRecovering(false);
    setIsLoading(false);
    setSessionStarted(false);
    setSessionId(null);
    setMessages([]);
    setInitProgress(0);
    setInitMode('idle');

    const init = async () => {
      try {
        setRecovering(true);

        // CASE 1: Explicit session requested (user clicked a specific session or auto-selected)
        if (requestedSessionId) {
          const knownSession = chapter.sessions?.find(s => s.sessionId === requestedSessionId);
          const sessionBundleVer = knownSession?.bundleVersion;

          // Try local sidecar first
          const localSessions = await runtimeManager.listSessions();
          const localMatch = localSessions.find((s) => s.session_id === requestedSessionId);

          if (localMatch) {
            await reattachAndLoadSession(requestedSessionId, isCancelled, sessionBundleVer);
            return;
          }

          // Not local -> fetch from backend by session ID and restore
          try {
            const state = await fetchSessionStateById(requestedSessionId);
            if (state.has_data && state.session_id) {
              await restoreFromBackend(requestedSessionId, state, isCancelled, sessionBundleVer);
              return;
            }
          } catch (err) {
            console.warn('[CentralChat] Backend session fetch by ID failed:', err);
          }

          // If specific session can't be found anywhere, fall through to create new
          await createNewSession(isCancelled);
          return;
        }

        // CASE 2: requestedSessionId is null -> user clicked "+" to force-create new session
        if (requestedSessionId === null) {
          await createNewSession(isCancelled);
          return;
        }

        // CASE 3: requestedSessionId is undefined -> first chapter open, use legacy auto-detect
        let backendChecked = false;
        try {
          const state = await fetchSessionState(chapterId, courseId);
          backendChecked = true;

          if (state.has_data && state.session_id) {
            const recoveredSessionId = String(state.session_id);
            const localSessions = await runtimeManager.listSessions();
            const localMatch = localSessions.find((s) => s.session_id === recoveredSessionId);

            if (localMatch) {
              await reattachAndLoadSession(recoveredSessionId, isCancelled);
              return;
            }

            // Backend has session but local is missing -> restore
            await restoreFromBackend(recoveredSessionId, state, isCancelled);
            return;
          }
        } catch (err) {
          if (cancelled) return;
          console.warn('[CentralChat] Backend recovery check failed:', err);
        }

        // Backend unavailable -> local fallback by chapter if possible.
        if (!backendChecked) {
          try {
            const sessions = await runtimeManager.listSessions();
            const existing = sessions.find(
              (s) => s.chapter_id === chapterId || s.chapter_id === chapter.id
            );
            if (existing) {
              await reattachAndLoadSession(existing.session_id, isCancelled);
              return;
            }
          } catch (localErr) {
            if (cancelled) return;
            console.warn('[CentralChat] Local fallback failed:', localErr);
          }
        }

        // No session anywhere -> auto-create
        await createNewSession(isCancelled);
      } catch (error) {
        if (cancelled) return;
        console.warn('Session check failed:', error);
      } finally {
        if (!cancelled) {
          setRecovering(false);
          setIsLoading(false);
          setIsInitializing(false);
        }
      }
    };

    init();

    return () => {
      cancelled = true;
    };
  }, [chapter.id, courseId, requestedSessionId]);

  const handleStartChapter = async () => {
    if (isLoading) return;
    setIsLoading(true);
    setInitProgress(0);

    try {
      // Check for existing sessions before creating a new one
      try {
        const state = await fetchSessionState(chapterId, courseId);
        if (state.has_data && state.session_id) {
          const targetSessionId = String(state.session_id);
          const localSessions = await runtimeManager.listSessions();
          const localMatch = localSessions.find((s) => s.session_id === targetSessionId);
          if (localMatch) {
            await reattachAndLoadSession(targetSessionId, () => false);
          } else {
            await restoreFromBackend(targetSessionId, state, () => false);
          }
          onSessionIdChange?.(targetSessionId);
          return;
        }
      } catch (err) {
        console.warn('[CentralChat] handleStartChapter: existing session check failed, will create new:', err);
      }

      // No existing session — create new
      const stopProgress = startInitProgress('creating');
      try {
        const bundleVersion = await getLatestBundleVersion();
        const created = await runtimeManager.createSession({
          chapterId,
          courseId,
          chapterScopeId: chapter.id,
          bundleVersion: bundleVersion || null,
        });
        stopProgress();
        setInitProgress(100);
        await new Promise((r) => setTimeout(r, 300));
        setSessionId(created.sessionId);
        onSessionIdChange?.(created.sessionId);
        setMessages([{ role: 'model', text: created.initialMessage || chapter.initialMessage }]);
        setSessionStarted(true);
      } catch (error) {
        stopProgress();
        throw error;
      }
    } catch (error) {
      setInitProgress(0);
      setSessionId(null);
      setMessages([{ role: 'model', text: `会话初始化失败：${error instanceof Error ? error.message : '未知错误'}` }]);
      setSessionStarted(true);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const appendToLatestModelMessage = (content: string) => {
    setMessages((prev) => {
      const next = [...prev];
      for (let i = next.length - 1; i >= 0; i -= 1) {
        if (next[i].role === 'model') {
          next[i] = { ...next[i], text: `${next[i].text || ''}${content}` };
          return next;
        }
      }
      next.push({ role: 'model', text: content });
      return next;
    });
  };

  const sendMessage = async (text: string) => {
    if (!text.trim() || !sessionId) {
      return false;
    }

    const userMsg: Message = {
      role: 'user',
      text,
    };

    setMessages((prev) => [...prev, userMsg, { role: 'model', text: '' }]);
    setIsLoading(true);

    const startTime = Date.now();
    let modelResponseText = '';
    let capturedTurnIndex: number | undefined;
    const tokenUsage: Record<string, { input: number; output: number }> = {};

    try {
      await runtimeManager.streamMessage(sessionId, userMsg.text, (event) => {
        onRuntimeEvent?.(event);

        if (event.type === 'companion_chunk') {
          modelResponseText += event.content || '';
          appendToLatestModelMessage(event.content || '');
        }
        if (event.type === 'error') {
          appendToLatestModelMessage(`\n\n[错误] ${event.message}`);
        }
        if (event.type === 'llm_error') {
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.role === 'model' && !last.text) {
              return prev.slice(0, -1);
            }
            return prev;
          });
        }
        if (event.type === 'token_usage') {
          if (capturedTurnIndex === undefined) {
            capturedTurnIndex = event.turnIndex;
          }
          const agent = event.agent as string;
          if (!tokenUsage[agent]) {
            tokenUsage[agent] = { input: 0, output: 0 };
          }
          tokenUsage[agent].input += event.inputTokens;
          tokenUsage[agent].output += event.outputTokens;
        }
        if (event.type === 'memo_update' && event.phase === 'complete' && event.report) {
          syncQueue.enqueueAnalytics({
            event_type: 'dynamic_report',
            event_time: new Date().toISOString(),
            course_id: courseId,
            chapter_id: chapterId,
            session_id: sessionId!,
            payload: {
              turn_index: capturedTurnIndex,
              report: event.report,
            },
          }).catch(() => {});
        }
      });

      // Attach token usage totals to the last model message
      const totalInput = Object.values(tokenUsage).reduce((s, v) => s + v.input, 0);
      const totalOutput = Object.values(tokenUsage).reduce((s, v) => s + v.output, 0);
      if (totalInput > 0 || totalOutput > 0) {
        if (capturedTurnIndex !== undefined && sessionId) {
          tokenUsageCacheRef.current.set(`${sessionId}:${capturedTurnIndex}`, { input: totalInput, output: totalOutput });
        }
        setMessages((prev) => {
          const next = [...prev];
          for (let i = next.length - 1; i >= 0; i--) {
            if (next[i].role === 'model') {
              next[i] = { ...next[i], tokenUsage: { input: totalInput, output: totalOutput } };
              break;
            }
          }
          return next;
        });
      }

      syncQueue.enqueueAnalytics({
        event_type: 'turn_complete',
        event_time: new Date().toISOString(),
        course_id: courseId,
        chapter_id: chapterId,
        session_id: sessionId!,
        payload: {
          turn_index: capturedTurnIndex,
          user_message: text,
          model_response: modelResponseText,
          response_time_ms: Date.now() - startTime,
          token_usage: tokenUsage,
        },
      })
        .then(() => syncQueue.flushAnalytics())
        .catch(() => {});

      return true;
    } catch (error) {
      // AbortError is expected when user cancels — not a real error
      if (error instanceof DOMException && error.name === 'AbortError') {
        return false;
      }
      appendToLatestModelMessage(`抱歉，遇到了一些错误，请重试。\n\n${error instanceof Error ? error.message : ''}`);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!injectedInput || !injectedInput.id || handledInjectionIdRef.current === injectedInput.id) {
      return;
    }
    handledInjectionIdRef.current = injectedInput.id;

    const text = String(injectedInput.text || '');
    if (!text.trim()) {
      onInjectedHandled?.(injectedInput.id);
      return;
    }

    const replace = Boolean(injectedInput.replace);
    const sendNow = Boolean(injectedInput.send);

    if (sendNow && sessionId && !isLoading) {
      setInputValue('');
      sendMessage(text).finally(() => {
        onInjectedHandled?.(injectedInput.id);
      });
      return;
    }

    const hasCode = text.includes('```') || text.split('\n').length > 5;
    setInputValue((prev) => {
      const newVal = (replace || !prev.trim()) ? text : `${prev}\n${text}`;
      return newVal.length <= MAX_CHARS ? newVal : newVal.slice(0, MAX_CHARS);
    });
    if (hasCode) setExpanded(true);
    onInjectedHandled?.(injectedInput.id);
  }, [injectedInput, sessionId, isLoading]);

  const handleInputChange = (val: string) => {
    setInputValue(val.length <= MAX_CHARS ? val : val.slice(0, MAX_CHARS));
  };

  const handleSend = async () => {
    const text = inputValue;
    if (!text.trim()) return;
    setInputValue('');
    setExpanded(false);
    // Reset textarea height after clearing
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    const sent = await sendMessage(text);
    if (!sent) {
      setInputValue(text);
    }
  };

  const handleSkipTask = async () => {
    if (!sessionId || isSkipping || isLoading || showSkipReasonModal) return;
    setIsSkipping(true);
    try {
      const result = await runtimeManager.skipTask(sessionId);
      if (result.needsReason) {
        setPendingSkipTaskId(result.skippedTaskId);
        setShowSkipReasonModal(true);
        return;
      }
      onTaskSkipped?.(result);
      await sendMessage('[TASK_SKIPPED]');
    } catch (err) {
      console.warn('[CentralChat] skipTask failed:', err);
    } finally {
      setIsSkipping(false);
    }
  };

  const handleSkipReasonConfirm = async (reason: SkipReason, reasonText?: string) => {
    setShowSkipReasonModal(false);
    if (!sessionId || !pendingSkipTaskId) return;
    setIsSkipping(true);
    try {
      const result = await runtimeManager.skipTask(sessionId, reason, reasonText);
      setPendingSkipTaskId(null);
      onTaskSkipped?.(result, reason, reasonText);
      await sendMessage('[TASK_SKIPPED]');
    } catch (err) {
      console.warn('[CentralChat] skipTask with reason failed:', err);
    } finally {
      setIsSkipping(false);
    }
  };

  const handleSkipReasonCancel = () => {
    setShowSkipReasonModal(false);
    setPendingSkipTaskId(null);
    setIsSkipping(false);
  };

  const handleStop = () => {
    // Tell the sidecar to cancel the current turn (discards it without
    // saving to history), then abort the HTTP stream on our side.
    if (sessionId) {
      runtimeManager.cancelMessage(sessionId);
    }

    setMessages((prev) => {
      const next = [...prev];
      // Remove empty model response at the end
      if (next.length > 0 && next[next.length - 1].role === 'model' && !next[next.length - 1].text.trim()) {
        next.pop();
      }
      // If the last model message has partial content, mark it as interrupted
      if (next.length > 0 && next[next.length - 1].role === 'model' && next[next.length - 1].text.trim()) {
        const last = next[next.length - 1];
        next[next.length - 1] = { ...last, interrupted: true };
      }
      return next;
    });
    // Note: setIsLoading(false) happens in sendMessage's finally block
    // when the AbortError is caught
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !composingRef.current && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleExpandedKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setExpanded(false);
      return;
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !composingRef.current && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSend();
    }
  };

  const markdownComponents = useMemo(() => ({
    code(props: any) {
      const { className, children, ...rest } = props;
      const match = /language-(\w+)/.exec(className || '');
      const rawCode = String(children).replace(/\n$/, '');
      const language = match?.[1] || 'text';
      const isBlock = !!match || rawCode.includes('\n');

      if (isBlock) {
        return <CodeBlock code={rawCode} language={language} />;
      }

      return (
        <code
          {...rest}
          className="bg-gray-100 px-1.5 py-0.5 rounded text-pink-600 text-[0.875rem]"
          style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace' }}
        >
          {children}
        </code>
      );
    },
  }), []);

  // Show spinner while checking for existing session
  if (isInitializing) {
    return (
      <div className="flex flex-col h-full bg-white items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-500">{recovering ? '正在恢复学习记录...' : '正在检查学习环境...'}</p>
        </div>
      </div>
    );
  }

  // Show landing screen when no session has been started yet
  if (!sessionStarted) {
    const initStepLabel =
      initMode === 'restoring'
        ? (
          initProgress < 35 ? '正在拉取云端会话...' :
          initProgress < 70 ? '正在恢复历史消息与报告...' :
          initProgress < 90 ? '正在同步提交代码...' :
          '即将进入对话...'
        )
        : (
          initProgress < 30 ? '正在连接 AI 助教...' :
          initProgress < 60 ? '正在加载课程内容...' :
          initProgress < 90 ? '正在准备对话环境...' :
          '即将开始...'
        );

    return (
      <div className="flex flex-col h-full bg-white items-center justify-center gap-6 px-8">
        <div className="text-center max-w-sm">
          <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-4">
            <Bot size={28} className="text-blue-500" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">{chapter.title}</h2>
          <p className="text-sm text-gray-500 leading-relaxed">
            点击下方按钮，与 AI 助教开启本章学习对话。
          </p>
        </div>

        {isLoading ? (
          <div className="w-full max-w-xs flex flex-col items-center gap-3">
            <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all duration-500 ease-out"
                style={{ width: `${initProgress}%` }}
              />
            </div>
            <p className="text-xs text-gray-400">{initStepLabel}</p>
          </div>
        ) : (
          <button
            onClick={handleStartChapter}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm shadow-sm transition-colors"
          >
            开启本章学习
          </button>
        )}
      </div>
    );
  }

  const charCount = inputValue.length;
  const charColorClass = charCount >= MAX_CHARS ? 'text-red-500' : charCount >= MAX_CHARS * 0.9 ? 'text-orange-500' : 'text-green-600';

  return (
    <div className="flex flex-col h-full bg-white relative">
      <div className="flex-1 overflow-y-auto p-4 sm:p-8 space-y-6">
        {(() => {
          const visibleMessages = messages.filter(msg => !(msg.role === 'model' && /^\[系统[：:]/.test(msg.text)));
          const lastMsg = visibleMessages[visibleMessages.length - 1];
          const lastIsBotResponse = lastMsg?.role === 'model' && !isLoading;

          return visibleMessages.map((msg, idx) => {
            const hasCodeBlock = msg.role === 'model' && msg.text.includes('```');
            const isLastBotMsg = lastIsBotResponse && msg.role === 'model' && idx === visibleMessages.length - 1;
            const showSkipBtn = isLastBotMsg && hasRemainingTasks && sessionId && !isSkipping;
            const hasActionBar = (hasCodeBlock && onStartCoding) || showSkipBtn;

            return (
              <div key={idx} className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 shadow-sm border ${
                    msg.role === 'user' ? 'bg-gray-900 text-white border-gray-800' : 'bg-white text-blue-600 border-gray-200'
                  }`}
                >
                  {msg.role === 'user' ? <User size={18} /> : <Bot size={20} />}
                </div>

                <div className={`flex flex-col min-w-0 max-w-[85%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                  <div
                    className={`p-4 sm:p-5 rounded-2xl shadow-sm min-w-0 max-w-full ${
                      msg.role === 'user' ? 'bg-gray-100 text-gray-900 rounded-tr-none' : 'bg-white border border-gray-100 rounded-tl-none shadow-md'
                    }`}
                  >
                    <div className="prose prose-sm max-w-none prose-p:leading-relaxed prose-pre:p-0 prose-pre:bg-transparent prose-pre:max-w-full prose-ul:my-2 prose-li:my-0.5" style={{ overflowWrap: 'anywhere' }}>
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={markdownComponents}
                      >
                        {msg.text}
                      </ReactMarkdown>
                    </div>

                    {hasActionBar && (
                      <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-2">
                        {hasCodeBlock && onStartCoding && (
                          <button
                            onClick={onStartCoding}
                            className="flex items-center gap-2 px-3 py-1.5 text-xs text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
                          >
                            <Terminal size={13} />
                            打开代码编辑器
                          </button>
                        )}
                        {showSkipBtn && (
                          <button
                            onClick={handleSkipTask}
                            className="flex items-center gap-2 px-3 py-1.5 text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                            title="跳过当前任务"
                          >
                            <SkipForward size={13} />
                            跳过当前任务
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  {msg.role === 'model' && msg.interrupted && (
                    <span className="text-[10px] text-red-400 mt-1 px-1">（已中断）</span>
                  )}
                  {msg.role === 'model' && msg.tokenUsage && (
                    <span className="text-[10px] text-gray-400 mt-1 px-1">
                      Token Usage: {msg.tokenUsage.input} in / {msg.tokenUsage.output} out
                    </span>
                  )}
                </div>
              </div>
            );
          });
        })()}
        {isLoading && !(messages.length > 0 && messages[messages.length - 1]?.role === 'model' && messages[messages.length - 1]?.text) && (
          <div className="flex gap-4">
            <div className="w-10 h-10 rounded-full bg-white border border-gray-200 flex items-center justify-center shrink-0 shadow-sm">
              <Loader2 size={20} className="animate-spin text-blue-500" />
            </div>
            <div className="p-4 bg-white border border-gray-100 rounded-2xl rounded-tl-none shadow-sm flex items-center">
              <span className="text-gray-400 text-sm">思考中...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 sm:p-6 bg-white border-t border-gray-100 z-10">
        <div className="max-w-4xl mx-auto">
          <div className="relative flex gap-3 items-end">
            {onStartCoding && (
              <button
                onClick={onStartCoding}
                className="p-3 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors shrink-0"
                title="打开代码编辑器"
              >
                <Terminal size={20} />
              </button>
            )}

            <div className="flex-1 relative shadow-sm rounded-2xl border border-gray-200 bg-gray-50 focus-within:ring-2 focus-within:ring-blue-100 focus-within:border-blue-400 transition-all">
              <textarea
                ref={textareaRef}
                value={inputValue}
                onChange={(e) => handleInputChange(e.target.value)}
                onKeyDown={handleKeyDown}
                onCompositionStart={() => { composingRef.current = true; }}
                onCompositionEnd={() => { composingRef.current = false; }}
                placeholder="输入你的问题或代码... (Shift+Enter 换行)"
                className="w-full pl-4 pr-20 py-3 bg-transparent border-none outline-none resize-none text-sm overflow-y-auto"
                style={{ minHeight: '50px', maxHeight: '300px' }}
                rows={1}
              />
              <div className="absolute right-2 bottom-2 flex items-center gap-1">
                <button
                  onClick={() => setExpanded(true)}
                  className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
                  title="展开编辑器"
                >
                  <Maximize2 size={14} />
                </button>
                {isLoading ? (
                  <button
                    onClick={handleStop}
                    className="p-1.5 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                    title="停止生成"
                  >
                    <Square size={14} fill="white" />
                  </button>
                ) : (
                  <button
                    onClick={handleSend}
                    disabled={!inputValue.trim() || !sessionId}
                    className="p-1.5 bg-gray-900 text-white rounded-lg hover:bg-black disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <SendHorizontal size={16} />
                  </button>
                )}
              </div>
            </div>
          </div>
          {charCount > 0 && (
            <div className="flex justify-end mt-1 pr-1">
              <span className={`text-xs ${charColorClass}`}>{charCount}/{MAX_CHARS}</span>
            </div>
          )}
        </div>
      </div>

      <SkipReasonModal
        isOpen={showSkipReasonModal}
        onConfirm={handleSkipReasonConfirm}
        onCancel={handleSkipReasonCancel}
      />

      {/* Expanded editor overlay */}
      {expanded && (
        <div className="absolute inset-0 z-20 bg-white flex flex-col">
          <div className="flex items-center justify-between px-6 py-3 border-b border-gray-100">
            <span className="text-sm font-medium text-gray-700">编辑消息</span>
            <span className="text-xs text-gray-400">
              Esc 收起 · {navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}+Enter 发送
            </span>
          </div>
          <div className="flex-1 p-4 sm:p-6 min-h-0">
            <textarea
              ref={expandedTextareaRef}
              value={inputValue}
              onChange={(e) => handleInputChange(e.target.value)}
              onKeyDown={handleExpandedKeyDown}
              onCompositionStart={() => { composingRef.current = true; }}
              onCompositionEnd={() => { composingRef.current = false; }}
              placeholder={"支持 Markdown 格式：**粗体** `代码` ```代码块```\n\nEnter 换行 · Ctrl+Enter 发送"}
              className="w-full h-full resize-none bg-gray-50 rounded-xl border border-gray-200 p-4 text-sm outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
            />
          </div>
          <div className="flex items-center justify-between px-6 py-3 border-t border-gray-100">
            <span className={`text-xs ${charColorClass}`}>{charCount}/{MAX_CHARS}</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setExpanded(false)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <Minimize2 size={14} />
                收起
              </button>
              <button
                onClick={handleSend}
                disabled={!inputValue.trim() || isLoading || !sessionId}
                className="flex items-center gap-1.5 px-4 py-1.5 text-sm bg-gray-900 text-white rounded-lg hover:bg-black disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <SendHorizontal size={14} />
                发送
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CentralChat;

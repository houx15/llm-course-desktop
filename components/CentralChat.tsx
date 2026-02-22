import React, { useEffect, useRef, useState } from 'react';
import { Message, Chapter } from '../types';
import { runtimeManager, NormalizedStreamEvent } from '../services/runtimeManager';
import { syncQueue } from '../services/syncQueue';
import { Bot, User, SendHorizontal, Loader2, Paperclip, Terminal } from 'lucide-react';
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
  onStartCoding?: () => void;
  onRuntimeEvent?: (event: NormalizedStreamEvent) => void;
  onOpenInEditor?: (payload: { code: string; language?: string }) => void;
  injectedInput?: ChatInputInjection | null;
  onInjectedHandled?: (injectionId: number) => void;
}

const CentralChat: React.FC<CentralChatProps> = ({
  chapter,
  courseId,
  onStartCoding,
  onRuntimeEvent,
  onOpenInEditor,
  injectedInput,
  onInjectedHandled,
}) => {
  const chapterId = chapter.id.includes('/') ? chapter.id.split('/').pop()! : chapter.id;
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const handledInjectionIdRef = useRef<number | null>(null);

  const autoResizeTextarea = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 300)}px`;
  };

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      try {
        // Check for an existing session for this chapter
        const sessions = await runtimeManager.listSessions();
        const existing = sessions.find((s) => s.chapter_id === chapter.id);

        if (existing) {
          await runtimeManager.reattachSession(existing.session_id, chapter.id);
          const [turns, report] = await Promise.all([
            runtimeManager.getSessionHistory(existing.session_id),
            runtimeManager.getDynamicReport(existing.session_id).catch(() => ''),
          ]);
          if (cancelled) return;
          setSessionId(existing.session_id);
          // Restore chat history
          if (turns.length === 0) {
            setMessages([{ role: 'model', text: chapter.initialMessage }]);
          } else {
            const msgs: Message[] = turns.flatMap((t) => {
              const result: Message[] = [];
              if (t.user_message) result.push({ role: 'user', text: t.user_message });
              if (t.companion_response) result.push({ role: 'model', text: t.companion_response });
              return result;
            });
            setMessages(msgs.length > 0 ? msgs : [{ role: 'model', text: chapter.initialMessage }]);
          }
          // Restore dynamic report in the roadmap panel
          if (report) {
            onRuntimeEvent?.({ type: 'memo_update', phase: 'complete', report });
          }
          return;
        }

        const created = await runtimeManager.createSession(chapter.id);
        if (cancelled) {
          return;
        }
        setSessionId(created.sessionId);
        setMessages([{ role: 'model', text: created.initialMessage || chapter.initialMessage }]);
      } catch (error) {
        if (cancelled) {
          return;
        }
        setSessionId(null);
        setMessages([{ role: 'model', text: `会话初始化失败：${error instanceof Error ? error.message : '未知错误'}` }]);
      }
    };

    init();

    return () => {
      cancelled = true;
    };
  }, [chapter.id]);

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
    if (!text.trim() || !sessionId || isLoading) {
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

    setInputValue((prev) => {
      if (replace || !prev.trim()) {
        return text;
      }
      return `${prev}\n${text}`;
    });
    onInjectedHandled?.(injectedInput.id);
  }, [injectedInput, sessionId, isLoading]);

  const handleSend = async () => {
    const text = inputValue;
    if (!text.trim()) return;
    setInputValue('');
    // Reset textarea height after clearing
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    const sent = await sendMessage(text);
    if (!sent) {
      setInputValue(text);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full bg-white relative">
      <div className="flex-1 overflow-y-auto p-4 sm:p-8 space-y-6">
        {messages.map((msg, idx) => {
          const hasCodeBlock = msg.role === 'model' && msg.text.includes('```');

          return (
            <div key={idx} className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 shadow-sm border ${
                  msg.role === 'user' ? 'bg-gray-900 text-white border-gray-800' : 'bg-white text-blue-600 border-gray-200'
                }`}
              >
                {msg.role === 'user' ? <User size={18} /> : <Bot size={20} />}
              </div>

              <div className={`flex flex-col max-w-[85%] lg:max-w-[85%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                <div
                  className={`p-4 sm:p-5 rounded-2xl shadow-sm overflow-hidden ${
                    msg.role === 'user' ? 'bg-gray-100 text-gray-900 rounded-tr-none' : 'bg-white border border-gray-100 rounded-tl-none shadow-md'
                  }`}
                >
                  {msg.role === 'user' ? (
                    <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{msg.text}</p>
                  ) : (
                    <div className="prose prose-sm max-w-none prose-p:leading-relaxed prose-pre:p-0 prose-pre:bg-transparent prose-ul:my-2 prose-li:my-0.5">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          code(props: any) {
                            const { className, children, ...rest } = props;
                            const match = /language-(\w+)/.exec(className || '');
                            const rawCode = String(children).replace(/\n$/, '');
                            const language = match?.[1] || 'text';
                            const isBlock = !!match || rawCode.includes('\n');

                            if (isBlock) {
                              return (
                                <div className="relative group/code">
                                  <SyntaxHighlighter
                                    {...rest}
                                    children={rawCode}
                                    style={vs}
                                    language={language}
                                    PreTag="div"
                                    customStyle={{ margin: '1em 0', borderRadius: '0.5rem', fontSize: '0.9em' }}
                                  />
                                </div>
                              );
                            }

                            return (
                              <code
                                {...rest}
                                className="bg-gray-100 px-1 py-0.5 rounded font-mono text-pink-600 text-[0.85em]"
                              >
                                {children}
                              </code>
                            );
                          },
                        }}
                      >
                        {msg.text}
                      </ReactMarkdown>
                    </div>
                  )}

                  {hasCodeBlock && onStartCoding && (
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      <button
                        onClick={onStartCoding}
                        className="flex items-center gap-2 px-3 py-1.5 text-xs text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
                      >
                        <Terminal size={13} />
                        打开代码编辑器
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {isLoading && (
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

      <div className="p-6 bg-white border-t border-gray-100 z-10">
        <div className="max-w-4xl mx-auto relative flex gap-3 items-end">
          <button className="p-3 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors" title="添加附件">
            <Paperclip size={20} />
          </button>

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
              onChange={(e) => { setInputValue(e.target.value); autoResizeTextarea(); }}
              onKeyDown={handleKeyDown}
              placeholder="输入你的问题或代码... (Shift+Enter 换行)"
              className="w-full pl-4 pr-12 py-3 bg-transparent border-none outline-none resize-none text-sm overflow-y-auto"
              style={{ minHeight: '50px', maxHeight: '300px' }}
              rows={1}
            />
            <button
              onClick={handleSend}
              disabled={!inputValue.trim() || isLoading || !sessionId}
              className="absolute right-2 bottom-2 p-1.5 bg-gray-900 text-white rounded-lg hover:bg-black disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <SendHorizontal size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CentralChat;

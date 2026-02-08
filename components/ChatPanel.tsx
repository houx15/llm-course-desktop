import React, { useState, useEffect, useRef } from 'react';
import { Message } from '../types';
import { runtimeManager } from '../services/runtimeManager';
import { Bot, User, Sparkles, X, SendHorizontal, Loader2, PanelRightClose } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface ChatPanelProps {
  chapterId: string;
  selectedContext: string | null;
  onClearContext: () => void;
  onClose: () => void;
}

const ChatPanel: React.FC<ChatPanelProps> = ({ chapterId, selectedContext, onClearContext, onClose }) => {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'model', text: '你好！我是本课程的 AI 助教。选中课程内容中的任何文本，点击“Ask AI”即可向我提问。' },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    runtimeManager
      .createSession(chapterId)
      .then((created) => {
        if (!cancelled) {
          setSessionId(created.sessionId);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSessionId(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [chapterId]);

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

  const handleSend = async () => {
    if (!inputValue.trim() || !sessionId || isLoading) return;

    const userMsg: Message = {
      role: 'user',
      text: inputValue,
      context: selectedContext || undefined,
    };

    const sendText = selectedContext ? `${inputValue}\n\n[上下文]\n${selectedContext}` : inputValue;

    setMessages((prev) => [...prev, userMsg, { role: 'model', text: '' }]);
    setInputValue('');
    setIsLoading(true);

    try {
      await runtimeManager.streamMessage(sessionId, sendText, (event) => {
        if (event.type === 'companion_chunk') {
          appendToLatestModelMessage(event.content || '');
        }
        if (event.type === 'error') {
          appendToLatestModelMessage(`\n\n[错误] ${event.message}`);
        }
      });
    } catch (error) {
      appendToLatestModelMessage(`抱歉，遇到了一些错误，请重试。\n\n${error instanceof Error ? error.message : ''}`);
    } finally {
      setIsLoading(false);
      onClearContext();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="p-3 border-b border-gray-100 flex items-center justify-between bg-white shrink-0">
        <div className="flex items-center gap-2">
          <div className="p-1 bg-blue-100 rounded-lg">
            <Sparkles size={16} className="text-blue-600" />
          </div>
          <span className="font-semibold text-gray-800 text-sm">AI 助教</span>
        </div>
        <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600">
          <PanelRightClose size={18} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50/50">
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                msg.role === 'user' ? 'bg-gray-800 text-white' : 'bg-blue-600 text-white'
              }`}
            >
              {msg.role === 'user' ? <User size={14} /> : <Bot size={14} />}
            </div>

            <div className={`flex flex-col max-w-[85%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
              {msg.context && (
                <div className="mb-1 text-xs text-gray-500 bg-yellow-50 border border-yellow-200 p-1.5 rounded truncate w-full max-w-full italic flex items-center gap-1">
                  <span className="font-semibold not-italic">引用:</span> "{msg.context.substring(0, 30)}..."
                </div>
              )}
              <div
                className={`p-3 rounded-2xl text-sm leading-relaxed shadow-sm ${
                  msg.role === 'user'
                    ? 'bg-white text-gray-800 border border-gray-200 rounded-tr-none'
                    : 'bg-blue-50 text-blue-900 border border-blue-100 rounded-tl-none'
                }`}
              >
                <ReactMarkdown>{msg.text}</ReactMarkdown>
              </div>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center shrink-0">
              <Bot size={14} className="text-white" />
            </div>
            <div className="p-3 bg-blue-50 rounded-2xl rounded-tl-none border border-blue-100 flex items-center">
              <Loader2 size={16} className="animate-spin text-blue-500" />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {selectedContext && (
        <div className="px-4 py-2 bg-blue-50 border-t border-blue-100 flex items-start justify-between gap-2 animate-in slide-in-from-bottom-2 shrink-0">
          <div className="flex-1 min-w-0">
            <span className="text-xs font-bold text-blue-600 block mb-0.5">已选中内容</span>
            <p className="text-xs text-gray-600 truncate italic">"{selectedContext}"</p>
          </div>
          <button onClick={onClearContext} className="text-gray-400 hover:text-gray-600">
            <X size={14} />
          </button>
        </div>
      )}

      <div className="p-4 bg-white border-t border-gray-100 shrink-0">
        <div className="relative">
          <textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入您的问题..."
            className="w-full pl-4 pr-12 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none text-sm min-h-[50px] max-h-[150px]"
            rows={1}
            style={{ minHeight: '50px' }}
          />
          <button
            onClick={handleSend}
            disabled={!inputValue.trim() || isLoading || !sessionId}
            className="absolute right-2 bottom-2 p-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <SendHorizontal size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatPanel;

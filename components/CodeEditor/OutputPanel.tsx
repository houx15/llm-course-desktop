import React, { useEffect, useMemo, useRef } from 'react';
import { SendHorizontal, Trash2 } from 'lucide-react';

export interface OutputChunk {
  id: string;
  stream: 'stdout' | 'stderr';
  data: string;
}

interface OutputPanelProps {
  chunks: OutputChunk[];
  code?: string;
  onClear: () => void;
  onSendToChatInput?: (message: string) => void;
}

const OutputPanel: React.FC<OutputPanelProps> = ({ chunks, code, onClear, onSendToChatInput }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  const hasOutput = chunks.length > 0;
  const renderedLines = useMemo(() => chunks, [chunks]);
  const outputText = useMemo(() => chunks.map((c) => c.data).join(''), [chunks]);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [chunks]);

  const handleSendToChat = () => {
    if (!onSendToChatInput) return;
    const trimmedCode = (code || '').trim();
    const trimmedOutput = outputText.trim();
    if (!trimmedCode && !trimmedOutput) return;

    let msg = '';
    if (trimmedCode) {
      msg += `代码：\n\`\`\`python\n${trimmedCode}\n\`\`\``;
    }
    if (trimmedOutput) {
      if (msg) msg += '\n';
      msg += `输出：\n\`\`\`\n${trimmedOutput}\n\`\`\``;
    }
    onSendToChatInput(msg);
  };

  return (
    <div className="flex flex-col h-full min-h-0 bg-[#101114] text-gray-100">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/10">
        <div className="text-[11px] text-gray-500">Run output</div>
        <div className="flex items-center gap-1">
          {onSendToChatInput && (
            <button
              onClick={handleSendToChat}
              disabled={!hasOutput && !(code || '').trim()}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] bg-white/10 hover:bg-white/20 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <SendHorizontal size={12} />
              发送到对话
            </button>
          )}
          <button
            onClick={onClear}
            disabled={!hasOutput}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] bg-white/10 hover:bg-white/20 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Trash2 size={12} />
            Clear
          </button>
        </div>
      </div>

      <div ref={containerRef} className="flex-1 min-h-0 overflow-y-auto px-3 py-2 font-mono text-[12px] leading-5">
        {!hasOutput && <div className="text-gray-500">Run your script to see output here.</div>}
        {renderedLines.map((line) => (
          <pre
            key={line.id}
            className={`whitespace-pre-wrap break-words ${
              line.stream === 'stderr' ? 'text-red-300' : 'text-gray-100'
            }`}
          >
            {line.data}
          </pre>
        ))}
      </div>
    </div>
  );
};

export default OutputPanel;

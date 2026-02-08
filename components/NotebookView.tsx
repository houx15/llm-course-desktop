import React, { useState, useEffect } from 'react';
import { ContentBlock } from '../types';
import { Play, RotateCw, ExternalLink } from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vs } from 'react-syntax-highlighter/dist/esm/styles/prism';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';

interface NotebookViewProps {
  blocks: ContentBlock[];
  colabLink?: string;
}

const NotebookView: React.FC<NotebookViewProps> = ({ blocks, colabLink }) => {
  const [localBlocks, setLocalBlocks] = useState<ContentBlock[]>(blocks);
  const [running, setRunning] = useState<string | null>(null);
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);

  // Sync state if props change (navigating between lessons)
  useEffect(() => {
    setLocalBlocks(blocks);
  }, [blocks]);

  const runCodeBlock = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setRunning(id);
    setActiveBlockId(id);
    
    // Simulate execution delay
    setTimeout(() => {
        setRunning(null);
        setLocalBlocks(prev => prev.map(block => {
            if (block.id === id) {
                // In a real app, output would be dynamic
                return { ...block, output: block.output || "Result: [0.8, 0.0, -0.8]" }; 
            }
            return block;
        }));
    }, 800);
  };

  const renderBlock = (block: ContentBlock, index: number) => {
    const isActive = activeBlockId === block.id;
    
    // 1. Render Markdown
    if (block.type === 'markdown') {
        return (
            <div 
                key={block.id} 
                className={`p-2 rounded-md border border-transparent transition-all ${isActive ? 'bg-blue-50/30 border-blue-100' : 'hover:bg-gray-50'}`}
                onClick={() => setActiveBlockId(block.id)}
            >
                <div className="prose prose-slate max-w-none prose-p:my-2 prose-headings:my-4">
                    <ReactMarkdown rehypePlugins={[rehypeRaw]}>{block.content}</ReactMarkdown>
                </div>
            </div>
        );
    }

    // 2. Render HTML
    if (block.type === 'html') {
        return (
            <div 
                key={block.id}
                className={`my-4 transition-all ${isActive ? 'ring-2 ring-blue-100 rounded-lg' : ''}`}
                onClick={() => setActiveBlockId(block.id)}
                dangerouslySetInnerHTML={{ __html: block.content }}
            />
        );
    }

    // 3. Render Code (Jupyter Style)
    const executionCount = block.output ? (index + 1) : null;
    return (
        <div 
          key={block.id} 
          className={`flex flex-row group my-2 ${isActive ? 'bg-blue-50/10' : ''}`}
          onClick={() => setActiveBlockId(block.id)}
        >
          {/* Left Prompt Column */}
          <div className="w-16 sm:w-20 shrink-0 flex flex-col items-end pr-2 pt-1 select-none">
            <div className="font-mono text-xs text-gray-500 pt-3">
               <span className="text-blue-700 font-semibold">In [{running === block.id ? '*' : (executionCount || ' ')}]:</span>
            </div>
          </div>

          {/* Content Column */}
          <div className="flex-1 min-w-0 pr-2 sm:pr-4">
            <div 
              className={`relative rounded-sm border transition-all duration-200 ${
                isActive 
                  ? 'border-blue-400 shadow-[0_0_0_1px_rgba(96,165,250,0.5)]' 
                  : 'border-transparent hover:border-gray-200'
              }`}
            >
                <div className="flex flex-col bg-[#F7F7F7] rounded-sm border border-gray-200 overflow-hidden relative">
                  {/* Code Editor Mock */}
                  <div className="relative group/editor">
                      <SyntaxHighlighter
                          language="python"
                          style={vs}
                          customStyle={{ 
                              margin: 0, 
                              padding: '16px', 
                              backgroundColor: '#F7F7F7', 
                              fontSize: '14px', 
                              fontFamily: '"JetBrains Mono", monospace',
                              border: 'none'
                          }}
                          codeTagProps={{ style: { fontFamily: '"JetBrains Mono", monospace' }}}
                          wrapLongLines={true}
                      >
                          {block.content}
                      </SyntaxHighlighter>
                      
                      {/* Run Button Overlay */}
                      <div className="absolute top-2 right-2 opacity-0 group-hover/editor:opacity-100 transition-opacity z-10">
                          <button 
                              onClick={(e) => runCodeBlock(block.id, e)}
                              className="p-1.5 bg-white border border-gray-200 rounded shadow-sm hover:bg-blue-50 hover:text-blue-600 transition-colors"
                              title="Run Cell"
                          >
                              {running === block.id ? <RotateCw size={14} className="animate-spin text-blue-600"/> : <Play size={14} />}
                          </button>
                      </div>
                  </div>
                </div>
            </div>

            {/* Code Output */}
            {block.output && (
              <div className="mt-2 flex flex-row">
                 <div className="w-full relative">
                      <div className="absolute -left-[4.5rem] sm:-left-[5.5rem] top-0 w-16 sm:w-20 text-right pr-2 font-mono text-xs text-red-600/80 pt-1 select-none">
                          Out[{executionCount}]:
                      </div>
                      <div className="font-mono text-sm text-gray-800 bg-white p-2 overflow-x-auto border-l-4 border-transparent hover:border-gray-200 transition-colors">
                          <pre className="whitespace-pre-wrap font-inherit">{block.output}</pre>
                      </div>
                 </div>
              </div>
            )}
          </div>
        </div>
    );
  };

  return (
    <div className="space-y-2 pb-20 font-sans">
      {colabLink && (
        <div className="flex justify-start mb-6 ml-16 sm:ml-20">
          <a 
            href={colabLink} 
            target="_blank" 
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-full shadow-sm hover:bg-gray-50 hover:border-blue-300 hover:text-blue-700 transition-all text-sm font-medium text-gray-700 group"
          >
            <img src="https://upload.wikimedia.org/wikipedia/commons/d/d0/Google_Colaboratory_SVG_Logo.svg" alt="Colab" className="w-5 h-5" />
            <span>Open in Colab</span>
            <ExternalLink size={14} className="text-gray-400 group-hover:text-blue-500" />
          </a>
        </div>
      )}

      {localBlocks.map((block, index) => renderBlock(block, index))}
    </div>
  );
};

export default NotebookView;
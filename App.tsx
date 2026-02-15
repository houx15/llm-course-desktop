import React, { useState, useEffect, useRef } from 'react';
import Sidebar from './components/Sidebar';
import CentralChat from './components/CentralChat';
import PhaseView from './components/PhaseView';
import RoadmapPanel from './components/RoadmapPanel';
import TopBar from './components/TopBar';
import AuthScreen from './components/AuthScreen';
import Dashboard from './components/Dashboard';
import { CodeEditorPanel } from './components/CodeEditor';
import { OutputChunk } from './components/CodeEditor';
import { authService } from './services/authService';
import { courseService } from './services/courseService';
import { updateManager } from './services/updateManager';
import { runtimeManager, NormalizedStreamEvent } from './services/runtimeManager';
import { syncQueue } from './services/syncQueue';
import { Phase, Chapter, CourseSummary, User } from './types';
import { Download, Terminal, ChevronUp } from 'lucide-react';

const App: React.FC = () => {
  // Auth State
  const [user, setUser] = useState<User | null>(null);

  // App View State
  const [view, setView] = useState<'dashboard' | 'course'>('dashboard');
  const [myCourses, setMyCourses] = useState<CourseSummary[]>([]);
  const [activeCourseId, setActiveCourseId] = useState<string | null>(null);

  // Course Navigation State (when in 'course' view)
  const [phases, setPhases] = useState<Phase[]>([]);
  const [currentPhase, setCurrentPhase] = useState<Phase | null>(null);
  const [currentChapter, setCurrentChapter] = useState<Chapter | null>(null); // Null means showing Phase Overview
  const [isCodeEditorOpen, setIsCodeEditorOpen] = useState(false);
  const [showResources, setShowResources] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [chapterRuntimeState, setChapterRuntimeState] = useState<
    Record<string, { dynamicReport: string; roadmapUpdating: boolean; memoUpdating: boolean }>
  >({});
  const [runtimeNotice, setRuntimeNotice] = useState('');
  const [editorWidths, setEditorWidths] = useState<Record<string, number>>({});
  const [isResizingEditor, setIsResizingEditor] = useState(false);
  const [chatInjections, setChatInjections] = useState<
    Record<string, { id: number; text: string; send?: boolean; replace?: boolean } | null>
  >({});
  const [codeInjections, setCodeInjections] = useState<Record<string, { id: number; code: string; language?: string } | null>>({});
  const [editorActiveFiles, setEditorActiveFiles] = useState<Record<string, string>>({});
  const [editorOutputs, setEditorOutputs] = useState<Record<string, OutputChunk[]>>({});
  const editorHostRef = useRef<HTMLDivElement>(null);
  const eventCounterRef = useRef(1);

  const parseReportLines = (report: string) =>
    report
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('#'));

  const deriveLearnerState = (report: string) => {
    const lines = parseReportLines(report);
    return lines[0] || '';
  };

  const deriveNextAdvice = (report: string) => {
    const lines = parseReportLines(report);
    const nextAdviceLine = lines.find((line) => /下一步|建议|建议动作|next/i.test(line));
    if (nextAdviceLine) {
      return nextAdviceLine.replace(/^[-*]\s*/, '');
    }
    return lines[1] || lines[0] || '';
  };

  const updateChapterModel = (chapterId: string, updater: (chapter: Chapter) => Chapter) => {
    setPhases((prev) =>
      prev.map((phase) => ({
        ...phase,
        chapters: phase.chapters.map((chapter) => (chapter.id === chapterId ? updater(chapter) : chapter)),
      }))
    );

    setCurrentPhase((prev) => {
      if (!prev) return prev;
      const hasChapter = prev.chapters.some((chapter) => chapter.id === chapterId);
      if (!hasChapter) return prev;
      return {
        ...prev,
        chapters: prev.chapters.map((chapter) => (chapter.id === chapterId ? updater(chapter) : chapter)),
      };
    });

    setCurrentChapter((prev) => (prev && prev.id === chapterId ? updater(prev) : prev));
  };

  const handleChapterRuntimeEvent = (chapterId: string, event: NormalizedStreamEvent) => {
    if (event.type === 'roadmap_update') {
      setChapterRuntimeState((prev) => ({
        ...prev,
        [chapterId]: {
          dynamicReport: prev[chapterId]?.dynamicReport || '',
          roadmapUpdating: event.phase === 'start',
          memoUpdating: prev[chapterId]?.memoUpdating || false,
        },
      }));

      if (event.phase === 'start') {
        updateChapterModel(chapterId, (chapter) => ({
          ...chapter,
          roadmap: {
            ...chapter.roadmap,
            statusSummary: {
              ...chapter.roadmap.statusSummary,
              learnerState: '正在生成本轮回答...',
            },
          },
        }));
      }
      return;
    }

    if (event.type === 'memo_update') {
      setChapterRuntimeState((prev) => ({
        ...prev,
        [chapterId]: {
          dynamicReport: event.phase === 'complete' ? String(event.report || '') : prev[chapterId]?.dynamicReport || '',
          roadmapUpdating: prev[chapterId]?.roadmapUpdating || false,
          memoUpdating: event.phase === 'start',
        },
      }));

      if (event.phase === 'complete') {
        const report = String(event.report || '');
        const learnerState = deriveLearnerState(report);
        const nextAdvice = deriveNextAdvice(report);

        updateChapterModel(chapterId, (chapter) => ({
          ...chapter,
          roadmap: {
            ...chapter.roadmap,
            nextAdvice: nextAdvice || chapter.roadmap.nextAdvice,
            statusSummary: {
              ...chapter.roadmap.statusSummary,
              round: event.turnIndex || chapter.roadmap.statusSummary.round,
              learnerState: learnerState || chapter.roadmap.statusSummary.learnerState || '学习报告已更新',
            },
          },
        }));
      }
      return;
    }

    if (event.type === 'done' || event.type === 'error') {
      setChapterRuntimeState((prev) => ({
        ...prev,
        [chapterId]: {
          dynamicReport: prev[chapterId]?.dynamicReport || '',
          roadmapUpdating: false,
          memoUpdating: false,
        },
      }));
    }
  };

  const nextEventId = () => {
    const next = eventCounterRef.current;
    eventCounterRef.current += 1;
    return next;
  };

  useEffect(() => {
    if (!isResizingEditor || !currentChapter) {
      return;
    }

    const onMouseMove = (event: MouseEvent) => {
      const host = editorHostRef.current;
      if (!host) return;
      const rect = host.getBoundingClientRect();
      const desired = rect.right - event.clientX;
      const nextWidth = Math.max(320, Math.min(rect.width - 380, desired));
      setEditorWidths((prev) => ({ ...prev, [currentChapter.id]: nextWidth }));
    };

    const onMouseUp = () => {
      setIsResizingEditor(false);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [isResizingEditor, currentChapter?.id]);

  // Check login status & load courses on mount
  useEffect(() => {
    const init = async () => {
      const restored = await authService.restoreUserSession();
      if (restored) {
        setUser(restored);
        await loadCourses();
      }
    };

    init().catch((err) => {
      console.warn('Session restore failed:', err);
    });

  }, []);

  useEffect(() => {
    if (!user) {
      return;
    }

    const syncOnLogin = async () => {
      try {
        await updateManager.syncAppBundles();
      } catch (err) {
        console.warn('App update check failed:', err);
      }

      try {
        const runtimeResult = await runtimeManager.start();
        if (!runtimeResult.started) {
          setRuntimeNotice(runtimeResult.reason || '本地运行时启动失败');
        } else {
          setRuntimeNotice('');
        }
      } catch (err) {
        console.warn('Runtime start failed:', err);
        setRuntimeNotice(err instanceof Error ? err.message : '本地运行时启动失败');
      }

      try {
        await syncQueue.flushAll();
      } catch (err) {
        console.warn('Initial sync flush failed:', err);
      }
    };

    syncOnLogin();
  }, [user]);

  useEffect(() => {
    if (!user) {
      return;
    }

    const flush = async () => {
      try {
        await syncQueue.flushAll();
      } catch (err) {
        console.warn('Periodic sync flush failed:', err);
      }
    };

    const timer = window.setInterval(flush, 30_000);
    const onOnline = () => {
      flush();
    };
    window.addEventListener('online', onOnline);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener('online', onOnline);
    };
  }, [user]);

  const loadCourses = async () => {
    try {
      const courses = await courseService.listMyCourses();
      setMyCourses(courses);
    } catch (err) {
      console.warn('Load courses failed:', err);
      setMyCourses([]);
    }
  };

  const handleAddCourse = async (data: { code: string; studentId: string; name: string }) => {
     if (!user) {
       return;
     }
     const newCourse: CourseSummary = await courseService.joinCourse(data.code);
     setMyCourses((prev) => [...prev, newCourse]);
  };

  const handleSelectCourse = async (courseId: string) => {
      setActiveCourseId(courseId);
      setView('course');
      // Reset course internal navigation
      const loadedPhases = await courseService.getCoursePhases(courseId);
      setPhases(loadedPhases);
      setChapterRuntimeState({});
      setCurrentPhase(loadedPhases[0] || null);
      setCurrentChapter(null);
      setIsCodeEditorOpen(false);
      setIsSidebarOpen(true);
  };

  // Handlers
  const handleLogout = async () => {
    try {
      await syncQueue.flushAll();
    } catch (err) {
      console.warn('Sync flush on logout failed:', err);
    }
    await authService.logout();
    setUser(null);
    setMyCourses([]);
    setRuntimeNotice('');
    setView('dashboard');
  };

  const handleSelectPhase = (phase: Phase) => {
    setCurrentPhase(phase);
    setCurrentChapter(null);
    setIsCodeEditorOpen(false);
  };

  const handleSelectChapter = async (chapter: Chapter, phase: Phase) => {
    const chapterCode = chapter.id.includes('/') ? chapter.id.split('/').pop() || chapter.id : chapter.id;
    const courseId = activeCourseId || phase.id;
    try {
      await updateManager.syncChapterBundles(courseId, chapterCode);
    } catch (err) {
      console.warn('Chapter update check failed:', err);
    }
    setCurrentPhase(phase);
    setCurrentChapter(chapter);
    setChapterRuntimeState((prev) => ({
      ...prev,
      [chapter.id]: prev[chapter.id] || { dynamicReport: '', roadmapUpdating: false, memoUpdating: false },
    }));
    setIsCodeEditorOpen(false);

    try {
      await syncQueue.enqueueProgress({
        course_id: courseId,
        chapter_id: chapterCode,
        status: 'IN_PROGRESS',
        task_snapshot: { selected_at: new Date().toISOString() },
      });
      await syncQueue.enqueueAnalytics({
        event_type: 'chapter_opened',
        event_time: new Date().toISOString(),
        course_id: courseId,
        chapter_id: chapterCode,
        payload: { source: 'desktop' },
      });
      await syncQueue.flushAll();
    } catch (err) {
      console.warn('Progress/analytics enqueue failed:', err);
    }
  };

  const handleStartPhase = () => {
    if (!currentPhase) {
      return;
    }
    // Find first unlocked chapter in current phase
    const firstUnlocked = currentPhase.chapters.find(c => c.status !== 'LOCKED');
    if (firstUnlocked) {
      setCurrentChapter(firstUnlocked);
    }
  };

  const openCodeEditor = () => {
    setIsCodeEditorOpen(true);
  };

  const pushChatInjection = (chapterId: string, text: string, send = false, replace = false) => {
    setChatInjections((prev) => ({
      ...prev,
      [chapterId]: {
        id: nextEventId(),
        text,
        send,
        replace,
      },
    }));
  };

  const handleOpenCodeFromChat = (chapterId: string, payload: { code: string; language?: string }) => {
    setIsCodeEditorOpen(true);
    setCodeInjections((prev) => ({
      ...prev,
      [chapterId]: {
        id: nextEventId(),
        code: payload.code,
        language: payload.language,
      },
    }));
  };

  const currentChapterId = currentChapter?.id || '';
  const editorWidth = currentChapter ? editorWidths[currentChapter.id] || 520 : 520;
  const currentChatInjection = currentChapterId ? chatInjections[currentChapterId] || null : null;
  const currentCodeInjection = currentChapterId ? codeInjections[currentChapterId] || null : null;
  const currentEditorOutput = currentChapterId ? editorOutputs[currentChapterId] || [] : [];
  const currentEditorFile = currentChapterId ? editorActiveFiles[currentChapterId] || '' : '';

  // Render Auth Screen if not logged in
  if (!user) {
    return <AuthScreen onLogin={(u) => { setUser(u); loadCourses(); }} />;
  }

  // Render Dashboard
  if (view === 'dashboard') {
     return (
        <div className="flex flex-col h-screen bg-gray-50 font-sans text-gray-900">
            <TopBar user={user} onLogout={handleLogout} />
            {runtimeNotice && (
              <div className="px-4 py-2 text-sm bg-red-50 text-red-700 border-b border-red-200">
                本地运行时异常：{runtimeNotice}
              </div>
            )}
            <Dashboard 
                user={user} 
                courses={myCourses} 
                onAddCourse={handleAddCourse}
                onSelectCourse={handleSelectCourse}
            />
        </div>
     );
  }

  // Render Course Interface
  return (
    <div className="flex flex-col h-screen bg-white overflow-hidden font-sans text-gray-900">
      <TopBar
        user={user}
        onLogout={handleLogout}
        onLogoClick={() => setView('dashboard')}
        onToggleSidebar={view === 'course' ? () => setIsSidebarOpen((prev) => !prev) : undefined}
        isSidebarOpen={isSidebarOpen}
      />
      {runtimeNotice && (
        <div className="px-4 py-2 text-sm bg-red-50 text-red-700 border-b border-red-200">
          本地运行时异常：{runtimeNotice}
        </div>
      )}

      <div className="flex flex-1 overflow-hidden relative">
        {isSidebarOpen && (
          <div className="w-[260px] shrink-0 h-full border-r border-gray-200 z-20 bg-gray-50">
            <Sidebar
              phases={phases}
              currentPhaseId={currentPhase?.id || null}
              currentChapterId={currentChapter?.id || null}
              onSelectPhase={handleSelectPhase}
              onSelectChapter={handleSelectChapter}
            />
          </div>
        )}

        <div className="flex-1 flex flex-col min-w-0 bg-white relative">
          <div ref={editorHostRef} className="flex-1 overflow-hidden relative flex min-w-0">
            {currentChapter ? (
              <>
                <div className="flex-1 min-w-0">
                  <CentralChat
                    chapter={currentChapter}
                    onStartCoding={openCodeEditor}
                    onRuntimeEvent={(event) => handleChapterRuntimeEvent(currentChapter.id, event)}
                    onOpenInEditor={(payload) => handleOpenCodeFromChat(currentChapter.id, payload)}
                    injectedInput={currentChatInjection}
                    onInjectedHandled={(injectionId) => {
                      setChatInjections((prev) => {
                        const current = prev[currentChapter.id];
                        if (!current || current.id !== injectionId) {
                          return prev;
                        }
                        return { ...prev, [currentChapter.id]: null };
                      });
                    }}
                  />
                </div>

                {isCodeEditorOpen && (
                  <div
                    onMouseDown={() => setIsResizingEditor(true)}
                    className="w-1 shrink-0 cursor-col-resize bg-gray-100 hover:bg-gray-300 transition-colors"
                  />
                )}
                <div
                  className="shrink-0 h-full overflow-hidden transition-[width] duration-200"
                  style={{ width: isCodeEditorOpen ? editorWidth : 0 }}
                >
                  <CodeEditorPanel
                    chapterId={currentChapter.id}
                    chapterTitle={currentChapter.title}
                    visible={isCodeEditorOpen}
                    initialOutputChunks={currentEditorOutput}
                    initialActiveFile={currentEditorFile}
                    codeInjection={currentCodeInjection}
                    onCodeInjectionHandled={(injectionId) => {
                      setCodeInjections((prev) => {
                        const current = prev[currentChapter.id];
                        if (!current || current.id !== injectionId) {
                          return prev;
                        }
                        return { ...prev, [currentChapter.id]: null };
                      });
                    }}
                    onActiveFileChange={(filename) =>
                      setEditorActiveFiles((prev) => ({
                        ...prev,
                        [currentChapter.id]: filename,
                      }))
                    }
                    onOutputChange={(chunks) =>
                      setEditorOutputs((prev) => ({
                        ...prev,
                        [currentChapter.id]: chunks,
                      }))
                    }
                    onSendOutputToChatInput={(message) => {
                      pushChatInjection(currentChapter.id, `Here is my code output:\n${message}`, false, false);
                    }}
                    onSendToTutor={(message) => {
                      pushChatInjection(currentChapter.id, message, true, true);
                    }}
                  />
                </div>
              </>
            ) : currentPhase ? (
              <div className="h-full overflow-y-auto w-full">
                <PhaseView phase={currentPhase} onStart={handleStartPhase} />
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-gray-400 w-full">正在加载课程内容...</div>
            )}
          </div>

          {currentChapter && (
            <div className="shrink-0 h-14 border-t border-gray-200 bg-white flex items-center justify-between px-6 z-30 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.02)]">
              <div className="relative">
                {showResources && (
                  <div className="absolute bottom-16 left-0 w-64 bg-white border border-gray-200 rounded-xl shadow-xl p-2 animate-in slide-in-from-bottom-2">
                    <h4 className="text-xs font-bold text-gray-500 uppercase px-3 py-2">本章资源</h4>
                    <div className="space-y-1">
                      {currentChapter.resources.length > 0 ? (
                        currentChapter.resources.map((res, i) => (
                          <a key={i} href={res.url} className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded text-sm text-blue-600">
                            <Download size={14} /> {res.title}
                          </a>
                        ))
                      ) : (
                        <div className="p-2 text-sm text-gray-400 italic">暂无资源</div>
                      )}
                    </div>
                  </div>
                )}
                <button
                  onClick={() => setShowResources(!showResources)}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
                >
                  <Download size={16} /> 本章资源
                  <ChevronUp size={14} className={`transition-transform ${showResources ? 'rotate-180' : ''}`} />
                </button>
              </div>

              <button
                onClick={() => {
                  setIsResizingEditor(false);
                  setIsCodeEditorOpen((prev) => !prev);
                }}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-full transition-colors ${
                  isCodeEditorOpen ? 'bg-gray-200 text-gray-700 hover:bg-gray-300' : 'bg-black text-white hover:bg-gray-800'
                }`}
              >
                <Terminal size={16} /> {isCodeEditorOpen ? '隐藏编辑器' : 'Code Editor'}
              </button>
            </div>
          )}
        </div>

        <div
          className={`w-[280px] shrink-0 border-l border-gray-200 bg-gray-50 transition-transform duration-300 ${
            currentChapter ? 'translate-x-0' : 'translate-x-full absolute right-0 h-full'
          }`}
        >
          {currentChapter && (
            <RoadmapPanel
              chapter={currentChapter}
              dynamicReport={chapterRuntimeState[currentChapter.id]?.dynamicReport || ''}
              isRoadmapUpdating={chapterRuntimeState[currentChapter.id]?.roadmapUpdating || false}
              isMemoUpdating={chapterRuntimeState[currentChapter.id]?.memoUpdating || false}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default App;

import { Chapter, CodeExecutionExitEvent, CodeExecutionOutputEvent, CodeWorkspaceFile } from '../types';

const buildTemplate = (chapter: Chapter) => {
  return `# ${chapter.title}\n# 本地练习脚本（自动生成）\n\n"""\n在这里编写本章的练习代码。\n你可以自由运行并把输出粘贴给 AI 助手。\n"""\n\nif __name__ == "__main__":\n    print("开始 ${chapter.title} 练习")\n`;
};

export const codeWorkspace = {
  defaultFilename(chapter: Pick<Chapter, 'id'>) {
    const chapterCode = chapter.id.includes('/') ? chapter.id.split('/').pop() || chapter.id : chapter.id;
    return `${chapterCode.replace(/[^\w\-.]/g, '_')}.py`;
  },

  async createFile(chapterId: string, filename: string, content: string) {
    if (!window.tutorApp) {
      throw new Error('tutorApp API unavailable');
    }
    return window.tutorApp.createCodeFile({ chapterId, filename, content });
  },

  async ensureChapterScript(chapter: Chapter) {
    const filename = this.defaultFilename(chapter);
    const content = buildTemplate(chapter);
    return this.createFile(chapter.id, filename, content);
  },

  async openPath(filePath: string) {
    if (!window.tutorApp) {
      throw new Error('tutorApp API unavailable');
    }
    return window.tutorApp.openCodePath(filePath);
  },

  async getWorkspaceDir(chapterId: string): Promise<string> {
    if (!window.tutorApp) {
      throw new Error('tutorApp API unavailable');
    }
    const result = await window.tutorApp.getCodeWorkspaceDir({ chapterId });
    return result.chapterDir;
  },

  async openJupyter(chapterId: string): Promise<{ started: boolean; reason?: string }> {
    if (!window.tutorApp) {
      throw new Error('tutorApp API unavailable');
    }
    return window.tutorApp.openJupyter({ chapterId });
  },

  async listFiles(chapterId: string): Promise<CodeWorkspaceFile[]> {
    if (!window.tutorApp) {
      throw new Error('tutorApp API unavailable');
    }
    const result = await window.tutorApp.listCodeFiles({ chapterId });
    return Array.isArray(result?.files) ? result.files : [];
  },

  async readFile(chapterId: string, filename: string): Promise<string> {
    if (!window.tutorApp) {
      throw new Error('tutorApp API unavailable');
    }
    const result = await window.tutorApp.readCodeFile({ chapterId, filename });
    return String(result?.content || '');
  },

  async writeFile(chapterId: string, filename: string, content: string) {
    if (!window.tutorApp) {
      throw new Error('tutorApp API unavailable');
    }
    return window.tutorApp.writeCodeFile({ chapterId, filename, content });
  },

  async execute(chapterId: string, code: string, options?: { filename?: string; timeoutMs?: number; env?: Record<string, string> }) {
    if (!window.tutorApp) {
      throw new Error('tutorApp API unavailable');
    }
    return window.tutorApp.executeCode({
      chapterId,
      code,
      filename: options?.filename,
      timeoutMs: options?.timeoutMs,
      env: options?.env,
    });
  },

  async kill(chapterId: string) {
    if (!window.tutorApp) {
      throw new Error('tutorApp API unavailable');
    }
    return window.tutorApp.killCodeExecution({ chapterId });
  },

  onOutput(listener: (event: CodeExecutionOutputEvent) => void) {
    if (!window.tutorApp) {
      return () => {};
    }
    return window.tutorApp.onCodeOutput(listener);
  },

  onExit(listener: (event: CodeExecutionExitEvent) => void) {
    if (!window.tutorApp) {
      return () => {};
    }
    return window.tutorApp.onCodeExit(listener);
  },
};

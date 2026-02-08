import { Chapter } from '../types';

const buildTemplate = (chapter: Chapter) => {
  return `# ${chapter.title}\n# 本地练习脚本（自动生成）\n\n"""\n在这里编写本章的练习代码。\n你可以自由运行并把输出粘贴给 AI 助手。\n"""\n\nif __name__ == "__main__":\n    print("开始 ${chapter.title} 练习")\n`;
};

export const codeWorkspace = {
  async ensureChapterScript(chapter: Chapter) {
    if (!window.tutorApp) {
      throw new Error('tutorApp API unavailable');
    }
    const filename = `${chapter.id.replace(/[\/]/g, '_')}.py`;
    const content = buildTemplate(chapter);
    return window.tutorApp.createCodeFile({
      chapterId: chapter.id,
      filename,
      content,
    });
  },

  async openPath(filePath: string) {
    if (!window.tutorApp) {
      throw new Error('tutorApp API unavailable');
    }
    return window.tutorApp.openCodePath(filePath);
  },
};

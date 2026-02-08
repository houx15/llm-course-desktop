import { Chapter, Phase, CompletionStatus } from '../types';

interface ChapterIndexEntry {
  courseId: string;
  chapterId: string;
  title: string;
}

interface ChapterContent {
  chapter_context: string;
  task_list: string;
  task_completion_principles: string;
  interaction_protocol?: string;
  socratic_vs_direct?: string;
}

const defaultRoadmap = {
  currentTask: '',
  nextAdvice: '',
  sections: [],
  statusSummary: { round: 0, learnerState: '' },
};

const buildInitialMessage = (content: ChapterContent): string => {
  const text = content.chapter_context.trim();
  if (!text) {
    return '欢迎开始本章学习！请告诉我你的准备情况。';
  }
  return text;
};

const normalizeTitle = (rawTitle: string, fallback: string) => {
  return rawTitle && rawTitle.trim().length > 0 ? rawTitle.trim() : fallback;
};

export const contentService = {
  async loadPhasesFromBundles(): Promise<Phase[] | null> {
    if (!window.tutorApp) {
      return null;
    }

    const chapters: ChapterIndexEntry[] = await window.tutorApp.listCurriculumChapters();
    if (!chapters || chapters.length === 0) {
      return null;
    }

    const chaptersByCourse = new Map<string, Chapter[]>();

    for (const entry of chapters) {
      const content = await window.tutorApp.getCurriculumChapterContent({
        courseId: entry.courseId,
        chapterId: entry.chapterId,
      }) as ChapterContent;

      const chapter: Chapter = {
        id: `${entry.courseId}/${entry.chapterId}`,
        title: normalizeTitle(entry.title, entry.chapterId),
        status: 'IN_PROGRESS',
        initialMessage: buildInitialMessage(content),
        roadmap: defaultRoadmap,
        resources: [],
        lessons: [],
      };

      const list = chaptersByCourse.get(entry.courseId) || [];
      list.push(chapter);
      chaptersByCourse.set(entry.courseId, list);
    }

    const phases: Phase[] = Array.from(chaptersByCourse.entries()).map(([courseId, courseChapters]) => {
      return {
        id: courseId,
        title: courseId,
        status: 'IN_PROGRESS' as CompletionStatus,
        overview: {
          experience: '',
          gains: '',
          necessity: '',
          journey: '',
        },
        chapters: courseChapters,
      };
    });

    return phases;
  },
};

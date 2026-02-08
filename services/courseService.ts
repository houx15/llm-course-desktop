import { Chapter, CompletionStatus, CourseSummary, Phase } from '../types';
import { backendClient } from './backendClient';
import { contentService } from './contentService';

interface BackendCourseSummary {
  id: string;
  title: string;
  course_code: string;
  instructor: string;
  semester: string;
  joined_at: string;
}

interface BackendCourseDetail {
  id: string;
  title: string;
  description: string;
  instructor: string;
}

interface BackendChapter {
  id: string;
  chapter_code: string;
  title: string;
  status: CompletionStatus;
  locked: boolean;
  order: number;
}

const defaultRoadmap = {
  currentTask: '',
  nextAdvice: '',
  sections: [],
  statusSummary: { round: 0, learnerState: '' },
};

const mapCourseSummary = (course: BackendCourseSummary): CourseSummary => ({
  id: course.id,
  title: course.title,
  code: course.course_code,
  instructor: course.instructor,
  semester: course.semester,
  description: '',
  joinedAt: course.joined_at,
});

const mapChapter = (courseId: string, chapter: BackendChapter): Chapter => ({
  id: `${courseId}/${chapter.chapter_code}`,
  title: chapter.title,
  status: chapter.status,
  initialMessage: '欢迎来到本章。请先描述你当前的理解与进度。',
  roadmap: defaultRoadmap,
  resources: [],
  lessons: [],
});

export const courseService = {
  async listMyCourses(): Promise<CourseSummary[]> {
    const response = await backendClient.get<{ courses: BackendCourseSummary[] }>('/v1/courses/my', true);
    return response.courses.map(mapCourseSummary);
  },

  async joinCourse(courseCode: string): Promise<CourseSummary> {
    const response = await backendClient.post<{ course: BackendCourseSummary }>(
      '/v1/courses/join',
      { course_code: courseCode },
      true
    );
    return mapCourseSummary(response.course);
  },

  async getCourse(courseId: string): Promise<BackendCourseDetail> {
    return backendClient.get<BackendCourseDetail>(`/v1/courses/${courseId}`, true);
  },

  async listChapters(courseId: string): Promise<BackendChapter[]> {
    const response = await backendClient.get<{ course_id: string; chapters: BackendChapter[] }>(
      `/v1/courses/${courseId}/chapters`,
      true
    );
    return response.chapters;
  },

  async getCoursePhases(courseId: string): Promise<Phase[]> {
    const bundlePhases = await contentService.loadPhasesFromBundles();
    if (bundlePhases && bundlePhases.length > 0) {
      const exact = bundlePhases.filter((phase) => phase.id === courseId);
      if (exact.length > 0) {
        return exact;
      }
      return bundlePhases;
    }

    const [course, chapters] = await Promise.all([this.getCourse(courseId), this.listChapters(courseId)]);

    return [
      {
        id: courseId,
        title: course.title,
        status: 'IN_PROGRESS',
        overview: {
          experience: '',
          gains: '',
          necessity: course.description || '',
          journey: '',
        },
        chapters: chapters.sort((a, b) => a.order - b.order).map((chapter) => mapChapter(courseId, chapter)),
      },
    ];
  },
};

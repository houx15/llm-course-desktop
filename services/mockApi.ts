import { CourseSummary, Phase, Message } from '../types';
import { contentService } from './contentService';
import { coursePhases } from '../data/mockData';

export interface MockUser {
  id: string;
  name: string;
  email: string;
  password: string;
}

const USERS_KEY = 'app_users';
const CURRENT_USER_KEY = 'current_user';

const loadUsers = (): MockUser[] => {
  try {
    return JSON.parse(localStorage.getItem(USERS_KEY) || '[]');
  } catch {
    return [];
  }
};

const saveUsers = (users: MockUser[]) => {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
};

const setCurrentUser = (user: MockUser) => {
  localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
};

const sessionKey = (sessionId: string) => `app_session_${sessionId}`;

const loadSessionMessages = (sessionId: string): Message[] => {
  try {
    return JSON.parse(localStorage.getItem(sessionKey(sessionId)) || '[]');
  } catch {
    return [];
  }
};

const saveSessionMessages = (sessionId: string, messages: Message[]) => {
  localStorage.setItem(sessionKey(sessionId), JSON.stringify(messages));
};

export const mockApi = {
  getCurrentUser(): MockUser | null {
    try {
      return JSON.parse(localStorage.getItem(CURRENT_USER_KEY) || 'null');
    } catch {
      return null;
    }
  },

  registerUser(input: Omit<MockUser, 'id'>): MockUser {
    const users = loadUsers();
    if (users.find((u) => u.email === input.email)) {
      throw new Error('该邮箱已被注册');
    }
    const newUser: MockUser = { ...input, id: Date.now().toString() };
    users.push(newUser);
    saveUsers(users);
    setCurrentUser(newUser);
    return newUser;
  },

  loginUser(email: string, password: string): MockUser {
    const users = loadUsers();
    const user = users.find((u) => u.email === email && u.password === password);
    if (!user) {
      throw new Error('邮箱或密码错误');
    }
    setCurrentUser(user);
    return user;
  },

  logoutUser() {
    localStorage.removeItem(CURRENT_USER_KEY);
  },

  listCourses(userId: string): CourseSummary[] {
    const coursesKey = `app_courses_${userId}`;
    try {
      return JSON.parse(localStorage.getItem(coursesKey) || '[]');
    } catch {
      return [];
    }
  },

  joinCourse(userId: string, data: { code: string; studentId: string; name: string }): CourseSummary {
    const newCourse: CourseSummary = {
      id: `course_${Date.now()}`,
      title: '计算社会科学与大语言模型',
      code: data.code.toUpperCase(),
      instructor: 'Prof. AI',
      semester: 'Fall 2024',
      description:
        '本课程旨在探索大语言模型（LLM）在社会科学研究中的应用。通过理论讲解与实战演练，学生将掌握利用 Python 和 AI 工具进行数据处理、文本分析及社会模拟的核心技能。',
      joinedAt: new Date().toLocaleDateString(),
    };

    const coursesKey = `app_courses_${userId}`;
    const existing = this.listCourses(userId);
    const updated = [...existing, newCourse];
    localStorage.setItem(coursesKey, JSON.stringify(updated));
    return newCourse;
  },

  async getCoursePhases(courseId: string): Promise<Phase[]> {
    const loaded = await contentService.loadPhasesFromBundles();
    if (loaded && loaded.length > 0) {
      return loaded;
    }
    return coursePhases;
  },

  createSession(chapterId: string): { sessionId: string } {
    const sessionId = `session_${chapterId}_${Date.now()}`;
    saveSessionMessages(sessionId, []);
    return { sessionId };
  },

  getSessionMessages(sessionId: string): Message[] {
    return loadSessionMessages(sessionId);
  },

  sendChatMessage(sessionId: string, userText: string, context?: string | null): { assistantMessage: string } {
    const messages = loadSessionMessages(sessionId);
    const userMessage: Message = { role: 'user', text: userText, context: context || undefined };

    const contextNote = context ? `\n\n你引用了内容：\n"${context}"\n` : '';
    const assistantMessage: Message = {
      role: 'model',
      text:
        `我已收到你的内容：\n\n${userText}\n\n` +
        `${contextNote}` +
        '请继续尝试当前任务，并把你的输出或报错贴给我。',
    };

    const updated = [...messages, userMessage, assistantMessage];
    saveSessionMessages(sessionId, updated);
    return { assistantMessage: assistantMessage.text };
  },
};

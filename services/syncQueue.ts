export const syncQueue = {
  async enqueueProgress(payload: {
    course_id: string;
    chapter_id: string;
    session_id?: string | null;
    status: 'LOCKED' | 'IN_PROGRESS' | 'COMPLETED';
    task_snapshot?: Record<string, any>;
  }) {
    if (!window.tutorApp) {
      return { queued: false, size: 0 };
    }
    return window.tutorApp.enqueueSync({ queue: 'progress', payload });
  },

  async enqueueAnalytics(event: {
    event_id?: string;
    event_type: string;
    event_time: string;
    course_id?: string;
    chapter_id?: string;
    session_id?: string;
    payload?: Record<string, any>;
  }) {
    if (!window.tutorApp) {
      return { queued: false, size: 0 };
    }
    return window.tutorApp.enqueueSync({ queue: 'analytics', payload: event });
  },

  async flushProgress() {
    if (!window.tutorApp) {
      return { queue: 'progress', sent: 0, remaining: 0 };
    }
    return window.tutorApp.flushSync({ queue: 'progress', endpoint: '/v1/progress/chapter' });
  },

  async flushAnalytics() {
    if (!window.tutorApp) {
      return { queue: 'analytics', sent: 0, remaining: 0 };
    }
    return window.tutorApp.flushSync({ queue: 'analytics', endpoint: '/v1/analytics/events:ingest' });
  },

  async flushAll() {
    const [progress, analytics] = await Promise.all([this.flushProgress(), this.flushAnalytics()]);
    return { progress, analytics };
  },
};

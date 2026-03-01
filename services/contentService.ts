import { Phase } from '../types';

export const contentService = {
  /**
   * Previously loaded phases from a curriculum bundle. With the redesign,
   * course metadata comes from the backend API and chapter content comes
   * from per-chapter bundles (read per-session). This always returns null
   * so courseService.getCoursePhases() uses the backend API path.
   */
  async loadPhasesFromBundles(): Promise<Phase[] | null> {
    return null;
  },
};

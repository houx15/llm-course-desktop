/**
 * Configure @monaco-editor/react to use the locally bundled monaco-editor
 * instead of fetching from jsdelivr CDN (which is unreliable in China).
 *
 * This module must be imported before @monaco-editor/react's Editor component
 * is rendered. Vite will bundle the workers as separate chunks automatically.
 */

import * as monaco from 'monaco-editor';
import { loader } from '@monaco-editor/react';

import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';

self.MonacoEnvironment = {
  getWorker(_: string, label: string) {
    if (label === 'json') return new jsonWorker();
    if (label === 'typescript' || label === 'javascript') return new tsWorker();
    return new editorWorker();
  },
};

// Use local monaco-editor package — no CDN fetch needed
loader.config({ monaco });

export { default as Editor } from '@monaco-editor/react';

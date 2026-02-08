import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('tutorApp', {
  getVersion: () => ipcRenderer.invoke('app:getVersion'),
  openExternal: (url) => ipcRenderer.invoke('app:openExternal', url),

  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
  chooseStorageRoot: () => ipcRenderer.invoke('settings:chooseStorageRoot'),

  getAuth: () => ipcRenderer.invoke('auth:get'),
  setAuth: (patch) => ipcRenderer.invoke('auth:set', patch),
  clearAuth: () => ipcRenderer.invoke('auth:clear'),

  saveLlmKey: (provider, key) => ipcRenderer.invoke('secrets:saveLlmKey', { provider, key }),
  getLlmKey: (provider) => ipcRenderer.invoke('secrets:getLlmKey', provider),
  deleteLlmKey: (provider) => ipcRenderer.invoke('secrets:deleteLlmKey', provider),

  backendRequest: (payload) => ipcRenderer.invoke('backend:request', payload),

  enqueueSync: (payload) => ipcRenderer.invoke('sync:enqueue', payload),
  flushSync: (payload) => ipcRenderer.invoke('sync:flush', payload),

  checkAppUpdates: (payload) => ipcRenderer.invoke('updates:checkApp', payload),
  checkChapterUpdates: (payload) => ipcRenderer.invoke('updates:checkChapter', payload),
  installBundle: (bundle) => ipcRenderer.invoke('bundles:install', bundle),
  installBundleRelease: (release) => ipcRenderer.invoke('bundles:installRelease', release),
  listBundles: (type) => ipcRenderer.invoke('bundles:list', type),
  getBundleIndex: () => ipcRenderer.invoke('bundles:getIndex'),

  listCurriculumChapters: () => ipcRenderer.invoke('curriculum:listChapters'),
  getCurriculumChapterContent: (payload) => ipcRenderer.invoke('curriculum:getChapterContent', payload),

  startRuntime: (config) => ipcRenderer.invoke('runtime:start', config),
  stopRuntime: () => ipcRenderer.invoke('runtime:stop'),
  runtimeHealth: () => ipcRenderer.invoke('runtime:health'),
  runtimePreflight: () => ipcRenderer.invoke('runtime:preflight'),
  createRuntimeSession: (payload) => ipcRenderer.invoke('runtime:createSession', payload),

  createCodeFile: (payload) => ipcRenderer.invoke('code:createFile', payload),
  openCodePath: (filePath) => ipcRenderer.invoke('code:openPath', filePath),
});

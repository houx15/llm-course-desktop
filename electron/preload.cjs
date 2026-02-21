// Preload script (CommonJS — required for sandbox: true)
const { contextBridge, ipcRenderer } = require('electron');

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

  checkSidecarBundle: () => ipcRenderer.invoke('sidecar:checkBundle'),
  ensureSidecarReady: () => ipcRenderer.invoke('sidecar:ensureReady'),
  onSidecarDownloadProgress: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('sidecar:download-progress', listener);
    return () => ipcRenderer.removeListener('sidecar:download-progress', listener);
  },

  startRuntime: (config) => ipcRenderer.invoke('runtime:start', config),
  stopRuntime: () => ipcRenderer.invoke('runtime:stop'),
  runtimeHealth: () => ipcRenderer.invoke('runtime:health'),
  runtimePreflight: () => ipcRenderer.invoke('runtime:preflight'),
  createRuntimeSession: (payload) => ipcRenderer.invoke('runtime:createSession', payload),

  createCodeFile: (payload) => ipcRenderer.invoke('code:createFile', payload),
  openCodePath: (filePath) => ipcRenderer.invoke('code:openPath', filePath),
  readCodeFile: (payload) => ipcRenderer.invoke('code:readFile', payload),
  writeCodeFile: (payload) => ipcRenderer.invoke('code:writeFile', payload),
  listCodeFiles: (payload) => ipcRenderer.invoke('code:listFiles', payload),
  executeCode: (payload) => ipcRenderer.invoke('code:execute', payload),
  killCodeExecution: (payload) => ipcRenderer.invoke('code:kill', payload),
  onCodeOutput: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('code:output', listener);
    return () => ipcRenderer.removeListener('code:output', listener);
  },
  onCodeExit: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('code:exit', listener);
    return () => ipcRenderer.removeListener('code:exit', listener);
  },
});

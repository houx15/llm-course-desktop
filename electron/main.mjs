import { app, BrowserWindow, dialog, ipcMain, safeStorage, shell } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import tar from 'tar';
import { spawn } from 'child_process';
import os from 'os';
import { createHash, randomUUID } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
const devServerUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:3000';
const appRoot = path.join(__dirname, '..');
const userDataDir = app.getPath('userData');
const settingsFilePath = path.join(userDataDir, 'settings.json');
const authFilePath = path.join(userDataDir, 'auth.store.json');
const secretsFilePath = path.join(userDataDir, 'secrets.store.json');

let runtimeProcess = null;
let mainWindow = null;
let refreshPromise = null;
let runtimeStderrBuffer = '';

const defaultSettings = () => ({
  storageRoot: app.getPath('userData'),
  backendBaseUrl: process.env.TUTOR_BACKEND_URL || 'http://127.0.0.1:10723',
  sidecarBaseUrl: process.env.TUTOR_SIDECAR_URL || 'http://127.0.0.1:8000',
  rememberLogin: true,
  rememberKeys: {},
  modelConfigs: {},
  activeProvider: 'gpt',
});

const defaultAuthState = () => ({
  deviceId: `desktop-${randomUUID()}`,
  accessToken: '',
  refreshToken: '',
  accessTokenExpiresAt: 0,
});

const getTutorRoot = (settings) => path.join(settings.storageRoot || app.getPath('userData'), 'TutorApp');
const getBundlesRoot = (settings) => path.join(getTutorRoot(settings), 'bundles');
const getWorkspaceRoot = (settings) => path.join(getTutorRoot(settings), 'workspace');
const getSessionsRoot = (settings) => path.join(getTutorRoot(settings), 'sessions');
const getQueueDir = (settings) => path.join(getTutorRoot(settings), 'queue');
const getIndexPath = (settings) => path.join(getTutorRoot(settings), 'active_index.json');

const safeJson = (text, fallback) => {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
};

const ensureDir = async (dir) => {
  await fs.mkdir(dir, { recursive: true });
};

const encryptString = (plain) => {
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(plain);
    return { encrypted: true, data: encrypted.toString('base64') };
  }
  return {
    encrypted: false,
    data: Buffer.from(plain, 'utf-8').toString('base64'),
  };
};

const decryptString = (record) => {
  if (!record || typeof record.data !== 'string') {
    return null;
  }
  if (record.encrypted) {
    try {
      const decrypted = safeStorage.decryptString(Buffer.from(record.data, 'base64'));
      return decrypted;
    } catch {
      return null;
    }
  }
  try {
    return Buffer.from(record.data, 'base64').toString('utf-8');
  } catch {
    return null;
  }
};

const loadPlainStore = async (filePath, fallback) => {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return safeJson(raw, fallback);
  } catch {
    return fallback;
  }
};

const savePlainStore = async (filePath, value) => {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), 'utf-8');
};

const loadSecureStore = async (filePath, fallback) => {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    const record = safeJson(raw, null);
    const decrypted = decryptString(record);
    if (!decrypted) {
      return fallback;
    }
    return safeJson(decrypted, fallback);
  } catch {
    return fallback;
  }
};

const saveSecureStore = async (filePath, value) => {
  await ensureDir(path.dirname(filePath));
  const plain = JSON.stringify(value);
  const encrypted = encryptString(plain);
  await fs.writeFile(filePath, JSON.stringify(encrypted, null, 2), 'utf-8');
};

const loadSettings = async () => {
  const stored = await loadPlainStore(settingsFilePath, defaultSettings());
  return { ...defaultSettings(), ...stored };
};

const saveSettings = async (patch) => {
  const current = await loadSettings();
  const next = { ...current, ...(patch || {}) };
  await savePlainStore(settingsFilePath, next);
  return next;
};

const loadAuthStore = async () => {
  const stored = await loadSecureStore(authFilePath, defaultAuthState());
  return { ...defaultAuthState(), ...stored };
};

const saveAuthStore = async (patch) => {
  const current = await loadAuthStore();
  const next = { ...current, ...(patch || {}) };
  await saveSecureStore(authFilePath, next);
  return next;
};

const clearAuthStore = async () => {
  const next = { ...defaultAuthState(), deviceId: (await loadAuthStore()).deviceId || `desktop-${randomUUID()}` };
  await saveSecureStore(authFilePath, next);
  return next;
};

const loadSecretStore = async () => {
  return loadSecureStore(secretsFilePath, {});
};

const saveSecretStore = async (value) => {
  await saveSecureStore(secretsFilePath, value);
  return value;
};

const sanitizeSegment = (input) => String(input || '').replace(/[^\w\-.]/g, '_');

const assertInside = (root, targetPath) => {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(targetPath);
  if (resolvedTarget === resolvedRoot || resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`)) {
    return resolvedTarget;
  }
  throw new Error('Path is outside allowed root');
};

const normalizeUrl = (baseUrl, requestPath) => {
  if (typeof requestPath !== 'string' || requestPath.length === 0) {
    throw new Error('Invalid request path');
  }
  if (/^https?:\/\//i.test(requestPath)) {
    return requestPath;
  }
  const cleanBase = String(baseUrl || '').replace(/\/+$/, '');
  const cleanPath = requestPath.startsWith('/') ? requestPath : `/${requestPath}`;
  return `${cleanBase}${cleanPath}`;
};

const parseBackendResponse = async (response) => {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json().catch(() => ({}));
  }
  return response.text().catch(() => '');
};

const executeBackendFetch = async ({ url, method, headers, body }) => {
  const response = await fetch(url, { method, headers, body });
  const parsed = await parseBackendResponse(response);
  return {
    ok: response.ok,
    status: response.status,
    data: parsed,
  };
};

const refreshAccessTokenIfNeeded = async (settings, auth) => {
  if (!auth?.refreshToken || !auth?.deviceId) {
    throw new Error('No refresh token');
  }

  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    const refreshUrl = normalizeUrl(settings.backendBaseUrl, '/v1/auth/refresh');
    const refreshResponse = await executeBackendFetch({
      url: refreshUrl,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Device-Id': auth.deviceId,
      },
      body: JSON.stringify({
        refresh_token: auth.refreshToken,
        device_id: auth.deviceId,
      }),
    });

    if (!refreshResponse.ok) {
      throw new Error('Refresh token request failed');
    }

    const accessToken = String(refreshResponse?.data?.access_token || '');
    const expiresIn = Number(refreshResponse?.data?.access_token_expires_in || 0);

    if (!accessToken) {
      throw new Error('Refresh token response missing access token');
    }

    const accessTokenExpiresAt = Date.now() + Math.max(0, expiresIn - 10) * 1000;
    return saveAuthStore({
      accessToken,
      accessTokenExpiresAt,
    });
  })();

  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
};

const requestBackend = async (payload = {}) => {
  const settings = await loadSettings();
  const auth = await loadAuthStore();

  const method = String(payload.method || 'GET').toUpperCase();
  const url = normalizeUrl(settings.backendBaseUrl, payload.path || payload.url);
  const headers = {
    ...(payload.headers || {}),
  };

  if (payload.withAuth !== false && auth.accessToken) {
    headers.Authorization = `Bearer ${auth.accessToken}`;
  }
  if (auth.deviceId) {
    headers['X-Device-Id'] = auth.deviceId;
  }

  let body;
  if (payload.body !== undefined && payload.body !== null) {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
    const contentType = String(headers['Content-Type'] || headers['content-type'] || '').toLowerCase();
    body = contentType.includes('application/json') ? JSON.stringify(payload.body) : payload.body;
  }

  const firstAttempt = await executeBackendFetch({ url, method, headers, body });
  const needsRefresh = payload.withAuth !== false && firstAttempt.status === 401 && auth.refreshToken;
  if (!needsRefresh) {
    return firstAttempt;
  }

  try {
    const refreshedAuth = await refreshAccessTokenIfNeeded(settings, auth);
    const retryHeaders = {
      ...headers,
      Authorization: refreshedAuth?.accessToken ? `Bearer ${refreshedAuth.accessToken}` : headers.Authorization,
    };
    return executeBackendFetch({ url, method, headers: retryHeaders, body });
  } catch {
    await clearAuthStore().catch(() => {});
    return firstAttempt;
  }
};

const queueFileFor = async (name) => {
  const settings = await loadSettings();
  const dir = getQueueDir(settings);
  await ensureDir(dir);
  const normalized = sanitizeSegment(name || 'default');
  return path.join(dir, `${normalized}.jsonl`);
};

const sha256File = async (filePath) => {
  const buffer = await fs.readFile(filePath);
  const hash = createHash('sha256');
  hash.update(buffer);
  return hash.digest('hex');
};

const downloadToTemp = async (url) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download artifact: ${response.status}`);
  }
  const data = Buffer.from(await response.arrayBuffer());
  const tempPath = path.join(os.tmpdir(), `bundle-${Date.now()}-${Math.random().toString(36).slice(2)}.tar.gz`);
  await fs.writeFile(tempPath, data);
  return tempPath;
};

const installBundleRelease = async (release) => {
  const settings = await loadSettings();
  const bundlesRoot = getBundlesRoot(settings);
  const bundleType = sanitizeSegment(release?.bundle_type || release?.bundleType || '');
  const scopeIdRaw = String(release?.scope_id || release?.scopeId || '').trim();
  const version = sanitizeSegment(release?.version || '');
  const artifactUrl = String(release?.artifact_url || release?.artifactUrl || '').trim();
  const expectedSha = String(release?.sha256 || '').toLowerCase();

  if (!bundleType || !scopeIdRaw || !version || !artifactUrl) {
    throw new Error('Invalid release payload');
  }

  const scopeParts = scopeIdRaw.split('/').map((part) => sanitizeSegment(part)).filter(Boolean);
  const scopePath = path.join(...scopeParts);
  const targetDir = path.join(bundlesRoot, bundleType, scopePath, version);
  const parentDir = path.dirname(targetDir);
  const tempExtractDir = `${targetDir}.tmp-${Date.now()}`;

  await ensureDir(parentDir);

  const downloadedPath = await downloadToTemp(artifactUrl);
  try {
    if (expectedSha) {
      const actual = await sha256File(downloadedPath);
      if (actual.toLowerCase() !== expectedSha) {
        throw new Error('Bundle checksum mismatch');
      }
    }

    await ensureDir(tempExtractDir);
    await tar.x({ file: downloadedPath, cwd: tempExtractDir });

    try {
      await fs.access(targetDir);
      await fs.rm(tempExtractDir, { recursive: true, force: true });
    } catch {
      await fs.rename(tempExtractDir, targetDir);
    }

    const indexData = await loadIndex();
    indexData[bundleType] = indexData[bundleType] || {};
    indexData[bundleType][scopeIdRaw] = {
      version,
      path: targetDir,
      sha256: expectedSha || null,
      installedAt: new Date().toISOString(),
    };
    await saveIndex(indexData);

    return { installedPath: targetDir, bundleType, scopeId: scopeIdRaw, version };
  } finally {
    await fs.rm(downloadedPath, { force: true }).catch(() => {});
  }
};

const readQueue = async (name) => {
  const filePath = await queueFileFor(name);
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return raw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => safeJson(line, null))
      .filter(Boolean);
  } catch {
    return [];
  }
};

const writeQueue = async (name, items) => {
  const filePath = await queueFileFor(name);
  const text = items.map((item) => JSON.stringify(item)).join('\n');
  await fs.writeFile(filePath, text ? `${text}\n` : '', 'utf-8');
};

const createWindow = async () => {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1080,
    minHeight: 720,
    backgroundColor: '#ffffff',
    title: 'LLM & 社会科学',
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (isDev) {
    const maxAttempts = 20;
    let attempt = 0;
    while (attempt < maxAttempts) {
      try {
        await mainWindow.loadURL(devServerUrl);
        break;
      } catch (err) {
        attempt += 1;
        if (attempt >= maxAttempts) {
          throw err;
        }
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    }
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    const indexPath = path.join(__dirname, '..', 'dist', 'index.html');
    await mainWindow.loadFile(indexPath);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
};

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.handle('app:getVersion', () => app.getVersion());
ipcMain.handle('app:openExternal', async (_event, url) => {
  if (typeof url === 'string' && url.length > 0) {
    await shell.openExternal(url);
    return true;
  }
  return false;
});

ipcMain.handle('settings:get', async () => {
  return loadSettings();
});

ipcMain.handle('settings:set', async (_event, patch) => {
  return saveSettings(patch || {});
});

ipcMain.handle('settings:chooseStorageRoot', async () => {
  const targetWindow = mainWindow || BrowserWindow.getFocusedWindow() || undefined;
  const result = await dialog.showOpenDialog(targetWindow, {
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled || !result.filePaths?.length) {
    return { canceled: true };
  }
  const selectedPath = result.filePaths[0];
  const next = await saveSettings({ storageRoot: selectedPath });
  return { canceled: false, path: selectedPath, settings: next };
});

ipcMain.handle('auth:get', async () => {
  return loadAuthStore();
});

ipcMain.handle('auth:set', async (_event, patch) => {
  return saveAuthStore(patch || {});
});

ipcMain.handle('auth:clear', async () => {
  return clearAuthStore();
});

ipcMain.handle('secrets:saveLlmKey', async (_event, payload) => {
  const provider = sanitizeSegment(payload?.provider || 'default');
  const key = String(payload?.key || '');
  const store = await loadSecretStore();
  store[provider] = key;
  await saveSecretStore(store);
  return { saved: true };
});

ipcMain.handle('secrets:getLlmKey', async (_event, provider) => {
  const normalized = sanitizeSegment(provider || 'default');
  const store = await loadSecretStore();
  return { key: store[normalized] || '' };
});

ipcMain.handle('secrets:deleteLlmKey', async (_event, provider) => {
  const normalized = sanitizeSegment(provider || 'default');
  const store = await loadSecretStore();
  delete store[normalized];
  await saveSecretStore(store);
  return { deleted: true };
});

ipcMain.handle('backend:request', async (_event, payload) => {
  return requestBackend(payload || {});
});

ipcMain.handle('sync:enqueue', async (_event, payload) => {
  const queue = sanitizeSegment(payload?.queue || 'default');
  const items = await readQueue(queue);
  items.push({
    id: randomUUID(),
    payload: payload?.payload || {},
    retries: 0,
    createdAt: Date.now(),
  });
  await writeQueue(queue, items);
  return { queued: true, size: items.length };
});

ipcMain.handle('sync:flush', async (_event, payload) => {
  const queue = sanitizeSegment(payload?.queue || 'default');
  const endpoint = String(payload?.endpoint || '');
  if (!endpoint) {
    throw new Error('Missing sync endpoint');
  }

  const items = await readQueue(queue);
  const remaining = [];
  let sent = 0;

  for (const item of items) {
    let body = item.payload;
    if (queue === 'analytics' && !body?.events) {
      body = { events: [item.payload] };
    }

    const result = await requestBackend({ method: 'POST', path: endpoint, body, withAuth: true });
    if (result.ok) {
      sent += 1;
    } else {
      remaining.push({ ...item, retries: (item.retries || 0) + 1, lastErrorStatus: result.status });
    }
  }

  await writeQueue(queue, remaining);
  return {
    queue,
    sent,
    remaining: remaining.length,
  };
});

ipcMain.handle('updates:checkApp', async (_event, payload) => {
  return requestBackend({
    method: 'POST',
    path: '/v1/updates/check-app',
    body: payload || {},
    withAuth: true,
  });
});

ipcMain.handle('updates:checkChapter', async (_event, payload) => {
  return requestBackend({
    method: 'POST',
    path: '/v1/updates/check-chapter',
    body: payload || {},
    withAuth: true,
  });
});

ipcMain.handle('bundles:install', async (_event, bundle) => {
  const { type, id, version, srcUrl } = bundle || {};
  if (!type || !id || !version || !srcUrl) {
    throw new Error('Missing bundle parameters');
  }

  const settings = await loadSettings();
  const bundlesRoot = getBundlesRoot(settings);
  const bundlePath = path.isAbsolute(srcUrl) ? srcUrl : path.join(appRoot, srcUrl);
  const targetDir = path.join(bundlesRoot, sanitizeSegment(type), sanitizeSegment(id), sanitizeSegment(version));

  await ensureDir(targetDir);
  await tar.x({ file: bundlePath, cwd: targetDir });

  const indexData = await loadIndex();
  const typeKey = sanitizeSegment(type);
  const idKey = sanitizeSegment(id);
  indexData[typeKey] = indexData[typeKey] || {};
  indexData[typeKey][idKey] = { version, path: targetDir };
  await saveIndex(indexData);

  return { installedPath: targetDir };
});

ipcMain.handle('bundles:installRelease', async (_event, release) => {
  return installBundleRelease(release);
});

ipcMain.handle('bundles:getIndex', async () => {
  return loadIndex();
});

ipcMain.handle('bundles:list', async (_event, type) => {
  const settings = await loadSettings();
  const bundlesRoot = getBundlesRoot(settings);
  const typeDir = path.join(bundlesRoot, sanitizeSegment(type));
  try {
    const ids = await fs.readdir(typeDir);
    return ids;
  } catch {
    return [];
  }
});

ipcMain.handle('curriculum:listChapters', async () => {
  const indexData = await loadIndex();
  const curriculumEntries = Object.entries(indexData.curriculum || {});
  if (curriculumEntries.length === 0) {
    return [];
  }

  const [, entry] = curriculumEntries[0];
  const basePath = entry.path;
  const curriculumRoot = path.join(basePath, 'content', 'curriculum');

  const courseDirs = await fs.readdir(curriculumRoot, { withFileTypes: true });
  const chapters = [];

  for (const courseDir of courseDirs) {
    if (!courseDir.isDirectory()) continue;
    const courseId = courseDir.name;
    const chaptersPath = path.join(curriculumRoot, courseId);
    const chapterDirs = await fs.readdir(chaptersPath, { withFileTypes: true });
    for (const chapterDir of chapterDirs) {
      if (!chapterDir.isDirectory()) continue;
      const chapterId = chapterDir.name;
      const contextPath = path.join(chaptersPath, chapterId, 'chapter_context.md');
      let title = chapterId;
      try {
        const raw = await fs.readFile(contextPath, 'utf-8');
        const firstLine = raw.split('\n')[0].trim();
        if (firstLine.startsWith('# ')) {
          title = firstLine.replace(/^#\s+/, '').trim() || chapterId;
        }
      } catch {
        // fallback title
      }
      chapters.push({ courseId, chapterId, title });
    }
  }

  return chapters;
});

ipcMain.handle('curriculum:getChapterContent', async (_event, payload) => {
  const { courseId, chapterId } = payload || {};
  if (!courseId || !chapterId) {
    throw new Error('Missing courseId or chapterId');
  }

  const indexData = await loadIndex();
  const curriculumEntries = Object.entries(indexData.curriculum || {});
  if (curriculumEntries.length === 0) {
    throw new Error('No curriculum bundle installed');
  }

  const [, entry] = curriculumEntries[0];
  const chapterRoot = path.join(entry.path, 'content', 'curriculum', sanitizeSegment(courseId), sanitizeSegment(chapterId));
  const read = async (name) => {
    const filePath = path.join(chapterRoot, name);
    return fs.readFile(filePath, 'utf-8');
  };

  return {
    chapter_context: await read('chapter_context.md'),
    task_list: await read('task_list.md'),
    task_completion_principles: await read('task_completion_principles.md'),
  };
});

const resolveBundlePath = async (type) => {
  const indexData = await loadIndex();
  const entries = Object.entries(indexData[sanitizeSegment(type)] || {});
  if (entries.length === 0) {
    return null;
  }
  return entries[0][1].path;
};

const pathExists = async (candidatePath) => {
  try {
    await fs.access(candidatePath);
    return true;
  } catch {
    return false;
  }
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForSidecarHealthy = async (baseUrl, timeoutMs = 12000) => {
  const start = Date.now();
  let lastError = 'health timeout';

  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(`${String(baseUrl).replace(/\/+$/, '')}/health`);
      if (response.ok) {
        const data = await response.json().catch(() => ({}));
        return { healthy: true, data };
      }
      lastError = `health status ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'health check failed';
    }
    await sleep(250);
  }

  return { healthy: false, error: lastError };
};

const resolveRuntimeProjectRoot = async () => {
  const candidates = [
    process.env.TUTOR_SIDECAR_ROOT ? path.resolve(process.env.TUTOR_SIDECAR_ROOT) : '',
    path.join(appRoot, '..', 'demo'),
    path.join(appRoot, '..'),
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (await pathExists(path.join(candidate, 'app', 'server', 'main.py'))) {
      return candidate;
    }
  }

  return null;
};

const buildSidecarSessionContext = async (chapterId) => {
  const indexData = await loadIndex();
  const normalizedChapterId = String(chapterId || '').trim();
  const [courseId, chapterCode] = normalizedChapterId.includes('/')
    ? normalizedChapterId.split('/', 2)
    : ['', normalizedChapterId];
  const chapterScopeId = courseId ? `${courseId}/${chapterCode}` : chapterCode;

  const chapterEntry = indexData?.chapter?.[chapterScopeId] || null;
  const appAgentsEntry = indexData?.app_agents?.core || null;
  const expertsSharedEntry = indexData?.experts_shared?.shared || null;

  const expertBundlePaths = Object.entries(indexData?.experts || {}).reduce((acc, [expertId, info]) => {
    const value = info || {};
    if (value.path) {
      acc[expertId] = value.path;
    }
    return acc;
  }, {});

  const appAgentsPath = appAgentsEntry?.path ? String(appAgentsEntry.path) : '';
  const listGlobalCandidates = (filename) => {
    const candidates = [
      appAgentsPath ? path.join(appAgentsPath, 'content', 'agents', filename) : '',
      appAgentsPath ? path.join(appAgentsPath, 'content', 'agents', 'shared', filename) : '',
      appAgentsPath ? path.join(appAgentsPath, 'agents', filename) : '',
      appAgentsPath ? path.join(appAgentsPath, filename) : '',
      process.env.MAIN_AGENTS_DIR ? path.join(process.env.MAIN_AGENTS_DIR, filename) : '',
    ].filter(Boolean);
    return [...new Set(candidates)];
  };

  return {
    chapter_scope: {
      chapter_id: normalizedChapterId,
      course_id: courseId || null,
      chapter_code: chapterCode || null,
      scope_id: chapterScopeId || normalizedChapterId,
    },
    bundle_paths: {
      chapter_bundle_path: chapterEntry?.path || null,
      app_agents_path: appAgentsEntry?.path || null,
      experts_shared_path: expertsSharedEntry?.path || null,
      expert_bundle_paths: expertBundlePaths,
    },
    prompt_sources: {
      interaction_protocol_candidates: listGlobalCandidates('interaction_protocol.md'),
      socratic_vs_direct_candidates: listGlobalCandidates('socratic_vs_direct.md'),
    },
  };
};

ipcMain.handle('runtime:start', async (_event, config) => {
  if (runtimeProcess) {
    const settings = await loadSettings();
    const health = await waitForSidecarHealthy(settings.sidecarBaseUrl, 1200);
    if (health.healthy) {
      return { started: true, pid: runtimeProcess.pid };
    }
    runtimeProcess.kill();
    runtimeProcess = null;
  }

  const settings = await loadSettings();
  const tutorRoot = getTutorRoot(settings);
  const pythonPath = config?.pythonPath || process.env.TUTOR_PYTHON || 'python';
  const curriculumBundle = await resolveBundlePath('curriculum');
  const expertsBundle = await resolveBundlePath('experts');
  const appAgentsBundle = await resolveBundlePath('app_agents');
  const runtimeCwd = await resolveRuntimeProjectRoot();

  if (!runtimeCwd) {
    return {
      started: false,
      reason: 'Cannot locate sidecar runtime root containing app/server/main.py',
    };
  }

  await ensureDir(getSessionsRoot(settings));

  const env = {
    ...process.env,
    LLM_PROVIDER: config?.llmProvider || 'custom',
    LLM_API_KEY: config?.llmApiKey || '',
    LLM_MODEL: config?.llmModel || '',
    LLM_BASE_URL: config?.llmBaseUrl || '',
    CURRICULUM_DIR: curriculumBundle ? path.join(curriculumBundle, 'content', 'curriculum') : '',
    EXPERTS_DIR: expertsBundle ? path.join(expertsBundle, 'experts') : '',
    MAIN_AGENTS_DIR: appAgentsBundle ? path.join(appAgentsBundle, 'content', 'agents') : process.env.MAIN_AGENTS_DIR || '',
    SESSIONS_DIR: getSessionsRoot(settings),
    HOST: '127.0.0.1',
    PORT: '8000',
    TUTOR_ROOT: tutorRoot,
  };

  runtimeProcess = spawn(
    pythonPath,
    ['-m', 'uvicorn', 'app.server.main:app', '--host', '127.0.0.1', '--port', '8000'],
    {
      cwd: runtimeCwd,
      env,
      stdio: 'pipe',
    }
  );

  runtimeStderrBuffer = '';
  runtimeProcess.stderr?.on('data', (chunk) => {
    const text = chunk?.toString?.() || '';
    if (!text) return;
    runtimeStderrBuffer = `${runtimeStderrBuffer}${text}`.slice(-4000);
  });

  runtimeProcess.on('exit', () => {
    runtimeProcess = null;
  });

  const health = await waitForSidecarHealthy(settings.sidecarBaseUrl, 12000);
  if (!health.healthy) {
    if (runtimeProcess) {
      runtimeProcess.kill();
      runtimeProcess = null;
    }
    return {
      started: false,
      reason: `Sidecar health check failed: ${health.error || 'unknown error'}`,
      stderr: runtimeStderrBuffer,
    };
  }

  return { started: true, pid: runtimeProcess.pid };
});

ipcMain.handle('runtime:stop', async () => {
  if (!runtimeProcess) {
    return { stopped: true };
  }
  runtimeProcess.kill();
  runtimeProcess = null;
  return { stopped: true };
});

ipcMain.handle('runtime:health', async () => {
  const settings = await loadSettings();
  const baseUrl = settings.sidecarBaseUrl || 'http://127.0.0.1:8000';
  try {
    const response = await fetch(`${String(baseUrl).replace(/\/+$/, '')}/health`);
    if (!response.ok) {
      return { healthy: false, status: response.status };
    }
    const data = await response.json();
    return { healthy: true, data };
  } catch (error) {
    return {
      healthy: false,
      error: error instanceof Error ? error.message : 'health check failed',
      stderr: runtimeStderrBuffer,
    };
  }
});

ipcMain.handle('runtime:createSession', async (_event, payload) => {
  const chapterId = String(payload?.chapterId || '').trim();
  if (!chapterId) {
    throw new Error('Missing chapterId');
  }

  const settings = await loadSettings();
  const baseUrl = String(settings.sidecarBaseUrl || 'http://127.0.0.1:8000').replace(/\/+$/, '');
  const desktopContext = await buildSidecarSessionContext(chapterId);

  const response = await fetch(`${baseUrl}/api/session/new`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      chapter_id: chapterId,
      desktop_context: desktopContext,
    }),
  });

  const parsed = await parseBackendResponse(response);
  if (!response.ok) {
    const detail =
      typeof parsed === 'string'
        ? parsed
        : parsed?.error?.message || parsed?.detail || `Create session failed (${response.status})`;
    throw new Error(String(detail));
  }

  return parsed;
});

ipcMain.handle('code:createFile', async (_event, payload) => {
  const settings = await loadSettings();
  const workspaceRoot = getWorkspaceRoot(settings);
  const chapterId = sanitizeSegment(payload?.chapterId);
  const rawFilename = String(payload?.filename || '');
  const filename = path.basename(rawFilename).replace(/[^\w\-.]/g, '_');
  const content = String(payload?.content || '');

  if (!chapterId || !filename) {
    throw new Error('Missing chapterId or filename');
  }

  const chapterDir = path.join(workspaceRoot, chapterId);
  await ensureDir(chapterDir);

  const filePath = assertInside(chapterDir, path.join(chapterDir, filename));

  try {
    await fs.access(filePath);
  } catch {
    await fs.writeFile(filePath, content, 'utf-8');
  }

  return { filePath };
});

ipcMain.handle('code:openPath', async (_event, filePath) => {
  if (!filePath) {
    return { opened: false };
  }

  const settings = await loadSettings();
  const tutorRoot = getTutorRoot(settings);
  const safePath = assertInside(tutorRoot, String(filePath));
  const result = await shell.openPath(safePath);
  return { opened: result === '' };
});

const loadIndex = async () => {
  const settings = await loadSettings();
  const indexPath = getIndexPath(settings);
  try {
    const raw = await fs.readFile(indexPath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return {
      curriculum: {},
      agents: {},
      experts: {},
      app_agents: {},
      chapter: {},
      experts_shared: {},
    };
  }
};

const saveIndex = async (data) => {
  const settings = await loadSettings();
  const tutorRoot = getTutorRoot(settings);
  const indexPath = getIndexPath(settings);
  await ensureDir(tutorRoot);
  await fs.writeFile(indexPath, JSON.stringify(data, null, 2), 'utf-8');
};

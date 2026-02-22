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

// Pin userData to ~/.knoweia so paths are identical in dev and prod,
// never contain spaces, and everything lives in one predictable place.
// Must be called before any app.getPath('userData') usage.
app.setPath('userData', path.join(os.homedir(), '.knoweia'));

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
const devServerUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:3000';
const appRoot = path.join(__dirname, '..');
const appIconPath = path.join(appRoot, 'assets', 'icon.png');
const userDataDir = app.getPath('userData'); // now always ~/.knoweia
const settingsFilePath = path.join(userDataDir, 'settings.json');
const authFilePath = path.join(userDataDir, 'auth.store.json');
const secretsFilePath = path.join(userDataDir, 'secrets.store.json');

let runtimeProcess = null;
let mainWindow = null;
let refreshPromise = null;
let runtimeStderrBuffer = '';
let runtimeStartConfig = null;
let runtimeIntentionalStop = false;
let runtimeRestartTimer = null;
let runtimeAutoRestartAttempts = 0;
const MAX_RUNTIME_AUTO_RESTART = 2;
let runtimeLaunchInfo = null;
const codeExecutionByChapter = new Map();
const DEFAULT_CODE_TIMEOUT_MS = 60_000;

const defaultSettings = () => ({
  storageRoot: app.getPath('userData'),
  rememberLogin: true,
  rememberKeys: {},
  modelConfigs: {},
  activeProvider: 'gpt',
  llmFormat: '',
  llmBaseUrl: '',
  devLocalSidecar: false,
});

// Fixed URL constants — not user-configurable
const BACKEND_BASE_URL = process.env.TUTOR_BACKEND_URL || 'http://47.93.151.131:10723';
const SIDECAR_BASE_URL = process.env.TUTOR_SIDECAR_URL || 'http://127.0.0.1:8000';

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

/**
 * One-time migration: if the new TutorApp dir doesn't exist yet but data
 * was left at a legacy path (e.g. ~/Library/Application Support/Electron/TutorApp
 * on macOS, where userData used to land before we pinned it to ~/.knoweia),
 * copy it over so existing bundles and the index are preserved.
 */
const migrateLegacyTutorAppData = async () => {
  const newTutorRoot = path.join(userDataDir, 'TutorApp');
  const newIndexPath = path.join(newTutorRoot, 'active_index.json');

  try {
    await fs.access(newIndexPath);
    return; // Already migrated
  } catch {
    // New index doesn't exist — look for legacy data
  }

  const legacyCandidates = [];
  if (process.platform === 'darwin') {
    legacyCandidates.push(
      path.join(os.homedir(), 'Library', 'Application Support', 'Electron', 'TutorApp'),
      path.join(os.homedir(), 'Library', 'Application Support', 'Knoweia', 'TutorApp'),
    );
  } else if (process.platform === 'win32') {
    const appData = process.env.APPDATA || '';
    if (appData) legacyCandidates.push(path.join(appData, 'Electron', 'TutorApp'));
  }

  for (const legacy of legacyCandidates) {
    try {
      await fs.access(path.join(legacy, 'active_index.json'));
      await ensureDir(newTutorRoot);
      await fs.cp(legacy, newTutorRoot, { recursive: true, errorOnExist: false });
      console.log(`[migration] Copied legacy TutorApp data from ${legacy} → ${newTutorRoot}`);
      return;
    } catch {
      // This candidate doesn't exist, try next
    }
  }
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

const normalizeWorkspaceRelativePath = (rawPath) => {
  const value = String(rawPath || '').trim();
  if (!value) {
    throw new Error('Missing filename');
  }
  if (path.isAbsolute(value)) {
    throw new Error('Absolute path is not allowed');
  }
  const normalized = path.normalize(value);
  if (normalized.startsWith('..') || normalized.includes(`${path.sep}..${path.sep}`) || normalized === '..') {
    throw new Error('Path traversal is not allowed');
  }
  return normalized;
};

const splitChapterId = (rawChapterId) => {
  const chapterId = String(rawChapterId || '').trim();
  if (!chapterId) {
    return { chapterId: '', courseId: '', chapterCode: '' };
  }
  const parts = chapterId.split('/').filter(Boolean);
  if (parts.length >= 2) {
    return {
      chapterId,
      courseId: sanitizeSegment(parts[0]),
      chapterCode: sanitizeSegment(parts[parts.length - 1]),
    };
  }
  return {
    chapterId,
    courseId: '',
    chapterCode: sanitizeSegment(parts[0] || chapterId),
  };
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

const isHttpUrl = (value) => /^https?:\/\//i.test(String(value || '').trim());

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
    const refreshUrl = normalizeUrl(BACKEND_BASE_URL, '/v1/auth/refresh');
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
  const url = normalizeUrl(BACKEND_BASE_URL, payload.path || payload.url);
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

const deadLetterFileFor = async (name) => {
  const settings = await loadSettings();
  const dir = getQueueDir(settings);
  await ensureDir(dir);
  const normalized = sanitizeSegment(name || 'default');
  return path.join(dir, `${normalized}.deadletter.jsonl`);
};

const sha256File = async (filePath) => {
  const buffer = await fs.readFile(filePath);
  const hash = createHash('sha256');
  hash.update(buffer);
  return hash.digest('hex');
};

const downloadToTemp = async (url, onProgress) => {
  if (!isHttpUrl(url)) {
    throw new Error(`Invalid artifact URL for download: ${url}`);
  }
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download artifact: ${response.status}`);
  }

  const totalBytes = Number(response.headers.get('content-length') || 0);
  const tempPath = path.join(os.tmpdir(), `bundle-${Date.now()}-${Math.random().toString(36).slice(2)}.tar.gz`);

  if (!response.body || !onProgress || !totalBytes) {
    const data = Buffer.from(await response.arrayBuffer());
    if (onProgress && totalBytes) {
      onProgress({ bytesDownloaded: data.length, totalBytes, percent: 100 });
    }
    await fs.writeFile(tempPath, data);
    return tempPath;
  }

  const reader = response.body.getReader();
  const chunks = [];
  let bytesDownloaded = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(Buffer.from(value));
    bytesDownloaded += value.length;
    const percent = totalBytes > 0 ? Math.round((bytesDownloaded / totalBytes) * 100) : 0;
    onProgress({ bytesDownloaded, totalBytes, percent });
  }

  await fs.writeFile(tempPath, Buffer.concat(chunks));
  return tempPath;
};

const resolveArtifactDownloadUrl = async (artifactRef) => {
  const raw = String(artifactRef || '').trim();
  if (!raw) {
    throw new Error('Missing artifact reference');
  }

  if (isHttpUrl(raw)) {
    return raw;
  }

  const result = await requestBackend({
    method: 'POST',
    path: '/v1/oss/resolve-artifact-url',
    body: {
      artifact: raw,
      expires_seconds: 900,
    },
    withAuth: true,
  });

  if (!result.ok) {
    throw new Error(`Resolve artifact URL failed (${result.status})`);
  }

  const resolved = String(result.data?.artifact_url || '').trim();
  if (!isHttpUrl(resolved)) {
    throw new Error('Resolved artifact URL is invalid');
  }
  return resolved;
};

const prefetchDownloadCredentials = async (release) => {
  try {
    const scopeIdRaw = String(release?.scope_id || release?.scopeId || '').trim();
    const bundleType = String(release?.bundle_type || release?.bundleType || '').trim();
    const version = String(release?.version || '').trim();
    const prefix = ['bundles', bundleType, scopeIdRaw, version].filter(Boolean).join('/') + '/';

    await requestBackend({
      method: 'POST',
      path: '/v1/oss/download-credentials',
      body: {
        duration_seconds: 900,
        allowed_prefixes: [prefix],
      },
      withAuth: true,
    });
  } catch {
    // Best-effort prefetch: desktop download can still proceed with public/signed URLs.
  }
};

const installBundleRelease = async (release, onProgress) => {
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

  await prefetchDownloadCredentials(release);
  const resolvedArtifactUrl = await resolveArtifactDownloadUrl(artifactUrl);
  const downloadedPath = await downloadToTemp(resolvedArtifactUrl, onProgress);
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

const appendDeadLetter = async (name, item, reason, status) => {
  const filePath = await deadLetterFileFor(name);
  const record = {
    id: item?.id || randomUUID(),
    queuedAt: item?.createdAt || Date.now(),
    deadLetteredAt: Date.now(),
    retries: item?.retries || 0,
    lastErrorStatus: status || null,
    reason: String(reason || 'unknown'),
    payload: item?.payload || {},
  };
  await fs.appendFile(filePath, `${JSON.stringify(record)}\n`, 'utf-8');
};

const isRetryableStatus = (status) => {
  if (!status) {
    return true;
  }
  if (status === 429) {
    return true;
  }
  if (status >= 500) {
    return true;
  }
  return false;
};

const computeBackoffMs = (retries) => {
  const baseMs = 1500;
  const maxMs = 2 * 60 * 1000;
  const raw = Math.min(baseMs * 2 ** Math.max(0, retries - 1), maxMs);
  const jitter = Math.floor(Math.random() * 300);
  return raw + jitter;
};

const createWindow = async () => {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1080,
    minHeight: 720,
    backgroundColor: '#ffffff',
    title: 'Knoweia',
    icon: appIconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
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

app.whenReady().then(async () => {
  await migrateLegacyTutorAppData();
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

app.on('before-quit', () => {
  runtimeIntentionalStop = true;
  if (runtimeRestartTimer) {
    clearTimeout(runtimeRestartTimer);
    runtimeRestartTimer = null;
  }
  if (runtimeProcess) {
    runtimeProcess.kill();
    runtimeProcess = null;
  }
  for (const chapterSegment of codeExecutionByChapter.keys()) {
    killCodeExecution(chapterSegment, true);
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
    nextAttemptAt: Date.now(),
  });
  await writeQueue(queue, items);
  return { queued: true, size: items.length };
});

ipcMain.handle('sync:flush', async (_event, payload) => {
  const queue = sanitizeSegment(payload?.queue || 'default');
  const endpoint = String(payload?.endpoint || '');
  const maxRetries = Math.max(1, Number(payload?.maxRetries || 5));
  if (!endpoint) {
    throw new Error('Missing sync endpoint');
  }

  const items = await readQueue(queue);
  const remaining = [];
  let sent = 0;
  let deferred = 0;
  let deadLettered = 0;
  const now = Date.now();

  for (const item of items) {
    const nextAttemptAt = Number(item?.nextAttemptAt || 0);
    if (nextAttemptAt > now) {
      remaining.push(item);
      deferred += 1;
      continue;
    }

    let body = item.payload;
    if (queue === 'analytics' && !body?.events) {
      body = { events: [item.payload] };
    }

    const result = await requestBackend({ method: 'POST', path: endpoint, body, withAuth: true });
    if (result.ok) {
      sent += 1;
    } else {
      const retries = Number(item?.retries || 0) + 1;
      const retryable = isRetryableStatus(result.status);
      const shouldDeadLetter = retries >= maxRetries || !retryable;
      if (shouldDeadLetter) {
        deadLettered += 1;
        await appendDeadLetter(queue, { ...item, retries }, retryable ? 'max retries exceeded' : 'non-retryable status', result.status);
      } else {
        remaining.push({
          ...item,
          retries,
          lastErrorStatus: result.status,
          nextAttemptAt: Date.now() + computeBackoffMs(retries),
        });
      }
    }
  }

  await writeQueue(queue, remaining);
  return {
    queue,
    sent,
    remaining: remaining.length,
    deferred,
    deadLettered,
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

const getPlatformScopeId = () => {
  const platform = process.platform === 'win32' ? 'win' : process.platform === 'darwin' ? 'darwin' : 'linux';
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
  return `py312-${platform}-${arch}`;
};

// ---------------------------------------------------------------------------
// Miniconda runtime management
// ---------------------------------------------------------------------------

const pathExists = async (candidatePath) => {
  try {
    await fs.access(candidatePath);
    return true;
  } catch {
    return false;
  }
};

// Conda must live in a space-free path — pip refuses to install into directories with spaces.
// macOS userData is ~/Library/Application Support/... (has space), so we use home dir instead.
// Conda lives alongside all other app data in userData (~/.knoweia/miniconda).
// On Windows, %APPDATA% can have spaces; use %LOCALAPPDATA% as a safer fallback.
const getCondaRoot = () => {
  if (process.platform === 'win32') {
    const base = process.env.LOCALAPPDATA || userDataDir;
    return path.join(base, 'knoweia', 'miniconda');
  }
  return path.join(userDataDir, 'miniconda');
};

const getCondaBin = (condaRoot) => process.platform === 'win32'
  ? path.join(condaRoot, 'Scripts', 'conda.exe')
  : path.join(condaRoot, 'bin', 'conda');

const getCondaEnvPython = (condaRoot) => process.platform === 'win32'
  ? path.join(condaRoot, 'envs', 'sidecar', 'Scripts', 'python.exe')
  : path.join(condaRoot, 'envs', 'sidecar', 'bin', 'python3');

const getCondaEnvPip = (condaRoot) => process.platform === 'win32'
  ? path.join(condaRoot, 'envs', 'sidecar', 'Scripts', 'pip.exe')
  : path.join(condaRoot, 'envs', 'sidecar', 'bin', 'pip');

const runSubprocess = (executable, args, options = {}) => new Promise((resolve, reject) => {
  const child = spawn(executable, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  });
  let stdout = '';
  let stderr = '';
  child.stdout?.on('data', (d) => { stdout += d.toString(); });
  child.stderr?.on('data', (d) => { stderr += d.toString(); });
  child.on('close', (code) => {
    if (code === 0) resolve({ code, stdout, stderr });
    else {
      const output = [stderr, stdout].filter(Boolean).join('\n').slice(-800);
      reject(new Error(`${path.basename(executable)} exited ${code}: ${output}`));
    }
  });
  child.on('error', reject);
});

const fetchRuntimeConfig = async () => {
  const platformScope = getPlatformScopeId();
  const result = await requestBackend({
    method: 'GET',
    path: `/v1/updates/runtime-config?platform_scope=${encodeURIComponent(platformScope)}`,
    withAuth: true,
  });
  if (!result.ok) {
    throw new Error(`Failed to fetch runtime config (${result.status})`);
  }
  return result.data;
};

const ensureCondaInstalled = async (condaRoot, runtimeConfig, sendProgress) => {
  const condaBin = getCondaBin(condaRoot);
  if (await pathExists(condaBin)) {
    return; // already installed
  }

  // Download installer
  const installerUrl = runtimeConfig.conda_installer_url;
  const ext = process.platform === 'win32' ? '.exe' : '.sh';
  const installerPath = path.join(os.tmpdir(), `miniconda-installer-${Date.now()}${ext}`);

  sendProgress('downloading_conda', { percent: 5, status: '正在下载 Python 环境...' });

  const response = await fetch(installerUrl);
  if (!response.ok) {
    throw new Error(`Miniconda download failed (${response.status}): ${installerUrl}`);
  }

  const totalBytes = Number(response.headers.get('content-length') || 0);
  const chunks = [];
  let bytesDownloaded = 0;

  if (response.body) {
    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(Buffer.from(value));
      bytesDownloaded += value.length;
      const rawPercent = totalBytes > 0 ? (bytesDownloaded / totalBytes) : 0;
      const displayPercent = Math.round(5 + rawPercent * 28);
      sendProgress('downloading_conda', {
        percent: displayPercent,
        bytesDownloaded,
        totalBytes,
        status: '正在下载 Python 环境...',
      });
    }
  } else {
    const data = Buffer.from(await response.arrayBuffer());
    chunks.push(data);
  }

  await fs.writeFile(installerPath, Buffer.concat(chunks));
  try {
    sendProgress('installing_conda', { percent: 35, status: '正在安装 Python 环境...' });

    // Silent install.
    // Only create the parent dir — the installer must create condaRoot itself.
    // Pre-creating condaRoot (even as an empty dir) makes the .sh installer fail
    // with "File or directory already exists" unless -u is passed.
    await ensureDir(path.dirname(condaRoot));
    if (process.platform === 'win32') {
      await runSubprocess(installerPath, ['/S', `/D=${condaRoot}`]);
    } else {
      await fs.chmod(installerPath, 0o755);
      // -u allows updating an existing (possibly partial) installation
      await runSubprocess('bash', [installerPath, '-b', '-u', '-p', condaRoot]);
    }

    // Write .condarc to use Tsinghua channels
    const condarc = [
      'default_channels:',
      ...runtimeConfig.conda_channels.map((ch) => `  - ${ch}`),
      'show_channel_urls: true',
    ].join('\n') + '\n';
    await fs.writeFile(path.join(condaRoot, '.condarc'), condarc, 'utf8');
  } finally {
    await fs.unlink(installerPath).catch(() => {});
  }

  sendProgress('installing_conda', { percent: 44, status: '正在安装 Python 环境...' });
};

const ensureCondaEnv = async (condaRoot, sendProgress) => {
  const envPython = getCondaEnvPython(condaRoot);
  if (await pathExists(envPython)) {
    return; // env already exists
  }

  sendProgress('creating_env', { percent: 45, status: '正在创建运行环境...' });

  const condaBin = getCondaBin(condaRoot);
  await runSubprocess(condaBin, [
    'create', '-n', 'sidecar', 'python=3.12', '--yes', '--quiet',
    '--override-channels',
    '--channel', 'https://mirrors.tuna.tsinghua.edu.cn/anaconda/pkgs/main',
  ]);

  sendProgress('creating_env', { percent: 54, status: '正在创建运行环境...' });
};

const ensureSidecarCode = async (condaRoot, runtimeConfig, sendProgress) => {
  // 1. Check current installed version from index
  const indexData = await loadIndex();
  const installedVersions = {
    app_agents: indexData?.app_agents?.core?.version || '',
    experts_shared: indexData?.experts_shared?.shared?.version || '',
    curriculum_templates: indexData?.app_agents?.curriculum_templates?.version || '',
    python_runtime: (() => {
      const entries = Object.values(indexData?.python_runtime || {});
      return entries.length > 0 ? String(entries[0]?.version || '') : '';
    })(),
  };

  sendProgress('downloading_sidecar', { percent: 55, status: '正在检查学习引擎版本...' });

  // 2. Call check-app to find if update is needed
  const checkResult = await requestBackend({
    method: 'POST',
    path: '/v1/updates/check-app',
    body: {
      desktop_version: app.getVersion() || '0.1.0',
      sidecar_version: installedVersions.python_runtime || '0.0.0',
      installed: installedVersions,
      platform_scope: getPlatformScopeId(),
    },
    withAuth: true,
  });

  if (!checkResult.ok) {
    if (installedVersions.python_runtime) return; // tolerate failure if already installed
    throw new Error(`Sidecar code check failed (${checkResult.status})`);
  }

  const allReleases = [
    ...(checkResult.data?.required || []),
    ...(checkResult.data?.optional || []),
  ];
  const sidecarRelease = allReleases.find((r) => r.bundle_type === 'python_runtime');

  if (!sidecarRelease) {
    if (installedVersions.python_runtime) return;
    throw new Error('No sidecar code bundle available from server');
  }

  // 3. Download and extract the bundle
  sendProgress('downloading_sidecar', { percent: 56, status: '正在下载学习引擎...' });

  let downloadComplete = false;
  await installBundleRelease(sidecarRelease, (progress) => {
    if (!downloadComplete) {
      const displayPercent = Math.round(56 + (progress.percent / 100) * 12);
      sendProgress('downloading_sidecar', {
        percent: displayPercent,
        bytesDownloaded: progress.bytesDownloaded,
        totalBytes: progress.totalBytes,
        status: '正在下载学习引擎...',
      });
      if (progress.percent >= 100) downloadComplete = true;
    }
  });

  // 4. Find the installed bundle root in the updated index
  const updatedIndex = await loadIndex();
  const prEntries = Object.entries(updatedIndex?.python_runtime || {}).filter(([, e]) => e?.path);
  if (prEntries.length === 0) {
    throw new Error('Sidecar bundle installed but not found in index');
  }
  const bundleRoot = String(prEntries[0][1].path);

  // 5. pip install requirements into the conda env
  const requirementsTxt = path.join(bundleRoot, 'requirements.txt');
  if (!await pathExists(requirementsTxt)) {
    throw new Error(`requirements.txt not found in sidecar bundle at ${requirementsTxt}`);
  }
  sendProgress('installing_deps', { percent: 70, status: '正在安装依赖包...' });
  const pipBin = getCondaEnvPip(condaRoot);
  await runSubprocess(pipBin, [
    'install', '-r', requirementsTxt,
    '--index-url', runtimeConfig.pip_index_url,
    '--trusted-host', 'mirrors.tuna.tsinghua.edu.cn',
    '--quiet',
  ]);
  sendProgress('installing_deps', { percent: 95, status: '正在安装依赖包...' });
};

ipcMain.handle('sidecar:checkBundle', async () => {
  const indexData = await loadIndex();
  const pythonRuntime = indexData?.python_runtime || {};
  const entries = Object.entries(pythonRuntime).filter(([, entry]) => entry?.path);

  for (const [scopeId, entry] of entries) {
    const bundlePath = String(entry.path || '');
    if (bundlePath && (await pathExists(bundlePath))) {
      return { installed: true, version: entry.version, scopeId, path: bundlePath };
    }
  }
  return { installed: false, version: null, scopeId: null };
});

let _ensureReadyPromise = null;

ipcMain.handle('sidecar:ensureReady', async () => {
  if (_ensureReadyPromise) return _ensureReadyPromise;
  _ensureReadyPromise = (async () => {
    const settings = await loadSettings();
    const tutorRoot = getTutorRoot(settings);
    const condaRoot = getCondaRoot();

    const sendProgress = (phase, progress) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('sidecar:download-progress', { phase, ...progress });
      }
    };

    try {
      sendProgress('checking', { percent: 0, status: '正在检查运行环境...' });

      const runtimeConfig = await fetchRuntimeConfig();

      // Stage 1: Miniconda installation (skipped if already present)
      await ensureCondaInstalled(condaRoot, runtimeConfig, sendProgress);

      // Stage 2: Conda sidecar env (skipped if already present)
      await ensureCondaEnv(condaRoot, sendProgress);

      // Stage 3: Sidecar code bundle + pip install (skipped if up to date)
      await ensureSidecarCode(condaRoot, runtimeConfig, sendProgress);

      sendProgress('done', { percent: 100, status: '准备就绪' });
      return { ready: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      sendProgress('error', { percent: 0, status: message });
      return { ready: false, error: message };
    }
  })().finally(() => {
    _ensureReadyPromise = null;
  });
  return _ensureReadyPromise;
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

// Returns course_overview.json from content/curriculum/{courseId}/course_overview.json
// Returns {} (empty) if the file does not exist — callers should treat missing fields as ''.
ipcMain.handle('curriculum:getCourseOverview', async (_event, payload) => {
  const { courseId } = payload || {};
  if (!courseId) throw new Error('Missing courseId');

  const indexData = await loadIndex();
  const curriculumEntries = Object.entries(indexData.curriculum || {});
  if (curriculumEntries.length === 0) return {};

  const [, entry] = curriculumEntries[0];
  const overviewPath = path.join(entry.path, 'content', 'curriculum', sanitizeSegment(courseId), 'course_overview.json');
  try {
    const raw = await fs.readFile(overviewPath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
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
  const readOptional = async (name) => {
    try {
      return await read(name);
    } catch {
      return '';
    }
  };

  return {
    chapter_context: await read('chapter_context.md'),
    task_list: await read('task_list.md'),
    task_completion_principles: await read('task_completion_principles.md'),
    interaction_protocol: await readOptional('interaction_protocol.md'),
    socratic_vs_direct: await readOptional('socratic_vs_direct.md'),
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

const readJsonIfExists = async (filePath) => {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return safeJson(raw, null);
  } catch {
    return null;
  }
};

const getPreferredBundleEntry = (map, preferredScopes = []) => {
  const entries = Object.entries(map || {}).filter(([, entry]) => entry?.path);
  if (entries.length === 0) {
    return null;
  }

  for (const scope of preferredScopes) {
    const hit = entries.find(([scopeId]) => String(scopeId).toLowerCase() === String(scope).toLowerCase());
    if (hit) {
      return { scopeId: hit[0], entry: hit[1] };
    }
  }

  return { scopeId: entries[0][0], entry: entries[0][1] };
};

const resolvePythonRuntimeBundle = async (indexData) => {
  const preferred = getPreferredBundleEntry(indexData?.python_runtime, ['core', 'default', 'standard', 'py312']);
  if (!preferred) {
    return null;
  }

  const bundleRoot = String(preferred.entry.path || '').trim();
  if (!bundleRoot) {
    return null;
  }

  const manifestNames = ['runtime.manifest.json', 'bundle.manifest.json', 'manifest.json'];
  let manifest = null;
  for (const name of manifestNames) {
    const candidate = path.join(bundleRoot, name);
    manifest = await readJsonIfExists(candidate);
    if (manifest) {
      break;
    }
  }

  const pythonManifestRel =
    manifest?.python?.executable_relpath || manifest?.python_executable_relpath || manifest?.pythonExecutableRelpath || '';
  const sidecarManifestRel =
    manifest?.sidecar?.root_relpath || manifest?.sidecar_root_relpath || manifest?.sidecarRootRelpath || '';

  const pythonCandidates = [
    pythonManifestRel ? path.join(bundleRoot, pythonManifestRel) : '',
    path.join(bundleRoot, 'python', 'bin', 'python3'),
    path.join(bundleRoot, 'python', 'bin', 'python'),
    path.join(bundleRoot, 'bin', 'python3'),
    path.join(bundleRoot, 'bin', 'python'),
    path.join(bundleRoot, 'venv', 'bin', 'python3'),
    path.join(bundleRoot, 'venv', 'bin', 'python'),
    path.join(bundleRoot, 'python', 'python.exe'),
    path.join(bundleRoot, 'python', 'Scripts', 'python.exe'),
  ].filter(Boolean);

  const sidecarCandidates = [
    sidecarManifestRel ? path.join(bundleRoot, sidecarManifestRel) : '',
    path.join(bundleRoot, 'sidecar'),
    path.join(bundleRoot, 'demo'),
    path.join(bundleRoot, 'runtime'),
    bundleRoot,
  ].filter(Boolean);

  let pythonPath = '';
  for (const candidate of pythonCandidates) {
    if (await pathExists(candidate)) {
      pythonPath = candidate;
      break;
    }
  }

  let runtimeCwd = '';
  for (const candidate of sidecarCandidates) {
    if (await pathExists(path.join(candidate, 'app', 'server', 'main.py'))) {
      runtimeCwd = candidate;
      break;
    }
  }

  return {
    scopeId: preferred.scopeId,
    bundleRoot,
    pythonPath,
    runtimeCwd,
  };
};

const ensureChapterWorkspaceDir = async (rawChapterId) => {
  const settings = await loadSettings();
  const workspaceRoot = getWorkspaceRoot(settings);
  await ensureDir(workspaceRoot);

  const chapterSegment = sanitizeSegment(rawChapterId);
  if (!chapterSegment) {
    throw new Error('Missing chapterId');
  }

  const chapterDir = assertInside(workspaceRoot, path.join(workspaceRoot, chapterSegment));
  await ensureDir(chapterDir);
  return {
    chapterId: String(rawChapterId || '').trim(),
    workspaceRoot,
    chapterSegment,
    chapterDir,
  };
};

const seedWorkspaceFromCurriculumIfNeeded = async (rawChapterId, chapterDir) => {
  let entries = [];
  try {
    entries = await fs.readdir(chapterDir);
  } catch {
    entries = [];
  }
  if (entries.length > 0) {
    return;
  }

  const { courseId, chapterCode } = splitChapterId(rawChapterId);
  if (!courseId || !chapterCode) {
    return;
  }

  const indexData = await loadIndex();

  // Copy files recursively from srcDir into destDir, skipping dotfiles, .md, and manifest files.
  // destPath is always asserted to be inside chapterDir to prevent path traversal.
  const copyRecursive = async (srcDir, destDir) => {
    const children = await fs.readdir(srcDir, { withFileTypes: true });
    for (const child of children) {
      if (child.name.startsWith('.')) {
        continue;
      }
      const srcPath = path.join(srcDir, child.name);
      const destPath = assertInside(chapterDir, path.join(destDir, child.name));

      if (child.isDirectory()) {
        await ensureDir(destPath);
        await copyRecursive(srcPath, destPath);
        continue;
      }

      const lower = child.name.toLowerCase();
      const shouldSkip =
        lower.endsWith('.md') ||
        lower === 'manifest.json' ||
        lower === 'bundle.manifest.json' ||
        lower === 'runtime.manifest.json';
      if (shouldSkip) {
        continue;
      }

      try {
        await fs.access(destPath);
      } catch {
        await ensureDir(path.dirname(destPath));
        await fs.copyFile(srcPath, destPath);
      }
    }
  };

  // 1. Seed from curriculum bundle (agent prompts, task lists, etc.)
  const curriculumEntries = Object.entries(indexData?.curriculum || {}).filter(([, entry]) => entry?.path);
  if (curriculumEntries.length > 0) {
    const sourceRoot = path.join(curriculumEntries[0][1].path, 'content', 'curriculum', courseId, chapterCode);
    if (await pathExists(sourceRoot)) {
      await copyRecursive(sourceRoot, chapterDir);
    }
  }

  // 2. Seed code/ and dataset(s)/ from the chapter-specific bundle.
  //    The chapter bundle scope_id matches rawChapterId (e.g. "COURSE_CODE/chapter_code").
  const chapterBundleKey = `${courseId}/${chapterCode}`;
  const chapterEntry =
    (indexData?.chapter || {})[rawChapterId] ||
    (indexData?.chapter || {})[chapterBundleKey];
  if (chapterEntry?.path) {
    for (const subDir of ['code', 'dataset', 'datasets']) {
      const srcSubDir = path.join(chapterEntry.path, subDir);
      if (await pathExists(srcSubDir)) {
        const destSubDir = assertInside(chapterDir, path.join(chapterDir, subDir));
        await ensureDir(destSubDir);
        await copyRecursive(srcSubDir, destSubDir);
      }
    }
  }
};

const resolvePythonForCodeExecution = async () => {
  const preferred = String(runtimeLaunchInfo?.pythonPath || '').trim();
  if (preferred && (await pathExists(preferred))) {
    return preferred;
  }

  const bundled = await resolvePythonRuntimeBundle(await loadIndex());
  const bundledPath = String(bundled?.pythonPath || '').trim();
  if (bundledPath && (await pathExists(bundledPath))) {
    return bundledPath;
  }

  if (process.env.TUTOR_PYTHON) {
    return process.env.TUTOR_PYTHON;
  }
  return process.platform === 'win32' ? 'python' : 'python3';
};

const cleanupCodeExecution = (chapterSegment) => {
  const active = codeExecutionByChapter.get(chapterSegment);
  if (!active) {
    return;
  }
  if (active.timeoutTimer) {
    clearTimeout(active.timeoutTimer);
  }
  codeExecutionByChapter.delete(chapterSegment);
};

const killCodeExecution = (chapterSegment, killed = false) => {
  const active = codeExecutionByChapter.get(chapterSegment);
  if (!active) {
    return false;
  }
  active.killed = killed || active.killed;
  if (active.timeoutTimer) {
    clearTimeout(active.timeoutTimer);
    active.timeoutTimer = null;
  }
  if (!active.process.killed) {
    active.process.kill();
    setTimeout(() => {
      try {
        if (!active.process.killed) {
          active.process.kill('SIGKILL');
        }
      } catch {
        // no-op
      }
    }, 3000);
  }
  return true;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const SIDECAR_REQUIRED_CONTRACT_VERSION = 'v1';
const SIDECAR_REQUIRED_ROUTES = [
  { method: 'POST', path: '/api/session/new' },
  { method: 'POST', path: '/api/session/{session_id}/message/stream' },
  { method: 'GET', path: '/api/session/{session_id}/dynamic_report' },
  { method: 'POST', path: '/api/session/{session_id}/end' },
  { method: 'GET', path: '/health' },
];
const SIDECAR_REQUIRED_SSE_EVENTS = [
  'start',
  'companion_chunk',
  'companion_complete',
  'consultation_start',
  'consultation_complete',
  'consultation_error',
  'complete',
  'error',
];

const toRouteKey = (method, routePath) => `${String(method || '').toUpperCase()} ${String(routePath || '').trim()}`;

const validateSidecarContract = (payload) => {
  const contractVersion = String(payload?.contract_version || '').trim();
  if (contractVersion !== SIDECAR_REQUIRED_CONTRACT_VERSION) {
    return {
      ok: false,
      reason: `Unsupported sidecar contract_version: ${contractVersion || 'missing'} (expected ${SIDECAR_REQUIRED_CONTRACT_VERSION})`,
    };
  }

  const routeSet = new Set(
    (Array.isArray(payload?.routes) ? payload.routes : [])
      .map((route) => toRouteKey(route?.method, route?.path))
      .filter(Boolean)
  );
  const missingRoutes = SIDECAR_REQUIRED_ROUTES.filter((route) => !routeSet.has(toRouteKey(route.method, route.path)));
  if (missingRoutes.length > 0) {
    return {
      ok: false,
      reason: `Sidecar contract missing routes: ${missingRoutes.map((route) => toRouteKey(route.method, route.path)).join(', ')}`,
    };
  }

  const eventSet = new Set(
    (Array.isArray(payload?.sse_event_types) ? payload.sse_event_types : []).map((eventType) => String(eventType || '').trim())
  );
  const missingEvents = SIDECAR_REQUIRED_SSE_EVENTS.filter((eventType) => !eventSet.has(eventType));
  if (missingEvents.length > 0) {
    return {
      ok: false,
      reason: `Sidecar contract missing SSE event types: ${missingEvents.join(', ')}`,
    };
  }

  return { ok: true };
};

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

const checkSidecarContract = async (baseUrl) => {
  const normalizedBaseUrl = String(baseUrl).replace(/\/+$/, '');
  let response;
  try {
    response = await fetch(`${normalizedBaseUrl}/api/contract`);
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : 'contract check failed',
    };
  }

  let payload = {};
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }

  if (!response.ok) {
    return {
      ok: false,
      reason: `contract status ${response.status}`,
      status: response.status,
      contract: payload,
    };
  }

  const validation = validateSidecarContract(payload);
  if (!validation.ok) {
    return {
      ok: false,
      reason: validation.reason,
      status: response.status,
      contract: payload,
    };
  }

  return {
    ok: true,
    status: response.status,
    contract: payload,
  };
};

const waitForSidecarPreflight = async (baseUrl, timeoutMs = 12000) => {
  const health = await waitForSidecarHealthy(baseUrl, timeoutMs);
  if (!health.healthy) {
    return {
      ok: false,
      phase: 'health',
      reason: health.error || 'health check failed',
    };
  }

  const contract = await checkSidecarContract(baseUrl);
  if (!contract.ok) {
    return {
      ok: false,
      phase: 'contract',
      reason: contract.reason || 'contract check failed',
      status: contract.status,
      contract: contract.contract,
    };
  }

  return {
    ok: true,
    phase: 'ready',
    health: health.data,
    contract: contract.contract,
  };
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

const clearRuntimeRestartTimer = () => {
  if (runtimeRestartTimer) {
    clearTimeout(runtimeRestartTimer);
    runtimeRestartTimer = null;
  }
};

const stopRuntimeProcess = (intentional = true) => {
  runtimeIntentionalStop = intentional;
  clearRuntimeRestartTimer();
  if (runtimeProcess) {
    runtimeProcess.kill();
    runtimeProcess = null;
  }
  if (intentional) {
    runtimeAutoRestartAttempts = 0;
  }
};

const scheduleRuntimeAutoRestart = () => {
  if (!runtimeStartConfig || runtimeIntentionalStop) {
    return;
  }
  if (runtimeAutoRestartAttempts >= MAX_RUNTIME_AUTO_RESTART) {
    return;
  }
  runtimeAutoRestartAttempts += 1;
  clearRuntimeRestartTimer();
  runtimeRestartTimer = setTimeout(() => {
    startRuntimeInternal(runtimeStartConfig, { isAutoRestart: true }).catch(() => {});
  }, 1000);
};

const startRuntimeInternal = async (config, options = {}) => {
  const runtimeConfig = config || {};
  if (runtimeProcess) {
    const preflight = await waitForSidecarPreflight(SIDECAR_BASE_URL, 1200);
    if (preflight.ok) {
      return {
        started: true,
        pid: runtimeProcess.pid,
        runtime_source: runtimeLaunchInfo?.runtimeSource || '',
        python_source: runtimeLaunchInfo?.pythonSource || '',
        contract_version: preflight.contract?.contract_version || '',
      };
    }
    stopRuntimeProcess(false);
  }

  runtimeIntentionalStop = false;
  runtimeStartConfig = { ...(runtimeConfig || {}) };

  const settings = await loadSettings();
  const tutorRoot = getTutorRoot(settings);
  const indexData = await loadIndex();
  const bundledRuntime = await resolvePythonRuntimeBundle(indexData);
  const runtimeCwd = bundledRuntime?.runtimeCwd || (await resolveRuntimeProjectRoot());
  const condaRoot = getCondaRoot();
  const condaEnvPython = getCondaEnvPython(condaRoot);
  const condaPythonExists = await pathExists(condaEnvPython);
  const pythonPath = runtimeConfig?.pythonPath
    || process.env.TUTOR_PYTHON
    || (condaPythonExists ? condaEnvPython : '')
    || bundledRuntime?.pythonPath
    || 'python';
  const runtimeSource = bundledRuntime?.runtimeCwd ? `python_runtime:${bundledRuntime.scopeId}` : 'local_demo';
  const pythonSource = runtimeConfig?.pythonPath
    ? 'explicit'
    : process.env.TUTOR_PYTHON
      ? 'env'
      : condaPythonExists
        ? 'conda_env'
        : bundledRuntime?.pythonPath
          ? `python_runtime:${bundledRuntime.scopeId}`
          : 'system_path';
  const curriculumBundle = await resolveBundlePath('curriculum');
  const expertsBundle = await resolveBundlePath('experts');
  const appAgentsBundle = await resolveBundlePath('app_agents');
  // Resolve curriculum_templates bundle (app_agents type, curriculum_templates scope)
  const templatesEntry = (await loadIndex())?.app_agents?.curriculum_templates;
  const templatesBundlePath = templatesEntry?.path || null;

  if (!runtimeCwd) {
    return {
      started: false,
      reason: 'Cannot locate sidecar runtime root containing app/server/main.py',
      runtime_source: runtimeSource,
      python_source: pythonSource,
      stderr: runtimeStderrBuffer,
    };
  }

  await ensureDir(getSessionsRoot(settings));

  // Resolve the base URL: if the user left it blank, pick a sensible default per provider.
  const providerDefaultBaseUrl = {
    openai: 'https://api.openai.com',
    anthropic: 'https://api.anthropic.com',
  };
  const effectiveLlmBaseUrl =
    runtimeConfig?.llmBaseUrl?.trim() ||
    providerDefaultBaseUrl[runtimeConfig?.llmProvider] ||
    '';

  const env = {
    ...process.env,
    LLM_PROVIDER: runtimeConfig?.llmProvider || 'custom',
    LLM_API_KEY: runtimeConfig?.llmApiKey || '',
    LLM_MODEL: runtimeConfig?.llmModel || '',
    LLM_BASE_URL: effectiveLlmBaseUrl,
    CURRICULUM_DIR: curriculumBundle ? path.join(curriculumBundle, 'content', 'curriculum') : '',
    EXPERTS_DIR: expertsBundle ? path.join(expertsBundle, 'experts') : '',
    MAIN_AGENTS_DIR: appAgentsBundle ? path.join(appAgentsBundle, 'content', 'agents') : process.env.MAIN_AGENTS_DIR || '',
    CURRICULUM_TEMPLATES_DIR: templatesBundlePath || '',
    SESSIONS_DIR: getSessionsRoot(settings),
    PYTHON_RUNTIME_ROOT: bundledRuntime?.bundleRoot || '',
    HOST: '127.0.0.1',
    PORT: '8000',
    TUTOR_ROOT: tutorRoot,
    LOG_FILE: path.join(getSessionsRoot(settings), 'sidecar.log'),
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

  runtimeLaunchInfo = {
    runtimeSource,
    pythonSource,
    runtimeCwd,
    pythonPath,
  };
  runtimeStderrBuffer = '';
  runtimeProcess.stderr?.on('data', (chunk) => {
    const text = chunk?.toString?.() || '';
    if (!text) return;
    runtimeStderrBuffer = `${runtimeStderrBuffer}${text}`.slice(-8000);
    // Forward sidecar stderr to the renderer so it appears in DevTools console.
    const focusedWindow = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
    focusedWindow?.webContents?.send('runtime:log', { stream: 'stderr', text });
  });

  runtimeProcess.on('exit', () => {
    const shouldRestart = !runtimeIntentionalStop;
    runtimeProcess = null;
    if (shouldRestart) {
      scheduleRuntimeAutoRestart();
    }
  });

  const preflight = await waitForSidecarPreflight(SIDECAR_BASE_URL, 12000);
  if (!preflight.ok) {
    stopRuntimeProcess(false);
    return {
      started: false,
      reason: `Sidecar preflight failed (${preflight.phase || 'unknown'}): ${preflight.reason || 'unknown error'}`,
      stderr: runtimeStderrBuffer,
      runtime_source: runtimeSource,
      python_source: pythonSource,
      contract_status: preflight.status,
    };
  }

  clearRuntimeRestartTimer();
  runtimeAutoRestartAttempts = 0;
  return {
    started: true,
    pid: runtimeProcess.pid,
    runtime_source: runtimeSource,
    python_source: pythonSource,
    contract_version: preflight.contract?.contract_version || '',
  };
};

ipcMain.handle('runtime:start', async (_event, config) => {
  return startRuntimeInternal(config || {}, { isAutoRestart: false });
});

ipcMain.handle('runtime:stop', async () => {
  stopRuntimeProcess(true);
  return { stopped: true };
});

ipcMain.handle('runtime:health', async () => {
  const baseUrl = SIDECAR_BASE_URL;
  try {
    const response = await fetch(`${String(baseUrl).replace(/\/+$/, '')}/health`);
    if (!response.ok) {
      return { healthy: false, status: response.status, runtime: runtimeLaunchInfo };
    }
    const data = await response.json();
    return { healthy: true, data, runtime: runtimeLaunchInfo };
  } catch (error) {
    return {
      healthy: false,
      error: error instanceof Error ? error.message : 'health check failed',
      stderr: runtimeStderrBuffer,
      runtime: runtimeLaunchInfo,
    };
  }
});

ipcMain.handle('runtime:preflight', async () => {
  const preflight = await waitForSidecarPreflight(SIDECAR_BASE_URL, 2500);
  if (preflight.ok) {
    return {
      ok: true,
      contract_version: preflight.contract?.contract_version || '',
      contract: preflight.contract || null,
      runtime: runtimeLaunchInfo,
    };
  }
  return {
    ok: false,
    phase: preflight.phase,
    reason: preflight.reason || 'sidecar preflight failed',
    status: preflight.status,
    contract: preflight.contract || null,
    stderr: runtimeStderrBuffer,
    runtime: runtimeLaunchInfo,
  };
});

ipcMain.handle('runtime:getLogs', async () => {
  const settings = await loadSettings();
  const logFile = path.join(getSessionsRoot(settings), 'sidecar.log');
  return { stderr: runtimeStderrBuffer, logFile };
});

ipcMain.handle('runtime:createSession', async (_event, payload) => {
  const chapterId = String(payload?.chapterId || '').trim();
  if (!chapterId) {
    throw new Error('Missing chapterId');
  }

  const baseUrl = String(SIDECAR_BASE_URL).replace(/\/+$/, '');
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

ipcMain.handle('runtime:reattachSession', async (_event, payload) => {
  const sessionId = String(payload?.sessionId || '').trim();
  const chapterId = String(payload?.chapterId || '').trim();
  if (!sessionId || !chapterId) {
    throw new Error('Missing sessionId or chapterId');
  }

  const baseUrl = String(SIDECAR_BASE_URL).replace(/\/+$/, '');
  const desktopContext = await buildSidecarSessionContext(chapterId);

  const response = await fetch(`${baseUrl}/api/session/${encodeURIComponent(sessionId)}/reattach`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ desktop_context: desktopContext }),
  });

  if (!response.ok) {
    const parsed = await parseBackendResponse(response).catch(() => ({}));
    const detail = parsed?.detail || `Reattach session failed (${response.status})`;
    throw new Error(String(detail));
  }

  return response.json();
});

ipcMain.handle('code:createFile', async (_event, payload) => {
  const rawChapterId = String(payload?.chapterId || '').trim();
  const rawFilename = String(payload?.filename || '');
  const filename = path.basename(rawFilename).replace(/[^\w\-.]/g, '_');
  const content = String(payload?.content || '');

  if (!rawChapterId || !filename) {
    throw new Error('Missing chapterId or filename');
  }

  const { chapterDir } = await ensureChapterWorkspaceDir(rawChapterId);
  await seedWorkspaceFromCurriculumIfNeeded(rawChapterId, chapterDir);
  const filePath = assertInside(chapterDir, path.join(chapterDir, filename));

  try {
    await fs.access(filePath);
  } catch {
    await fs.writeFile(filePath, content, 'utf-8');
  }

  return { filePath };
});

ipcMain.handle('code:listFiles', async (_event, payload) => {
  const rawChapterId = String(payload?.chapterId || '').trim();
  if (!rawChapterId) {
    throw new Error('Missing chapterId');
  }

  const { chapterDir } = await ensureChapterWorkspaceDir(rawChapterId);
  await seedWorkspaceFromCurriculumIfNeeded(rawChapterId, chapterDir);
  const entries = await fs.readdir(chapterDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }
    const fullPath = assertInside(chapterDir, path.join(chapterDir, entry.name));
    const stats = await fs.stat(fullPath);
    files.push({
      name: entry.name,
      size: Number(stats.size || 0),
      modified: Number(stats.mtimeMs || Date.now()),
    });
  }

  files.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  return { files };
});

ipcMain.handle('code:readFile', async (_event, payload) => {
  const rawChapterId = String(payload?.chapterId || '').trim();
  const relPath = normalizeWorkspaceRelativePath(payload?.filename);
  if (!rawChapterId) {
    throw new Error('Missing chapterId');
  }

  const { chapterDir } = await ensureChapterWorkspaceDir(rawChapterId);
  await seedWorkspaceFromCurriculumIfNeeded(rawChapterId, chapterDir);
  const filePath = assertInside(chapterDir, path.join(chapterDir, relPath));
  const content = await fs.readFile(filePath, 'utf-8');
  return { content, filePath };
});

ipcMain.handle('code:writeFile', async (_event, payload) => {
  const rawChapterId = String(payload?.chapterId || '').trim();
  const relPath = normalizeWorkspaceRelativePath(payload?.filename);
  const content = String(payload?.content || '');
  if (!rawChapterId) {
    throw new Error('Missing chapterId');
  }

  const { chapterDir } = await ensureChapterWorkspaceDir(rawChapterId);
  await seedWorkspaceFromCurriculumIfNeeded(rawChapterId, chapterDir);
  const filePath = assertInside(chapterDir, path.join(chapterDir, relPath));
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, content, 'utf-8');
  return { filePath, bytes: Buffer.byteLength(content, 'utf-8') };
});

ipcMain.handle('code:execute', async (event, payload) => {
  const rawChapterId = String(payload?.chapterId || '').trim();
  const code = String(payload?.code || '');
  const envPatch = payload?.env && typeof payload.env === 'object' ? payload.env : {};
  const rawTimeout = Number(payload?.timeoutMs);
  const timeoutMs = Number.isFinite(rawTimeout) ? Math.max(1_000, Math.min(10 * 60_000, rawTimeout)) : DEFAULT_CODE_TIMEOUT_MS;
  const safeFilename = path.basename(String(payload?.filename || 'main.py')).replace(/[^\w\-.]/g, '_') || 'main.py';

  if (!rawChapterId) {
    throw new Error('Missing chapterId');
  }

  const { chapterId, chapterDir, chapterSegment } = await ensureChapterWorkspaceDir(rawChapterId);
  await seedWorkspaceFromCurriculumIfNeeded(rawChapterId, chapterDir);
  const previous = codeExecutionByChapter.get(chapterSegment);
  if (previous) {
    previous.killed = true;
    if (previous.timeoutTimer) {
      clearTimeout(previous.timeoutTimer);
      previous.timeoutTimer = null;
    }
    if (!previous.process.killed) {
      previous.process.kill();
    }
    previous.sender.send('code:exit', {
      chapterId: previous.chapterId,
      exitCode: -1,
      signal: 'SIGTERM',
      timedOut: false,
      killed: true,
    });
    cleanupCodeExecution(chapterSegment);
    fs.unlink(previous.tempRunPath).catch(() => {});
  }

  const persistedPath = assertInside(chapterDir, path.join(chapterDir, safeFilename));
  await fs.writeFile(persistedPath, code, 'utf-8');

  const tempRunPath = assertInside(
    chapterDir,
    path.join(chapterDir, `.__run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.py`)
  );
  await fs.writeFile(tempRunPath, code, 'utf-8');

  const pythonPath = await resolvePythonForCodeExecution();
  const proc = spawn(pythonPath, [tempRunPath], {
    cwd: chapterDir,
    env: {
      ...process.env,
      ...envPatch,
      PYTHONUNBUFFERED: '1',
      TUTOR_CHAPTER_ID: chapterId,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const active = {
    process: proc,
    timeoutTimer: null,
    timedOut: false,
    killed: false,
    tempRunPath,
    chapterId,
    sender: event.sender,
  };
  codeExecutionByChapter.set(chapterSegment, active);

  const sendOutput = (stream, data) => {
    const text = data?.toString?.() || '';
    if (!text) {
      return;
    }
    active.sender.send('code:output', { chapterId, stream, data: text });
  };

  proc.stdout?.on('data', (chunk) => sendOutput('stdout', chunk));
  proc.stderr?.on('data', (chunk) => sendOutput('stderr', chunk));

  proc.on('error', (error) => {
    sendOutput('stderr', `[code execution error] ${error instanceof Error ? error.message : String(error)}\n`);
  });

  active.timeoutTimer = setTimeout(() => {
    const current = codeExecutionByChapter.get(chapterSegment);
    if (!current || current.process !== proc) {
      return;
    }
    current.timedOut = true;
    sendOutput('stderr', `\n[timeout] Execution exceeded ${Math.round(timeoutMs / 1000)}s\n`);
    if (!current.process.killed) {
      current.process.kill();
    }
  }, timeoutMs);

  proc.on('close', (exitCode, signal) => {
    const current = codeExecutionByChapter.get(chapterSegment);
    if (!current || current.process !== proc) {
      return;
    }

    const payload = {
      chapterId,
      exitCode: typeof exitCode === 'number' ? exitCode : -1,
      signal: signal || null,
      timedOut: Boolean(current.timedOut),
      killed: Boolean(current.killed),
    };
    cleanupCodeExecution(chapterSegment);
    current.sender.send('code:exit', payload);
    fs.unlink(current.tempRunPath).catch(() => {});
  });

  return {
    started: true,
    chapterId,
    timeoutMs,
    pythonPath,
  };
});

ipcMain.handle('code:kill', async (_event, payload) => {
  const chapterId = String(payload?.chapterId || '').trim();
  const chapterSegment = sanitizeSegment(chapterId);
  if (!chapterSegment) {
    throw new Error('Missing chapterId');
  }
  const killed = killCodeExecution(chapterSegment, true);
  return { killed, chapterId };
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

ipcMain.handle('code:getWorkspaceDir', async (_event, payload) => {
  const rawChapterId = String(payload?.chapterId || '').trim();
  if (!rawChapterId) throw new Error('Missing chapterId');
  const { chapterDir } = await ensureChapterWorkspaceDir(rawChapterId);
  return { chapterDir };
});

ipcMain.handle('code:openJupyter', async (_event, payload) => {
  const rawChapterId = String(payload?.chapterId || '').trim();
  if (!rawChapterId) throw new Error('Missing chapterId');

  const { chapterDir } = await ensureChapterWorkspaceDir(rawChapterId);
  await seedWorkspaceFromCurriculumIfNeeded(rawChapterId, chapterDir);

  const pythonPath = await resolvePythonForCodeExecution();
  const pythonDir = path.dirname(pythonPath);
  const jupyterBin = process.platform === 'win32'
    ? path.join(pythonDir, 'Scripts', 'jupyter.exe')
    : path.join(pythonDir, 'jupyter');

  if (!(await pathExists(jupyterBin))) {
    return { started: false, reason: 'jupyter not found in Python environment' };
  }

  const child = spawn(jupyterBin, ['notebook', '--notebook-dir', chapterDir], {
    detached: true,
    stdio: 'ignore',
    cwd: chapterDir,
  });
  child.unref();
  return { started: true };
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

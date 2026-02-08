# Electron Refactor Plan (Student Desktop)

This document defines the target desktop architecture for the Socratic QA guided course platform.

## 1. Goals

- Keep the existing React UI and component layout.
- Replace mock data flows with real backend + local sidecar runtime.
- Support chapter-level resource bundles and core-agent bundle updates.
- Run CA/RMA/MA + experts locally through a Python sidecar.
- Keep login state locally, and support optional remembered LLM keys via OS secure storage.
- Allow user to configure local data saving directory once in settings.

## 2. Runtime Boundary

## 2.1 What runs where

- `Renderer (React)`: UI state, user interactions, stream rendering
- `Main (Electron)`: filesystem, bundle install, sidecar process lifecycle, IPC security
- `Python Sidecar`: multi-agent orchestration and chapter execution loop
- `Cloud Backend`: auth/course/update/progress/analytics APIs only

## 2.2 Why this split

- Sidecar keeps educational loop local and low latency.
- Backend remains lightweight and scalable (distribution + records).
- Main process controls privileged operations and avoids exposing Node APIs to renderer.

## 3. Desktop Module Design

## 3.1 Main process modules

- `authStore`
  - Store access/refresh tokens and device id locally for persistent login.
  - Recommended: `safeStorage` + encrypted file under userData.
- `settingsStore`
  - Persist user preferences (`storageRoot`, `rememberLogin`, active model/provider).
  - Provide directory picker and migration helper.
- `secretStore`
  - Store LLM provider keys in OS secure store (`keytar`-style), not plaintext files.
- `bundleManager`
  - Download bundles to temp dir, verify sha256, extract, then atomically activate.
  - Maintain `active_index.json` with currently active versions.
- `updateClient`
  - Call cloud `/v1/updates/check-app` and `/v1/updates/check-chapter`.
- `sidecarManager`
  - Start/stop/health-check Python sidecar process.
  - Inject runtime env (bundle paths, sidecar port).
- `syncQueueWorker`
  - Flush queued progress and analytics events in background.

## 3.2 Preload (IPC contract)

Expose minimal APIs only:

- auth: `requestEmailCode`, `register`, `login`, `refresh`, `logout`, `me`
- settings: `getSettings`, `setSettings`, `chooseStorageRoot`
- secrets: `saveLlmKey`, `getLlmKey`, `deleteLlmKey`
- courses: `listMyCourses`, `joinCourse`, `getCourse`, `listChapters`
- updates: `checkAppUpdates`, `checkChapterUpdates`, `installBundle`, `listInstalledBundles`
- runtime: `startSidecar`, `stopSidecar`, `sidecarHealth`, `createSession`, `streamMessage`, `getDynamicReport`, `endSession`
- workspace: `createCodeFile`, `openCodePath`
- sync: `enqueueProgress`, `enqueueAnalytics`, `flushQueue`

No direct filesystem API should be exposed.

## 3.3 Renderer service mapping

Replace current mock-oriented services while keeping UI-level interfaces stable:

- `mockApi.ts` -> split into:
  - `authService.ts`
  - `courseService.ts`
  - `progressService.ts`
- `updateManager.ts` -> use real cloud update APIs
- `contentService.ts` -> read chapters from backend metadata + installed chapter bundle content
- `runtimeManager.ts` -> call sidecar session APIs and stream SSE events

## 4. Local Data Layout

Root: `<storageRoot>/TutorApp/`
Default `storageRoot`: `app.getPath("userData")`
Configurable in desktop settings.

- `bundles/`
  - `app_agents/core/<version>/`
  - `course/<course_id>/<version>/`
  - `chapter/<course_id>/<chapter_id>/<version>/`
  - `experts/<expert_id>/<version>/`
- `active_index.json`
- `sessions/<session_id>/`
- `workspace/<course_id>/<chapter_id>/`
- `queue/progress.jsonl`
- `queue/analytics.jsonl`

No file should contain plaintext LLM API key. Remembered keys are fetched from OS secure store at runtime.

## 5. Update and Activation Flow

## 5.1 Startup flow (app-level)

1. Refresh cloud token if needed.
2. `check-app` with installed bundle versions.
3. For each required bundle:
   - download artifact to temp
   - verify `sha256`
   - extract to target version directory
4. Update `active_index.json` only after all mandatory bundles succeed.
5. Start sidecar using active app-agent bundle and shared experts.

## 5.2 Chapter-enter flow

1. User opens chapter.
2. Desktop calls `check-chapter` with installed chapter/expert versions.
3. Install missing chapter bundle and required experts.
4. Initialize sidecar session with resolved local bundle paths.
5. Start stream and persist progress snapshots.

## 6. Sidecar Integration

## 6.1 Process control

- Start command example:
  - `python -m uvicorn app.server.main:app --host 127.0.0.1 --port <dynamic_port>`
- Health check endpoint: `/local/v1/health`
- Auto-restart policy: max 2 retries, then notify UI with actionable error.

## 6.2 LLM config injection

- Renderer collects provider/model/key from settings UI.
- Key is passed to sidecar `createSession` payload only.
- If `remember key` is enabled, renderer retrieves key from secure store; otherwise key is memory-only.
- Keys must be scrubbed from logs.

## 6.3 Streaming contract

Use SSE event types defined in `student_frontend_api_draft.md`:

- `start`
- `companion_chunk`
- `companion_complete`
- `roadmap_update`
- `expert_consultation`
- `memo_update`
- `done`
- `error`

## 7. Sync and Offline Strategy

- Progress and analytics writes should be non-blocking for UI.
- Failed uploads are queued locally and retried with exponential backoff.
- Queue is flushed on:
  - app startup
  - successful login
  - session end
  - network reconnect

## 8. Security and Privacy Baseline

- `contextIsolation: true`, `nodeIntegration: false`, strict preload allowlist.
- Validate all IPC input payloads in main process.
- Verify bundle checksums before extraction and activation.
- Sanitize any path input for workspace file operations.
- Never send private key data in analytics/progress events.
- Persist secrets only through OS secure storage, never plaintext local files.

## 9. Refactor Milestones

1. **M1 - API/IPC foundation**
   - Create auth/course/update/progress service modules.
   - Replace mock login/course/join flows with backend APIs.

2. **M2 - Bundle pipeline**
   - Implement checksum verification + atomic activation.
   - Implement startup + chapter-entry update checks.

3. **M3 - Sidecar real loop**
   - Replace `mockApi.sendChatMessage` with sidecar streaming.
   - Connect roadmap/report panels to real sidecar events.

4. **M4 - Reliable sync**
   - Add local queue + retry worker for progress and analytics.

5. **M5 - Hardening**
   - Error taxonomy, retry policy, observability, and integration tests.

# Step 3 Desktop Implementation Plan

## Goal

Integrate the Electron desktop app with real backend APIs, real local sidecar sessions/streaming, and real bundle update/install flows while preserving existing UI structure.

## Execution Progress (2026-02-08)

- Completed:
  - Phase 0.5 contract freeze is implemented in code (sidecar `/api/session/*`, event normalization, DTO mapping, prompt fallback order).
  - Phase 1/2 foundation is in place (typed IPC, secure stores, backend bridge, auth + course integration).
  - Core Phase 3/4 path is implemented (backend update checks, release install with checksum, sidecar session + streaming integration).
  - Runtime launch now supports `python_runtime` bundle handoff (embedded python + sidecar root) with local fallback.
  - Sidecar stability improvements implemented: health-gated start, auto-restart attempts, runtime diagnostics surfaced to UI.
  - `rememberLogin` setting is enforced in auth token persistence and session restore.
  - Local curriculum IPC now exposes full chapter markdown set (`chapter_context`, `task_list`, `task_completion_principles`, `interaction_protocol`, `socratic_vs_direct`).
- Remaining:
  - Publish real `python_runtime` bundle artifacts and wire backend update registry to serve them for packaged clients.
  - Validate packaged sidecar startup end-to-end on macOS/Windows.
  - Add smoke/failure integration tests and release scripts/checklist.

## Current Gap Snapshot

- Auth is still local email/password mock (`components/AuthScreen.tsx`, `services/mockApi.ts`).
- Course list/join and chapter chat are still mock/localStorage driven (`services/mockApi.ts`, `App.tsx`, `components/CentralChat.tsx`).
- Update flow is backend-driven; legacy local-manifest references should be treated as historical and removed from docs.
- Sidecar sessions/streaming are integrated; remaining work is stability hardening and packaged validation.
- IPC surface is missing planned modules for auth/settings/secrets/backend/sync (`electron/preload.mjs`).
- API keys are still persisted in renderer localStorage (`components/SettingsModal.tsx`, `services/runtimeManager.ts`).
- Contract mismatches exist:
  - sidecar path mismatch: draft `/local/v1/*` vs current demo `/api/session/*`
  - sidecar event mismatch: draft expects `done`, `roadmap_update`, `memo_update`; demo emits `complete` and `consultation_*`
  - prompt-source mismatch: demo loads all teaching markdowns from chapter scope, while desktop roadmap now assumes some markdowns may be global
  - DTO mismatch: backend fields (`display_name`, `course_code`, `joined_at`) vs renderer fields (`name`, `code`, `joinedAt`)

## Guiding Decisions for This Step

- Keep backend APIs as implemented in `llm-course-backend` under `/v1/*`.
- Keep current sidecar demo endpoints under `/api/session/*` for immediate integration.
- Add a renderer-side event adapter so UI consumes normalized events independent of sidecar raw event names.
- Move secret storage to main-process secure storage immediately (no keys in localStorage).
- Use one typed mapping layer between backend DTOs and renderer models to isolate naming mismatches.

## Phase 0.5 - Contract Freeze and Mapping Table (0.5 day)

### Deliverables

- Finalized endpoint table for:
  - backend `/v1/auth|courses|updates|progress|analytics`
  - sidecar `/api/session/*` + `/health` + `/api/contract` (startup/session preflight)
  - IPC `auth:*`, `settings:*`, `secrets:*`, `backend:*`, `updates:*`, `runtime:*`, `sync:*`
- Event normalization table:
  - `complete` -> `done`
  - `consultation_start|consultation_complete|consultation_error` -> `expert_consultation`
  - pass-through `companion_chunk`, `companion_complete`, `error`
- Prompt-source mapping table:
  - chapter-local markdowns (always per chapter)
  - global agent markdowns (shared across chapters)
  - deterministic fallback order and missing-file behavior
- DTO mapping table:
  - `display_name` -> `name`
  - `course_code` -> `code`
  - `joined_at` -> `joinedAt`

## Phase 1 - Foundation and Security First (2-3 days)

### Scope

- Add main-process stores and typed IPC:
  - `settingsStore` (`storageRoot`, backend URL, sidecar URL, remember toggles)
  - `authStore` (deviceId, accessToken, refreshToken, expiry)
  - `secretStore` (provider API keys in secure storage)
- Add backend request bridge in main with auth header injection.
- Add sync queue IPC skeleton (`enqueue`, `flush`) and persistent queue files.
- Move bundle/session/workspace roots under configurable `storageRoot`.
- Add strict input validation/sanitization for all IPC filesystem inputs.

### Target Files

- `electron/main.mjs`
- `electron/preload.mjs`
- `types.ts`

### Exit Criteria

- Renderer no longer reads/writes model API keys from localStorage.
- Tokens/settings/secrets can be read/written only through typed IPC.
- Existing UI still boots with `contextIsolation: true`.

## Phase 2 - Auth and Course API Integration (2-3 days)

### Scope

- Implement services:
  - `services/backendClient.ts`
  - `services/authService.ts`
  - `services/courseService.ts`
- Migrate auth UI to email-code flow:
  - request email code
  - register/login with code + device_id
  - refresh on startup
  - logout revokes refresh token
- Replace dashboard course list/join with backend APIs.
- Keep UI props stable via DTO mappers.

### Target Files

- `components/AuthScreen.tsx`
- `App.tsx`
- `components/Dashboard.tsx`
- `services/mockApi.ts` (retire auth/course path)

### Exit Criteria

- No mock auth/course path used in normal startup/login flow.
- Relaunch can restore session via refresh token.

## Phase 3 - Bundle and Update Pipeline (2-3 days)

### Scope

- Replace mock manifest with backend checks:
  - startup: `POST /v1/updates/check-app`
  - chapter open: `POST /v1/updates/check-chapter`
- Implement installer:
  - download `artifact_url` to temp file
  - verify `sha256`
  - extract into versioned directory
  - atomic activation via `active_index.json` swap
- Track installation state and report progress/failures to renderer.

### Target Files

- `services/updateManager.ts`
- `electron/main.mjs`
- `services/contentService.ts`

### Exit Criteria

- No dependency on `mock_backend/manifest.json`.
- Bundle activation survives app restart.

## Phase 4 - Sidecar Session and Streaming Integration (3-4 days)

### Scope

- Add sidecar lifecycle and health checks before session creation.
- Add sidecar prompt loader fallback for mixed scope markdown ownership (chapter first, then global).
- Replace mock chat session/message calls in:
  - `CentralChat`
  - `ChatPanel`
- Implement streaming client with event adapter:
  - consumes sidecar SSE
  - emits normalized UI events (`companion_chunk`, `roadmap_update`, `memo_update`, `done`, `error`, `expert_consultation`)
- Bind stream-driven state updates to chat + roadmap/report surfaces.

### Target Files

- `components/CentralChat.tsx`
- `components/ChatPanel.tsx`
- `services/runtimeManager.ts`
- `services/contentService.ts`

### Exit Criteria

- Sending a message in chapter view uses sidecar session streaming end-to-end.

## Phase 5 - Sync Queue and Reliability (2 days)

### Scope

- Implement offline-first queue for:
  - `POST /v1/progress/chapter`
  - `POST /v1/analytics/events:ingest`
- Flush triggers:
  - app startup
  - login success
  - chapter exit/session end
  - periodic timer
  - reconnect
- Add backoff and dead-letter logging for repeated failures.

### Target Files

- `services/syncQueue.ts` (new)
- `App.tsx`
- `electron/main.mjs`

### Exit Criteria

- Progress/analytics writes are non-blocking and eventually consistent.

## Phase 6 - Settings UX and Security Finalization (1-2 days)

### Scope

- Update settings UI:
  - storage root selection
  - remember login toggle
  - remember key toggle per provider
- Route settings and secrets through IPC only.
- Remove remaining sensitive localStorage writes.

### Target Files

- `components/SettingsModal.tsx`
- `components/TopBar.tsx`
- `electron/main.mjs`

### Exit Criteria

- No plaintext key/token persistence in renderer storage.

## Phase 7 - Test and Release Readiness (2 days)

### Scope

- Add smoke flow checks:
  - login -> join -> open chapter -> stream one turn -> sync progress
- Add failure path checks:
  - backend unavailable
  - sidecar unavailable
  - bundle checksum mismatch
- Add startup/update/session failure logs.
- Add packaging checklist for macOS/Windows with sidecar dependency.

## Definition of Done

- No mock auth/course/chat path in production mode.
- Persistent login with refresh works.
- App/chapter updates are backend-driven and checksum-verified before activation.
- Entering chapter creates sidecar session and renders streamed output.
- Progress/analytics are queued and eventually synced.
- API keys are not stored in localStorage/plaintext files.

## Execution Order

1. Phase 0.5
2. Phase 1
3. Phase 2
4. Phase 3
5. Phase 4
6. Phase 5
7. Phase 6
8. Phase 7

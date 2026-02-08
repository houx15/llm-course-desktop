# Socratic Multi-Agent Learning Platform - Architecture Summary

## 1. Scope and System Boundary

This project is a **desktop-first learning platform**:

- `Electron app (desktop)`: student UI, local bundle manager, update checks, analytics queue
- `Python sidecar (local)`: CA/RMA/MA multi-agent runtime + experts + chapter execution
- `FastAPI backend (cloud)`: auth, course enrollment, chapter metadata, bundle manifests, analytics ingestion
- `Object storage/CDN`: immutable bundle artifacts (`.tar.gz`) for agents, experts, and chapter resources

Key rule: **LLM provider keys are never persisted by backend**. Desktop may persist keys locally only via OS secure storage (Keychain/Credential Manager/libsecret) when user enables "Remember key".

## 2. Core Runtime Model

### Agent responsibilities (local sidecar)

- `CA (Companion Agent)`: student-facing Socratic dialogue
- `RMA (Roadmap Manager Agent)`: progress gating, next-step packet, unlock checks
- `MA (Memory Agent)`: dynamic report, memory condensation, final report
- `Experts`: task-specific sub-agents loaded from local expert bundles

### Session loop

1. Student opens chapter -> desktop resolves chapter bundle + experts
2. Desktop starts/ensures sidecar runtime
3. Sidecar creates session with chapter context files:
   - `chapter_context.md`
   - `task_list.md`
   - `task_completion_principles.md`
   - `interaction_protocol.md` (chapter-local first, then global app agents fallback)
   - `socratic_vs_direct.md` (chapter-local first, then global app agents fallback)
4. Student message streams through CA -> RMA/experts -> MA updates report
5. Desktop asynchronously syncs progress + analytics to backend

## 3. Cloud Backend Responsibilities

### 3.1 Functional modules

- `Auth`: email + verification code registration/login
- `Courses`: course join by `course_code`, enrolled-course listing, chapter availability
- `Bundle Registry`: app/core-agent/chapter/expert bundle version resolution
- `Progress`: chapter progress snapshots and state sync
- `Analytics`: append-only learner interaction events

### 3.2 Deployment baseline (Step 2)

- `FastAPI` + `Uvicorn`
- `PostgreSQL 16`
- `Redis` (optional in v1; recommended for OTP rate limiting + async jobs)
- `S3-compatible storage` (prod OSS/S3, dev MinIO)
- `Docker Compose` for local development

## 4. Database Design (PostgreSQL)

## 4.1 Main tables

- `users`
  - `id (uuid pk)`, `email (unique)`, `display_name`, `status`, `created_at`, `updated_at`
- `email_verification_codes`
  - `id`, `email`, `purpose(register|login)`, `code_hash`, `expires_at`, `used_at`, `attempt_count`
- `device_sessions`
  - `id`, `user_id`, `device_id`, `refresh_token_hash`, `expires_at`, `last_seen_at`, `revoked_at`
- `courses`
  - `id`, `course_code (unique)`, `title`, `description`, `is_active`, `created_at`
- `course_chapters`
  - `id`, `course_id`, `chapter_code`, `title`, `sort_order`, `is_active`
- `enrollments`
  - `id`, `user_id`, `course_id`, `joined_at`, `status`
  - unique index: `(user_id, course_id)`
- `chapter_progress`
  - `id`, `user_id`, `course_id`, `chapter_id`, `status(LOCKED|IN_PROGRESS|COMPLETED)`, `last_session_id`, `updated_at`
  - unique index: `(user_id, chapter_id)`
- `bundle_releases`
  - `id`, `bundle_type(app_agents|experts_shared|chapter|experts|python_runtime)`, `scope_id`, `version`, `manifest_json`, `artifact_url`, `sha256`, `size_bytes`, `is_mandatory`, `created_at`
  - unique index: `(bundle_type, scope_id, version)`
- `analytics_events`
  - `id`, `user_id`, `course_id`, `chapter_id`, `session_id`, `event_type`, `event_time`, `payload_json`
  - partition by month recommended after scale-up

## 4.2 Notes

- Store only **hashes** for OTP and refresh tokens.
- Keep analytics append-only for research traceability.
- `manifest_json` can include compatibility (`min_desktop_version`, `min_sidecar_version`).
- Backend does not store LLM API keys.

## 5. API Surface (Cloud)

All cloud APIs are versioned under `/v1`.

- Auth: `/v1/auth/*`
- User: `/v1/me`
- Course: `/v1/courses/*`
- Bundle updates: `/v1/updates/*`
- Progress: `/v1/progress/*`
- Analytics: `/v1/analytics/events:ingest`

Detailed contract is in `student_frontend_api_draft.md`.

## 6. Desktop Technical Approach (Electron)

### 6.1 Process responsibilities

- `main`: filesystem access, bundle install/verify, sidecar lifecycle, secure IPC
- `preload`: strict API bridge only
- `renderer`: React UI, local state, request orchestration

### 6.2 Local services (renderer)

- `authService`: login/register and token lifecycle
- `updateManager`: app launch update check + install
- `contentService`: course/chapter metadata + local chapter material resolve
- `runtimeManager`: sidecar start/health/stop + session streaming client
- `syncQueue`: resilient upload for progress/analytics (offline-first)
- `settingsService`: local settings including storage root path, remember-login and remember-key options

### 6.3 Local data layout

`<storage_root>/TutorApp/` where `storage_root` is user-configurable.
Default: Electron `app.getPath("userData")`.

- `bundles/` immutable extracted bundles by type/scope/version
- `active_index.json` current activated versions
- `sessions/` local sidecar session outputs and reports
- `queue/` pending progress/analytics events
- `workspace/` student python files per chapter

No plaintext key files under this directory; remembered keys stay in OS secure storage.

## 7. Key Runtime Sequences

### 7.1 App startup

1. Load refresh token and authenticate
2. Call `/v1/updates/check-app`
3. Download + checksum verify required bundles
4. Atomically switch active bundle versions
5. Start sidecar with resolved active bundle paths

### 7.2 Enter chapter

1. Desktop calls `/v1/updates/check-chapter`
2. Install chapter resources and required expert bundles if outdated
3. Create sidecar session for `(course_id, chapter_id)`
4. Stream chat and periodically sync progress/events

## 8. Delivery Plan

1. `Step 1` (this document set): architecture + DB + API + desktop contracts
2. `Step 2`: implement FastAPI backend (auth, courses, updates, progress, analytics) with Docker
3. `Step 3`: integrate Electron UI with real backend + sidecar streaming + bundle download/update flow

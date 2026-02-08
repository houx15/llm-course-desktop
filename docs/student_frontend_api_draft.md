# Student Frontend API Draft (v1)

This file defines the API contract for the Electron student app.

- Cloud backend base path: `/v1`
- Local sidecar canonical base path: `http://127.0.0.1:<sidecar_port>/api/session/*`
- Renderer normalization contract: raw sidecar events are adapted to UI events (`roadmap_update`, `memo_update`, `done`)
- Auth model: short-lived access token + refresh token (device session)

## 1. Common Conventions

### Headers

- `Authorization: Bearer <access_token>` for protected cloud endpoints
- `X-Device-Id: <stable_device_id>` for session management
- `Content-Type: application/json`

### Error format

```json
{
  "error": {
    "code": "INVALID_VERIFICATION_CODE",
    "message": "Verification code is invalid or expired"
  }
}
```

### Time format

- All timestamps use RFC3339 UTC strings.

### Local persistence policy

- Login status is persisted locally via encrypted token storage.
- LLM API keys are never sent to backend and may be remembered only in OS secure storage.
- Local bundle/session/workspace root is configurable by user in desktop settings.

## 2. Cloud APIs

## 2.1 Auth

### POST `/v1/auth/request-email-code`

Request

```json
{
  "email": "student@example.com",
  "purpose": "register"
}
```

Response

```json
{
  "sent": true,
  "expires_in_seconds": 300
}
```

### POST `/v1/auth/register`

Request

```json
{
  "email": "student@example.com",
  "verification_code": "123456",
  "display_name": "Alice",
  "device_id": "macbook-air-001"
}
```

Response

```json
{
  "user": {
    "id": "usr_01",
    "email": "student@example.com",
    "display_name": "Alice"
  },
  "access_token": "jwt_access",
  "access_token_expires_in": 3600,
  "refresh_token": "jwt_refresh"
}
```

### POST `/v1/auth/login`

Request is the same as register except `purpose` for code should be `login`.

### POST `/v1/auth/refresh`

Request

```json
{
  "refresh_token": "jwt_refresh",
  "device_id": "macbook-air-001"
}
```

Response

```json
{
  "access_token": "jwt_access_new",
  "access_token_expires_in": 3600
}
```

### POST `/v1/auth/logout`

Request

```json
{
  "refresh_token": "jwt_refresh"
}
```

Response

```json
{
  "success": true
}
```

### GET `/v1/me`

Response

```json
{
  "id": "usr_01",
  "email": "student@example.com",
  "display_name": "Alice"
}
```

## 2.2 Courses

### GET `/v1/courses/my`

Response

```json
{
  "courses": [
    {
      "id": "course_1",
      "title": "LLM and Social Science",
      "course_code": "SOC101",
      "instructor": "Prof. AI",
      "semester": "Spring 2026",
      "joined_at": "2026-02-07T10:00:00Z"
    }
  ]
}
```

### POST `/v1/courses/join`

Request

```json
{
  "course_code": "SOC101"
}
```

Response

```json
{
  "course": {
    "id": "course_1",
    "title": "LLM and Social Science",
    "course_code": "SOC101",
    "joined_at": "2026-02-07T10:00:00Z"
  }
}
```

### GET `/v1/courses/{course_id}`

Response

```json
{
  "id": "course_1",
  "title": "LLM and Social Science",
  "description": "...",
  "instructor": "Prof. AI"
}
```

### GET `/v1/courses/{course_id}/chapters`

Response

```json
{
  "course_id": "course_1",
  "chapters": [
    {
      "id": "ch_01",
      "chapter_code": "ch1_intro",
      "title": "Introduction",
      "status": "IN_PROGRESS",
      "locked": false,
      "order": 1
    }
  ]
}
```

## 2.3 Bundle Update Checks

### POST `/v1/updates/check-app`

Used on app startup.

Request

```json
{
  "desktop_version": "0.1.0",
  "sidecar_version": "0.1.0",
  "installed": {
    "app_agents": "1.0.0",
    "experts_shared": "1.2.0"
  }
}
```

Response

```json
{
  "required": [
    {
      "bundle_type": "app_agents",
      "scope_id": "core",
      "version": "1.1.0",
      "artifact_url": "https://cdn.example.com/bundles/app_agents/core/1.1.0/bundle.tar.gz",
      "sha256": "abc123",
      "size_bytes": 128000,
      "mandatory": true
    }
  ],
  "optional": []
}
```

### POST `/v1/updates/check-chapter`

Used when user opens a chapter.

Request

```json
{
  "course_id": "course_1",
  "chapter_id": "ch_01",
  "installed": {
    "chapter_bundle": "0.9.0",
    "experts": {
      "data_inspector": "1.0.0"
    }
  }
}
```

Response

```json
{
  "required": [
    {
      "bundle_type": "chapter",
      "scope_id": "course_1/ch_01",
      "version": "1.0.0",
      "artifact_url": "https://cdn.example.com/bundles/chapter/course_1/ch_01/1.0.0/bundle.tar.gz",
      "sha256": "def456",
      "size_bytes": 220000,
      "mandatory": true
    }
  ],
  "resolved_chapter": {
    "course_id": "course_1",
    "chapter_id": "ch_01",
    "required_experts": ["data_inspector", "concept_explainer"]
  }
}
```

## 2.4 Progress and Analytics

### POST `/v1/progress/chapter`

Request

```json
{
  "course_id": "course_1",
  "chapter_id": "ch_01",
  "session_id": "sess_123",
  "status": "IN_PROGRESS",
  "task_snapshot": {
    "current_task": "Load csv",
    "completed": ["import pandas"]
  }
}
```

Response

```json
{
  "accepted": true,
  "server_time": "2026-02-07T10:20:00Z"
}
```

### POST `/v1/analytics/events:ingest`

Request

```json
{
  "events": [
    {
      "event_id": "evt_001",
      "event_type": "turn_completed",
      "event_time": "2026-02-07T10:19:30Z",
      "course_id": "course_1",
      "chapter_id": "ch_01",
      "session_id": "sess_123",
      "payload": {
        "turn": 3,
        "token_in": 560,
        "token_out": 220
      }
    }
  ]
}
```

Response

```json
{
  "accepted": 1,
  "failed": 0
}
```

## 3. Local Sidecar APIs

These APIs are served by the local Python sidecar and called by Electron.
Current desktop implementation uses the demo sidecar routes under `/api/session/*`.

## 3.1 Session Lifecycle

### POST `/api/session/new`

Request

```json
{
  "chapter_id": "course_1/ch_01",
  "desktop_context": {
    "bundle_paths": {
      "chapter_bundle_path": "/.../bundles/chapter/course_1/ch_01/1.0.0",
      "experts_shared_path": "/.../bundles/experts_shared/shared/1.2.0",
      "app_agents_path": "/.../bundles/app_agents/core/1.0.0",
      "expert_bundle_paths": {
        "data_inspector": "/.../bundles/experts/data_inspector/1.2.0"
      }
    },
    "prompt_sources": {
      "interaction_protocol_candidates": [
        "/.../agents/interaction_protocol.md"
      ],
      "socratic_vs_direct_candidates": [
        "/.../agents/socratic_vs_direct.md"
      ]
    }
  }
}
```

Response

```json
{
  "session_id": "sess_123",
  "initial_message": "Welcome to this chapter..."
}
```

### POST `/api/session/{session_id}/message/stream`

Request

```json
{
  "message": "I finished the first task.",
  "attachments": []
}
```

Response

- SSE event stream with normalized event types:
  - raw sidecar events: `start`, `companion_chunk`, `companion_complete`, `consultation_*`, `complete`, `error`
  - renderer-normalized events: `roadmap_update`, `expert_consultation`, `memo_update`, `done`, `error`

### GET `/api/session/{session_id}/dynamic_report`

Response

```json
{
  "report": "# Dynamic learning report..."
}
```

### POST `/api/session/{session_id}/end`

Response

```json
{
  "final_report": "# Final report..."
}
```

## 3.2 Optional Sidecar Utility APIs

### POST `/api/session/{session_id}/upload`

Upload working files for expert analysis.

### GET `/api/session/{session_id}/files`

List uploaded working files for expert analysis.

## 4. Electron IPC Surface (Main <-> Renderer)

These are local IPC methods, not HTTP:

- `auth:*` token storage + retrieval
- `settings:get`, `settings:set`, `settings:chooseStorageRoot`
- `secrets:saveLlmKey`, `secrets:getLlmKey`, `secrets:deleteLlmKey`
- `updates:checkApp`, `updates:checkChapter`, `bundles:install`, `bundles:list`
- `runtime:start`, `runtime:stop`, `runtime:health`, `runtime:createSession`
- `code:createFile`, `code:openPath`
- `sync:flushQueue` for offline event/progress upload

## 5. Non-Functional Rules

- No LLM API keys in analytics payloads.
- Backend never stores raw LLM keys.
- Desktop may store keys locally only in OS secure storage.
- Bundle install must verify checksum before activation.
- Failed sync jobs remain in local queue and retry with exponential backoff.

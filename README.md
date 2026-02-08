# llm-course-desktop

Electron desktop frontend for the Socratic multi-agent learning platform.

## Docs (source of truth)

- `docs/architecture_summary.md`
- `docs/Electron_refactor.md`
- `docs/student_frontend_api_draft.md`
- `docs/step3_desktop_implementation_plan.md`

## Current State

Core Step 3 integration is partially implemented:

- Backend auth/course/update/progress/analytics API integration is wired.
- Sidecar chat streaming is wired to `/api/session/*` with event normalization.
- Session creation now sends full `chapter_id` (course-scoped) to match demo orchestrator lookup.
- Bundle update/install uses backend check APIs and checksum verification.
- IPC foundation exists for settings/auth/secrets/backend/sync.

The app builds, but it still needs hardening work before being considered stable for regular use.

## Run (Dev)

1. Install dependencies:
   `npm install`
2. Run renderer + Electron:
   `npm run dev:desktop`

Optional env vars:

- `TUTOR_BACKEND_URL` (default: `http://127.0.0.1:10723`)
- `TUTOR_SIDECAR_URL` (default: `http://127.0.0.1:8000`)
- `TUTOR_PYTHON` (default: `python`)

## Remaining TODOs for Stable Runnable App

### P0 (must finish)

- [ ] Validate sidecar startup in packaged builds (runtime now does health+contract preflight with stderr diagnostics; packaged manual verification still needed).
- [x] Add centralized token refresh + retry-on-401 in backend client/request bridge.
- [x] Bind normalized stream events to roadmap/report UI states (`roadmap_update`, `memo_update`, `done`).
- [x] Pass resolved chapter/expert bundle paths into sidecar session creation (not only chapter id).
- [x] Freeze prompt-source contract for markdown inputs (chapter-local vs global agent files), and implement deterministic fallback order with explicit logging on missing files.
- [x] Remove remaining mock update IPC (`updates:getManifest`) and mock artifacts from runtime path.
- [x] Remove hardcoded legacy chapter session bootstrap in secondary chat (`components/ChatPanel.tsx`) and bind to active chapter context.
- [x] Unify sidecar contract between docs and implementation by updating draft docs to the current `/api/session/*` integration + renderer event normalization.
- [x] Add startup/session preflight checks against sidecar `/health` + `/api/contract` before session creation.
- [ ] Publish a real `python_runtime` bundle release (with embedded python + sidecar entry) and return it from backend update APIs for packaged clients.

### P1 (stability/reliability)

- [x] Implement sync queue backoff scheduler, retry caps, and dead-letter handling.
- [ ] Add required/optional bundle installation policy and retry/resume behavior.
- [x] Add sidecar auto-restart policy and explicit user-visible error states.
- [x] Fully implement `rememberLogin` behavior in runtime/session restore logic.
- [ ] Harden secure secret storage fallback strategy when `safeStorage` is unavailable.
- [ ] Add structured logs for startup/update/session/sync failures.

### P2 (release readiness)

- [ ] Add integration smoke flow tests:
  - login -> join course -> open chapter -> stream one turn -> sync progress/analytics.
- [ ] Add failure-path tests:
  - backend unavailable
  - sidecar unavailable
  - bundle checksum mismatch
- [ ] Add packaging/signing checklist and scripts for macOS/Windows releases.
- [ ] Update docs and examples to remove remaining mock references.
- [ ] Remove unused legacy modules after migration (`services/mockApi.ts`, unused mock/update paths).

## Note on Contract Alignment

`docs/student_frontend_api_draft.md` currently describes sidecar under `/local/v1/*`, while current integrated runtime uses `/api/session/*` from the demo sidecar.

`docs/step3_desktop_implementation_plan.md` records the short-term decision to keep `/api/session/*` and normalize events in the desktop client. Before release, finalize and document one canonical contract.

## Demo Core-Loop Markdown Parity

Reference loader: `demo/app/server/services/orchestrator.py`

- Chapter markdowns expected by demo orchestrator:
  - `chapter_context.md`
  - `task_list.md`
  - `task_completion_principles.md`
  - `interaction_protocol.md`
  - `socratic_vs_direct.md`
- Template markdowns expected by demo orchestrator:
  - `_templates/dynamic_report_template.md`
  - `_templates/student_error_summary_template.md`
  - `_templates/final_learning_report_template.md`

Desktop status against demo:

- [x] Session API path matches demo (`/api/session/*`).
- [x] Session `chapter_id` now preserves `course_id/chapter_name` for course-scoped markdown lookup.
- [x] Local curriculum IPC (`curriculum:getChapterContent`) now returns full chapter markdown set (including `interaction_protocol.md`, `socratic_vs_direct.md`).
- [x] Add sidecar loader fallback for mixed prompt scope (chapter markdown + global agent markdown), matching documented ownership.
- [x] Runtime launch now supports `python_runtime` bundle handoff for python executable + sidecar root in bundled production mode (with local fallback).

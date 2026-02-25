# llm-course-desktop

Electron desktop frontend for the Socratic multi-agent learning platform.

## Docs (source of truth)

- `docs/architecture_summary.md`
- `docs/Electron_refactor.md`
- `docs/student_frontend_api_draft.md`
- `docs/step3_desktop_implementation_plan.md`

## Current State

Core integration is complete:

- Backend auth/course/update/progress/analytics API integration is wired.
- Sidecar chat streaming is wired to `/api/session/*` with event normalization.
- Session creation sends full `chapter_id` (course-scoped) to match demo orchestrator lookup.
- Bundle update/install uses backend check APIs and checksum verification.
- **Miniconda-based sidecar runtime**: on first launch the app automatically downloads Miniconda from Tsinghua mirror, installs it silently, creates a `sidecar` conda env (Python 3.12), downloads the sidecar code bundle from the backend, and pip-installs its requirements. All stages are cached — subsequent launches skip completed steps in under a second. A staged Chinese progress overlay (`SidecarDownloadProgress`) covers the full startup sequence.
- LLM provider/key/model are configured by the user in desktop settings and passed to the sidecar at startup — no manual `.env` editing required.
- **Auto-update**: the app uses `electron-updater` to silently check for and download new versions from Aliyun OSS. Users see a prompt when an update is ready to install.

## Run (Dev)

1. Install dependencies:
   `npm install`
2. Run renderer + Electron:
   `npm run dev:desktop`

Optional env vars (overrides in-app settings):

- `TUTOR_BACKEND_URL` (default: `http://47.93.151.131:10723`)
- `TUTOR_SIDECAR_URL` (default: `http://127.0.0.1:8000`)
- `TUTOR_PYTHON` (override: uses conda env Python by default after first-launch setup)

## Build

```bash
# Local build (unpacked, for testing)
npm run pack:desktop

# Local build (packaged dmg/exe)
npm run build:desktop
```

macOS builds produce a universal (x64 + arm64) DMG and ZIP. Windows builds produce an x64 NSIS installer.

## Release

Releases are automated via GitHub Actions (`.github/workflows/release-desktop.yml`). A git tag triggers the full pipeline: build macOS + Windows in parallel, upload to Aliyun OSS, and create a GitHub Release.

### Tag conventions

| Tag format | Environment | Example |
|---|---|---|
| `v*` (no `-dev`) | **prod** | `v0.1.0`, `v1.0.0` |
| `v*-dev*` | **dev** | `v0.1.0-dev.1`, `v0.2.0-dev.3` |

### How to release

```bash
# 1. Bump version
npm version 0.1.0 --no-git-tag-version    # or 0.1.0-dev.1 for dev

# 2. Commit and tag
git add package.json package-lock.json
git commit -m "release: v0.1.0"
git tag v0.1.0

# 3. Push (triggers CI)
git push && git push --tags
```

CI will:
1. Detect environment from tag (`-dev` suffix → dev, otherwise → prod)
2. Inject the correct `BACKEND_URL` into the build
3. Build macOS universal (dmg + zip) and Windows x64 (nsis)
4. Upload artifacts to OSS under `desktop-releases/dev/` or `desktop-releases/prod/`
5. Create a GitHub Release (prerelease for dev tags)

The `electron-updater` in running apps checks the OSS path for `latest-mac.yml` / `latest.yml` and auto-downloads new versions.

### Required GitHub Secrets

| Secret | Purpose |
|---|---|
| `OSS_REGION` | Aliyun region, e.g. `cn-beijing` |
| `OSS_BUCKET` | OSS bucket name |
| `OSS_ACCESS_KEY_ID` | Aliyun access key ID |
| `OSS_ACCESS_KEY_SECRET` | Aliyun access key secret |
| `OSS_PUBLISH_URL_DEV` | Full OSS URL for dev updates, e.g. `https://bucket.oss-cn-xxx.aliyuncs.com/desktop-releases/dev` |
| `OSS_PUBLISH_URL_PROD` | Full OSS URL for prod updates |
| `BACKEND_URL_DEV` | Dev backend base URL |
| `BACKEND_URL_PROD` | Prod backend base URL |
| `MAC_CSC_LINK` | (optional) Base64-encoded macOS code signing certificate |
| `MAC_CSC_KEY_PASSWORD` | (optional) Certificate password |

### Auto-update flow

1. App checks OSS for updates on startup (10s delay) and every 4 hours
2. If a newer version is found, it downloads silently in the background
3. Renderer receives `app-update:downloaded` event → can show "Update ready" UI
4. Update installs on next app quit, or user can trigger immediately via `installUpdate()`

## Auth Flow

- Login: email + password
- Register: email code + password + display name

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

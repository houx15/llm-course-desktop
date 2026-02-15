# Task: sidecar-auto-download

## Context
The Knoweia desktop app (Electron + React) manages a local Python sidecar process that runs the multi-agent tutoring loop. Currently, the sidecar is **started** from a pre-existing bundled `python_runtime` bundle (resolved via `resolvePythonRuntimeBundle` in `electron/main.mjs`), but there is **no mechanism to automatically download** the sidecar bundle if it's missing.

The desktop already has full bundle download infrastructure (`downloadToTemp`, `installBundleRelease`, checksum verification, `active_index.json` tracking). The update system (`updateManager.ts`) checks for `app_agents` and `experts_shared` bundles but does NOT check for or download the `python_runtime` bundle type.

Tech stack: Electron, React 18, TypeScript, Vite.

## Objective
Make the desktop app automatically download the sidecar (python_runtime bundle) on first launch or when the sidecar bundle is missing/outdated, then start it. The user should see progress feedback during download.

## Dependencies
- Depends on: `feature/bundle-upload-api` (backend must have APIs to register and serve the sidecar bundle)
- Branch: feature/sidecar-auto-download
- Base: main

## Scope

### Files to Modify
- `electron/main.mjs` — Add sidecar bundle download logic before starting the runtime; add IPC handler for download progress
- `services/updateManager.ts` — Add `checkSidecarUpdates()` and `syncSidecarBundle()` methods that check backend for `python_runtime` bundle type
- `services/runtimeManager.ts` — Add pre-start check: if sidecar bundle missing, trigger download flow before starting
- `App.tsx` or relevant UI component — Show download progress overlay/modal when sidecar is being downloaded

### Files to Create
- `components/SidecarDownloadProgress.tsx` — UI component showing download progress (percentage, status text, retry button on failure)

### Files NOT to Touch
- `services/contentService.ts` — Content loading is separate
- `services/backendClient.ts` — Existing API client is sufficient
- The core sidecar start/stop/health-check logic in `electron/main.mjs` (only add download pre-check)

## Implementation Spec

### Step 1: Extend updateManager to handle python_runtime bundles
In `services/updateManager.ts`:
- Add `checkSidecarUpdates(): Promise<BundleDescriptor | null>` — Calls existing `/v1/updates/check-app` with `installed.python_runtime` version (or "0.0.0" if missing). Parse response for `python_runtime` bundle descriptor.
- Add `syncSidecarBundle(): Promise<boolean>` — Check for sidecar updates, if available call `window.tutorApp.installRelease(descriptor)`, return success/failure.
- Expose download progress events via a callback or EventEmitter pattern.

### Step 2: Add download progress IPC in Electron main
In `electron/main.mjs`:
- Modify `downloadToTemp()` to emit progress events via `BrowserWindow.webContents.send('download-progress', { percent, bytesDownloaded, totalBytes })` during the fetch stream
- Add IPC handler `sidecar:ensureReady` that:
  1. Checks if python_runtime bundle exists in index
  2. If missing, triggers download + install
  3. Returns `{ ready: boolean, error?: string }`

### Step 3: Add pre-start check in runtimeManager
In `services/runtimeManager.ts`:
- Before calling `startRuntime()`, call `window.tutorApp.ensureSidecarReady()`
- If sidecar needs download, emit state change to trigger UI progress overlay
- After successful download, proceed with normal start flow

### Step 4: Create download progress UI
`components/SidecarDownloadProgress.tsx`:
- Full-screen overlay (semi-transparent backdrop)
- Centered card with:
  - "Setting up Knoweia..." heading
  - Progress bar with percentage
  - Status text: "Downloading learning engine..." / "Installing..." / "Starting..."
  - Error state with retry button
- Listen to `download-progress` IPC events for real-time progress
- Auto-dismiss when sidecar health check passes

### Step 5: Integrate into app startup flow
In the main app startup sequence:
- After authentication, before entering chat:
  1. Check sidecar bundle status
  2. If missing → show SidecarDownloadProgress → download → install → start → health check
  3. If present → start directly → health check
  4. On success → proceed to chat UI

## Testing Requirements
- First launch with no python_runtime bundle → download triggers automatically
- Download progress UI shows and updates in real-time
- After successful download, sidecar starts and passes health check
- If download fails (network error), retry button works
- If sidecar bundle already exists and is up-to-date, no download occurs
- App startup with existing sidecar is not slowed down

## Acceptance Criteria
- [ ] Desktop auto-downloads sidecar python_runtime bundle when missing
- [ ] Download progress is shown to the user with percentage
- [ ] After download, sidecar starts automatically and passes health check
- [ ] Error handling: network failures show retry option
- [ ] Existing installs are not re-downloaded (version check works)
- [ ] No regressions to existing sidecar start/stop/restart logic

## Notes
- The backend `/v1/updates/check-app` endpoint already supports returning `python_runtime` bundle descriptors. The desktop just needs to include `python_runtime` in its `installed` dict when calling this endpoint.
- The sidecar bundle is a tar.gz containing a Python runtime + sidecar code. It can be large (100MB+), so progress feedback is essential.
- Consider platform-specific sidecar bundles (macOS arm64 vs x64 vs Windows). The `scope_id` field in BundleRelease can differentiate: `"py312-darwin-arm64"`, `"py312-darwin-x64"`, `"py312-win-x64"`.
- The existing `MAX_RUNTIME_AUTO_RESTART = 2` retry logic should still work after download.

# Task: code-editor

## Context
The Knoweia desktop app is an AI tutoring platform for programming education. Currently, code display uses `react-syntax-highlighter` for rendering code blocks in chat. For "code practice", the app creates a `.py` file locally and opens it in the system's default text editor (`shell.openPath`). Students must run code externally and paste output back.

Many chapters involve hands-on coding (Python, Pandas). We need an integrated code editor where students can view, edit, and run code directly within the app, with output shown inline.

Tech stack: Electron, React 18, TypeScript, Vite, TailwindCSS.

## Objective
Add an integrated code editor panel with syntax highlighting, editing, and Python code execution. The editor should appear alongside the chat when a chapter involves coding, and execution output should be capturable/shareable with the AI tutor.

## Dependencies
- Depends on: none (can be developed in parallel with other features)
- Branch: feature/code-editor
- Base: main

## Scope

### Files to Create
- `components/CodeEditor/CodeEditorPanel.tsx` — Main editor panel component with Monaco or CodeMirror
- `components/CodeEditor/OutputPanel.tsx` — Code execution output display
- `components/CodeEditor/CodeEditorToolbar.tsx` — Toolbar with Run, Clear, Copy, Send-to-Chat buttons
- `components/CodeEditor/index.ts` — Barrel export

### Files to Modify
- `package.json` — Add `@monaco-editor/react` (or `@codemirror/view` + language packages) dependency
- `electron/main.mjs` — Add IPC handlers for code execution: `code:execute`, `code:kill`, `code:readFile`, `code:writeFile`
- `App.tsx` — Add split-panel layout: chat on left, code editor on right (toggleable)
- `services/codeWorkspace.ts` — Extend with file read/write/execute capabilities instead of just creating templates
- `components/CentralChat.tsx` — Add "Insert into editor" button on code blocks; add "Share output with tutor" integration

### Files NOT to Touch
- `services/runtimeManager.ts` — Sidecar management is separate
- `electron/main.mjs` bundle management logic — Don't modify existing IPC handlers

## Implementation Spec

### Step 1: Add code execution IPC handlers in Electron
In `electron/main.mjs`, add these IPC handlers:

**`code:execute`** — Run a Python script
- Input: `{ code: string, chapterId: string, env?: Record<string, string> }`
- Spawn `python3` (or bundled Python from python_runtime) with the code as a temp file
- Stream stdout/stderr back to renderer via `webContents.send('code:output', { stream: 'stdout'|'stderr', data: string })`
- Send `webContents.send('code:exit', { exitCode: number })` on completion
- Timeout: 60 seconds default, configurable
- Working directory: `TutorApp/workspace/{chapterId}/`

**`code:kill`** — Kill running process
- Input: `{ chapterId: string }`
- Kill the spawned process for that chapter

**`code:readFile`** — Read file from workspace
- Input: `{ chapterId: string, filename: string }`
- Return file contents from workspace directory

**`code:writeFile`** — Write file to workspace
- Input: `{ chapterId: string, filename: string, content: string }`
- Write to workspace directory with path sanitization

**`code:listFiles`** — List files in chapter workspace
- Input: `{ chapterId: string }`
- Return array of `{ name, size, modified }` for workspace directory

### Step 2: Install and configure code editor component
- Add `@monaco-editor/react` to package.json (Monaco gives VS Code-like experience)
- Configure Monaco for Python language support with syntax highlighting, basic autocomplete
- Set theme to match app's dark/light mode

### Step 3: Build CodeEditorPanel component
`components/CodeEditor/CodeEditorPanel.tsx`:
- Monaco editor instance with Python language mode
- File tabs (if multiple files in workspace)
- Auto-save on change (debounced 1s) to workspace via `code:writeFile`
- Load initial content from chapter template or existing workspace file
- Props: `chapterId`, `onOutputGenerated`, `visible`

### Step 4: Build OutputPanel component
`components/CodeEditor/OutputPanel.tsx`:
- Terminal-like output display (dark background, monospace font)
- Real-time streaming of stdout (white text) and stderr (red text)
- Clear button
- Scrollable with auto-scroll to bottom
- "Send to chat" button — copies output and inserts into chat input with markdown formatting

### Step 5: Build CodeEditorToolbar
`components/CodeEditor/CodeEditorToolbar.tsx`:
- **Run** button (green play icon) — executes current file
- **Stop** button (red square, shown when running) — kills process
- **Clear Output** button
- **Copy Output** button
- **Send to Tutor** button — sends output to chat as a message like "Here is my code output:\n```\n{output}\n```"
- File selector dropdown (if multiple files)
- Running indicator (spinner)

### Step 6: Integrate split-panel layout into App
In `App.tsx`:
- Add a toggleable split-panel layout when in chapter chat view
- Left panel: existing CentralChat
- Right panel: CodeEditorPanel + OutputPanel (stacked vertically)
- Toggle button in chat header or toolbar: "Code Editor" icon
- Resizable splitter between panels
- Use CSS flexbox or a library like `react-resizable-panels`
- Editor panel state persists per chapter (code content, output)

### Step 7: Integrate with chat
In `components/CentralChat.tsx`:
- On code blocks in AI messages, add an "Open in Editor" button that copies the code into the editor panel
- When user clicks "Send to Tutor" from output panel, inject the output as a user message
- Chapter scripts/datasets from bundles should auto-load in editor when available

## Testing Requirements
- Editor loads with Python syntax highlighting
- Code can be written and executed; stdout/stderr appear in output panel
- Long-running scripts can be killed with Stop button
- Output can be sent to chat
- Code blocks from AI can be opened in editor
- Split panel toggles correctly without losing state
- Auto-save persists code across panel toggles
- Multiple chapters maintain separate workspaces

## Acceptance Criteria
- [ ] Monaco (or CodeMirror) editor integrated with Python syntax highlighting
- [ ] Code execution works via Electron IPC with real-time stdout/stderr streaming
- [ ] Output panel shows execution results with proper formatting
- [ ] "Send to Tutor" sends output to chat
- [ ] "Open in Editor" on chat code blocks works
- [ ] Split-panel layout is toggleable and resizable
- [ ] Process timeout and kill functionality works
- [ ] Workspace files persist per chapter

## Notes
- Monaco Editor is ~4MB but provides the best editing experience. CodeMirror 6 is lighter (~500KB) but requires more setup. Recommend Monaco for this use case.
- For Python execution, prefer the bundled Python from `python_runtime` bundle (same one used for sidecar). Fall back to system `python3`.
- Security: Sanitize all file paths to prevent directory traversal. Use `assertInside()` pattern from existing code.
- Consider adding `requirements.txt` support per chapter workspace later (not in this scope).
- The sidecar already has dataset file upload support — the code editor's workspace could share the same directory for seamless data access.

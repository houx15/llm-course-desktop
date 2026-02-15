# Task: knoweia-branding

## Context
This is the Electron + React + Vite desktop app for an AI tutoring platform. The product has been named **Knoweia**. Currently the UI shows "LLM & 社会科学" as the product name with a generic BookOpen icon from lucide-react. We need to rebrand the entire app to "Knoweia".

Tech stack: Electron, React 18, TypeScript, Vite, TailwindCSS, lucide-react icons.

## Objective
Rebrand the desktop app from "LLM & 社会科学" to "Knoweia", including app icon, window title, UI text, and any references to the old name.

## Dependencies
- Depends on: none
- Branch: feature/knoweia-branding
- Base: main

## Scope

### Files to Modify
- `electron/main.mjs` — Change window title from `'LLM & 社会科学'` to `'Knoweia'` (line ~517)
- `components/TopBar.tsx` — Replace product name display "LLM & 社会科学" and subtitle "Local Environment" with "Knoweia" branding (line ~32)
- `package.json` — Update `name`, `productName`, `description` fields to reflect "Knoweia"
- `electron-builder.yml` or equivalent build config — Update `productName`, `appId` to use "knoweia"
- `index.html` — Update `<title>` tag

### Files to Create
- `assets/icon.png` (1024x1024) — App icon for Knoweia. Design: a clean, modern icon that conveys knowledge/learning. Generate using AI image generation or create a simple geometric design programmatically.
- `assets/icon.icns` — macOS icon format (can be generated from PNG)
- `assets/icon.ico` — Windows icon format (can be generated from PNG)
- `assets/logo.svg` — In-app logo for sidebar/topbar usage

### Files NOT to Touch
- `services/` — No service logic changes
- `electron/main.mjs` beyond the title string — Don't change any IPC handlers or bundle logic

## Implementation Spec

### Step 1: Create app icon assets
- Design or generate a Knoweia icon (1024x1024 PNG minimum)
- The icon should convey "knowledge" + "AI" — consider a stylized "K" or abstract brain/book motif
- Generate .icns (macOS) and .ico (Windows) variants from the PNG
- Create a simple SVG logo for in-app use (topbar/sidebar)

### Step 2: Update Electron window title
- In `electron/main.mjs`, find `title: 'LLM & 社会科学'` and replace with `title: 'Knoweia'`
- Update the BrowserWindow icon property to point to the new icon asset

### Step 3: Update TopBar component
- In `components/TopBar.tsx`, replace the product name text
- Replace the BookOpen lucide icon with the new Knoweia SVG logo or a more fitting icon
- Update or remove the "Local Environment" subtitle — replace with a tagline like "AI Learning Platform" or remove entirely
- Ensure the clickable logo area still navigates to dashboard

### Step 4: Update package.json and build config
- `package.json`: Update `name` to `"knoweia-desktop"`, add `productName: "Knoweia"`
- Update `description` to reflect the Knoweia branding
- Update electron-builder config: `appId` to `"com.knoweia.desktop"`, `productName` to `"Knoweia"`, icon paths

### Step 5: Update HTML title
- In `index.html`, change `<title>` to "Knoweia"

## Testing Requirements
- App window title shows "Knoweia"
- TopBar displays "Knoweia" with new logo/icon
- App icon appears correctly in dock/taskbar
- Build produces correctly named output (Knoweia.app / Knoweia.exe)
- Clickable logo still navigates to dashboard

## Acceptance Criteria
- [ ] All references to "LLM & 社会科学" are replaced with "Knoweia"
- [ ] App icon is updated in window, dock/taskbar
- [ ] TopBar shows new branding with appropriate logo
- [ ] package.json and build config reflect "Knoweia"
- [ ] HTML title is "Knoweia"
- [ ] No functional regressions — app launches and navigates normally

## Notes
- The app currently uses lucide-react BookOpen icon as a placeholder. A proper SVG logo is ideal but a well-chosen lucide icon (e.g., `GraduationCap`, `Brain`, `Sparkles`) is acceptable as a quick solution.
- Chinese UI text elsewhere in the app should remain Chinese — only the product name changes to "Knoweia".
- For icon generation, consider using a simple programmatic approach (e.g., canvas-based) or AI image generation if available.

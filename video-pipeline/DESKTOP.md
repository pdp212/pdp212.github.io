# Desktop Application Specification

**Project:** `github-portfolio/video-pipeline`  
**Phase:** 11 — Delivery-Only Video Deployment Pipeline  
**Desktop Framework:** Electron 44.5+ / Node.js ESM

---

## 1. Overview & Architecture

The Video Pipeline desktop application wraps the local HTTP pipeline server inside an Electron container, delivering a native desktop experience on macOS.

```
┌─────────────────────────────────────────────────────────────┐
│                 ELECTRON MAIN PROCESS                       │
│             (app/desktop/main.ts, main.js)                  │
│  - Finds open port (default 3210, fallback dynamically)     │
│  - Starts internal PipelineUiServer                         │
│  - Creates BrowserWindow (1100x820, dark background)        │
│  - Manages native window events & clean shutdown            │
└──────────────────────────────┬──────────────────────────────┘
                               │
               Loads URL: http://127.0.0.1:3210/
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                 ELECTRON RENDERER WINDOW                    │
│  - Cinematic Brutalism Web UI (Roboto, #050505)             │
│  - Native Drag & Drop file ingestion                        │
│  - File Picker dialog via <input type="file">               │
│  - Live SSE progress & job audit inspector modal            │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Server & Window Lifecycle

1. **App Launch (`app.whenReady()`)**:
   - `main.ts` invokes `startDesktopApp()`.
   - Starts `PipelineUiServer` listening on `127.0.0.1:3210` (or dynamically scans for the next available port if `3210` is occupied).
   - Once the server is ready, creates an Electron `BrowserWindow` loading `http://127.0.0.1:<port>/`.
2. **Window Configuration**:
   - Width: `1100px`, Height: `820px`, Min Width: `800px`, Min Height: `600px`.
   - Background Color: `#050505` (matches Cinematic Brutalism theme).
   - macOS Native: `titleBarStyle: 'hiddenInset'`, `trafficLightPosition: { x: 16, y: 16 }`.
   - Security: `nodeIntegration: false`, `contextIsolation: true`.
3. **Clean Shutdown (`window-all-closed` / `before-quit`)**:
   - On window close, Electron shuts down the embedded `PipelineUiServer` and closes all active Server-Sent Events (SSE) connections.
   - Any active `AbortController` is signaled to safely abort in-flight network requests.

---

## 3. Desktop Commands

All desktop commands are defined in [`package.json`](file:///Users/sss-phat/Documents/github-portfolio/video-pipeline/package.json):

```bash
# 1. Launch desktop app in development mode
npm run desktop:dev

# 2. Build TypeScript distribution
npm run desktop:build

# 3. Package standalone macOS desktop application bundle
npm run desktop:package
```

### Packaging & Binary Output
* Packaging compiles the distribution and outputs to: `video-pipeline/release-builds/`.
* The resulting package contains the standalone `.app` bundle for macOS.

---

## 4. Native Interactions & Safety

* **Drag & Drop**: Dropping files onto the interface triggers asynchronous multipart streaming to `/api/upload`, staging them inside `video-pipeline/temp/uploads/` with instant FFprobe validation.
* **File Picker**: Clicking the drop zone opens the native macOS file selection dialog supporting multi-selection.
* **Environment Isolation**: The renderer process does not have direct access to `process.env` or local filesystems; all interactions pass through the validated HTTP API.

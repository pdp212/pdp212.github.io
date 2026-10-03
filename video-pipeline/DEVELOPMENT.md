# Development Guide

**Project:** `github-portfolio/video-pipeline`  
**Phase:** 11 — Delivery-Only Video Deployment Pipeline  
**Runtime:** Node.js 20+ / 22+ (ESM `NodeNext`), TypeScript 5.8+

---

## 1. System Requirements & Prerequisites

* **Node.js**: `v20.0.0` or `v22.0.0+` (Native `node:test` runner, ESM support)
* **npm**: `v10.0.0+`
* **FFprobe**: Required on `$PATH` (media inspection)
  ```bash
  # macOS (Homebrew)
  brew install ffmpeg
  
  # Verify installation
  ffprobe -version
  ```
* **Git**: `2.30+`

---

## 2. Setup & Installation

```bash
# 1. Navigate to the video-pipeline workspace
cd video-pipeline

# 2. Install dependencies
npm install

# 3. Configure environment variables
cp .env.example .env
```

Fill in your `.env` file with test or production credentials (see [`CONFIGURATION.md`](file:///Users/sss-phat/Documents/github-portfolio/video-pipeline/CONFIGURATION.md)).

---

## 3. Core Development Commands

All npm scripts defined in [`package.json`](file:///Users/sss-phat/Documents/github-portfolio/video-pipeline/package.json):

| Command | Action |
| :--- | :--- |
| `npm run build` | Compiles TypeScript source files from `app/`, `pipeline/`, `engines/`, `core/` to `dist/` |
| `npm run typecheck` | Validates TypeScript types across the entire project (`tsc --noEmit`) |
| `npm test` | Runs the full test suite (185 tests) using Node.js native test runner |
| `npm run ui` | Builds TypeScript and starts the Web UI server on `http://127.0.0.1:3210` |
| `npm run desktop:dev` | Builds TypeScript and launches the Electron desktop application in dev mode |
| `npm run desktop:build`| Builds the complete distribution for desktop packaging |
| `npm run desktop:package` | Compiles and packages the standalone macOS `.app` bundle |
| `npm run input:test` | Alias for running test suite |
| `npm run validate` | Runs TypeScript type checking |

---

## 4. Codebase Directory Structure

```
video-pipeline/
├── app/                      # Application Layer
│   ├── application/          # UploadService, InputController, VideoQueue, QueueStore
│   ├── desktop/              # Electron main process & window manager
│   ├── main/                 # Unified CLI/Web launcher
│   └── ui/                   # HTTP server, HTML/CSS/JS frontend, SSE handler
├── core/                     # Core Layer
│   ├── errors/               # Domain error classes
│   ├── filesystem/           # Safe path resolvers & staging directories
│   ├── logger/               # Structured logging & SSE sinks
│   ├── security/             # SecretSanitizer & credential validation
│   └── state/                # JobStore, StateStore, audit trail
├── engines/                  # Engines Layer
│   ├── git/                  # Git safety, branch checks, and working tree cleanup
│   ├── github/               # GitHub Actions workflow polling
│   ├── manifest/             # Atomic manifest reader, diff, validator, writer
│   ├── production/           # Live website smoke tester
│   ├── r2/                   # Cloudflare R2 client, AWS SigV4 signer, uploader, verifier
│   ├── stream/               # HTTP 206 Partial Content range verifier
│   └── video/                # FFprobe inspector, stream validator, key resolver
├── pipeline/                 # Pipeline Layer
│   ├── context.ts            # PipelineContext & PipelineItem types
│   ├── pipeline.ts           # VideoPipelineOrchestrator
│   ├── state-machine.ts      # PipelineStateMachine
│   └── steps/                # 12 linear delivery step modules
├── tests/                    # Tests Layer
│   ├── fixtures/             # Mock files & test data
│   ├── integration/          # Multi-step integration tests
│   ├── security/             # Secret leak tests & safety boundaries
│   └── unit/                 # Unit tests across phases 01 through 11
├── config/                   # Config Layer
│   ├── pipeline.config.json  # Declarative configuration (strictly zero secrets)
│   └── schema/               # JSON Schema validation
├── data/                     # Persistent Data
│   ├── jobs/                 # Persisted JobRecord JSON files
│   └── queue.json            # Persisted Video Queue
├── DESKTOP.md                # Desktop architecture documentation
├── USER_GUIDE.md             # Operational user guide
└── README.md                 # Project entry point
```

---

## 5. Coding Standards & Conventions

1. **TypeScript ESM**: All internal imports must include explicit `.js` extensions (e.g. `import { JobStore } from './job-store.js'`).
2. **Zero Secrets in Code**: Never commit API keys, secrets, or tokens. Use `SecretSanitizer` to scrub sensitive strings.
3. **Delivery-Only Model**: Never transcode or alter video master media. Deliver final artifacts as prepared in DaVinci Resolve.
4. **Atomic File Updates**: Any modification to persistent files (`work-manifest.json`, `queue.json`, `jobs/*.json`) must use temporary file writes and atomic renames.
5. **Error Handling**: Use the typed error hierarchy from `core/errors/` rather than throwing raw `Error` strings.
6. **No Parallel Implementations**: Extend the single `VideoPipelineOrchestrator` when adding pipeline features.

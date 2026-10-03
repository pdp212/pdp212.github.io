# Video Pipeline — Documentation Index

Welcome to the official documentation for the **Video Pipeline** project. This documentation set reflects the complete, verified Phase 01–11 implementation.

---

## 1. Documentation Index

| Document | Purpose | Target Audience |
| :--- | :--- | :--- |
| [`README.md`](file:///Users/sss-phat/Documents/github-portfolio/video-pipeline/README.md) | Project entry point, feature overview, quickstart, and quick links | Everyone |
| [`USER_GUIDE.md`](file:///Users/sss-phat/Documents/github-portfolio/video-pipeline/USER_GUIDE.md) | Operational guide for dragging & dropping videos, running pipelines, and viewing history | End Users / Operators |
| [`ARCHITECTURE.md`](file:///Users/sss-phat/Documents/github-portfolio/video-pipeline/ARCHITECTURE.md) | Comprehensive system architecture, module boundaries, layers, and design patterns | Engineers & Architects |
| [`PIPELINE.md`](file:///Users/sss-phat/Documents/github-portfolio/video-pipeline/PIPELINE.md) | Step-by-step pipeline execution, state machine diagram, and atomic transactions | Developers & QA |
| [`DESKTOP.md`](file:///Users/sss-phat/Documents/github-portfolio/video-pipeline/DESKTOP.md) | Electron desktop packaging, process lifecycle, window management, and native integration | Desktop & App Engineers |
| [`API.md`](file:///Users/sss-phat/Documents/github-portfolio/video-pipeline/API.md) | Complete HTTP REST API and Server-Sent Events (SSE) reference | Frontend & Integration Engineers |
| [`DATA_MODEL.md`](file:///Users/sss-phat/Documents/github-portfolio/video-pipeline/DATA_MODEL.md) | TypeScript types, persistence schemas (`queue.json`, `jobs/*.json`, `work-manifest.json`) | Backend Developers |
| [`JOB_LIFECYCLE.md`](file:///Users/sss-phat/Documents/github-portfolio/video-pipeline/JOB_LIFECYCLE.md) | Job states, transitions, persistent history storage, and crash recovery mechanics | Developers & Operators |
| [`CANCELLATION.md`](file:///Users/sss-phat/Documents/github-portfolio/video-pipeline/CANCELLATION.md) | Real-time cancellation propagation, network abort, and safety boundaries | Developers & System Engineers |
| [`DEVELOPMENT.md`](file:///Users/sss-phat/Documents/github-portfolio/video-pipeline/DEVELOPMENT.md) | Local environment setup, dependencies, build commands, and workflows | Contributors & Maintainers |
| [`TESTING.md`](file:///Users/sss-phat/Documents/github-pipeline/video-pipeline/TESTING.md) | Test suite breakdown, runner configurations, test patterns, and test baseline | QA & Developers |
| [`CONFIGURATION.md`](file:///Users/sss-phat/Documents/github-portfolio/video-pipeline/CONFIGURATION.md) | Full breakdown of `pipeline.config.json`, schema validation, and `.env` variables | DevOps & Developers |
| [`SECURITY.md`](file:///Users/sss-phat/Documents/github-portfolio/video-pipeline/SECURITY.md) | Credential management, log redaction, staging isolation, and Git safety rules | Security & DevOps |
| [`TROUBLESHOOTING.md`](file:///Users/sss-phat/Documents/github-portfolio/video-pipeline/TROUBLESHOOTING.md) | Diagnostic guide for media inspection, R2, Git, HTTP 206, and desktop errors | Operators & Support |
| [`RELEASE.md`](file:///Users/sss-phat/Documents/github-portfolio/video-pipeline/RELEASE.md) | Packaging workflows, desktop `.app` distribution, and release checklists | Release Engineers |
| [`PHASE_HISTORY.md`](file:///Users/sss-phat/Documents/github-portfolio/video-pipeline/PHASE_HISTORY.md) | Architectural evolution across Phases 01 through 11 | Historians & Reviewers |

---

## 2. Where Should I Start?

Depending on your role and task, follow these recommended reading paths:

### For End Users & Content Creators
```
README.md ──► USER_GUIDE.md ──► (TROUBLESHOOTING.md if needed)
```
1. Start with [`README.md`](file:///Users/sss-phat/Documents/github-portfolio/video-pipeline/README.md) for a high-level understanding of what the tool does.
2. Read [`USER_GUIDE.md`](file:///Users/sss-phat/Documents/github-portfolio/video-pipeline/USER_GUIDE.md) to learn how to launch the app, drop master videos, run the pipeline, and inspect job history.

### For Software Developers & Maintainers
```
README.md ──► ARCHITECTURE.md ──► DEVELOPMENT.md ──► PIPELINE.md ──► DATA_MODEL.md
```
1. Get the system overview in [`ARCHITECTURE.md`](file:///Users/sss-phat/Documents/github-portfolio/video-pipeline/ARCHITECTURE.md).
2. Set up your local Node.js and TypeScript environment via [`DEVELOPMENT.md`](file:///Users/sss-phat/Documents/github-portfolio/video-pipeline/DEVELOPMENT.md).
3. Trace pipeline execution flow in [`PIPELINE.md`](file:///Users/sss-phat/Documents/github-portfolio/video-pipeline/PIPELINE.md).
4. Review the core interfaces and persistent state formats in [`DATA_MODEL.md`](file:///Users/sss-phat/Documents/github-portfolio/video-pipeline/DATA_MODEL.md).

### For Security & Infrastructure Engineers
```
SECURITY.md ──► CONFIGURATION.md ──► CANCELLATION.md
```
1. Review credential isolation, sanitization boundaries, and staging rules in [`SECURITY.md`](file:///Users/sss-phat/Documents/github-portfolio/video-pipeline/SECURITY.md).
2. Inspect environment variables and JSON schema in [`CONFIGURATION.md`](file:///Users/sss-phat/Documents/github-portfolio/video-pipeline/CONFIGURATION.md).
3. Review abort signal propagation and network abort in [`CANCELLATION.md`](file:///Users/sss-phat/Documents/github-portfolio/video-pipeline/CANCELLATION.md).

### For QA & Release Engineers
```
TESTING.md ──► RELEASE.md ──► DESKTOP.md
```
1. Understand the 185-test regression baseline and test runner structure in [`TESTING.md`](file:///Users/sss-phat/Documents/github-portfolio/video-pipeline/TESTING.md).
2. Follow the verified release checklist and build packaging in [`RELEASE.md`](file:///Users/sss-phat/Documents/github-portfolio/video-pipeline/RELEASE.md).
3. Inspect the Electron wrapper lifecycle in [`DESKTOP.md`](file:///Users/sss-phat/Documents/github-portfolio/video-pipeline/DESKTOP.md).

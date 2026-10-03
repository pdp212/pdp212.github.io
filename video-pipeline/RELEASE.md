# Release & Desktop Packaging Guide

**Project:** `github-portfolio/video-pipeline`  
**Phase:** 11 — Delivery-Only Video Deployment Pipeline

---

## 1. Packaging Commands & Output Paths

All packaging scripts are defined in [`package.json`](file:///Users/sss-phat/Documents/github-portfolio/video-pipeline/package.json):

```bash
# 1. Type check codebase
npm run typecheck

# 2. Run all unit and integration tests (185 tests)
npm test

# 3. Build TypeScript distribution
npm run desktop:build

# 4. Package standalone application
npm run desktop:package
```

### Output Directories
* **Compiled JavaScript:** `video-pipeline/dist/`
* **Release Artifacts:** `video-pipeline/release-builds/`

---

## 2. Release Verification Checklist

Before creating a new release or distributing a packaged build, verify each item:

* [ ] `npm run typecheck` passes with zero TypeScript errors.
* [ ] `npm test` runs with 185 tests passing, 0 failures, 0 skipped.
* [ ] No secrets or tokens are present in `package.json`, `pipeline.config.json`, or committed files.
* [ ] Root `.gitignore` prevents `.env` and `assets/videos/projects/*` from being tracked.
* [ ] `npm run desktop:dev` launches the Electron window and connects to `PipelineUiServer` without errors.
* [ ] Native Drag & Drop and File Picker accept master videos and populate the queue.
* [ ] Cancelling a test pipeline aborts uploads cleanly and transitions to `CANCELLED`.
* [ ] Application restart properly restores the video queue and recovers interrupted jobs.

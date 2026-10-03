/**
 * Video Pipeline UI Server — Phase 08 Complete Implementation
 *
 * Lightweight built-in HTTP server providing:
 * - Drag & Drop input zone with file picker
 * - Video queue with metadata display
 * - Full pipeline execution with real-time progress
 * - SSE (Server-Sent Events) for live log streaming
 * - Stage tracker, error panel, completion panel
 *
 * Zero external runtime dependencies (native node:http).
 * Consumes the real PipelineOrchestrator — no fake progress.
 */

import http from 'node:http';
import type { InputController } from '../application/input-controller.js';
import { UploadService } from '../application/upload-service.js';
import { JobStore, type JobRecord } from '../../core/state/job-store.js';
import type { LogEntry, PipelineLogger } from '../../core/logger/logger.js';
import type { PipelineStage } from '../../core/errors/pipeline-errors.js';

export interface UiServerOptions {
  port?: number;
  host?: string;
  stagingDirOverride?: string;
  jobStorageDirOverride?: string;
}

/** Tracks in-flight pipeline execution state for the UI. */
interface PipelineRunState {
  isRunning: boolean;
  pipelineId: string | null;
  jobId: string | null;
  currentStage: PipelineStage;
  logs: LogEntry[];
  startedAt: string | null;
  error: string | null;
  result: 'pending' | 'success' | 'failed' | 'cancelled' | 'idle';
  itemCount: number;
}

export class PipelineUiServer {
  private readonly controller: InputController;
  private readonly logger: PipelineLogger;
  private readonly uploadService: UploadService;
  private readonly jobStore: JobStore;
  private server: http.Server | null = null;
  private readonly port: number;
  private readonly host: string;
  private activeAbortController: AbortController | null = null;

  /** Active SSE clients — each is an open HTTP response. */
  private readonly sseClients: Set<http.ServerResponse> = new Set();

  /** Current pipeline execution state. */
  private runState: PipelineRunState = {
    isRunning: false,
    pipelineId: null,
    jobId: null,
    currentStage: 'IDLE',
    logs: [],
    startedAt: null,
    error: null,
    result: 'idle',
    itemCount: 0,
  };

  constructor(controller: InputController, logger: PipelineLogger, options?: UiServerOptions) {
    this.controller = controller;
    this.logger = logger;
    this.uploadService = new UploadService(controller, logger, options?.stagingDirOverride);
    this.jobStore = new JobStore(options?.jobStorageDirOverride);
    this.port = options?.port || 3210;
    this.host = options?.host || '127.0.0.1';
  }

  public getJobStore(): JobStore {
    return this.jobStore;
  }

  public async start(): Promise<string> {
    // Recover any interrupted jobs and restore queue on startup
    this.jobStore.recoverInterruptedJobs();
    try {
      await this.controller.restoreQueue();
    } catch {
      // Non-critical queue restoration error
    }

    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res);
      });

      this.server.on('error', (err) => {
        reject(err);
      });

      this.server.listen(this.port, this.host, () => {
        const url = `http://${this.host}:${this.port}`;
        resolve(url);
      });
    });
  }

  public async stop(): Promise<void> {
    // Abort any active pipeline
    if (this.activeAbortController) {
      this.activeAbortController.abort();
    }

    // Close all SSE connections
    for (const client of this.sseClients) {
      client.end();
    }
    this.sseClients.clear();

    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }

  // ===========================================================================
  // Request Router
  // ===========================================================================

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = new URL(req.url || '/', `http://${this.host}:${this.port}`);

    // CORS & JSON Headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // --- Static ---
    if (url.pathname === '/favicon.ico') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (url.pathname === '/' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(renderHtmlPage());
      return;
    }

    // --- Upload API (Phase 09 Browser-Native Ingestion) ---
    if (url.pathname === '/api/upload' && req.method === 'POST') {
      try {
        const result = await this.uploadService.handleUploadRequest(req);
        const statusCode = result.success ? 200 : result.items.length > 0 ? 200 : 400;
        this.jsonResponse(res, statusCode, result);
        this.broadcastSSE('queue', this.controller.getSummary());
      } catch (err) {
        this.jsonResponse(res, 500, { success: false, error: (err as Error).message });
      }
      return;
    }

    // --- Job History API (Phase 10) ---
    if (url.pathname === '/api/jobs' && req.method === 'GET') {
      const jobs = this.jobStore.getAllJobs();
      this.jsonResponse(res, 200, { jobs });
      return;
    }

    if (url.pathname.startsWith('/api/jobs/') && req.method === 'GET') {
      const jobId = url.pathname.replace('/api/jobs/', '');
      const job = this.jobStore.getJob(jobId);
      if (job) {
        this.jsonResponse(res, 200, { job });
      } else {
        this.jsonResponse(res, 404, { error: `Job not found: ${jobId}` });
      }
      return;
    }

    // --- Pipeline Cancellation API (Phase 10) ---
    if (url.pathname === '/api/pipeline/cancel' && req.method === 'POST') {
      if (this.runState.isRunning && this.activeAbortController) {
        this.activeAbortController.abort();
        this.runState.isRunning = false;
        this.runState.result = 'cancelled';
        this.runState.currentStage = 'CANCELLED';
        this.runState.error = 'Pipeline execution cancelled by user request.';
        this.broadcastSSE('stage', { stage: 'CANCELLED', status: 'FAILURE' });
        this.broadcastSSE('pipeline', { status: 'cancelled', message: 'Pipeline cancelled by user' });
        this.jsonResponse(res, 200, { success: true, message: 'Pipeline cancellation requested.' });
      } else {
        this.jsonResponse(res, 400, { error: 'No pipeline is currently running.' });
      }
      return;
    }

    // --- Queue API ---
    if (url.pathname === '/api/queue' && req.method === 'GET') {
      const summary = this.controller.getSummary();
      this.jsonResponse(res, 200, summary);
      return;
    }

    if (url.pathname === '/api/queue/add' && req.method === 'POST') {
      this.parseJsonBody(req, async (body) => {
        try {
          const paths: string[] = Array.isArray(body.paths)
            ? body.paths
            : typeof body.path === 'string'
              ? [body.path]
              : [];

          if (paths.length === 0) {
            this.jsonResponse(res, 400, { error: 'Missing path or paths array.' });
            return;
          }

          const added = await this.controller.addVideos(paths);
          this.jsonResponse(res, 200, { success: true, count: added.length, items: added });
          this.broadcastSSE('queue', this.controller.getSummary());
        } catch (err) {
          this.jsonResponse(res, 500, { error: (err as Error).message });
        }
      });
      return;
    }

    if (url.pathname === '/api/queue/remove' && req.method === 'POST') {
      this.parseJsonBody(req, (body) => {
        const id = body.id;
        if (!id || typeof id !== 'string') {
          this.jsonResponse(res, 400, { error: 'Missing item id.' });
          return;
        }

        const removed = this.controller.removeVideo(id);
        this.jsonResponse(res, 200, { success: removed });
        this.broadcastSSE('queue', this.controller.getSummary());
      });
      return;
    }

    if (url.pathname === '/api/queue/clear' && req.method === 'POST') {
      this.controller.clearQueue();
      this.jsonResponse(res, 200, { success: true });
      this.broadcastSSE('queue', this.controller.getSummary());
      return;
    }

    // --- Pipeline API ---
    if (url.pathname === '/api/pipeline/status' && req.method === 'GET') {
      this.jsonResponse(res, 200, this.getPublicRunState());
      return;
    }

    if (url.pathname === '/api/pipeline/run' && req.method === 'POST') {
      this.parseJsonBody(req, (body) => {
        this.handleRunPipeline(res, body.isDryRun === true);
      });
      return;
    }

    // --- SSE ---
    if (url.pathname === '/api/pipeline/events' && req.method === 'GET') {
      this.handleSSEConnection(res);
      return;
    }

    // --- Legacy endpoints (backward compat) ---
    if (url.pathname === '/api/context' && req.method === 'GET') {
      try {
        const ctx = this.controller.preparePipelineContext(true);
        this.jsonResponse(res, 200, {
          pipelineId: ctx.pipelineId,
          currentStage: ctx.currentStage,
          itemCount: ctx.items.length,
          items: ctx.items,
        });
      } catch (err) {
        this.jsonResponse(res, 400, { error: (err as Error).message });
      }
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }

  // ===========================================================================
  // Pipeline Execution
  // ===========================================================================

  private handleRunPipeline(res: http.ServerResponse, isDryRun: boolean): void {
    if (this.runState.isRunning) {
      this.jsonResponse(res, 409, { error: 'Pipeline is already running.' });
      return;
    }

    const summary = this.controller.getSummary();
    if (summary.ready === 0) {
      this.jsonResponse(res, 400, { error: 'No valid videos in queue.' });
      return;
    }

    this.activeAbortController = new AbortController();
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    // Reset run state
    this.runState = {
      isRunning: true,
      pipelineId: null,
      jobId,
      currentStage: 'IDLE',
      logs: [],
      startedAt: new Date().toISOString(),
      error: null,
      result: 'pending',
      itemCount: summary.ready,
    };

    // Return immediately — pipeline runs asynchronously
    this.jsonResponse(res, 202, { started: true, isDryRun, itemCount: summary.ready, jobId });

    // Start pipeline in background
    this.executePipeline(isDryRun, jobId);
  }

  private async executePipeline(isDryRun: boolean, jobId: string): Promise<void> {
    const startedAt = this.runState.startedAt || new Date().toISOString();
    const startTime = Date.now();

    try {
      // 1. Import orchestrator dynamically (same pattern as existing code)
      const { VideoPipelineOrchestrator } = await import('../../pipeline/pipeline.js');
      const { PipelineLogger: LoggerClass } = await import('../../core/logger/logger.js');
      const { SecretSanitizer } = await import('../../core/security/secret-sanitizer.js');

      // 2. Prepare context from queue
      const baseContext = this.controller.preparePipelineContext(isDryRun);
      this.runState.pipelineId = baseContext.pipelineId;

      // Save initial JobRecord
      const initialJob: JobRecord = {
        jobId,
        pipelineId: baseContext.pipelineId,
        createdAt: startedAt,
        startedAt,
        completedAt: null,
        status: 'RUNNING',
        currentStage: 'IDLE',
        inputCount: baseContext.items.length,
        completedCount: 0,
        failedCount: 0,
        items: baseContext.items.map(i => ({
          id: i.id,
          filename: i.fileName || i.id,
          status: i.status,
        })),
        isDryRun,
        error: null,
        durationMs: null,
      };
      this.jobStore.saveJob(initialJob);
      this.broadcastSSE('job', initialJob);

      // 3. Create SSE-broadcasting logger
      const sseBroadcastSink = (entry: LogEntry) => {
        // Store in run state
        this.runState.logs.push(entry);
        // Update current stage
        this.runState.currentStage = entry.stage;
        // Console output
        const time = entry.timestamp.split('T')[1]?.replace('Z', '') || entry.timestamp;
        const tag = entry.status === 'SUCCESS' ? '✔' : entry.status === 'FAILURE' ? '✖' : 'ℹ';
        const line = `[${time}] [${entry.stage}] [${entry.event}] ${tag} ${entry.message}`;
        if (entry.status === 'FAILURE') {
          console.error(line);
        } else {
          console.log(line);
        }
        // Broadcast to SSE clients
        this.broadcastSSE('log', entry);
        this.broadcastSSE('stage', { stage: entry.stage, status: entry.status });
      };

      const sseLogger = new LoggerClass({ minLevel: 'DEBUG', sink: sseBroadcastSink });

      // 4. Inject credentials for non-dry-run
      let credentials = baseContext.credentials;
      if (!isDryRun) {
        try {
          credentials = SecretSanitizer.getCredentials(false);
        } catch {
          // Credentials missing — pipeline steps that need them will fail gracefully
        }
      }

      // 5. Build enriched context with SSE logger and abortController
      const context = {
        ...baseContext,
        logger: sseLogger,
        credentials,
        abortController: this.activeAbortController || undefined,
      };

      // 6. Notify clients pipeline started
      this.broadcastSSE('pipeline', {
        status: 'running',
        pipelineId: context.pipelineId,
        jobId,
        isDryRun,
        itemCount: context.items.length,
      });

      // 7. Execute the real pipeline
      const orchestrator = new VideoPipelineOrchestrator();
      const result = await orchestrator.execute(context);

      const durationMs = Date.now() - startTime;
      this.runState.isRunning = false;
      this.runState.currentStage = result.finalStage as PipelineStage;
      this.activeAbortController = null;

      if (result.finalStage === 'CANCELLED' || this.runState.result === 'cancelled') {
        this.runState.result = 'cancelled';
        const updatedJob: JobRecord = {
          ...initialJob,
          status: 'CANCELLED',
          currentStage: 'CANCELLED',
          completedAt: new Date().toISOString(),
          durationMs,
          error: 'Pipeline cancelled by user',
        };
        this.jobStore.saveJob(updatedJob);
        this.broadcastSSE('job', updatedJob);
      } else if (result.success) {
        this.runState.result = 'success';
        const updatedJob: JobRecord = {
          ...initialJob,
          status: 'COMPLETED',
          currentStage: result.finalStage as PipelineStage,
          completedAt: new Date().toISOString(),
          durationMs: result.durationMs,
          completedCount: context.items.length,
        };
        this.jobStore.saveJob(updatedJob);
        this.broadcastSSE('job', updatedJob);
        this.broadcastSSE('pipeline', {
          status: 'completed',
          pipelineId: context.pipelineId,
          jobId,
          finalStage: result.finalStage,
          durationMs: result.durationMs,
          itemCount: context.items.length,
        });
      } else {
        this.runState.result = 'failed';
        this.runState.error = result.error?.message || 'Unknown pipeline failure';
        const updatedJob: JobRecord = {
          ...initialJob,
          status: 'FAILED',
          currentStage: result.finalStage as PipelineStage,
          completedAt: new Date().toISOString(),
          durationMs: result.durationMs,
          failedCount: context.items.length,
          error: SecretSanitizer.sanitizeString(this.runState.error),
        };
        this.jobStore.saveJob(updatedJob);
        this.broadcastSSE('job', updatedJob);
        this.broadcastSSE('pipeline', {
          status: 'failed',
          pipelineId: context.pipelineId,
          jobId,
          finalStage: result.finalStage,
          error: SecretSanitizer.sanitizeString(this.runState.error),
          durationMs: result.durationMs,
        });
      }
    } catch (err) {
      const { SecretSanitizer } = await import('../../core/security/secret-sanitizer.js');
      const durationMs = Date.now() - startTime;
      this.runState.isRunning = false;
      this.runState.result = 'failed';
      this.runState.error = (err as Error).message;
      this.activeAbortController = null;

      const failedJob: JobRecord = {
        jobId,
        pipelineId: this.runState.pipelineId || jobId,
        createdAt: startedAt,
        startedAt,
        completedAt: new Date().toISOString(),
        durationMs,
        status: 'FAILED',
        currentStage: this.runState.currentStage || 'IDLE',
        inputCount: this.runState.itemCount,
        completedCount: 0,
        failedCount: this.runState.itemCount,
        items: [],
        error: SecretSanitizer.sanitizeString(this.runState.error),
        isDryRun,
      };
      this.jobStore.saveJob(failedJob);
      this.broadcastSSE('job', failedJob);

      this.broadcastSSE('pipeline', {
        status: 'failed',
        jobId,
        error: SecretSanitizer.sanitizeString(this.runState.error),
      });
    }
  }

  // ===========================================================================
  // SSE Management
  // ===========================================================================

  private handleSSEConnection(res: http.ServerResponse): void {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    // Send initial state
    this.sendSSE(res, 'connected', { timestamp: new Date().toISOString() });
    this.sendSSE(res, 'status', this.getPublicRunState());

    this.sseClients.add(res);

    res.on('close', () => {
      this.sseClients.delete(res);
    });
  }

  private sendSSE(res: http.ServerResponse, event: string, data: unknown): void {
    try {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    } catch {
      // Client disconnected
    }
  }

  private broadcastSSE(event: string, data: unknown): void {
    for (const client of this.sseClients) {
      this.sendSSE(client, event, data);
    }
  }

  // ===========================================================================
  // Helpers
  // ===========================================================================

  private getPublicRunState(): object {
    return {
      isRunning: this.runState.isRunning,
      pipelineId: this.runState.pipelineId,
      currentStage: this.runState.currentStage,
      startedAt: this.runState.startedAt,
      error: this.runState.error,
      result: this.runState.result,
      itemCount: this.runState.itemCount,
      logCount: this.runState.logs.length,
    };
  }

  private jsonResponse(res: http.ServerResponse, status: number, data: unknown): void {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  }

  private parseJsonBody(req: http.IncomingMessage, callback: (body: any) => void): void {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 5 * 1024 * 1024) {
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        const parsed = JSON.parse(raw);
        callback(parsed);
      } catch {
        callback({});
      }
    });
  }
}

// =============================================================================
// HTML Page — Complete Video Pipeline Production Tool UI
// =============================================================================

function renderHtmlPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Video Pipeline</title>
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🎬</text></svg>">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700;900&display=swap" rel="stylesheet">
  <style>
    /* ================================================================
       DESIGN TOKENS — Cinematic Brutalism (per portfolio-design.md)
       ================================================================ */
    :root {
      --bg:         #050505;
      --surface:    #0a0a0a;
      --surface-2:  #111111;
      --border:     rgba(255,255,255,0.1);
      --border-active: rgba(255,255,255,0.25);
      --text:       #ffffff;
      --text-muted: rgba(255,255,255,0.5);
      --text-dim:   rgba(255,255,255,0.3);
      --accent:     #ffffff;
      --success:    #22c55e;
      --danger:     #ef4444;
      --warning:    #eab308;
      --info:       #3b82f6;
      --font:       'Roboto', sans-serif;
    }

    /* ================================================================
       RESET & BASE
       ================================================================ */
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      background: var(--bg);
      color: var(--text);
      font-family: var(--font);
      font-weight: 400;
      font-size: 13px;
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
      min-height: 100vh;
    }

    button { font-family: var(--font); cursor: pointer; }
    input  { font-family: var(--font); }

    /* ================================================================
       LAYOUT
       ================================================================ */
    .app {
      max-width: 900px;
      margin: 0 auto;
      padding: 32px 24px 64px;
    }

    /* ================================================================
       HEADER
       ================================================================ */
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid var(--border);
      padding-bottom: 16px;
      margin-bottom: 32px;
    }

    .header-title {
      font-size: 16px;
      font-weight: 700;
      letter-spacing: 2px;
      text-transform: uppercase;
    }

    .status-indicator {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 11px;
      font-weight: 500;
      letter-spacing: 1px;
      text-transform: uppercase;
      color: var(--text-muted);
    }

    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--success);
    }

    .status-dot.running {
      background: var(--warning);
      animation: pulse 1.2s ease-in-out infinite;
    }

    .status-dot.failed { background: var(--danger); }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.3; }
    }

    /* ================================================================
       DROP ZONE
       ================================================================ */
    .drop-zone {
      border: 1px dashed var(--border);
      padding: 48px 24px;
      text-align: center;
      transition: border-color 0.15s, background-color 0.15s;
      cursor: pointer;
      margin-bottom: 16px;
      background: var(--surface);
    }

    .drop-zone.drag-over {
      border-color: var(--accent);
      background: rgba(255,255,255,0.03);
    }

    .drop-zone.processing {
      border-color: var(--warning);
      cursor: wait;
    }

    .drop-zone-icon {
      font-size: 28px;
      margin-bottom: 12px;
      display: block;
      color: var(--text-muted);
    }

    .drop-zone-title {
      font-size: 14px;
      font-weight: 500;
      letter-spacing: 1px;
      text-transform: uppercase;
      margin-bottom: 8px;
    }

    .drop-zone-sub {
      color: var(--text-dim);
      font-size: 12px;
      margin-bottom: 20px;
      letter-spacing: 0.5px;
    }

    /* ================================================================
       BUTTONS
       ================================================================ */
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 1px;
      text-transform: uppercase;
      padding: 10px 20px;
      border: 1px solid var(--border);
      background: transparent;
      color: var(--text);
      transition: all 0.12s;
    }

    .btn:hover { border-color: var(--accent); background: rgba(255,255,255,0.04); }
    .btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

    .btn-primary {
      background: var(--text);
      color: var(--bg);
      border-color: var(--text);
    }
    .btn-primary:hover { background: rgba(255,255,255,0.85); }

    .btn-danger {
      border-color: rgba(239, 68, 68, 0.3);
      color: var(--danger);
    }
    .btn-danger:hover { background: rgba(239, 68, 68, 0.08); }

    .btn:disabled, .btn.disabled {
      opacity: 0.25;
      cursor: not-allowed;
      pointer-events: none;
    }

    /* ================================================================
       PATH INPUT
       ================================================================ */
    .path-row {
      display: flex;
      gap: 8px;
      margin-bottom: 32px;
    }

    .path-input {
      flex: 1;
      background: var(--surface);
      border: 1px solid var(--border);
      padding: 10px 14px;
      color: var(--text);
      font-family: 'Roboto Mono', monospace, var(--font);
      font-size: 12px;
    }
    .path-input::placeholder { color: var(--text-dim); }
    .path-input:focus { outline: none; border-color: var(--border-active); }

    /* ================================================================
       SECTION
       ================================================================ */
    .section { margin-bottom: 32px; }
    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }
    .section-title {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 2px;
      text-transform: uppercase;
      color: var(--text-muted);
    }
    .section-count {
      font-size: 11px;
      color: var(--text-dim);
      font-weight: 400;
    }

    /* ================================================================
       QUEUE
       ================================================================ */
    .queue-list {
      display: flex;
      flex-direction: column;
      gap: 1px;
    }

    .queue-item {
      background: var(--surface);
      border: 1px solid var(--border);
      padding: 14px 16px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
    }

    .queue-item-info { flex: 1; min-width: 0; }

    .queue-item-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 4px;
    }

    .queue-item-name {
      font-size: 13px;
      font-weight: 500;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .badge {
      font-size: 9px;
      font-weight: 700;
      padding: 2px 6px;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      border: 1px solid;
    }

    .badge-ready   { color: var(--success); border-color: rgba(34,197,94,0.3); }
    .badge-invalid { color: var(--danger);  border-color: rgba(239,68,68,0.3); }
    .badge-encoding, .badge-uploading, .badge-verifying {
      color: var(--warning); border-color: rgba(234,179,8,0.3);
    }
    .badge-completed { color: var(--success); border-color: rgba(34,197,94,0.3); }
    .badge-failed    { color: var(--danger);  border-color: rgba(239,68,68,0.3); }
    .badge-cancelled { color: var(--text-dim); border-color: var(--border); }

    .queue-item-meta {
      font-size: 11px;
      color: var(--text-dim);
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }

    .queue-item-meta span { white-space: nowrap; }

    .queue-item-error {
      margin-top: 6px;
      font-size: 11px;
      color: var(--danger);
      background: rgba(239,68,68,0.06);
      padding: 6px 10px;
      border: 1px solid rgba(239,68,68,0.15);
    }

    .queue-item-remove {
      font-size: 10px;
      padding: 4px 8px;
    }

    .empty-state {
      padding: 40px;
      text-align: center;
      color: var(--text-dim);
      font-size: 12px;
      background: var(--surface);
      border: 1px dashed var(--border);
      letter-spacing: 0.5px;
    }

    /* ================================================================
       ACTION BAR
       ================================================================ */
    .action-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-top: 16px;
      border-top: 1px solid var(--border);
      margin-top: 16px;
    }

    .action-bar-info {
      font-size: 11px;
      color: var(--text-muted);
      font-weight: 500;
      letter-spacing: 0.5px;
    }

    .action-bar-buttons { display: flex; gap: 8px; }

    /* ================================================================
       PIPELINE PROGRESS
       ================================================================ */
    .progress-section {
      background: var(--surface);
      border: 1px solid var(--border);
      padding: 24px;
      margin-bottom: 24px;
    }

    .progress-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }

    .progress-label {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 2px;
      text-transform: uppercase;
      color: var(--text-muted);
    }

    .progress-percent {
      font-size: 24px;
      font-weight: 300;
      letter-spacing: -1px;
    }

    .progress-current-video {
      font-size: 13px;
      font-weight: 500;
      margin-bottom: 12px;
    }

    .progress-bar-track {
      height: 3px;
      background: rgba(255,255,255,0.06);
      margin-bottom: 20px;
      overflow: hidden;
    }

    .progress-bar-fill {
      height: 100%;
      background: var(--text);
      transition: width 0.3s ease;
      width: 0%;
    }

    .progress-bar-fill.failed { background: var(--danger); }

    /* ================================================================
       STAGE TRACKER
       ================================================================ */
    .stage-tracker {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .stage-item {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 12px;
      color: var(--text-dim);
    }

    .stage-icon {
      width: 16px;
      text-align: center;
      font-size: 11px;
      flex-shrink: 0;
    }

    .stage-item.done    { color: var(--text-muted); }
    .stage-item.done .stage-icon { color: var(--success); }
    .stage-item.active  { color: var(--text); font-weight: 500; }
    .stage-item.active .stage-icon { color: var(--warning); }
    .stage-item.failed  { color: var(--danger); }
    .stage-item.failed .stage-icon { color: var(--danger); }

    .stage-error-msg {
      margin-left: 26px;
      font-size: 11px;
      color: var(--danger);
      padding: 4px 0;
    }

    /* ================================================================
       LIVE LOG
       ================================================================ */
    .log-panel {
      background: var(--surface);
      border: 1px solid var(--border);
      max-height: 280px;
      overflow-y: auto;
      font-size: 11px;
      font-family: 'Roboto Mono', monospace, var(--font);
    }

    .log-entry {
      display: flex;
      gap: 12px;
      padding: 4px 12px;
      border-bottom: 1px solid rgba(255,255,255,0.03);
      line-height: 1.6;
    }

    .log-time  { color: var(--text-dim); white-space: nowrap; min-width: 70px; }
    .log-stage { color: var(--text-muted); white-space: nowrap; min-width: 140px; overflow: hidden; text-overflow: ellipsis; }
    .log-msg   { color: var(--text); flex: 1; word-break: break-word; }
    .log-entry.success .log-msg { color: var(--success); }
    .log-entry.failure .log-msg { color: var(--danger); }

    /* ================================================================
       ERROR PANEL
       ================================================================ */
    .error-panel {
      background: var(--surface);
      border: 1px solid rgba(239,68,68,0.2);
      padding: 24px;
      margin-bottom: 24px;
    }

    .error-title {
      font-size: 14px;
      font-weight: 700;
      color: var(--danger);
      letter-spacing: 1px;
      text-transform: uppercase;
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .error-detail {
      font-size: 12px;
      color: var(--text-muted);
      line-height: 1.7;
      margin-bottom: 16px;
    }

    .error-stage {
      font-size: 11px;
      color: var(--text-dim);
      margin-bottom: 16px;
    }

    /* ================================================================
       COMPLETION PANEL
       ================================================================ */
    .completion-panel {
      background: var(--surface);
      border: 1px solid rgba(34,197,94,0.2);
      padding: 24px;
      margin-bottom: 24px;
    }

    .completion-title {
      font-size: 14px;
      font-weight: 700;
      color: var(--success);
      letter-spacing: 1px;
      text-transform: uppercase;
      margin-bottom: 12px;
    }

    .completion-list {
      list-style: none;
      margin-bottom: 16px;
    }

    .completion-list li {
      font-size: 12px;
      color: var(--text-muted);
      padding: 3px 0;
    }

    .completion-list li::before {
      content: '\\2713  ';
      color: var(--success);
      font-weight: 700;
    }

    .completion-url {
      font-size: 11px;
      color: var(--text-dim);
      margin-bottom: 16px;
    }

    .completion-url a {
      color: var(--text-muted);
      text-decoration: underline;
    }

    /* ================================================================
       JOB HISTORY & MODAL (Phase 10)
       ================================================================ */
    .job-list {
      display: flex;
      flex-direction: column;
      gap: 1px;
      background: var(--border);
      border: 1px solid var(--border);
    }

    .job-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      background: var(--surface);
      gap: 12px;
      transition: background 0.15s ease;
    }

    .job-item:hover {
      background: var(--surface-2);
    }

    .job-item-left {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
    }

    .job-item-header {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .job-item-id {
      font-weight: 500;
      font-size: 12px;
      color: var(--text);
      font-family: 'Roboto Mono', monospace, var(--font);
    }

    .job-item-meta {
      font-size: 11px;
      color: var(--text-dim);
      display: flex;
      gap: 12px;
    }

    .badge-completed { background: rgba(34,197,94,0.15); color: var(--success); }
    .badge-running   { background: rgba(234,179,8,0.15);  color: var(--warning); }
    .badge-failed    { background: rgba(239,68,68,0.15);  color: var(--danger); }
    .badge-cancelled { background: rgba(255,255,255,0.1); color: var(--text-muted); }

    /* MODAL */
    .modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.85);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      padding: 24px;
    }

    .modal-content {
      background: var(--surface);
      border: 1px solid var(--border);
      max-width: 700px;
      width: 100%;
      max-height: 80vh;
      display: flex;
      flex-direction: column;
    }

    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 20px;
      border-bottom: 1px solid var(--border);
    }

    .modal-title {
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 1px;
      text-transform: uppercase;
    }

    .modal-close {
      background: none;
      border: none;
      color: var(--text-muted);
      font-size: 18px;
      cursor: pointer;
      padding: 0 4px;
    }

    .modal-close:hover {
      color: var(--text);
    }

    .modal-body {
      padding: 20px;
      overflow-y: auto;
      font-size: 12px;
      color: var(--text-muted);
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .modal-kv {
      display: grid;
      grid-template-columns: 120px 1fr;
      gap: 8px;
      font-size: 12px;
    }

    .modal-kv-label {
      color: var(--text-dim);
      font-weight: 500;
    }

    .modal-kv-value {
      color: var(--text);
      font-family: 'Roboto Mono', monospace, var(--font);
    }

    /* ================================================================
       HIDDEN UTILITY
       ================================================================ */
    .hidden { display: none !important; }

    /* ================================================================
       RESPONSIVE
       ================================================================ */
    @media (max-width: 768px) {
      .app { padding: 20px 16px 48px; }
      .drop-zone { padding: 32px 16px; }
      .action-bar { flex-direction: column; gap: 12px; align-items: stretch; }
      .action-bar-buttons { justify-content: flex-end; }
      .queue-item { flex-direction: column; }
    }
  </style>
</head>
<body>
  <div class="app">
    <!-- ============================================================
         HEADER
         ============================================================ -->
    <header class="header">
      <div class="header-title">Video Pipeline</div>
      <div class="status-indicator" id="globalStatus" aria-live="polite">
        <span class="status-dot" id="statusDot"></span>
        <span id="statusText">READY</span>
      </div>
    </header>

    <!-- ============================================================
         DROP ZONE
         ============================================================ -->
    <div id="dropZone" class="drop-zone" role="button" tabindex="0"
         aria-label="Drop video files here or click to select">
      <span class="drop-zone-icon">&#9650;</span>
      <div class="drop-zone-title">Drop video here</div>
      <div class="drop-zone-sub" id="formatHint">MP4 · MOV · MKV · AVI · MXF · WEBM</div>
      <button type="button" class="btn" id="selectBtn"
              aria-label="Select video files from disk">Select Videos</button>
      <input type="file" id="fileInput" multiple
             accept=".mp4,.mov,.mkv,.avi,.mxf,.webm" style="display:none"
             aria-hidden="true">
    </div>

    <!-- PATH INPUT -->
    <div class="path-row">
      <input type="text" id="pathInput" class="path-input"
             placeholder="Or enter absolute path to video file"
             aria-label="Absolute path to video file">
      <button class="btn" id="addPathBtn">Add</button>
    </div>

    <!-- ============================================================
         QUEUE
         ============================================================ -->
    <div class="section" id="queueSection">
      <div class="section-header">
        <div>
          <span class="section-title">Queue</span>
          <span class="section-count" id="queueCount"></span>
        </div>
        <button class="btn btn-danger queue-item-remove hidden" id="clearBtn">Clear</button>
      </div>
      <div id="queueList" class="queue-list" aria-live="polite">
        <div class="empty-state">No videos in queue. Drop or select video files above.</div>
      </div>

      <!-- ACTION BAR -->
      <div class="action-bar" id="actionBar">
        <div class="action-bar-info" id="readyCount">Ready: 0</div>
        <div class="action-bar-buttons">
          <button class="btn btn-primary disabled" id="runBtn" disabled
                  aria-label="Run pipeline on queued videos">Run Pipeline</button>
        </div>
      </div>
    </div>

    <!-- ============================================================
         PIPELINE PROGRESS (shown during execution)
         ============================================================ -->
    <div class="section hidden" id="progressSection" aria-live="polite">
      <div class="progress-section">
        <div class="progress-header">
          <span class="progress-label" id="progressLabel">Processing</span>
          <span class="progress-percent" id="progressPercent">0%</span>
        </div>
        <div class="progress-current-video" id="currentVideo"></div>
        <div class="progress-bar-track">
          <div class="progress-bar-fill" id="progressFill"></div>
        </div>

        <!-- STAGE TRACKER -->
        <div class="stage-tracker" id="stageTracker"></div>

        <div style="margin-top: 16px; display: flex; justify-content: flex-end;">
          <button class="btn btn-danger" id="cancelBtn">Cancel Execution</button>
        </div>
      </div>
    </div>

    <!-- ============================================================
         ERROR PANEL (shown on failure)
         ============================================================ -->
    <div class="section hidden" id="errorSection">
      <div class="error-panel">
        <div class="error-title"><span>&#10005;</span> Pipeline Failed</div>
        <div class="error-stage" id="errorStage"></div>
        <div class="error-detail" id="errorDetail"></div>
        <div class="action-bar-buttons">
          <button class="btn btn-danger" id="retryBtn">Retry</button>
          <button class="btn" id="backToQueueBtn">Back to Queue</button>
        </div>
      </div>
    </div>

    <!-- ============================================================
         COMPLETION PANEL (shown on success)
         ============================================================ -->
    <div class="section hidden" id="completionSection">
      <div class="completion-panel">
        <div class="completion-title">&#10003; Production Updated</div>
        <div id="completionSummary" style="margin-bottom:12px; font-size:12px; color:var(--text-muted);"></div>
        <ul class="completion-list" id="completionList"></ul>
        <div class="completion-url" id="completionUrl"></div>
        <button class="btn" id="doneBtn">Done</button>
      </div>
    </div>

    <!-- ============================================================
         LIVE LOG
         ============================================================ -->
    <div class="section hidden" id="logSection">
      <div class="section-header">
        <span class="section-title">Live Log</span>
        <span class="section-count" id="logCount"></span>
      </div>
      <div class="log-panel" id="logPanel" aria-live="off" role="log"></div>
    </div>

    <!-- ============================================================
         JOB HISTORY (Phase 10)
         ============================================================ -->
    <div class="section" id="jobHistorySection">
      <div class="section-header">
        <div>
          <span class="section-title">Job History</span>
          <span class="section-count" id="jobCount"></span>
        </div>
        <button class="btn" id="refreshJobsBtn">Refresh</button>
      </div>
      <div id="jobList" class="job-list" aria-live="polite">
        <div class="empty-state">No past jobs recorded.</div>
      </div>
    </div>
  </div>

  <!-- JOB DETAILS MODAL -->
  <div id="jobModal" class="modal-backdrop hidden">
    <div class="modal-content">
      <div class="modal-header">
        <span class="modal-title" id="modalJobTitle">Job Details</span>
        <button class="modal-close" id="modalCloseBtn">&times;</button>
      </div>
      <div class="modal-body" id="modalJobBody"></div>
    </div>
  </div>

  <!-- ================================================================
       APPLICATION JAVASCRIPT
       ================================================================ -->
  <script>
  (function() {
    'use strict';

    // =====================================================================
    // DOM References
    // =====================================================================
    const $ = (id) => document.getElementById(id);

    const dropZone       = $('dropZone');
    const fileInput      = $('fileInput');
    const selectBtn      = $('selectBtn');
    const pathInput      = $('pathInput');
    const addPathBtn     = $('addPathBtn');
    const queueList      = $('queueList');
    const queueCount     = $('queueCount');
    const clearBtn       = $('clearBtn');
    const readyCountEl   = $('readyCount');
    const runBtn         = $('runBtn');
    const progressSection= $('progressSection');
    const progressLabel  = $('progressLabel');
    const progressPercent= $('progressPercent');
    const progressFill   = $('progressFill');
    const currentVideo   = $('currentVideo');
    const stageTracker   = $('stageTracker');
    const cancelBtn      = $('cancelBtn');
    const errorSection   = $('errorSection');
    const errorStage     = $('errorStage');
    const errorDetail    = $('errorDetail');
    const retryBtn       = $('retryBtn');
    const backToQueueBtn = $('backToQueueBtn');
    const completionSection = $('completionSection');
    const completionSummary = $('completionSummary');
    const completionList = $('completionList');
    const completionUrl  = $('completionUrl');
    const doneBtn        = $('doneBtn');
    const logSection     = $('logSection');
    const logPanel       = $('logPanel');
    const logCount       = $('logCount');
    const jobList        = $('jobList');
    const jobCount       = $('jobCount');
    const refreshJobsBtn = $('refreshJobsBtn');
    const jobModal       = $('jobModal');
    const modalJobTitle  = $('modalJobTitle');
    const modalJobBody   = $('modalJobBody');
    const modalCloseBtn  = $('modalCloseBtn');
    const statusDot      = $('statusDot');
    const statusText     = $('statusText');

    // =====================================================================
    // Pipeline Stage Definitions (mirrors backend PipelineStage)
    // =====================================================================
    const STAGES = [
      { key: 'VALIDATING',                label: 'Validate' },
      { key: 'UPLOADING_R2',              label: 'R2 Upload' },
      { key: 'VERIFYING_R2',              label: 'R2 Verification' },
      { key: 'VERIFYING_STREAM',          label: 'HTTP 206' },
      { key: 'UPDATING_MANIFEST',         label: 'Manifest' },
      { key: 'CLEANING_GIT',              label: 'Git Cleanup' },
      { key: 'VERIFYING_GIT',             label: 'Git Verify' },
      { key: 'RUNNING_TESTS',             label: 'Tests' },
      { key: 'COMMITTING',                label: 'Git Commit' },
      { key: 'PUSHING',                   label: 'Git Push' },
      { key: 'WAITING_FOR_GITHUB_ACTIONS', label: 'GitHub Actions' },
      { key: 'PRODUCTION_SMOKE_TEST',      label: 'Production' },
    ];

    // =====================================================================
    // State
    // =====================================================================
    let pipelineRunning = false;
    let logEntries = [];
    let currentStageKey = null;
    let completedStages = new Set();
    let failedStage = null;
    let failedError = null;
    let eventSource = null;
    let cachedJobs = [];

    // =====================================================================
    // SSE Connection
    // =====================================================================
    function connectSSE() {
      if (eventSource) eventSource.close();
      eventSource = new EventSource('/api/pipeline/events');

      eventSource.addEventListener('log', (e) => {
        const entry = JSON.parse(e.data);
        addLogEntry(entry);
      });

      eventSource.addEventListener('stage', (e) => {
        const data = JSON.parse(e.data);
        handleStageUpdate(data);
      });

      eventSource.addEventListener('pipeline', (e) => {
        const data = JSON.parse(e.data);
        handlePipelineEvent(data);
      });

      eventSource.addEventListener('queue', (e) => {
        refreshQueue();
      });

      eventSource.addEventListener('job', (e) => {
        refreshJobs();
      });

      eventSource.addEventListener('status', (e) => {
        const data = JSON.parse(e.data);
        if (data.isRunning) {
          pipelineRunning = true;
          setGlobalStatus('running');
        }
      });

      eventSource.onerror = () => {
        // Reconnect after brief delay
        setTimeout(connectSSE, 3000);
      };
    }

    // =====================================================================
    // Drop Zone Handlers
    // =====================================================================
    ['dragenter', 'dragover'].forEach(ev => {
      dropZone.addEventListener(ev, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.add('drag-over');
      }, false);
    });

    ['dragleave', 'drop'].forEach(ev => {
      dropZone.addEventListener(ev, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.remove('drag-over');
      }, false);
    });

    dropZone.addEventListener('drop', (e) => {
      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) {
        uploadFiles(files);
      }
    });

    dropZone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        fileInput.click();
      }
    });

    selectBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      fileInput.click();
    });

    fileInput.addEventListener('change', (e) => {
      const files = Array.from(e.target.files);
      if (files.length > 0) {
        uploadFiles(files);
        fileInput.value = '';
      }
    });

    addPathBtn.addEventListener('click', () => {
      const val = pathInput.value.trim();
      if (val) {
        addPathsToQueue([val]);
        pathInput.value = '';
      }
    });

    pathInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') addPathBtn.click();
    });

    // =====================================================================
    // Upload API (Phase 09 Browser-Native Ingestion)
    // =====================================================================
    async function uploadFiles(files) {
      if (pipelineRunning || !files || files.length === 0) return;

      dropZone.classList.add('processing');
      const dropZoneTitle = dropZone.querySelector('.drop-zone-title');
      const dropZoneSub = document.getElementById('formatHint');
      const origTitle = dropZoneTitle ? dropZoneTitle.textContent : 'Drop video here';
      const origSub = dropZoneSub ? dropZoneSub.textContent : 'MP4 · MOV · MKV · AVI · MXF · WEBM';

      if (dropZoneTitle) {
        dropZoneTitle.textContent = files.length === 1
          ? 'Uploading ' + files[0].name + '...'
          : 'Uploading ' + files.length + ' videos...';
      }

      const formData = new FormData();
      for (let i = 0; i < files.length; i++) {
        formData.append('files', files[i]);
      }

      try {
        const xhr = new XMLHttpRequest();
        await new Promise((resolve, reject) => {
          xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
              const pct = Math.round((e.loaded / e.total) * 100);
              if (dropZoneSub) {
                dropZoneSub.textContent = 'Uploading... ' + pct + '%';
              }
            } else {
              if (dropZoneSub) dropZoneSub.textContent = 'Uploading...';
            }
          });

          xhr.upload.addEventListener('load', () => {
            if (dropZoneSub) dropZoneSub.textContent = 'Inspecting media streams with FFprobe...';
          });

          xhr.addEventListener('load', () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              try {
                const res = JSON.parse(xhr.responseText);
                resolve(res);
              } catch (parseErr) {
                resolve({ success: true });
              }
            } else {
              try {
                const errRes = JSON.parse(xhr.responseText);
                reject(new Error(errRes.error || ('Upload failed with status ' + xhr.status)));
              } catch {
                reject(new Error('Upload failed with status ' + xhr.status));
              }
            }
          });

          xhr.addEventListener('error', () => {
            reject(new Error('Network error during upload'));
          });

          xhr.addEventListener('abort', () => {
            reject(new Error('Upload aborted'));
          });

          xhr.open('POST', '/api/upload');
          xhr.send(formData);
        });

        await refreshQueue();
      } catch (err) {
        console.error('Upload failed:', err);
        if (dropZoneSub) dropZoneSub.textContent = 'Upload error: ' + err.message;
        await refreshQueue();
      } finally {
        setTimeout(() => {
          dropZone.classList.remove('processing');
          if (dropZoneTitle) dropZoneTitle.textContent = origTitle;
          if (dropZoneSub) dropZoneSub.textContent = origSub;
        }, 1500);
      }
    }

    // =====================================================================
    // Queue API
    // =====================================================================
    async function addPathsToQueue(paths) {
      dropZone.classList.add('processing');
      try {
        await fetch('/api/queue/add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paths }),
        });
        await refreshQueue();
      } catch (err) {
        console.error('Failed to add files:', err);
      } finally {
        dropZone.classList.remove('processing');
      }
    }

    async function removeItem(id) {
      await fetch('/api/queue/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      await refreshQueue();
    }

    async function clearQueue() {
      await fetch('/api/queue/clear', { method: 'POST' });
      await refreshQueue();
    }

    clearBtn.addEventListener('click', () => {
      if (pipelineRunning) return;
      clearQueue();
    });

    // =====================================================================
    // Queue Rendering
    // =====================================================================
    async function refreshQueue() {
      try {
        const res = await fetch('/api/queue');
        const data = await res.json();
        renderQueue(data);
      } catch (err) {
        console.error('Failed to refresh queue:', err);
      }
    }

    function renderQueue(data) {
      const items = data.items || [];
      queueCount.textContent = items.length > 0
        ? ' \\u2014 ' + items.length + ' video' + (items.length === 1 ? '' : 's')
        : '';
      readyCountEl.textContent = 'Ready: ' + (data.ready || 0);

      // Clear button visibility
      if (items.length > 0 && !pipelineRunning) {
        clearBtn.classList.remove('hidden');
      } else {
        clearBtn.classList.add('hidden');
      }

      // Run button state
      if (data.ready > 0 && !pipelineRunning) {
        runBtn.disabled = false;
        runBtn.classList.remove('disabled');
      } else {
        runBtn.disabled = true;
        runBtn.classList.add('disabled');
      }

      if (items.length === 0) {
        queueList.innerHTML = '<div class="empty-state">No videos in queue. Drop or select video files above.</div>';
        return;
      }

      queueList.innerHTML = items.map(item => {
        const st = item.status.toLowerCase();
        const m = item.metadata;

        let metaHtml = '';
        if (m) {
          const parts = [
            m.width + '\\u00d7' + m.height,
            m.fps + ' fps',
            m.durationFormatted,
            m.videoCodec.toUpperCase(),
          ];
          if (m.audioCodec !== 'none') {
            parts.push(m.audioCodec.toUpperCase() + (m.audioChannels ? ' (' + m.audioChannels + 'ch)' : ''));
          } else {
            parts.push('No Audio');
          }
          parts.push((m.fileSize / (1024 * 1024)).toFixed(1) + ' MB');
          metaHtml = parts.map(p => '<span>' + p + '</span>').join('');
        } else {
          metaHtml = '<span>Inspecting\\u2026</span>';
        }

        let errorHtml = '';
        if (item.error) {
          errorHtml = '<div class="queue-item-error">' + escHtml(item.error) + '</div>';
        }

        const removeDisabled = pipelineRunning ? ' disabled' : '';

        return '<div class="queue-item">' +
          '<div class="queue-item-info">' +
            '<div class="queue-item-header">' +
              '<span class="badge badge-' + st + '">' + item.status + '</span>' +
              '<span class="queue-item-name" title="' + escAttr(item.path || item.fileName) + '">' + escHtml(item.fileName) + '</span>' +
            '</div>' +
            '<div class="queue-item-meta">' + metaHtml + '</div>' +
            errorHtml +
          '</div>' +
          '<button class="btn queue-item-remove" data-item-id="' + escAttr(item.id) + '" onclick="window.__removeItem(this.dataset.itemId)"' + removeDisabled + '>Remove</button>' +
        '</div>';
      }).join('');
    }

    // Expose remove handler to onclick
    window.__removeItem = removeItem;

    // =====================================================================
    // Pipeline Execution
    // =====================================================================
    runBtn.addEventListener('click', async () => {
      if (pipelineRunning) return;
      startPipeline(false);
    });

    retryBtn.addEventListener('click', () => {
      resetUI();
      startPipeline(false);
    });

    backToQueueBtn.addEventListener('click', () => {
      resetUI();
    });

    doneBtn.addEventListener('click', () => {
      resetUI();
      refreshQueue();
    });

    if (cancelBtn) {
      cancelBtn.addEventListener('click', async () => {
        if (!pipelineRunning) return;
        cancelBtn.disabled = true;
        cancelBtn.textContent = 'Cancelling…';
        try {
          await fetch('/api/pipeline/cancel', { method: 'POST' });
        } catch (err) {
          console.error('Cancel request failed:', err);
        }
      });
    }

    async function startPipeline(isDryRun) {
      pipelineRunning = true;
      logEntries = [];
      currentStageKey = null;
      completedStages = new Set();
      failedStage = null;
      failedError = null;

      // UI transitions
      setGlobalStatus('running');
      runBtn.disabled = true;
      runBtn.classList.add('disabled');
      clearBtn.classList.add('hidden');
      errorSection.classList.add('hidden');
      completionSection.classList.add('hidden');
      progressSection.classList.remove('hidden');
      logSection.classList.remove('hidden');
      logPanel.innerHTML = '';
      logCount.textContent = '';
      if (cancelBtn) {
        cancelBtn.disabled = false;
        cancelBtn.textContent = 'Cancel Execution';
      }

      renderStageTracker(null, new Set(), null);
      progressPercent.textContent = '0%';
      progressFill.style.width = '0%';
      progressFill.classList.remove('failed');
      progressLabel.textContent = 'Processing';
      currentVideo.textContent = '';

      try {
        await fetch('/api/pipeline/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isDryRun }),
        });
        // Pipeline runs asynchronously — SSE handles updates
      } catch (err) {
        handlePipelineEvent({ status: 'failed', error: err.message });
      }
    }

    // =====================================================================
    // SSE Event Handlers
    // =====================================================================
    function handleStageUpdate(data) {
      const { stage, status } = data;

      // Track completed stages
      if (status === 'SUCCESS') {
        completedStages.add(stage);
      }

      currentStageKey = stage;

      // Calculate progress
      const stageIndex = STAGES.findIndex(s => s.key === stage);
      if (stageIndex >= 0) {
        const stageName = STAGES[stageIndex].label;
        const pct = Math.round(((stageIndex + (status === 'SUCCESS' ? 1 : 0.2)) / STAGES.length) * 100);
        progressPercent.textContent = pct + '%';
        progressFill.style.width = pct + '%';
        progressLabel.textContent = 'Stage ' + (stageIndex + 1) + '/' + STAGES.length + ': ' + stageName;
      }

      renderStageTracker(currentStageKey, completedStages, failedStage);
    }

    function handlePipelineEvent(data) {
      if (data.status === 'running') {
        pipelineRunning = true;
        setGlobalStatus('running');
        if (data.itemCount) {
          currentVideo.textContent = data.itemCount + ' video' + (data.itemCount === 1 ? '' : 's') + ' queued';
        }
      } else if (data.status === 'completed') {
        pipelineRunning = false;
        setGlobalStatus('ready');
        progressPercent.textContent = '100%';
        progressFill.style.width = '100%';
        progressLabel.textContent = 'Completed (100%)';

        // Mark all stages done
        STAGES.forEach(s => completedStages.add(s.key));
        renderStageTracker(null, completedStages, null);

        // Show completion panel
        showCompletionPanel(data);
        refreshQueue();
        refreshJobs();
      } else if (data.status === 'cancelled') {
        pipelineRunning = false;
        setGlobalStatus('ready');
        progressLabel.textContent = 'Cancelled';
        progressFill.classList.add('failed');

        failedStage = 'CANCELLED';
        failedError = 'Execution cancelled by user.';
        renderStageTracker(null, completedStages, failedStage);

        showErrorPanel('Cancelled', 'Pipeline was safely stopped.');
        refreshQueue();
        refreshJobs();
      } else if (data.status === 'failed') {
        pipelineRunning = false;
        setGlobalStatus('failed');
        progressLabel.textContent = 'Failed';
        progressFill.classList.add('failed');

        failedStage = currentStageKey;
        failedError = data.error || 'Unknown error';
        renderStageTracker(null, completedStages, failedStage);

        showErrorPanel(failedStage, failedError);
        refreshQueue();
        refreshJobs();
      }
    }

    function addLogEntry(entry) {
      logEntries.push(entry);
      logCount.textContent = logEntries.length + ' entries';

      const time = (entry.timestamp || '').split('T')[1]?.replace('Z', '').substring(0, 8) || '';
      const cls = entry.status === 'SUCCESS' ? ' success' : entry.status === 'FAILURE' ? ' failure' : '';

      const div = document.createElement('div');
      div.className = 'log-entry' + cls;
      div.innerHTML =
        '<span class="log-time">' + escHtml(time) + '</span>' +
        '<span class="log-stage">' + escHtml(entry.stage) + '</span>' +
        '<span class="log-msg">' + escHtml(entry.message) + '</span>';
      logPanel.appendChild(div);
      logPanel.scrollTop = logPanel.scrollHeight;

      // Update current video and fine-grained intra-stage progress from log context
      if (entry.event === 'PROGRESS' || entry.message.includes('%')) {
        const pctMatch = entry.message.match(/(\d+)%/);
        if (pctMatch) {
          const intraPct = parseInt(pctMatch[1], 10);
          const stageIndex = STAGES.findIndex(s => s.key === entry.stage);
          const stageName = stageIndex >= 0 ? STAGES[stageIndex].label : entry.stage;
          progressLabel.textContent = stageName + ' (' + intraPct + '%) · Stage ' + (stageIndex + 1) + '/' + STAGES.length;

          if (stageIndex >= 0) {
            const interpolated = Math.min(99, Math.round(((stageIndex + (intraPct / 100)) / STAGES.length) * 100));
            progressPercent.textContent = interpolated + '%';
            progressFill.style.width = interpolated + '%';
          }
        }
      }

      if (entry.stage === 'VALIDATING' || entry.stage === 'UPLOADING_R2') {
        const match = entry.message.match(/([\w_-]+\.\w+)/);
        if (match) currentVideo.textContent = match[1];
      }
    }

    // =====================================================================
    // Stage Tracker Rendering
    // =====================================================================
    function renderStageTracker(activeKey, doneSet, failKey) {
      let html = '';
      for (const s of STAGES) {
        let cls = '';
        let icon = '\\u25cb'; // ○
        if (doneSet.has(s.key)) {
          cls = 'done';
          icon = '\\u2713'; // ✓
        } else if (s.key === failKey) {
          cls = 'failed';
          icon = '\\u2715'; // ✕
        } else if (s.key === activeKey) {
          cls = 'active';
          icon = '\\u25cf'; // ●
        }
        html += '<div class="stage-item ' + cls + '">' +
          '<span class="stage-icon">' + icon + '</span>' +
          '<span>' + s.label + '</span>' +
        '</div>';
        if (s.key === failKey && failedError) {
          html += '<div class="stage-error-msg">' + escHtml(failedError) + '</div>';
        }
      }
      stageTracker.innerHTML = html;
    }

    // =====================================================================
    // Error Panel
    // =====================================================================
    function showErrorPanel(stage, error) {
      const stageLabel = STAGES.find(s => s.key === stage)?.label || stage || 'Unknown';
      errorStage.textContent = 'Failed at: ' + stageLabel;
      errorDetail.textContent = error;
      errorSection.classList.remove('hidden');
    }

    // =====================================================================
    // Completion Panel
    // =====================================================================
    function showCompletionPanel(data) {
      const count = data.itemCount || '?';
      completionSummary.textContent = count + ' video' + (count === 1 ? '' : 's') + ' processed successfully';

      const steps = [
        'Validated', 'Uploaded to R2', 'HTTP 206 verified',
        'Manifest updated', 'Git committed', 'Git pushed',
        'GitHub Actions completed', 'Production smoke test passed',
      ];
      completionList.innerHTML = steps.map(s => '<li>' + s + '</li>').join('');
      completionUrl.innerHTML = 'Production: <a href="https://pdp212.github.io/" target="_blank" rel="noopener">https://pdp212.github.io/</a>';
      completionSection.classList.remove('hidden');
    }

    // =====================================================================
    // Job History API & Rendering (Phase 10)
    // =====================================================================
    async function refreshJobs() {
      try {
        const res = await fetch('/api/jobs');
        const data = await res.json();
        cachedJobs = data.jobs || [];
        renderJobs(cachedJobs);
      } catch (err) {
        console.error('Failed to fetch jobs:', err);
      }
    }

    if (refreshJobsBtn) {
      refreshJobsBtn.addEventListener('click', () => {
        refreshJobs();
      });
    }

    function renderJobs(jobs) {
      if (jobCount) {
        jobCount.textContent = jobs.length > 0 ? ' — ' + jobs.length + ' total' : '';
      }

      if (!jobList) return;

      if (jobs.length === 0) {
        jobList.innerHTML = '<div class="empty-state">No past jobs recorded.</div>';
        return;
      }

      jobList.innerHTML = jobs.map(job => {
        const st = (job.status || 'unknown').toLowerCase();
        const duration = job.durationMs ? (job.durationMs / 1000).toFixed(1) + 's' : '—';
        const time = job.startedAt ? new Date(job.startedAt).toLocaleString() : '—';
        const itemCount = job.itemCount || (job.items ? job.items.length : 0);

        return '<div class="job-item">' +
          '<div class="job-item-left">' +
            '<div class="job-item-header">' +
              '<span class="badge badge-' + st + '">' + job.status + '</span>' +
              '<span class="job-item-id">' + escHtml(job.id) + '</span>' +
            '</div>' +
            '<div class="job-item-meta">' +
              '<span>' + escHtml(time) + '</span>' +
              '<span>' + itemCount + ' item' + (itemCount === 1 ? '' : 's') + '</span>' +
              '<span>' + duration + '</span>' +
            '</div>' +
          '</div>' +
          '<button class="btn" data-job-id="' + escAttr(job.id) + '" onclick="window.__viewJobDetails(this.dataset.jobId)">Inspect</button>' +
        '</div>';
      }).join('');
    }

    window.__viewJobDetails = (jobId) => {
      const job = cachedJobs.find(j => j.id === jobId);
      if (!job || !modalJobTitle || !modalJobBody || !jobModal) return;

      modalJobTitle.textContent = 'Job ' + job.id;

      let itemsHtml = '';
      if (job.items && job.items.length > 0) {
        itemsHtml = job.items.map(i => '<div>• ' + escHtml(i.fileName || i.id) + ' (' + i.status + ')</div>').join('');
      } else {
        itemsHtml = '<div>No item records</div>';
      }

      let logsHtml = '';
      if (job.logs && job.logs.length > 0) {
        logsHtml = '<div class="log-panel" style="max-height: 200px; margin-top: 8px;">' +
          job.logs.map(l => '<div class="log-entry"><span class="log-time">' + escHtml(l.stage) + '</span><span class="log-msg">' + escHtml(l.message) + '</span></div>').join('') +
          '</div>';
      } else {
        logsHtml = '<div>No recorded logs</div>';
      }

      let errorRow = '';
      if (job.error) {
        errorRow = '<div class="modal-kv-label">Error</div><div class="modal-kv-value" style="color:var(--danger)">' + escHtml(job.error) + '</div>';
      }

      modalJobBody.innerHTML =
        '<div class="modal-kv">' +
          '<div class="modal-kv-label">Status</div>' +
          '<div class="modal-kv-value"><span class="badge badge-' + (job.status || '').toLowerCase() + '">' + escHtml(job.status) + '</span></div>' +
          '<div class="modal-kv-label">Started</div>' +
          '<div class="modal-kv-value">' + escHtml(job.startedAt || '—') + '</div>' +
          '<div class="modal-kv-label">Completed</div>' +
          '<div class="modal-kv-value">' + escHtml(job.completedAt || '—') + '</div>' +
          '<div class="modal-kv-label">Duration</div>' +
          '<div class="modal-kv-value">' + (job.durationMs ? (job.durationMs / 1000).toFixed(2) + 's' : '—') + '</div>' +
          '<div class="modal-kv-label">Final Stage</div>' +
          '<div class="modal-kv-value">' + escHtml(job.finalStage || '—') + '</div>' +
          errorRow +
        '</div>' +
        '<div>' +
          '<div style="font-weight: 700; text-transform: uppercase; font-size: 11px; margin-bottom: 6px; color: var(--text-dim);">Processed Items</div>' +
          itemsHtml +
        '</div>' +
        '<div>' +
          '<div style="font-weight: 700; text-transform: uppercase; font-size: 11px; margin-bottom: 6px; color: var(--text-dim);">Job Logs</div>' +
          logsHtml +
        '</div>';

      jobModal.classList.remove('hidden');
    };

    if (modalCloseBtn && jobModal) {
      modalCloseBtn.addEventListener('click', () => {
        jobModal.classList.add('hidden');
      });

      jobModal.addEventListener('click', (e) => {
        if (e.target === jobModal) {
          jobModal.classList.add('hidden');
        }
      });
    }

    // =====================================================================
    // UI Helpers
    // =====================================================================
    function setGlobalStatus(state) {
      statusDot.className = 'status-dot' + (state === 'running' ? ' running' : state === 'failed' ? ' failed' : '');
      statusText.textContent = state === 'running' ? 'RUNNING' : state === 'failed' ? 'FAILED' : 'READY';
    }

    function resetUI() {
      pipelineRunning = false;
      setGlobalStatus('ready');
      progressSection.classList.add('hidden');
      errorSection.classList.add('hidden');
      completionSection.classList.add('hidden');
      logSection.classList.add('hidden');
      logPanel.innerHTML = '';
      logEntries = [];
      logCount.textContent = '';
      completedStages = new Set();
      failedStage = null;
      failedError = null;
      currentStageKey = null;
      refreshQueue();
      refreshJobs();
    }

    function escHtml(s) {
      if (!s) return '';
      return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    function escAttr(s) {
      return escHtml(s).replace(/'/g, '&#39;');
    }

    // =====================================================================
    // Boot
    // =====================================================================
    connectSSE();
    refreshQueue();
    refreshJobs();
  })();
  </script>
</body>
</html>`;
}

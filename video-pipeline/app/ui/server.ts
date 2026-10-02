/**
 * Local Tool UI Server
 * Lightweight built-in HTTP server providing an interactive Drag & Drop and Queue UI.
 * Zero external runtime dependencies (native node:http).
 */

import http from 'node:http';
import type { InputController } from '../application/input-controller.js';
import type { PipelineLogger } from '../../core/logger/logger.js';

export interface UiServerOptions {
  port?: number;
  host?: string;
}

export class PipelineUiServer {
  private readonly controller: InputController;
  private readonly logger: PipelineLogger;
  private server: http.Server | null = null;
  private readonly port: number;
  private readonly host: string;

  constructor(controller: InputController, logger: PipelineLogger, options?: UiServerOptions) {
    this.controller = controller;
    this.logger = logger;
    this.port = options?.port || 3210;
    this.host = options?.host || '127.0.0.1';
  }

  public async start(): Promise<string> {
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
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }

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

    if (url.pathname === '/' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(this.renderHtmlPage());
      return;
    }

    if (url.pathname === '/api/queue' && req.method === 'GET') {
      const summary = this.controller.getSummary();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(summary));
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
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing path or paths array.' }));
            return;
          }

          const added = await this.controller.addVideos(paths);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, count: added.length, items: added }));
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: (err as Error).message }));
        }
      });
      return;
    }

    if (url.pathname === '/api/queue/remove' && req.method === 'POST') {
      this.parseJsonBody(req, (body) => {
        const id = body.id;
        if (!id || typeof id !== 'string') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing item id.' }));
          return;
        }

        const removed = this.controller.removeVideo(id);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: removed }));
      });
      return;
    }

    if (url.pathname === '/api/queue/clear' && req.method === 'POST') {
      this.controller.clearQueue();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
      return;
    }

    if (url.pathname === '/api/context' && req.method === 'GET') {
      try {
        const ctx = this.controller.preparePipelineContext(true);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            pipelineId: ctx.pipelineId,
            currentStage: ctx.currentStage,
            itemCount: ctx.items.length,
            items: ctx.items,
            notice: 'PipelineContext ready. Phase 03 executes encoding.',
          })
        );
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: (err as Error).message }));
      }
      return;
    }

    if (url.pathname === '/api/pipeline/run-encoding' && req.method === 'POST') {
      try {
        const context = this.controller.preparePipelineContext(false);
        const { VideoPipelineOrchestrator } = await import('../../pipeline/pipeline.js');
        const orchestrator = new VideoPipelineOrchestrator();

        const result = await orchestrator.execute(context, 'ENCODING');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            success: result.success,
            finalStage: result.finalStage,
            durationMs: result.durationMs,
            items: context.items,
            error: result.error?.message,
          })
        );
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: (err as Error).message }));
      }
      return;
    }

    if (url.pathname === '/api/pipeline/run-phase04' && req.method === 'POST') {
      try {
        const context = this.controller.preparePipelineContext(false);
        const { VideoPipelineOrchestrator } = await import('../../pipeline/pipeline.js');
        const orchestrator = new VideoPipelineOrchestrator();

        const result = await orchestrator.execute(context, 'VERIFYING_STREAM');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            success: result.success,
            finalStage: result.finalStage,
            durationMs: result.durationMs,
            items: context.items,
            error: result.error?.message,
          })
        );
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: (err as Error).message }));
      }
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
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

  private renderHtmlPage(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Video Pipeline — Input & Video Queue</title>
  <style>
    :root {
      --bg: #0d0f12;
      --card-bg: #16191f;
      --border: #262b35;
      --border-focus: #3b82f6;
      --text: #f3f4f6;
      --text-muted: #9ca3af;
      --accent: #3b82f6;
      --success: #10b981;
      --danger: #ef4444;
      --warning: #f59e0b;
      --font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: var(--font);
      padding: 32px 24px;
      line-height: 1.5;
    }

    .container {
      max-width: 960px;
      margin: 0 auto;
    }

    header {
      margin-bottom: 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid var(--border);
      padding-bottom: 16px;
    }

    h1 {
      font-size: 20px;
      font-weight: 700;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .badge {
      font-size: 11px;
      padding: 3px 8px;
      border-radius: 4px;
      background: #1e293b;
      color: var(--accent);
      border: 1px solid rgba(59, 130, 246, 0.3);
      font-weight: 600;
    }

    /* DROP ZONE */
    .drop-zone {
      background: var(--card-bg);
      border: 2px dashed var(--border);
      border-radius: 8px;
      padding: 48px 24px;
      text-align: center;
      transition: border-color 0.2s, background-color 0.2s;
      cursor: pointer;
      margin-bottom: 24px;
    }

    .drop-zone.drag-over {
      border-color: var(--accent);
      background: rgba(59, 130, 246, 0.05);
    }

    .drop-zone.processing {
      border-color: var(--warning);
      cursor: wait;
    }

    .drop-zone-icon {
      font-size: 36px;
      margin-bottom: 12px;
      display: block;
    }

    .drop-zone-title {
      font-size: 16px;
      font-weight: 600;
      margin-bottom: 6px;
    }

    .drop-zone-sub {
      color: var(--text-muted);
      font-size: 13px;
      margin-bottom: 16px;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      font-size: 13px;
      font-weight: 600;
      padding: 8px 16px;
      border-radius: 6px;
      border: 1px solid transparent;
      cursor: pointer;
      transition: all 0.15s;
    }

    .btn-primary {
      background: var(--accent);
      color: white;
    }
    .btn-primary:hover { background: #2563eb; }

    .btn-secondary {
      background: #1f242e;
      color: var(--text);
      border-color: var(--border);
    }
    .btn-secondary:hover { background: #28303d; }

    .btn-danger {
      background: rgba(239, 68, 68, 0.1);
      color: var(--danger);
      border-color: rgba(239, 68, 68, 0.2);
    }
    .btn-danger:hover { background: rgba(239, 68, 68, 0.2); }

    .btn-disabled {
      opacity: 0.4;
      cursor: not-allowed !important;
      background: #1f242e;
      color: var(--text-muted);
      border: 1px solid var(--border);
    }

    /* DIRECT PATH INPUT */
    .path-input-row {
      display: flex;
      gap: 8px;
      margin-bottom: 24px;
    }

    .path-input {
      flex: 1;
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 8px 12px;
      color: var(--text);
      font-family: monospace;
      font-size: 13px;
    }
    .path-input:focus {
      outline: none;
      border-color: var(--border-focus);
    }

    /* QUEUE SECTION */
    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }

    .section-title {
      font-size: 14px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--text-muted);
    }

    .queue-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-bottom: 24px;
    }

    .queue-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
    }

    .queue-card.status-ready { border-left: 3px solid var(--success); }
    .queue-card.status-invalid { border-left: 3px solid var(--danger); }
    .queue-card.status-inspecting { border-left: 3px solid var(--warning); }

    .card-info {
      flex: 1;
      min-width: 0;
    }

    .card-title-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 6px;
    }

    .card-title {
      font-size: 14px;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .status-badge {
      font-size: 10px;
      font-weight: 700;
      padding: 2px 6px;
      border-radius: 3px;
      text-transform: uppercase;
    }
    .badge-ready { background: rgba(16, 185, 129, 0.15); color: var(--success); }
    .badge-invalid { background: rgba(239, 68, 68, 0.15); color: var(--danger); }
    .badge-inspecting { background: rgba(245, 158, 11, 0.15); color: var(--warning); }

    .card-meta {
      font-size: 12px;
      color: var(--text-muted);
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
    }

    .card-error {
      margin-top: 6px;
      font-size: 12px;
      color: var(--danger);
      background: rgba(239, 68, 68, 0.08);
      padding: 4px 8px;
      border-radius: 4px;
    }

    .actions-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-top: 16px;
      border-top: 1px solid var(--border);
    }

    .summary-text {
      font-size: 13px;
      font-weight: 600;
      color: var(--text);
    }

    .empty-state {
      padding: 32px;
      text-align: center;
      color: var(--text-muted);
      font-size: 13px;
      background: var(--card-bg);
      border: 1px dashed var(--border);
      border-radius: 6px;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>Video Pipeline <span class="badge">Phase 04 · R2 Upload & Stream Verification</span></h1>
      <div id="statusCounter" class="badge">0 Videos in Queue</div>
    </header>

    <!-- DROP ZONE -->
    <div id="dropZone" class="drop-zone">
      <span class="drop-zone-icon">📥</span>
      <div class="drop-zone-title">Drop video files here</div>
      <div class="drop-zone-sub">Supports .mp4, .mov, .mkv, .avi, .mxf, .webm (Universal master inputs)</div>
      <button type="button" class="btn btn-secondary" onclick="document.getElementById('fileInput').click()">Select Videos</button>
      <input type="file" id="fileInput" multiple accept=".mp4,.mov,.mkv,.avi,.mxf,.webm" style="display: none;" onchange="handleFileSelect(event)">
    </div>

    <!-- DIRECT ABSOLUTE PATH INGESTION -->
    <div class="path-input-row">
      <input type="text" id="manualPathInput" class="path-input" placeholder="Or enter absolute path to video file (e.g. /Users/name/Desktop/film.mov)">
      <button class="btn btn-primary" onclick="handleManualAdd()">Add Path</button>
    </div>

    <!-- QUEUE LIST -->
    <div class="section-header">
      <div class="section-title">Video Queue</div>
      <button class="btn btn-secondary" style="font-size: 11px; padding: 4px 10px;" onclick="refreshQueue()">Refresh</button>
    </div>

    <div id="queueContainer" class="queue-list">
      <div class="empty-state">No videos in queue. Drop or select video files to inspect.</div>
    </div>

    <!-- ACTIONS BAR -->
    <div class="actions-bar">
      <div>
        <button id="clearBtn" class="btn btn-danger" onclick="handleClearQueue()" style="display: none;">Clear Queue</button>
      </div>
      <div style="display: flex; gap: 10px; align-items: center;">
        <span id="readySummary" class="summary-text">Ready: 0 Videos</span>
        <button id="runPipelineBtn" class="btn btn-secondary" onclick="handleRunPipeline()">Encode (Phase 03)</button>
        <button id="runPhase04Btn" class="btn btn-primary" onclick="handleRunPhase04()">Run Phase 04 (Encode + R2 + Stream Test)</button>
      </div>
    </div>
  </div>

  <script>
    const dropZone = document.getElementById('dropZone');
    const queueContainer = document.getElementById('queueContainer');
    const readySummary = document.getElementById('readySummary');
    const statusCounter = document.getElementById('statusCounter');
    const clearBtn = document.getElementById('clearBtn');
    const runPipelineBtn = document.getElementById('runPipelineBtn');
    const runPhase04Btn = document.getElementById('runPhase04Btn');

    // Drag & Drop Handlers
    ['dragenter', 'dragover'].forEach(eventName => {
      dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.add('drag-over');
      }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
      dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.remove('drag-over');
      }, false);
    });

    dropZone.addEventListener('drop', (e) => {
      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) {
        const paths = files.map(f => f.path || f.name);
        addPathsToQueue(paths);
      }
    });

    function handleFileSelect(e) {
      const files = Array.from(e.target.files);
      if (files.length > 0) {
        const paths = files.map(f => f.path || f.name);
        addPathsToQueue(paths);
      }
    }

    function handleManualAdd() {
      const input = document.getElementById('manualPathInput');
      const val = input.value.trim();
      if (val) {
        addPathsToQueue([val]);
        input.value = '';
      }
    }

    async function addPathsToQueue(paths) {
      dropZone.classList.add('processing');
      try {
        const res = await fetch('/api/queue/add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paths })
        });
        await res.json();
        await refreshQueue();
      } catch (err) {
        alert('Error adding files: ' + err.message);
      } finally {
        dropZone.classList.remove('processing');
      }
    }

    async function handleRemoveItem(id) {
      try {
        await fetch('/api/queue/remove', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id })
        });
        await refreshQueue();
      } catch (err) {
        console.error(err);
      }
    }

    async function handleClearQueue() {
      if (!confirm('Clear all items from the video queue?')) return;
      try {
        await fetch('/api/queue/clear', { method: 'POST' });
        await refreshQueue();
      } catch (err) {
        console.error(err);
      }
    }

    async function handleRunPipeline() {
      runPipelineBtn.disabled = true;
      runPipelineBtn.textContent = '⏳ Encoding in progress...';
      try {
        const res = await fetch('/api/pipeline/run-encoding', { method: 'POST' });
        const data = await res.json();
        if (data.success) {
          alert('✔ Phase 03: Encoding completed successfully! Output saved in video-pipeline/encoded/.');
        } else {
          alert('✖ Encoding failed: ' + (data.error || 'Unknown error'));
        }
        await refreshQueue();
      } catch (err) {
        alert('✖ Encoding request error: ' + err.message);
      } finally {
        runPipelineBtn.disabled = false;
        runPipelineBtn.textContent = 'Encode (Phase 03)';
      }
    }

    async function handleRunPhase04() {
      runPhase04Btn.disabled = true;
      runPipelineBtn.disabled = true;
      runPhase04Btn.textContent = '⏳ Executing Phase 04 (Encode + R2 + Stream)...';
      try {
        const res = await fetch('/api/pipeline/run-phase04', { method: 'POST' });
        const data = await res.json();
        if (data.success) {
          alert('✔ Phase 04: Encode + Cloudflare R2 Upload + HTTP 206 Streaming verified successfully! Ready for Manifest phase.');
        } else {
          alert('✖ Phase 04 failed: ' + (data.error || 'Unknown error'));
        }
        await refreshQueue();
      } catch (err) {
        alert('✖ Phase 04 request error: ' + err.message);
      } finally {
        runPhase04Btn.disabled = false;
        runPipelineBtn.disabled = false;
        runPhase04Btn.textContent = 'Run Phase 04 (Encode + R2 + Stream Test)';
      }
    }

    async function refreshQueue() {
      try {
        const res = await fetch('/api/queue');
        const data = await res.json();
        renderQueue(data);
      } catch (err) {
        console.error('Failed to fetch queue:', err);
      }
    }

    function renderQueue(data) {
      const items = data.items || [];
      statusCounter.textContent = items.length + ' Video' + (items.length === 1 ? '' : 's') + ' in Queue';
      readySummary.textContent = 'Ready: ' + data.ready + ' Videos';

      if (items.length > 0) {
        clearBtn.style.display = 'inline-flex';
      } else {
        clearBtn.style.display = 'none';
      }

      if (data.ready > 0) {
        runPipelineBtn.classList.remove('btn-disabled');
        runPipelineBtn.disabled = false;
        runPhase04Btn.classList.remove('btn-disabled');
        runPhase04Btn.disabled = false;
      } else {
        runPipelineBtn.classList.add('btn-disabled');
        runPipelineBtn.disabled = true;
        runPhase04Btn.classList.add('btn-disabled');
        runPhase04Btn.disabled = true;
      }

      if (items.length === 0) {
        queueContainer.innerHTML = '<div class="empty-state">No videos in queue. Drop or select video files to inspect.</div>';
        return;
      }

      queueContainer.innerHTML = items.map(item => {
        const statusClass = 'status-' + item.status.toLowerCase();
        const badgeClass = 'badge-' + item.status.toLowerCase();
        const m = item.metadata;

        let metaHtml = '';
        if (m) {
          metaHtml = \`
            <span>\${m.width}×\${m.height}</span>
            <span>\${m.fps} fps</span>
            <span>\${m.durationFormatted}</span>
            <span>\${m.videoCodec.toUpperCase()}</span>
            <span>\${m.audioCodec !== 'none' ? m.audioCodec.toUpperCase() + ' (' + m.audioChannels + 'ch)' : 'No Audio'}</span>
            <span>\${(m.fileSize / (1024 * 1024)).toFixed(1)} MB</span>
          \`;
        } else {
          metaHtml = '<span>Awaiting inspection...</span>';
        }

        let errorHtml = '';
        if (item.error) {
          errorHtml = \`<div class="card-error">\${item.error}</div>\`;
        }

        return \`
          <div class="queue-card \${statusClass}">
            <div class="card-info">
              <div class="card-title-row">
                <span class="status-badge \${badgeClass}">\${item.status}</span>
                <span class="card-title" title="\${item.path}">\${item.fileName}</span>
              </div>
              <div class="card-meta">
                \${metaHtml}
              </div>
              \${errorHtml}
            </div>
            <div>
              <button class="btn btn-secondary" style="font-size: 11px; padding: 4px 8px;" onclick="handleRemoveItem('\${item.id}')">Remove</button>
            </div>
          </div>
        \`;
      }).join('');
    }

    // Auto-refresh initially
    refreshQueue();
  </script>
</body>
</html>`;
  }
}

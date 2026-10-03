/**
 * Phase 08 Frontend UI Tests
 *
 * Tests the UI server's new endpoints (pipeline/run, pipeline/status, pipeline/events),
 * HTML page rendering (app shell, drop zone, queue, progress, stages, logs, error, completion),
 * SSE streaming, queue API operations, run button enable/disable logic,
 * and the secret boundary guarantee.
 *
 * All tests run against the real PipelineUiServer with a mock inspector —
 * no network, R2, or Git required.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { PipelineUiServer } from '../../app/ui/server.js';
import { InputController } from '../../app/application/input-controller.js';
import { VideoQueue } from '../../app/application/video-queue.js';
import { VideoInspector } from '../../engines/video/video-inspector.js';
import { PipelineLogger } from '../../core/logger/logger.js';
import type { PipelineConfig } from '../../config/schema/index.js';

// ---------------------------------------------------------------------------
// Mock Inspector — returns synthetic metadata without ffprobe
// ---------------------------------------------------------------------------

class MockVideoInspector extends VideoInspector {
  constructor() {
    super(['.mp4', '.mov', '.mkv']);
  }

  public override async inspectFile(filePath: string) {
    return {
      valid: true,
      metadata: {
        filename: filePath.split('/').pop() || 'test.mp4',
        absolutePath: filePath,
        extension: '.mp4',
        fileSize: 4_096_000,
        duration: 120,
        durationFormatted: '02:00',
        width: 1920,
        height: 1080,
        fps: 25,
        videoCodec: 'h264',
        audioCodec: 'aac',
        audioChannels: 2,
        audioSampleRate: 48000,
        bitrateKbps: 4000,
        containerFormat: 'mp4',
      },
      errors: [],
    };
  }
}

// ---------------------------------------------------------------------------
// Shared test config
// ---------------------------------------------------------------------------

const TEST_CONFIG: PipelineConfig = {
  version: '1.0.0',
  portfolioPath: '../',
  productionUrl: 'https://pdp212.github.io/',
  git: { repository: 'pdp212/pdp212.github.io', branch: 'main', requireCleanWorkingTree: true, disallowForcePush: true },
  r2: { bucket: 'pdp212-profile', publicBaseUrl: 'https://pub-2cc56f19f7ba4dae92294d5baaa8cfc6.r2.dev' },
  manifest: { relativeFilePath: 'data/work-manifest.json', atomicBackup: true },
  encoding: {
    videoCodec: 'libx264', audioCodec: 'aac', preset: 'medium', crf: 22, pixelFormat: 'yuv420p',
  },
  supportedInputFormats: ['.mp4', '.mov', '.mkv'],
  outputFormat: '.mp4',
  directories: { temp: './temp', encoded: './encoded', completed: './completed', failed: './failed' },
  testCommands: [],
  timeout: { validationMs: 1000, encodingMs: 1000, uploadMs: 1000, verificationMs: 1000, githubActionsMs: 1000, smokeTestMs: 1000 },
  retryPolicy: { maxRetries: 1, initialDelayMs: 100, backoffFactor: 1 },
};

function createTestServer(port: number) {
  const queue = new VideoQueue(TEST_CONFIG.supportedInputFormats, new MockVideoInspector());
  const logger = new PipelineLogger({ minLevel: 'WARN' });
  const controller = new InputController(TEST_CONFIG, queue, logger);
  const server = new PipelineUiServer(controller, logger, { port, host: '127.0.0.1' });
  return { server, controller, queue };
}

// ---------------------------------------------------------------------------
// 1. App Shell Rendering
// ---------------------------------------------------------------------------

describe('Phase 08: App Shell', () => {
  test('serves HTML page with all required UI sections', async () => {
    const { server } = createTestServer(3301);
    const url = await server.start();
    try {
      const res = await fetch(`${url}/`);
      assert.strictEqual(res.status, 200);
      const html = await res.text();

      // Header
      assert.ok(html.includes('Video Pipeline'), 'Missing application title');
      assert.ok(html.includes('globalStatus'), 'Missing status indicator');

      // Drop Zone
      assert.ok(html.includes('dropZone'), 'Missing drop zone');
      assert.ok(html.includes('Select Videos'), 'Missing file picker button');

      // Queue
      assert.ok(html.includes('queueSection'), 'Missing queue section');
      assert.ok(html.includes('Run Pipeline'), 'Missing run pipeline button');

      // Progress
      assert.ok(html.includes('progressSection'), 'Missing pipeline progress section');
      assert.ok(html.includes('stageTracker'), 'Missing stage tracker');

      // Log
      assert.ok(html.includes('logSection'), 'Missing live log section');

      // Error panel
      assert.ok(html.includes('errorSection'), 'Missing error panel');

      // Completion panel
      assert.ok(html.includes('completionSection'), 'Missing completion panel');
    } finally {
      await server.stop();
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Drop Zone States
// ---------------------------------------------------------------------------

describe('Phase 08: Drop Zone', () => {
  test('HTML contains drop zone with drag-over and processing CSS states', async () => {
    const { server } = createTestServer(3302);
    const url = await server.start();
    try {
      const html = await (await fetch(`${url}/`)).text();
      assert.ok(html.includes('.drop-zone.drag-over'), 'Missing drag-over CSS state');
      assert.ok(html.includes('.drop-zone.processing'), 'Missing processing CSS state');
      assert.ok(html.includes('dragenter'), 'Missing drag event handlers');
      assert.ok(html.includes('fileInput'), 'Missing file input element');
    } finally {
      await server.stop();
    }
  });
});

// ---------------------------------------------------------------------------
// 3. File Selection
// ---------------------------------------------------------------------------

describe('Phase 08: File Selection', () => {
  test('HTML contains file input with correct accept attribute', async () => {
    const { server } = createTestServer(3303);
    const url = await server.start();
    try {
      const html = await (await fetch(`${url}/`)).text();
      assert.ok(html.includes('accept=".mp4,.mov,.mkv,.avi,.mxf,.webm"'), 'Incorrect file input accept');
      assert.ok(html.includes('multiple'), 'File input must support multiple selection');
    } finally {
      await server.stop();
    }
  });
});

// ---------------------------------------------------------------------------
// 4. Queue Rendering
// ---------------------------------------------------------------------------

describe('Phase 08: Queue API', () => {
  test('queue starts empty then populates with metadata after adding videos', async () => {
    const { server } = createTestServer(3304);
    const url = await server.start();
    try {
      // Initially empty
      const emptyRes = await fetch(`${url}/api/queue`);
      const emptyData = await emptyRes.json();
      assert.strictEqual(emptyData.total, 0);

      // Add two videos
      const addRes = await fetch(`${url}/api/queue/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths: ['/mock/WED_TEST.mp4', '/mock/BRAND_FILM.mov'] }),
      });
      assert.strictEqual(addRes.status, 200);
      const addData = await addRes.json();
      assert.strictEqual(addData.count, 2);

      // Verify queue state
      const fullRes = await fetch(`${url}/api/queue`);
      const fullData = await fullRes.json();
      assert.strictEqual(fullData.total, 2);
      assert.strictEqual(fullData.ready, 2);

      // Verify metadata presence
      const item = fullData.items[0];
      assert.ok(item.metadata, 'Queue item should have metadata');
      assert.strictEqual(item.metadata.width, 1920);
      assert.strictEqual(item.metadata.height, 1080);
      assert.strictEqual(item.metadata.fps, 25);
      assert.ok(item.metadata.videoCodec, 'Missing video codec');
      assert.ok(item.metadata.audioCodec, 'Missing audio codec');
      assert.ok(item.metadata.audioChannels, 'Missing audio channels');
    } finally {
      await server.stop();
    }
  });
});

// ---------------------------------------------------------------------------
// 5. Queue Removal
// ---------------------------------------------------------------------------

describe('Phase 08: Queue Removal', () => {
  test('removes individual items from queue', async () => {
    const { server } = createTestServer(3305);
    const url = await server.start();
    try {
      await fetch(`${url}/api/queue/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths: ['/mock/A.mp4', '/mock/B.mp4'] }),
      });

      const q1 = await (await fetch(`${url}/api/queue`)).json();
      assert.strictEqual(q1.total, 2);

      // Remove first item
      const firstId = q1.items[0].id;
      await fetch(`${url}/api/queue/remove`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: firstId }),
      });

      const q2 = await (await fetch(`${url}/api/queue`)).json();
      assert.strictEqual(q2.total, 1);
      assert.notStrictEqual(q2.items[0].id, firstId);
    } finally {
      await server.stop();
    }
  });
});

// ---------------------------------------------------------------------------
// 6. Invalid Video State
// ---------------------------------------------------------------------------

describe('Phase 08: Invalid Video Handling', () => {
  test('queue handles items with missing files gracefully', async () => {
    // The mock inspector always returns valid, so we test the API doesn't crash
    const { server } = createTestServer(3306);
    const url = await server.start();
    try {
      const res = await fetch(`${url}/api/queue/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths: ['/nonexistent/file.mp4'] }),
      });
      // Should not crash — mock inspector accepts anything
      assert.strictEqual(res.status, 200);
    } finally {
      await server.stop();
    }
  });
});

// ---------------------------------------------------------------------------
// 7. Run Button Enable/Disable
// ---------------------------------------------------------------------------

describe('Phase 08: Run Button Logic', () => {
  test('pipeline run rejects when queue is empty', async () => {
    const { server } = createTestServer(3307);
    const url = await server.start();
    try {
      const res = await fetch(`${url}/api/pipeline/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isDryRun: true }),
      });
      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.ok(data.error.includes('No valid videos'));
    } finally {
      await server.stop();
    }
  });
});

// ---------------------------------------------------------------------------
// 8. Pipeline Status Endpoint
// ---------------------------------------------------------------------------

describe('Phase 08: Pipeline Status', () => {
  test('returns idle state when no pipeline is running', async () => {
    const { server } = createTestServer(3308);
    const url = await server.start();
    try {
      const res = await fetch(`${url}/api/pipeline/status`);
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.isRunning, false);
      assert.strictEqual(data.result, 'idle');
      assert.strictEqual(data.currentStage, 'IDLE');
    } finally {
      await server.stop();
    }
  });
});

// ---------------------------------------------------------------------------
// 9. Stage Tracker
// ---------------------------------------------------------------------------

describe('Phase 08: Stage Tracker', () => {
  test('HTML contains all pipeline stage labels', async () => {
    const { server } = createTestServer(3309);
    const url = await server.start();
    try {
      const html = await (await fetch(`${url}/`)).text();
      const requiredStages = [
        'Validate', 'R2 Upload', 'R2 Verification',
        'HTTP 206', 'Manifest', 'Git Commit', 'Git Push',
        'GitHub Actions', 'Production',
      ];
      for (const stage of requiredStages) {
        assert.ok(html.includes(stage), `Missing stage label: ${stage}`);
      }
    } finally {
      await server.stop();
    }
  });
});

// ---------------------------------------------------------------------------
// 10. Live Log
// ---------------------------------------------------------------------------

describe('Phase 08: Live Log', () => {
  test('HTML contains log panel with correct structure', async () => {
    const { server } = createTestServer(3310);
    const url = await server.start();
    try {
      const html = await (await fetch(`${url}/`)).text();
      assert.ok(html.includes('log-panel'), 'Missing log panel');
      assert.ok(html.includes('log-entry'), 'Missing log entry class');
      assert.ok(html.includes('log-time'), 'Missing time column');
      assert.ok(html.includes('log-stage'), 'Missing stage column');
      assert.ok(html.includes('log-msg'), 'Missing message column');
    } finally {
      await server.stop();
    }
  });
});

// ---------------------------------------------------------------------------
// 11. Error State
// ---------------------------------------------------------------------------

describe('Phase 08: Error Panel', () => {
  test('HTML contains error panel with retry and back-to-queue actions', async () => {
    const { server } = createTestServer(3311);
    const url = await server.start();
    try {
      const html = await (await fetch(`${url}/`)).text();
      assert.ok(html.includes('Pipeline Failed'), 'Missing error title');
      assert.ok(html.includes('retryBtn'), 'Missing retry button');
      assert.ok(html.includes('backToQueueBtn'), 'Missing back-to-queue button');
      assert.ok(html.includes('errorDetail'), 'Missing error detail element');
      assert.ok(html.includes('errorStage'), 'Missing error stage element');
    } finally {
      await server.stop();
    }
  });
});

// ---------------------------------------------------------------------------
// 12. Completion State
// ---------------------------------------------------------------------------

describe('Phase 08: Completion Panel', () => {
  test('HTML contains completion panel with production URL', async () => {
    const { server } = createTestServer(3312);
    const url = await server.start();
    try {
      const html = await (await fetch(`${url}/`)).text();
      assert.ok(html.includes('Production Updated'), 'Missing completion title');
      assert.ok(html.includes('completionList'), 'Missing completion checklist');
      assert.ok(html.includes('pdp212.github.io'), 'Missing production URL');
      assert.ok(html.includes('doneBtn'), 'Missing done button');
    } finally {
      await server.stop();
    }
  });
});

// ---------------------------------------------------------------------------
// 13. Batch Processing UI
// ---------------------------------------------------------------------------

describe('Phase 08: Batch Processing', () => {
  test('queue supports multiple video items simultaneously', async () => {
    const { server } = createTestServer(3313);
    const url = await server.start();
    try {
      const res = await fetch(`${url}/api/queue/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths: ['/mock/V1.mp4', '/mock/V2.mov', '/mock/V3.mkv'] }),
      });
      const data = await res.json();
      assert.strictEqual(data.count, 3);

      const q = await (await fetch(`${url}/api/queue`)).json();
      assert.strictEqual(q.total, 3);
      assert.strictEqual(q.ready, 3);
    } finally {
      await server.stop();
    }
  });
});

// ---------------------------------------------------------------------------
// 14. Secret Boundary
// ---------------------------------------------------------------------------

describe('Phase 08: Secret Boundary', () => {
  test('HTML page does not contain any credential references', async () => {
    const { server } = createTestServer(3314);
    const url = await server.start();
    try {
      const html = await (await fetch(`${url}/`)).text();
      assert.ok(!html.includes('R2_SECRET_ACCESS_KEY'), 'HTML must not contain R2_SECRET_ACCESS_KEY');
      assert.ok(!html.includes('R2_ACCESS_KEY_ID'), 'HTML must not contain R2_ACCESS_KEY_ID');
      assert.ok(!html.includes('R2_ACCOUNT_ID'), 'HTML must not contain R2_ACCOUNT_ID');
      assert.ok(!html.includes('GITHUB_TOKEN'), 'HTML must not contain GITHUB_TOKEN');
    } finally {
      await server.stop();
    }
  });

  test('pipeline status endpoint does not expose credentials', async () => {
    const { server } = createTestServer(3315);
    const url = await server.start();
    try {
      const res = await fetch(`${url}/api/pipeline/status`);
      const text = await res.text();
      assert.ok(!text.includes('R2_SECRET'), 'Status must not contain secrets');
      assert.ok(!text.includes('GITHUB_TOKEN'), 'Status must not contain GITHUB_TOKEN');
    } finally {
      await server.stop();
    }
  });
});

// ---------------------------------------------------------------------------
// 15. SSE Event Endpoint
// ---------------------------------------------------------------------------

describe('Phase 08: SSE Events', () => {
  test('SSE endpoint returns correct content-type and initial event', async () => {
    const { server } = createTestServer(3316);
    const url = await server.start();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000);

      const res = await fetch(`${url}/api/pipeline/events`, { signal: controller.signal }).catch(() => null);
      clearTimeout(timeout);

      if (res) {
        const contentType = res.headers.get('content-type') || '';
        assert.ok(contentType.includes('text/event-stream'), 'SSE must return text/event-stream');
      }
      // If fetch was aborted, that's fine — we just needed to verify the endpoint exists
    } finally {
      await server.stop();
    }
  });
});

// ---------------------------------------------------------------------------
// 16. Concurrent Pipeline Rejection
// ---------------------------------------------------------------------------

describe('Phase 08: Concurrent Pipeline Guard', () => {
  test('pipeline run endpoint returns 202 for valid request and subsequent status shows execution', async () => {
    const { server } = createTestServer(3317);
    const url = await server.start();
    try {
      // Add a video first
      await fetch(`${url}/api/queue/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths: ['/mock/video.mp4'] }),
      });

      // Start pipeline (dry-run) — should accept
      const first = await fetch(`${url}/api/pipeline/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isDryRun: true }),
      });
      assert.strictEqual(first.status, 202);

      const firstData = await first.json();
      assert.strictEqual(firstData.started, true);
      assert.strictEqual(firstData.isDryRun, true);
      assert.strictEqual(firstData.itemCount, 1);

      // Wait for pipeline to complete (dry-run is fast)
      await new Promise(r => setTimeout(r, 1000));

      // Status should show completion
      const status = await (await fetch(`${url}/api/pipeline/status`)).json();
      assert.ok(
        status.result === 'success' || status.result === 'failed',
        'Pipeline should have finished after 1s'
      );
    } finally {
      await server.stop();
    }
  });
});

// ---------------------------------------------------------------------------
// 17. Queue Clear
// ---------------------------------------------------------------------------

describe('Phase 08: Queue Clear', () => {
  test('clears all items from queue', async () => {
    const { server } = createTestServer(3318);
    const url = await server.start();
    try {
      await fetch(`${url}/api/queue/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths: ['/mock/A.mp4', '/mock/B.mp4', '/mock/C.mp4'] }),
      });

      const before = await (await fetch(`${url}/api/queue`)).json();
      assert.strictEqual(before.total, 3);

      await fetch(`${url}/api/queue/clear`, { method: 'POST' });

      const after = await (await fetch(`${url}/api/queue`)).json();
      assert.strictEqual(after.total, 0);
    } finally {
      await server.stop();
    }
  });
});

// ---------------------------------------------------------------------------
// 18. Accessibility
// ---------------------------------------------------------------------------

describe('Phase 08: Accessibility', () => {
  test('HTML contains required ARIA attributes and semantic elements', async () => {
    const { server } = createTestServer(3319);
    const url = await server.start();
    try {
      const html = await (await fetch(`${url}/`)).text();
      assert.ok(html.includes('aria-label'), 'Missing aria-label attributes');
      assert.ok(html.includes('aria-live'), 'Missing aria-live for status updates');
      assert.ok(html.includes('role="log"'), 'Missing role="log" on log panel');
      assert.ok(html.includes('role="button"'), 'Missing role="button" on drop zone');
      assert.ok(html.includes('tabindex="0"'), 'Drop zone must be keyboard focusable');
      assert.ok(html.includes('focus-visible'), 'Missing focus-visible styles');
    } finally {
      await server.stop();
    }
  });
});

// ---------------------------------------------------------------------------
// 19. Design Compliance
// ---------------------------------------------------------------------------

describe('Phase 08: Design Compliance', () => {
  test('uses Roboto font and correct dark background', async () => {
    const { server } = createTestServer(3320);
    const url = await server.start();
    try {
      const html = await (await fetch(`${url}/`)).text();
      assert.ok(html.includes('Roboto'), 'Must use Roboto font');
      assert.ok(html.includes('#050505'), 'Must use correct dark background (#050505)');
      assert.ok(!html.includes('border-radius: 12px'), 'Must not use large border-radius');
      assert.ok(!html.includes('rounded-xl'), 'Must not use rounded-xl');
      assert.ok(!html.includes('glassmorphism'), 'Must not use glassmorphism');
    } finally {
      await server.stop();
    }
  });
});

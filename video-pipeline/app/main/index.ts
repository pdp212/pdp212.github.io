/**
 * Video Pipeline Main Application Entrypoint
 * Parses CLI inputs and coordinates application execution or launches local UI server.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PipelineConfig } from '../../config/schema/index.js';
import { PipelineApplication } from '../application/index.js';
import { PipelineUiServer } from '../ui/server.js';

export function loadConfiguration(configPath?: string): PipelineConfig {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const candidatePaths = [
    configPath,
    path.resolve(process.cwd(), 'config/pipeline.config.json'),
    path.resolve(currentDir, '../../config/pipeline.config.json'),
    path.resolve(currentDir, '../../../config/pipeline.config.json'),
  ].filter((p): p is string => Boolean(p));

  const resolvedPath = candidatePaths.find((p) => fs.existsSync(p));

  if (!resolvedPath || !fs.existsSync(resolvedPath)) {
    throw new Error(`Pipeline configuration file not found. Checked: ${candidatePaths.join(', ')}`);
  }

  const raw = fs.readFileSync(resolvedPath, 'utf-8');
  return JSON.parse(raw) as PipelineConfig;
}

export async function bootstrap(args: string[]): Promise<void> {
  const isUi = args.includes('--ui');
  const isDryRun = args.includes('--dry-run');
  const videoArgs = args.filter((arg) => !arg.startsWith('--'));

  console.log('==================================================');
  console.log('VIDEO PIPELINE — PHASE 08: COMPLETE UI');
  console.log('==================================================');

  const config = loadConfiguration();
  const app = new PipelineApplication({ config, isDryRun });

  // 1. Launch Interactive Local UI Server
  if (isUi) {
    const uiServer = new PipelineUiServer(app.getInputController(), app.getLogger());
    const url = await uiServer.start();
    console.log(`\n🚀 Local UI Server running at: ${url}`);
    console.log('Press Ctrl+C to terminate.');
    return;
  }

  // 2. CLI Ingestion & Queue Inspection
  if (videoArgs.length > 0) {
    console.log(`\n📥 Ingesting ${videoArgs.length} video(s) into queue...`);
    const controller = app.getInputController();
    const items = await controller.addVideos(videoArgs);

    console.log('\n--- Video Queue Status ---');
    for (const item of items) {
      const statusIcon = item.status === 'READY' ? '✔' : item.status === 'INVALID' ? '✖' : '⏳';
      console.log(`${statusIcon} [${item.status}] ${item.fileName}`);
      if (item.metadata) {
        const m = item.metadata;
        console.log(`   ${m.width}x${m.height} · ${m.fps}fps · ${m.durationFormatted} · ${m.videoCodec} · ${m.audioCodec} · ${(m.fileSize / (1024 * 1024)).toFixed(1)}MB`);
      }
      if (item.error) {
        console.log(`   Reason: ${item.error}`);
      }
    }

    const summary = controller.getSummary();
    console.log(`\nQueue Summary: ${summary.ready} READY / ${summary.invalid} INVALID / ${summary.total} TOTAL`);

    if (summary.ready > 0) {
      const ctx = controller.preparePipelineContext(isDryRun);
      console.log(`✔ PipelineContext prepared with ${ctx.items.length} item(s). (Phase 02 boundary - execution deferred).`);
    }
    return;
  }

  // 3. Usage Guide
  console.log('Usage:');
  console.log('  npm run ui                         # Launch local browser tool UI');
  console.log('  node dist/app/main/index.js <file> # Ingest and inspect videos via CLI');
  console.log('  node dist/app/main/index.js --dry-run <file>');
}

export default bootstrap;

// Auto-bootstrap when executed as main CLI entrypoint
const isMainModule =
  process.argv[1] &&
  (process.argv[1].endsWith('main/index.js') ||
    process.argv[1].endsWith('main/index.ts') ||
    process.argv[1] === fileURLToPath(import.meta.url));

if (isMainModule) {
  bootstrap(process.argv.slice(2)).catch((err) => {
    console.error('Fatal bootstrap error:', err);
    process.exit(1);
  });
}

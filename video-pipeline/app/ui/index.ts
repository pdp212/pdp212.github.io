/**
 * UI Layer Contracts & View Adapters
 * Decouples pipeline state changes, queue updates, and logs from CLI or GUI renderers.
 */

import type { LogEntry } from '../../core/logger/logger.js';
import type { PipelineSnapshot } from '../../core/state/state-store.js';
import type { VideoInput } from '../application/video-input.js';

export * from './server.js';

export interface UiEventHandler {
  onLog?(entry: LogEntry): void;
  onStateChange?(snapshot: PipelineSnapshot): void;
  onProgress?(itemId: string, percent: number): void;
  onQueueUpdate?(items: VideoInput[]): void;
  onError?(message: string): void;
}

export class PipelineConsoleUi implements UiEventHandler {
  public onLog(entry: LogEntry): void {
    const symbol = entry.status === 'SUCCESS' ? '✔' : entry.status === 'FAILURE' ? '✖' : 'ℹ';
    console.log(`[UI] ${symbol} [${entry.stage}] ${entry.message}`);
  }

  public onStateChange(snapshot: PipelineSnapshot): void {
    console.log(`[UI State] Transitioned to -> ${snapshot.stage}`);
  }

  public onProgress(itemId: string, percent: number): void {
    console.log(`[UI Progress] Item ${itemId}: ${percent}%`);
  }

  public onQueueUpdate(items: VideoInput[]): void {
    console.log(`[UI Queue] Total items: ${items.length}`);
  }

  public onError(message: string): void {
    console.error(`[UI Error] ${message}`);
  }
}

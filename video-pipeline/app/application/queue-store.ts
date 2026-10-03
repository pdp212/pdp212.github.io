/**
 * Persistent Queue Store
 * Persists and restores video queue state across restarts.
 * Ensures strict filesystem verification on restore.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { VideoInput } from './video-input.js';
import type { VideoQueue } from './video-queue.js';
import type { VideoInspector } from '../../engines/video/video-inspector.js';

export interface PersistedQueueData {
  savedAt: string;
  items: VideoInput[];
}

export class QueueStore {
  private readonly filePath: string;

  constructor(filePathOverride?: string) {
    this.filePath = filePathOverride
      ? path.resolve(filePathOverride)
      : path.resolve(process.cwd(), 'data/queue.json');
    this.ensureDirectory();
  }

  private ensureDirectory(): void {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  public save(items: VideoInput[]): void {
    try {
      this.ensureDirectory();
      const data: PersistedQueueData = {
        savedAt: new Date().toISOString(),
        items,
      };
      const tempPath = `${this.filePath}.tmp_${Date.now()}`;
      fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf-8');
      fs.renameSync(tempPath, this.filePath);
    } catch {
      // Non-critical queue save error
    }
  }

  public async restore(queue: VideoQueue, inspector?: VideoInspector): Promise<number> {
    if (!fs.existsSync(this.filePath)) {
      return 0;
    }

    try {
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw) as PersistedQueueData;
      if (!parsed || !Array.isArray(parsed.items)) {
        return 0;
      }

      let restoredCount = 0;

      for (const item of parsed.items) {
        // 1. Verify that file exists on disk
        if (item.path && fs.existsSync(item.path)) {
          const stat = fs.statSync(item.path);
          if (stat.isFile() && stat.size > 0) {
            // Restore with existing metadata or re-inspect
            if (item.status === 'READY' && item.metadata) {
              await queue.add(item.path, item.fileName, {
                valid: true,
                metadata: item.metadata,
                errors: [],
              });
              restoredCount++;
            } else if (inspector) {
              await queue.add(item.path, item.fileName);
              restoredCount++;
            }
          }
        }
      }

      return restoredCount;
    } catch {
      return 0;
    }
  }

  public clear(): void {
    try {
      if (fs.existsSync(this.filePath)) {
        fs.unlinkSync(this.filePath);
      }
    } catch {}
  }
}

/**
 * Video Queue Service
 * Manages the in-memory video queue, duplicate detection, asynchronous inspection, and status lifecycle.
 */

import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import type { VideoInput, VideoInputStatus, VideoValidationResult } from './video-input.js';
import { VideoInspector } from '../../engines/video/video-inspector.js';
import { VideoQueueError } from '../../core/errors/pipeline-errors.js';

export interface QueueProgressEvent {
  current: number;
  total: number;
  currentItem?: VideoInput;
}

export class VideoQueue extends EventEmitter {
  private readonly items: Map<string, VideoInput> = new Map();
  private readonly inspector: VideoInspector;

  constructor(supportedExtensions: string[], inspector?: VideoInspector) {
    super();
    this.inspector = inspector || new VideoInspector(supportedExtensions);
  }

  /**
   * Generates a unique, reproducible key for duplicate detection based on path, size, and mtime.
   */
  private getFileFingerprint(filePath: string): string {
    const resolved = path.resolve(filePath);
    if (!fs.existsSync(resolved)) {
      return resolved;
    }
    const stat = fs.statSync(resolved);
    return `${resolved}::${stat.size}::${stat.mtimeMs}`;
  }

  /**
   * Checks whether a video path is already present in the queue.
   */
  public has(filePath: string): boolean {
    const targetPath = path.resolve(filePath);
    for (const item of this.items.values()) {
      if (item.path === targetPath && item.status !== 'REMOVED') {
        return true;
      }
    }
    return false;
  }

  /**
   * Finds an existing item by its file path.
   */
  public findByPath(filePath: string): VideoInput | undefined {
    const targetPath = path.resolve(filePath);
    for (const item of this.items.values()) {
      if (item.path === targetPath && item.status !== 'REMOVED') {
        return item;
      }
    }
    return undefined;
  }

  /**
   * Returns current count of active queue items.
   */
  public size(): number {
    return this.getAll().length;
  }

  /**
   * Returns all active queue items.
   */
  public getAll(): VideoInput[] {
    return Array.from(this.items.values()).filter((item) => item.status !== 'REMOVED');
  }

  /**
   * Returns only items that passed inspection and are READY.
   */
  public getReady(): VideoInput[] {
    return this.getAll().filter((item) => item.status === 'READY');
  }

  /**
   * Retrieves an item by its ID.
   */
  public get(id: string): VideoInput | undefined {
    const item = this.items.get(id);
    return item && item.status !== 'REMOVED' ? item : undefined;
  }

  /**
   * Removes an item from the queue by ID.
   */
  public remove(id: string): boolean {
    const item = this.items.get(id);
    if (!item || item.status === 'REMOVED') {
      return false;
    }
    item.status = 'REMOVED';
    this.items.delete(id);
    this.emit('item:removed', item);
    this.emit('queue:changed', this.getAll());
    return true;
  }

  /**
   * Clears all items from the queue.
   */
  public clear(): void {
    const removedCount = this.items.size;
    this.items.clear();
    this.emit('queue:cleared', removedCount);
    this.emit('queue:changed', []);
  }

  /**
   * Adds a single video to the queue, runs duplicate check, and triggers inspection.
   */
  public async add(filePath: string): Promise<VideoInput> {
    const resolvedPath = path.resolve(filePath);

    // 1. Duplicate Detection Check
    const existing = this.findByPath(resolvedPath);
    if (existing) {
      this.emit('duplicate:ignored', { filePath: resolvedPath, existing });
      return existing;
    }

    const filename = path.basename(resolvedPath);
    const extension = path.extname(filename).toLowerCase();
    const size = fs.existsSync(resolvedPath) ? fs.statSync(resolvedPath).size : 0;
    const id = `vid_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const newItem: VideoInput = {
      id,
      path: resolvedPath,
      fileName: filename,
      extension,
      size,
      addedAt: new Date().toISOString(),
      status: 'QUEUED',
      validation: { valid: false, errors: [] },
    };

    this.items.set(id, newItem);
    this.emit('item:added', newItem);
    this.emit('queue:changed', this.getAll());

    // 2. Asynchronous Inspection
    return this.inspect(newItem);
  }

  /**
   * Adds multiple videos in batch with progress events.
   */
  public async addMany(filePaths: string[]): Promise<VideoInput[]> {
    const results: VideoInput[] = [];
    const total = filePaths.length;

    for (let i = 0; i < total; i++) {
      const p = filePaths[i];
      const item = await this.add(p);
      results.push(item);

      const progress: QueueProgressEvent = {
        current: i + 1,
        total,
        currentItem: item,
      };
      this.emit('queue:progress', progress);
    }

    return results;
  }

  /**
   * Inspects a single video item and updates its status to READY or INVALID.
   */
  public async inspect(item: VideoInput): Promise<VideoInput> {
    item.status = 'INSPECTING';
    this.emit('item:inspecting', item);

    const inspection = await this.inspector.inspectFile(item.path);

    if (inspection.valid && inspection.metadata) {
      item.metadata = inspection.metadata;
      item.validation = { valid: true, errors: [] };
      item.status = 'READY';
      this.emit('item:ready', item);
    } else {
      item.validation = { valid: false, errors: inspection.errors };
      item.status = 'INVALID';
      item.error = inspection.errors.join('; ');
      this.emit('item:invalid', item);
    }

    this.emit('item:updated', item);
    this.emit('queue:changed', this.getAll());
    return item;
  }
}

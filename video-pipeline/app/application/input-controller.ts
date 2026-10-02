/**
 * Input Controller
 * Enforces explicit boundaries between UI, VideoQueue, and PipelineContext.
 */

import { VideoQueue } from './video-queue.js';
import type { VideoInput } from './video-input.js';
import type { PipelineConfig } from '../../config/schema/index.js';
import {
  type PipelineContext,
  convertVideoInputsToPipelineItems,
} from '../../pipeline/context.js';
import { PipelineStateStore } from '../../core/state/state-store.js';
import { PipelineLogger } from '../../core/logger/logger.js';
import { InputError } from '../../core/errors/pipeline-errors.js';

export interface QueueSummary {
  total: number;
  ready: number;
  invalid: number;
  inspecting: number;
  items: VideoInput[];
}

export class InputController {
  private readonly queue: VideoQueue;
  private readonly config: PipelineConfig;
  private readonly logger: PipelineLogger;

  constructor(config: PipelineConfig, queue?: VideoQueue, logger?: PipelineLogger) {
    this.config = config;
    this.logger = logger || new PipelineLogger();
    this.queue = queue || new VideoQueue(config.supportedInputFormats);
  }

  public getQueue(): VideoQueue {
    return this.queue;
  }

  public async addVideo(filePath: string): Promise<VideoInput> {
    this.logger.debug('VALIDATING', 'INPUT_ADD', `Ingesting file: ${filePath}`);
    return this.queue.add(filePath);
  }

  public async addVideos(filePaths: string[]): Promise<VideoInput[]> {
    this.logger.info('VALIDATING', 'INPUT_BATCH', `Ingesting batch of ${filePaths.length} file(s)...`);
    return this.queue.addMany(filePaths);
  }

  public removeVideo(id: string): boolean {
    const success = this.queue.remove(id);
    if (success) {
      this.logger.debug('IDLE', 'INPUT_REMOVE', `Removed item from queue: ${id}`);
    }
    return success;
  }

  public clearQueue(): void {
    this.queue.clear();
    this.logger.info('IDLE', 'INPUT_CLEAR', 'Cleared video queue.');
  }

  public getSummary(): QueueSummary {
    const all = this.queue.getAll();
    return {
      total: all.length,
      ready: all.filter((i) => i.status === 'READY').length,
      invalid: all.filter((i) => i.status === 'INVALID').length,
      inspecting: all.filter((i) => i.status === 'INSPECTING').length,
      items: all,
    };
  }

  /**
   * Prepares the PipelineContext data contract from the current READY items in the queue.
   * Strictly DOES NOT execute the pipeline in Phase 02.
   */
  public preparePipelineContext(isDryRun = false): PipelineContext {
    const readyItems = this.queue.getReady();
    if (readyItems.length === 0) {
      throw new InputError('Cannot prepare pipeline context: No validated READY videos in queue.');
    }

    const pipelineId = `pipe_${Date.now()}`;
    const stateStore = new PipelineStateStore(pipelineId, isDryRun);

    const pipelineItems = convertVideoInputsToPipelineItems(readyItems);
    for (const item of pipelineItems) {
      stateStore.registerItem(item.id, item.filename);
    }

    const context: PipelineContext = {
      pipelineId,
      isDryRun,
      config: this.config,
      logger: this.logger,
      stateStore,
      items: pipelineItems,
      inputs: readyItems,
      currentStage: 'IDLE',
    };

    this.logger.info(
      'IDLE',
      'CONTEXT_PREPARED',
      `PipelineContext prepared with ${pipelineItems.length} READY item(s). (Phase 02 boundary - execution deferred).`
    );

    return context;
  }
}

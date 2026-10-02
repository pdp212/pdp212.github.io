/**
 * Pipeline State Store
 * Tracks the current state, progress, and execution history across pipeline steps.
 */

import type { PipelineStage } from '../errors/pipeline-errors.js';

export interface StateTransitionRecord {
  from: PipelineStage;
  to: PipelineStage;
  timestamp: string;
  reason?: string;
}

export interface PipelineItemState {
  itemId: string;
  filename: string;
  currentStage: PipelineStage;
  progressPercent: number;
  error?: string;
  r2Url?: string;
}

export interface PipelineSnapshot {
  pipelineId: string;
  stage: PipelineStage;
  isDryRun: boolean;
  startTime: string;
  endTime?: string;
  items: Record<string, PipelineItemState>;
  history: StateTransitionRecord[];
}

export class PipelineStateStore {
  private snapshot: PipelineSnapshot;

  constructor(pipelineId: string, isDryRun = false) {
    this.snapshot = {
      pipelineId,
      stage: 'IDLE',
      isDryRun,
      startTime: new Date().toISOString(),
      items: {},
      history: [],
    };
  }

  public getSnapshot(): Readonly<PipelineSnapshot> {
    return { ...this.snapshot };
  }

  public getCurrentStage(): PipelineStage {
    return this.snapshot.stage;
  }

  public registerItem(itemId: string, filename: string): void {
    this.snapshot.items[itemId] = {
      itemId,
      filename,
      currentStage: 'IDLE',
      progressPercent: 0,
    };
  }

  public updateItemStage(itemId: string, stage: PipelineStage, progressPercent = 0, error?: string): void {
    const item = this.snapshot.items[itemId];
    if (item) {
      item.currentStage = stage;
      item.progressPercent = progressPercent;
      if (error) item.error = error;
    }
  }

  public setItemR2Url(itemId: string, url: string): void {
    const item = this.snapshot.items[itemId];
    if (item) {
      item.r2Url = url;
    }
  }

  public transitionTo(newStage: PipelineStage, reason?: string): void {
    const record: StateTransitionRecord = {
      from: this.snapshot.stage,
      to: newStage,
      timestamp: new Date().toISOString(),
      reason,
    };

    this.snapshot.history.push(record);
    this.snapshot.stage = newStage;

    if (newStage === 'COMPLETED' || newStage === 'FAILED' || newStage === 'CANCELLED') {
      this.snapshot.endTime = new Date().toISOString();
    }
  }
}

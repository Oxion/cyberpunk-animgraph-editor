import { SimInputBoard } from '@/utils/sim/SimInputBoard'
import type { DraftBoardEntry } from './draftBoardEntry'
import type { IDraftBoard } from './types'

export type DraftFeatureChannelId =
  | 'numericFeatures'
  | 'stringFeatures'
  | 'booleanFeatures'
  | 'vectorFeatures'
  | 'quatFeatures'

export type DraftNameChannelId =
  | 'floatVars'
  | 'intVars'
  | 'boolVars'
  | 'vectorVars'
  | 'quatVars'
  | 'wrapperWeights'
  | 'tagValues'
  | 'entityTags'

export type DraftAppliedChannelId = DraftFeatureChannelId | DraftNameChannelId

export type DraftFeatureRef = { feature: string; property: string }

/** Presence marker for name channels (vars / tags / wrappers). */
export type DraftNameRef = true

export interface IDraftChannel {
  readonly id: DraftAppliedChannelId
  apply(
    needReconcile: boolean,
    entries: readonly DraftBoardEntry[],
    board: SimInputBoard,
  ): boolean
  clearBuffers(): void
}

type DraftAppliedBuffers<T> = {
  prev: Map<string, T>
  next: Map<string, T>
}

const swapBuffers = <T>(buffers: DraftAppliedBuffers<T>): void => {
  const swap = buffers.prev
  buffers.prev = buffers.next
  buffers.next = swap
  buffers.next.clear()
}

export type DraftChannelOptions<T> = {
  id: DraftAppliedChannelId
  isDirty: (entry: DraftBoardEntry) => boolean
  applyEntry: (
    board: SimInputBoard,
    draftBoard: IDraftBoard,
    nextKeys: Map<string, T>,
  ) => void
  syncRevision: (entry: DraftBoardEntry) => void
  clearOrphan: (board: SimInputBoard, key: string, value: T) => void
}

export class DraftChannel<T> implements IDraftChannel {
  readonly id: DraftAppliedChannelId
  private readonly buffers: DraftAppliedBuffers<T> = {
    prev: new Map(),
    next: new Map(),
  }
  private readonly isDirty: DraftChannelOptions<T>['isDirty']
  private readonly applyEntry: DraftChannelOptions<T>['applyEntry']
  private readonly syncRevision: DraftChannelOptions<T>['syncRevision']
  private readonly clearOrphan: DraftChannelOptions<T>['clearOrphan']

  constructor(options: DraftChannelOptions<T>) {
    this.id = options.id
    this.isDirty = options.isDirty
    this.applyEntry = options.applyEntry
    this.syncRevision = options.syncRevision
    this.clearOrphan = options.clearOrphan
  }

  clearBuffers(): void {
    this.buffers.prev.clear()
    this.buffers.next.clear()
  }

  apply(
    needReconcile: boolean,
    entries: readonly DraftBoardEntry[],
    board: SimInputBoard,
  ): boolean {
    if (!needReconcile && !entries.some(this.isDirty)) return false

    this.buffers.next.clear()
    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i]
      this.applyEntry(board, entry.draftBoard, this.buffers.next)
      this.syncRevision(entry)
    }

    for (const [key, value] of this.buffers.prev) {
      if (!this.buffers.next.has(key)) this.clearOrphan(board, key, value)
    }

    swapBuffers(this.buffers)
    return true
  }
}

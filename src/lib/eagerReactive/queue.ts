import { IInternalRunnable } from "./internalApi";

export class Queue {
  private _buckets: Set<IInternalRunnable>[] = [];
  private _isFlushing = false;
  private _maxRank = -1;
  private _flushRank = -1;
  private _backtrackTo = -1;
  private _scheduledRanks = new Map<IInternalRunnable, number>();

  public add(node: IInternalRunnable): void {
    const rank = node.rank;
    const currentScheduledRank = this._scheduledRanks.get(node) ?? -1;
    if (currentScheduledRank >= rank) return;

    this._scheduledRanks.set(node, rank);

    while (this._buckets.length <= rank) {
      this._buckets.push(new Set());
    }

    this._buckets[rank].add(node);
    if (rank > this._maxRank) this._maxRank = rank;

    if (this._flushRank >= 0 && rank < this._flushRank) {
      if (this._backtrackTo === -1 || rank < this._backtrackTo) {
        this._backtrackTo = rank;
      }
    }

    this.scheduleFlush();
  }

  private flush(): void {
    try {
      for (let i = 0; i <= this._maxRank; ) {
        this._flushRank = i;
        const bucket = this._buckets[i];
        if (bucket === undefined || bucket.size === 0) {
          i++;
          continue;
        }

        for (const node of bucket) {
          if (this._scheduledRanks.get(node) === i) {
            node.run();
            this._scheduledRanks.delete(node);
          }
          bucket.delete(node);

          if (this._backtrackTo !== -1 && this._backtrackTo < i) {
            break;
          }
        }

        if (this._backtrackTo !== -1 && this._backtrackTo < i) {
          i = this._backtrackTo;
          this._backtrackTo = -1;
          continue;
        }

        i++;
      }

      this._maxRank = -1;
      this._scheduledRanks.clear();
    } finally {
      this._flushRank = -1;
      this._backtrackTo = -1;
      this._isFlushing = false;
    }
  }

  private scheduleFlush(): void {
    if (!this._isFlushing) {
      this._isFlushing = true;
      queueMicrotask(() => this.flush());
    }
  }
}

export const globalQueue = new Queue();

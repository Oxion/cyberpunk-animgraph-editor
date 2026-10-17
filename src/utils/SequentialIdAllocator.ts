/** Guard against infinite mint if `isUsed` is stuck true. */
const MAX_ALLOC_ATTEMPTS = 1_000_000

/**
 * Collision-safe sequential ids: `${prefix}_${n}`.
 * `isUsed` must reflect the owning collection; call `reset()` only after clearing it.
 */
export class SequentialIdAllocator {
  private _next = 1
  private readonly _prefix: string
  private readonly _isUsed: (id: string) => boolean
  private readonly _noteRegExp: RegExp

  constructor(prefix: string, isUsed: (id: string) => boolean) {
    this._prefix = prefix
    this._isUsed = isUsed
    this._noteRegExp = new RegExp(`^${escapeRegExp(prefix)}_(\\d+)$`)
  }

  public get prefix(): string {
    return this._prefix
  }

  public get next(): number {
    return this._next
  }

  /** Bump counter past `prefix_N` when id matches; ignore other shapes. */
  note(id: string): void {
    const match = this._noteRegExp.exec(id)
    if (!match) return
    const idIndex = Number(match[1])
    if (Number.isFinite(idIndex) && idIndex >= this._next) this._next = idIndex + 1
  }

  /**
   * Restore `preferred` when free; otherwise mint a unique id.
   * Preferred taken → mint new (no warn; restore path handles that).
   */
  alloc(preferred?: string | null): string {
    const pref = typeof preferred === 'string' ? preferred.trim() : ''
    if (pref && !this._isUsed(pref)) {
      this.note(pref)
      return pref
    }
    for (let i = 0; i < MAX_ALLOC_ATTEMPTS; i++) {
      const id = `${this._prefix}_${this._next++}`
      if (!this._isUsed(id)) return id
    }
    throw new Error(
      `SequentialIdAllocator(${this._prefix}): exceeded ${MAX_ALLOC_ATTEMPTS} alloc attempts`
    )
  }

  reset(): void {
    this._next = 1
  }
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

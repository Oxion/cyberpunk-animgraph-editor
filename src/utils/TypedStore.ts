/**
 * Phantom-typed store keys. Identity is `id` (string); do not use the
 * StateKey object itself as a Map key.
 */
export class StateKey<TValue> {
  declare readonly __value?: TValue
  constructor(public readonly id: string) {}
}

/** Heterogeneous map: get/set typed by StateKey; stored under key.id. */
export class TypedStore {
  private readonly _data = new Map<string, unknown>()

  get<T>(key: StateKey<T>): T | undefined {
    return this._data.get(key.id) as T | undefined
  }

  set<T>(key: StateKey<T>, value: T): this {
    this._data.set(key.id, value)
    return this
  }

  has(key: StateKey<unknown>): boolean {
    return this._data.has(key.id)
  }

  delete(key: StateKey<unknown>): boolean {
    return this._data.delete(key.id)
  }

  clear(): void {
    this._data.clear()
  }

  get size(): number {
    return this._data.size
  }
}

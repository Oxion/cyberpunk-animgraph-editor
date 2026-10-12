/**
 * Phantom-typed store keys. Identity is `id` (string); do not use the
 * StateKey object itself as a Map key.
 */
export class StateKey<TValue> {
  declare readonly __value?: TValue
  constructor(public readonly id: string) {}
}

/** Heterogeneous map: get/set typed by StateKey; stored under key.id. */
export class TypedStore<TValue extends unknown = unknown> {
  private readonly _data = new Map<string, TValue>()

  get<ArgTValue extends TValue>(key: StateKey<ArgTValue>): ArgTValue | undefined {
    return this._data.get(key.id) as ArgTValue | undefined
  }

  set<ArgTValue extends TValue>(key: StateKey<ArgTValue>, value: ArgTValue): this {
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

  values(): MapIterator<TValue> {
    return this._data.values()
  }
}

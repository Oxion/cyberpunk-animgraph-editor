/**
 * Generic keyed instance storage with typed state definitions.
 * Each def owns its own keyspace — `(LookAt, "1")` ≠ `(Fpp, "1")`.
 *
 * Hot path (zero alloc when props is a live ref):
 *   let s = store.get(Def, key)
 *   if (!s) s = store.set(Def, key, Def.create(props))
 *
 * Or: store.ensure(Def, key, props) — same, but `props` is always evaluated.
 */

import { StateKey, TypedStore } from "./TypedStore"

export class InstanceStateDef<T, P = void> extends StateKey<Map<string, T>> {
  constructor(id: string, public readonly create: (props: P) => T) {
    super(id)
  }
}

export class InstanceStore {
  private readonly _store = new TypedStore<Map<string, unknown>>()

  buckets(): Iterator<Map<string, unknown>> {
    return this._store.values()
  }

  bucket<T, P>(def: InstanceStateDef<T, P>): Map<string, T> | undefined {
    return this._store.get(def)
  }

  ensureBucket<T, P>(def: InstanceStateDef<T, P>): Map<string, T> {
    let m = this._store.get(def)
    if (!m) {
      m = new Map<string, T>()
      this._store.set(def, m)
    }
    return m
  }

  clearBucket<T, P>(def: InstanceStateDef<T, P>): void {
    this._store.delete(def)
  }

  get<T, P>(def: InstanceStateDef<T, P>, key: string): T | undefined {
    return this.ensureBucket(def).get(key) as T | undefined
  }

  set<T, P>(def: InstanceStateDef<T, P>, key: string, value: T): T {
    this.ensureBucket(def).set(key, value)
    return value
  }

  /**
   * get → create(props) → set on miss.
   * Prefer live refs for `props`; avoid allocating bags when the key already exists.
   */
  ensure<T, P>(def: InstanceStateDef<T, P>, key: string, props: P): T {
    const m = this.ensureBucket(def)
    let s = m.get(key) as T | undefined
    if (s === undefined) {
      s = def.create(props)
      m.set(key, s)
    }
    return s
  }

  has<T, P>(def: InstanceStateDef<T, P>, key: string): boolean {
    return this._store.get(def)?.has(key) ?? false
  }

  delete<T, P>(def: InstanceStateDef<T, P>, key: string): boolean {
    return this._store.get(def)?.delete(key) ?? false
  }

  clear(): void {
    this._store.clear()
  }

  /** Total entries across all defs. */
  get size(): number {
    let n = 0
    for (const m of this._store.values()) n += m.size
    return n
  }
}

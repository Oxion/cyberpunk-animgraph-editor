/** Read/write helpers for nested paths on selected handle Data. */

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

/** Top-level Data key used for undo snapshots. */
export function snapshotRootKey(dataKey: string, dataPath?: readonly string[]): string {
  return dataPath?.[0] ?? dataKey
}

/** Effective path from handle Data root to the bound value. */
export function resolveDataPath(dataKey: string, dataPath?: readonly string[]): string[] {
  if (dataPath && dataPath.length > 0) return [...dataPath]
  return [dataKey]
}

export function getAtDataPath(
  root: Record<string, unknown> | null | undefined,
  path: readonly string[]
): unknown {
  if (!root || path.length === 0) return undefined
  let cursor: unknown = root
  for (const seg of path) {
    const obj = asRecord(cursor)
    if (!obj) return undefined
    cursor = obj[seg]
  }
  return cursor
}

export function setAtDataPath(
  root: Record<string, unknown>,
  path: readonly string[],
  value: unknown
): void {
  if (path.length === 0) return
  if (path.length === 1) {
    root[path[0]!] = value
    return
  }
  let cursor: Record<string, unknown> = root
  for (let i = 0; i < path.length - 1; i++) {
    const seg = path[i]!
    let next = asRecord(cursor[seg])
    if (!next) {
      next = {}
      cursor[seg] = next
    }
    cursor = next
  }
  cursor[path[path.length - 1]!] = value
}

export function ensureArrayAtDataPath(
  root: Record<string, unknown>,
  path: readonly string[]
): unknown[] {
  if (path.length === 0) return []
  if (path.length === 1) {
    const key = path[0]!
    if (!Array.isArray(root[key])) root[key] = []
    return root[key] as unknown[]
  }
  let cursor: Record<string, unknown> = root
  for (let i = 0; i < path.length - 1; i++) {
    const seg = path[i]!
    let next = asRecord(cursor[seg])
    if (!next) {
      next = {}
      cursor[seg] = next
    }
    cursor = next
  }
  const last = path[path.length - 1]!
  if (!Array.isArray(cursor[last])) cursor[last] = []
  return cursor[last] as unknown[]
}

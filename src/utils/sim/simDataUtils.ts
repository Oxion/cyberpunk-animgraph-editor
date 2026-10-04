import type { AnimgraphNode } from '../graph/animgraphTypes'

/** Read CName / string field from animgraph Data. */
export function readCName(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'object' && value !== null && '$value' in value) {
    const v = (value as { $value?: unknown }).$value
    return typeof v === 'string' ? v : String(v ?? '')
  }
  return String(value)
}

/** Read CName[] / string[] from animgraph Data (skips empty / None). */
export function readCNameList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  for (const item of value) {
    const n = readCName(item)
    if (n && n !== 'None') out.push(n)
  }
  return out
}

/** redTagList `{ tags: CName[] }` or bare CName[]. */
export function readTagList(value: unknown): string[] {
  if (!value) return []
  if (Array.isArray(value)) return readCNameList(value)
  if (typeof value === 'object' && value !== null && 'tags' in value) {
    return readCNameList((value as { tags?: unknown }).tags)
  }
  return []
}

/** AGLO_Or / Or / or → true; AGLO_And → false. Default Or (engine). */
export function isLogicOpOr(op: unknown): boolean {
  const s = String(op ?? 'Or')
    .replace(/^AGLO_/i, '')
    .toLowerCase()
  return s !== 'and'
}

export function readNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value)
    if (Number.isFinite(n)) return n
  }
  return fallback
}

export function readBool(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') return value === '1' || value.toLowerCase() === 'true'
  return false
}

/** Vector4 JSON (`X/Y/Z/W` or `x/y/z/w`). */
export function readVector4(
  value: unknown,
  fallback: { x: number; y: number; z: number; w: number } = { x: 0, y: 0, z: 0, w: 0 }
): { x: number; y: number; z: number; w: number } {
  if (!value || typeof value !== 'object') return { ...fallback }
  const o = value as Record<string, unknown>
  return {
    x: readNumber(o.X ?? o.x, fallback.x),
    y: readNumber(o.Y ?? o.y, fallback.y),
    z: readNumber(o.Z ?? o.z, fallback.z),
    w: readNumber(o.W ?? o.w, fallback.w),
  }
}

/** Resolve HandleId / HandleRefId / PoseLink|FloatLink.node to registry entry. */
export function resolveHandle(
  handles: Map<string, AnimgraphNode>,
  ref: unknown
): AnimgraphNode | null {
  if (!ref || typeof ref !== 'object') return null
  const r = ref as {
    HandleId?: string
    HandleRefId?: string
    node?: unknown
    Data?: unknown
  }
  // "0"/"-1" are empty-link sentinels unless a real handle is registered (Root is "0").
  if (r.HandleId && (r.HandleId !== '-1' && r.HandleId !== '0' || handles.has(r.HandleId))) {
    return handles.get(r.HandleId) ?? null
  }
  if (r.HandleRefId && (r.HandleRefId !== '-1' && r.HandleRefId !== '0' || handles.has(r.HandleRefId))) {
    return handles.get(r.HandleRefId) ?? null
  }
  // animPoseLink / animFloatLink / etc.
  if (r.node != null) {
    return resolveHandle(handles, r.node)
  }
  return null
}

export function resolveHandleId(
  handles: Map<string, AnimgraphNode>,
  ref: unknown
): string | null {
  const h = resolveHandle(handles, ref)
  return h?.HandleId ?? null
}

export function handleType(node: AnimgraphNode | null | undefined): string {
  return (node?.Data?.$type as string | undefined) ?? ''
}

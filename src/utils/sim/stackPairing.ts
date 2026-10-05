/**
 * Pair StackTransforms Extender ↔ Shrinker by tag (compiler TryMatching*).
 */

import type { AnimgraphNode } from '../graph/animgraphTypes'
import { handleType, readCName } from './simDataUtils'

export type StackPairing = {
  /** Shrinker handleId → transforms to remove */
  shrinkRemoveCountByHandleId: Map<string, number>
  /** Extender handleId → transformInfos count */
  extenderCountByHandleId: Map<string, number>
  /** Suggested stack capacity for pose buffers */
  suggestedStackCapacity: number
}

function transformInfosCount(node: AnimgraphNode): number {
  const infos = node.Data?.transformInfos
  return Array.isArray(infos) ? infos.length : 0
}

/**
 * First Extender wins per tag; each Shrinker with same tag gets that count.
 */
export function buildStackPairing(handles: Map<string, AnimgraphNode>): StackPairing {
  const tagToCount = new Map<string, number>()
  const extenderCountByHandleId = new Map<string, number>()
  let sum = 0

  for (const h of handles.values()) {
    if (handleType(h) !== 'animAnimNode_StackTransformsExtender') continue
    const n = transformInfosCount(h)
    extenderCountByHandleId.set(h.HandleId, n)
    sum += n
    const tag = readCName(h.Data?.tag)
    const key = tag && tag !== 'None' ? tag.toLowerCase() : `__id:${h.HandleId}`
    if (!tagToCount.has(key)) tagToCount.set(key, n)
  }

  const shrinkRemoveCountByHandleId = new Map<string, number>()
  for (const h of handles.values()) {
    if (handleType(h) !== 'animAnimNode_StackTransformsShrinker') continue
    const tag = readCName(h.Data?.tag)
    const key = tag && tag !== 'None' ? tag.toLowerCase() : ''
    const count = key ? (tagToCount.get(key) ?? 0) : 0
    shrinkRemoveCountByHandleId.set(h.HandleId, count)
  }

  const suggestedStackCapacity = Math.max(16, Math.min(128, sum || 64))
  return { shrinkRemoveCountByHandleId, extenderCountByHandleId, suggestedStackCapacity }
}

/** Extender transformInfos names for HUD auto-inspect. */
export function readExtenderTransformNames(node: AnimgraphNode): string[] {
  const infos = node.Data?.transformInfos
  if (!Array.isArray(infos)) return []
  const out: string[] = []
  for (const info of infos) {
    const n = readCName(
      info && typeof info === 'object'
        ? (info as { name?: unknown; Data?: { name?: unknown } }).name ??
            (info as { Data?: { name?: unknown } }).Data?.name
        : info
    )
    if (n && n !== 'None') out.push(n)
  }
  return out
}

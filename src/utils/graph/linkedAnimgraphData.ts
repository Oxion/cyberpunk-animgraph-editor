import type { AnimgraphNode } from './animgraphTypes'
import type { RenderNode } from './diagramTypes'

function handleIdOfBox(node: RenderNode): string | null {
  const id = node.data?.originalNodeId
  return typeof id === 'string' ? id : null
}

function asDataRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

/**
 * Owner box whose `data.inlines[field]` points at `boxId`.
 * Walks past PropertyGroups; inlines live on the typed owner, not the group.
 */
function findInlineSlot(
  boxId: string,
  start: RenderNode
): { owner: RenderNode; field: string; index: number | null } | null {
  let current = start.parent ?? null
  const seen = new Set<string>()
  while (current && !seen.has(current.id)) {
    seen.add(current.id)
    const inlines = current.data?.inlines
    if (inlines) {
      for (const [field, ref] of Object.entries(inlines)) {
        if (typeof ref === 'string' && ref === boxId) {
          return { owner: current, field, index: null }
        }
        if (Array.isArray(ref)) {
          const index = ref.indexOf(boxId)
          if (index >= 0) return { owner: current, field, index }
        }
      }
    }
    current = current.parent ?? null
  }
  return null
}

function readInlineField(
  ownerData: Record<string, unknown>,
  field: string,
  index: number | null
): Record<string, unknown> | null {
  const fieldVal = ownerData[field]
  const item = index == null ? fieldVal : Array.isArray(fieldVal) ? fieldVal[index] : undefined
  return asDataRecord(item)
}

/**
 * Live typed animgraph object for a diagram box: handle.Data, or the nested
 * `$type` object in an ancestor handle's Data (via `data.inlines`).
 */
export function resolveLinkedAnimgraphData(
  node: RenderNode,
  registry: Map<string, AnimgraphNode>,
  allNodes?: Map<string, RenderNode>
): Record<string, unknown> | null {
  const handleId = handleIdOfBox(node)
  if (handleId) {
    const data = asDataRecord(registry.get(handleId)?.Data)
    if (data) return data
  }

  let current: RenderNode | null = node
  const seen = new Set<string>()
  while (current && !seen.has(current.id) && !handleIdOfBox(current)) {
    seen.add(current.id)
    const slot = findInlineSlot(current.id, current)
    if (slot) {
      const ownerData = resolveLinkedAnimgraphData(slot.owner, registry, allNodes)
      return ownerData ? readInlineField(ownerData, slot.field, slot.index) : null
    }
    current = current.parent ?? null
  }

  const fallbackId = String(node.data?.originalNodeId ?? node.id)
  return asDataRecord(registry.get(fallbackId)?.Data)
}

/** Handle whose Data tree contains this box (self or ancestor). */
export function resolveLinkedHandleId(
  node: RenderNode,
  registry: Map<string, AnimgraphNode>
): string | null {
  let current: RenderNode | null = node
  const seen = new Set<string>()
  while (current && !seen.has(current.id)) {
    seen.add(current.id)
    const id = handleIdOfBox(current)
    if (id && registry.has(id)) return id
    current = current.parent ?? null
  }
  const fallback = node.data?.originalNodeId
  if (typeof fallback === 'string' && registry.has(fallback)) return fallback
  if (registry.has(node.id)) return node.id
  return null
}

export function linkedDataTypeName(
  data: Record<string, unknown> | null | undefined,
  fallbackType: string
): string {
  return typeof data?.$type === 'string' ? data.$type : fallbackType
}

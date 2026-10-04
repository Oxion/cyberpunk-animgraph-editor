/**
 * Pin-array + handle field history ops (Details panel).
 * UI wiring stays in useNodeDetailsContext.
 */
import { getProjectionDef } from '../utils/projection/resolve'
import { NodeDefinitionRegistry } from '../utils/NodeDefinition'
import type { AnimgraphNode, AnimgraphObject } from '../utils/graph/animgraphTypes'
import { resolveHandleId } from '../utils/graph/diagramMaterialize'
import {
  applyFootprintsForHandleBoundNodes,
} from '../utils/graph/diagramNodeEdits'
import { isDiagramPortalNode } from '../utils/graph/DiagramConversion'
import {
  resolveLinkedAnimgraphData,
  resolveLinkedHandleId,
} from '../utils/graph/linkedAnimgraphData'
import {
  getHistoryForDiagram,
  graphHistoryState,
  handleDataRevision,
  setFlushPendingHandleFieldEdit,
} from './graphHistory'
import {
  refreshPinFootprints,
  reloadAllConnectionRenderers,
  updateActiveNodes,
} from './graphPaint'
import {
  bumpConnectionsRevision,
  ensureSelectionState,
  nodeSizeRef,
  selectedNodeRef,
} from './graphSession'
import { activeDiagramId, getRenderData } from './graphProject'
import { deleteConnection } from './graphWireRecord'
import type { DiagramConnection } from '../utils/graph/diagramTypes'
import { computed } from 'vue'

export function findIncomingPinConnection(
  diagramId: string,
  ownerBoxId: string,
  pinName: string
): DiagramConnection | null {
  const gd = getRenderData(diagramId)
  if (!gd) return null
  for (const c of gd.connections) {
    if (c.pinName !== pinName) continue
    if (c.to === ownerBoxId) return c
    const toNode = gd.allNodes.get(c.to)
    if (
      toNode &&
      isDiagramPortalNode(toNode) &&
      toNode.metadata?.originalTo === ownerBoxId &&
      (toNode.metadata?.pinName === pinName || !toNode.metadata?.pinName)
    ) {
      return c
    }
  }
  return null
}

export function removePinArraySlot(diagramId: string, inputName: string, index: number) {
  const gd = getRenderData(diagramId)
  const owner = ensureSelectionState(diagramId).selectedNode
  if (!gd || !owner || index < 0) return

  const pinName = `${inputName}[${index}]`
  const conn = findIncomingPinConnection(diagramId, owner.id, pinName)
  if (conn) {
    deleteConnection(diagramId, conn)
    notifySelectedHandleDataChanged()
    return
  }

  const handleId = resolveLinkedHandleId(owner, gd.handlesRegistry)
  const handle = handleId ? gd.handlesRegistry.get(handleId) : undefined
  if (!handle?.Data) return
  const ownerType = String(handle.Data.$type ?? owner.type)
  const nested = getProjectionDef(ownerType)?.extraPins?.find((p: { name: string }) => p.name === inputName)
  const undoKey = nested?.path[0] ?? inputName
  const before = cloneHandleFieldValue(handle.Data[undoKey])
  const handler = NodeDefinitionRegistry.getNodeInputHandler(ownerType, inputName)
  handler.delete(handle, index)
  const remaining = handle.Data[inputName]
  if (Array.isArray(remaining) && 'numInputs' in handle.Data) {
    handle.Data.numInputs = remaining.length
  }
  recordHandleFieldEdit(diagramId, undoKey, before, { immediate: true })
  notifySelectedHandleDataChanged()
  refreshPinFootprints(diagramId, [owner.id])
  reloadAllConnectionRenderers()
}

export function getPinInputArray(
  handle: AnimgraphNode,
  ownerType: string,
  inputName: string
): unknown[] | null {
  const nested = getProjectionDef(ownerType)?.extraPins?.find((p: { name: string }) => p.name === inputName)
  if (nested) {
    let cur: unknown = handle.Data
    for (const key of nested.path) {
      if (!cur || typeof cur !== 'object') return null
      cur = (cur as Record<string, unknown>)[key]
    }
    return Array.isArray(cur) ? cur : null
  }
  const raw = handle.Data?.[inputName]
  return Array.isArray(raw) ? raw : null
}

export function remapIncomingPinName(
  diagramId: string,
  ownerBoxId: string,
  fromPin: string,
  toPin: string
) {
  const diagramData = getRenderData(diagramId)
  if (!diagramData) return
  let changed = false
  for (const connection of diagramData.connections) {
    if (connection.pinName !== fromPin) continue
    if (connection.to === ownerBoxId) {
      connection.pinName = toPin
      changed = true
      continue
    }
    const toNode = diagramData.allNodes.get(connection.to)
    if (
      toNode &&
      isDiagramPortalNode(toNode) &&
      toNode.metadata?.originalTo === ownerBoxId
    ) {
      connection.pinName = toPin
      changed = true
      if (toNode.metadata?.pinName === fromPin) {
        toNode.metadata.pinName = toPin
      }
    }
  }
  if (changed) bumpConnectionsRevision(diagramId)
}

export function reorderPinArraySlot(
  diagramId: string,
  inputName: string,
  index: number,
  delta: -1 | 1
) {
  const gd = getRenderData(diagramId)
  const owner = ensureSelectionState(diagramId).selectedNode
  if (!gd || !owner || index < 0) return
  const other = index + delta
  if (other < 0) return

  const handleId = resolveLinkedHandleId(owner, gd.handlesRegistry)
  const handle = handleId ? gd.handlesRegistry.get(handleId) : undefined
  if (!handle?.Data) return
  const ownerType = String(handle.Data.$type ?? owner.type)
  const arr = getPinInputArray(handle, ownerType, inputName)
  if (!arr || other >= arr.length) return

  const nested = getProjectionDef(ownerType)?.extraPins?.find((p: { name: string }) => p.name === inputName)
  const undoKey = nested?.path[0] ?? inputName
  const before = cloneHandleFieldValue(handle.Data[undoKey])

  const tmp = arr[index]
  arr[index] = arr[other]
  arr[other] = tmp

  const pinA = `${inputName}[${index}]`
  const pinB = `${inputName}[${other}]`
  const pinTmp = `${inputName}[__reorder__]`
  remapIncomingPinName(diagramId, owner.id, pinA, pinTmp)
  remapIncomingPinName(diagramId, owner.id, pinB, pinA)
  remapIncomingPinName(diagramId, owner.id, pinTmp, pinB)

  const inlines = owner.data?.inlines
  if (inlines && Array.isArray(inlines[inputName])) {
    const list = inlines[inputName] as unknown[]
    if (index < list.length && other < list.length) {
      const t = list[index]
      list[index] = list[other]
      list[other] = t
    }
  }

  recordHandleFieldEdit(diagramId, undoKey, before, { immediate: true })
  notifySelectedHandleDataChanged()
  refreshPinFootprints(diagramId, [owner.id])
  reloadAllConnectionRenderers()
}

export function renamePinHandleId(
  diagramId: string,
  oldId: string,
  newId: string
): { ok: true } | { ok: false; reason: string } {
  const gd = getRenderData(diagramId)
  if (!gd) return { ok: false, reason: 'No graph loaded' }
  const next = newId.trim()
  if (!next || next === '-1' || next === '0') {
    return { ok: false, reason: 'Invalid HandleId' }
  }
  if (next === oldId) return { ok: true }
  if (gd.handlesRegistry.has(next)) {
    return { ok: false, reason: `HandleId '${next}' already exists` }
  }
  const handle = gd.handlesRegistry.get(oldId)
  if (!handle) return { ok: false, reason: `Handle '${oldId}' not found` }

  gd.handlesRegistry.delete(oldId)
  handle.HandleId = next
  gd.handlesRegistry.set(next, handle)

  for (const node of gd.allNodes.values()) {
    if (node.data?.originalNodeId === oldId) {
      node.data.originalNodeId = next
    }
  }

  const nodesToInit = gd.originalAnimgraph?.nodesToInit
  if (Array.isArray(nodesToInit)) {
    for (const ref of nodesToInit) {
      if (
        ref &&
        typeof ref === 'object' &&
        'HandleRefId' in ref &&
        String((ref as { HandleRefId: string }).HandleRefId) === oldId
      ) {
        ;(ref as { HandleRefId: string }).HandleRefId = next
      }
    }
  }

  refreshNodesBoundToHandle(diagramId, next)
  return { ok: true }
}

export const selectedHandleData = computed(() => {
  void handleDataRevision.value
  const diagramId = activeDiagramId.value
  const node = selectedNodeRef.value
  if (!diagramId || !node) return null
  const data = getRenderData(diagramId)
  if (!data) return null
  return resolveLinkedAnimgraphData(node, data.handlesRegistry, data.allNodes)
})

export function refreshNodesBoundToHandle(diagramId: string, handleId: string) {
  const data = getRenderData(diagramId)
  if (!data) return
  const ids = applyFootprintsForHandleBoundNodes(
    data,
    handleId,
    resolveLinkedHandleId
  )
  if (ids.length === 0) return
  const contentChangedIds = new Set(ids)
  updateActiveNodes(ids, { contentChangedIds })
  const sel = ensureSelectionState(diagramId).selectedNode
  if (sel && contentChangedIds.has(sel.id) && sel.size) {
    if (diagramId === activeDiagramId.value) {
      nodeSizeRef.value = { ...sel.size }
    }
  }
}

export function notifySelectedHandleDataChanged() {
  handleDataRevision.value++
  const diagramId = activeDiagramId.value
  const node = selectedNodeRef.value
  if (!diagramId || !node) return
  const data = getRenderData(diagramId)
  if (!data) return
  const handleId = resolveLinkedHandleId(node, data.handlesRegistry)
  if (handleId) scheduleHandleChromeRefresh(diagramId, handleId)
}

let pendingChromeDiagramId: string | null = null
let pendingChromeHandleId: string | null = null
let chromeRefreshRaf = 0

export function scheduleHandleChromeRefresh(diagramId: string, handleId: string) {
  pendingChromeDiagramId = diagramId
  pendingChromeHandleId = handleId
  if (chromeRefreshRaf) return
  chromeRefreshRaf = requestAnimationFrame(() => {
    chromeRefreshRaf = 0
    const id = pendingChromeDiagramId
    const handle = pendingChromeHandleId
    pendingChromeDiagramId = null
    pendingChromeHandleId = null
    if (id && handle) refreshNodesBoundToHandle(id, handle)
  })
}

export function cloneHandleFieldValue(value: unknown): unknown {
  if (value === undefined) return undefined
  if (value === null || typeof value !== 'object') return value
  return JSON.parse(JSON.stringify(value))
}

export function asEmbeddedHandleSnapshot(
  value: unknown
): { HandleId: string; Data: AnimgraphObject } | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const obj = value as { HandleId?: unknown; Data?: unknown }
  if (typeof obj.HandleId !== 'string' || !obj.Data || typeof obj.Data !== 'object') return null
  return { HandleId: obj.HandleId, Data: obj.Data as AnimgraphObject }
}

export function snapshotHandleField(key: string): unknown {
  const data = selectedHandleData.value
  if (!data || !(key in data)) return undefined
  const raw = data[key]
  const diagramId = activeDiagramId.value
  const registry = diagramId ? getRenderData(diagramId)?.handlesRegistry : undefined
  if (registry) {
    const id = resolveHandleId(raw, registry)
    const handle = id ? registry.get(id) : null
    if (handle?.Data) {
      return cloneHandleFieldValue({ HandleId: handle.HandleId, Data: handle.Data })
    }
  }
  return cloneHandleFieldValue(raw)
}

export function handleFieldValuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a === undefined || b === undefined) return a === b
  try {
    return JSON.stringify(a) === JSON.stringify(b)
  } catch {
    return false
  }
}

type PendingHandleFieldEdit = {
  diagramId: string
  boxId: string
  key: string
  before: unknown
  after: unknown
  timer: ReturnType<typeof setTimeout> | null
}

let pendingHandleFieldEdit: PendingHandleFieldEdit | null = null
const HANDLE_FIELD_EDIT_COALESCE_MS = 400

export function applyHandleFieldValue(
  diagramId: string,
  boxId: string,
  key: string,
  value: unknown
) {
  applyHandleFieldPatch(diagramId, boxId, { [key]: value })
}

export function applyHandleFieldPatch(
  diagramId: string,
  boxId: string,
  patch: Record<string, unknown>
) {
  const renderData = getRenderData(diagramId)
  if (!renderData) return
  const { handlesRegistry, allNodes } = renderData
  const node = allNodes.get(boxId)
  const data = node
    ? resolveLinkedAnimgraphData(node, handlesRegistry, allNodes)
    : (handlesRegistry.get(boxId)?.Data as Record<string, unknown> | undefined)
  if (!data) return
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) {
      delete data[key]
      continue
    }
    const wrapped = asEmbeddedHandleSnapshot(value)
    if (wrapped) {
      const dataClone = cloneHandleFieldValue(wrapped.Data) as AnimgraphObject
      const existing = handlesRegistry.get(wrapped.HandleId)
      if (existing) existing.Data = dataClone
      else handlesRegistry.set(wrapped.HandleId, { HandleId: wrapped.HandleId, Data: dataClone })
      data[key] = { HandleRefId: wrapped.HandleId }
      continue
    }
    data[key] = cloneHandleFieldValue(value) as unknown
  }
  handleDataRevision.value++
  const handleId =
    (node && resolveLinkedHandleId(node, handlesRegistry)) || boxId
  refreshNodesBoundToHandle(diagramId, handleId)
}

export function pushHandleFieldHistory(
  diagramId: string,
  boxId: string,
  key: string,
  before: unknown,
  after: unknown
) {
  if (graphHistoryState.isApplying || handleFieldValuesEqual(before, after)) return

  getHistoryForDiagram(diagramId).push({
    label: `Edit ${key}`,
    undo: () => {
      graphHistoryState.isApplying = true
      try {
        applyHandleFieldValue(diagramId, boxId, key, before)
      } finally {
        graphHistoryState.isApplying = false
      }
    },
    redo: () => {
      graphHistoryState.isApplying = true
      try {
        applyHandleFieldValue(diagramId, boxId, key, after)
      } finally {
        graphHistoryState.isApplying = false
      }
    },
  })
}

export function flushPendingHandleFieldEditImpl() {
  const pending = pendingHandleFieldEdit
  if (!pending) return
  if (pending.timer) {
    clearTimeout(pending.timer)
    pending.timer = null
  }
  pendingHandleFieldEdit = null
  pushHandleFieldHistory(
    pending.diagramId,
    pending.boxId,
    pending.key,
    pending.before,
    pending.after
  )
}

setFlushPendingHandleFieldEdit(flushPendingHandleFieldEditImpl)

export function snapshotHandleFields(keys: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key of keys) {
    out[key] = snapshotHandleField(key)
  }
  return out
}

export function recordHandleFieldsEdit(
  diagramId: string,
  keys: readonly string[],
  before: Record<string, unknown>
) {
  if (graphHistoryState.isApplying) return
  const node = ensureSelectionState(diagramId).selectedNode
  if (!node || !getRenderData(diagramId)) return
  if (!selectedHandleData.value) return
  flushPendingHandleFieldEditImpl()
  const boxId = node.id
  const after = snapshotHandleFields(keys)
  if (handleFieldValuesEqual(before, after)) return
  getHistoryForDiagram(diagramId).push({
    label: `Edit ${keys.join(', ')}`,
    undo: () => {
      graphHistoryState.isApplying = true
      try {
        applyHandleFieldPatch(diagramId, boxId, before)
      } finally {
        graphHistoryState.isApplying = false
      }
    },
    redo: () => {
      graphHistoryState.isApplying = true
      try {
        applyHandleFieldPatch(diagramId, boxId, after)
      } finally {
        graphHistoryState.isApplying = false
      }
    },
  })
}

export function recordHandleFieldEdit(
  diagramId: string,
  key: string,
  before: unknown,
  options?: { immediate?: boolean }
) {
  if (graphHistoryState.isApplying) return
  const node = ensureSelectionState(diagramId).selectedNode
  if (!node || !getRenderData(diagramId)) return
  if (!selectedHandleData.value) return
  const boxId = node.id
  const after = snapshotHandleField(key)

  if (
    pendingHandleFieldEdit &&
    (pendingHandleFieldEdit.diagramId !== diagramId ||
      pendingHandleFieldEdit.boxId !== boxId ||
      pendingHandleFieldEdit.key !== key)
  ) {
    flushPendingHandleFieldEditImpl()
  }

  if (
    pendingHandleFieldEdit &&
    pendingHandleFieldEdit.diagramId === diagramId &&
    pendingHandleFieldEdit.boxId === boxId &&
    pendingHandleFieldEdit.key === key
  ) {
    pendingHandleFieldEdit.after = after
  } else {
    pendingHandleFieldEdit = {
      diagramId,
      boxId,
      key,
      before,
      after,
      timer: null,
    }
  }

  if (options?.immediate) {
    flushPendingHandleFieldEditImpl()
    return
  }

  if (pendingHandleFieldEdit.timer) clearTimeout(pendingHandleFieldEdit.timer)
  pendingHandleFieldEdit.timer = setTimeout(() => {
    flushPendingHandleFieldEditImpl()
  }, HANDLE_FIELD_EDIT_COALESCE_MS)
}

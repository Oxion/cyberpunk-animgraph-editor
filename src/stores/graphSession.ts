import { computed, reactive, watch } from 'vue'
import { getConnectionKey } from '../utils/graph/diagramModel'
import type { DiagramConnection, RenderNode } from '../utils/graph/diagramTypes'
import { activeDiagramId, getRenderData } from './graphProject'

/** Per-diagram selection + connection revision. No global diagramDataRef. */

export type DiagramSelectionState = {
  selectedNode: RenderNode | null
  selectedNodeIds: string[]
  selectedIncomingConnections: Set<string>
  nodePosition: { x: number; y: number }
  nodeSize: { width: number; height: number }
  nodeDescription: string
  connectionsRevision: number
}

function emptySelection(): DiagramSelectionState {
  return {
    selectedNode: null,
    selectedNodeIds: [],
    selectedIncomingConnections: new Set(),
    nodePosition: { x: 0, y: 0 },
    nodeSize: { width: 120, height: 80 },
    nodeDescription: '',
    connectionsRevision: 0,
  }
}

/** diagramId → selection/revision state */
export const selectionByDiagram = reactive(new Map<string, DiagramSelectionState>())

export function ensureSelectionState(diagramId: string): DiagramSelectionState {
  let s = selectionByDiagram.get(diagramId)
  if (!s) {
    s = emptySelection()
    selectionByDiagram.set(diagramId, s)
  }
  return s
}

export function clearSelectionState(diagramId?: string) {
  if (diagramId) {
    selectionByDiagram.delete(diagramId)
    return
  }
  selectionByDiagram.clear()
}

function activeSelection(): DiagramSelectionState | null {
  const id = activeDiagramId.value
  return id ? ensureSelectionState(id) : null
}

/** Active-diagram convenience refs for Details / legacy UI bindings. */
export const selectedNodeRef = computed({
  get: () => activeSelection()?.selectedNode ?? null,
  set: (node: RenderNode | null) => {
    const id = activeDiagramId.value
    if (!id) return
    const s = ensureSelectionState(id)
    s.selectedNode = node
  },
})

export const selectedNodeIdsRef = computed({
  get: () => activeSelection()?.selectedNodeIds ?? [],
  set: (ids: string[]) => {
    const id = activeDiagramId.value
    if (!id) return
    ensureSelectionState(id).selectedNodeIds = ids
  },
})

export const selectedIncomingConnectionsRef = computed({
  get: () => activeSelection()?.selectedIncomingConnections ?? new Set<string>(),
  set: (set: Set<string>) => {
    const id = activeDiagramId.value
    if (!id) return
    ensureSelectionState(id).selectedIncomingConnections = set
  },
})

export const nodePositionRef = computed({
  get: () => activeSelection()?.nodePosition ?? { x: 0, y: 0 },
  set: (v: { x: number; y: number }) => {
    const id = activeDiagramId.value
    if (!id) return
    ensureSelectionState(id).nodePosition = v
  },
})

export const nodeSizeRef = computed({
  get: () => activeSelection()?.nodeSize ?? { width: 120, height: 80 },
  set: (v: { width: number; height: number }) => {
    const id = activeDiagramId.value
    if (!id) return
    ensureSelectionState(id).nodeSize = v
  },
})

export const nodeDescriptionRef = computed({
  get: () => activeSelection()?.nodeDescription ?? '',
  set: (v: string) => {
    const id = activeDiagramId.value
    if (!id) return
    ensureSelectionState(id).nodeDescription = v
  },
})

/**
 * Bump when diagram connections change in-place for a given diagram.
 * Drives selectedNodeConnectionsComputed — callers must not manually sync panel caches.
 */
export function bumpConnectionsRevision(diagramId: string) {
  ensureSelectionState(diagramId).connectionsRevision++
}

/** @deprecated Prefer bumpConnectionsRevision(diagramId). Uses activeDiagramId. */
export function bumpConnectionsRevisionActive() {
  const id = activeDiagramId.value
  if (id) bumpConnectionsRevision(id)
}

export const connectionsRevisionRef = computed(() => activeSelection()?.connectionsRevision ?? 0)

export function getNodeConnections(
  diagramId: string,
  nodeId: string
): {
  incoming: DiagramConnection[]
  outgoing: DiagramConnection[]
} {
  const incoming: DiagramConnection[] = []
  const outgoing: DiagramConnection[] = []
  const data = getRenderData(diagramId)

  for (const connection of data?.connections ?? []) {
    if (connection.to === nodeId) incoming.push(connection)
    if (connection.from === nodeId) outgoing.push(connection)
  }

  return { incoming, outgoing }
}

/**
 * Derived connection lists for the active diagram selection.
 */
export const selectedNodeConnectionsComputed = computed(() => {
  const id = activeDiagramId.value
  if (!id) return null
  void ensureSelectionState(id).connectionsRevision
  const nodeId = ensureSelectionState(id).selectedNode?.id
  if (!nodeId || !getRenderData(id)) return null
  return getNodeConnections(id, nodeId)
})

/** Sync selection state for a diagram from a primary id (+ multi-select ids). */
export function applyGraphSelection(
  diagramId: string,
  nodeId: string | null,
  allNodeIds?: string[]
) {
  const s = ensureSelectionState(diagramId)
  const data = getRenderData(diagramId)
  s.selectedNodeIds = allNodeIds ?? (nodeId ? [nodeId] : [])

  if (nodeId && data) {
    const node = data.allNodes.get(nodeId)
    if (node) {
      s.selectedNode = node
      const incoming = getNodeConnections(diagramId, nodeId).incoming
      s.selectedIncomingConnections = new Set(incoming.map((conn) => getConnectionKey(conn)))
      s.nodeDescription = node.description || ''
      s.nodeSize = { width: node.size.width, height: node.size.height }
      s.nodePosition = { x: node.position.x, y: node.position.y }
      return
    }
  }

  s.selectedNode = null
  s.selectedNodeIds = []
  s.selectedIncomingConnections = new Set()
  s.nodeDescription = ''
}

/** Drop arrange-inputs checks that no longer exist on the selected node (active diagram). */
watch(
  selectedNodeConnectionsComputed,
  (conns) => {
    const id = activeDiagramId.value
    if (!id) return
    const s = ensureSelectionState(id)
    if (!conns) {
      if (s.selectedIncomingConnections.size > 0) {
        s.selectedIncomingConnections = new Set()
      }
      return
    }
    const valid = new Set(conns.incoming.map((c) => getConnectionKey(c)))
    let changed = false
    const next = new Set<string>()
    for (const key of s.selectedIncomingConnections) {
      if (valid.has(key)) next.add(key)
      else changed = true
    }
    if (changed) s.selectedIncomingConnections = next
  },
  { flush: 'sync' }
)

let selectionClearedHandler: (() => void) | null = null

/** Optional view/renderer clear when the selected node disappears from the tree. */
export function setSelectionClearedHandler(fn: (() => void) | null) {
  selectionClearedHandler = fn
}

export function refreshSelectionAfterNodeTreeChange(diagramId: string, onCleared?: () => void) {
  const s = ensureSelectionState(diagramId)
  const data = getRenderData(diagramId)
  if (!s.selectedNode || !data) return
  if (!data.allNodes.has(s.selectedNode.id)) {
    applyGraphSelection(diagramId, null)
    ;(onCleared ?? selectionClearedHandler)?.()
  }
}

/** Clear all selection when project resets. */
watch(
  () => activeDiagramId.value,
  () => {
    // Selection is per-diagram; switching active just rebinds computed getters.
  }
)

import { computed, ref } from 'vue'
import { getConnectionKey } from '../utils/graph/diagramModel'
import { applyDiagramNodeDescription } from '../utils/graph/diagramNodeEdits'
import type { DiagramConnection, RenderNode } from '../utils/graph/diagramTypes'
import type { CommandContext } from '../utils/graph/commands/execute'
import {
  GraphHistory,
  restoreConnectionDeleteSnapshot,
  type ConnectionDeleteSnapshot,
} from '../utils/graph/GraphHistory'
import { LayoutGesture, PositionGesture } from '../utils/graph/commands'
import {
  getActiveDiagramRenderer,
  mainDiagramRenderer as graphRenderer,
} from './diagramRenderers'
import {
  broadcastAddConnection,
  collectWireRenderers,
  paintAddedNodes,
  refreshPinFootprints,
  reloadAllConnectionRenderers,
  syncConnectionRenderAfterConnect,
  updateActiveNodes,
  updateGraphBounds,
} from './graphPaint'
import {
  activeDiagramId,
  getRenderData,
  requireActiveDiagramId,
} from './graphProject'
import {
  bumpConnectionsRevision,
  ensureSelectionState,
  nodeDescriptionRef,
  nodePositionRef,
  nodeSizeRef,
  refreshSelectionAfterNodeTreeChange,
} from './graphSession'
import { createConnectionCore, deleteConnectionCore } from './graphWiring'
import { markProjectDirty } from './projectDirty'
import { moveToolState, resizeToolState } from './tools'

/** Mutable flag — use this object so importers can assign `.isApplying`. */
export const graphHistoryState = {
  isApplying: false,
}

const historyByDiagram = new Map<string, GraphHistory>()

function createCommandContextForDiagram(diagramId: string): CommandContext {
  return {
    getGraphData: () => getRenderData(diagramId),
    onNodesPatched: (nodeIds) => {
      graphHistoryState.isApplying = true
      try {
        refreshLayoutAfterHistory(diagramId, nodeIds)
        handleDataRevision.value++
      } finally {
        graphHistoryState.isApplying = false
      }
    },
    onNodesRemoved: ({ nodeIds, parentRefreshIds }) => {
      graphHistoryState.isApplying = true
      try {
        collectWireRenderers().forEach((renderer) => {
          for (const id of nodeIds) {
            renderer.removeNode(id)
          }
        })
        if (parentRefreshIds.length > 0) {
          refreshPinFootprints(diagramId, parentRefreshIds)
        }
        updateGraphBounds(diagramId)
        refreshSelectionAfterNodeTreeChange(diagramId)
      } finally {
        graphHistoryState.isApplying = false
      }
    },
    onNodesAdded: ({ nodeIds, parentRefreshIds }) => {
      graphHistoryState.isApplying = true
      try {
        paintAddedNodes(diagramId, { nodeIds, parentRefreshIds, activeOnly: false })
        refreshSelectionAfterNodeTreeChange(diagramId)
      } finally {
        graphHistoryState.isApplying = false
      }
    },
    onConnectionsReload: () => {
      graphHistoryState.isApplying = true
      try {
        reloadAllConnectionRenderers()
        bumpConnectionsRevision(diagramId)
        handleDataRevision.value++
      } finally {
        graphHistoryState.isApplying = false
      }
    },
  }
}

export function getHistoryForDiagram(diagramId: string): GraphHistory {
  let h = historyByDiagram.get(diagramId)
  if (!h) {
    h = new GraphHistory()
    h.setCallbacks({
      onChange: () => {
        historyRevisionRef.value++
      },
      onPush: () => {
        markProjectDirty()
      },
    })
    h.setCommandContext(createCommandContextForDiagram(diagramId))
    historyByDiagram.set(diagramId, h)
  }
  return h
}

/** @deprecated Prefer getHistoryForDiagram(diagramId). Uses active diagram. */
export const graphHistory = new Proxy({} as GraphHistory, {
  get(_target, prop, receiver) {
    const h = getHistoryForDiagram(requireActiveDiagramId())
    const val = Reflect.get(h, prop, receiver)
    return typeof val === 'function' ? (val as (...args: unknown[]) => unknown).bind(h) : val
  },
})

export const historyRevisionRef = ref(0)
/** Bumps so selectedHandleData recomputes after in-place Data mutations. */
export const handleDataRevision = ref(0)

export const canUndo = computed(() => {
  historyRevisionRef.value
  const id = activeDiagramId.value
  if (!id) return false
  return getHistoryForDiagram(id).canUndo()
})

export const canRedo = computed(() => {
  historyRevisionRef.value
  const id = activeDiagramId.value
  if (!id) return false
  return getHistoryForDiagram(id).canRedo()
})

export const undoTitle = computed(() => {
  historyRevisionRef.value
  const id = activeDiagramId.value
  if (!id) return 'Undo (Ctrl+Z)'
  const label = getHistoryForDiagram(id).undoLabel()
  return label ? `Undo: ${label} (Ctrl+Z)` : 'Undo (Ctrl+Z)'
})

export const redoTitle = computed(() => {
  historyRevisionRef.value
  const id = activeDiagramId.value
  if (!id) return 'Redo (Ctrl+Y)'
  const label = getHistoryForDiagram(id).redoLabel()
  return label ? `Redo: ${label} (Ctrl+Y)` : 'Redo (Ctrl+Y)'
})

let flushPendingHandleFieldEdit = () => {}

export function setFlushPendingHandleFieldEdit(fn: () => void) {
  flushPendingHandleFieldEdit = fn
}

export type GraphHistoryDeps = {
  /** Cancel in-progress G/S modal sessions. Returns true if a modal session was cancelled. */
  flushModalToolSessions: () => boolean
}

let deps: GraphHistoryDeps | null = null
let historyRuntimeInstalled = false

/** Install command context once (App boot). Prefer over bindGraphHistoryDeps. */
export function installGraphHistoryRuntime(next: GraphHistoryDeps) {
  deps = next
  if (historyRuntimeInstalled) return
  historyRuntimeInstalled = true

  // Per-diagram command contexts are wired in getHistoryForDiagram().
}

/** @deprecated Use installGraphHistoryRuntime */
export function bindGraphHistoryDeps(next: GraphHistoryDeps) {
  installGraphHistoryRuntime(next)
}

export const refreshLayoutAfterHistory = (diagramId: string, nodeIds: string[]) => {
  if (nodeIds.length > 0) {
    refreshPinFootprints(diagramId, nodeIds)
  }
  const data = getRenderData(diagramId)
  const s = ensureSelectionState(diagramId)
  if (s.selectedNode && data?.allNodes.has(s.selectedNode.id)) {
    const node = data.allNodes.get(s.selectedNode.id)!
    s.selectedNode.position = { ...node.position }
    s.selectedNode.size = { ...node.size }
    if (diagramId === activeDiagramId.value) {
      nodePositionRef.value = { ...node.position }
      nodeSizeRef.value = { ...node.size }
    }
  }
  updateGraphBounds(diagramId)
}

const positionGesture = new PositionGesture()
const layoutGesture = new LayoutGesture()
let currentGestureDiagramId: string | null = null

export const beginPositionCapture = (diagramId: string, label = 'Move nodes') => {
  if (positionGesture.isOpen) {
    commitPositionCapture(currentGestureDiagramId ?? diagramId)
  }
  currentGestureDiagramId = diagramId
  positionGesture.begin(label)
  getActiveDiagramRenderer()?.beginInteractiveEdit()
}

export const trackPositionBeforeChange = (node: RenderNode) => {
  positionGesture.track(node)
}

export const commitPositionCapture = (diagramId: string, label?: string) => {
  const id = diagramId || currentGestureDiagramId
  const data = id ? getRenderData(id) : null
  if (!positionGesture.isOpen || !id || !data || graphHistoryState.isApplying) {
    positionGesture.cancel()
    currentGestureDiagramId = null
    getActiveDiagramRenderer()?.endInteractiveEdit()
    return
  }
  getActiveDiagramRenderer()?.endInteractiveEdit()
  const command = positionGesture.end(data, label)
  if (command) getHistoryForDiagram(id).pushCommand(command)
  currentGestureDiagramId = null
}

export const cancelPositionCapture = (diagramId: string) => {
  const id = diagramId || currentGestureDiagramId
  const data = id ? getRenderData(id) : null
  if (!data) {
    positionGesture.cancel()
    currentGestureDiagramId = null
    getActiveDiagramRenderer()?.cancelInteractiveEdit()
    return
  }
  const restoredIds = positionGesture.restore(data)
  getActiveDiagramRenderer()?.cancelInteractiveEdit()
  currentGestureDiagramId = null
  if (restoredIds.length > 0) {
    updateActiveNodes(restoredIds)
  }
  if (id) {
    const s = ensureSelectionState(id)
    if (s.selectedNode && data.allNodes.has(s.selectedNode.id)) {
      const node = data.allNodes.get(s.selectedNode.id)!
      if (id === activeDiagramId.value) {
        nodePositionRef.value = { ...node.position }
      }
    }
  }
}

export const beginLayoutCapture = (diagramId: string, label = 'Resize node') => {
  if (layoutGesture.isOpen) {
    commitLayoutCapture(currentGestureDiagramId ?? diagramId)
  }
  currentGestureDiagramId = diagramId
  layoutGesture.begin(label)
  getActiveDiagramRenderer()?.beginInteractiveEdit()
}

export const trackLayoutBeforeChange = (node: RenderNode) => {
  layoutGesture.track(node)
}

export const commitLayoutCapture = (diagramId: string, label?: string) => {
  const id = diagramId || currentGestureDiagramId
  const data = id ? getRenderData(id) : null
  if (!layoutGesture.isOpen || !id || !data || graphHistoryState.isApplying) {
    layoutGesture.cancel()
    currentGestureDiagramId = null
    getActiveDiagramRenderer()?.endInteractiveEdit()
    return
  }
  getActiveDiagramRenderer()?.endInteractiveEdit()
  const command = layoutGesture.end(data, label)
  if (command) getHistoryForDiagram(id).pushCommand(command)
  currentGestureDiagramId = null
}

export const cancelLayoutCapture = (diagramId: string) => {
  const id = diagramId || currentGestureDiagramId
  const data = id ? getRenderData(id) : null
  if (!data) {
    layoutGesture.cancel()
    currentGestureDiagramId = null
    getActiveDiagramRenderer()?.cancelInteractiveEdit()
    return
  }
  const restoredIds = layoutGesture.restore(data)
  getActiveDiagramRenderer()?.cancelInteractiveEdit()
  currentGestureDiagramId = null
  if (restoredIds.length > 0) {
    updateActiveNodes(restoredIds)
  }
  if (id) {
    const s = ensureSelectionState(id)
    if (s.selectedNode && data.allNodes.has(s.selectedNode.id)) {
      const node = data.allNodes.get(s.selectedNode.id)!
      if (id === activeDiagramId.value) {
        nodePositionRef.value = { ...node.position }
        nodeSizeRef.value = { ...node.size }
      }
    }
  }
}

/** Commit any open move gesture (e.g. arrow-key hold) before undo/other actions. */
export const flushOpenGestures = () => {
  if (deps?.flushModalToolSessions()) {
    return
  }
  if (moveToolState.session || resizeToolState.session) {
    return
  }
  const id = currentGestureDiagramId ?? activeDiagramId.value
  if (!id) return
  if (positionGesture.isOpen) commitPositionCapture(id)
  if (layoutGesture.isOpen) commitLayoutCapture(id)
}

export const runWithPositionHistory = (diagramId: string, label: string, action: () => void) => {
  if (!getRenderData(diagramId) || graphHistoryState.isApplying) {
    action()
    return
  }
  beginPositionCapture(diagramId, label)
  action()
  commitPositionCapture(diagramId, label)
}

export const runWithLayoutHistory = (diagramId: string, label: string, action: () => void) => {
  if (!getRenderData(diagramId) || graphHistoryState.isApplying) {
    action()
    return
  }
  beginLayoutCapture(diagramId, label)
  action()
  commitLayoutCapture(diagramId, label)
}

export const pushDescriptionHistory = (
  diagramId: string,
  nodeId: string,
  before: string,
  after: string
) => {
  if (graphHistoryState.isApplying || before === after) return

  const applyDescription = (description: string) => {
    const data = getRenderData(diagramId)
    const node = data?.allNodes.get(nodeId)
    if (!node || !data) return
    applyDiagramNodeDescription(node, description, data)
    const s = ensureSelectionState(diagramId)
    if (s.selectedNode?.id === nodeId) {
      s.selectedNode.description = description
      if (diagramId === activeDiagramId.value) {
        nodeDescriptionRef.value = description
      }
      if (node.size) {
        s.selectedNode.size = { ...node.size }
        if (diagramId === activeDiagramId.value) {
          nodeSizeRef.value = { ...node.size }
        }
      }
    }
    updateActiveNodes([nodeId], { contentChangedIds: new Set([nodeId]) })
  }

  getHistoryForDiagram(diagramId).push({
    label: 'Edit description',
    undo: () => {
      graphHistoryState.isApplying = true
      try {
        applyDescription(before)
      } finally {
        graphHistoryState.isApplying = false
      }
    },
    redo: () => {
      graphHistoryState.isApplying = true
      try {
        applyDescription(after)
      } finally {
        graphHistoryState.isApplying = false
      }
    },
  })
}

export const pushConnectionCreateHistory = (
  diagramId: string,
  connection: DiagramConnection
) => {
  if (graphHistoryState.isApplying || !getRenderData(diagramId)) return

  const snapshot = { ...connection }
  const connectionKey = getConnectionKey(snapshot)

  const remove = () => {
    const data = getRenderData(diagramId)
    if (!data) return
    const live = data.connections.find((conn) => getConnectionKey(conn) === connectionKey)
    if (live) {
      deleteConnectionCore(diagramId, live)
    } else {
      const index = data.connections.findIndex((conn) => getConnectionKey(conn) === connectionKey)
      if (index >= 0) data.connections.splice(index, 1)
      graphRenderer.value?.deleteConnection(snapshot)
    }
    bumpConnectionsRevision(diagramId)
  }

  const add = () => {
    const data = getRenderData(diagramId)
    if (!data) return
    if (!data.connections.some((conn) => getConnectionKey(conn) === connectionKey)) {
      const restored = createConnectionCore(
        diagramId,
        snapshot.from,
        snapshot.to,
        snapshot.pinName ?? ''
      )
      if (restored.connection) {
        syncConnectionRenderAfterConnect(restored, snapshot.to)
      } else {
        data.connections.push({ ...snapshot })
        broadcastAddConnection(snapshot)
      }
    } else {
      broadcastAddConnection(snapshot)
    }
    bumpConnectionsRevision(diagramId)
  }

  getHistoryForDiagram(diagramId).push({
    label: 'Create connection',
    undo: () => {
      graphHistoryState.isApplying = true
      try {
        remove()
      } finally {
        graphHistoryState.isApplying = false
      }
    },
    redo: () => {
      graphHistoryState.isApplying = true
      try {
        add()
      } finally {
        graphHistoryState.isApplying = false
      }
    },
  })
}

export const pushConnectionDeleteHistory = (
  diagramId: string,
  deletedConnection: DiagramConnection,
  beforeSnapshot: ConnectionDeleteSnapshot
) => {
  if (graphHistoryState.isApplying) return

  getHistoryForDiagram(diagramId).push({
    label: 'Delete connection',
    undo: () => {
      const data = getRenderData(diagramId)
      if (!data) return
      graphHistoryState.isApplying = true
      try {
        restoreConnectionDeleteSnapshot(data, beforeSnapshot)
        const dirtyBoxIds: string[] = [...(beforeSnapshot.hostBoxIds ?? [])]
        for (const [id, node] of data.allNodes) {
          if (node.data?.originalNodeId === beforeSnapshot.targetHandleId) {
            dirtyBoxIds.push(id)
          }
        }
        for (const placement of beforeSnapshot.portalPlacements ?? []) {
          const portal = data.allNodes.get(placement.node.id)
          if (!portal) continue
          collectWireRenderers().forEach((r) => r.addNode(portal))
        }
        refreshPinFootprints(diagramId, dirtyBoxIds)
        reloadAllConnectionRenderers()
        bumpConnectionsRevision(diagramId)
      } finally {
        graphHistoryState.isApplying = false
      }
    },
    redo: () => {
      graphHistoryState.isApplying = true
      try {
        deleteConnectionCore(diagramId, deletedConnection)
      } finally {
        graphHistoryState.isApplying = false
      }
    },
  })
}

export const undoGraphAction = async () => {
  flushOpenGestures()
  flushPendingHandleFieldEdit()
  const history = getHistoryForDiagram(requireActiveDiagramId())
  if (!history.canUndo()) return
  await history.undo()
}

export const redoGraphAction = async () => {
  flushOpenGestures()
  flushPendingHandleFieldEdit()
  const history = getHistoryForDiagram(requireActiveDiagramId())
  if (!history.canRedo()) return
  await history.redo()
}

export const clearGraphHistory = (diagramId?: string) => {
  flushOpenGestures()
  flushPendingHandleFieldEdit()
  if (diagramId) {
    getHistoryForDiagram(diagramId).clear()
    historyByDiagram.delete(diagramId)
    return
  }
  for (const h of historyByDiagram.values()) {
    h.clear()
  }
  historyByDiagram.clear()
}

export function isPositionGestureOpen() {
  return positionGesture.isOpen
}

export function isLayoutGestureOpen() {
  return layoutGesture.isOpen
}

/** Cancel an open position capture without restoring node positions (error-path cleanup). */
export function discardOpenPositionGesture() {
  if (!positionGesture.isOpen) return
  positionGesture.cancel()
  currentGestureDiagramId = null
  getActiveDiagramRenderer()?.endInteractiveEdit()
}

import { computed, nextTick, ref, type ComputedRef } from 'vue'
import {
  closeQuickLensWindows,
  openLensWindow,
  openSmRingWindow,
  windows,
} from '../stores/appWindows'
import {
  activeBodyView,
  activeBodyViewId,
  bodyViewRoot,
  bodyViews,
  currentView,
  graphViewStackRef,
  isDiagramRootBody,
  jumpToIndex,
  openParallelBody,
  pushEntry,
  pushView,
  setViewSelection,
} from '../stores/bodyViews'
import { bodyViewTop } from '../types/DiagramBodyView'
import {
  getActiveDiagramRenderer,
  mainDiagramRenderer as graphRenderer,
  syncBodyRendererActivity,
  waitForDiagramViewRenderer,
} from '../stores/diagramRenderers'
import { activeDiagramId, getRenderData, requireActiveDiagramId } from '../stores/graphProject'
import {
  applyGraphSelection,
  selectedNodeRef,
} from '../stores/graphSession'
import {
  getStateOverviewTitleText,
  isDiagramOverviewLeaf,
  isStateMachineDiagramRoot,
  isStateOverviewLeaf,
  resolveStateMachineInfoNode,
} from '../utils/graph/DiagramConversion'
import type { RenderNode } from '../utils/graph/diagramTypes'
import type { GraphViewEntry } from '../types/GraphView'
import { PixiGraphRenderer } from '../utils/PixiGraphRenderer'
import { createGraphScopeView } from '../utils/views/viewRegistry'
import { collectCollapsedScopePath } from '../utils/views/viewScopePath'

export const nodeSearchId = ref('')
export const panToNodeMessage = ref<{ text: string; type: string } | null>(null)

export const selectedStateMachineInfo = computed(() => {
  const diagramId = activeDiagramId.value
  const data = diagramId ? getRenderData(diagramId) : null
  if (!data || !selectedNodeRef.value) return null
  return resolveStateMachineInfoNode(selectedNodeRef.value, data.allNodes)
})

/** Optional host — only needed if SM info must be overridden from App. */
export type GraphNavigationHost = {
  selectedStateMachineInfo?: ComputedRef<{ id: string } | null>
}

let host: GraphNavigationHost | null = null
function requireHost(): GraphNavigationHost {
  return host ?? {}
}

function smInfo() {
  return requireHost().selectedStateMachineInfo?.value ?? selectedStateMachineInfo.value
}

export const panToNode = async (diagramId: string, nodeIdOverride?: string) => {
  const nodeId = (nodeIdOverride ?? nodeSearchId.value).trim()
  if (!getRenderData(diagramId) || !nodeId) {
    showPanToNodeMessage('Please enter a node ID', 'error')
    return
  }

  const success = await navigateToNode(diagramId, nodeId)
  if (success) {
    showPanToNodeMessage(`Navigated to node: ${nodeId}`, 'success')
  } else {
    showPanToNodeMessage(`Node '${nodeId}' not found or unreachable`, 'error')
  }
}

export const panToNodeWithZoom = async (
  diagramId: string,
  nodeIdOverride?: string
) => {
  const nodeId = (nodeIdOverride ?? nodeSearchId.value).trim()
  if (!getRenderData(diagramId) || !nodeId) {
    showPanToNodeMessage('Please enter a node ID', 'error')
    return
  }

  const success = await navigateToNode(diagramId, nodeId, { zoom: 2.0 })
  if (success) {
    showPanToNodeMessage(`Navigated to node: ${nodeId} (with zoom)`, 'success')
  } else {
    showPanToNodeMessage(`Node '${nodeId}' not found or unreachable`, 'error')
  }
}

export const showPanToNodeMessage = (text: string, type: string) => {
  panToNodeMessage.value = { text, type }
  setTimeout(() => {
    panToNodeMessage.value = null
  }, 3000)
}

export const openSmRingFromSelection = () => {
  const info = smInfo()
  if (!info) return
  openSmRingWindow(
    {
      stateMachineNodeId: info.id,
      rootLabel: info.id,
      projectDiagramId: requireActiveDiagramId(),
    },
    windows.value.length
  )
}

export const openLensFromSelection = (host: 'body' | 'window' = 'body') => {
  if (!selectedNodeRef.value) return
  const diagramId = requireActiveDiagramId()
  openLensForNode(diagramId, selectedNodeRef.value, host)
}

export const openLensWindowFromSelection = (event: MouseEvent) => {
  if (!selectedNodeRef.value) return
  const diagramId = requireActiveDiagramId()
  openLensForNode(diagramId, selectedNodeRef.value, 'window', {
    hideScopeRoot: !event.shiftKey,
  })
}

export const openLensForNode = (
  diagramId: string,
  node: RenderNode,
  host: 'body' | 'window' = 'body',
  options?: {
    hideScopeRoot?: boolean
    preview?: boolean
    maximized?: boolean
  }
): GraphViewEntry | null => {
  const resolvedHost = host
  if (!getRenderData(diagramId)) return null
  const { label, stateMachineNodeId, hideScopeRoot } = graphScopePresentation(
    diagramId,
    node,
    options?.hideScopeRoot
  )

  if (resolvedHost === 'window') {
    openLensWindow(
      {
        rootNodeId: node.id,
        rootLabel: label,
        hideScopeRoot,
        projectDiagramId: diagramId,
      },
      {
        preview: options?.preview,
        maximized: options?.maximized,
        offsetIndex: windows.value.length,
      }
    )
    return null
  }

  const entry = createGraphScopeView({
    scopeRootId: node.id,
    label,
    stateMachineNodeId,
    hideScopeRoot,
    projectDiagramId: diagramId,
  })
  pushView(entry)
  return entry
}

export const navigateToNode = async (
  diagramId: string,
  nodeId: string,
  options?: { zoom?: number }
): Promise<boolean> => {
  const data = getRenderData(diagramId)
  if (!data) return false
  const node = data.allNodes.get(nodeId)
  if (!node) return false

  activeBodyViewId.value = diagramId

  const desiredPath = collectCollapsedScopePath(node)
  const stackEntries = graphViewStackRef.value
  const currentScopeIds: string[] = []
  for (const entry of stackEntries) {
    if (entry.kind === 'main') continue
    if (entry.kind === 'graph-scope' && entry.payload.scopeRootId) {
      currentScopeIds.push(entry.payload.scopeRootId)
      continue
    }
    break
  }

  let common = 0
  while (
    common < desiredPath.length &&
    common < currentScopeIds.length &&
    desiredPath[common]!.id === currentScopeIds[common]
  ) {
    common += 1
  }

  if (stackEntries.length - 1 > common || currentScopeIds.length > common) {
    jumpToIndex(common, diagramId)
  }

  for (let i = common; i < desiredPath.length; i++) {
    const scopeNode = desiredPath[i]!
    const entry = openLensForNode(diagramId, scopeNode, 'body')
    if (!entry) return false
    const renderer = await waitForDiagramViewRenderer(entry.id)
    if (!renderer) return false
  }

  await nextTick()
  syncBodyRendererActivity()

  let active = getActiveDiagramRenderer()
  if (!active && currentView.value.kind !== 'main') {
    active = await waitForDiagramViewRenderer(currentView.value.id)
  }
  if (!active && currentView.value.kind === 'main') {
    active = (graphRenderer.value as PixiGraphRenderer | null) ?? null
    if (active) await active._initPromise
  }
  if (!active) return false

  if (typeof options?.zoom === 'number') {
    active.setZoom(options.zoom)
  }

  const panned = active.panToDiagramNodeWithId(nodeId)
  if (!panned) return false

  active.setSelectedNodes([nodeId], nodeId, true)
  setViewSelection(currentView.value.id, { nodeIds: [nodeId], primaryNodeId: nodeId })
  return true
}

export const onBodyViewAction = (bodyId: string, actionId: string) => {
  const body = bodyViews.value.find((view) => view.id === bodyId)
  if (!body) return
  const top = bodyViewTop(body)
  if (
    actionId === 'open-sm-ring' &&
    top.kind === 'graph-scope' &&
    top.payload.stateMachineNodeId
  ) {
    openSmRingWindow(
      {
        stateMachineNodeId: top.payload.stateMachineNodeId,
        rootLabel: top.payload.stateMachineNodeId,
        projectDiagramId: top.projectDiagramId,
      },
      { offsetIndex: windows.value.length }
    )
  }
}

export const handleBodyViewNodeSelect = (
  viewId: string,
  nodeIds: string[],
  primaryNodeId: string | null
) => {
  setViewSelection(viewId, { nodeIds, primaryNodeId })
}

export const lensLabelForNode = (node: RenderNode): string => {
  const shortType = node.type.replace(/^animAnimNode_/, '').replace(/^anim/, '')
  return `${node.id} · ${shortType}`
}

export const graphScopePresentation = (
  diagramId: string,
  node: RenderNode,
  hideScopeRootOverride?: boolean
): {
  label: string
  stateMachineNodeId: string | undefined
  hideScopeRoot: boolean
} => {
  const data = getRenderData(diagramId)
  const isSmRoot = isStateMachineDiagramRoot(node)
  const smInfoNode = data ? resolveStateMachineInfoNode(node, data.allNodes) : null
  const stateMachineNodeId =
    smInfoNode?.id ??
    (isSmRoot ? (node.metadata?.stateMachineNodeId as string | undefined) : undefined)

  const label = isSmRoot
    ? `${stateMachineNodeId ?? node.id} · State Machine`
    : isStateOverviewLeaf(node)
      ? `${getStateOverviewTitleText(node)} · State`
      : lensLabelForNode(node)

  return {
    label,
    stateMachineNodeId,
    hideScopeRoot:
      hideScopeRootOverride ?? (isSmRoot || isDiagramOverviewLeaf(node)),
  }
}

export const openQuickLensWindow = (diagramId: string, nodeId: string) => {
  const node = getRenderData(diagramId)?.allNodes.get(nodeId)
  if (!node) return
  closeQuickLensWindows()
  openLensWindow(
    {
      rootNodeId: nodeId,
      rootLabel: lensLabelForNode(node),
      quickLens: true,
      projectDiagramId: diagramId,
    },
    windows.value.length
  )
}

export const handleMainGraphNodeSelect = (
  nodeIds: string[],
  primaryNodeId: string | null,
  event?: MouseEvent
) => {
  const body = activeBodyView.value
  const rootEntryId =
    isDiagramRootBody(body) ? bodyViewRoot(body).id : 'main'

  if (primaryNodeId && event?.ctrlKey && event?.altKey) {
    openQuickLensWindow(requireActiveDiagramId(), primaryNodeId)
    setViewSelection(rootEntryId, { nodeIds, primaryNodeId })
    return
  }

  const prevPrimaryId = selectedNodeRef.value?.id ?? null
  if (primaryNodeId !== prevPrimaryId) {
    closeQuickLensWindows()
  }

  setViewSelection(rootEntryId, { nodeIds, primaryNodeId })
}

export const handleBodyOpenScope = (diagramId: string, nodeId: string) => {
  const node = getRenderData(diagramId)?.allNodes.get(nodeId)
  if (!node) return
  openLensForNode(diagramId, node, 'body')
}

export const pushScopeIntoBody = (diagramId: string, bodyId: string, diagramNodeId: string) => {
  const diagramNode = getRenderData(diagramId)?.allNodes.get(diagramNodeId)
  if (!diagramNode) return
  const { label, stateMachineNodeId, hideScopeRoot } = graphScopePresentation(diagramId, diagramNode)
  const entry = createGraphScopeView({
    scopeRootId: diagramNode.id,
    label,
    stateMachineNodeId,
    hideScopeRoot,
    projectDiagramId: diagramId,
  })
  pushEntry(entry, bodyId)
}

export const openParallelScopeBody = (diagramId: string, diagramNodeId: string) => {
  const diagramNode = getRenderData(diagramId)?.allNodes.get(diagramNodeId)
  if (!diagramNode) return

  const { label, stateMachineNodeId, hideScopeRoot } = graphScopePresentation(diagramId, diagramNode)

  const entry = createGraphScopeView({
    scopeRootId: diagramNode.id,
    label,
    stateMachineNodeId,
    hideScopeRoot,
    projectDiagramId: diagramId,
  })
  openParallelBody(entry, { preview: true })
}

void openParallelScopeBody

export const handleWindowLensNodeSelect = (diagramId: string, nodeIds: string[], primaryNodeId: string | null) => {
  applyGraphSelection(diagramId, primaryNodeId, nodeIds)
}

export const handleNodeSelect = (nodeId: string | null, allNodeIds?: string[]) => {
  const ids = allNodeIds ?? (nodeId ? [nodeId] : [])
  setViewSelection(currentView.value.id, { nodeIds: ids, primaryNodeId: nodeId })
}

export function bindGraphNavigation(next: GraphNavigationHost = {}) {
  host = next
}

export function useGraphNavigation() {
  return {
    panToNode,
    panToNodeWithZoom,
    openSmRingFromSelection,
    openLensFromSelection,
    openLensWindowFromSelection,
    openLensForNode,
    navigateToNode,
    onBodyViewAction,
    handleMainGraphNodeSelect,
    handleBodyViewNodeSelect,
    handleBodyOpenScope,
    pushScopeIntoBody,
    openParallelScopeBody,
    handleWindowLensNodeSelect,
    handleNodeSelect,
  }
}

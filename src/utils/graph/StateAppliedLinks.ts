import type { AnimgraphNode } from './animgraphTypes'
import type { RenderData, RenderNode } from './diagramTypes'
import { isSmInputChainOverviewLeaf } from './DiagramConversion'
import {
  DIAGRAM_FRAME_CHILD_PAD,
  DIAGRAM_FRAME_DEFAULT_HEIGHT,
  DIAGRAM_FRAME_DEFAULT_WIDTH,
  fitDiagramFrameToChildren,
} from './diagramFrameNodes'
import { DIAGRAM_NODE_TYPE_GROUP } from './diagramNodeTypes'
import {
  appendChild,
  emptyChildSlots,
  getChildSlot,
  walkSubtree,
} from './nodeChildSlots'
import { resolveLiveStateIndex, resolveStateSMOwnerDiagramNode } from './smStateSlot'
import {
  getGlobalTransitionsForState,
  getIncomingTransitionsForState,
  getSmPropertyGroup,
  getStateDisplayName,
  getStateNodesFromSm,
  getTransitionsForState,
  parseTargetStateIndex,
} from './StateMachineDetailLayout'

export interface StateAppliedLinkSection {
  id: string
  label: string
  nodes: RenderNode[]
}

const SECTION_ID_SUFFIX = Math.random().toString(36).slice(2, 10)
export const CONDITIONAL_ENTRIES_SECTION_ID = `conditionalEntries:${SECTION_ID_SUFFIX}`
export const GLOBAL_TRANSITIONS_SECTION_ID = `globalTransitions:${SECTION_ID_SUFFIX}`
export const INCOMING_TRANSITIONS_SECTION_ID = `incomingTransitions:${SECTION_ID_SUFFIX}`
export const OUTGOING_TRANSITIONS_SECTION_ID = `outgoingTransitions:${SECTION_ID_SUFFIX}`

function getSmConditionalEntryRoots(
  sm: RenderNode,
  allNodes: Map<string, RenderNode>
): RenderNode[] {
  const group = getSmPropertyGroup(sm, 'conditionalEntries', allNodes)
  if (!group) return []
  return getChildSlot(group)
    .map((child) => {
      const handleId = child.data?.originalNodeId as string | undefined
      return handleId ? allNodes.get(handleId) ?? child : child
    })
    .filter((n): n is RenderNode => !!n)
}

function getConditionalEntriesForState(
  sm: RenderNode,
  stateIndex: number,
  allNodes: Map<string, RenderNode>,
  handlesRegistry: Map<string, AnimgraphNode>
): RenderNode[] {
  return getSmConditionalEntryRoots(sm, allNodes).filter((entry) => {
    const target = parseTargetStateIndex(entry, handlesRegistry)
    return target !== null && target === stateIndex
  })
}

/** Prefer collapsed chain overview leaf for a root handle id within an SM section group. */
export function resolveSmChainOverviewLeaf(
  rootId: string,
  sectionPropertyName: string,
  sm: RenderNode,
  allNodes: Map<string, RenderNode>
): RenderNode {
  const section = getSmPropertyGroup(sm, sectionPropertyName, allNodes)
  const fromSection = section
    ? getChildSlot(section).find(
        (child) =>
          isSmInputChainOverviewLeaf(child) &&
        (child.data?.originalNodeId as string | undefined) === rootId
      )
    : undefined
  if (fromSection) return fromSection

  for (const node of allNodes.values()) {
    if (
      isSmInputChainOverviewLeaf(node) &&
      (node.data?.originalNodeId as string | undefined) === rootId
    ) {
      return node
    }
  }

  return allNodes.get(rootId) ?? ({ id: rootId } as RenderNode)
}

function mapRootsToOverviewLeaves(
  roots: RenderNode[],
  sectionPropertyName: string,
  sm: RenderNode,
  allNodes: Map<string, RenderNode>
): RenderNode[] {
  const seen = new Set<string>()
  const leaves: RenderNode[] = []
  roots.forEach((root) => {
    const leaf = resolveSmChainOverviewLeaf(root.id, sectionPropertyName, sm, allNodes)
    if (!leaf?.id || seen.has(leaf.id)) return
    seen.add(leaf.id)
    leaves.push(leaf)
  })
  return leaves
}

function sortByPriority(nodes: RenderNode[]): RenderNode[] {
  return [...nodes].sort((a, b) => {
    const pa = typeof a.metadata?.priority === 'number' ? a.metadata.priority : 0
    const pb = typeof b.metadata?.priority === 'number' ? b.metadata.priority : 0
    if (pa !== pb) return pa - pb
    return a.id.localeCompare(b.id)
  })
}

function sortStatesByIndex(states: RenderNode[], graphData: RenderData): RenderNode[] {
  return [...states].sort((a, b) => {
    const ia = resolveLiveStateIndex(graphData, a) ?? 0
    const ib = resolveLiveStateIndex(graphData, b) ?? 0
    if (ia !== ib) return ia - ib
    return a.id.localeCompare(b.id)
  })
}

function formatStateIndexLabel(graphData: RenderData, state: RenderNode): string | number {
  return resolveLiveStateIndex(graphData, state) ?? '?'
}

/**
 * Split incoming transition roots into columns by source state
 * (state whose outTransitionIndices include the transition).
 */
function buildIncomingSectionsBySourceState(
  sm: RenderNode,
  targetState: RenderNode,
  incomingRoots: RenderNode[],
  graphData: RenderData
): StateAppliedLinkSection[] {
  const targetIndex = formatStateIndexLabel(graphData, targetState)
  const targetName = getStateDisplayName(targetState, graphData.handlesRegistry)
  const shortTarget = targetName.length > 18 ? `${targetName.slice(0, 16)}…` : targetName
  const targetLabel = `[${targetIndex}] ${shortTarget}`

  if (incomingRoots.length === 0) return []

  const incomingById = new Map(incomingRoots.map((root) => [root.id, root]))
  const claimed = new Set<string>()
  const sections: StateAppliedLinkSection[] = []

  for (const source of sortStatesByIndex(getStateNodesFromSm(sm, graphData.allNodes), graphData)) {
    const fromSource = getTransitionsForState(sm, source, graphData).filter((t) =>
      incomingById.has(t.id)
    )
    if (fromSource.length === 0) continue

    fromSource.forEach((t) => claimed.add(t.id))
    const sourceIndex = formatStateIndexLabel(graphData, source)
    const sourceName = getStateDisplayName(source, graphData.handlesRegistry)
    const shortSource = sourceName.length > 18 ? `${sourceName.slice(0, 16)}…` : sourceName

    sections.push({
      id: `incomingFrom:${source.id}`,
      label: `[${sourceIndex}] ${shortSource} → ${targetLabel}`,
      nodes: sortByPriority(
        mapRootsToOverviewLeaves(fromSource, 'transitions', sm, graphData.allNodes)
      ),
    })
  }

  const orphans = incomingRoots.filter((root) => !claimed.has(root.id))
  if (orphans.length > 0) {
    sections.push({
      id: 'incomingTransitions',
      label: `? → ${targetLabel}`,
      nodes: sortByPriority(
        mapRootsToOverviewLeaves(orphans, 'transitions', sm, graphData.allNodes)
      ),
    })
  }

  return sections
}

/** Collect CE / global / incoming / outgoing link overview leaves for a state. */
function collectStateAppliedLinkSections(
  stateDiagramNode: RenderNode,
  diagramData: RenderData
): StateAppliedLinkSection[] | null {
  const stateIndex = resolveLiveStateIndex(diagramData, stateDiagramNode)
  if (stateIndex === null) return null

  const smDiagramNode = resolveStateSMOwnerDiagramNode(stateDiagramNode, diagramData)
  if (!smDiagramNode) return null

  // Ensure stateIds present for target resolution (diagram-promoted SM).
  if (!Array.isArray(smDiagramNode.metadata?.stateIds)) {
    const states = getStateNodesFromSm(smDiagramNode, diagramData.allNodes)
    if (states.length === 0) return null
  }

  const ceRoots = getConditionalEntriesForState(
    smDiagramNode,
    stateIndex,
    diagramData.allNodes,
    diagramData.handlesRegistry
  )
  const globalRoots = getGlobalTransitionsForState(
    smDiagramNode,
    stateIndex,
    diagramData.allNodes,
    diagramData.handlesRegistry
  )
  const incomingRoots = getIncomingTransitionsForState(
    smDiagramNode,
    stateIndex,
    diagramData.allNodes,
    diagramData.handlesRegistry
  )
  const outgoingRoots = getTransitionsForState(smDiagramNode, stateDiagramNode, diagramData)

  return [
    {
      id: CONDITIONAL_ENTRIES_SECTION_ID,
      label: 'conditionalEntries',
      nodes: sortByPriority(
        mapRootsToOverviewLeaves(ceRoots, 'conditionalEntries', smDiagramNode, diagramData.allNodes)
      ),
    },
    {
      id: GLOBAL_TRANSITIONS_SECTION_ID,
      label: 'globalTransitions → state',
      nodes: sortByPriority(
        mapRootsToOverviewLeaves(globalRoots, 'globalTransitions', smDiagramNode, diagramData.allNodes)
      ),
    },
    ...buildIncomingSectionsBySourceState(smDiagramNode, stateDiagramNode, incomingRoots, diagramData),
    {
      id: OUTGOING_TRANSITIONS_SECTION_ID,
      label: 'transitions out',
      nodes: sortByPriority(
        mapRootsToOverviewLeaves(outgoingRoots, 'transitions', smDiagramNode, diagramData.allNodes)
      ),
    },
  ]
}

/** Column layout: one Group root per section with overview leaves as children. */
function layoutStateAppliedLinkColumns(
  sections: StateAppliedLinkSection[],
  options: {
    originX?: number
    originY?: number
    columnGap?: number
    rowGap?: number
  } = {}
): RenderNode[] {
  const originX = options.originX ?? 24
  const originY = options.originY ?? 24
  const columnGap = options.columnGap ?? 28
  const rowGap = options.rowGap ?? 16

  const columnGroupDiagramNodes: RenderNode[] = []
  const childPad = DIAGRAM_FRAME_CHILD_PAD

  let cursorX = originX
  sections.forEach((section) => {
    const group = makeColumnGroupDiagramNode(
      section.id, 
      `${section.label} (${section.nodes.length})`, 
      cursorX, 
      originY
    )

    let localY = childPad.top
    section.nodes.forEach((node) => {
      const child = cloneNodeAsChild(node, childPad.left, localY)
      appendChild(group, child)
      localY += (child.size?.height ?? 76) + rowGap
    })
    fitDiagramFrameToChildren(group)

    columnGroupDiagramNodes.push(group)

    cursorX += group.size.width + columnGap
  })

  return columnGroupDiagramNodes
}

function makeColumnGroupDiagramNode(id: string, label: string, x: number, y: number): RenderNode {
  const width = DIAGRAM_FRAME_DEFAULT_WIDTH
  const height = DIAGRAM_FRAME_DEFAULT_HEIGHT
  return {
    id,
    type: DIAGRAM_NODE_TYPE_GROUP,
    data: {},
    metadata: { label, stateAppliedLinksColumn: true },
    position: { x, y },
    size: { width, height },
    bounds: { x, y, width, height },
    childSlots: emptyChildSlots(),
    visible: true,
    opacity: 1,
    scale: 1,
    rotation: 0,
    zIndex: 0,
    isContainer: true,
    isGroup: true,
    layout: 'vertical',
  }
}

function cloneNodeAsChild(source: RenderNode, localX: number, localY: number): RenderNode {
  const width = source.size?.width ?? 220
  const height = source.size?.height ?? 76
  return {
    ...source,
    data: { ...source.data },
    position: { x: localX, y: localY },
    size: { width, height },
    bounds: { x: localX, y: localY, width, height },
    metadata: { ...source.metadata },
    childSlots: emptyChildSlots(),
    parent: undefined,
    parentSlot: undefined,
  }
}

function indexSubtree(root: RenderNode, allNodes: Map<string, RenderNode>): void {
  walkSubtree(root, (node) => {
    allNodes.set(node.id, node)
  })
}

/** @TODO check if this function is duplicate */
function boundsFromDiagramNodes(diagramNodes: RenderNode[]): RenderData['bounds'] {
  if (diagramNodes.length === 0) return { x: 0, y: 0, width: 0, height: 0 }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  diagramNodes.forEach((diagramNode) => {
    const { x, y, width, height } = diagramNode.bounds
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x + width)
    maxY = Math.max(maxY, y + height)
  })
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

/**
 * Build a standalone DiagramData for the state applied-links view:
 * column Groups with overview leaves as children (shared animgraph refs).
 */
export function buildStateAppliedLinksDiagramData(
  diagramData: RenderData,
  stateDiagramNodeId: string
): RenderData | null {
  const stateDiagramNode = diagramData.allNodes.get(stateDiagramNodeId)
  if (!stateDiagramNode) return null

  const sections = collectStateAppliedLinkSections(stateDiagramNode, diagramData)
  if (!sections) return null

  const columnGroupDiagramNodes = layoutStateAppliedLinkColumns(sections)
  const allNodes = new Map<string, RenderNode>()
  columnGroupDiagramNodes.forEach((group) => indexSubtree(group, allNodes))

  const nodeTypes = new Set<string>()
  allNodes.forEach((node) => nodeTypes.add(node.type))

  return {
    rootNodes: columnGroupDiagramNodes,
    allNodes,
    connections: [],
    metadata: {},
    nodeTypes,
    bounds: boundsFromDiagramNodes(columnGroupDiagramNodes),
    handlesRegistry: diagramData.handlesRegistry,
    originalAnimgraph: diagramData.originalAnimgraph,
    floatingHandleIds: diagramData.floatingHandleIds,
  }
}

export function findOutgoingTransitionsSectionGroupDiagramNode(diagramData: RenderData): RenderNode | undefined {
  return diagramData.rootNodes.find((node) => node.id === OUTGOING_TRANSITIONS_SECTION_ID)
}

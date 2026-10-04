/**
 * Parser for Cyberpunk 2077 animgraph JSON files
 */

import {
  runDirectChildrenLayout,
  type DirectChildrenLayoutMode,
  type LayoutDebugContainer,
  throwDirectChildrenLayoutError,
} from './graph/DirectChildrenLayout'
import type { ElkDirection, ElkLayeredEdgeInput } from './graph/ElkGraphLayout'
import { DIAGRAM_CONNECTION_TYPE_INPUT } from './graph/diagramConnectionTypes'
import {
  finalizeDiagramConversion,
  isDiagramOverviewLeaf,
  isStateMachineDiagramRoot,
  logPortalMaterializeDebug,
  materializeCrossViewPortals,
  placeIncomingPortalsLeftOfTargets,
  layoutStatesGroupsWithPortals,
} from './graph/DiagramConversion'
import { applyDiagramNodeFootprints, resolveNodeFootprint } from './graph/nodeFootprint'
import { nodeUsesRowComposition } from './graph/NodeRowModel'
import { getWorldPosition } from './graph/DiagramGeometry'
import {
  appendChild,
  emptyChildSlots,
  forEachDirectChild,
  getChildSlot,
  DEFAULT_CHILD_SLOT,
} from './graph/nodeChildSlots'
import {
  collectFloatingHandleIdsForSave,
  collectHandlesRegistryForSave,
  registryFromSavedHandles,
} from './graph/floatingHandles'
import { materializeDiagram, snapshotPropertyGroups, type DiagramMaterializeResult } from './graph/diagramMaterialize'
import type {
  AnimgraphData,
  AnimgraphNode,
} from './graph/animgraphTypes'
import type { AnimgraphVisualizerData, DiagramConnection, RenderData, RenderNode, SerializedRenderNode } from './graph/diagramTypes'
import { getConnectionKey } from './graph/diagramModel'

export interface ParsedNode {
  id: string
  type: string
  data: any
  /** Handle ids listed on this node's contain fields (not pin-nested). */
  children: string[]
  parents: string[]
  /** Diagram groups: contain-owned handles plus pin-DAG nested into that group. */
  childrenByProperty: Record<string, string[]>
  parentsByProperty: Record<string, string[]>
}

export interface ParsedData {
  nodes: ParsedNode[]
  connections: DiagramConnection[]
  metadata: Record<string, any>
  nodeTypes: Set<string>
  /** Handle walked from animGraph.rootNode, if present. */
  rootHandleId?: string | null
  /** Registry handles not reached from rootNode (detached aux, unused nodes). */
  floatingHandleIds?: Set<string>
}

/** Type-safe interfaces for hierarchical layout (parser-internal / legacy). */
export interface NodeSize {
  width: number
  height: number
}

export interface NodePosition {
  x: number
  y: number
}

export interface LayoutOptions {
  horizontalSpacing: number
  verticalSpacing: number
  startX: number
  startY: number
  containerPadding: number
  groupSpacing: number
  maxDepth: number
}

export interface PropertyGroupHierarchy {
  propertyName: string
  nodes: NodeHierarchy[]
  size: NodeSize
  position: NodePosition
}

export interface NodeHierarchy {
  id: string
  type: string
  totalChildren: number
  propertyGroups: Record<string, PropertyGroupHierarchy>
  size: NodeSize
  position: NodePosition
  depth: number
  tempPosition?: NodePosition
}

interface ChildrenLayoutResult {
  totalWidth: number
  maxHeight: number
  positions: Array<{ x: number; y: number }>
  debugContainers?: LayoutDebugContainer[]
}

export interface AnimgraphParserOptions {
  /** Layout for direct render children when parsing animgraph (uplifted edges). */
  directChildrenLayout?: DirectChildrenLayoutMode
}

export class AnimgraphParser {
  // private nodeRegistry: Map<string, AnimgraphNode>
  private static readonly STATE_MACHINE_TYPE = 'animAnimNode_StateMachine'

  constructor(private readonly options: AnimgraphParserOptions = {}) {
    // this.nodeRegistry = new Map()
  }

  /**
   * Parse animgraph JSON data into DOM-like structure for rendering
   * @param data - Raw JSON data containing nodes with HandleId
   * @returns Render data with hierarchical structure
   */
  async parseForRender(data: AnimgraphData): Promise<RenderData> {
    console.log('AnimgraphParser.parseForRender() called with:', data)

    if (!data || !data.nodesToInit) {
      console.error('Invalid animgraph data: missing nodesToInit')
      throw new Error('Invalid animgraph data: missing nodesToInit')
    }

    console.log('Building node registry...')
    const registry = this.buildHandlesRegistry(data)
    console.log('Node registry built with', registry.size, 'nodes')

    console.log('Unwrapping animgraph nodes...')
    this.unwrapAnimgraphNodes(data)

    const diagram = materializeDiagram(data, registry)
    const renderData = await this.convertToRenderStructure(diagram, registry, data)
    
    console.log('Render data created:', renderData)
    return renderData
  }

  /**
   * Load AnimgraphVisualizerData (from JSON export or other sources)
   * @param data - AnimgraphVisualizerData
   * @returns Render data with hierarchical structure
   */
  async loadAnimgraphVisualizerData(data: AnimgraphVisualizerData): Promise<RenderData> {
    console.log('AnimgraphParser.loadAnimgraphVisualizerData() called with:', data)

    if (!data || !data.nodes || !data.connections) {
      console.error('Invalid render data: missing nodes or connections')
      throw new Error('Invalid render data: missing nodes or connections')
    }

    if (!data.handlesRegistry) {
      throw new Error('Invalid render data: missing handlesRegistry')
    }

    const registry = registryFromSavedHandles(data.handlesRegistry)
    const floatingHandleIds = new Set(
      (data.floatingHandleIds ?? []).map(String).filter((id) => registry.has(id))
    )
    // Ensure stubs only (idempotent if already unwrapped)
    this.unwrapAnimgraphNodes(data.originalAnimgraph)

    // Convert nodes array to Map
    const allNodesMap = new Map<string, any>()
    data.nodes.forEach((node: any) => {
      allNodesMap.set(node.id, node)
    })

    // Convert nodeTypes from array to Set
    const nodeTypesSet = new Set(data.nodeTypes || [])

    // Restore full node structure and parent-child relationships
    this.restoreNodeStructure(allNodesMap)

    // Restore rootNodes from rootNodeIds
    const rootNodes = data.rootNodeIds.map((id: string) => allNodesMap.get(id)).filter(Boolean)

    const normalizedRenderData: RenderData = {
      rootNodes: rootNodes,
      allNodes: allNodesMap,
      connections: data.connections,
      metadata: data.metadata,
      nodeTypes: nodeTypesSet,
      bounds: data.bounds,
      handlesRegistry: registry,
      originalAnimgraph: data.originalAnimgraph,
      floatingHandleIds,
    }

    materializeCrossViewPortals(normalizedRenderData)
    applyDiagramNodeFootprints(normalizedRenderData)
    placeIncomingPortalsLeftOfTargets(normalizedRenderData)
    applyDiagramNodeFootprints(normalizedRenderData)
    await layoutStatesGroupsWithPortals(normalizedRenderData)
    logPortalMaterializeDebug(normalizedRenderData, 'portal-materialize:load')

    console.log('Render data loaded:', normalizedRenderData)
    return normalizedRenderData
  }

  /**
   * Restore full node structure from exported data
   * @param allNodes - Map of all nodes by ID
   */
  private restoreNodeStructure(allNodes: Map<string, any>) {
    allNodes.forEach((node) => {
      const rawSlots: Record<string, any[]> =
        node.childSlots && typeof node.childSlots === 'object'
          ? node.childSlots
          : {}
      const restored: Record<string, RenderNode[]> = emptyChildSlots()
      for (const [slot, refs] of Object.entries(rawSlots)) {
        if (!Array.isArray(refs)) continue
        restored[slot] = refs.reduce((acc: RenderNode[], childRef: any) => {
          const childId = typeof childRef === 'string' ? childRef : childRef.id
          const childNode = allNodes.get(childId)
          if (childNode) {
            childNode.parent = node
            childNode.parentSlot = slot
            acc.push(childNode)
          }
          return acc
        }, [])
      }
      node.childSlots = restored
    })
  }

  serializeRenderData(renderData: RenderData): AnimgraphVisualizerData {
    // Convert allNodes Map to array (more efficient than object)
    const allNodesArray: SerializedRenderNode[] = []
    renderData.allNodes.forEach((node) => {
      allNodesArray.push(this._serializeRenderNode(node))
    })
    
    // Convert nodeTypes Set to array
    const nodeTypesArray = Array.from(renderData.nodeTypes)
    
    // Create root node IDs only (not full objects to avoid duplication)
    const rootNodeIds = renderData.rootNodes.map(node => node.id)

    return {
      rootNodeIds: rootNodeIds, // Just IDs instead of full objects
      nodes: allNodesArray, // Array instead of object
      connections: renderData.connections,
      metadata: renderData.metadata,
      nodeTypes: nodeTypesArray,
      bounds: renderData.bounds,
      originalAnimgraph: JSON.parse(JSON.stringify(renderData.originalAnimgraph)),
      handlesRegistry: collectHandlesRegistryForSave(renderData),
      floatingHandleIds: collectFloatingHandleIdsForSave(renderData),
    }
  }
  
  private _serializeRenderNode(node: RenderNode, depth = 0): SerializedRenderNode {
    // Prevent excessive recursion depth
    if (depth > 50) {
      console.warn('Maximum recursion depth reached for node:', node.id)
      throw new Error('Maximum recursion depth reached for node: ' + node.id)
    }
    
    const childSlots: Record<string, { id: string; type: string }[]> = {}
    for (const [slot, kids] of Object.entries(node.childSlots ?? {})) {
      if (!kids?.length) continue
      childSlots[slot] = kids.map((child) => ({ id: child.id, type: child.type }))
    }

    // Create a minimal clean copy without circular references
    const cleanNode: SerializedRenderNode = {
      id: node.id,
      type: node.type,
      data: node.data,
      position: node.position,
      size: node.size,
      childSlots,
      parentSlot: node.parentSlot,
      description: node.description,
      // Skip parent reference to avoid circular structure
      metadata: node.metadata,
      bounds: node.bounds,
      isContainer: node.isContainer,
      isGroup: node.isGroup,
      groupType: node.groupType,
      zIndex: node.zIndex,
      color: node.color,
      backgroundColor: node.backgroundColor,
      borderColor: node.borderColor,
      borderWidth: node.borderWidth,
      borderRadius: node.borderRadius,
      visible: node.visible,
      opacity: node.opacity,
      scale: node.scale,
      rotation: node.rotation
    }
    
    if (node.isGroup) {
      cleanNode.layout = node.layout
      cleanNode.spacing = node.spacing
      cleanNode.padding = node.padding
    }
    
    return cleanNode
  }

  /**
   * Extract metadata from animgraph data
   * @param data - Raw animgraph data
   * @returns Metadata object
   */
  private extractMetadata(data: AnimgraphData): Record<string, any> {
    const metadata: Record<string, any> = {}

    // Extract basic info
    if (data.Name) metadata.name = data.Name
    if (data.Description) metadata.description = data.Description
    if (data.Version) metadata.version = data.Version

    // Extract node count
    if (data.nodesToInit) {
      metadata.totalNodes = data.nodesToInit.length
    }

    // Extract file info
    metadata.parsedAt = new Date().toISOString()
    metadata.parserVersion = '3.0.0'

    return metadata
  }

  /**
   * Get node connections
   * @param data - Parsed data
   * @param nodeId - Node ID to get connections for
   * @returns Object with parent and child connections
   */
  getNodeConnections(data: ParsedData, nodeId: string): { parents: DiagramConnection[], children: DiagramConnection[] } {
    const parents = data.connections.filter(conn => conn.to === nodeId)
    const children = data.connections.filter(conn => conn.from === nodeId)

    return { parents, children }
  }

  /**
   * Convert materialized diagram tree to laid-out render data.
   */
  private async convertToRenderStructure(
    diagram: DiagramMaterializeResult,
    registry: Map<string, AnimgraphNode>,
    originalAnimgraph?: any
  ): Promise<RenderData> {
    console.log('Converting to render structure...')

    const { rootNodes, allNodes } = diagram
    for (const root of rootNodes) {
      this.rewriteStateMachineDiagrams(root, allNodes)
    }

    const connections = diagram.connections.filter(
      (c) => allNodes.has(c.from) && allNodes.has(c.to)
    )
    const renderData: RenderData = {
      rootNodes,
      allNodes,
      connections,
      metadata: this.extractMetadata(originalAnimgraph ?? {}),
      nodeTypes: diagram.nodeTypes,
      bounds: { x: 0, y: 0, width: 0, height: 0 },
      handlesRegistry: registry,
      originalAnimgraph,
      floatingHandleIds: diagram.floatingHandleIds,
    }

    finalizeDiagramConversion(renderData)
    applyDiagramNodeFootprints(renderData)

    // Calculate layout for all nodes (uses diagram SM/state edges from finalize)
    await this.calculateRenderLayout(renderData, rootNodes)
    placeIncomingPortalsLeftOfTargets(renderData)
    applyDiagramNodeFootprints(renderData)
    await layoutStatesGroupsWithPortals(renderData)
    logPortalMaterializeDebug(renderData, 'portal-materialize:parse')
    
    // Calculate overall bounds
    const bounds = this.calculateRenderBounds(rootNodes)
    
    renderData.bounds = bounds

    console.log('Render structure created with', allNodes.size, 'nodes')
    return renderData
  }

  /**
   * SM overview is a diagram rewrite of already-placed PropertyGroups.
   * Nested state internals stay as materialized contain trees.
   */
  private rewriteStateMachineDiagrams(
    node: RenderNode,
    allNodes: Map<string, RenderNode>
  ): void {
    forEachDirectChild(node, (child) => {
      this.rewriteStateMachineDiagrams(child, allNodes)
    })
    if (node.type === AnimgraphParser.STATE_MACHINE_TYPE) {
      this.rewriteStateMachineDiagram(node, allNodes)
    }
  }

  private rewriteStateMachineDiagram(
    renderNode: RenderNode,
    allNodes: Map<string, RenderNode>
  ): void {
    const sections = snapshotPropertyGroups(renderNode)
    const idsOf = (propertyName: string): string[] =>
      (sections.get(propertyName) ?? []).map((child) =>
        String(child.data?.originalNodeId ?? child.id)
      )

    const stateIds = idsOf('states')
    const allTransitionIds = idsOf('transitions')
    const allGlobalTransitionIds = idsOf('globalTransitions')
    const conditionalEntryIds = idsOf('conditionalEntries')
    const anyStateInterpolatorIds = idsOf('anyStateInterpolator')
    const frozenStateIds = idsOf('frozenState')

    renderNode.metadata = {
      ...renderNode.metadata,
      stateIds: [...stateIds],
      stateMachineNodeId: renderNode.id,
      ownerStateMachineId: renderNode.id,
    }
    renderNode.isContainer = true
    renderNode.childSlots = emptyChildSlots()

    const diagramStateNodes: RenderNode[] = []
    const diagramChainClaimed = new Set<string>()

    const attachSection = (group: RenderNode | null) => {
      if (!group) return
      this.attachRenderNodeToParent(group, renderNode)
    }

    stateIds.forEach((stateId) => {
      const stateRender = allNodes.get(stateId)
      if (!stateRender) return

      stateRender.isContainer = true

      diagramStateNodes.push(stateRender)
    })

    const attachWrappedSection = (propertyName: string, smDiagramRole: string) => {
      const nodes = [...(sections.get(propertyName) ?? [])]
      nodes.sort((a, b) => {
        const pa = typeof a.metadata?.priority === 'number' ? a.metadata.priority : 0
        const pb = typeof b.metadata?.priority === 'number' ? b.metadata.priority : 0
        if (pa !== pb) return pa - pb
        return a.id.localeCompare(b.id)
      })
      const group = this.createRenderGroup(
        renderNode.id,
        propertyName,
        propertyName,
        nodes,
        allNodes,
        { smDiagramRole }
      )
      attachSection(group)
    }

    attachWrappedSection('conditionalEntries', 'conditionalEntries')
    attachWrappedSection('transitions', 'transitions')
    attachWrappedSection('globalTransitions', 'globalTransitions')

    const interpolatorIds = anyStateInterpolatorIds.filter((id) => !diagramChainClaimed.has(id))
    if (interpolatorIds.length > 0) {
      interpolatorIds.forEach((id) => diagramChainClaimed.add(id))
      const interpolatorNodes = interpolatorIds
        .map((id) => allNodes.get(id))
        .filter((n): n is RenderNode => !!n)
      const anyStateInterpolatorGroup = this.createRenderGroup(
        renderNode.id,
        'anyStateInterpolator',
        'anyStateInterpolator',
        interpolatorNodes,
        allNodes
      )
      if (anyStateInterpolatorGroup) {
        anyStateInterpolatorGroup.metadata = {
          ...anyStateInterpolatorGroup.metadata,
          smDiagramRole: 'anyStateInterpolator',
        }
        attachSection(anyStateInterpolatorGroup)
      }
    }

    frozenStateIds.forEach((frozenStateId) => {
      const frozenRender = allNodes.get(frozenStateId)
      if (!frozenRender) return
      diagramChainClaimed.add(frozenStateId)
      const frozenGroup = this.createRenderGroup(
        renderNode.id,
        'frozenState',
        'frozenState',
        [frozenRender],
        allNodes,
        { stateId: frozenStateId, smDiagramRole: 'frozenState' }
      )
      attachSection(frozenGroup)
    })

    if (diagramStateNodes.length > 0) {
      const statesGroup = this.createRenderGroup(
        renderNode.id,
        'states',
        'states',
        diagramStateNodes,
        allNodes,
        { smDiagramRole: 'states' },
        'vertical'
      )
      attachSection(statesGroup)
    }

    const diagramPropertyKeys = new Set([
      'states',
      'transitions',
      'globalTransitions',
      'conditionalEntries',
      'anyStateInterpolator',
      'frozenState',
    ])
    sections.forEach((childNodes, propertyName) => {
      if (diagramPropertyKeys.has(propertyName) || childNodes.length === 0) return

      const groupNode = this.createRenderGroup(
        renderNode.id,
        propertyName,
        propertyName,
        childNodes,
        allNodes
      )
      if (!groupNode) return

      groupNode.metadata = {
        ...groupNode.metadata,
        ownerStateMachineId: renderNode.id,
      }
      attachSection(groupNode)
    })
  }

  private attachRenderNodeToParent(
    child: RenderNode,
    parent: RenderNode,
    slot: string = DEFAULT_CHILD_SLOT
  ): void {
    appendChild(parent, child, slot)
  }

  private createRenderGroup(
    ownerId: string,
    groupKey: string,
    groupLabel: string,
    childRenderNodes: RenderNode[],
    allNodes: Map<string, RenderNode>,
    extraMetadata: Record<string, unknown> = {},
    layout: RenderNode['layout'] = 'vertical',
    identity?: {
      type?: string
      data?: RenderNode['data']
    }
  ): RenderNode | null {
    if (childRenderNodes.length === 0) return null

    const groupNode: RenderNode = {
      id: `node_${ownerId}_group_${groupKey}`,
      type: identity?.type ?? 'PropertyGroup',
      data: identity?.data ? { ...identity.data } : {},
      position: { x: 0, y: 0 },
      size: { width: 0, height: 0 },
      childSlots: emptyChildSlots(),
      metadata: {
        propertyName: groupLabel,
        ...extraMetadata,
      },
      bounds: { x: 0, y: 0, width: 0, height: 0 },
      isContainer: true,
      isGroup: true,
      groupType: 'property',
      layout,
      spacing: 16,
      padding: { top: 10, right: 10, bottom: 10, left: 10 },
      zIndex: 1,
      color: '#666',
      backgroundColor: '#f0f0f0',
      borderColor: '#ccc',
      borderWidth: 1,
      borderRadius: 6,
      visible: true,
      opacity: 0.9,
      scale: 1,
      rotation: 0,
    }

    allNodes.set(groupNode.id, groupNode)
    childRenderNodes.forEach((node) => {
      appendChild(groupNode, node, DEFAULT_CHILD_SLOT)
    })

    return groupNode
  }

  /**
   * Calculate layout for all render nodes
   * @param rootNodes - Root render nodes
   * @param connections - Array of connections for dependency analysis
   */
  private async calculateRenderLayout(
    diagramData: RenderData,
    rootNodes: RenderNode[],
  ): Promise<void> {
    if (rootNodes.length === 0) return

    const startX = 50
    const startY = 50
    const rootLayout = this.layoutChildrenWithDependencies(rootNodes, diagramData.connections)

    for (const [index, rootNode] of rootNodes.entries()) {
      const layoutPos = rootLayout.positions[index] ?? { x: 0, y: 0 }
      rootNode.position = { x: startX + layoutPos.x, y: startY + layoutPos.y }
      await this.layoutSubtree(diagramData, rootNode)
    }
  }

  /**
   * Offset cola debug boxes into this node's local child-content space.
   */
  private assignLayoutDebugContainers(
    node: RenderNode,
    boxes: LayoutDebugContainer[] | undefined,
    contentX: number,
    contentY: number
  ) {
    if (!boxes?.length) return
    node.layoutDebugContainers = boxes.map((box) => ({
      ...box,
      x: box.x + contentX,
      y: box.y + contentY,
    }))
  }

  /**
   * Deep-first layout: recurse children → leaf size or ELK direct children → fit bbox.
   */
  private async layoutSubtree(
    diagramData: RenderData,
    node: RenderNode,
  ): Promise<void> {
    const children = this.getLayoutChildren(node)
    const nodePadding = 20
    const titleHeight = 40
    delete node.layoutDebugContainers

    for (const child of children) {
      await this.layoutSubtree(diagramData, child)
    }

    // SM diagram roots: still layout children for scoped views, but size as ring leaf.
    if (isStateMachineDiagramRoot(node)) {
      if (children.length > 0) {
        const contentLayout = await this.layoutDirectChildren(node, children, diagramData.connections)
        const contentX = nodePadding
        const contentY = titleHeight
        for (const [index, child] of children.entries()) {
          const layoutPos = contentLayout.positions[index]
          if (!layoutPos) continue
          this.setNodeLocalPosition(child, contentX + layoutPos.x, contentY + layoutPos.y)
        }
        this.assignLayoutDebugContainers(
          node,
          contentLayout.debugContainers,
          contentX,
          contentY
        )
      }
      const overview = resolveNodeFootprint(diagramData, node)
      node.size = { width: overview.width, height: overview.height }
      node.bounds = {
        x: node.position.x,
        y: node.position.y,
        width: node.size.width,
        height: node.size.height,
      }
      return
    }

    // State / conditionalEntry overview: layout children for scoped views, size as compact leaf.
    if (isDiagramOverviewLeaf(node)) {
      if (children.length > 0) {
        const contentLayout = await this.layoutDirectChildren(node, children, diagramData.connections)
        const contentX = nodePadding
        const contentY = titleHeight
        for (const [index, child] of children.entries()) {
          const layoutPos = contentLayout.positions[index]
          if (!layoutPos) continue
          this.setNodeLocalPosition(child, contentX + layoutPos.x, contentY + layoutPos.y)
        }
        this.assignLayoutDebugContainers(
          node,
          contentLayout.debugContainers,
          contentX,
          contentY
        )
      }
      const overview = resolveNodeFootprint(diagramData, node)
      node.size = { width: overview.width, height: overview.height }
      node.bounds = {
        x: node.position.x,
        y: node.position.y,
        width: node.size.width,
        height: node.size.height,
      }
      return
    }

    if (children.length === 0) {
      const footprint = nodeUsesRowComposition(node)
        ? resolveNodeFootprint(diagramData, node)
        : this.getNodeLayoutSize(node)
      node.size = { width: footprint.width, height: footprint.height }
      node.bounds = {
        x: node.position.x,
        y: node.position.y,
        width: node.size.width,
        height: node.size.height,
      }
      return
    }

    const contentLayout = await this.layoutDirectChildren(node, children, diagramData.connections)
    const contentX = nodePadding
    const rowSize = nodeUsesRowComposition(node)
      ? resolveNodeFootprint(diagramData, node)
      : null
    // Row-composed cards (constraints, source channels) keep Data rows on top;
    // PropertyGroups / nested children start below that footprint.
    const rowChildGap = 8
    const contentY = rowSize ? rowSize.height + rowChildGap : titleHeight

    for (const [index, child] of children.entries()) {
      const layoutPos = contentLayout.positions[index]
      if (!layoutPos) continue
      this.setNodeLocalPosition(child, contentX + layoutPos.x, contentY + layoutPos.y)
    }
    this.assignLayoutDebugContainers(
      node,
      contentLayout.debugContainers,
      contentX,
      contentY
    )

    this.fitSizeToPositionedChildren(node)
    node.size = {
      width: Math.max(
        node.size.width,
        contentLayout.totalWidth + contentX + nodePadding,
        rowSize?.width ?? 0
      ),
      height: Math.max(
        node.size.height,
        contentLayout.maxHeight + contentY + nodePadding,
        rowSize?.height ?? 0
      ),
    }
    node.bounds = {
      x: node.position.x,
      y: node.position.y,
      width: node.size.width,
      height: node.size.height,
    }
  }

  private setNodeLocalPosition(node: RenderNode, x: number, y: number): void {
    if (x === node.position.x && y === node.position.y) return
    node.position = { x, y }
    node.bounds = {
      x: node.position.x,
      y: node.position.y,
      width: node.size.width,
      height: node.size.height,
    }
  }

  private resolveElkDirectionForParent(parent: RenderNode): ElkDirection {
    const layout = parent.layout
    return layout === 'vertical' ? 'DOWN' : 'RIGHT'
  }

  /** Force a strict top-to-bottom stack (states / SM section groups). */
  private shouldForceColumnChildrenLayout(parent: RenderNode): boolean {
    const role = parent.metadata?.smDiagramRole as string | undefined
    const propertyName = parent.metadata?.propertyName as string | undefined
    return (
      role === 'states' ||
      role === 'conditionalEntries' ||
      role === 'transitions' ||
      role === 'globalTransitions' ||
      propertyName === 'states' ||
      propertyName === 'conditionalEntries' ||
      propertyName === 'transitions' ||
      propertyName === 'globalTransitions'
    )
  }

  /** Force a left-to-right row for SM diagram sections. */
  private shouldForceRowChildrenLayout(parent: RenderNode): boolean {
    return isStateMachineDiagramRoot(parent)
  }

  private fitSizeToPositionedChildren(node: RenderNode): void {
    const bounds = this.getDescendantBoundsRelativeTo(node)
    if (!bounds) return

    const nodePadding = 20
    const titleHeight = 40

    node.size = {
      width: Math.max(bounds.maxX + nodePadding, 100),
      height: Math.max(bounds.maxY + nodePadding, titleHeight + nodePadding),
    }
    node.bounds = {
      x: node.position.x,
      y: node.position.y,
      width: node.size.width,
      height: node.size.height,
    }
  }

  /** Union bbox of visible descendants relative to `ancestor` (collapsed leaves are opaque). */
  private getDescendantBoundsRelativeTo(ancestor: RenderNode): {
    maxX: number
    maxY: number
  } | null {
    let maxX = 0
    let maxY = 0
    let found = false

    const ancestorWorld = getWorldPosition(ancestor)
    if (!ancestorWorld) return null

    const visit = (n: RenderNode) => {
      const nWorld = getWorldPosition(n)
      if (!nWorld) return
      const relX = nWorld.x - ancestorWorld.x
      const relY = nWorld.y - ancestorWorld.y
      maxX = Math.max(maxX, relX + n.size.width)
      maxY = Math.max(maxY, relY + n.size.height)
      found = true
    }

    const walk = (n: RenderNode) => {
      this.getLayoutChildren(n).forEach((child) => {
        visit(child)
        // Overview / SM leaves keep internal layout for scope views but must not
        // inflate parent PropertyGroup footprints.
        if (isDiagramOverviewLeaf(child)) return
        walk(child)
      })
    }

    walk(ancestor)

    if (!found) return null
    return { maxX, maxY }
  }

  /**
   * Layout direct children: compound ELK per sink branches, else layered packing.
   */
  private async layoutDirectChildren(
    parent: RenderNode,
    children: RenderNode[],
    connections: DiagramConnection[]
  ): Promise<ChildrenLayoutResult> {
    const padding = 12

    if (children.length === 0) {
      return { totalWidth: 0, maxHeight: 0, positions: [] }
    }

    if (this.shouldForceColumnChildrenLayout(parent)) {
      const column = this.layoutChildrenInColumn(children)
      return {
        totalWidth: column.totalWidth + padding * 2,
        maxHeight: column.maxHeight + padding * 2,
        positions: column.positions.map((pos) => ({
          x: pos.x + padding,
          y: pos.y + padding,
        })),
      }
    }

    if (this.shouldForceRowChildrenLayout(parent)) {
      const row = this.layoutChildrenInRow(children)
      return {
        totalWidth: row.totalWidth + padding * 2,
        maxHeight: row.maxHeight + padding * 2,
        positions: row.positions.map((pos) => ({
          x: pos.x + padding,
          y: pos.y + padding,
        })),
      }
    }

    if (children.length === 1) {
      const only = children[0]
      const pos = { x: padding, y: padding }
      return {
        totalWidth: only.size.width + padding * 2,
        maxHeight: only.size.height + padding * 2,
        positions: [pos],
      }
    }

    const uplifted = this.getLayoutParticipantConnections(children, connections)
    const virtualEdges = this.buildLayoutChildElkEdges(children, uplifted)

    const direction = this.resolveElkDirectionForParent(parent)
    const elkNodes = children.map((node) => ({
      id: node.id,
      width: Math.max(node.size.width, 1),
      height: Math.max(node.size.height, 1),
    }))

    let childPositions: Map<string, { x: number; y: number }> | null

    const layoutMode = this.options.directChildrenLayout ?? 'tidy-tree'
    const layoutContext = { parentId: parent.id, parentType: parent.type }

    const layoutOutput = await runDirectChildrenLayout(layoutMode, {
      nodes: elkNodes,
      edges: virtualEdges,
      direction,
      layoutContext,
    })
    childPositions = layoutOutput?.positions ?? null
    const debugContainers = layoutOutput?.debugContainers

    if (!childPositions || childPositions.size === 0) {
      throwDirectChildrenLayoutError(
        layoutContext,
        'layout returned no positions'
      )
    }

    let minX = Infinity
    let minY = Infinity

    for (const node of children) {
      const pos = childPositions.get(node.id)
      if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) continue
      minX = Math.min(minX, pos.x)
      minY = Math.min(minY, pos.y)
    }

    if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
      throwDirectChildrenLayoutError(layoutContext, 'invalid layout bounds')
    }

    const positionsById = new Map<string, { x: number; y: number }>()
    let maxX = padding
    let maxY = padding

    for (const node of children) {
      const pos = childPositions.get(node.id)
      if (!pos) continue
      const normalized = {
        x: pos.x - minX + padding,
        y: pos.y - minY + padding,
      }
      positionsById.set(node.id, normalized)
      maxX = Math.max(maxX, normalized.x + node.size.width)
      maxY = Math.max(maxY, normalized.y + node.size.height)
    }

    return {
      totalWidth: maxX + padding,
      maxHeight: maxY + padding,
      positions: children.map((child) => {
        const pos = positionsById.get(child.id)
        if (!pos) {
          throwDirectChildrenLayoutError(
            layoutContext,
            'missing child position',
            `child ${child.id} (${child.type})`
          )
        }
        return pos
      }),
      debugContainers: debugContainers?.map((box) => ({
        ...box,
        x: box.x - minX + padding,
        y: box.y - minY + padding,
      })),
    }
  }

  /**
   * Layout children in a row (horizontal arrangement) - for regular nodes
   * Adaptive row that accounts for different child sizes
   */
  private layoutChildrenInRow(children: RenderNode[]): { totalWidth: number, maxHeight: number, positions: Array<{x: number, y: number}> } {
    if (children.length === 0) {
      return { totalWidth: 0, maxHeight: 0, positions: [] }
    }

    const spacing = 20
    let currentX = 0
    let maxHeight = 0
    const positions: Array<{x: number, y: number}> = []

    children.forEach((child) => {
      // Calculate position (don't set it yet - will be set by positionChildren)
      positions.push({
        x: currentX,
        y: 0
      })
      
      // Update dimensions - each child takes its full width
      const size = this.getNodeLayoutSize(child)
      currentX += size.width + spacing
      maxHeight = Math.max(maxHeight, size.height)
    })

    return {
      totalWidth: currentX - spacing, // Remove last spacing
      maxHeight,
      positions
    }
  }

  /** Vertical stack for SM diagram state (transitions above nodes group). */
  private layoutChildrenInColumn(children: RenderNode[]): {
    totalWidth: number
    maxHeight: number
    positions: Array<{ x: number; y: number }>
  } {
    if (children.length === 0) {
      return { totalWidth: 0, maxHeight: 0, positions: [] }
    }

    const spacing = 16
    let currentY = 0
    let maxWidth = 0
    const positions: Array<{ x: number; y: number }> = []

    children.forEach((child) => {
      positions.push({ x: 0, y: currentY })
      const size = this.getNodeLayoutSize(child)
      currentY += size.height + spacing
      maxWidth = Math.max(maxWidth, size.width)
    })

    return {
      totalWidth: maxWidth,
      maxHeight: currentY - spacing,
      positions,
    }
  }

  /**
   * Layout children with dependency-aware positioning
   * Places nodes without inputs on the left, nodes with inputs on the right
   * Minimizes distances between connected nodes by positioning input nodes closer to their targets
   */
  private layoutChildrenWithDependencies(children: RenderNode[], connections: DiagramConnection[]): { totalWidth: number, maxHeight: number, positions: Array<{x: number, y: number}> } {
    if (children.length === 0) {
      return { totalWidth: 0, maxHeight: 0, positions: [] }
    }

    // Step 1: Calculate dependency levels
    const levels = this.calculateDependencyLevels(children, connections)
    
    // Step 2: Position nodes with improved proximity to targets
    return this.positionWithProximityToTargets(levels, children, connections)
  }

  /** Visible direct children from the render tree (default / body slot). */
  private getLayoutChildren(parent: RenderNode): RenderNode[] {
    return getChildSlot(parent, DEFAULT_CHILD_SLOT).filter(
      (child) => child.visible !== false
    )
  }

  /** Footprint for ELK — always use size from completed child subtree layout. */
  private getNodeLayoutSize(node: RenderNode): { width: number; height: number } {
    return {
      width: Math.max(node.size?.width ?? 120, 1),
      height: Math.max(node.size?.height ?? 80, 1),
    }
  }

  /**
   * Map every descendant to the layout sibling that contains it (for ELK at this level).
   */
  private buildDescendantToLayoutChildMap(layoutChildren: RenderNode[]): Map<string, string> {
    const map = new Map<string, string>()
    const walk = (layoutChildId: string, node: RenderNode) => {
      map.set(node.id, layoutChildId)
      forEachDirectChild(node, (child) => walk(layoutChildId, child), {
        slots: [DEFAULT_CHILD_SLOT],
      })
    }
    layoutChildren.forEach((layoutChild) => {
      walk(layoutChild.id, layoutChild)
    })
    return map
  }

  /**
   * Lift cross-hierarchy links to layout siblings (e.g. SM → node inside a state becomes SM → state).
   * Used as virtual uplifted edges on top of raw connections when building the ELK graph.
   */
  private getLayoutParticipantConnections(
    layoutChildren: RenderNode[],
    connections: DiagramConnection[]
  ): DiagramConnection[] {
    const layoutChildIds = new Set(layoutChildren.map((c) => c.id))
    const participantOf = this.buildDescendantToLayoutChildMap(layoutChildren)
    const lifted: DiagramConnection[] = []
    const edgeKeys = new Set<string>()

    const resolveLiftedEndpoint = (nodeId: string): string | undefined =>
      participantOf.get(nodeId) ?? (layoutChildIds.has(nodeId) ? nodeId : undefined)

    connections.forEach((conn) => {
      const from = resolveLiftedEndpoint(conn.from)
      const to = resolveLiftedEndpoint(conn.to)
      if (!from || !to || from === to) return

      const liftedConn: DiagramConnection = {
        ...conn,
        from,
        to,
      }
      const key = getConnectionKey(liftedConn)
      if (edgeKeys.has(key)) return
      edgeKeys.add(key)

      lifted.push(liftedConn)
    })

    return lifted
  }

  /** ELK edges between direct layout children (uplifted from inner connections). */
  private buildLayoutChildElkEdges(
    layoutChildren: RenderNode[],
    upliftedConnections: DiagramConnection[]
  ): ElkLayeredEdgeInput[] {
    const layoutChildIds = new Set(layoutChildren.map((child) => child.id))
    const edgeKeys = new Set<string>()
    const edges: ElkLayeredEdgeInput[] = []

    for (const conn of upliftedConnections) {
      if (!layoutChildIds.has(conn.from) || !layoutChildIds.has(conn.to)) continue
      if (conn.from === conn.to) continue
      const key = getConnectionKey(conn)
      if (edgeKeys.has(key)) continue
      edgeKeys.add(key)

      const inputEdge = conn.type === DIAGRAM_CONNECTION_TYPE_INPUT
      edges.push({
        id: key,
        from: conn.from,
        to: conn.to,
        pinName: conn.pinName,
        priority: inputEdge ? 10 : 1,
        inputEdge,
      })
    }

    return edges
  }

  /**
   * Calculate dependency levels for nodes
   * Level 0: nodes without inputs (sources)
   * Level 1+: nodes with inputs, based on their dependency depth
   */
  private calculateDependencyLevels(children: RenderNode[], connections: DiagramConnection[]): Map<string, number> {
    const levels = new Map<string, number>()
    const nodeIds = new Set(children.map(n => n.id))

    const relevantConnections = this.getLayoutParticipantConnections(children, connections).filter(
      (conn) => nodeIds.has(conn.from) && nodeIds.has(conn.to)
    )
    
    // Build dependency graph and reverse dependencies (sources)
    const dependencies = new Map<string, string[]>() // node -> its dependencies
    const sources = new Map<string, string[]>()     // node -> nodes that depend on it
    
    children.forEach(node => {
      dependencies.set(node.id, [])
      sources.set(node.id, [])
    })
    
    relevantConnections.forEach(conn => {
      // Build dependencies: conn.to depends on conn.from
      const deps = dependencies.get(conn.to) || []
      deps.push(conn.from)
      dependencies.set(conn.to, deps)
      
      // Build sources: conn.from is a source for conn.to
      const srcs = sources.get(conn.from) || []
      srcs.push(conn.to)
      sources.set(conn.from, srcs)
    })
    
    // Calculate levels using BFS
    const queue: Array<{nodeId: string, level: number}> = []
    const visited = new Set<string>()
    
    // Start with nodes that have no dependencies (sources)
    children.forEach(node => {
      const deps = dependencies.get(node.id) || []
      if (deps.length === 0) {
        queue.push({ nodeId: node.id, level: 0 })
        levels.set(node.id, 0)
        visited.add(node.id)
      }
    })
    
    // Process queue - now we can directly use sources map
    while (queue.length > 0) {
      const { nodeId, level } = queue.shift()!
      
      // Get all nodes that depend on this node (from sources map)
      const dependentNodes = sources.get(nodeId) || []
      
      dependentNodes.forEach(dependentId => {
        if (!visited.has(dependentId)) {
          const deps = dependencies.get(dependentId) || []
          const allDepsVisited = deps.every(depId => visited.has(depId))
          
          if (allDepsVisited) {
            const newLevel = level + 1
            levels.set(dependentId, newLevel)
            visited.add(dependentId)
            queue.push({ nodeId: dependentId, level: newLevel })
          }
        }
      })
    }
    
    // Handle any remaining nodes (circular dependencies or isolated nodes)
    children.forEach(node => {
      if (!visited.has(node.id)) {
        levels.set(node.id, 0) // Place at level 0 as fallback
      }
    })
    
    return levels
  }

  /**
   * Position nodes with improved proximity to their targets
   * Nodes are arranged by dependency levels but positioned to minimize connection angles
   * and maintain horizontal connections where possible
   */
  private positionWithProximityToTargets(levels: Map<string, number>, children: RenderNode[], connections: DiagramConnection[]): { totalWidth: number, maxHeight: number, positions: Array<{x: number, y: number}> } {
    const spacing = 20
    const levelSpacing = 50 // Minimum horizontal spacing between levels
    const positions: Array<{x: number, y: number}> = []
    
    // Group nodes by level
    const nodesByLevel = new Map<number, RenderNode[]>()
    children.forEach(node => {
      const level = levels.get(node.id) || 0
      if (!nodesByLevel.has(level)) {
        nodesByLevel.set(level, [])
      }
      nodesByLevel.get(level)!.push(node)
    })
    
    // Calculate positions for each level and store them in a map
    const nodePositions = new Map<string, {x: number, y: number}>()
    let maxWidth = 0
    let maxHeight = 0
    
    // Calculate cumulative X positions for each level
    const levelXPositions = new Map<number, number>()
    let currentX = 0
    
    // Sort levels to process them in order
    const sortedLevels = Array.from(nodesByLevel.keys()).sort((a, b) => a - b)
    
    sortedLevels.forEach(level => {
      const levelNodes = nodesByLevel.get(level)!
      levelXPositions.set(level, currentX)
      
      // Calculate the maximum width needed for this level
      let levelWidth = 0
      levelNodes.forEach(node => {
        levelWidth = Math.max(levelWidth, node.size.width)
      })
      
      // Update currentX for next level
      currentX += levelWidth + levelSpacing
      maxWidth = Math.max(maxWidth, currentX - levelSpacing)
    })
    
    const groupPadding = 20 // Padding inside groups
    
    // First pass: position nodes by level (basic layout)
    nodesByLevel.forEach((levelNodes, level) => {
      const levelX = levelXPositions.get(level) || 0
      
      // Calculate vertical positions for nodes in this level
      let currentY = groupPadding // Start with padding
      let levelHeight = 0
      
      levelNodes.forEach(node => {
        const position = {
          x: levelX + groupPadding, // Add horizontal padding
          y: currentY
        }
        
        nodePositions.set(node.id, position)
        currentY += node.size.height + spacing
        levelHeight = Math.max(levelHeight, currentY - spacing)
      })
      
      maxHeight = Math.max(maxHeight, levelHeight + groupPadding) // Add bottom padding
    })
    
    // Second pass: optimize vertical positions for horizontal connections
    this.optimizeVerticalPositionsForHorizontalConnections(nodePositions, children, connections)
    
    // Third pass: recalculate container dimensions after position adjustments
    const adjustedDimensions = this.recalculateContainerDimensions(nodePositions, children, groupPadding)
    maxWidth = adjustedDimensions.width
    maxHeight = adjustedDimensions.height
    
    // Create positions array in the same order as children array
    children.forEach(node => {
      const position = nodePositions.get(node.id) || { x: 0, y: 0 }
      positions.push(position)
    })
    
    return {
      totalWidth: maxWidth,
      maxHeight,
      positions
    }
  }

  /**
   * Optimize vertical positions to create more horizontal connections
   * and prevent node overlaps while maintaining minimum gaps
   */
  private optimizeVerticalPositionsForHorizontalConnections(nodePositions: Map<string, {x: number, y: number}>, children: RenderNode[], connections: DiagramConnection[]): void {
    const nodeIds = new Set(children.map(n => n.id))
    const relevantConnections = this.getLayoutParticipantConnections(children, connections).filter(
      (conn) => nodeIds.has(conn.from) && nodeIds.has(conn.to)
    )
    
    // Group connections by target node
    const connectionsByTarget = new Map<string, DiagramConnection[]>()
    relevantConnections.forEach(conn => {
      if (!connectionsByTarget.has(conn.to)) {
        connectionsByTarget.set(conn.to, [])
      }
      connectionsByTarget.get(conn.to)!.push(conn)
    })
    
    // Process each target node and align it with its inputs
    connectionsByTarget.forEach((inputConnections, targetId) => {
      const targetPos = nodePositions.get(targetId)
      if (!targetPos) return
      
      // Get positions of input nodes
      const inputPositions = inputConnections.map(conn => {
        const inputPos = nodePositions.get(conn.from)
        return inputPos
      }).filter(pos => pos !== undefined) as {x: number, y: number}[]
      
      if (inputPositions.length === 0) return
      
      // Calculate the best Y position for horizontal alignment
      const bestY = this.calculateBestHorizontalY(inputPositions)
      
      // Apply the new position directly (we'll handle container expansion later)
      nodePositions.set(targetId, { x: targetPos.x, y: bestY })
    })
  }

  /**
   * Calculate the best Y position for horizontal alignment with input nodes
   */
  private calculateBestHorizontalY(inputPositions: {x: number, y: number}[]): number {
    if (inputPositions.length === 0) return 0
    
    // If all inputs are at the same Y level, use that
    const yPositions = inputPositions.map(pos => pos.y)
    const uniqueYs = [...new Set(yPositions)]
    
    if (uniqueYs.length === 1) {
      return uniqueYs[0]
    }
    
    // If inputs are at different Y levels, use the most common one
    const yCounts = new Map<number, number>()
    yPositions.forEach(y => {
      yCounts.set(y, (yCounts.get(y) || 0) + 1)
    })
    
    let mostCommonY = yPositions[0]
    let maxCount = 0
    yCounts.forEach((count, y) => {
      if (count > maxCount) {
        maxCount = count
        mostCommonY = y
      }
    })
    
    return mostCommonY
  }

  /**
   * Recalculate container dimensions after position adjustments
   */
  private recalculateContainerDimensions(nodePositions: Map<string, {x: number, y: number}>, children: RenderNode[], groupPadding: number): { width: number, height: number } {
    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity
    
    children.forEach(node => {
      const pos = nodePositions.get(node.id)
      if (!pos) return
      
      minX = Math.min(minX, pos.x)
      maxX = Math.max(maxX, pos.x + node.size.width)
      minY = Math.min(minY, pos.y)
      maxY = Math.max(maxY, pos.y + node.size.height)
    })
    
    // Handle case where no nodes are positioned
    if (minX === Infinity) {
      return { width: 100, height: 100 }
    }
    
    // Calculate dimensions with padding
    const width = maxX - minX + groupPadding * 2
    const height = maxY - minY + groupPadding * 2
    
    return {
      width: Math.max(width, 100), // Minimum width
      height: Math.max(height, 100) // Minimum height
    }
  }

  /**
   * Calculate overall bounds for all render nodes
   * @param rootNodes - Root render nodes
   * @returns Overall bounds
   */
  private calculateRenderBounds(rootNodes: RenderNode[]): { x: number; y: number; width: number; height: number } {
    if (rootNodes.length === 0) {
      return { x: 0, y: 0, width: 0, height: 0 }
    }
    
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    
    const processNode = (node: RenderNode) => {
      const world = getWorldPosition(node)
      if (!world) return
      const nodeWidth = node.size.width
      const nodeHeight = node.size.height

      minX = Math.min(minX, world.x)
      minY = Math.min(minY, world.y)
      maxX = Math.max(maxX, world.x + nodeWidth)
      maxY = Math.max(maxY, world.y + nodeHeight)

      forEachDirectChild(node, processNode)
    }
    
    rootNodes.forEach(processNode)
    
    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY
    }
  }

  wrapAnimgraphNodes(animgraphData: AnimgraphData, registry: Map<string, AnimgraphNode>): void {
    const handlesIdsSet = new Set<string>()
    this._wrapAnimgraphObject(animgraphData as Record<string, any>, registry, handlesIdsSet)
  }

  private _wrapAnimgraphObject(object: Record<string, any>, registry: Map<string, AnimgraphNode>, handlesIdsSet: Set<string>): void {
    Object.keys(object).sort().forEach(key => {
      const value = object[key]

      if (Array.isArray(value)) {
        value.forEach((item, index) => {
          if (typeof item === 'object' && item !== null) {
            if ('HandleRefId' in item && !handlesIdsSet.has(item.HandleRefId)) {
              handlesIdsSet.add(item.HandleRefId)

              const handle = JSON.parse(JSON.stringify(registry.get(item.HandleRefId)!))
              value[index] = handle
              this._wrapAnimgraphObject(handle, registry, handlesIdsSet)
            } else {
              this._wrapAnimgraphObject(item, registry, handlesIdsSet)
            }
          }
        })
      } else if (typeof value === 'object' && value !== null) {
        if ('HandleRefId' in value && !handlesIdsSet.has(value.HandleRefId)) {
          handlesIdsSet.add(value.HandleRefId)

          const handle = JSON.parse(JSON.stringify(registry.get(value.HandleRefId)!))
          object[key] = handle
          this._wrapAnimgraphObject(handle, registry, handlesIdsSet)
        } else {
          this._wrapAnimgraphObject(value, registry, handlesIdsSet)
        }
      }
    })
  }

  unwrapAnimgraphNodes(animgraphData: AnimgraphData): void {
    const objectsToProcess = [animgraphData as Record<string, any>]

    while (objectsToProcess.length > 0) {
      const object = objectsToProcess.pop()!

      Object.keys(object).forEach(key => {
        const value = object[key]

        if (Array.isArray(value)) {
          value.forEach((item, index) => {
            if (typeof item === 'object' && item !== null) {
              if ('HandleId' in item && 'Data' in item) {
                object[key][index] = { 'HandleRefId': item.HandleId }
              }
              objectsToProcess.push(item)
            }
          })
        } else if (typeof value === 'object' && value !== null) {
          if ('HandleId' in value && 'Data' in value) {
            object[key] = { 'HandleRefId': value.HandleId }
          }
          objectsToProcess.push(value)
        }
      })
    }
  }

  buildHandlesRegistry(data: AnimgraphData): Map<string, AnimgraphNode> {
    const registry = new Map<string, AnimgraphNode>()

    const objectsToProcess = [data as Record<string, any>]
    while (objectsToProcess.length > 0) {
      const object = objectsToProcess.pop()!
      
      if ('HandleId' in object && 'Data' in object) {
        registry.set(object.HandleId, object as AnimgraphNode)
      }

      Object.keys(object).forEach(key => {
        const value = object[key]
        if (Array.isArray(value)) {
          value.forEach(item => {
            if (typeof item === 'object' && item !== null) {
              objectsToProcess.push(item)
            }
          })
        } else if (typeof value === 'object' && value !== null) {
          objectsToProcess.push(value)
        }
      })
    }

    return registry
  }

}

/**
 * Konva Graph Renderer using Konva.js for enhanced 2D graphics and animations
 */

import Konva from 'konva'
import type { DiagramConnection, RenderData, RenderNode } from './graph/diagramTypes'
import { getConnectionKey } from './graph/diagramModel'
import {
  DEFAULT_CHILD_SLOT,
  OVERVIEW_CHILD_SLOT,
  forEachDirectChild,
  getChildSlot,
} from './graph/nodeChildSlots'
import { GraphScopeIndex } from './graph/GraphScopeIndex'
import {
  getSmInputChainOverviewSubtitle,
  getSmInputChainOverviewTitleText,
  getStateOverviewTitleText,
  isDiagramOverviewLeaf,
  isDiagramPortalNode,
  isSmInputChainOverviewLeaf,
  isStateEntryPortalNode,
  isStateMachineDiagramRoot,
  isStateOverviewLeaf,
} from './graph/DiagramConversion'
import {
  isDiagramGroupNode,
  isDiagramNoteNode,
  readDiagramGroupLabel,
} from './graph/diagramFrameNodes'
import {
  adjustConnectionEndpointsForDrawing,
  connectionPointBetweenNodes,
  expandNodeIdsWithDescendants,
  getWorldPosition,
  type RectBounds,
} from './graph/DiagramGeometry'
import {
  planMainGraphConnection,
  type PlannedConnection,
} from './graph/ConnectionDrawPlanner'
import {
  createPlannedConnectionShape,
  repositionConnectionLabel,
} from './graph/ConnectionKonvaPainter'
import {
  collectLensScopeNodeIds,
  filterConnectionsForLensScope,
  planLensInternalEdge,
} from './graph/LensScope'
import { applyDotGridElementStyle, subscribeDiagramGridSettings } from './graph/diagramDotGrid'

export interface KonvaGraphRendererOptions {
  /** Render only this node and its descendants (lens view). */
  scopeRootId?: string
  /** Skip tile culling; fit subtree into viewport after render. */
  lensMode?: boolean
}

type KonvaNodeVisualOptions = {
  titleText?: string
  subtitleText?: string
  fill?: string
  stroke?: string
  strokeDash?: number[]
  titleFill?: string
  subtitleFill?: string
}

/**
 * @deprecated Prefer {@link PixiGraphRenderer}. Konva diagram path is legacy and not maintained.
 */
export class KonvaGraphRenderer {
  private container: HTMLDivElement
  private graphData: RenderData
  private stage: Konva.Stage | null = null
  private nodesLayer: Konva.Layer | null = null
  private connectionsLayer: Konva.Layer | null = null
  private debugLayer: Konva.Layer | null = null
  private unsubGrid: (() => void) | null = null
  /** Off-stage holder for diagram groups between visibility passes (preserves child nesting). */
  private nodeStaging: Konva.Group = new Konva.Group({ listening: false, visible: false })

  private graphScope: GraphScopeIndex

  private scopeRootId: string | null = null
  private scopeNodeIds: Set<string> | null = null
  private lensMode = false
  private readonly lensContentOrigin = { x: 16, y: 40 }

  // Virtual tile system for performance
  private tileSize: number = 1000 // Size of each tile in pixels
  private virtualTiles: Map<
    string,
    { nodes: Set<Konva.Group>; connections: Set<Konva.Group> }
  > = new Map()
  private visibleTiles: Set<string> = new Set()
  private lastViewport: { x: number; y: number; width: number; height: number } | null = null
  private debugTiles: boolean = false // Debug flag for tile visualization
  private debugLayoutContainers: boolean = false

  // Fast lookup maps for nodes and connections
  private nodeMap: Map<string, Konva.Group> = new Map() // nodeId -> Konva.Group
  private connectionMap: Map<string, Konva.Group> = new Map() // connectionKey -> Konva.Group

  private nodeToTiles: Map<Konva.Group, Set<string>> = new Map()
  private connectionToTiles: Map<Konva.Group, Set<string>> = new Map()

  /** Nested beginInteractiveEdit depth; >0 defers tile reindex until matching end. */
  private interactiveEditDepth = 0
  private interactiveDirtyNodeIds = new Set<string>()

  // View state
  private zoom: number
  private panX: number
  private panY: number
  private viewportWidth: number
  private viewportHeight: number

  // Grid layout parameters
  private cellWidth: number = 80
  private cellHeight: number = 60
  private cellsGap: number = 4

  // Connection rendering settings
  private showConnections: boolean = true
  private connectionOpacity: number = 0.8
  private connectionLabels: boolean = true
  private connectionArrows: boolean = true
  
  // Selected node connection highlighting
  private highlightSelectedNodeConnections: boolean = true
  private selectedNodeConnectionColor: string = '#ff6b6b'
  private selectedNodeConnectionOpacity: number = 1.0
  private selectedNodeConnectionWidth: number = 3

  // Node selection settings
  private selectedNodeIds = new Set<string>()
  private primarySelectedNodeId: string | null = null
  private onNodeSelect: ((nodeIds: string[], primaryNodeId: string | null, event?: MouseEvent) => void) | null = null
  private interactionGate: () => boolean = () => true

  // Animation settings
  private enableAnimations: boolean = false
  private animationDuration: number = 300

  /** Pan with middle mouse button only */
  private panSession: {
    startPointer: { x: number; y: number }
    startStagePos: { x: number; y: number }
  } | null = null

  constructor(
    containerElement: HTMLDivElement,
    graphData: RenderData,
    options: KonvaGraphRendererOptions = {}
  ) {
    this.container = containerElement
    this.graphData = graphData
    this.graphScope = new GraphScopeIndex(graphData)

    if (options.scopeRootId) {
      this.scopeRootId = options.scopeRootId
      this.scopeNodeIds = collectLensScopeNodeIds(graphData, options.scopeRootId)
      this.lensMode = options.lensMode ?? true
    }

    // View state
    this.zoom = 1.0
    this.panX = 0
    this.panY = 0
    this.viewportWidth = 800
    this.viewportHeight = 600

    this.init()
  }

  /**
   * Set grid layout parameters
   */
  public setGridLayout(cellWidth: number, cellHeight: number, cellsGap: number): void {
    this.cellWidth = cellWidth
    this.cellHeight = cellHeight
    this.cellsGap = cellsGap
    console.log(`Grid layout updated: ${cellWidth}x${cellHeight}, gap: ${cellsGap}`)
  }

  /**
   * Get node background color in hex format
   */
  private getNodeBackgroundColorHex(type: string): string {
    const colors: Record<string, string> = {
      'animAnimNode_StateMachine': '#ffe0e0',
      'animAnimNode_StateMachineDiagram': '#ffe0e0',
      'animAnimNode_Blend2': '#e0f7f7',
      'animAnimNode_BlendMultiple': '#e0f2ff',
      'animAnimNode_Switch': '#e8f5e8',
      'animAnimNode_SkAnim': '#fff8e0',
      'animAnimNode_FloatInput': '#ffe0f7',
      'animAnimNode_IntInput': '#e0f0ff',
      'animAnimNode_MathExpressionFloat': '#f0e8ff'
    }
    return colors[type] || '#f8f9fa'
  }

  private hashString(value: string): number {
    let hash = 0
    for (let i = 0; i < value.length; i++) {
      hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0
    }
    return Math.abs(hash)
  }

  /**
   * Get current grid layout parameters
   */
  public getGridLayout(): { cellWidth: number, cellHeight: number, cellsGap: number } {
    return {
      cellWidth: this.cellWidth,
      cellHeight: this.cellHeight,
      cellsGap: this.cellsGap
    }
  }

  /**
   * Initialize Konva stage and layers
   */
  private init(): void {
    console.log('KonvaGraphRenderer.init() called')

    try {
      this.setupKonva()
      this._render()

      if (this.lensMode) {
        this.fitViewToScope()
      }
      
      // Caching is disabled by default to prevent memory issues
      // Enable manually if needed: renderer.setCachingEnabled(true)
      
      console.log('KonvaGraphRenderer initialized successfully (caching disabled by default)')
    } catch (error) {
      console.error('Failed to initialize KonvaGraphRenderer:', error)
    }
  }

  /**
   * Setup Konva stage and layers
   */
  private setupKonva(): void {
    // Get container dimensions
    this.viewportWidth = this.container.clientWidth
    this.viewportHeight = this.container.clientHeight

    // Create Konva stage
    this.stage = new Konva.Stage({
      container: this.container,
      width: this.viewportWidth,
      height: this.viewportHeight,
      draggable: false,
    })

    // Create separate layers for better performance
    this.nodesLayer = new Konva.Layer()
    this.connectionsLayer = new Konva.Layer()
    this.debugLayer = new Konva.Layer()

    this.stage.add(this.nodesLayer)
    this.stage.add(this.connectionsLayer)
    this.stage.add(this.debugLayer)
    this.syncDotGrid()
    this.unsubGrid = subscribeDiagramGridSettings(() => this.syncDotGrid())

    // Set up event handlers
    this.setupEventHandlers()

    // Set up resize observer
    this.setupResizeObserver()
  }

  /**
   * Setup event handlers for zoom, pan, and selection
   */
  private setupEventHandlers(): void {
    if (!this.stage) return

    // Mouse wheel zoom
    this.stage.on('wheel', (e) => {
      e.evt.preventDefault()
      
      const scaleBy = 1.1
      const oldScale = this.stage!.scaleX()
      const pointer = this.stage!.getPointerPosition()
      
      if (!pointer) return

      const mousePointTo = {
        x: (pointer.x - this.stage!.x()) / oldScale,
        y: (pointer.y - this.stage!.y()) / oldScale,
      }

      const newScale = e.evt.deltaY > 0 ? oldScale / scaleBy : oldScale * scaleBy
      const clampedScale = Math.max(0.1, Math.min(5.0, newScale))

      this.stage!.scale({ x: clampedScale, y: clampedScale })
      
      const newPos = {
        x: pointer.x - mousePointTo.x * clampedScale,
        y: pointer.y - mousePointTo.y * clampedScale,
      }
      
      this.stage!.position(newPos)
      this.panX = newPos.x
      this.panY = newPos.y
      this.zoom = clampedScale
      
      this.updateTileVisibility()
      this.batchDrawGraphLayers()
    })

    this.setupStagePanHandlers()

    this.stage.on('click tap', (e) => {
      if (!this.interactionGate()) return

      const evt = e.evt as MouseEvent
      if ('button' in evt && evt.button !== 0) return

      const graphNodeId = this.resolveGraphNodeIdFromTarget(e.target as Konva.Node)
      const multiSelect = evt.ctrlKey || evt.metaKey

      if (
        graphNodeId &&
        evt.shiftKey &&
        !multiSelect &&
        this.selectedNodeIds.has(graphNodeId) &&
        this.selectedNodeIds.size > 1
      ) {
        const nextIds = [...this.selectedNodeIds]
        this.setSelectedNodes(nextIds, graphNodeId)
        this.onNodeSelect?.(nextIds, graphNodeId, evt)
        return
      }

      const multiSelectToggle = multiSelect

      if (!graphNodeId) {
        if (!multiSelectToggle) {
          this.setSelectedNodes([], null)
          this.onNodeSelect?.([], null, evt)
        }
        return
      }

      let nextIds: string[]
      let primaryId: string | null

      if (multiSelectToggle) {
        const next = new Set(this.selectedNodeIds)
        if (next.has(graphNodeId)) {
          next.delete(graphNodeId)
          primaryId = this.primarySelectedNodeId === graphNodeId
            ? [...next].at(-1) ?? null
            : this.primarySelectedNodeId
        } else {
          next.add(graphNodeId)
          primaryId = graphNodeId
        }
        nextIds = [...next]
      } else {
        nextIds = [graphNodeId]
        primaryId = graphNodeId
      }

      this.setSelectedNodes(nextIds, primaryId)
      this.onNodeSelect?.(nextIds, primaryId, evt)
    })
  }

  private syncDotGrid(): void {
    applyDotGridElementStyle(this.container, this.panX, this.panY, this.zoom)
  }

  private batchDrawGraphLayers(): void {
    this.syncDotGrid()
    this.nodesLayer?.batchDraw()
    this.connectionsLayer?.batchDraw()
  }

  /**
   * Setup resize observer
   */
  private setupResizeObserver(): void {
    if (window.ResizeObserver) {
      const resizeObserver = new ResizeObserver(() => {
        this.resizeStage()
      })

      resizeObserver.observe(this.container)
    }
  }

  /**
   * Resize Konva stage
   */
  private resizeStage(): void {
    if (!this.stage) return

    const newWidth = this.container.clientWidth
    const newHeight = this.container.clientHeight

    if (this.stage.width() !== newWidth || this.stage.height() !== newHeight) {
      this.stage.width(newWidth)
      this.stage.height(newHeight)
      this.viewportWidth = newWidth
      this.viewportHeight = newHeight
      this._render()
    }
  }

  /**
   * Render the graph using Konva
   */
  private _render(): void {
    if (!this.stage || !this.nodesLayer || !this.connectionsLayer) return

    // Clear existing objects and lookup maps
    this.clearLayers()
    this.connectionMap.clear()

    // Render nodes using tile system
    this.renderNodes()

    // Render connections
    this.renderConnections()

    // Update tile visibility
    this.updateTileVisibility()

    this.batchDrawGraphLayers()
  }

  /**
   * Clear all layers
   */
  private clearLayers(): void {
    if (this.nodesLayer) {
      this.nodesLayer.destroyChildren()
    }
    this.nodeStaging.destroyChildren()
    this.connectionMap.forEach((group) => group.destroy())
    this.connectionMap.clear()
    if (this.connectionsLayer) {
      this.connectionsLayer.destroyChildren()
    }

    this.virtualTiles.forEach((tile) => {
      tile.nodes.forEach((node) => node.destroy())
    })
    this.virtualTiles.clear()
    this.nodeMap.clear()

    this.visibleTiles.clear()
    this.lastViewport = null
    this.nodeToTiles.clear()
    this.connectionToTiles.clear()
  }

  private ensureTile(tileKey: string): { nodes: Set<Konva.Group>; connections: Set<Konva.Group> } {
    let tile = this.virtualTiles.get(tileKey)
    if (!tile) {
      tile = { nodes: new Set(), connections: new Set() }
      this.virtualTiles.set(tileKey, tile)
    }
    return tile
  }

  /**
   * Get tile key for a position
   */
  private getTileKey(x: number, y: number): string {
    const tileX = Math.floor(x / this.tileSize)
    const tileY = Math.floor(y / this.tileSize)
    return `${tileX},${tileY}`
  }

  /**
   * Get all tile keys that intersect with a node
   */
  private getEffectiveNodeSize(node: RenderNode): { width: number; height: number } {
    const overview = this.graphScope.getOverviewSize(node.id)
    if (overview) return overview
    return {
      width: node.size?.width || 120,
      height: node.size?.height || 80,
    }
  }

  private getNodeTileKeys(node: RenderNode): string[] {
    const world = getWorldPosition(node)
    if (!world) {
      return [this.getTileKey(0, 0)]
    }

    const { width: nodeWidth, height: nodeHeight } = this.getEffectiveNodeSize(node)
    
    // Calculate node bounds
    const left = world.x
    const top = world.y
    const right = left + nodeWidth
    const bottom = top + nodeHeight

    if (
      !Number.isFinite(left) ||
      !Number.isFinite(top) ||
      !Number.isFinite(right) ||
      !Number.isFinite(bottom)
    ) {
      return [this.getTileKey(0, 0)]
    }
    
    // Calculate tile bounds
    const leftTile = Math.floor(left / this.tileSize)
    const topTile = Math.floor(top / this.tileSize)
    const rightTile = Math.floor(right / this.tileSize)
    const bottomTile = Math.floor(bottom / this.tileSize)

    const maxTileSpan = 64
    if (
      rightTile - leftTile > maxTileSpan ||
      bottomTile - topTile > maxTileSpan
    ) {
      return [this.getTileKey(left, top)]
    }
    
    const tileKeys: string[] = []
    
    // Add all intersecting tiles
    for (let tileX = leftTile; tileX <= rightTile; tileX++) {
      for (let tileY = topTile; tileY <= bottomTile; tileY++) {
        tileKeys.push(`${tileX},${tileY}`)
      }
    }
    
    return tileKeys
  }

  /** All tiles a line segment passes through (world coordinates). */
  private getLineTileKeys(x1: number, y1: number, x2: number, y2: number): string[] {
    const tileKeys = new Set<string>()

    const startTileX = Math.floor(x1 / this.tileSize)
    const startTileY = Math.floor(y1 / this.tileSize)
    const endTileX = Math.floor(x2 / this.tileSize)
    const endTileY = Math.floor(y2 / this.tileSize)

    tileKeys.add(`${startTileX},${startTileY}`)
    tileKeys.add(`${endTileX},${endTileY}`)

    if (startTileX === endTileX && startTileY === endTileY) {
      return Array.from(tileKeys)
    }

    const dx = Math.abs(x2 - x1)
    const dy = Math.abs(y2 - y1)
    const sx = x1 < x2 ? 1 : -1
    const sy = y1 < y2 ? 1 : -1
    let err = dx - dy

    let x = x1
    let y = y1
    const maxSteps = Math.max(dx, dy) + 1
    let steps = 0

    while (steps < maxSteps) {
      tileKeys.add(`${Math.floor(x / this.tileSize)},${Math.floor(y / this.tileSize)}`)
      if (x === x2 && y === y2) break

      const e2 = 2 * err
      if (e2 > -dy) {
        err -= dy
        x += sx
      }
      if (e2 < dx) {
        err += dx
        y += sy
      }
      steps++
    }

    return Array.from(tileKeys)
  }

  private getConnectionTileKeys(connection: DiagramConnection): string[] {
    const planned = this.planConnectionForMainGraph(connection)
    if (!planned) return []
    return this.getLineTileKeys(planned.from.x, planned.from.y, planned.to.x, planned.to.y)
  }

  private getConnectionTileKeysFromGroup(connectionGroup: Konva.Group): string[] {
    const line = connectionGroup.children.find(
      (child: Konva.Node) => child instanceof Konva.Line
    ) as Konva.Line | undefined
    if (!line) return []
    const points = line.points()
    if (points.length < 4) return []
    return this.getLineTileKeys(points[0], points[1], points[2], points[3])
  }

  private addConnectionToTiles(
    connectionGroup: Konva.Group,
    tileKeys: string[]
  ): void {
    this.removeConnectionFromTiles(connectionGroup)
    this.connectionToTiles.set(connectionGroup, new Set(tileKeys))
    tileKeys.forEach((tileKey) => {
      this.ensureTile(tileKey).connections.add(connectionGroup)
    })
  }

  private removeConnectionFromTiles(connectionGroup: Konva.Group): void {
    const tileKeys = this.connectionToTiles.get(connectionGroup)
    if (!tileKeys) return
    tileKeys.forEach((tileKey) => {
      this.virtualTiles.get(tileKey)?.connections.delete(connectionGroup)
    })
    this.connectionToTiles.delete(connectionGroup)
  }

  private reindexConnectionTiles(
    connectionGroup: Konva.Group,
    connection: DiagramConnection
  ): void {
    const tileKeys = this.getConnectionTileKeys(connection)
    if (tileKeys.length === 0) {
      const fromLine = this.getConnectionTileKeysFromGroup(connectionGroup)
      if (fromLine.length > 0) {
        this.addConnectionToTiles(connectionGroup, fromLine)
      }
      return
    }
    this.addConnectionToTiles(connectionGroup, tileKeys)
  }

  /** Stage position of a node inside a lens (matches Konva mount offsets). */
  private getLensStagePosition(node: RenderNode): { x: number; y: number } | null {
    if (!this.scopeRootId) {
      return node.position ? { x: node.position.x, y: node.position.y } : null
    }
    if (!this.isInLensScope(node.id)) return null
    if (node.id === this.scopeRootId) {
      return { ...this.lensContentOrigin }
    }

    const chain: RenderNode[] = []
    let current: RenderNode | undefined = node
    while (current && current.id !== this.scopeRootId) {
      chain.unshift(current)
      current = current.parent
    }
    if (!current) return null

    let x = this.lensContentOrigin.x
    let y = this.lensContentOrigin.y
    let parent: RenderNode = current
    for (const n of chain) {
      const local = this.getLocalPosition(n, parent)
      x += local.x
      y += local.y
      parent = n
    }
    return { x, y }
  }

  private getLensLeafBounds(node: RenderNode): RectBounds | null {
    const pos = this.getLensStagePosition(node)
    if (!pos) return null
    const size = this.getEffectiveNodeSize(node)
    return { x: pos.x, y: pos.y, width: size.width, height: size.height }
  }

  private getLensConnectionAnchorBounds(node: RenderNode): RectBounds | null {
    return this.getLensLeafBounds(node)
  }

  private resolveLensPaintedEndpoint(node: RenderNode): RenderNode | null {
    let current: RenderNode | null = node
    while (current) {
      if (this.scopeRootId && current.id === this.scopeRootId) {
        return this.nodeMap.has(current.id) ? current : null
      }
      if (this.nodeMap.has(current.id)) return current
      current = current.parent ?? null
    }
    return null
  }

  private planLensScopeConnection(connection: DiagramConnection): PlannedConnection | null {
    if (!this.scopeNodeIds || !this.scopeRootId) return null

    const fromNode = this.graphData.allNodes.get(connection.from)
    const toNode = this.graphData.allNodes.get(connection.to)
    if (!fromNode || !toNode) return null
    if (fromNode.visible === false || toNode.visible === false) return null

    const fromIn = this.scopeNodeIds.has(connection.from)
    const toIn = this.scopeNodeIds.has(connection.to)
    if (!fromIn || !toIn) return null

    const fromPainted = this.resolveLensPaintedEndpoint(fromNode)
    const toPainted = this.resolveLensPaintedEndpoint(toNode)
    if (!fromPainted || !toPainted) return null
    if (fromPainted.id === toPainted.id) return null
    const fromBounds = this.getLensConnectionAnchorBounds(fromPainted)
    const toBounds = this.getLensConnectionAnchorBounds(toPainted)
    if (!fromBounds || !toBounds) return null
    return planLensInternalEdge(fromBounds, toBounds, connection.pinName)
  }

  private planConnectionForMainGraph(connection: DiagramConnection) {
    if (this.lensMode && this.scopeRootId) {
      return this.planLensScopeConnection(connection)
    }
    return planMainGraphConnection(
      connection,
      this.graphData,
      this.graphScope,
      (node) => this.graphScope.shouldRenderOnMainGraph(node)
    )
  }

  /**
   * Get all tile keys that intersect with viewport
   */
  private getVisibleTileKeys(): string[] {
    if (!this.stage) return []
    
    const stage = this.stage
    const scale = stage.scaleX()
    const stagePos = stage.position()
    
    // Calculate viewport bounds in world coordinates
    const viewportLeft = -stagePos.x / scale
    const viewportTop = -stagePos.y / scale
    const viewportRight = viewportLeft + this.viewportWidth / scale
    const viewportBottom = viewportTop + this.viewportHeight / scale
    
    // Add some padding for smooth scrolling
    const padding = this.tileSize * 0.5
    const left = viewportLeft - padding
    const top = viewportTop - padding
    const right = viewportRight + padding
    const bottom = viewportBottom + padding
    
    const tileKeys: string[] = []
    const startTileX = Math.floor(left / this.tileSize)
    const endTileX = Math.floor(right / this.tileSize)
    const startTileY = Math.floor(top / this.tileSize)
    const endTileY = Math.floor(bottom / this.tileSize)
    
    for (let tileX = startTileX; tileX <= endTileX; tileX++) {
      for (let tileY = startTileY; tileY <= endTileY; tileY++) {
        tileKeys.push(`${tileX},${tileY}`)
      }
    }
    
    return tileKeys
  }

  /**
   * Load visible tiles into main layer.
   * Every diagram node is indexed in the tile grid; only visible nodes are mounted,
   * nested under a visible parent when possible (stable z-order vs flat Plain mount).
   */
  private loadVisibleTiles(): void {
    if (!this.nodesLayer || !this.connectionsLayer) return

    if (this.lensMode && this.scopeNodeIds) {
      this.loadLensScopeTiles()
      return
    }

    const visibleTileKeys = this.getVisibleTileKeys()
    this.unmountDiagramRootsFromLayer()

    const visibleIds = new Set<string>()
    visibleTileKeys.forEach((tileKey) => {
      const tile = this.virtualTiles.get(tileKey)
      if (!tile) return
      tile.nodes.forEach((group) => {
        const id = this.getKonvaNodeId(group)
        if (id) visibleIds.add(id)
      })
    })

    const paintOrder = this.collectVisibleNodesInPaintOrder(visibleIds)
    paintOrder.forEach((nodeId) => this.mountVisibleDiagramNode(nodeId, visibleIds))
    this.syncDiagramNodeVisibility(visibleIds)

    this.connectionsLayer.removeChildren()
    const addedConnections = new Set<Konva.Group>()
    visibleTileKeys.forEach((tileKey) => {
      const tile = this.virtualTiles.get(tileKey)
      if (!tile) return
      tile.connections.forEach((connection) => {
        if (addedConnections.has(connection)) return
        addedConnections.add(connection)
        this.connectionsLayer!.add(connection)
      })
    })

    this.visibleTiles = new Set(visibleTileKeys)

    if (this.debugTiles || this.debugLayoutContainers) {
      this.renderDebugOverlays()
    }
  }

  private unmountDiagramRootsFromLayer(): void {
    if (!this.nodesLayer) return
    ;[...this.nodesLayer.getChildren()].forEach((child) => {
      child.moveTo(this.nodeStaging)
    })
  }

  private getDiagramVisitRoots(): RenderNode[] {
    if (this.scopeRootId) {
      const root = this.graphData.allNodes.get(this.scopeRootId)
      return root ? [root] : []
    }
    return this.graphData.rootNodes
  }

  private isInLensScope(nodeId: string): boolean {
    if (!this.scopeNodeIds) return true
    return this.scopeNodeIds.has(nodeId)
  }

  private collectVisibleNodesInPaintOrder(visibleIds: Set<string>): string[] {
    const order: string[] = []
    const visit = (node: RenderNode) => {
      if (node.visible === false || !node.position) return
      if (!this.isInLensScope(node.id)) return
      if (visibleIds.has(node.id)) {
        order.push(node.id)
      }
      forEachDirectChild(node, visit)
    }
    this.getDiagramVisitRoots().forEach(visit)
    return order
  }

  /** Mount entire lens subtree (no tile culling). */
  private loadLensScopeTiles(): void {
    if (!this.nodesLayer || !this.connectionsLayer || !this.scopeNodeIds) return

    const visibleIds = new Set(this.scopeNodeIds)
    this.unmountDiagramRootsFromLayer()

    const paintOrder = this.collectVisibleNodesInPaintOrder(visibleIds)
    paintOrder.forEach((nodeId) => this.mountVisibleDiagramNode(nodeId, visibleIds))
    this.syncDiagramNodeVisibility(visibleIds)

    this.connectionsLayer.removeChildren()
    const addedConnections = new Set<Konva.Group>()
    this.connectionMap.forEach((connection) => {
      if (addedConnections.has(connection)) return
      addedConnections.add(connection)
      this.connectionsLayer!.add(connection)
    })

    this.visibleTiles.clear()
    this.batchDrawGraphLayers()
    if (this.debugTiles || this.debugLayoutContainers) {
      this.renderDebugOverlays()
    }
  }

  private mountVisibleDiagramNode(nodeId: string, visibleIds: Set<string>): void {
    const renderNode = this.graphData.allNodes.get(nodeId)
    const group = this.nodeMap.get(nodeId)
    if (!renderNode?.position || !group) return

    const parentRender = renderNode.parent ?? null
    const parentGroup =
      parentRender && visibleIds.has(parentRender.id)
        ? this.nodeMap.get(parentRender.id)
        : undefined

    if (parentGroup) {
      if (group.getParent() !== parentGroup) {
        group.moveTo(parentGroup)
      }
      group.position(this.getLocalPosition(renderNode, parentRender))
      return
    }

    if (group.getParent() !== this.nodesLayer) {
      group.moveTo(this.nodesLayer!)
    }
    group.position(this.getLayerRootPosition(renderNode))
  }

  private getLayerRootPosition(renderNode: RenderNode): { x: number; y: number } {
    if (this.scopeRootId && renderNode.id === this.scopeRootId) {
      return { ...this.lensContentOrigin }
    }
    return { x: renderNode.position.x, y: renderNode.position.y }
  }

  /** Hide nested groups that are off-tile even when an ancestor group is mounted. */
  private syncDiagramNodeVisibility(visibleIds: Set<string>): void {
    this.nodeMap.forEach((group, nodeId) => {
      if (!this.isKonvaGroupOnNodesLayer(group)) {
        group.visible(true)
        return
      }
      group.visible(visibleIds.has(nodeId))
    })
  }

  private isKonvaGroupOnNodesLayer(group: Konva.Group): boolean {
    let current: Konva.Node | null = group
    while (current) {
      if (current === this.nodesLayer) return true
      if (current === this.nodeStaging) return false
      current = current.getParent()
    }
    return false
  }

  private syncKonvaGroupPosition(renderNode: RenderNode, group: Konva.Group): void {
    if (!renderNode.position) return
    const parentRender = renderNode.parent ?? null
    const parentGroup = parentRender ? this.nodeMap.get(parentRender.id) : undefined
    if (parentGroup && group.getParent() === parentGroup) {
      group.position(this.getLocalPosition(renderNode, parentRender))
    } else if (group.getParent() === this.nodesLayer) {
      group.position(this.getLayerRootPosition(renderNode))
    } else {
      group.position(this.getLocalPosition(renderNode, parentRender))
    }
  }

  /**
   * Render debug tile rectangles and/or cola compound containers.
   */
  private renderDebugOverlays(): void {
    if (!this.stage) return
    this.debugLayer?.destroyChildren()
    if (this.debugTiles) this.paintDebugTiles()
    if (this.debugLayoutContainers) this.paintDebugLayoutContainers()
  }

  private paintDebugTiles(): void {
    if (!this.debugLayer || !this.stage) return
    const visibleTileKeys = this.getVisibleTileKeys()

    visibleTileKeys.forEach((tileKey) => {
      const [tileX, tileY] = tileKey.split(',').map(Number)
      const x = tileX * this.tileSize
      const y = tileY * this.tileSize

      const debugTile = new Konva.Rect({
        x: x,
        y: y,
        width: this.tileSize,
        height: this.tileSize,
        stroke: '#ff0000',
        strokeWidth: 2,
        fill: 'rgba(255, 0, 0, 0.1)',
        listening: false,
        name: 'debug-tile',
      })

      const tileInfo = new Konva.Text({
        x: x + 5,
        y: y + 5,
        text: `${tileKey}\n${this.virtualTiles.get(tileKey)?.nodes.size || 0}n\n${this.virtualTiles.get(tileKey)?.connections.size || 0}c`,
        fontSize: 12,
        fontFamily: 'Arial',
        fill: '#ff0000',
        listening: false,
        name: 'debug-tile',
      })

      this.debugLayer!.add(debugTile)
      this.debugLayer!.add(tileInfo)
    })

    const viewportRect = new Konva.Rect({
      x: -this.stage.position().x / this.stage.scaleX(),
      y: -this.stage.position().y / this.stage.scaleY(),
      width: this.viewportWidth / this.stage.scaleX(),
      height: this.viewportHeight / this.stage.scaleY(),
      stroke: '#00ff00',
      strokeWidth: 3,
      fill: 'rgba(0, 255, 0, 0.1)',
      listening: false,
      name: 'debug-viewport',
    })

    this.debugLayer.add(viewportRect)
  }

  private paintDebugLayoutContainers(): void {
    if (!this.debugLayer) return
    const visibleIds = new Set<string>()
    this.nodeMap.forEach((group, nodeId) => {
      if (group.visible()) visibleIds.add(nodeId)
    })
    if (visibleIds.size === 0) return

    const paintParents = new Set(visibleIds)
    for (const id of visibleIds) {
      let current = this.graphData.allNodes.get(id)?.parent
      while (current) {
        paintParents.add(current.id)
        current = current.parent
      }
    }

    const css = ['#22c55e', '#eab308', '#38bdf8', '#f472b6', '#a78bfa']

    for (const node of this.graphData.allNodes.values()) {
      const boxes = node.layoutDebugContainers
      if (!boxes?.length) continue
      if (!paintParents.has(node.id)) continue
      if (!this.isInLensScope(node.id)) continue
      const origin = this.lensMode
        ? this.getLensStagePosition(node)
        : getWorldPosition(node)
      if (!origin) continue

      for (const box of boxes) {
        const stroke = css[Math.abs(box.depth) % css.length]!
        this.debugLayer.add(
          new Konva.Rect({
            x: origin.x + box.x,
            y: origin.y + box.y,
            width: box.width,
            height: box.height,
            stroke,
            strokeWidth: 2,
            fillEnabled: false,
            listening: false,
            name: 'debug-layout-container',
          })
        )
        this.debugLayer.add(
          new Konva.Text({
            x: origin.x + box.x + 4,
            y: origin.y + box.y + 4,
            text: `${box.role} d${box.depth}${box.innerHubId ? `\n${box.innerHubId}` : ''}`,
            fontSize: 11,
            fontFamily: 'Arial',
            fill: stroke,
            listening: false,
            name: 'debug-layout-container',
          })
        )
      }
    }
  }

  /**
   * Update tile visibility based on viewport
   */
  private updateTileVisibility(): void {
    if (!this.stage) return
    
    const currentViewport = {
      x: -this.stage.position().x / this.stage.scaleX(),
      y: -this.stage.position().y / this.stage.scaleY(),
      width: this.viewportWidth / this.stage.scaleX(),
      height: this.viewportHeight / this.stage.scaleY()
    }
    
    // Check if viewport changed significantly
    if (this.lastViewport && 
        Math.abs(currentViewport.x - this.lastViewport.x) < this.tileSize * 0.1 &&
        Math.abs(currentViewport.y - this.lastViewport.y) < this.tileSize * 0.1 &&
        Math.abs(currentViewport.width - this.lastViewport.width) < this.tileSize * 0.1 &&
        Math.abs(currentViewport.height - this.lastViewport.height) < this.tileSize * 0.1) {
      return // No significant change
    }
    
    this.lastViewport = currentViewport
    
    // Reload visible tiles
    this.loadVisibleTiles()
  }

  /**
   * Update tiles for moved nodes - optimized for large numbers of nodes
   */
  private updateNodeTiles(movedNodeIds: string[]): void {
    if (movedNodeIds.length === 0) return

    // Batch process: collect all changes first, then apply them
    const tileUpdates = new Map<string, { toAdd: Konva.Group[], toRemove: Konva.Group[] }>()
    
    // Initialize tile updates map
    const initializeTile = (tileKey: string) => {
      if (!tileUpdates.has(tileKey)) {
        tileUpdates.set(tileKey, { toAdd: [], toRemove: [] })
      }
    }

    // Process all moved nodes
    movedNodeIds.forEach(nodeId => {
      const renderNode = this.graphData.allNodes.get(nodeId)
      if (!renderNode || !renderNode.position) return

      const nodeGroup = this.nodeMap.get(nodeId)
      if (!nodeGroup) return

      // Calculate new tile keys for this node
      const newTileKeys = this.getNodeTileKeys(renderNode)
      
      // Find current tile keys where this node exists (using reverse index)
      const currentTileKeys: string[] = []
      const nodeTiles = this.nodeToTiles.get(nodeGroup)
      if (nodeTiles) {
        currentTileKeys.push(...Array.from(nodeTiles))
      }

      // Mark tiles for removal
      currentTileKeys.forEach(tileKey => {
        initializeTile(tileKey)
        tileUpdates.get(tileKey)!.toRemove.push(nodeGroup)
      })

      // Mark tiles for addition
      newTileKeys.forEach(tileKey => {
        initializeTile(tileKey)
        tileUpdates.get(tileKey)!.toAdd.push(nodeGroup)
      })
    })

    // Apply all tile updates in batch
    tileUpdates.forEach((updates, tileKey) => {
      const tile = this.virtualTiles.get(tileKey)
      
      if (tile) {
        // Remove nodes from existing tile
        updates.toRemove.forEach(nodeGroup => {
          tile.nodes.delete(nodeGroup)
          // Update reverse index
          const nodeTiles = this.nodeToTiles.get(nodeGroup)
          if (nodeTiles) {
            nodeTiles.delete(tileKey)
            if (nodeTiles.size === 0) {
              this.nodeToTiles.delete(nodeGroup)
            }
          }
        })
        
        // Add nodes to existing tile
        updates.toAdd.forEach(nodeGroup => tile.nodes.add(nodeGroup))
        updates.toAdd.forEach(nodeGroup => {
          // Update reverse index
          if (!this.nodeToTiles.has(nodeGroup)) {
            this.nodeToTiles.set(nodeGroup, new Set())
          }
          this.nodeToTiles.get(nodeGroup)!.add(tileKey)
        })
      } else if (updates.toAdd.length > 0) {
        // Create new tile with nodes
        this.virtualTiles.set(tileKey, {
          nodes: new Set(updates.toAdd),
          connections: new Set(),
        })
        // Update reverse index for new tile
        updates.toAdd.forEach(nodeGroup => {
          if (!this.nodeToTiles.has(nodeGroup)) {
            this.nodeToTiles.set(nodeGroup, new Set())
          }
          this.nodeToTiles.get(nodeGroup)!.add(tileKey)
        })
      }
    })
  }

  /** Position relative to parent group (children store local coords on RenderNode). */
  private getLocalPosition(
    node: RenderNode,
    _parentRenderNode: RenderNode | null
  ): { x: number; y: number } {
    if (!node.position) return { x: 0, y: 0 }
    return { x: node.position.x, y: node.position.y }
  }

  private getNodeVisualOptions(node: RenderNode): KonvaNodeVisualOptions | undefined {
    if (isDiagramPortalNode(node)) {
      const sourceId = (node.metadata?.originalFrom as string | undefined) ?? ''
      const pin = node.metadata?.pinName as string | undefined
      const sourceLabel =
        sourceId.length > 22 ? `${sourceId.slice(0, 20)}…` : sourceId || 'portal'
      const stateId = node.metadata?.stateId as string | undefined
      const stateLabel =
        stateId && stateId.length > 18 ? `${stateId.slice(0, 16)}…` : stateId
      return {
        titleText: sourceLabel,
        subtitleText: isStateEntryPortalNode(node)
          ? pin
            ? `portal → ${stateLabel ?? 'state'} ← ${pin}`
            : `portal → ${stateLabel ?? 'state'}`
          : pin
            ? `portal ← ${pin}`
            : 'portal ←',
        fill: '#243044',
        stroke: '#7eb6e8',
        titleFill: '#e8f1fa',
        subtitleFill: '#9ab0c4',
      }
    }
    if (isStateMachineDiagramRoot(node)) {
      const smId =
        (node.metadata?.stateMachineNodeId as string | undefined) ??
        (node.metadata?.ownerStateMachineId as string | undefined)
      return {
        titleText: smId ?? node.id,
        subtitleText: 'State Machine',
        fill: '#1e2430',
        stroke: '#5a9fd4',
        titleFill: '#e8eef4',
        subtitleFill: '#9ab0c4',
      }
    }
    if (isStateOverviewLeaf(node)) {
      return {
        titleText: getStateOverviewTitleText(node),
        subtitleText: 'State',
        fill: '#1a2834',
        stroke: '#5fa8d3',
        titleFill: '#e8eef4',
        subtitleFill: '#9ab0c4',
      }
    }
    if (isSmInputChainOverviewLeaf(node)) {
      return {
        titleText: getSmInputChainOverviewTitleText(node, this.graphData.handlesRegistry),
        subtitleText: getSmInputChainOverviewSubtitle(node),
        fill: '#1f2a24',
        stroke: '#6dbf8a',
        titleFill: '#e8f4ec',
        subtitleFill: '#9ab0a4',
      }
    }
    const smProperty = node.metadata?.smPropertyName as string | undefined
    if (smProperty) {
      const shortType = node.type.replace(/^animAnimNode_/, '')
      return {
        titleText: smProperty,
        subtitleText: shortType,
        fill: '#2a2d35',
        stroke: '#6a7080',
        titleFill: '#c8cdd6',
        subtitleFill: '#8a909a',
      }
    }
    if (isDiagramGroupNode(node)) {
      const label = readDiagramGroupLabel(node).trim()
      return {
        titleText: label || 'Group',
        subtitleText: 'Group',
        fill: 'rgba(0, 0, 0, 0.04)',
        stroke: 'rgba(180, 185, 195, 0.55)',
        strokeDash: [6, 4],
        titleFill: 'rgba(210, 214, 222, 0.9)',
        subtitleFill: 'rgba(150, 156, 168, 0.75)',
      }
    }
    if (isDiagramNoteNode(node)) {
      return {
        titleText: 'Note',
        subtitleText: '',
        fill: 'rgba(72, 62, 32, 0.55)',
        stroke: 'rgba(200, 170, 80, 0.7)',
        titleFill: 'rgba(240, 220, 150, 0.95)',
        subtitleFill: 'rgba(180, 160, 100, 0.7)',
      }
    }
    if (node.isGroup || node.type === 'PropertyGroup') {
      const propertyName = node.metadata?.propertyName as string | undefined
      return {
        titleText: propertyName || node.id,
        subtitleText: 'PropertyGroup',
        fill: 'rgba(0, 0, 0, 0.04)',
        stroke: 'rgba(180, 185, 195, 0.55)',
        strokeDash: [6, 4],
        titleFill: 'rgba(210, 214, 222, 0.9)',
        subtitleFill: 'rgba(150, 156, 168, 0.75)',
      }
    }
    return undefined
  }

  private buildKonvaGroupForRenderNode(
    node: RenderNode,
    localPosition: { x: number; y: number }
  ): Konva.Group | null {
    const konvaGroup = this.createKonvaNode(node, localPosition, this.getNodeVisualOptions(node))
    if (!konvaGroup) return null

    return konvaGroup
  }

  /**
   * Mirror RenderNode tree: each diagram node is a Konva.Group nested in its parent group.
   */
  /** Nest overview-slot chrome under a painted overview / SM leaf card. */
  private renderOverviewSlotChrome(node: RenderNode, konvaGroup: Konva.Group): void {
    for (const child of getChildSlot(node, OVERVIEW_CHILD_SLOT)) {
      if (child.visible === false) continue
      this.renderDiagramSubtree(child, konvaGroup, node)
    }
  }

  private renderDiagramSubtree(
    node: RenderNode,
    parentKonva: Konva.Container,
    parentRenderNode: RenderNode | null
  ): void {
    if (!node.position || node.visible === false || this.nodeMap.has(node.id)) return

    // SM diagram roots are leaves on the canvas; body stays for scoped views.
    if (isStateMachineDiagramRoot(node)) {
      const konvaGroup = this.buildKonvaGroupForRenderNode(
        node,
        this.getLocalPosition(node, parentRenderNode)
      )
      if (!konvaGroup) return
      parentKonva.add(konvaGroup)
      this.registerKonvaNode(node, konvaGroup)
      this.renderOverviewSlotChrome(node, konvaGroup)
      return
    }

    // State / conditionalEntry overview leaves; body stays for scoped views.
    if (isDiagramOverviewLeaf(node)) {
      const konvaGroup = this.buildKonvaGroupForRenderNode(
        node,
        this.getLocalPosition(node, parentRenderNode)
      )
      if (!konvaGroup) return
      parentKonva.add(konvaGroup)
      this.registerKonvaNode(node, konvaGroup)
      this.renderOverviewSlotChrome(node, konvaGroup)
      return
    }

    const konvaGroup = this.buildKonvaGroupForRenderNode(
      node,
      this.getLocalPosition(node, parentRenderNode)
    )
    if (!konvaGroup) return

    parentKonva.add(konvaGroup)
    this.registerKonvaNode(node, konvaGroup)

    forEachDirectChild(
      node,
      (child) => {
        if (child.visible === false) return
        this.renderDiagramSubtree(child, konvaGroup, node)
      },
      { slots: [DEFAULT_CHILD_SLOT] }
    )
  }

  private getKonvaContainerForRenderParent(parentRender: RenderNode | null): Konva.Container {
    if (!parentRender) return this.nodeStaging
    return this.nodeMap.get(parentRender.id) ?? this.nodeStaging
  }

  private mountDiagramNode(renderNode: RenderNode, withChildren: boolean): void {
    const parentRender = renderNode.parent ?? null
    const parentKonva = this.getKonvaContainerForRenderParent(parentRender)
    if (withChildren) {
      this.renderDiagramSubtree(renderNode, parentKonva, parentRender)
      return
    }
    if (!renderNode.position || renderNode.visible === false || this.nodeMap.has(renderNode.id)) {
      return
    }
    const konvaGroup = this.buildKonvaGroupForRenderNode(
      renderNode,
      this.getLocalPosition(renderNode, parentRender)
    )
    if (!konvaGroup) return
    parentKonva.add(konvaGroup)
    this.registerKonvaNode(renderNode, konvaGroup)
  }

  private renderNodes(): void {
    this.virtualTiles.clear()
    this.getDiagramVisitRoots().forEach((root) => {
      this.renderDiagramSubtree(root, this.nodeStaging, null)
    })
  }

  private registerKonvaNode(renderNode: RenderNode, konvaNode: Konva.Group): void {
    if (!this.nodeToTiles.has(konvaNode)) {
      this.nodeToTiles.set(konvaNode, new Set())
    }
    const tileKeys = this.getNodeTileKeys(renderNode)
    tileKeys.forEach((tileKey) => {
      this.ensureTile(tileKey).nodes.add(konvaNode)
      this.nodeToTiles.get(konvaNode)!.add(tileKey)
    })
  }


  /**
   * Create description text for a node
   */
  private createDescriptionText(description: string, nodeWidth: number): Konva.Text {
    const desc = description.trim()
    
    return new Konva.Text({
      text: desc,
      x: 5,
      y: 35, // Position after ID and type text
      fontSize: 9,
      fontFamily: 'Arial',
      fill: '#88cc88',
      align: 'left', // Left align for better readability at the top
      width: nodeWidth - 10, // Leave some padding from node edges
      perfectDrawEnabled: false,
      listening: false,
      fontStyle: 'italic',
    })
  }

  /**
   * Create a Konva node from RenderNode
   */
  private createKonvaNode(
    renderNode: RenderNode,
    localPosition: { x: number; y: number },
    visualOptions?: KonvaNodeVisualOptions
  ): Konva.Group | null {
    if (!renderNode.position) return null

    const nodeId = renderNode.id || 'Unknown'
    const nodeType = renderNode.type || 'Unknown'
    const isSelected = this.isNodeSelected(nodeId)
    const titleText = visualOptions?.titleText ?? (nodeId.length > 50 ? nodeId.slice(0, 50) + '...' : nodeId)
    const subtitleText = visualOptions?.subtitleText ?? (nodeType.length > 50 ? nodeType.slice(0, 50) + '...' : nodeType)

    const nodeGroup = new Konva.Group({
      x: localPosition.x,
      y: localPosition.y,
      id: nodeId,
      name: 'diagram-node',
      perfectDrawEnabled: false,
    })

    const { width: nodeWidth, height: nodeHeight } = this.getEffectiveNodeSize(renderNode)
    const cornerRadius = 8

    // Create background rectangle
    const background = new Konva.Rect({
      width: nodeWidth,
      height: nodeHeight,
      fill: visualOptions?.fill ?? this.getNodeBackgroundColorHex(nodeType),
      stroke: isSelected ? '#00ff88' : (visualOptions?.stroke ?? renderNode.borderColor ?? '#333'),
      strokeWidth: isSelected ? 3 : (renderNode.borderWidth || 1),
      dash: visualOptions?.strokeDash,
      cornerRadius: cornerRadius,
      perfectDrawEnabled: false,
      shadowForStrokeEnabled: false,
    })

    // Create selection highlight
    if (isSelected) {
      const selectionRect = new Konva.Rect({
        width: nodeWidth + 8,
        height: nodeHeight + 8,
        x: -4,
        y: -4,
        stroke: '#00ff88',
        strokeWidth: 4,
        dash: [8, 4],
        cornerRadius: cornerRadius + 4,
        perfectDrawEnabled: false,
        listening: false,
      })
      nodeGroup.add(selectionRect)
    }

    // Create node ID text
    const idText = new Konva.Text({
      text: titleText,
      x: 5,
      y: 5,
      fontSize: 12,
      fontFamily: 'Arial',
      fill: visualOptions?.titleFill ?? renderNode.color ?? '#1e3a5f',
      align: 'left',
      width: nodeWidth - 10,
      perfectDrawEnabled: false,
      listening: false,
    })

    // Create node type text
    const typeText = new Konva.Text({
      text: subtitleText,
      x: 5,
      y: 20,
      fontSize: 10,
      fontFamily: 'Arial',
      fill: visualOptions?.subtitleFill ?? '#5a6a7a',
      align: 'left',
      width: nodeWidth - 10,
      wrap: 'none',
      ellipsis: true,
      perfectDrawEnabled: false,
      listening: false,
    })

    // Create description text if available
    let descriptionText: Konva.Text | null = null
    if (renderNode.description && renderNode.description.trim()) {
      descriptionText = this.createDescriptionText(renderNode.description, nodeWidth)
    }

    // Add elements to group
    nodeGroup.add(background)
    nodeGroup.add(idText)
    nodeGroup.add(typeText)
    if (descriptionText) {
      nodeGroup.add(descriptionText)
    }

    // Add to fast lookup map
    this.nodeMap.set(nodeId, nodeGroup)
    
    // Initialize reverse index
    this.nodeToTiles.set(nodeGroup, new Set())

    return nodeGroup
  }

  private setupStagePanHandlers(): void {
    if (!this.stage) return

    const endPan = () => {
      this.panSession = null
      if (this.stage) {
        this.stage.container().style.cursor = 'default'
      }
    }

    this.stage.on('mousedown', (e) => {
      const evt = e.evt as MouseEvent
      if (evt.button !== 1) return

      evt.preventDefault()

      const pointer = this.stage!.getPointerPosition()
      if (!pointer) return

      this.stage!.container().style.cursor = 'grabbing'
      this.panSession = {
        startPointer: { x: pointer.x, y: pointer.y },
        startStagePos: { x: this.stage!.x(), y: this.stage!.y() },
      }
    })

    this.stage.on('mousemove', () => {
      if (!this.panSession || !this.stage) return

      const pointer = this.stage.getPointerPosition()
      if (!pointer) return

      const dx = pointer.x - this.panSession.startPointer.x
      const dy = pointer.y - this.panSession.startPointer.y

      this.stage.position({
        x: this.panSession.startStagePos.x + dx,
        y: this.panSession.startStagePos.y + dy,
      })
      this.panX = this.stage.x()
      this.panY = this.stage.y()
      this.updateTileVisibility()
      this.batchDrawGraphLayers()
    })

    this.stage.on('mouseup', (e) => {
      const evt = e.evt as MouseEvent
      if (evt.button === 1 || this.panSession) {
        endPan()
      }
    })

    this.stage.on('mouseleave', () => {
      if (this.panSession) {
        endPan()
      }
    })

    // Suppress browser autoscroll / auxiliary-click UI on middle press
    this.stage.on('contextmenu', (e) => {
      const evt = e.evt as MouseEvent
      if (evt.button === 1) {
        evt.preventDefault()
      }
    })
  }

  private getKonvaNodeId(node: Konva.Node): string {
    const id = node.id()
    if (id) return id
    const attrsId = node.getAttr('id')
    return typeof attrsId === 'string' ? attrsId : ''
  }

  /**
   * Update node selection state
   */
  private updateNodeSelection(nodeGroup: Konva.Node, isSelected: boolean): void {
    if (!(nodeGroup instanceof Konva.Group)) return
    
    // Find background rectangle
    const background = nodeGroup.children.find((child: Konva.Node) => child instanceof Konva.Rect) as Konva.Rect
    if (!background) return

    if (isSelected) {
      // Add selection highlight
      background.stroke('#00ff88')
      background.strokeWidth(3)
      
      const nodeWidth = background.width()
      const nodeHeight = background.height()

      // Add selection rectangle if not exists
      let selectionRect = nodeGroup.children.find((child: Konva.Node) => 
        child instanceof Konva.Rect && (child as Konva.Rect).stroke() === '#00ff88' && (child as Konva.Rect).dash()
      ) as Konva.Rect
      
      if (!selectionRect) {
        selectionRect = new Konva.Rect({
          width: nodeWidth + 8,
          height: nodeHeight + 8,
          x: -4,
          y: -4,
          stroke: '#00ff88',
          strokeWidth: 4,
          dash: [8, 4],
          cornerRadius: 12
        })
        nodeGroup.add(selectionRect)
      } else {
        selectionRect.size({ width: nodeWidth + 8, height: nodeHeight + 8 })
        selectionRect.position({ x: -4, y: -4 })
      }
    } else {
      // Remove selection highlight
      background.stroke('#333')
      background.strokeWidth(1)
      
      // Remove selection rectangle
      const selectionRect = nodeGroup.children.find((child: Konva.Node) => 
        child instanceof Konva.Rect && (child as Konva.Rect).stroke() === '#00ff88' && (child as Konva.Rect).dash()
      )
      if (selectionRect) {
        selectionRect.destroy()
      }
    }
  }

  /**
   * Render all connections
   */
  private getConnectionsToRender(): DiagramConnection[] {
    const connections = this.graphData.connections ?? []
    if (!this.scopeNodeIds) return connections
    return filterConnectionsForLensScope(connections, this.scopeNodeIds)
  }

  private renderConnections(): void {
    if (!this.connectionsLayer || !this.showConnections) return

    this.getConnectionsToRender().forEach((connection) => {
      const konvaConnection = this.createKonvaConnection(connection)
      if (!konvaConnection) return

      const connectionKey = getConnectionKey(connection)
      this.connectionMap.set(connectionKey, konvaConnection)
      this.reindexConnectionTiles(konvaConnection, connection)
    })
  }

  /**
   * Create a Konva connection for tile storage
   */
  private createKonvaConnection(connection: DiagramConnection): Konva.Group | null {
    const connectionKey = getConnectionKey(connection)
    const planned = this.planConnectionForMainGraph(connection)
    if (!planned) return null

    const isSelectedConnection =
      this.selectedNodeIds.size > 0 &&
      (this.selectedNodeIds.has(connection.from) || this.selectedNodeIds.has(connection.to))

    const useHighlight = isSelectedConnection && this.highlightSelectedNodeConnections
    const stroke = useHighlight
      ? this.selectedNodeConnectionColor
      : `rgba(0, 255, 136, ${this.connectionOpacity})`

    const connectionGroup = createPlannedConnectionShape(planned, {
      opacity: useHighlight ? this.selectedNodeConnectionOpacity : this.connectionOpacity,
      stroke,
      strokeWidth: useHighlight ? this.selectedNodeConnectionWidth : 2,
      strokeDash: planned.dashed ? [10, 6] : undefined,
      showArrow: planned.showArrow,
      showLabel: this.connectionLabels,
    })

    connectionGroup.id(connectionKey)
    connectionGroup.setAttr('from', connection.from)
    connectionGroup.setAttr('to', connection.to)

    return connectionGroup
  }

  private findConnectionByKey(key: string): DiagramConnection | undefined {
    return this.graphData.connections.find((c) => getConnectionKey(c) === key)
  }

  private applyPlannedToConnectionGroup(
    connectionGroup: Konva.Group,
    planned: PlannedConnection
  ): void {
    const showArrow = planned.showArrow !== false
    const { from, to } = adjustConnectionEndpointsForDrawing(planned.from, planned.to, showArrow)
    const points = [from.x, from.y, to.x, to.y]

    const line = connectionGroup.children.find(
      (child: Konva.Node) => child instanceof Konva.Line
    ) as Konva.Line
    const arrow = connectionGroup.children.find(
      (child: Konva.Node) => child instanceof Konva.Arrow
    ) as Konva.Arrow

    if (line) line.points(points)
    if (arrow) arrow.points(points)

    const label = connectionGroup.children.find(
      (child: Konva.Node) => child instanceof Konva.Text
    ) as Konva.Text
    const labelBg = connectionGroup.children.find(
      (child: Konva.Node) => child instanceof Konva.Rect
    ) as Konva.Rect

    if (label && labelBg) {
      const midX = (from.x + to.x) / 2
      const midY = (from.y + to.y) / 2
      repositionConnectionLabel(label, labelBg, midX, midY)
    }
  }

  private refreshConnectionGroupGeometry(connectionGroup: Konva.Group): void {
    const connection = this.findConnectionByKey(connectionGroup.id())
    if (!connection) return

    const planned = this.planConnectionForMainGraph(connection)
    if (!planned) {
      connectionGroup.visible(false)
      return
    }
    connectionGroup.visible(true)
    this.applyPlannedToConnectionGroup(connectionGroup, planned)
    if (this.interactiveEditDepth === 0) {
      this.reindexConnectionTiles(connectionGroup, connection)
    }
  }

  /**
   * Handle zoom
   */
  public setZoom(zoom: number, cursorX?: number, cursorY?: number): void {
    if (!this.stage) return

    const newZoom = Math.max(0.1, Math.min(5.0, zoom))

    if (cursorX !== undefined && cursorY !== undefined && newZoom !== this.zoom) {
      this.zoomToPosition(newZoom, cursorX, cursorY)
    } else {
      this.zoom = newZoom
      this.stage.scale({ x: newZoom, y: newZoom })
      
      // Update tile visibility after zoom
      this.updateTileVisibility()

      this.batchDrawGraphLayers()
    }
  }

  /**
   * Zoom to specific position
   */
  public zoomToPosition(zoom: number, cursorX: number, cursorY: number): void {
    if (!this.stage) return

    const newZoom = Math.max(0.1, Math.min(5.0, zoom))

    if (newZoom !== this.zoom) {
      const mousePointTo = {
        x: (cursorX - this.stage.x()) / this.zoom,
        y: (cursorY - this.stage.y()) / this.zoom,
      }

      this.zoom = newZoom
      this.stage.scale({ x: newZoom, y: newZoom })

      const newPos = {
        x: cursorX - mousePointTo.x * newZoom,
        y: cursorY - mousePointTo.y * newZoom,
      }

      this.stage.position(newPos)
      this.panX = newPos.x
      this.panY = newPos.y
      
      // Update tile visibility after zoom
      this.updateTileVisibility()

      this.batchDrawGraphLayers()
    }
  }

  /**
   * Handle pan
   */
  public setPan(x: number, y: number): void {
    if (!this.stage) return

    this.panX = x
    this.panY = y
    this.stage.position({ x, y })
    
    // Update tile visibility after panning
    this.updateTileVisibility()

    this.batchDrawGraphLayers()
  }

  private isNodeSelected(nodeId: string): boolean {
    return this.selectedNodeIds.has(nodeId)
  }

  /**
   * Set selected nodes
   */
  public setSelectedNodes(nodeIds: string[], primaryNodeId: string | null, silent = false): void {
    const nextIds = new Set(nodeIds)

    for (const id of this.selectedNodeIds) {
      if (!nextIds.has(id)) {
        const prev = this.nodeMap.get(id)
        if (prev) this.updateNodeSelection(prev, false)
      }
    }

    for (const id of nextIds) {
      if (!this.selectedNodeIds.has(id)) {
        const next = this.nodeMap.get(id)
        if (next) this.updateNodeSelection(next, true)
      }
    }

    this.selectedNodeIds = nextIds
    this.primarySelectedNodeId = primaryNodeId

    this.updateConnectionsHighlighting()

    if (!silent && this.onNodeSelect) {
      this.onNodeSelect([...nextIds], primaryNodeId)
    }

    this.batchDrawGraphLayers()
  }

  /**
   * Set selected node (single selection)
   */
  public setSelectedNode(nodeId: string | null, silent = false): void {
    this.setSelectedNodes(nodeId ? [nodeId] : [], nodeId, silent)
  }

  /**
   * Update connections highlighting based on selected node
   */
  private updateConnectionsHighlighting(): void {
    const applyHighlight = (connectionGroup: Konva.Group, defaultOpacity: number) => {
      const from = connectionGroup.getAttr('from')
      const to = connectionGroup.getAttr('to')
      const isHighlighted =
        this.selectedNodeIds.size > 0 &&
        (this.selectedNodeIds.has(from) || this.selectedNodeIds.has(to))

      const line = connectionGroup.children.find(
        (child: Konva.Node) => child instanceof Konva.Line
      ) as Konva.Line
      const arrow = connectionGroup.children.find(
        (child: Konva.Node) => child instanceof Konva.Arrow
      ) as Konva.Arrow

      if (!line || !arrow) return

      if (isHighlighted && this.highlightSelectedNodeConnections) {
        line.stroke(this.selectedNodeConnectionColor)
        line.strokeWidth(this.selectedNodeConnectionWidth)
        arrow.fill(this.selectedNodeConnectionColor)
        arrow.stroke(this.selectedNodeConnectionColor)
        arrow.strokeWidth(this.selectedNodeConnectionWidth)
      } else {
        line.stroke(`rgba(0, 255, 136, ${defaultOpacity})`)
        line.strokeWidth(2)
        arrow.fill(`rgba(0, 255, 136, ${defaultOpacity})`)
        arrow.stroke(`rgba(0, 255, 136, ${defaultOpacity})`)
        arrow.strokeWidth(2)
      }
    }

    this.connectionMap.forEach((group) => applyHighlight(group, this.connectionOpacity))
  }

  /**
   * Center view on all nodes
   */
  public centerOnAllNodes(): void {
    if (!this.stage) return

    if (this.graphData.allNodes.size === 0) return

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity

    this.graphData.allNodes.forEach((node) => {
      const world = getWorldPosition(node)
      if (!world) return

      const nodeWidth = node.size?.width || 120
      const nodeHeight = node.size?.height || 80

      minX = Math.min(minX, world.x)
      minY = Math.min(minY, world.y)
      maxX = Math.max(maxX, world.x + nodeWidth)
      maxY = Math.max(maxY, world.y + nodeHeight)
    })

    const centerX = (minX + maxX) / 2
    const centerY = (minY + maxY) / 2

    const stageCenterX = this.stage.width() / 2
    const stageCenterY = this.stage.height() / 2

    this.setPan(stageCenterX - centerX * this.zoom, stageCenterY - centerY * this.zoom)
  }

  /**
   * Pan to specific node
   */
  public panToNode(nodeId: string): boolean {
    const node = this.graphData.allNodes.get(nodeId)
    if (!node) return false
    const world = getWorldPosition(node)
    if (!world || !this.stage) {
      return false
    }

    const nodeWidth = node.size?.width || 120
    const nodeHeight = node.size?.height || 80
    const nodeCenterX = world.x + nodeWidth / 2
    const nodeCenterY = world.y + nodeHeight / 2

    const stageCenterX = this.stage.width() / 2
    const stageCenterY = this.stage.height() / 2

    this.setPan(stageCenterX - nodeCenterX * this.zoom, stageCenterY - nodeCenterY * this.zoom)
    return true
  }

  /**
   * Pan to specific node with zoom
   */
  public panToNodeWithZoom(nodeId: string, zoom: number = 1.5): boolean {
    this.setZoom(zoom)
    return this.panToNode(nodeId)
  }

  /**
   * Reset view to default position and zoom
   */
  public resetView(): void {
    if (!this.stage) return

    if (this.lensMode) {
      this.fitViewToScope()
      return
    }

    this.zoom = 1.0
    this.panX = 0
    this.panY = 0
    this.stage.scale({ x: 1, y: 1 })
    this.stage.position({ x: 0, y: 0 })
    this.syncDotGrid()
    this.stage.batchDraw()
  }

  /** Zoom/pan so the lens subtree fills the viewport. */
  public fitViewToScope(padding = 20): void {
    if (!this.stage || !this.scopeRootId) return

    const rootGroup = this.nodeMap.get(this.scopeRootId)
    if (!rootGroup) return

    const rect = rootGroup.getClientRect({ relativeTo: this.stage, skipShadow: true })
    if (rect.width < 1 || rect.height < 1) return

    const scaleX = (this.viewportWidth - padding * 2) / rect.width
    const scaleY = (this.viewportHeight - padding * 2) / rect.height
    const scale = Math.max(0.05, Math.min(3, Math.min(scaleX, scaleY)))

    const contentCenterX = rect.x + rect.width / 2
    const contentCenterY = rect.y + rect.height / 2
    const viewCenterX = this.viewportWidth / 2
    const viewCenterY = this.viewportHeight / 2

    this.zoom = scale
    this.panX = viewCenterX - contentCenterX * scale
    this.panY = viewCenterY - contentCenterY * scale

    this.stage.scale({ x: scale, y: scale })
    this.stage.position({ x: this.panX, y: this.panY })
    this.syncDotGrid()
    this.stage.batchDraw()
  }

  /**
   * Get current view state
   */
  public getViewState(): { zoom: number, panX: number, panY: number } {
    return {
      zoom: this.zoom,
      panX: this.panX,
      panY: this.panY
    }
  }

  /**
   * Set view state
   */
  public setViewState(state: { zoom: number, panX: number, panY: number }): void {
    if (!this.stage) return

    this.zoom = Math.max(0.1, Math.min(5.0, state.zoom))
    this.panX = state.panX
    this.panY = state.panY

    this.stage.scale({ x: this.zoom, y: this.zoom })
    this.stage.position({ x: this.panX, y: this.panY })
    this.syncDotGrid()
    this.stage.batchDraw()
  }

  /**
   * Connection rendering controls
   */
  public setShowConnections(show: boolean): void {
    this.showConnections = show
    this._render()
  }

  public setConnectionOpacity(opacity: number): void {
    this.connectionOpacity = Math.max(0.1, Math.min(1.0, opacity))
    this._render()
  }

  public setShowConnectionLabels(show: boolean): void {
    this.connectionLabels = show
    this._render()
  }

  public setShowConnectionArrows(show: boolean): void {
    this.connectionArrows = show
    this._render()
  }

  /**
   * Set callback for node selection
   */
  public setOnNodeSelect(callback: (nodeIds: string[], primaryNodeId: string | null, event?: MouseEvent) => void): void {
    this.onNodeSelect = callback
  }

  public setInteractionGate(gate: () => boolean): void {
    this.interactionGate = gate
  }

  /**
   * Get currently selected node IDs
   */
  public getSelectedNodeIds(): string[] {
    return [...this.selectedNodeIds]
  }

  /**
   * Get primary selected node ID
   */
  public getSelectedNodeId(): string | null {
    return this.primarySelectedNodeId
  }

  /**
   * Get node at screen coordinates
   */
  public getNodeAtScreenPosition(_screenX: number, _screenY: number): RenderNode | null {
    if (!this.stage) return null

    // Convert screen coordinates to stage coordinates
    const stagePos = this.stage.getRelativePointerPosition()
    if (!stagePos) return null

    // Find node at this position
    const node = this.stage.getIntersection(stagePos)
    if (node && node.getParent() === this.nodesLayer) {
      const nodeId = node.getAttr('id')
      if (nodeId) {
        return this.graphData.allNodes.get(nodeId) || null
      }
    }

    return null
  }

  /**
   * Animate node selection
   */
  public animateNodeSelection(nodeId: string): void {
    if (!this.stage || !this.enableAnimations || !this.nodesLayer) return

    const nodeGroup = this.nodesLayer.findOne(`#${nodeId}`)
    if (!nodeGroup || !(nodeGroup instanceof Konva.Group)) return

    const background = nodeGroup.children.find((child: Konva.Node) => child instanceof Konva.Rect) as Konva.Rect

    if (background) {
      const originalScale = background.scaleX()
      
      // Animate scale up and down
      const tween = new Konva.Tween({
        node: background,
        duration: this.animationDuration / 2,
        scaleX: originalScale * 1.2,
        scaleY: originalScale * 1.2,
        onFinish: () => {
          const tweenBack = new Konva.Tween({
            node: background,
            duration: this.animationDuration / 2,
            scaleX: originalScale,
            scaleY: originalScale
          })
          tweenBack.play()
        }
      })
      tween.play()
    }
  }

  /**
   * Animate view transition
   */
  public animateViewTransition(targetState: { zoom: number, panX: number, panY: number }): void {
    if (!this.stage || !this.enableAnimations) {
      this.setViewState(targetState)
      return
    }

    const tween = new Konva.Tween({
      node: this.stage,
      duration: this.animationDuration,
      scaleX: targetState.zoom,
      scaleY: targetState.zoom,
      x: targetState.panX,
      y: targetState.panY,
      easing: Konva.Easings.EaseInOut,
      onUpdate: () => {
        if (!this.stage) return
        this.zoom = this.stage.scaleX()
        this.panX = this.stage.x()
        this.panY = this.stage.y()
        this.syncDotGrid()
      },
      onFinish: () => {
        this.zoom = targetState.zoom
        this.panX = targetState.panX
        this.panY = targetState.panY
        this.syncDotGrid()
      }
    })
    tween.play()
  }

  /**
   * Enable/disable animations
   */
  public setAnimationsEnabled(enabled: boolean): void {
    this.enableAnimations = enabled
  }

  /**
   * Set animation duration
   */
  public setAnimationDuration(duration: number): void {
    this.animationDuration = Math.max(100, Math.min(2000, duration))
  }

  /**
   * Cleanup resources
   */
  public destroy(): void {
    this.unsubGrid?.()
    this.unsubGrid = null
    if (this.stage) {
      this.stage.destroy()
      this.stage = null
    }
    
    // Clear lookup maps
    this.nodeMap.clear()
    this.connectionMap.clear()
    this.virtualTiles.clear()
    this.visibleTiles.clear()
    
    this.nodeToTiles.clear()
    this.connectionToTiles.clear()
  }

  /**
   * Public method to trigger a re-render of the graph
   */
  public render(): void {
    this._render()
  }

  /**
   * Update node description and re-render the node
   */
  public updateNodeDescription(nodeId: string, description: string): void {
    if (!this.nodesLayer) return

    // Use fast lookup map
    const nodeGroup = this.nodeMap.get(nodeId)
    if (!nodeGroup) return

    // Remove existing description text if any
    const existingDescription = nodeGroup.children.find((child: Konva.Node) => 
      child instanceof Konva.Text && child.fontStyle() === 'italic'
    )
    if (existingDescription) {
      existingDescription.destroy()
    }

    // Add new description if provided
    if (description && description.trim()) {
      const renderNode = this.graphData.allNodes.get(nodeId)
      if (renderNode) {
        const nodeWidth = renderNode.size?.width || 120
        const descriptionText = this.createDescriptionText(description, nodeWidth)
        nodeGroup.add(descriptionText)
      }
    }

    // Redraw the stage
    if (this.stage) {
      this.stage.batchDraw()
    }
  }


  /**
   * Begin an interactive edit transaction (e.g. continuous keyboard/drag move).
   * While open, updateNodes skips tile reindex/visibility; call endInteractiveEdit to flush.
   */
  public beginInteractiveEdit(): void {
    this.interactiveEditDepth++
  }

  /**
   * End interactive edit; when depth reaches 0, flush deferred tile updates.
   */
  public endInteractiveEdit(): void {
    if (this.interactiveEditDepth <= 0) return
    this.interactiveEditDepth--
    if (this.interactiveEditDepth > 0) return
    this.flushInteractiveTileUpdates()
  }

  /** Drop interactive edit without flushing (e.g. cancel + full restore update). */
  public cancelInteractiveEdit(): void {
    this.interactiveEditDepth = 0
    this.interactiveDirtyNodeIds.clear()
  }

  public isInteractiveEdit(): boolean {
    return this.interactiveEditDepth > 0
  }

  private flushInteractiveTileUpdates(): void {
    if (this.interactiveDirtyNodeIds.size === 0) return
    if (!this.nodesLayer || !this.connectionsLayer) {
      this.interactiveDirtyNodeIds.clear()
      return
    }

    const ids = [...this.interactiveDirtyNodeIds]
    this.interactiveDirtyNodeIds.clear()
    this.updateNodeTiles(ids)
    this.updateConnectionTiles(ids)
    this.loadVisibleTiles()
    this.batchDrawGraphLayers()
  }

  /**
   * @deprecated Konva stub — syncs pos/size from model for listed ids (no Pixi-style infer).
   * `contentChangedIds` accepted for API parity; chrome always refreshed for listed ids.
   */
  public updateNodes(
    movedNodeIds: string[],
    _options?: {
      contentChangedIds?: ReadonlySet<string>
    }
  ): void {
    if (!this.nodesLayer || !this.connectionsLayer) return

    // Update positions of moved nodes in all tiles
    movedNodeIds.forEach(nodeId => {
      const renderNode = this.graphData.allNodes.get(nodeId)
      if (!renderNode) return
      
      if (renderNode.position) {
        const existingNode = this.nodeMap.get(nodeId)
        if (existingNode) {
          this.syncKonvaGroupPosition(renderNode, existingNode)
        }
      }

      if (renderNode.size) {
        // Use fast lookup map
        const existingNode = this.nodeMap.get(nodeId)
        
        if (existingNode) {
          const nodeWidth = renderNode.size.width
          const nodeHeight = renderNode.size.height
          
          // Update background rectangle size
          const background = existingNode.children.find((child: Konva.Node) => child instanceof Konva.Rect) as Konva.Rect
          if (background) {
            background.size({
              width: nodeWidth,
              height: nodeHeight
            })
          }
          
          // Update text positions for new size
          const idText = existingNode.children.find((child: Konva.Node) => 
            child instanceof Konva.Text && child.fontSize() === 12
          ) as Konva.Text
          if (idText) {
            idText.position({
              x: 5,
              y: 5
            })
            idText.width(nodeWidth - 10)
          }
          
          const typeText = existingNode.children.find((child: Konva.Node) => 
            child instanceof Konva.Text && child.fontSize() === 10
          ) as Konva.Text
          if (typeText) {
            typeText.position({
              x: 5,
              y: 20
            })
            typeText.width(nodeWidth - 10)
          }
          
          // Update description text if it exists
          const descriptionText = existingNode.children.find((child: Konva.Node) => 
            child instanceof Konva.Text && child.fontStyle() === 'italic'
          ) as Konva.Text
          if (descriptionText) {
            descriptionText.position({
              x: 5,
              y: 35
            })
            descriptionText.width(nodeWidth - 10)
          }

          if (this.isNodeSelected(nodeId)) {
            this.updateNodeSelection(existingNode, true)
          }
        }
      }
    })

    // Local child coords are unchanged, but world tiles/endpoints of the subtree moved
    const worldAffectedSet = new Set<string>(
      movedNodeIds.length > 0
        ? expandNodeIdsWithDescendants(movedNodeIds, this.graphData.allNodes)
        : []
    )
    for (const id of movedNodeIds) worldAffectedSet.add(id)
    const worldAffectedIds = [...worldAffectedSet]

    // Update connections for all moved nodes in one pass
    this.batchUpdateConnections(worldAffectedIds)

    if (this.interactiveEditDepth > 0) {
      for (const id of worldAffectedIds) {
        this.interactiveDirtyNodeIds.add(id)
      }
    } else {
      this.updateNodeTiles(worldAffectedIds)
      this.updateConnectionTiles(worldAffectedIds)
      this.loadVisibleTiles()
    }
    
    this.batchDrawGraphLayers()
  }

  /**
   * Efficiently update connections for multiple moved nodes
   */
  private batchUpdateConnections(movedNodeIds: string[]): void {
    if (!this.connectionsLayer || !this.graphData.connections) return

    const movedNodesSet = new Set(movedNodeIds)

    this.connectionMap.forEach((connectionGroup) => {
      const from = connectionGroup.getAttr('from')
      const to = connectionGroup.getAttr('to')

      if (movedNodesSet.has(from) || movedNodesSet.has(to)) {
        this.refreshConnectionGroupGeometry(connectionGroup)
      }
    })
  }

  private updateConnectionTiles(movedNodeIds: string[]): void {
    if (movedNodeIds.length === 0) return

    const movedNodesSet = new Set(movedNodeIds)

    this.graphData.connections.forEach((connection) => {
      if (!movedNodesSet.has(connection.from) && !movedNodesSet.has(connection.to)) {
        return
      }

      const connectionKey = getConnectionKey(connection)
      const connectionGroup = this.connectionMap.get(connectionKey)
      if (!connectionGroup) return

      this.reindexConnectionTiles(connectionGroup, connection)
    })
  }

  /**
   * Add or update a single node without full re-render
   */
  public updateSingleNode(nodeId: string, renderNode: RenderNode): void {
    if (!this.nodesLayer) return

    const existingNode = this.nodeMap.get(nodeId)
    if (existingNode) {
      if (renderNode.position) {
        this.syncKonvaGroupPosition(renderNode, existingNode)
      }

      const isSelected = this.isNodeSelected(nodeId)
      this.updateNodeSelection(existingNode, isSelected)
    } else {
      this.mountDiagramNode(renderNode, false)
    }

    this.updateConnectionsForNode(nodeId)
    this.loadVisibleTiles()

    this.batchDrawGraphLayers()
  }

  /**
   * Update connections for a specific node
   */
  private updateConnectionsForNode(nodeId: string): void {
    if (!this.connectionsLayer) return

    // Find all connections involving this node from connection map
    this.connectionMap.forEach((connectionGroup) => {
      const from = connectionGroup.getAttr('from')
      const to = connectionGroup.getAttr('to')
      
      if (from === nodeId || to === nodeId) {

        this.refreshConnectionGroupGeometry(connectionGroup)
      }
    })
  }

  /**
   * Get node connections
   */
  public getNodeConnections(nodeId: string): { incoming: DiagramConnection[], outgoing: DiagramConnection[] } {
    const incoming: DiagramConnection[] = []
    const outgoing: DiagramConnection[] = []
    
    for (const connection of this.graphData.connections) {
      if (connection.to === nodeId) {
        incoming.push(connection)
      }
      if (connection.from === nodeId) {
        outgoing.push(connection)
      }
    }
    
    return {
      incoming,
      outgoing,
    }
  }

  /**
   * Log node data to console
   */
  public logNodeData(nodeId: string): void {
    const node = this.graphData.allNodes.get(nodeId)
    if (node) {
      console.log(`Node ${nodeId} data:`, node)
    } else {
      console.warn(`Node ${nodeId} not found`)
    }
  }

  /**
   * Pan to connected node
   */
  public panToConnectedNode(connection: DiagramConnection, isIncoming: boolean): boolean {
    const targetNodeId = isIncoming ? connection.from : connection.to
    return this.panToNode(targetNodeId)
  }

  /**
   * Set highlight selected node connections
   */
  public setHighlightSelectedNodeConnections(highlight: boolean): void {
    this.highlightSelectedNodeConnections = highlight
    this._render()
  }

  /**
   * Set selected node connection color
   */
  public setSelectedNodeConnectionColor(color: string): void {
    this.selectedNodeConnectionColor = color
    this._render()
  }

  /**
   * Set selected node connection opacity
   */
  public setSelectedNodeConnectionOpacity(opacity: number): void {
    this.selectedNodeConnectionOpacity = Math.max(0.1, Math.min(1.0, opacity))
    this._render()
  }

  /**
   * Set selected node connection width
   */
  public setSelectedNodeConnectionWidth(width: number): void {
    this.selectedNodeConnectionWidth = Math.max(1, Math.min(10, width))
    this._render()
  }

  /**
   * Get connection settings
   */
  public getConnectionSettings(): { showConnections: boolean, highlightSelectedNodeConnections: boolean, selectedNodeConnectionColor: string, selectedNodeConnectionOpacity: number, selectedNodeConnectionWidth: number } {
    return {
      showConnections: this.showConnections,
      highlightSelectedNodeConnections: this.highlightSelectedNodeConnections,
      selectedNodeConnectionColor: this.selectedNodeConnectionColor,
      selectedNodeConnectionOpacity: this.selectedNodeConnectionOpacity,
      selectedNodeConnectionWidth: this.selectedNodeConnectionWidth
    }
  }

  /**
   * Set tile size for performance optimization
   */
  public setTileSize(size: number): void {
    this.tileSize = size
    // Clear existing virtual tiles to force regeneration
    this.virtualTiles.forEach((tile) => {
      tile.nodes.forEach((node) => node.destroy())
      tile.connections.forEach((connection) => connection.destroy())
    })
    this.virtualTiles.clear()
    this.visibleTiles.clear()
    this.lastViewport = null
    this.connectionToTiles.clear()
  }

  /**
   * Get current tile size
   */
  public getTileSize(): number {
    return this.tileSize
  }

  /**
   * Get tile statistics
   */
  public getTileStats(): { totalTiles: number; visibleTiles: number; hiddenTiles: number } {
    const totalTiles = this.virtualTiles.size
    const visibleTiles = this.visibleTiles.size
    const hiddenTiles = totalTiles - visibleTiles

    return { totalTiles, visibleTiles, hiddenTiles }
  }

  /**
   * Toggle debug tile visualization
   */
  public setDebugTiles(debug: boolean): void {
    this.debugTiles = debug
    this.renderDebugOverlays()
  }

  public setDebugLayoutContainers(debug: boolean): void {
    this.debugLayoutContainers = debug
    this.renderDebugOverlays()
  }

  /**
   * Get viewport center position in world coordinates
   */
  public getViewportCenter(): { x: number, y: number } {
    if (!this.stage) {
      return { x: 0, y: 0 }
    }

    const stageWidth = this.stage.width()
    const stageHeight = this.stage.height()
    
    // Convert screen coordinates to world coordinates
    const worldX = (stageWidth / 2 - this.panX) / this.zoom
    const worldY = (stageHeight / 2 - this.panY) / this.zoom
    
    return { x: worldX, y: worldY }
  }

  /**
   * Get viewport bounds in world coordinates
   */
  public getViewportBounds(): { left: number, top: number, right: number, bottom: number } | null {
    if (!this.stage) {
      return null
    }

    const scale = this.stage.scaleX()
    const stagePos = this.stage.position()
    
    // Calculate viewport bounds in world coordinates
    const viewportLeft = -stagePos.x / scale
    const viewportTop = -stagePos.y / scale
    const viewportRight = viewportLeft + this.viewportWidth / scale
    const viewportBottom = viewportTop + this.viewportHeight / scale
    
    return {
      left: viewportLeft,
      top: viewportTop,
      right: viewportRight,
      bottom: viewportBottom
    }
  }

  /**
   * Remove a node from the canvas (graph data must be updated separately).
   */
  public removeNode(nodeId: string): void {
    const nodeGroup = this.nodeMap.get(nodeId)
    if (!nodeGroup) return

    const nodeTiles = this.nodeToTiles.get(nodeGroup)
    if (nodeTiles) {
      nodeTiles.forEach((tileKey) => {
        this.virtualTiles.get(tileKey)?.nodes.delete(nodeGroup)
      })
      this.nodeToTiles.delete(nodeGroup)
    }

    nodeGroup.destroy()
    this.nodeMap.delete(nodeId)

    if (this.selectedNodeIds.has(nodeId)) {
      const nextIds = [...this.selectedNodeIds].filter((id) => id !== nodeId)
      const primaryId =
        this.primarySelectedNodeId === nodeId ? nextIds.at(-1) ?? null : this.primarySelectedNodeId
      this.setSelectedNodes(nextIds, primaryId, true)
    }

    this.loadVisibleTiles()
    this.batchDrawGraphLayers()
  }

  /**
   * Rebuild all connection shapes from graph data.
   */
  public reloadConnections(): void {
    if (!this.connectionsLayer) return

    this.connectionMap.forEach((connectionGroup) => {
      this.removeConnectionFromTiles(connectionGroup)
      connectionGroup.destroy()
    })
    this.connectionMap.clear()

    this.renderConnections()
    this.updateConnectionsHighlighting()
    this.loadVisibleTiles()
    this.batchDrawGraphLayers()
  }

  /**
   * Add a new node to the graph
   */
  public addNode(node: RenderNode): void {
    if (!this.graphData) return

    this.mountDiagramNode(node, true)
    if (!this.nodeMap.has(node.id)) return

    // Update connections
    this.updateConnectionsForNode(node.id)

    this.loadVisibleTiles()

    if (this.stage) {
      this.stage.batchDraw()
    }
  }

  /**
   * Add a new connection to the graph
   */
  public addConnection(connection: DiagramConnection): void {
    if (!this.connectionsLayer || !this.graphData) return

    const konvaConnection = this.createKonvaConnection(connection)
    if (!konvaConnection) return

    const connectionKey = getConnectionKey(connection)
    this.connectionMap.set(connectionKey, konvaConnection)
    this.reindexConnectionTiles(konvaConnection, connection)
    this.loadVisibleTiles()

    if (this.stage) {
      this.stage.batchDraw()
    }
  }

  /**
   * Delete a connection from the graph
   */
  public deleteConnection(connection: DiagramConnection): void {
    if (!this.graphData) return
    
    const connectionKey = getConnectionKey(connection)

    const connectionGroup = this.connectionMap.get(connectionKey)
    if (!connectionGroup) return

    this.removeConnectionFromTiles(connectionGroup)
    connectionGroup.destroy()
    this.connectionMap.delete(connectionKey)
    this.loadVisibleTiles()

    if (this.stage) {
      this.stage.batchDraw()
    }
  }

  /**
   * Add a node to appropriate tiles for indexing
   */
  private addNodeToTiles(konvaNode: Konva.Group, node: RenderNode): void {
    // Get all tiles that intersect with this node
    const tileKeys = this.getNodeTileKeys(node)

    // Add node to all intersecting tiles
    if (!this.nodeToTiles.has(konvaNode)) {
      this.nodeToTiles.set(konvaNode, new Set())
    }
    tileKeys.forEach((tileKey) => {
      this.ensureTile(tileKey).nodes.add(konvaNode)
      this.nodeToTiles.get(konvaNode)!.add(tileKey)
    })
  }

  private resolveGraphNodeIdFromTarget(target: Konva.Node): string | null {
    let current: Konva.Node | null = target
    while (current && current !== this.stage) {
      const id = this.getKonvaNodeId(current)
      if (id && this.nodeMap.has(id)) {
        return id
      }
      current = current.getParent()
    }
    return null
  }

  public getGraphScope(): GraphScopeIndex {
    return this.graphScope
  }
}

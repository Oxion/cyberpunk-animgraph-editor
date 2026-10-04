/**
 * Pixi Diagram Renderer
 */

import { WatcherSub } from '@/lib/eagerReactive/types'
import {
  Application,
  Container,
  FederatedPointerEvent,
  Graphics,
  Rectangle,
  RenderLayer
} from 'pixi.js'
import { signal, watcher, WritableSignal } from '../lib/eagerReactive'
import type { DiagramConnection, RenderData, RenderNode } from './graph/diagramTypes'
import { getConnectionKey } from './graph/diagramModel'
import { type PlannedConnection } from './graph/ConnectionDrawPlanner'
import { DIAGRAM_CONNECTION_TYPE_INPUT } from './graph/diagramConnectionTypes'
import {
  blenderBezierControls,
  ConnectionPixiContainer,
  createConnectionPixiContainer,
  overlayCssColor,
  redrawConnectionPixiContainerLine,
  sampleBlenderConnection
} from './graph/ConnectionPixiPainter'
import {
  isCrossViewPinId,
  makeCrossViewConnectionPortalPinId,
  makeCrossViewPinId
} from './graph/crossViewPinIds'
import {
  isDiagramOverviewLeaf,
  isDiagramPortalNode
} from './graph/DiagramConversion'
import { DIAGRAM_STAGE_BG } from './graph/diagramDotGrid'
import { createPixiDotGrid, type PixiDotGrid } from './graph/diagramDotGridPixi'
import {
  borderPointOnRect,
  expandNodeIdsWithDescendants,
  getWorldPosition
} from './graph/DiagramGeometry'
import { presentNodeBody } from './graph/NodeBodyPresent'
import {
  DEFAULT_CHILD_SLOT,
  forEachDirectChild,
  getChildSlot as getChildSlotDiagramNodes,
  OVERVIEW_CHILD_SLOT,
  walkSubtree,
} from './graph/nodeChildSlots'
import {
  buildNodePins,
  PIN_RADIUS
} from './graph/NodePins'
import {
  canConnectByPinType,
  PIN_COLOR_FALLBACK,
  resolvePinColor,
} from './graph/pinTyping'
import {
  createDiagramText,
  ensureDiagramBitmapFont,
  isDiagramText,
  setDebugTextLodCacheScreenPx
} from './graph/pixiText'
import {
  isCrossViewConnection
} from './graph/portalTopology'
import { OPEN_SCOPE_BTN_TEXT_LABEL, PixiDiagramNode, PixiDiagramNodeCtx } from './pixi/PixiDiagramNode'
import { NodeElsContainer, PixiRenderStats } from './PixiGraphrenderer.types'
import { SimNodeState, SimSnapshot } from './sim'


type NodeGroup = Container

export type PresentWorldRectOptions = {
  align?: 'center' | 'top-start' | 'top-end'
  fit?: 'contain' | 'width' | 'none'
  padding?: number
  minZoom?: number
  maxZoom?: number
  /** When set, used instead of computing zoom from fit. */
  zoom?: number
  /** Extra trailing inset (e.g. sidebar overlap) for `top-end`. */
  rightInset?: number
}

export interface PixiGraphRendererOptions {
  scopeRootId?: string
  /** Paint children of scope root as top-level; skip the root container frame. */
  hideScopeRoot?: boolean
  /** Skip the default fit-all after init (caller will present a region). */
  skipInitialFit?: boolean
  /** Frame this rect before the first paint (avoids a fit-all flash). */
  initialPresent?: {
    rect: { x: number; y: number; width: number; height: number }
    options?: PresentWorldRectOptions
  }
  /** Resolve a node rect after first paint, then frame it. */
  initialPresentNodeId?: string
  initialPresentOptions?: PresentWorldRectOptions
}

const STAGE_BACKGROUND_COLOR_HEX = DIAGRAM_STAGE_BG
/** Merge input-pin hit bands when consecutive pins are this close in Y (≈ 2× PIN_SPACING). */
/** Max world-space distance from pointer to wire endpoint to start a rewire. */
const CONN_REWIRE_MAX_DIST = 40
/** Clicks / releases near grab point cancel rewire instead of deleting. */
const MIN_REWIRE_DRAG_PX = 6
const REWIRE_PORTAL_CANCEL_RADIUS = 56

function findLabeledChild(pixiContainer: Container, label: string): Container | undefined {
  return (pixiContainer.getChildByLabel(label) as Container | null) ?? undefined
}

function detachFromRenderLayer(obj: Container): void {
  obj.parentRenderLayer?.detach(obj)
}

function isLiveSceneObject(obj: Container): boolean {
  return !!obj.parent && !obj.destroyed
}

/** Skip attach when the object is not in the scene graph (layer still draws parentless items). */
function attachToRenderLayer(layer: RenderLayer, obj: Container): void {
  if (!isLiveSceneObject(obj)) {
    console.warn('attachToRenderLayer: object is not live', obj.label)
    return
  }
  layer.attach(obj)
}

/**
 * Pixi detaches from RenderLayer only the object passed to removeChild — not descendants.
 * Nested attaches (connection line Graphics under the connection container) need a walk.
 */
function detachTreeFromRenderLayers(obj: Container): void {
  detachFromRenderLayer(obj)
  const kids = obj.children
  for (let i = 0; i < kids.length; i++) {
    detachTreeFromRenderLayers(kids[i] as Container)
  }
}

function destroyPixiTree(obj: Container): void {
  if ((obj as { destroyed?: boolean }).destroyed) return
  detachTreeFromRenderLayers(obj)
  obj.destroy({ children: true })
}

/** Remove + destroy so Pixi ticker never sees a destroyed child (renderPipeId null). */
function destroyLabeledChild(group: Container, child: Container | undefined): void {
  if (!child) return
  try {
    if (child.parent === group) {
      group.removeChild(child)
    } else if (child.parent) {
      child.parent.removeChild(child)
    }
    if (!(child as { destroyed?: boolean }).destroyed) {
      destroyPixiTree(child)
    }
  } catch (err) {
    console.warn('Pixi destroy overlay child failed', err)
  }
}

function destroyContainerChildren(container: Container): void {
  const removed = container.removeChildren()
  for (const child of removed) {
    child.destroy({ children: true })
  }
}

function reparentTo(child: Container, parent: Container): void {
  if (child.parent !== parent) {
    parent.addChild(child)
  }
}

/** Keep highlight strokes readable at any zoom (world units grow when zoomed out). */
function worldLengthForScreenPx(screenPx: number, zoom: number): number {
  return screenPx / Math.max(zoom, 0.001)
}

function countDisplayObjects(root: Container): number {
  let n = 1
  const kids = root.children
  for (let i = 0; i < kids.length; i++) {
    n += countDisplayObjects(kids[i] as Container)
  }
  return n
}

function isWorldVisible(obj: Container): boolean {
  let current: Container | null = obj
  while (current) {
    if (!current.visible) return false
    current = current.parent
  }
  return true
}

type VisibleDrawStats = {
  visibleDisplayObjects: number
  visibleText: number
  visibleGraphics: number
  visibleOther: number
  visibleTextTextures: number
  visibleNodeGroups: number
  visibleCachedNodes: number
  visibleUncachedNodes: number
}

/** Approximate draw list: skip `visible: false` subtrees and children of cacheAsTexture. */
function collectVisibleDrawStats(
  root: Container,
  nodeMap: Map<string, PixiDiagramNode>
): VisibleDrawStats {
  const stats: VisibleDrawStats = {
    visibleDisplayObjects: 0,
    visibleText: 0,
    visibleGraphics: 0,
    visibleOther: 0,
    visibleTextTextures: 0,
    visibleNodeGroups: 0,
    visibleCachedNodes: 0,
    visibleUncachedNodes: 0,
  }
  const textTextureIds = new Set<number>()

  const walk = (obj: Container) => {
    if (!obj.visible) return

    const pixiDiagramNode = obj.label ? nodeMap.get(String(obj.label)) : undefined
    if (!pixiDiagramNode) return
    
    const isPixiDiagramNodeContainer = pixiDiagramNode.pixiContainer === obj
    if (isPixiDiagramNodeContainer) {
      stats.visibleNodeGroups++
      if (obj.isCachedAsTexture) stats.visibleCachedNodes++
      else stats.visibleUncachedNodes++
    }

    if (obj.isCachedAsTexture) {
      stats.visibleDisplayObjects++
      stats.visibleOther++
      return
    }

    if (obj.renderable !== false) {
      stats.visibleDisplayObjects++
      if (isDiagramText(obj)) {
        stats.visibleText++
        const tex = obj as unknown as {
          texture?: { uid?: number; source?: { uid?: number } }
        }
        const uid = tex.texture?.uid ?? tex.texture?.source?.uid
        if (typeof uid === 'number') textTextureIds.add(uid)
      } else if (obj instanceof Graphics) {
        stats.visibleGraphics++
      } else {
        stats.visibleOther++
      }
    }

    const kids = obj.children
    for (let i = 0; i < kids.length; i++) {
      walk(kids[i] as Container)
    }
  }

  walk(root)
  stats.visibleTextTextures = textTextureIds.size
  return stats
}

type PinDrag = {
  fromDiagramNodeId: string
  dragStartWorldPos: { x: number; y: number }
  dragFrom: { x: number; y: number }
  dragStrokeHex: string
  rewire?: PinDragRewire
  snap?: PinDragSnap
  connectionDragLineGraphics: Graphics
  pinSnapHighlightGraphics: Graphics
}

type PinDragRewire = {
  hostNodeId: string
  pinName: string
  grabbedConnection: DiagramConnection
  connectionPixiContainer: ConnectionPixiContainer
}

type PinDragSnap = {
  nodeId: string
  pinId: string
  x: number
  y: number
}

export class PixiGraphRenderer {
  private container: HTMLDivElement
  private graphData: RenderData

  private _app: Application
  private _initialized: boolean = false
  readonly _initPromise: Promise<void>
  private _destroyed: boolean = false
  
  private _dotGrid: PixiDotGrid | null = null
  
  private _resizeObserver: ResizeObserver | null = null
  
  private _worldPixiContainer: Container
  private _stagingPixiContainer: Container
  private _mainPixiContainer: Container
  private _mainNodesPixiContainer: Container
  private _mainConnectionsPixiContainer: Container
  private _mainAuxPixiContainer: Container
  private _mainRenderLayersPixiContainer: Container
  private _mainAuxRenderLayersPixiContainer: Container

  private depthConnectionGraphicsLayers: RenderLayer[] = []
  private depthGraphicsLayers: RenderLayer[] = []
  private depthTextLayers: RenderLayer[] = []
  private _mainAuxGraphicsLayer: RenderLayer
  private _mainAuxTextLayer: RenderLayer

  private _debugPixiContainer: Container
  private _debugContentPixiContainer: Container
  private _debugGraphicsLayer: RenderLayer
  private _debugTextLayer: RenderLayer

  private _pixiDiagramNodeCtx: PixiDiagramNodeCtx
  
  private _scopeRootId: string | undefined
  private hideScopeRoot = false
  private skipInitialFit = false
  private initialPresent: PixiGraphRendererOptions['initialPresent']
  private initialPresentNodeId: string | undefined
  private initialPresentOptions: PresentWorldRectOptions | undefined
  /** Last sim overlay payload — reapplied after lens paint / unsuspend. */
  private _simOverlayData?: SimSnapshot
  /** sim HandleId / metadata keys → render node ids (for delta overlay). */
  private simOverlayKeyIndex: Map<string, string[]> | null = null

  private _wheelTileSyncPending = false
  private _showDebugTiles: boolean = false // Debug flag for tile visualization
  private _showDebugLayoutContainers: boolean = false

  // Render resources
  private _diagramNodeIdToPixiDiagramNodeMap: Map<string, PixiDiagramNode> = new Map()
  private _pixiDiagramNodeContainerToPixiDiagramNodeWeakMap: WeakMap<Container, PixiDiagramNode> = new WeakMap()
  private _connectionKeyToConnectionPixiContainerMap: Map<string, ConnectionPixiContainer> = new Map()
  private _nodePixiContainerToNodeElsContainerWeakMap: WeakMap<NodeGroup | ConnectionPixiContainer, NodeElsContainer> = new WeakMap()

  // Virtual tile system resources
  private _tileSize: number = 4096
  private _pixiDiagramNodeToTileKeysSetWeakMap: WeakMap<PixiDiagramNode, Set<string>> = new WeakMap()
  private _connectionPixiContainerToTileKeysSetWeakMap: WeakMap<ConnectionPixiContainer, Set<string>> = new WeakMap()
  private _virtualTiles: Map<
    string,
    { nodes: Set<PixiDiagramNode>; connections: Set<ConnectionPixiContainer> }
  > = new Map()
  private _oversizedDiagramNodeIdsSet: Set<string> = new Set()
  private _mountedTileKeysSet: Set<string> = new Set()
  private _viewportMountedDiagramNodeIdsSetRef: WritableSignal<Set<string>> = signal(new Set())
  private _lastMountedViewportWorldRect: { x: number; y: number; width: number; height: number } | null = null

  /** Ignores all paint/tile work until resume. */
  private _suspended = false

  // Interactive edit state
  private _interactiveEditDepth = 0
  private _interactiveDirtyNodeIds = new Set<string>()

  // View state
  private _zoomRef: WritableSignal<number>
  private _panXRef: WritableSignal<number>
  private _panYRef: WritableSignal<number>
  private _viewportWidthRef: WritableSignal<number>
  private _viewportHeightRef: WritableSignal<number>
  private _viewportCommitIndexRef: WritableSignal<number>

  // Connection rendering settings
  private _showConnections: boolean = true
  private _connectionOpacity: number = 0.8
  private _connectionLabels: boolean = true
  private _connectionArrows: boolean = false
  
  // Selected node connection highlighting
  private highlightSelectedNodeConnections: boolean = true
  private selectedNodeConnectionColor: string = '#ffffff'
  private selectedNodeConnectionOverlayAmount: number = 0.4
  private selectedNodeConnectionOpacity: number = 1.0
  private selectedNodeConnectionWidth: number = 3

  // Node selection settings
  private _selectedNodeIdsSet = new Set<string>()
  private _primarySelectedNodeId: string | null = null
  private _onNodeSelect: ((nodeIds: string[], primaryNodeId: string | null, event?: MouseEvent) => void) | null = null
  private _onOpenNodeScope: ((nodeId: string) => void) | null = null
  private _onPinConnect: ((payload: { fromNodeId: string; toNodeId: string; pinName: string }) => void) | null =
    null
  private _onPinRewire:
    | ((payload: {
        grabbedConnection: DiagramConnection
        hostNodeId: string
        pinName: string
        newToNodeId?: string
        newPinName?: string
      }) => void)
    | null = null
  private interactionGate: () => boolean = () => true
  private allowPinDrag = true
  private _pinDrag?: PinDrag

  /** Pan with middle mouse button only */
  private _panSession: {
    startPointer: { x: number; y: number }
    startStagePos: { x: number; y: number }
  } | null = null

  
  private _updateWorldRenderEffectSub?: WatcherSub
  private _updateMountedPixiDiagramNodeBordersEffectSub?: WatcherSub
  private _updateMountedPixiDiagramNodeSimsEffectSub?: WatcherSub
  private _updateDebugOverlayRenderEffectSub?: WatcherSub
  private _viewportStateWatcherSub?: WatcherSub

  constructor(
    containerElement: HTMLDivElement,
    graphData: RenderData,
    options: PixiGraphRendererOptions = {}
  ) {
    this.container = containerElement
    this.graphData = graphData

    this._scopeRootId = options.scopeRootId
    this.hideScopeRoot = !!options.hideScopeRoot
    this.initialPresent = options.initialPresent
    this.initialPresentNodeId = options.initialPresentNodeId
    this.initialPresentOptions = options.initialPresentOptions
    this.skipInitialFit = !!options.skipInitialFit

    this._app = new Application()
    this._worldPixiContainer = new Container()
    this._stagingPixiContainer = new Container()
    this._mainPixiContainer = new Container()
    this._mainNodesPixiContainer = new Container()
    this._mainConnectionsPixiContainer = new Container()
    this._mainAuxPixiContainer = new Container()
    this._mainRenderLayersPixiContainer = new Container()
    this._mainAuxRenderLayersPixiContainer = new Container()

    this._mainAuxGraphicsLayer = new RenderLayer()
    this._mainAuxTextLayer = new RenderLayer()

    this._debugPixiContainer = new Container()
    this._debugContentPixiContainer = new Container()
    this._debugGraphicsLayer = new RenderLayer()
    this._debugTextLayer = new RenderLayer()

    this._pixiDiagramNodeCtx = {
      worldLengthForScreenPx: (screenPx: number) => {
        return worldLengthForScreenPx(screenPx, this._zoomRef.value)
      },
      beginInputPinDrag: (diagramNodeId: string, pos: { x: number, y: number }) => {
        this._handlePixiDiagramNodeInputPinStripDragStart(diagramNodeId, pos)
      },
      beginOutputPinDrag: (diagramNodeId: string, pos: { x: number, y: number }) => {
        this._handlePixiDiagramNodeOutputPinDragStart(diagramNodeId, pos)
      },
    }

    // View state
    this._zoomRef = signal(1.0)
    this._panXRef = signal(0)
    this._panYRef = signal(0)
    this._viewportWidthRef = signal(800)
    this._viewportHeightRef = signal(800)
    this._viewportCommitIndexRef = signal(0)

    this._initPromise = this._init()
  }

  private _clientToCanvasPosition(clientX: number, clientY: number): { x: number; y: number } | null {
    const rect = this._app.canvas.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return null

    // Map CSS pixels → Pixi screen/logical pixels (handles CSS stretch + autoDensity)
    const scaleX = this._app.screen.width / rect.width
    const scaleY = this._app.screen.height / rect.height
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    }
  }

  private _canvasToWorldPosition(canvasX: number, canvasY: number): { x: number; y: number } {
    const scale = this._zoomRef.value || 1
    return {
      x: (canvasX - this._panXRef.value) / scale,
      y: (canvasY - this._panYRef.value) / scale,
    }
  }

  private _resolveDiagramNodeRendererWorldPosition(
    diagramNode: RenderNode,
    viewRootDiagramNodeIdsSet?: Set<string>,
  ): { x: number; y: number } {
    const _viewRootDiagramNodeIdsSet = viewRootDiagramNodeIdsSet 
      ?? this._resolveViewRootDiagramNodeIdsSet()

    let x = 0
    let y = 0
    let current: RenderNode | undefined = diagramNode
    while (current) {
      x += current.position.x
      y += current.position.y

      if (_viewRootDiagramNodeIdsSet.has(current.id)) break
      
      current = current.parent
    }

    return { x, y }
  }

  /**
   * @todo check to area can be not correct if child overflow out of parent bounds
   * Hit-test to DiagramNodePixiContainer. Among hits, pick smallest area.
   */
  private _resolveDiagramNodeIdFromWorldPos(worldPos: { x: number; y: number }): string | undefined {
    let bestId: string | undefined = undefined
    let bestArea = Infinity

    for (const diagramNodeId of this._viewportMountedDiagramNodeIdsSetRef.value) {
      const pixiDiagramNode = this._diagramNodeIdToPixiDiagramNodeMap.get(diagramNodeId)
      if (!pixiDiagramNode) continue

      const diagramNodePixiContainerBounds = pixiDiagramNode.pixiContainer.getBounds()
      if (!diagramNodePixiContainerBounds.containsPoint(worldPos.x, worldPos.y)) continue
      
      const area = Math.max(1, diagramNodePixiContainerBounds.width) * Math.max(1, diagramNodePixiContainerBounds.height)
      if (area < bestArea) {
        bestArea = area
        bestId = diagramNodeId
      }
    }

    return bestId
  }

  private _setupEventHandlers(): void {
    if (!this.ready) return

    this._app.canvas.addEventListener('wheel', (evt: WheelEvent) => {
      evt.preventDefault()
      
      const scaleBy = 1.1
      const oldScale = this._zoomRef.value
      const pointerCanvasPos = this._clientToCanvasPosition(evt.clientX, evt.clientY)
      if (!pointerCanvasPos) return

      const mousePointTo = {
        x: (pointerCanvasPos.x - this._panXRef.value) / oldScale,
        y: (pointerCanvasPos.y - this._panYRef.value) / oldScale,
      }
      const newScale = evt.deltaY > 0 ? oldScale / scaleBy : oldScale * scaleBy
      const clampedScale = Math.max(0.1, Math.min(5.0, newScale))
      this._zoomRef.value = clampedScale
      this._panXRef.value = pointerCanvasPos.x - mousePointTo.x * clampedScale
      this._panYRef.value = pointerCanvasPos.y - mousePointTo.y * clampedScale
      
      if (!this._wheelTileSyncPending) {
        this._wheelTileSyncPending = true
        requestAnimationFrame(() => {
          this._wheelTileSyncPending = false
          if (!this.ready) return
          this._commitViewportCamera()
          this._pixiRender()
        })
      }
    }, { passive: false })

    this._setupStagePanHandlers(this._app.canvas)

    this._app.stage.on('pointertap', (e: FederatedPointerEvent) => {
      this._handlePointerTap(e)
    })

    this._app.stage.on('pointermove', (e: FederatedPointerEvent) => {
      this._handlePinDragMove(e)
    })
    this._app.stage.on('pointerup', (e: FederatedPointerEvent) => {
      this._handlePinDragEnd(e)
    })
    this._app.stage.on('pointerupoutside', () => {
      this._endPinDrag()
    })
  }

  private _handlePointerTap(e: FederatedPointerEvent): void {
    if (!this.interactionGate()) return
    if (e.button !== 0) return
    if (this._pinDrag) return

    const evt = e.nativeEvent as MouseEvent
    const closestPixiDiagramNode = this._resolveClosestPixiDiagramNodeFromPixiEl(e.target)
    const diagramNodeId = closestPixiDiagramNode?.diagramNodeId

    if (diagramNodeId) {
      const openScopeBtnPixiEl = this._resolveClosestPixiElWithLabel(e.target, OPEN_SCOPE_BTN_TEXT_LABEL)
      if (openScopeBtnPixiEl) {
        this.setSelectedNodes([diagramNodeId], diagramNodeId, true)
        this._onNodeSelect?.([diagramNodeId], diagramNodeId, evt)
        this._onOpenNodeScope?.(diagramNodeId)
        return
      }
    }

    const multiSelect = evt.ctrlKey || evt.metaKey

    if (
      diagramNodeId &&
      evt.shiftKey &&
      !multiSelect &&
      this._selectedNodeIdsSet.has(diagramNodeId) &&
      this._selectedNodeIdsSet.size > 1
    ) {
      const nextIds = [...this._selectedNodeIdsSet]
      this.setSelectedNodes(nextIds, diagramNodeId, true)
      this._onNodeSelect?.(nextIds, diagramNodeId, evt)
      return
    }

    const multiSelectToggle = multiSelect
    if (!diagramNodeId) {
      if (!multiSelectToggle) {
        this.setSelectedNodes([], null, true)
        this._onNodeSelect?.([], null, evt)
      }
      return
    }

    let nextIds: string[]
    let primaryId: string | null
    if (multiSelectToggle) {
      const next = new Set(this._selectedNodeIdsSet)
      if (next.has(diagramNodeId)) {
        next.delete(diagramNodeId)
        primaryId =
          this._primarySelectedNodeId === diagramNodeId
            ? (() => {
                const a = [...next]
                return a[a.length - 1] ?? null
              })()
            : this._primarySelectedNodeId
      } else {
        next.add(diagramNodeId)
        primaryId = diagramNodeId
      }
      nextIds = [...next]
    } else {
      nextIds = [diagramNodeId]
      primaryId = diagramNodeId
    }
    this.setSelectedNodes(nextIds, primaryId, true)
    this._onNodeSelect?.(nextIds, primaryId, evt)
  }

  private _resolveClosestPixiElWithLabel(pixiEl: Container, label: string): Container | null {
    if (!this.ready) return null
    
    const appStage = this._app.stage
    const worldPixiContainer = this._worldPixiContainer

    let current: Container | null = pixiEl
    while (current) {
      if (current === appStage || current === worldPixiContainer) break
      if (current.label === label) return current
      current = current.parent
    }
    return null
  }

  /**
   * Portal overview pins / hops: rewire can only detach (drop empty).
   * Snap/reconnect is useless — disconnect GC's the portal box.
   */
  private _isPortalDetachOnlyRewire(rewire: {
    pinName: string
    grabbedConnection: DiagramConnection
  }): boolean {
    if (isCrossViewPinId(rewire.pinName)) return true
    if (isCrossViewConnection(rewire.grabbedConnection)) return true
    const host = this.graphData.allNodes.get(rewire.grabbedConnection.to)
    if (host && !isDiagramPortalNode(host) && rewire.grabbedConnection.metadata?.originalTo) {
      return true
    }
    const toNode = this.graphData.allNodes.get(rewire.grabbedConnection.to)
    if (toNode && isDiagramPortalNode(toNode)) return true
    return false
  }

  private _portalRewireShouldCancel(
    pinDrag: PinDrag,
    endWorld: { x: number; y: number },
  ): boolean {
    const {
      dragStartWorldPos,
      snap,
    } = pinDrag

    const movedDx = endWorld.x - dragStartWorldPos.x
    const movedDy = endWorld.y - dragStartWorldPos.y
    const movedSq = movedDx * movedDx + movedDy * movedDy
    if (movedSq < MIN_REWIRE_DRAG_PX * MIN_REWIRE_DRAG_PX) return true

    const cancelRadiusSq = REWIRE_PORTAL_CANCEL_RADIUS * REWIRE_PORTAL_CANCEL_RADIUS
    if (movedSq < cancelRadiusSq) return true

    if (snap) return true

    return false
  }

  /** Near original sink pin → cancel portal rewire; otherwise no snap (detach on drop). */
  private _snapPortalDetachCancel(
    rewire: NonNullable<PinDrag['rewire']>,
    worldX: number,
    worldY: number
  ): { nodeId: string; pinId: string; x: number; y: number } | undefined {
    const { connectionPixiContainer } = rewire

    const maxDistSq = CONN_REWIRE_MAX_DIST * CONN_REWIRE_MAX_DIST
    const dx = connectionPixiContainer.lineTo.x - worldX
    const dy = connectionPixiContainer.lineTo.y - worldY
    if (dx * dx + dy * dy > maxDistSq) return

    return {
      x: connectionPixiContainer.lineTo.x,
      y: connectionPixiContainer.lineTo.y,
      nodeId: rewire.hostNodeId,
      pinId: rewire.pinName,
    }
  }

  private _findValidNearestInputPinOnPixiDiagramNode(
    pixiDiagramNode: PixiDiagramNode,
    fromDiagramNodeId: string,
    worldX: number,
    worldY: number
  ): { nodeId: string; pinId: string; x: number; y: number } | undefined {
    if (!this._pinDrag) return

    const diagramNodeId = pixiDiagramNode.diagramNodeId

    const pinDragFromDiagramNodeId = this._pinDrag.fromDiagramNodeId
    if (pinDragFromDiagramNodeId === diagramNodeId) return

    const fromDiagramNode = this.graphData.allNodes.get(fromDiagramNodeId)
    if (!fromDiagramNode) return

    const toDiagramNode = this.graphData.allNodes.get(diagramNodeId)
    if (!toDiagramNode) return

    const diagramNodeWorldPos = this._resolveDiagramNodeRendererWorldPosition(toDiagramNode)
    
    let best: { nodeId: string; pinId: string; x: number; y: number } | undefined = undefined
    let bestDist = Infinity
    for (const nodePinDesc of pixiDiagramNode.nodePinsDescs) {
      if (nodePinDesc.side !== 'in' || !canConnectByPinType(fromDiagramNode.type, toDiagramNode.type, nodePinDesc.pinId)) continue
      
      const x = diagramNodeWorldPos.x + PixiDiagramNode.pinLocalX(nodePinDesc.side, toDiagramNode.size.width)
      const y = diagramNodeWorldPos.y + nodePinDesc.localY
      const d = (x - worldX) ** 2 + (y - worldY) ** 2
      if (d < bestDist) {
        bestDist = d
        best = { nodeId: diagramNodeId, pinId: nodePinDesc.pinId, x, y }
      }
    }
    return best
  }

  /** @todo check impl */
  private _resolvePinSnapTarget(
    eventTarget: Container,
    stageX: number,
    stageY: number
  ): { nodeId: string; pinId: string; x: number; y: number } | undefined {
    if (!this._pinDrag) return

    const worldX = (stageX - this._panXRef.value) / this._zoomRef.value
    const worldY = (stageY - this._panYRef.value) / this._zoomRef.value

    // Portal wires: only snap back to original end (cancel); else detach on empty drop.
    if (
      this._pinDrag.rewire &&
      this._isPortalDetachOnlyRewire(this._pinDrag.rewire)
    ) {
      return this._snapPortalDetachCancel(this._pinDrag.rewire, worldX, worldY)
    }

    const closestPixiDiagramNode = this._resolveClosestPixiDiagramNodeFromPixiEl(eventTarget)
    if (!closestPixiDiagramNode) return

    const fromDiagramNodeId = this._pinDrag.fromDiagramNodeId
    if (closestPixiDiagramNode.diagramNodeId === fromDiagramNodeId) {
      // snap to self is not allowed
      return
    }

    return this._findValidNearestInputPinOnPixiDiagramNode(closestPixiDiagramNode, fromDiagramNodeId, worldX, worldY)
  }

  private _resolveTargetDiagramNodeClosestInputPinConnection(
    diagramNodeId: string,
    worldX: number,
    worldY: number
  ): {
    fromNodeId: string
    hostNodeId: string
    pinName: string
    grabbedConnection: DiagramConnection
  } | null {
    let best: {
      fromNodeId: string
      hostNodeId: string
      pinName: string
      grabbedConnection: DiagramConnection
      dist: number
    } | null = null
    const maxDistSq = CONN_REWIRE_MAX_DIST * CONN_REWIRE_MAX_DIST

    for (const connection of this._getRenderScopeConnections()) {
      if (connection.to !== diagramNodeId) continue
      if (!connection.pinName) continue
      
      const connectionType = connection.type
      if (connectionType !== DIAGRAM_CONNECTION_TYPE_INPUT) {
        continue
      }

      const planned = this._planConnectionRender(connection)
      if (!planned) continue

      const dx = planned.to.x - worldX
      const dy = planned.to.y - worldY
      const dist = dx * dx + dy * dy
      if (dist > maxDistSq) continue
      if (best && dist >= best.dist) continue

      const crossPin = makeCrossViewPinId(connection)
      const rewirePin = crossPin ?? connection.pinName ?? ''
      const hostNodeId = isCrossViewConnection(connection) ? connection.to : diagramNodeId

      best = {
        fromNodeId: connection.from,
        hostNodeId,
        pinName: rewirePin,
        grabbedConnection: connection,
        dist,
      }
    }
    if (!best) return null
    return {
      fromNodeId: best.fromNodeId,
      hostNodeId: best.hostNodeId,
      pinName: best.pinName,
      grabbedConnection: best.grabbedConnection,
    }
  }

  private _handlePixiDiagramNodeInputPinStripDragStart(
    diagramNodeId: string,
    clientPos: { x: number, y: number },
  ): void {
    if (!this.interactionGate()) return
    if (!this.allowPinDrag) return
    if (this._pinDrag) return

    /** @todo this is repeated code */
    const worldX = (clientPos.x - this._panXRef.value) / this._zoomRef.value
    const worldY = (clientPos.y - this._panYRef.value) / this._zoomRef.value
    
    /** @todo quite slow method to resolve picked connection, because it iterates over all connections in the scope */
    const target = this._resolveTargetDiagramNodeClosestInputPinConnection(diagramNodeId, worldX, worldY)
    if (!target) return
    
    this._beginPinDrag(
      target.fromNodeId, 
      clientPos, 
      target.grabbedConnection,
    )
  }

  private _handlePixiDiagramNodeOutputPinDragStart(
    diagramNodeId: string,
    clientPos: { x: number, y: number },
  ): void {
    if (!this.interactionGate()) return
    if (!this.allowPinDrag) return
    if (this._pinDrag) return

    this._beginPinDrag(
      diagramNodeId,
      clientPos,
    )
  }

  private _setupConnectionDragLine(pinDrag: PinDrag): void {
    const connectionDragLineGraphics = pinDrag.connectionDragLineGraphics
    connectionDragLineGraphics.label = 'pin-drag-line'
    connectionDragLineGraphics.eventMode = 'none'
    this._mainAuxPixiContainer.addChild(connectionDragLineGraphics)
    this._mainAuxGraphicsLayer.attach(connectionDragLineGraphics)
  }

  private _renderConnectionDragLine(
    pinDrag: PinDrag, 
    stageX: number, 
    stageY: number,
  ): void {
    const snap = pinDrag.snap
    const toX = snap ? snap.x : (stageX - this._panXRef.value) / this._zoomRef.value
    const toY = snap ? snap.y : (stageY - this._panYRef.value) / this._zoomRef.value
    
    const fromPos = pinDrag.dragFrom
    const toPos = { x: toX, y: toY }
    const { c1, c2 } = blenderBezierControls(fromPos, toPos)
    
    const connectionDragLineGraphics = pinDrag.connectionDragLineGraphics
    connectionDragLineGraphics.clear()
    connectionDragLineGraphics.moveTo(fromPos.x, fromPos.y)
    connectionDragLineGraphics.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, toPos.x, toPos.y)
    connectionDragLineGraphics.stroke({ width: 2, color: pinDrag.dragStrokeHex, alpha: 0.9 })
  }

  private _destroyConnectionDragLine(pinDrag: PinDrag): void {
    pinDrag.connectionDragLineGraphics.removeFromParent()
    pinDrag.connectionDragLineGraphics.destroy()
  }

  private _setupPinSnapHighlight(pinDrag: PinDrag): void {
    const pinSnapHighlightGraphics = pinDrag.pinSnapHighlightGraphics
    pinSnapHighlightGraphics.eventMode = 'none'
    pinSnapHighlightGraphics.label = 'pin-snap-highlight-graphics'
    pinSnapHighlightGraphics.visible = false
    pinSnapHighlightGraphics.circle(0, 0, PIN_RADIUS + 4)
    pinSnapHighlightGraphics.stroke({ width: 2, color: 0xffffff, alpha: 0.95 })
    this._mainAuxPixiContainer.addChild(pinSnapHighlightGraphics)
    this._mainAuxGraphicsLayer.attach(pinSnapHighlightGraphics)
  }

  private _renderPinSnapHighlight(pinDrag: PinDrag): void {
    const pinSnapHighlightGraphics = pinDrag.pinSnapHighlightGraphics
    const snap = pinDrag.snap
    if (!snap) {
      pinSnapHighlightGraphics.visible = false
      return
    }

    pinSnapHighlightGraphics.visible = true
    pinSnapHighlightGraphics.x = snap.x
    pinSnapHighlightGraphics.y = snap.y
  }

  private _destroyPinSnapHighlight(pinDrag: PinDrag): void {
    pinDrag.pinSnapHighlightGraphics.removeFromParent()
    pinDrag.pinSnapHighlightGraphics.destroy()
  }

  private _beginPinDrag(
    fromNodeId: string,
    globalPos: { x: number; y: number },
    rewiredConnection?: DiagramConnection,
  ): void {
    this._endPinDrag()

    const dragStartWorldPos = {
      x: (globalPos.x - this._panXRef.value) / this._zoomRef.value,
      y: (globalPos.y - this._panYRef.value) / this._zoomRef.value,
    }

    const dragStrokeHex = resolvePinColor({
      nodeType: this.graphData.allNodes.get(fromNodeId)?.type ?? 'animAnimNode_Base',
      pinId: 'output',
      side: 'out',
    })

    if (rewiredConnection) {
      const rewiredConnectionKey = getConnectionKey(rewiredConnection)
      
      const connectionPixiContainer = this._connectionKeyToConnectionPixiContainerMap.get(rewiredConnectionKey)
      if (!connectionPixiContainer) return

      connectionPixiContainer.visible = false

      this._pinDrag = {
        fromDiagramNodeId: fromNodeId,
        dragStartWorldPos: dragStartWorldPos,
        dragFrom: { ... connectionPixiContainer.lineFrom },
        dragStrokeHex: dragStrokeHex,
        rewire: {
          hostNodeId: rewiredConnection.to,
          pinName: makeCrossViewPinId(rewiredConnection) ?? rewiredConnection.pinName ?? '',
          grabbedConnection: rewiredConnection,
          connectionPixiContainer,
        },
        connectionDragLineGraphics: new Graphics(),
        pinSnapHighlightGraphics: new Graphics(),
      }
    } else {
      this._pinDrag = {
        fromDiagramNodeId: fromNodeId,
        dragStartWorldPos: dragStartWorldPos,
        dragFrom: dragStartWorldPos,
        dragStrokeHex: dragStrokeHex,
        rewire: undefined,
        connectionDragLineGraphics: new Graphics(),
        pinSnapHighlightGraphics: new Graphics(),
      }
    }

    this._setupPinSnapHighlight(this._pinDrag)
    this._setupConnectionDragLine(this._pinDrag)

    this._updatePinDragLine(globalPos.x, globalPos.y)
  }

  private _updatePinDragLine(
    stageX: number,
    stageY: number,
    eventTarget?: Container
  ): void {
    if (!this._pinDrag) return

    this._pinDrag.snap = eventTarget 
      ? this._resolvePinSnapTarget(eventTarget, stageX, stageY) 
      : undefined
    this._renderPinSnapHighlight(this._pinDrag)
    this._renderConnectionDragLine(this._pinDrag, stageX, stageY)
  }

  private _endPinDrag(options?: { restoreHidden?: boolean }): void {
    if (!this._pinDrag) return

    const restoreHidden = options?.restoreHidden !== false
    if (restoreHidden && this._pinDrag.rewire?.connectionPixiContainer) {
      this._pinDrag.rewire.connectionPixiContainer.visible = true
    }
    this._destroyConnectionDragLine(this._pinDrag)
    this._destroyPinSnapHighlight(this._pinDrag)

    this._pinDrag = undefined
  }

  private _handlePinDragMove(e: FederatedPointerEvent): void {
    if (!this._pinDrag) return
    this._updatePinDragLine(e.global.x, e.global.y, e.target)
  }

  private _handlePinDragEnd(e: FederatedPointerEvent): void {
    if (!this._pinDrag) return
    const pinDrag = this._pinDrag

    const endWorld = {
      x: (e.global.x - this._panXRef.value) / this._zoomRef.value,
      y: (e.global.y - this._panYRef.value) / this._zoomRef.value,
    }

    const movedDx = endWorld.x - pinDrag.dragStartWorldPos.x
    const movedDy = endWorld.y - pinDrag.dragStartWorldPos.y
    
    const clickOnly =
      movedDx * movedDx + movedDy * movedDy <
      MIN_REWIRE_DRAG_PX * MIN_REWIRE_DRAG_PX
    
    const snap = pinDrag.snap = this._resolvePinSnapTarget(e.target, e.global.x, e.global.y)
    
    const fromNodeId = pinDrag.fromDiagramNodeId
    const rewire = pinDrag.rewire
    
    this._endPinDrag({ restoreHidden: clickOnly })
    if (clickOnly) return

    if (rewire) {
      rewire.connectionPixiContainer.visible = true

      if (this._isPortalDetachOnlyRewire(rewire) && this._portalRewireShouldCancel(pinDrag, endWorld)) {
        return
      }

      if (snap && snap.nodeId === rewire.hostNodeId && snap.pinId === rewire.pinName) {
        return
      }

      if (this._onPinRewire) {
        // hide connection it will be rewired
        rewire.connectionPixiContainer.visible = false

        this._onPinRewire({
          grabbedConnection: rewire.grabbedConnection,
          hostNodeId: rewire.hostNodeId,
          pinName: rewire.pinName,
          newToNodeId: snap?.nodeId,
          newPinName: snap?.pinId,
        })
      }

      return
    }

    if (!snap) return
    this._onPinConnect?.({
      fromNodeId,
      toNodeId: snap.nodeId,
      pinName: snap.pinId,
    })
  }

  private _resolveClosestPixiDiagramNodeFromPixiEl(pixiEl: Container): PixiDiagramNode | undefined {
    if (!this.ready) return

    const appStage = this._app.stage
    const worldPixiContainer = this._worldPixiContainer

    let current: Container | null = pixiEl
    while (current) {
      if (current === appStage || current === worldPixiContainer) break
      
      const pixiDiagramNode = this._pixiDiagramNodeContainerToPixiDiagramNodeWeakMap.get(current)
      if (pixiDiagramNode) return pixiDiagramNode
      
      current = current.parent
    }
  }

  private _setupStagePanHandlers(canvas: HTMLCanvasElement): void {
    const endPan = () => {
      if (!this._panSession) return
      this._panSession = null
      canvas.style.cursor = 'default'
      
      this._commitViewportCamera()
      this._pixiRender()
    }

    canvas.addEventListener('mousedown', (evt) => {
      if (evt.button !== 1) return
      evt.preventDefault()
      
      const pointerCanvasPos = this._clientToCanvasPosition(evt.clientX, evt.clientY)
      if (!pointerCanvasPos) return

      canvas.style.cursor = 'grabbing'
      this._panSession = {
        startPointer: pointerCanvasPos,
        startStagePos: { x: this._panXRef.value, y: this._panYRef.value },
      }
    })

    canvas.addEventListener('mousemove', (evt) => {
      if (!this._panSession) return

      const pointerCanvasPos = this._clientToCanvasPosition(evt.clientX, evt.clientY)
      if (!pointerCanvasPos) return

      const dx = pointerCanvasPos.x - this._panSession.startPointer.x
      const dy = pointerCanvasPos.y - this._panSession.startPointer.y
      this._panXRef.value = this._panSession.startStagePos.x + dx
      this._panYRef.value = this._panSession.startStagePos.y + dy
      
      this._pixiRender()
    })

    canvas.addEventListener('mouseup', (evt) => {
      if (evt.button === 1 || this._panSession) endPan()
    })
    canvas.addEventListener('mouseleave', () => {
      if (this._panSession) endPan()
    })
    canvas.addEventListener('contextmenu', (evt) => {
      if (evt.button === 1) evt.preventDefault()
    })
  }

  /**
   * Setup resize observer
   */
  private _setupResizeObserver(): void {
    if (!window.ResizeObserver) return
    this._resizeObserver?.disconnect()
    let resizeRaf = 0
    this._resizeObserver = new ResizeObserver(() => {
      if (resizeRaf) cancelAnimationFrame(resizeRaf)
      resizeRaf = requestAnimationFrame(() => {
        resizeRaf = 0
        this._resizeStage()
      })
    })
    this._resizeObserver.observe(this.container)
  }

  /**
   * Resize renderer to container — do not rebuild the scene.
   * Full _render() on resize destroys all Text nodes and can crash Pixi
   * TexturePool when another Application was just torn down.
   */
  private _resizeStage(): void {
    if (!this.ready) return
    
    const newWidth = this.container.clientWidth
    const newHeight = this.container.clientHeight
    
    if (newWidth <= 0 || newHeight <= 0) return
    if (newWidth === this._viewportWidthRef.value && newHeight === this._viewportHeightRef.value) return

    this._app.renderer.resize(newWidth, newHeight)
    if (this._app.stage.hitArea instanceof Rectangle) {
      this._app.stage.hitArea.width = newWidth
      this._app.stage.hitArea.height = newHeight
    }

    this._viewportWidthRef.value = newWidth
    this._viewportHeightRef.value = newHeight
    
    this._dotGrid?.resize(newWidth, newHeight)
    
    // resize() clears the framebuffer; ticker may paint only on the next frame.
    if (!this._suspended) this._app.render()
  }

  /**
   * Get all tile keys that intersect with a node
   */
  private getDiagramNodeSize(node: RenderNode): { width: number; height: number } {
    return node.size ?? {
      width: 120,
      height: 80,
    }
  }

  private _resolveDiagramNodeTileKeys(
    diagramNode: RenderNode,
    viewRootDiagramNodeIdsSet: Set<string>,
  ): { oversized: true } | { oversized: false, tileKeys: string[] } {
    const diagramNodeRendererWorldPos = this._resolveDiagramNodeRendererWorldPosition(diagramNode, viewRootDiagramNodeIdsSet)
    if (!diagramNodeRendererWorldPos) {
      console.error('Diagram node renderer world position not resolved, continuing as oversized', diagramNode.id)
      return { oversized: true }
    }

    const { width: nodeWidth, height: nodeHeight } = this.getDiagramNodeSize(diagramNode)

    const left = diagramNodeRendererWorldPos.x
    const top = diagramNodeRendererWorldPos.y
    const right = left + nodeWidth
    const bottom = top + nodeHeight

    if (
      !Number.isFinite(left) ||
      !Number.isFinite(top) ||
      !Number.isFinite(right) ||
      !Number.isFinite(bottom)
    ) {
      console.error('Diagram node renderer world position is not finite, continuing as oversized', diagramNode.id)
      return { oversized: true }
    }

    const leftTile = Math.floor(left / this._tileSize)
    const topTile = Math.floor(top / this._tileSize)
    const rightTile = Math.floor(right / this._tileSize)
    const bottomTile = Math.floor(bottom / this._tileSize)
    const spanX = rightTile - leftTile
    const spanY = bottomTile - topTile

    // Dense fill for moderate nodes. Huge nodes: sparse tiles + oversized AABB path.
    // NEVER fall back to origin-only — that culls the node when origin leaves the view
    // while the body is still on screen.
    const maxDenseSpan = 128
    if (spanX > maxDenseSpan || spanY > maxDenseSpan) {
      return { oversized: true }
    }

    const tileKeys: string[] = []
    for (let tileX = leftTile; tileX <= rightTile; tileX++) {
      for (let tileY = topTile; tileY <= bottomTile; tileY++) {
        tileKeys.push(`${tileX},${tileY}`)
      }
    }

    return { oversized: false, tileKeys }
  }

  private _resolveViewportWorldRect(padding: number = 0): {
    x: number
    y: number
    width: number
    height: number
  } {
    const scale = this._zoomRef.value || 1
    const x = -this._panXRef.value / scale - padding
    const y = -this._panYRef.value / scale - padding
    const width = this._viewportWidthRef.value / scale + padding * 2
    const height = this._viewportHeightRef.value / scale + padding * 2
    return { x, y, width, height }
  }

  private _isDiagramNodeIntersectsWorldRect(
    diagramNode: RenderNode,
    rect: { x: number; y: number; width: number; height: number }
  ): boolean {
    const diagramNodeWorldPos = this._resolveDiagramNodeRendererWorldPosition(diagramNode)

    const size = diagramNode.size
    const nx = diagramNodeWorldPos.x
    const ny = diagramNodeWorldPos.y
    return !(
      nx + size.width < rect.x ||
      ny + size.height < rect.y ||
      nx > rect.x + rect.width ||
      ny > rect.y + rect.height
    )
  }

  public isDiagramNodeBelongToThisView(diagramNode: RenderNode): boolean {
    // If the node is already mounted, it belongs to this view
    if (this._diagramNodeIdToPixiDiagramNodeMap.has(diagramNode.id)) return true

    const viewRootDiagramNodeIdsSet = this._resolveViewRootDiagramNodeIdsSet()

    let currentDiagramNode = diagramNode.parent
    while (currentDiagramNode) {
      if (isDiagramOverviewLeaf(currentDiagramNode)) return false
      if (viewRootDiagramNodeIdsSet.has(currentDiagramNode.id)) return true
      currentDiagramNode = currentDiagramNode.parent
    }
    return viewRootDiagramNodeIdsSet.has(diagramNode.id)
  }

  // #region Internal: Rendering

  private _render(): void {
    this._destroyTileRenderResources()
    this._destroyNodeRenderResources()
    this._destroyConnectionRenderResources()
    
    // Clear existing objects and lookup maps
    this.simOverlayKeyIndex = null

    // Render nodes using tile system
    this._renderNodes()

    // Render connections
    this._renderConnections()
  }

  private _destroyNodeRenderResources(): void {
    for (const pixiDiagramNode of this._diagramNodeIdToPixiDiagramNodeMap.values()) {
      pixiDiagramNode.destroy()
    }
    this._diagramNodeIdToPixiDiagramNodeMap.clear()
  }

  private _destroyConnectionRenderResources(): void {
    for (const connectionPixiContainer of this._connectionKeyToConnectionPixiContainerMap.values()) {
      destroyPixiTree(connectionPixiContainer)
    }
    this._connectionKeyToConnectionPixiContainerMap.clear()
  }

  private _destroyTileRenderResources(): void {
    this._virtualTiles.clear()
    this._oversizedDiagramNodeIdsSet.clear()
  }

  private _ensureTile(tileKey: string): { nodes: Set<PixiDiagramNode>; connections: Set<ConnectionPixiContainer> } {
    let tile = this._virtualTiles.get(tileKey)
    if (!tile) {
      tile = { nodes: new Set(), connections: new Set() }
      this._virtualTiles.set(tileKey, tile)
    }
    return tile
  }

  /** 
   * Add oversized diagram nodes to the set of diagram nodes that are mounted in the viewport, if their AABB intersects the viewport. 
   */
  private _addOversizedDiagramNodesToDiagramNodeIdViewportMountSet(diagramNodeIdsSet: Set<string>): void {
    if (this._oversizedDiagramNodeIdsSet.size === 0) return

    const viewportWorldRect = this._resolveViewportWorldRect(this._tileSize * 0.25)
    for (const diagramNodeId of this._oversizedDiagramNodeIdsSet) {
      const node = this.graphData.allNodes.get(diagramNodeId)
      if (!node || node.visible === false) return
      
      if (this._isDiagramNodeIntersectsWorldRect(node, viewportWorldRect)) {
        diagramNodeIdsSet.add(diagramNodeId)
      }
    }
  }

  /** All tiles a line segment passes through (world coordinates). */
  private _resolveLineTileKeys(x1: number, y1: number, x2: number, y2: number): string[] {
    const tileKeys = new Set<string>()

    const startTileX = Math.floor(x1 / this._tileSize)
    const startTileY = Math.floor(y1 / this._tileSize)
    const endTileX = Math.floor(x2 / this._tileSize)
    const endTileY = Math.floor(y2 / this._tileSize)

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
      tileKeys.add(`${Math.floor(x / this._tileSize)},${Math.floor(y / this._tileSize)}`)
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

  private _resolveConnectionPixiContainerTileKeysSet(connectionPixiContainer: ConnectionPixiContainer): Set<string> {
    return this._resolvePolylineTileKeys(
      sampleBlenderConnection(connectionPixiContainer.lineFrom, connectionPixiContainer.lineTo, 8)
    )
  }

  private _resolvePolylineTileKeys(points: Array<{ x: number; y: number }>): Set<string> {
    const tileKeys = new Set<string>()
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i]!
      const b = points[i + 1]!
      for (const key of this._resolveLineTileKeys(a.x, a.y, b.x, b.y)) {
        tileKeys.add(key)
      }
    }
    return tileKeys
  }

  private _reindexConnectionToTiles(
    connectionPixiContainer: ConnectionPixiContainer,
  ): void {
    const connectionPixiContainerTileKeysSet = this._resolveConnectionPixiContainerTileKeysSet(connectionPixiContainer)

    this._removeConnectionFromTiles(connectionPixiContainer)
    this._connectionPixiContainerToTileKeysSetWeakMap.set(connectionPixiContainer, connectionPixiContainerTileKeysSet)
    connectionPixiContainerTileKeysSet.forEach((tileKey) => {
      this._ensureTile(tileKey).connections.add(connectionPixiContainer)
    })
  }

  private _removeConnectionFromTiles(connectionPixiContainer: ConnectionPixiContainer): void {
    const tileKeys = this._connectionPixiContainerToTileKeysSetWeakMap.get(connectionPixiContainer)
    if (!tileKeys) return
    tileKeys.forEach((tileKey) => {
      this._virtualTiles.get(tileKey)?.connections.delete(connectionPixiContainer)
    })
    this._connectionPixiContainerToTileKeysSetWeakMap.delete(connectionPixiContainer)
  }

  private _resolveDiagramNodePixiDiagramNodePinWorldPos(
    diagramNode: RenderNode,
    pinId: string,
  ): { x: number; y: number } | undefined {
    const origin = this._resolveDiagramNodeRendererWorldPosition(diagramNode)
    if (!origin) return

    const pixiDiagramNode = this._diagramNodeIdToPixiDiagramNodeMap.get(diagramNode.id)
    if (!pixiDiagramNode) return

    const pinLocalPos = pixiDiagramNode.getPinPosition(pinId)
    if (!pinLocalPos) return

    return { x: origin.x + pinLocalPos.x, y: origin.y + pinLocalPos.y }
  }

  private _resolveConnectionAnchors(
    connection: DiagramConnection,
    fromNode: RenderNode,
    toNode: RenderNode
  ): { from: { x: number; y: number }; to: { x: number; y: number } } | undefined {
    if (fromNode.id === toNode.id) return
    if (isDiagramPortalNode(toNode)) return
    if (!this.isDiagramNodeBelongToThisView(fromNode) || !this.isDiagramNodeBelongToThisView(toNode)) {
      return
    }
    if (!connection.pinName) return

    const connectionIsCrossView = isCrossViewConnection(connection)
    const toPt = connectionIsCrossView && connection.to !== connection.metadata.originalTo 
      ? this._resolveDiagramNodePixiDiagramNodePinWorldPos(toNode, makeCrossViewConnectionPortalPinId(connection))
      : this._resolveDiagramNodePixiDiagramNodePinWorldPos(toNode, connection.pinName)
    if (!toPt) return

    let fromPt = this._resolveDiagramNodePixiDiagramNodePinWorldPos(fromNode, 'output')
    if (!fromPt) {
      const fromNodeWorldPos = this._resolveDiagramNodeRendererWorldPosition(fromNode)
      if (!fromNodeWorldPos) return

      const fromNodeSize = this.getDiagramNodeSize(fromNode)
      fromPt = borderPointOnRect(
        { x: fromNodeWorldPos.x, y: fromNodeWorldPos.y, width: fromNodeSize.width, height: fromNodeSize.height }, 
        toPt.x, 
        toPt.y
      )
    }

    return { from: fromPt, to: toPt }
  }

  private _planConnectionRender(connection: DiagramConnection) {
    const fromNode = this.graphData.allNodes.get(connection.from)
    const toNode = this.graphData.allNodes.get(connection.to)
    if (!fromNode || !toNode) return
    if (fromNode.visible === false || toNode.visible === false) return

    const anchors = this._resolveConnectionAnchors(connection, fromNode, toNode)
    if (!anchors) return

    return {
      from: anchors.from,
      to: anchors.to,
      pinName: connection.pinName,
      dashed: false,
      showArrow: false,
    }
  }

  private _resolveWorldRectTileKeys(rect: { x: number; y: number; width: number; height: number }): string[] {
    const tileKeys: string[] = []
    const startTileX = Math.floor(rect.x / this._tileSize)
    const endTileX = Math.floor((rect.x + rect.width) / this._tileSize)
    const startTileY = Math.floor(rect.y / this._tileSize)
    const endTileY = Math.floor((rect.y + rect.height) / this._tileSize)
    
    for (let tileX = startTileX; tileX <= endTileX; tileX++) {
      for (let tileY = startTileY; tileY <= endTileY; tileY++) {
        tileKeys.push(PixiGraphRenderer.makeTileKey(tileX, tileY))
      }
    }

    return tileKeys
  }

  private _resolveViewportTileKeys(): string[] {
    if (!this.ready) return []

    const viewportWorldRect = this._resolveViewportWorldRect(0)

    return this._resolveWorldRectTileKeys(viewportWorldRect)
  }

  /**
   * Remount viewport tiles.
   * Every diagram node is indexed in the tile grid; scope roots mounted with whole subtree,
   * scope root subtree nodes are hidden if they are not in the viewport.
   */
  private _remountViewportTiles(): void {
    const viewportWorldRect = this._resolveViewportWorldRect(0)
    const viewportTileKeys = this._resolveWorldRectTileKeys(viewportWorldRect)

    // Collect all diagram node ids that are visible in the viewport.
    const viewportMountDiagramNodeIdsSet = new Set<string>()
    viewportTileKeys.forEach((tileKey) => {
      const tile = this._virtualTiles.get(tileKey)
      if (!tile) return
      tile.nodes.forEach((pixiDiagramNode) => {
        viewportMountDiagramNodeIdsSet.add(pixiDiagramNode.diagramNodeId)
      })
    })

    this._addOversizedDiagramNodesToDiagramNodeIdViewportMountSet(viewportMountDiagramNodeIdsSet)

    const viewRootDiagramNodeIdsSet = this._resolveViewRootDiagramNodeIdsSet()

    // ensure all view root diagram nodes are mounted
    const additionalToMountDiagramNodeIds = new Set<string>()
    viewportMountDiagramNodeIdsSet.forEach((visibleDiagramNodeId) => {
      const visibleDiagramNode = this.graphData.allNodes.get(visibleDiagramNodeId)
      if (!visibleDiagramNode) return

      let currentDiagramNode = visibleDiagramNode.parent
      while (currentDiagramNode && !viewRootDiagramNodeIdsSet.has(currentDiagramNode.id)) {
        const currentDiagramNodeId = currentDiagramNode.id
        if (viewportMountDiagramNodeIdsSet.has(currentDiagramNodeId)) break
        if (additionalToMountDiagramNodeIds.has(currentDiagramNodeId)) break

        additionalToMountDiagramNodeIds.add(currentDiagramNodeId)
        currentDiagramNode = currentDiagramNode.parent
      }
    })
    for (const additionalToMountDiagramNodeId of additionalToMountDiagramNodeIds) {
      viewportMountDiagramNodeIdsSet.add(additionalToMountDiagramNodeId)
    }

    const mountedDiagramNodeIdToDepthLevelMap = new Map<string, number>()

    const mountDiaramBranch = (diagramNode: RenderNode, depthLevel: number) => {
      const visible = viewportMountDiagramNodeIdsSet.has(diagramNode.id)

      const pixiDiagramNode = this._diagramNodeIdToPixiDiagramNodeMap.get(diagramNode.id)
      if (!pixiDiagramNode) return

      pixiDiagramNode.pixiContainer.visible = visible
      if (!visible) return

      const nodeElsContainer = this._nodePixiContainerToNodeElsContainerWeakMap.get(pixiDiagramNode.pixiContainer)
      if (!nodeElsContainer) return

      mountedDiagramNodeIdToDepthLevelMap.set(diagramNode.id, depthLevel)

      this._ensureDepthRenderLayers(depthLevel)
      const depthGraphicsLayer = this.depthGraphicsLayers[depthLevel]
      const depthTextLayer = this.depthTextLayers[depthLevel]
      depthGraphicsLayer.attach(pixiDiagramNode.pixiContainer)
      nodeElsContainer.graphics.forEach((graphics) => {
        attachToRenderLayer(depthGraphicsLayer, graphics)
      })
      nodeElsContainer.texts.forEach((text) => {
        attachToRenderLayer(depthTextLayer, text)
      })

      forEachDirectChild(diagramNode, (childNode) => {
        mountDiaramBranch(childNode, depthLevel + 1)
      })
    }

    // Mounting visible scope roots to the nodes layer
    viewRootDiagramNodeIdsSet.forEach((viewRootDiagramNodeId) => {
      const viewRootDiagramNode = this.graphData.allNodes.get(viewRootDiagramNodeId)
      if (!viewRootDiagramNode) return

      const pixiDiagramNode = this._diagramNodeIdToPixiDiagramNodeMap.get(viewRootDiagramNodeId)
      if (!pixiDiagramNode) return

      if (!viewportMountDiagramNodeIdsSet.has(viewRootDiagramNodeId)) {
        detachTreeFromRenderLayers(pixiDiagramNode.pixiContainer)
        reparentTo(pixiDiagramNode.pixiContainer, this._stagingPixiContainer)
        return
      }

      reparentTo(pixiDiagramNode.pixiContainer, this._mainNodesPixiContainer)

      mountDiaramBranch(viewRootDiagramNode, 0)
    })

    const resolveDiagramNodeDepthLevel = (diagramNodeId: string) => {
      let depthLevel = 0
      let currentDiagramNode = this.graphData.allNodes.get(diagramNodeId)
      while (currentDiagramNode && !viewRootDiagramNodeIdsSet.has(currentDiagramNode.id)) {
        depthLevel++
        currentDiagramNode = currentDiagramNode.parent
      }
      return depthLevel
    }

    const resolveConnectionDiagramNodeDepthLevel = (diagramNodeId: string) => {
      let depthLevel = mountedDiagramNodeIdToDepthLevelMap.get(diagramNodeId)
      if (depthLevel || depthLevel === 0) return depthLevel
      return resolveDiagramNodeDepthLevel(diagramNodeId)
    }

    const connectionOverlays: Container[] = []
    if (this._pinDrag?.connectionDragLineGraphics && this._pinDrag.connectionDragLineGraphics.parent === this._mainConnectionsPixiContainer) {
      connectionOverlays.push(this._pinDrag.connectionDragLineGraphics)
    }
    if (
      this._pinDrag?.pinSnapHighlightGraphics &&
      this._pinDrag.pinSnapHighlightGraphics.parent === this._mainConnectionsPixiContainer
    ) {
      connectionOverlays.push(this._pinDrag.pinSnapHighlightGraphics)
    }
    const connectionOverlaySet = new Set(connectionOverlays)
    for (const child of this._mainConnectionsPixiContainer.children) {
      if (connectionOverlaySet.has(child)) continue
      detachTreeFromRenderLayers(child)
    }
    this._mainConnectionsPixiContainer.removeChildren()
    for (const overlay of connectionOverlays) {
      this._mainConnectionsPixiContainer.addChild(overlay)
    }
    const addedConnections = new Set<NodeGroup>()
    viewportTileKeys.forEach((tileKey) => {
      const tile = this._virtualTiles.get(tileKey)
      if (!tile) return
      tile.connections.forEach((connectionPixiContainer) => {
        if (addedConnections.has(connectionPixiContainer)) return
        if ((connectionPixiContainer as { destroyed?: boolean }).destroyed) return
        addedConnections.add(connectionPixiContainer)

        const connection = connectionPixiContainer.connection
        const connectionFromDiagramNodeLevel = resolveConnectionDiagramNodeDepthLevel(connection.from)
        const connectionToDiagramNodeLevel = resolveConnectionDiagramNodeDepthLevel(connection.to)
        const connectionDepthLevel = Math.max(connectionFromDiagramNodeLevel, connectionToDiagramNodeLevel)
        
        this._mainConnectionsPixiContainer!.addChild(connectionPixiContainer)

        this._ensureDepthRenderLayers(connectionDepthLevel)
        const nodeElsContainer = this._nodePixiContainerToNodeElsContainerWeakMap.get(connectionPixiContainer)
        if (!nodeElsContainer) return
        nodeElsContainer.graphics.forEach((graphics) => {
          attachToRenderLayer(this.depthConnectionGraphicsLayers[connectionDepthLevel], graphics)
        })
      })
    })

    this._mountedTileKeysSet = new Set(viewportTileKeys)
    this._viewportMountedDiagramNodeIdsSetRef.value = viewportMountDiagramNodeIdsSet
    this._lastMountedViewportWorldRect = viewportWorldRect
  }

  private _resolveViewRootDiagramNodes(): RenderNode[] {
    if (this._scopeRootId) {
      const scopeRootDiagramNode = this.graphData.allNodes.get(this._scopeRootId)
      if (!scopeRootDiagramNode) return []

      return !this.hideScopeRoot
        ? [scopeRootDiagramNode]
        : getChildSlotDiagramNodes(scopeRootDiagramNode, DEFAULT_CHILD_SLOT)
    } else {
      return this.graphData.rootNodes
    }
  }

  private _resolveViewRootDiagramNodeIdsSet(): Set<string> {
    return this._resolveViewRootDiagramNodes().reduce((acc, root) => {
      acc.add(root.id)
      return acc
    }, new Set<string>())
  }

  private _renderDebugOverlays(): void {
    if (!this.ready) return
    destroyContainerChildren(this._debugContentPixiContainer)
    
    if (this._showDebugTiles) this._paintDebugTiles()
    if (this._showDebugLayoutContainers) this._paintDebugLayoutContainers()
  }

  private _paintDebugTiles(): void {
    for(const tileKey of this._resolveViewportTileKeys()) {
      const [tileX, tileY] = tileKey.split(',').map(Number)
      const x = tileX * this._tileSize
      const y = tileY * this._tileSize

      const debugTileGraphics = new Graphics()
      debugTileGraphics.label = 'debug-tile'
      debugTileGraphics.eventMode = 'none'
      debugTileGraphics.rect(x, y, this._tileSize, this._tileSize)
      debugTileGraphics.stroke({ width: 2, color: 0xffffff, alpha: 1 })
      debugTileGraphics.fill({ color: 0xffffff, alpha: 0.1 })
      debugTileGraphics.tint = 0xff0000
      this._debugContentPixiContainer.addChild(debugTileGraphics)
      this._debugGraphicsLayer.attach(debugTileGraphics)

      const tileInfoText = createDiagramText({
        text: `${tileKey}\n${this._virtualTiles.get(tileKey)?.nodes.size || 0}n\n${this._virtualTiles.get(tileKey)?.connections.size || 0}c`,
        style: { fontSize: 12, fontFamily: 'Arial', fill: 'white' },
      })
      tileInfoText.tint = 0xff0000
      tileInfoText.x = x + 5
      tileInfoText.y = y + 5
      this._debugContentPixiContainer.addChild(tileInfoText)
      this._debugTextLayer.attach(tileInfoText)
    }

    const viewportRect = new Graphics()
    viewportRect.label = 'debug-viewport'
    viewportRect.eventMode = 'none'
    viewportRect.rect(
      -this._panXRef.value / this._zoomRef.value,
      -this._panYRef.value / this._zoomRef.value,
      this._viewportWidthRef.value / this._zoomRef.value,
      this._viewportHeightRef.value / this._zoomRef.value
    )
    viewportRect.stroke({ width: 3, color: 0xffffff, alpha: 1 })
    viewportRect.fill({ color: 0xffffff, alpha: 0.1 })
    viewportRect.tint = 0x00ff00
    this._debugContentPixiContainer.addChild(viewportRect)
    this._debugGraphicsLayer.attach(viewportRect)
  }

  /** @todo improve render batching of graphics  */
  private _paintDebugLayoutContainers(): void {
    if (!this._debugContentPixiContainer) return
    if (!this._debugGraphicsLayer) return
    if (!this._debugTextLayer) return

    const colors = [0x22c55e, 0xeab308, 0x38bdf8, 0xf472b6, 0xa78bfa]

    const viewRootDiagramNodeIdsSet = this._resolveViewRootDiagramNodeIdsSet()

    for (const viewportMountedNodeId of this._viewportMountedDiagramNodeIdsSetRef.value) {
      const diagramNode = this.graphData.allNodes.get(viewportMountedNodeId)
      if (!diagramNode) continue

      const boxes = diagramNode.layoutDebugContainers
      if (!boxes?.length) continue

      const diagramNodeWorldPos = this._resolveDiagramNodeRendererWorldPosition(
        diagramNode, 
        viewRootDiagramNodeIdsSet
      )

      for (const box of boxes) {
        const color = colors[Math.abs(box.depth) % colors.length]!
        
        const boxGraphics = new Graphics()
        boxGraphics.label = 'debug-layout-box'
        boxGraphics.eventMode = 'none'
        boxGraphics.rect(diagramNodeWorldPos.x + box.x, diagramNodeWorldPos.y + box.y, box.width, box.height)
        boxGraphics.stroke({ width: 2, color, alpha: 0.95 })
        boxGraphics.fill({ color, alpha: 0.08 })
        this._debugContentPixiContainer.addChild(boxGraphics)
        this._debugGraphicsLayer.attach(boxGraphics)

        const boxLabelText = createDiagramText({
          text: `${box.role} d${box.depth}${box.innerHubId ? `\n${box.innerHubId}` : ''}`,
          style: {
            fontSize: 11,
            fontFamily: 'Arial',
            fill: 'white',
          },
        })
        boxLabelText.tint = color
        boxLabelText.x = diagramNodeWorldPos.x + box.x + 4
        boxLabelText.y = diagramNodeWorldPos.y + box.y + 4
        this._debugContentPixiContainer.addChild(boxLabelText)
        this._debugTextLayer.attach(boxLabelText)
      }
    }
  }

  private _reindexDiagramNodesIntoTiles(movedDiagramNodeIds: string[]): void {
    if (movedDiagramNodeIds.length === 0) return

    // Batch process: collect all changes first, then apply them
    const tileKeyToTileUpdateRecordMap = new Map<string, { toAdd: PixiDiagramNode[], toRemove: PixiDiagramNode[] }>()
    
    // Initialize tile updates map
    const ensureTileUpdateRecord = (tileKey: string): { toAdd: PixiDiagramNode[], toRemove: PixiDiagramNode[] } => {
      let record = tileKeyToTileUpdateRecordMap.get(tileKey)
      if (!record) {
        record = { toAdd: [], toRemove: [] }
        tileKeyToTileUpdateRecordMap.set(tileKey, record)
      }
      return record
    }

    const viewRootDiagramNodeIdsSet = this._resolveViewRootDiagramNodeIdsSet()

    // Process all moved nodes
    movedDiagramNodeIds.forEach(diagramNodeId => {
      const diagramNode = this.graphData.allNodes.get(diagramNodeId)
      if (!diagramNode || !diagramNode.position) return

      const pixiDiagramNode = this._diagramNodeIdToPixiDiagramNodeMap.get(diagramNodeId)
      if (!pixiDiagramNode) return

      // Calculate new tile keys for this node
      const tileKeysResolveResult = this._resolveDiagramNodeTileKeys(diagramNode, viewRootDiagramNodeIdsSet)
      
      // Find current tile keys where this node exists (using reverse index)
      const currentTileKeys: string[] = []
      const nodeTileKeysSet = this._pixiDiagramNodeToTileKeysSetWeakMap.get(pixiDiagramNode)
      if (nodeTileKeysSet) {
        currentTileKeys.push(...Array.from(nodeTileKeysSet))
      }

      // Mark tiles for removal
      currentTileKeys.forEach(tileKey => {
        ensureTileUpdateRecord(tileKey).toRemove.push(pixiDiagramNode)
      })

      // Mark tiles for addition
      if (tileKeysResolveResult.oversized) {
        this._oversizedDiagramNodeIdsSet.add(diagramNodeId)
      } else {
        for (const tileKey of tileKeysResolveResult.tileKeys) {
          ensureTileUpdateRecord(tileKey).toAdd.push(pixiDiagramNode)
        }
      }
    })

    // Apply all tile updates in batch
    tileKeyToTileUpdateRecordMap.forEach((tileUpdateRecord, tileKey) => {
      const tile = this._virtualTiles.get(tileKey)
      
      if (tile) {
        // Remove nodes from existing tile
        tileUpdateRecord.toRemove.forEach(pixiDiagramNode => {
          tile.nodes.delete(pixiDiagramNode)
          // Update reverse index
          const nodeTiles = this._pixiDiagramNodeToTileKeysSetWeakMap.get(pixiDiagramNode)
          if (nodeTiles) {
            nodeTiles.delete(tileKey)
            if (nodeTiles.size === 0) {
              this._pixiDiagramNodeToTileKeysSetWeakMap.delete(pixiDiagramNode)
            }
          }
        })
        
        // Add nodes to existing tile
        tileUpdateRecord.toAdd.forEach(pixiDiagramNode => tile.nodes.add(pixiDiagramNode))
        tileUpdateRecord.toAdd.forEach(pixiDiagramNode => {
          // Update reverse index
          if (!this._pixiDiagramNodeToTileKeysSetWeakMap.has(pixiDiagramNode)) {
            this._pixiDiagramNodeToTileKeysSetWeakMap.set(pixiDiagramNode, new Set())
          }
          this._pixiDiagramNodeToTileKeysSetWeakMap.get(pixiDiagramNode)!.add(tileKey)
        })
      } else if (tileUpdateRecord.toAdd.length > 0) {
        // Create new tile with nodes
        this._virtualTiles.set(tileKey, {
          nodes: new Set(tileUpdateRecord.toAdd),
          connections: new Set(),
        })
        // Update reverse index for new tile
        tileUpdateRecord.toAdd.forEach(pixiDiagramNode => {
          if (!this._pixiDiagramNodeToTileKeysSetWeakMap.has(pixiDiagramNode)) {
            this._pixiDiagramNodeToTileKeysSetWeakMap.set(pixiDiagramNode, new Set())
          }
          this._pixiDiagramNodeToTileKeysSetWeakMap.get(pixiDiagramNode)!.add(tileKey)
        })
      }
    })
  }

  private _createDiagramNodeRender(
    diagramNode: RenderNode,
  ): PixiDiagramNode {
    const pixiDiagramNode = new PixiDiagramNode({
      ctx: this._pixiDiagramNodeCtx,
      diagramNodeId: diagramNode.id,
      diagramNodeType: diagramNode.type,
      showOpenScopeBtn: isDiagramOverviewLeaf(diagramNode),
      selected: this._selectedNodeIdsSet.has(diagramNode.id),
      x: diagramNode.position.x,
      y: diagramNode.position.y,
      width: diagramNode.size.width,
      height: diagramNode.size.height,
      visualOptions: PixiDiagramNode.resolvePixiDiagramNodeVisualOptions(this.graphData, diagramNode),
      nodePins: buildNodePins(
        diagramNode,
        diagramNode.size,
        this.graphData,
      ),
      bodyModel: presentNodeBody(diagramNode, this.graphData),
      simNodeState: this._lookupSimNodeState(this._simOverlayData?.nodes, diagramNode),
    })
    pixiDiagramNode.setup()
    pixiDiagramNode.update()

    const nodeElsContainer: NodeElsContainer = {
      connections: new Set(),
      graphics: new Set(),
      texts: new Set(),
    }

    this._diagramNodeIdToPixiDiagramNodeMap.set(diagramNode.id, pixiDiagramNode)
    this._pixiDiagramNodeToTileKeysSetWeakMap.set(pixiDiagramNode, new Set())
    this._pixiDiagramNodeContainerToPixiDiagramNodeWeakMap.set(pixiDiagramNode.pixiContainer, pixiDiagramNode)
    this._nodePixiContainerToNodeElsContainerWeakMap.set(pixiDiagramNode.pixiContainer, nodeElsContainer)

    return pixiDiagramNode
  }

  private _renderDiagramSubtree(
    diagramNode: RenderNode,
    parentPixi: Container,
    viewRootDiagramNodeIdsSet: Set<string>,
  ): NodeGroup | undefined {
    if (!diagramNode.position || diagramNode.visible === false || this._diagramNodeIdToPixiDiagramNodeMap.has(diagramNode.id)) return

    const pixiDiagramNode = this._createDiagramNodeRender(diagramNode)
    parentPixi.addChild(pixiDiagramNode.pixiContainer)
    this._registerDiagramNodePixiContainer(diagramNode, pixiDiagramNode, viewRootDiagramNodeIdsSet)

    const childrenNodesToRender = isDiagramOverviewLeaf(diagramNode) 
      ? getChildSlotDiagramNodes(diagramNode, OVERVIEW_CHILD_SLOT) 
      : getChildSlotDiagramNodes(diagramNode, DEFAULT_CHILD_SLOT)

    for (const childNode of childrenNodesToRender) {
      if (childNode.visible === false) continue
      this._renderDiagramSubtree(childNode, pixiDiagramNode.pixiContainer, viewRootDiagramNodeIdsSet)
    }

    return pixiDiagramNode.pixiContainer
  }

  private _getPixiContainerForRenderParent(parentRender?: RenderNode): Container {
    if (!parentRender) return this._stagingPixiContainer
    return this._diagramNodeIdToPixiDiagramNodeMap.get(parentRender.id)?.pixiContainer ?? this._stagingPixiContainer
  }

  private _renderNodes(): void {
    this._virtualTiles.clear()
    this._oversizedDiagramNodeIdsSet.clear()
    
    const viewRootDiagramNodeIdsSet = this._resolveViewRootDiagramNodeIdsSet()

    this._resolveViewRootDiagramNodes().forEach((root) => {
      this._renderDiagramSubtree(root, this._stagingPixiContainer, viewRootDiagramNodeIdsSet)
    })
  }

  private _registerDiagramNodePixiContainer(
    diagramNode: RenderNode,
    pixiDiagramNode: PixiDiagramNode,
    viewRootDiagramNodeIdsSet: Set<string>,
  ): void {
    let tileKeysSet = this._pixiDiagramNodeToTileKeysSetWeakMap.get(pixiDiagramNode)
    if (!tileKeysSet) {
      tileKeysSet = new Set()
      this._pixiDiagramNodeToTileKeysSetWeakMap.set(pixiDiagramNode, tileKeysSet)
    }
    const result = this._resolveDiagramNodeTileKeys(diagramNode, viewRootDiagramNodeIdsSet)
    if (result.oversized) {
      this._oversizedDiagramNodeIdsSet.add(diagramNode.id)
      return
    }

    for (const tileKey of result.tileKeys) {
      this._ensureTile(tileKey).nodes.add(pixiDiagramNode)
      tileKeysSet.add(tileKey)
    }
  }

  private _renderFramePending = false

  private _pixiRender(): void {
    if (!this.ready || this._suspended) return
    if (this._app.ticker.started) return
    if (this._renderFramePending) return
    this._renderFramePending = true
    requestAnimationFrame(() => {
      this._renderFramePending = false
      if (!this.ready || this._suspended) return
      this._app.render()
    })
  }

  private _updateWorldRender(): void {
    this._worldPixiContainer.scale.set(this._zoomRef.value)
    this._worldPixiContainer.position.set(this._panXRef.value, this._panYRef.value)
    this._dotGrid?.sync(this._panXRef.value, this._panYRef.value, this._zoomRef.value)
  }

  private _updateMountedPixiDiagramNodeBorders(): void {
    for (const nodeId of this._viewportMountedDiagramNodeIdsSetRef.value) {
      const pixiDiagramNode = this._diagramNodeIdToPixiDiagramNodeMap.get(nodeId)
      if (!pixiDiagramNode) continue

      pixiDiagramNode.updateBorder()
    }
  }

  private _ensureDepthRenderLayers(depthLevel: number): void {
    for (let i = this.depthGraphicsLayers.length; i < depthLevel + 1; i++) {
      const connectionGraphicsLayer = new RenderLayer()
      connectionGraphicsLayer.label = `depth-connections-${i}`
      this.depthConnectionGraphicsLayers.push(connectionGraphicsLayer)
      this._mainRenderLayersPixiContainer.addChild(connectionGraphicsLayer)

      const graphicsLayer = new RenderLayer()
      graphicsLayer.label = `depth-graphics-${i}`
      this.depthGraphicsLayers.push(graphicsLayer)
      this._mainRenderLayersPixiContainer.addChild(graphicsLayer)

      const textLayer = new RenderLayer()
      textLayer.label = `depth-text-${i}`
      this.depthTextLayers.push(textLayer)
      this._mainRenderLayersPixiContainer.addChild(textLayer)
    }
  }

  // #endregion

  // #region API: Rendering

  public render(): void {
    this._whenReady(() => {
      this._render()
      this._remountViewportTiles()
      this._pixiRender()
    })
  }

  public static makeTileKey(tileX: number, tileY: number): string {
    return `${tileX},${tileY}`
  }

  public resolveWorldPosTileKey(x: number, y: number): string {
    const tileX = Math.floor(x / this._tileSize)
    const tileY = Math.floor(y / this._tileSize)
    return PixiGraphRenderer.makeTileKey(tileX, tileY)
  }

  public setTileSize(size: number): void {
    this._tileSize = size
    // Clear existing virtual tiles to force regeneration
    this._virtualTiles.forEach((tile) => {
      tile.nodes.forEach((pixiDiagramNode) => destroyPixiTree(pixiDiagramNode.pixiContainer))
      tile.connections.forEach((connection) => destroyPixiTree(connection))
    })
    this._virtualTiles.clear()
    this._oversizedDiagramNodeIdsSet.clear()
    this._mountedTileKeysSet.clear()
    this._lastMountedViewportWorldRect = null; 
  }

  public getTileSize(): number {
    return this._tileSize
  }

  public getTileStats(): { totalTiles: number; visibleTiles: number; hiddenTiles: number } {
    const stats = this.getRenderStats()
    return {
      totalTiles: stats.totalTiles,
      visibleTiles: stats.visibleTiles,
      hiddenTiles: Math.max(0, stats.totalTiles - stats.visibleTiles),
    }
  }

  public getRenderStats(): PixiRenderStats {
    const viewportMountedDiagramNodeIdsSet = this._viewportMountedDiagramNodeIdsSetRef.value
    const vp = this._resolveViewportWorldRect(0)
    let inViewportNodes = 0
    for (const diagramNodeId of viewportMountedDiagramNodeIdsSet) {
      const diagramNode = this.graphData.allNodes.get(diagramNodeId)
      if (!diagramNode) continue
      if (this._isDiagramNodeIntersectsWorldRect(diagramNode, vp)) inViewportNodes++
    }

    let nodesOnLayer = 0
    let nodesStaged = 0
    let textLodCached = 0
    let hitchhikersHidden = 0
    let hitchhikersVisible = 0
    this._diagramNodeIdToPixiDiagramNodeMap.forEach((pixiDiagramNode, diagramNodeId) => {
      const pixiDiagramNodeMounted = viewportMountedDiagramNodeIdsSet.has(diagramNodeId)
      if (pixiDiagramNodeMounted) {
        nodesOnLayer++
      } else {
        nodesStaged++
      }
      if (pixiDiagramNode.pixiContainer.isCachedAsTexture) {
        textLodCached++
      }
      if (!pixiDiagramNodeMounted) {
        return
      }
      if (isWorldVisible(pixiDiagramNode.pixiContainer)) {
        hitchhikersVisible++
      } else {
        hitchhikersHidden++
      }
    })

    const draw = this._worldPixiContainer
      ? collectVisibleDrawStats(this._worldPixiContainer, this._diagramNodeIdToPixiDiagramNodeMap)
      : {
          visibleDisplayObjects: 0,
          visibleText: 0,
          visibleGraphics: 0,
          visibleOther: 0,
          visibleTextTextures: 0,
          visibleNodeGroups: 0,
          visibleCachedNodes: 0,
          visibleUncachedNodes: 0,
        }

    const ticker = this._app?.ticker
    const renderer = this._app?.renderer
    const view = renderer
      ? (renderer as { view?: { antialias?: boolean } }).view
      : undefined
    return {
      ready: Boolean(this._app && this._worldPixiContainer),
      zoom: this._zoomRef.value,
      tileSize: this._tileSize,
      viewportCssW: this._viewportWidthRef.value,
      viewportCssH: this._viewportHeightRef.value,
      viewportWorldW: vp.width,
      viewportWorldH: vp.height,
      totalTiles: this._virtualTiles.size,
      visibleTiles: this._mountedTileKeysSet.size,
      oversizedNodes: this._oversizedDiagramNodeIdsSet.size,
      graphNodes: this.graphData.allNodes.size,
      pixiGroups: this._diagramNodeIdToPixiDiagramNodeMap.size,
      mountedNodes: this._viewportMountedDiagramNodeIdsSetRef.value.size,
      inViewportNodes,
      nodesOnLayer,
      nodesStaged,
      connectionsTotal: this._connectionKeyToConnectionPixiContainerMap.size,
      connectionsOnLayer: this._mainConnectionsPixiContainer?.children.length ?? 0,
      worldDisplayObjects: this._worldPixiContainer ? countDisplayObjects(this._worldPixiContainer) : 0,
      textLodCached,
      tickerStarted: Boolean(ticker?.started),
      fps: ticker?.FPS ?? 0,
      deltaMs: ticker?.deltaMS ?? 0,
      suspended: this._suspended,
      ...draw,
      hitchhikersHidden,
      hitchhikersVisible,
      backbufferW: renderer?.width ?? 0,
      backbufferH: renderer?.height ?? 0,
      resolution: renderer?.resolution ?? 1,
      antialias: view?.antialias ?? true,
    }
  }

  public setShowDebugTiles(debug: boolean): void {
    this._showDebugTiles = debug
    this._renderDebugOverlays()
  }

  public setShowDebugLayoutContainers(debug: boolean): void {
    this._showDebugLayoutContainers = debug
    this._renderDebugOverlays()
  }

  public setShowConnections(show: boolean): void {
    this._showConnections = show
    this._render()
    this._remountViewportTiles()
  }

  public setConnectionOpacity(opacity: number): void {
    this._connectionOpacity = Math.max(0.1, Math.min(1.0, opacity))
    this._render()
    this._remountViewportTiles()
    this._pixiRender()
  }

  public setShowConnectionLabels(show: boolean): void {
    this._connectionLabels = show
    this._render()
    this._remountViewportTiles()
    this._pixiRender()
  }

  public setShowConnectionArrows(show: boolean): void {
    this._connectionArrows = show
    this._render()
    this._remountViewportTiles()
    this._pixiRender()
  }

  /**
   * Debug: override text-LOD cache threshold in CSS px (`null` = auto from resolution).
   * Pin/row glyphs at `fontSize * zoom` ≤ threshold → cacheAsTexture on mounted nodes.
   */
  public setDebugTextLodCacheScreenPx(px: number | null): void {
    setDebugTextLodCacheScreenPx(px)
    this._pixiRender()
  }

  // #endregion

  // #region Internal: Connections

  private _isConnectionBelongsToRenderScope(connection: DiagramConnection): boolean {
    return this._diagramNodeIdToPixiDiagramNodeMap.has(connection.from) || this._diagramNodeIdToPixiDiagramNodeMap.has(connection.to)
  }

  private _getRenderScopeConnections(): DiagramConnection[] {
    return this.graphData.connections.filter((connection) => {
      return this._isConnectionBelongsToRenderScope(connection)
    })
  }

  private _renderConnections(): void {
    if (!this._mainConnectionsPixiContainer || !this._showConnections) return

    for (const diagramConnection of this._getRenderScopeConnections()) {
      this._createConnectionResources(
        diagramConnection,
        getConnectionKey(diagramConnection),
      )
    }
  }

  private _createConnectionResources(
    connection: DiagramConnection,
    connectionKey: string,
  ): ConnectionPixiContainer | undefined {
    const plannedConnection = this._planConnectionRender(connection)
    if (!plannedConnection) return
    
    const nodeElsContainer: NodeElsContainer = {
      graphics: new Set(),
      texts: new Set(),
      connections: new Set(),
    }
    const connectionPaintConfig = this._resolveConnectionPaintConfig(connection)
    
    const connectionPixiContainer = createConnectionPixiContainer(
      nodeElsContainer, 
      connection, 
      plannedConnection, 
      {
        opacity: connectionPaintConfig.opacity,
        stroke: connectionPaintConfig.stroke,
        strokeWidth: connectionPaintConfig.width,
        strokeDash: plannedConnection.dashed ? [10, 6] : undefined,
        showArrow: plannedConnection.showArrow !== false && this._connectionArrows,
        showLabel: this._connectionLabels,
      }
    )
    this._nodePixiContainerToNodeElsContainerWeakMap.set(connectionPixiContainer, nodeElsContainer)

    this._connectionKeyToConnectionPixiContainerMap.set(connectionKey, connectionPixiContainer)
    this._reindexConnectionToTiles(connectionPixiContainer)

    return connectionPixiContainer
  }

  private _isConnectionOfSelectedNodes(connection: DiagramConnection): boolean {
    return (
      this.highlightSelectedNodeConnections &&
      this._selectedNodeIdsSet.size > 0 &&
      (this._selectedNodeIdsSet.has(connection.from) || this._selectedNodeIdsSet.has(connection.to))
    )
  }

  /** Wire color from target input pin type→color; fallback to source output. */
  private _connectionBaseHex(connection: DiagramConnection): string {
    const toNode = this.graphData.allNodes.get(connection.to)
    const fromNode = this.graphData.allNodes.get(connection.from)
    if (toNode && connection.pinName) {
      return resolvePinColor({
        nodeType: toNode.type,
        pinId: connection.pinName,
        side: 'in',
      })
    }
    if (fromNode) {
      return resolvePinColor({
        nodeType: fromNode.type,
        pinId: 'output',
        side: 'out',
      })
    }
    return PIN_COLOR_FALLBACK
  }

  private _resolveConnectionPaintConfig(connection: DiagramConnection): {
    stroke: string
    width: number
    opacity: number
  } {
    const baseHex = this._connectionBaseHex(connection)
    if (this._isConnectionOfSelectedNodes(connection)) {
      const mixed = overlayCssColor(
        baseHex,
        this.selectedNodeConnectionColor,
        this.selectedNodeConnectionOverlayAmount
      )
      return {
        stroke: this.hexToRgba(mixed, this.selectedNodeConnectionOpacity),
        width: this.selectedNodeConnectionWidth,
        opacity: this.selectedNodeConnectionOpacity,
      }
    }
    return {
      stroke: this.hexToRgba(baseHex, this._connectionOpacity),
      width: 2,
      opacity: this._connectionOpacity,
    }
  }

  // #endregion

  /** 
   * @todo Move to utils 
   */
  private hexToRgba(hex: string, alpha: number): string {
    const n = parseInt(hex.replace('#', ''), 16)
    const r = (n >> 16) & 0xff
    const g = (n >> 8) & 0xff
    const b = n & 0xff
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  }

  // #region Internal: Selection

  /**
   * Update node selection state (stroke / outline only — type chrome stays intact).
   */
  private _updateNodeSelection(pixiDiagramNode: PixiDiagramNode, isSelected: boolean): void {
    const diagramNode = this.graphData.allNodes.get(pixiDiagramNode.diagramNodeId)
    if (!diagramNode) return

    pixiDiagramNode.selected = isSelected
    pixiDiagramNode.updateBorder()
  }

  // #endregion Internal: Selection

  // #region API: Selection
  
  /**
   * Get currently selected node IDs
   */
  public getSelectedNodeIds(): string[] {
    return [...this._selectedNodeIdsSet]
  }

  /**
   * Get primary selected node ID
   */
  public getPrimarySelectedNodeId(): string | null {
    return this._primarySelectedNodeId
  }

  public isNodeSelected(diagramNodeId: string): boolean {
    return this._selectedNodeIdsSet.has(diagramNodeId)
  }

  /**
   * Set selected nodes
   */
  public setSelectedNodes(diagramNodeIds: string[], primaryNodeId: string | null, silent = false): void {
    const nextIds = new Set(diagramNodeIds)
    const affectedDiagramNodeIdsSet = new Set<string>()

    for (const id of this._selectedNodeIdsSet) {
      if (!nextIds.has(id)) {
        const prev = this._diagramNodeIdToPixiDiagramNodeMap.get(id)
        if (prev) {
          this._updateNodeSelection(prev, false)
          affectedDiagramNodeIdsSet.add(id)
        }
      }
    }

    for (const id of nextIds) {
      if (!this._selectedNodeIdsSet.has(id)) {
        const next = this._diagramNodeIdToPixiDiagramNodeMap.get(id)
        if (next) {
          this._updateNodeSelection(next, true)
          affectedDiagramNodeIdsSet.add(id)
        }
      }
    }

    this._selectedNodeIdsSet = nextIds
    this._primarySelectedNodeId = primaryNodeId

    this._batchUpdateNodeConnections(Array.from(affectedDiagramNodeIdsSet))

    // this._updateConnectionsHighlighting()

    if (!silent && this._onNodeSelect) {
      this._onNodeSelect([...nextIds], primaryNodeId)
    }

    this._pixiRender()
  }

  /**
   * Set selected node (single selection)
   */
  public setSelectedNode(nodeId: string | null, silent = false): void {
    this.setSelectedNodes(nodeId ? [nodeId] : [], nodeId, silent)
  }

  // #endregion

  // #region Internal: Simulation

  private _simOverlayLookupKeys(diagramNode?: RenderNode): string[] {
    return [
      diagramNode?.data?.originalNodeId as string | undefined,
      diagramNode?.id,
      diagramNode?.metadata?.handleId as string | undefined,
      diagramNode?.metadata?.originalNodeId as string | undefined,
      // After promote, diagram root id == HandleId; metadata kept for legacy keys / shell.
      diagramNode?.metadata?.stateMachineNodeId as string | undefined,
      diagramNode?.metadata?.ownerStateMachineId as string | undefined,
    ].filter((k): k is string => Boolean(k))
  }

  private _ensureSimOverlayKeyIndex(): Map<string, string[]> {
    if (this.simOverlayKeyIndex) return this.simOverlayKeyIndex
    const index = new Map<string, string[]>()
    const add = (key: string | undefined, nodeId: string) => {
      if (!key) return
      let list = index.get(key)
      if (!list) {
        list = []
        index.set(key, list)
      }
      if (!list.includes(nodeId)) list.push(nodeId)
    }
    for (const [diagramNodeId, diagramNode] of this.graphData.allNodes) {
      for (const key of this._simOverlayLookupKeys(diagramNode)) add(key, diagramNodeId)
    }
    this.simOverlayKeyIndex = index
    return index
  }

  private _lookupSimNodeState(
    animgraphHandleIdToSimNodeState?: SimSnapshot['nodes'],
    diagramNode?: RenderNode,
  ): SimNodeState | undefined {
    if (!animgraphHandleIdToSimNodeState) return

    for (const key of this._simOverlayLookupKeys(diagramNode)) {
      const st = animgraphHandleIdToSimNodeState[key]
      if (st) return st
    }
    return
  }

  private _applySimOverlayFull(
    animgraphHandleIdToSimNodeState?: SimSnapshot['nodes']
  ): void {
    if (!animgraphHandleIdToSimNodeState) {
      for (const [_diagramNodeId, pixiDiagramNode] of this._diagramNodeIdToPixiDiagramNodeMap) {
        pixiDiagramNode.simNodeState = undefined
        pixiDiagramNode.update()
      }
      return
    }

    for (const [diagramNodeId, pixiDiagramNode] of this._diagramNodeIdToPixiDiagramNodeMap) {
      const diagramNode = this.graphData.allNodes.get(diagramNodeId)
      if (!diagramNode) continue

      pixiDiagramNode.simNodeState = this._lookupSimNodeState(animgraphHandleIdToSimNodeState, diagramNode)
      pixiDiagramNode.update()
    }
  }

  private _applySimOverlayDelta(
    animgraphHandleIdToSimNodeState: SimSnapshot['nodes'],
    delta: NonNullable<SimSnapshot['nodeDelta']>
  ): void {
    this._applySimOverlayForSimKeys(
      animgraphHandleIdToSimNodeState, 
      Object.keys(delta.changes), 
      delta.removed
    )
  }

  private _applySimOverlayForSimKeys(
    animgraphHandleIdToSimNodeState: SimSnapshot['nodes'],
    ...simKeysList: readonly string[][]
  ): void {
    const index = this._ensureSimOverlayKeyIndex()
    const touchedDiagramNodeIds = new Set<string>()

    for (const simKeys of simKeysList) {
      for (const simKey of simKeys) {
        const diagramNodeIds = index.get(simKey)
        if (!diagramNodeIds) continue

        for (const diagramNodeId of diagramNodeIds) {
          if (touchedDiagramNodeIds.has(diagramNodeId)) continue
          
          const pixiDiagramNode = this._diagramNodeIdToPixiDiagramNodeMap.get(diagramNodeId)
          if (!pixiDiagramNode) continue

          touchedDiagramNodeIds.add(diagramNodeId)
          
          const diagramNode = this.graphData.allNodes.get(diagramNodeId)
          pixiDiagramNode.simNodeState = this._lookupSimNodeState(animgraphHandleIdToSimNodeState, diagramNode)
          pixiDiagramNode.updateSim()
        }
      }
    }
  }

  private _updateMountedPixiDiagramNodeSims() {
    for (const diagramNodeId of this._viewportMountedDiagramNodeIdsSetRef.value) {
      const pixiDiagramNode = this._diagramNodeIdToPixiDiagramNodeMap.get(diagramNodeId)
      if (!pixiDiagramNode) continue

      pixiDiagramNode.updateSim()
    }
  }

  // #endregion

  // #region API: Simulation

  /**
   * Offline sim overlay: colored inset border on active nodes; inactive chrome unchanged.
   * Keys are animgraph HandleIds; also matched against render node id / originalNodeId.
   * When `delta` is provided and a previous overlay exists, only changed / removed
   * keys are painted; otherwise a full pass over mounted nodes runs.
   */
  public applySimOverlay(simSnapshot?: SimSnapshot): void {
    const prevSimSnapshot = this._simOverlayData
    this._simOverlayData = simSnapshot
    
    // Suspended / not ready: keep lastSimOverlay for resume / tile remount.
    if (!this.ready || this._suspended) return

    if (!!prevSimSnapshot && !!simSnapshot && !!simSnapshot.nodeDelta) {
      if (Object.keys(simSnapshot.nodeDelta.changes).length === 0 && simSnapshot.nodeDelta.removed.length === 0) return
      this._applySimOverlayDelta(simSnapshot.nodes, simSnapshot.nodeDelta)
      return
    }

    this._applySimOverlayFull(simSnapshot?.nodes)
  }

  // #endregion API: Simulation

  // #region Internal: Viewport

  private _commitViewportCamera() {
    this._viewportCommitIndexRef.value++
  }

  private _updateViewport(): void {
    if (!this.ready || this._suspended) return

    const viewportWorldRect = this._resolveViewportWorldRect(0)

    const tileThreshold = this._tileSize * 0.1
    const tileDirty =
      !this._lastMountedViewportWorldRect ||
      Math.abs(viewportWorldRect.x - this._lastMountedViewportWorldRect.x) >= tileThreshold ||
      Math.abs(viewportWorldRect.y - this._lastMountedViewportWorldRect.y) >= tileThreshold ||
      Math.abs(viewportWorldRect.width - this._lastMountedViewportWorldRect.width) >= tileThreshold ||
      Math.abs(viewportWorldRect.height - this._lastMountedViewportWorldRect.height) >= tileThreshold
    if (tileDirty) {
      this._remountViewportTiles()
    }
  }

  private _applyFitViewToScope(padding = 20): void {
    const viewRootDiagramNodesRect = this.resolveViewRenderedScopeWorldRect()
    if (!viewRootDiagramNodesRect) return

    this._applyPresentWorldRect(viewRootDiagramNodesRect, {
      align: 'center',
      fit: 'contain',
      padding,
      minZoom: 0.05,
      maxZoom: 3,
    })
  }

  /** @todo check impl */
  private _applyPresentWorldRect(
    rect: { x: number; y: number; width: number; height: number },
    options: PresentWorldRectOptions
  ): void {
    if (rect.width < 1 || rect.height < 1) return

    const padding = options.padding ?? 20
    const availW = Math.max(1, this._viewportWidthRef.value - padding * 2)
    const availH = Math.max(1, this._viewportHeightRef.value - padding * 2)
    const fit = options.fit ?? 'contain'
    const align = options.align ?? 'center'
    const minZoom = options.minZoom ?? 0.05
    const maxZoom = options.maxZoom ?? 3

    let zoom = options.zoom ?? this._zoomRef.value
    if (options.zoom == null && fit === 'width') {
      zoom = availW / rect.width
    } else if (options.zoom == null && fit === 'contain') {
      zoom = Math.min(availW / rect.width, availH / rect.height)
    }
    zoom = Math.max(minZoom, Math.min(maxZoom, zoom))

    if (align === 'top-start') {
      this._panXRef.value = padding - rect.x * zoom
      this._panYRef.value = padding - rect.y * zoom
    } else if (align === 'top-end') {
      const trailing = options.rightInset ?? padding
      this._panXRef.value = this._viewportWidthRef.value - trailing - (rect.x + rect.width) * zoom
      this._panYRef.value = padding - rect.y * zoom
    } else {
      this._panXRef.value = this._viewportWidthRef.value / 2 - (rect.x + rect.width / 2) * zoom
      this._panYRef.value = this._viewportHeightRef.value / 2 - (rect.y + rect.height / 2) * zoom
    }
    this._zoomRef.value = zoom

    this._lastMountedViewportWorldRect = null
    this._commitViewportCamera()
    this._pixiRender()
  }

  // #endregion Internal: Viewport

  // #region API: Viewport

  /**
   * Get viewport center position in world coordinates
   */
  public getViewportCenter(): { x: number, y: number } {
    if (!this.ready) {
      return { x: 0, y: 0 }
    }

    const stageWidth = this._viewportWidthRef.value
    const stageHeight = this._viewportHeightRef.value
    
    // Convert screen coordinates to world coordinates
    const worldX = (stageWidth / 2 - this._panXRef.value) / this._zoomRef.value
    const worldY = (stageHeight / 2 - this._panYRef.value) / this._zoomRef.value
    
    return { x: worldX, y: worldY }
  }

  /**
   * Get viewport bounds in world coordinates
   */
  public getViewportBounds(): { left: number, top: number, right: number, bottom: number } | null {
    if (!this.ready) {
      return null
    }

    const scale = this._zoomRef.value
    
    // Calculate viewport bounds in world coordinates
    const viewportLeft = -this._panXRef.value / scale
    const viewportTop = -this._panYRef.value / scale
    const viewportRight = viewportLeft + this._viewportWidthRef.value / scale
    const viewportBottom = viewportTop + this._viewportHeightRef.value / scale
    
    return {
      left: viewportLeft,
      top: viewportTop,
      right: viewportRight,
      bottom: viewportBottom
    }
  }

  /**
   * Handle zoom
   */
  public setZoom(zoom: number, cursorX?: number, cursorY?: number): void {
    if (!this.ready) return

    const newZoom = Math.max(0.1, Math.min(5.0, zoom))

    if (cursorX !== undefined && cursorY !== undefined && newZoom !== this._zoomRef.value) {
      this.zoomToPosition(newZoom, cursorX, cursorY)
    } else {
      this._zoomRef.value = newZoom
      this._commitViewportCamera()

      this._pixiRender()
    }
  }

  /**
   * Zoom to specific position
   */
  public zoomToPosition(zoom: number, cursorX: number, cursorY: number): void {
    if (!this.ready) return

    const newZoom = Math.max(0.1, Math.min(5.0, zoom))

    if (newZoom !== this._zoomRef.value) {
      const mousePointTo = {
        x: (cursorX - this._panXRef.value) / this._zoomRef.value,
        y: (cursorY - this._panYRef.value) / this._zoomRef.value,
      }

      this._zoomRef.value = newZoom

      const newPos = {
        x: cursorX - mousePointTo.x * newZoom,
        y: cursorY - mousePointTo.y * newZoom,
      }

      this._panXRef.value = newPos.x
      this._panYRef.value = newPos.y
      
      this._commitViewportCamera()

      this._pixiRender()
    }
  }

  /**
   * Handle pan
   */
  public setPan(x: number, y: number): void {
    if (!this.ready) return

    this._panXRef.value = x
    this._panYRef.value = y
    
    this._commitViewportCamera()

    this._pixiRender()
  }


  public centerOnAllNodes(): void {
    if (!this.ready) return

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

    const stageCenterX = this._viewportWidthRef.value / 2
    const stageCenterY = this._viewportHeightRef.value / 2

    this.setPan(stageCenterX - centerX * this._zoomRef.value, stageCenterY - centerY * this._zoomRef.value)
  }

  public panToDiagramNodeWithId(nodeId: string): boolean {
    if (!this.ready) return false

    const diagramNode = this.graphData.allNodes.get(nodeId)
    if (!diagramNode) return false

    const diagramNodeWorldPos = this._resolveDiagramNodeRendererWorldPosition(diagramNode)
    const diagramNodeSize = diagramNode.size

    const diagramNodeCenterWorldPosX = diagramNodeWorldPos.x + diagramNodeSize.width / 2
    const diagramNodeCenterWorldPosY = diagramNodeWorldPos.y + diagramNodeSize.height / 2

    const viewportCenterX = this._viewportWidthRef.value / 2
    const viewportCenterY = this._viewportHeightRef.value / 2

    this.setPan(
      viewportCenterX - diagramNodeCenterWorldPosX * this._zoomRef.value, 
      viewportCenterY - diagramNodeCenterWorldPosY * this._zoomRef.value
    )
    return true
  }

  /**
   * Pan to specific node with zoom
   */
  public panToDiagramNodeWithIdAndZoom(nodeId: string, zoom: number = 1.5): boolean {
    this.setZoom(zoom)
    return this.panToDiagramNodeWithId(nodeId)
  }

  /**
   * Pan to connected node
   */
  public panToConnectedNode(connection: DiagramConnection, isIncoming: boolean): boolean {
    const targetNodeId = isIncoming ? connection.from : connection.to
    return this.panToDiagramNodeWithId(targetNodeId)
  }

  /**
   * Reset view to default position and zoom
   */
  public resetView(): void {
    if (!this.ready) return

    this._zoomRef.value = 1.0; 
    this._panXRef.value = 0; 
    this._panYRef.value = 0; 
    this._commitViewportCamera()
    this._pixiRender()
  }

  /** Zoom/pan so the lens subtree fills the viewport. */
  public fitViewToScope(padding = 20): boolean {
    if (!this.ready) return false
    this._applyFitViewToScope(padding)
    return true
  }

  /**
   * Frame a world-space rect in the viewport (lens stage / layout world coords).
   * Used by view present-ops (e.g. focus one State-links column).
   */
  public presentWorldRect(
    rect: { x: number; y: number; width: number; height: number },
    options: PresentWorldRectOptions = {}
  ): boolean {
    if (!this.ready) return false
    this._applyPresentWorldRect(rect, options)
    return true
  }

  public resolveDiagramNodeWithIdWorldRect(
    nodeId: string
  ): { x: number; y: number; width: number; height: number } | undefined {
    const diagramNode = this.graphData.allNodes.get(nodeId)
    if (!diagramNode) return

    const diagramWorldNodePos = this._resolveDiagramNodeRendererWorldPosition(diagramNode)
    if (!diagramWorldNodePos) return

    return { 
      x: diagramWorldNodePos.x, 
      y: diagramWorldNodePos.y, 
      width: diagramNode.size.width, 
      height: diagramNode.size.height 
    }
  }

  public resolveViewRenderedScopeWorldRect(): { x: number; y: number; width: number; height: number } | undefined {
    if (!this.ready) return

    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const viewRootDiagramNode of this._resolveViewRootDiagramNodes()) {
      const pixiDiagramNode = this._diagramNodeIdToPixiDiagramNodeMap.get(viewRootDiagramNode.id)
      if (!pixiDiagramNode) continue

      const viewRootDiagramNodePixiContainerBounds = pixiDiagramNode.pixiContainer.getBounds()
      minX = Math.min(minX, viewRootDiagramNodePixiContainerBounds.x)
      minY = Math.min(minY, viewRootDiagramNodePixiContainerBounds.y)
      maxX = Math.max(maxX, viewRootDiagramNodePixiContainerBounds.x + viewRootDiagramNodePixiContainerBounds.width)
      maxY = Math.max(maxY, viewRootDiagramNodePixiContainerBounds.y + viewRootDiagramNodePixiContainerBounds.height)
    }

    if (Number.isFinite(minX) && maxX > minX && maxY > minY) {
      return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
    }

    return undefined
  }

  public getViewportState(): { zoom: number, panX: number, panY: number } {
    return {
      zoom: this._zoomRef.value,
      panX: this._panXRef.value,
      panY: this._panYRef.value
    }
  }

  public setViewportState(state: { zoom: number, panX: number, panY: number }): void {
    if (!this.ready) return

    this._zoomRef.value = Math.max(0.1, Math.min(5.0, state.zoom))
    this._panXRef.value = state.panX
    this._panYRef.value = state.panY

    this._commitViewportCamera()
    this._pixiRender()
  }

  // #endregion

  /** Convert browser client coordinates to graph world space. */
  public clientPosToWorldPos(clientX: number, clientY: number): { x: number; y: number } | null {
    const pointer = this._clientToCanvasPosition(clientX, clientY)
    if (!pointer) return null
    return this._canvasToWorldPosition(pointer.x, pointer.y)
  }

  public setCanvasCursor(cursor: string): void {
    const canvas = this._app?.canvas
    if (canvas) canvas.style.cursor = cursor
  }

  /**
   * Get node at screen coordinates
   */
  public getNodeAtScreenPosition(screenX: number, screenY: number): string | undefined {
    const worldPos = this.clientPosToWorldPos(screenX, screenY)
    if (!worldPos) return

    return this._resolveDiagramNodeIdFromWorldPos(worldPos)
  }

  // #region Internal: Main

  private _whenReady(fn: () => void): void {
    this._initPromise.then(() => {
      if (this.ready) fn()
    })
    .catch((error) => {
      console.error('Error initializing PixiGraphRenderer', error)
    })
  }

  private _destroyedGuard(): void {
    if (this._destroyed) {
      throw new Error('PixiGraphRenderer is destroyed', { cause: { code: 'DESTROYED' }})
    }
  }

  private async _init(): Promise<void> {
    try {
      await this._setupPixi()
      this._destroyedGuard()

      this._initialized = true

      this._render()

      if (this.initialPresent) {
        this._applyPresentWorldRect(this.initialPresent.rect, this.initialPresent.options ?? {})
      } else if (this.initialPresentNodeId) {
        const rect = this.resolveDiagramNodeWithIdWorldRect(this.initialPresentNodeId)
        if (rect) this._applyPresentWorldRect(rect, this.initialPresentOptions ?? {})
      } else if (!this.skipInitialFit) {
        this._applyFitViewToScope()
      }

      // if (this._simOverlayData !== undefined) {
      //   this.applySimOverlay(this._simOverlayData)
      // }

      this._setupEventHandlers()
      this._setupResizeObserver()

      this._viewportStateWatcherSub = watcher(
        [this._viewportWidthRef, this._viewportHeightRef, this._viewportCommitIndexRef],
        () => this._updateViewport(),
        true
      )

      this._updateMountedPixiDiagramNodeBordersEffectSub = watcher(
        [this._zoomRef, this._viewportMountedDiagramNodeIdsSetRef],
        () => this._updateMountedPixiDiagramNodeBorders()
      )

      this._updateMountedPixiDiagramNodeSimsEffectSub = watcher(
        [this._zoomRef],
        () => this._updateMountedPixiDiagramNodeSims()
      )

      this._updateWorldRenderEffectSub = watcher(
        [this._zoomRef, this._panXRef, this._panYRef],
        () => this._updateWorldRender(),
        true
      )

      this._updateDebugOverlayRenderEffectSub = watcher(
        [this._viewportMountedDiagramNodeIdsSetRef],
        () => {
          if (this._showDebugTiles || this._showDebugLayoutContainers) {
            this._renderDebugOverlays()
          }
        },
        true
      )

      this._commitViewportCamera()
      this._app.render()
    } catch (error) {
      console.error('Failed to initialize PixiGraphRenderer:', error)
    }
  }

  private async _waitForFonts(): Promise<FontFaceSet | undefined> {
    if (typeof document !== 'undefined' && document.fonts?.ready) {
      return document.fonts.ready
    }
    return Promise.resolve(undefined)
  }

  private async _setupPixi(): Promise<void> {
    this._viewportWidthRef.value = this.container.clientWidth || 800
    this._viewportHeightRef.value = this.container.clientHeight || 800

    await this._waitForFonts()
    this._destroyedGuard();

    /** @todo remove when debugging is done */
    (globalThis as any).__PIXI_APP__ = this._app;
    
    await this._app.init({
      width: this._viewportWidthRef.value,
      height: this._viewportHeightRef.value,
      background: STAGE_BACKGROUND_COLOR_HEX,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
      preference: 'webgl',
    })
    this._destroyedGuard()

    this._app.ticker.maxFPS = 59.99

    await ensureDiagramBitmapFont()
    this._destroyedGuard()

    PixiDiagramNode.ensureStaticResources()

    this._app.canvas.style.display = 'block'
    // While WebGL reallocates on resize the bitmap is empty; CSS fill hides the blink.
    this._app.canvas.style.backgroundColor = STAGE_BACKGROUND_COLOR_HEX
    this.container.appendChild(this._app.canvas)

    this._app.stage.eventMode = 'static'
    this._app.stage.hitArea = new Rectangle(0, 0, this._viewportWidthRef.value, this._viewportHeightRef.value)

    this._dotGrid = createPixiDotGrid(() => this._pixiRender())
    this._dotGrid.resize(this._viewportWidthRef.value, this._viewportHeightRef.value)
    this._app.stage.addChild(this._dotGrid.root)

    this._worldPixiContainer.eventMode = 'passive'
    this._app.stage.addChild(this._worldPixiContainer)

    this._stagingPixiContainer.label = 'staging-pixi-container'
    this._stagingPixiContainer.eventMode = 'none'
    this._stagingPixiContainer.visible = false
    this._worldPixiContainer.addChild(this._stagingPixiContainer)

    this._mainPixiContainer.label = 'main-pixi-container'
    this._mainPixiContainer.eventMode = 'passive'
    this._worldPixiContainer.addChild(this._mainPixiContainer)

    this._mainNodesPixiContainer.label = 'main-nodes-pixi-container'
    this._mainNodesPixiContainer.eventMode = 'passive'
    this._mainPixiContainer.addChild(this._mainNodesPixiContainer)

    this._mainConnectionsPixiContainer.label = 'main-connections-pixi-container'
    this._mainConnectionsPixiContainer.eventMode = 'passive'
    this._mainConnectionsPixiContainer.interactiveChildren = true
    this._mainPixiContainer.addChild(this._mainConnectionsPixiContainer)

    this._mainAuxPixiContainer.label = 'main-aux-pixi-container'
    this._mainAuxPixiContainer.eventMode = 'passive'
    this._mainPixiContainer.addChild(this._mainAuxPixiContainer)

    this._mainRenderLayersPixiContainer.label = 'main-render-layers-pixi-container'
    this._mainRenderLayersPixiContainer.eventMode = 'passive'
    this._mainPixiContainer.addChild(this._mainRenderLayersPixiContainer)

    this._mainAuxRenderLayersPixiContainer.label = 'main-aux-render-layers-pixi-container'
    this._mainAuxRenderLayersPixiContainer.eventMode = 'passive'
    this._mainPixiContainer.addChild(this._mainAuxRenderLayersPixiContainer)

    this._mainAuxRenderLayersPixiContainer.addChild(this._mainAuxGraphicsLayer)
    this._mainAuxRenderLayersPixiContainer.addChild(this._mainAuxTextLayer)
    
    this._debugPixiContainer = new Container()
    this._debugPixiContainer.label = 'debug-pixi-container'
    this._debugPixiContainer.eventMode = 'none'
    this._worldPixiContainer.addChild(this._debugPixiContainer)
    
    this._debugContentPixiContainer = new Container()
    this._debugContentPixiContainer.label = 'debug-content-pixi-container'
    this._debugContentPixiContainer.eventMode = 'none'
    this._debugPixiContainer.addChild(this._debugContentPixiContainer)
    
    this._debugGraphicsLayer = new RenderLayer()
    this._debugPixiContainer.addChild(this._debugGraphicsLayer)

    this._debugTextLayer = new RenderLayer()
    this._debugPixiContainer.addChild(this._debugTextLayer)
  }

  // #endregion

  // #region API: Main

  public get ready(): boolean {
    return this._initialized && !this._destroyed
  }

  public destroy(): void {
    this._destroyed = true

    this._updateMountedPixiDiagramNodeBordersEffectSub?.remove()
    this._updateMountedPixiDiagramNodeBordersEffectSub = undefined
    this._updateMountedPixiDiagramNodeSimsEffectSub?.remove()
    this._updateMountedPixiDiagramNodeSimsEffectSub = undefined
    this._updateDebugOverlayRenderEffectSub?.remove()
    this._updateDebugOverlayRenderEffectSub = undefined
    this._updateWorldRenderEffectSub?.remove()
    this._updateWorldRenderEffectSub = undefined
    this._viewportStateWatcherSub?.remove()
    this._viewportStateWatcherSub = undefined

    this._resizeObserver?.disconnect()
    this._resizeObserver = null
    this._dotGrid?.destroy()
    this._dotGrid = null

    this._worldPixiContainer.destroy({ children: true })
    if (this._app) {
      // removeView only — do not pass `true` (that releases global TexturePool).
      this._app.destroy({ removeView: true }, { children: true })
    }
    
    this._diagramNodeIdToPixiDiagramNodeMap.clear()
    this._connectionKeyToConnectionPixiContainerMap.clear()
    this._virtualTiles.clear()
    this._mountedTileKeysSet.clear()
  }

  public setInteractionGate(gate: () => boolean): void {
    this.interactionGate = gate
  }

  public setAllowPinDrag(allow: boolean): void {
    this.allowPinDrag = allow
    if (!allow) this._endPinDrag()
  }

  public isSuspended(): boolean {
    return this._suspended
  }

  public setSuspended(suspended: boolean): void {
    this._whenReady(() => {
      if (!this.ready) return

      if (suspended) {
        this._suspended = true
        this._app.ticker.stop()
        this._app.canvas.style.pointerEvents = 'none'
        return
      }

      this._suspended = false
      this._app.ticker.start()
      this._app.canvas.style.pointerEvents = ''

      this._render()
      this._remountViewportTiles()
      this._pixiRender()
    })
  }

  public getScopeRootId(): string | undefined {
    return this._scopeRootId
  }

  // #endregion

  // #region Internal: Interaction

  private _flushInteractiveTileUpdates(): void {
    if (this._interactiveDirtyNodeIds.size === 0) return

    const ids = [...this._interactiveDirtyNodeIds]
    this._interactiveDirtyNodeIds.clear()
    this._reindexDiagramNodesIntoTiles(ids)
    this._batchUpdateNodeConnections(ids)
    this._remountViewportTiles()
    this._pixiRender()
  }

  // #endregion

  // #region API: Interaction

  /**
   * Begin an interactive edit transaction (e.g. continuous keyboard/drag move).
   * While open, updateNodes skips tile reindex/visibility; call endInteractiveEdit to flush.
   */
  public beginInteractiveEdit(): void {
    this._interactiveEditDepth++
  }

  /**
   * End interactive edit; when depth reaches 0, flush deferred tile updates.
   */
  public endInteractiveEdit(): void {
    if (this._interactiveEditDepth <= 0) return
    this._interactiveEditDepth--
    if (this._interactiveEditDepth > 0) return
    this._flushInteractiveTileUpdates()
  }

  /** Drop interactive edit without flushing (e.g. cancel + full restore update). */
  public cancelInteractiveEdit(): void {
    this._interactiveEditDepth = 0
    this._interactiveDirtyNodeIds.clear()
  }

  public isInteractiveEdit(): boolean {
    return this._interactiveEditDepth > 0
  }

  public isPinDragging(): boolean {
    return !!this._pinDrag
  }

  public abortPinDrag(): void {
    this._endPinDrag()
  }

  // #endregion

  // #region Internal: Nodes

  /**
   * Efficiently update connections for multiple moved nodes
   */
  private _batchUpdateNodeConnections(affectedDiagramNodeIds: string[]): void {
    if (
      !this._mainConnectionsPixiContainer 
      || !affectedDiagramNodeIds.length
    ) return

    const affectedDiagramNodeIdsSet = new Set(affectedDiagramNodeIds)

    this._connectionKeyToConnectionPixiContainerMap.forEach((connectionPixiContainer) => {
      const connection = connectionPixiContainer.connection
      if (affectedDiagramNodeIdsSet.has(connection.from) 
        || affectedDiagramNodeIdsSet.has(connection.to)
      ) {
        this._updateConnectionResources(connectionPixiContainer)
      }
    })
  }

  // #endregion

  // #region API: Nodes

  public addNode(diagramNode: RenderNode): void {
    if (!this.ready) return

    if (!this.isDiagramNodeBelongToThisView(diagramNode)) return

    if (this._diagramNodeIdToPixiDiagramNodeMap.has(diagramNode.id)) return

    const diagramNodePixiContainer = this._renderDiagramSubtree(
      diagramNode,
      this._getPixiContainerForRenderParent(diagramNode.parent),
      this._resolveViewRootDiagramNodeIdsSet(),
    )
    if (!diagramNodePixiContainer) return

    /** @todo  */
    // Update connections
    this._batchUpdateNodeConnections([diagramNode.id])

    if (this._suspended) return

    this._remountViewportTiles()
    this._pixiRender()
  }

  public removeNode(nodeId: string): void {
    const pixiDiagramNode = this._diagramNodeIdToPixiDiagramNodeMap.get(nodeId)
    if (!pixiDiagramNode) return

    const renderNode = this.graphData?.allNodes.get(nodeId)
    if (renderNode) {
      walkSubtree(renderNode, (n) => {
        if (n.id === nodeId) return
        this._diagramNodeIdToPixiDiagramNodeMap.delete(n.id)
        this._oversizedDiagramNodeIdsSet.delete(n.id)
      })
    }

    const nodeTiles = this._pixiDiagramNodeToTileKeysSetWeakMap.get(pixiDiagramNode)
    if (nodeTiles) {
      nodeTiles.forEach((tileKey) => {
        this._virtualTiles.get(tileKey)?.nodes.delete(pixiDiagramNode)
      })
      this._pixiDiagramNodeToTileKeysSetWeakMap.delete(pixiDiagramNode)
    }

    destroyPixiTree(pixiDiagramNode.pixiContainer)
    this._diagramNodeIdToPixiDiagramNodeMap.delete(nodeId)
    this._oversizedDiagramNodeIdsSet.delete(nodeId)

    if (this._selectedNodeIdsSet.has(nodeId)) {
      const nextIds = [...this._selectedNodeIdsSet].filter((id) => id !== nodeId)
      const primaryId =
        this._primarySelectedNodeId === nodeId ? nextIds[nextIds.length - 1] ?? null : this._primarySelectedNodeId
      this.setSelectedNodes(nextIds, primaryId, true)
    }

    if (this._suspended) return

    this._remountViewportTiles()
    this._pixiRender()
  }

  /**
   * Sync nodes whose diagram data already changed.
   * Infers position/size diffs vs PixiDiagramNode; optional contentChangedIds forces chrome rebuild
   * when size stayed the same (rows/pins/description).
   * Suspended: no-op (parents resync on resume). Interactive edit: size → preview, tiles deferred.
   */
  public updateNodes(
    nodeIds: string[],
    options?: {
      contentChangedIds?: ReadonlySet<string>
    }
  ): void {
    if (!this.ready || this._suspended) return

    const contentChangedIds = options?.contentChangedIds
    const movedDiagramNodeIds: string[] = []
    const chromeDirtyIds: string[] = []

    for (const nodeId of nodeIds) {
      const diagramNode = this.graphData.allNodes.get(nodeId)
      if (!diagramNode) continue

      const pixiDiagramNode = this._diagramNodeIdToPixiDiagramNodeMap.get(nodeId)
      if (!pixiDiagramNode) continue

      const stored = this.getDiagramNodeSize(diagramNode)
      const posChanged = pixiDiagramNode.x !== diagramNode.position.x
        || pixiDiagramNode.y !== diagramNode.position.y
      const sizeChanged = pixiDiagramNode.width !== stored.width
        || pixiDiagramNode.height !== stored.height
      const contentChanged = contentChangedIds?.has(nodeId) ?? false

      if (posChanged) {
        pixiDiagramNode.x = diagramNode.position.x
        pixiDiagramNode.y = diagramNode.position.y
        movedDiagramNodeIds.push(nodeId)
      }

      if (sizeChanged || contentChanged) {
        chromeDirtyIds.push(nodeId)
        pixiDiagramNode.width = stored.width
        pixiDiagramNode.height = stored.height

        if (contentChanged) {
          pixiDiagramNode.bodyModel = presentNodeBody(diagramNode, this.graphData)
          pixiDiagramNode.nodePinsDescs = buildNodePins(diagramNode, diagramNode.size, this.graphData)
        }
      }
      
      if (posChanged || sizeChanged || contentChanged) {
        pixiDiagramNode.update()
      }
    }

    const affectedDiagramNodeIdsSet = new Set<string>(
      movedDiagramNodeIds.length > 0
        ? expandNodeIdsWithDescendants(movedDiagramNodeIds, this.graphData.allNodes)
        : []
    )
    for (const id of chromeDirtyIds) affectedDiagramNodeIdsSet.add(id)
    const affectedDiagramNodeIds = [...affectedDiagramNodeIdsSet]

    this._batchUpdateNodeConnections(affectedDiagramNodeIds)

    if (this._interactiveEditDepth > 0) {
      for (const id of affectedDiagramNodeIds) {
        this._interactiveDirtyNodeIds.add(id)
      }
    } else {
      this._reindexDiagramNodesIntoTiles(affectedDiagramNodeIds)
      this._remountViewportTiles()
    }

    this._pixiRender()
  }

  // #endregion

  // #region Internal: Connections

  private _isConnectionGeometryChanged(
    connectionPixiContainer: ConnectionPixiContainer, 
    plannedConnection: PlannedConnection
  ): boolean {
    return connectionPixiContainer.lineFrom !== plannedConnection.from 
      || connectionPixiContainer.lineTo !== plannedConnection.to
  }
  
  private _updateConnectionResourcesToPlanned(
    connectionPixiContainer: ConnectionPixiContainer,
    diagramConnection: DiagramConnection,
    plannedConnection?: PlannedConnection,
  ): void {
    if (!plannedConnection) {
      connectionPixiContainer.visible = false
      return
    }

    const connectionGeometryChanged = this._isConnectionGeometryChanged(connectionPixiContainer, plannedConnection)
    const connectionPaintConfig = this._resolveConnectionPaintConfig(diagramConnection)

    connectionPixiContainer.visible = true
    connectionPixiContainer.lineFrom = { ...plannedConnection.from }
    connectionPixiContainer.lineTo = { ...plannedConnection.to }

    redrawConnectionPixiContainerLine(
      connectionPixiContainer,
      connectionPaintConfig.stroke,
    )

    // Reindex tiles if connection geometry changed and interactive edit is not active.
    if (connectionGeometryChanged && this._interactiveEditDepth === 0) {
      this._reindexConnectionToTiles(connectionPixiContainer)
    }
  }

  private _updateConnectionResources(connectionPixiContainer: ConnectionPixiContainer): void {
    const planned = this._planConnectionRender(connectionPixiContainer.connection)
    this._updateConnectionResourcesToPlanned(connectionPixiContainer, connectionPixiContainer.connection, planned)
  }

  private _destroyConnectionResources(connectionPixiContainer: ConnectionPixiContainer): void {
    this._removeConnectionFromTiles(connectionPixiContainer)
    destroyPixiTree(connectionPixiContainer)
    this._connectionKeyToConnectionPixiContainerMap.delete(connectionPixiContainer.connectionKey)
  }

  private _updateAllConnectionResources(): void {
    this._connectionKeyToConnectionPixiContainerMap.forEach((connectionPixiContainer) => {
      this._updateConnectionResources(connectionPixiContainer)
    })
  }

  // #endregion

  // #region API: Connections

  /**
   * Add a new connection to the graph
   */
  public addConnection(connection: DiagramConnection): void {
    if (!this.ready) return

    if (!this._isConnectionBelongsToRenderScope(connection)) return

    const connectionKey = getConnectionKey(connection)
    const existing = this._connectionKeyToConnectionPixiContainerMap.get(connectionKey)
    if (existing) {
      this._destroyConnectionResources(existing)
    }

    const connectionPixiContainer = this._createConnectionResources(connection, connectionKey)
    if (!connectionPixiContainer) return

    if (this._suspended) return

    this._remountViewportTiles()
    this._pixiRender()
  }

  /**
   * Delete a connection from the graph
   */
  public deleteConnection(connection: DiagramConnection): void {
    if (!this.graphData) return

    const connectionKey = getConnectionKey(connection)
    const connectionPixiContainer = this._connectionKeyToConnectionPixiContainerMap.get(connectionKey)
    if (!connectionPixiContainer) return

    this._removeConnectionFromTiles(connectionPixiContainer)
    destroyPixiTree(connectionPixiContainer)
    this._connectionKeyToConnectionPixiContainerMap.delete(connectionKey)

    if (this._suspended) return

    this._remountViewportTiles()
    if (this._app) {
      this._pixiRender()
    }
  }

  /**
   * Rebuild all connections from graph data.
   */
  public reloadConnections(): void {
    if (!this._mainConnectionsPixiContainer) return

    this._connectionKeyToConnectionPixiContainerMap.forEach((connectionPixiContainer) => {
      this._removeConnectionFromTiles(connectionPixiContainer)
      destroyPixiTree(connectionPixiContainer)
    })
    this._connectionKeyToConnectionPixiContainerMap.clear()

    this._renderConnections()
    this._updateAllConnectionResources()

    if (this._suspended) return

    this._remountViewportTiles()
    this._pixiRender()
  }

  /**
   * Remap connectionMap key after an array-slot pinName shift (no shape rebuild).
   */
  public rekeyConnection(oldKey: string, connection: DiagramConnection): void {
    if (!this.ready) return

    const nextConnectionKey = getConnectionKey(connection)
    if (oldKey === nextConnectionKey) return

    const connectionPixiContainer = this._connectionKeyToConnectionPixiContainerMap.get(oldKey)
    if (!connectionPixiContainer) return

    this._connectionKeyToConnectionPixiContainerMap.delete(oldKey)

    connectionPixiContainer.connection = connection
    this._connectionKeyToConnectionPixiContainerMap.set(nextConnectionKey, connectionPixiContainer)

    this._updateConnectionResources(connectionPixiContainer)

    if (this._suspended) return

    this._remountViewportTiles()
    this._pixiRender()
  }

  public getConnectionSettings(): {
    showConnections: boolean
    highlightSelectedNodeConnections: boolean
    selectedNodeConnectionColor: string
    selectedNodeConnectionOverlayAmount: number
    selectedNodeConnectionOpacity: number
    selectedNodeConnectionWidth: number
  } {
    return {
      showConnections: this._showConnections,
      highlightSelectedNodeConnections: this.highlightSelectedNodeConnections,
      selectedNodeConnectionColor: this.selectedNodeConnectionColor,
      selectedNodeConnectionOverlayAmount: this.selectedNodeConnectionOverlayAmount,
      selectedNodeConnectionOpacity: this.selectedNodeConnectionOpacity,
      selectedNodeConnectionWidth: this.selectedNodeConnectionWidth
    }
  }

  public setHighlightSelectedNodeConnections(highlight: boolean): void {
    if (this.highlightSelectedNodeConnections === highlight) return
    this.highlightSelectedNodeConnections = highlight
    this._updateAllConnectionResources()
  }

  public setSelectedNodeConnectionColor(color: string): void {
    if (this.selectedNodeConnectionColor === color) return
    this.selectedNodeConnectionColor = color
    this._updateAllConnectionResources()
  }

  public setSelectedNodeConnectionOverlayAmount(amount: number): void {
    const next = Math.max(0, Math.min(1, amount))
    if (this.selectedNodeConnectionOverlayAmount === next) return
    this.selectedNodeConnectionOverlayAmount = next
    this._updateAllConnectionResources()
  }

  public setSelectedNodeConnectionOpacity(opacity: number): void {
    const next = Math.max(0.1, Math.min(1.0, opacity))
    if (this.selectedNodeConnectionOpacity === next) return
    this.selectedNodeConnectionOpacity = next
    this._updateAllConnectionResources()
  }

  public setSelectedNodeConnectionWidth(width: number): void {
    const next = Math.max(1, Math.min(10, width))
    if (this.selectedNodeConnectionWidth === next) return
    this.selectedNodeConnectionWidth = next
    this._updateAllConnectionResources()
  }

  // #endregion

  // #region API: Callbacks

  public setOnNodeSelect(callback: (nodeIds: string[], primaryNodeId: string | null, event?: MouseEvent) => void): void {
    this._onNodeSelect = callback
  }

  public setOnOpenNodeScope(callback: (nodeId: string) => void): void {
    this._onOpenNodeScope = callback
  }

  public setOnPinConnect(
    callback: (payload: { fromNodeId: string; toNodeId: string; pinName: string }) => void
  ): void {
    this._onPinConnect = callback
  }

  public setOnPinRewire(
    callback: (payload: {
      grabbedConnection: DiagramConnection
      hostNodeId: string
      pinName: string
      newToNodeId?: string
      newPinName?: string
    }) => void
  ): void {
    this._onPinRewire = callback
  }

  // #endregion
}


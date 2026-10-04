import { Container, FederatedPointerEvent, Graphics, NineSliceSprite, Rectangle, Texture } from "pixi.js"
import type { RenderData, RenderNode } from '../graph/diagramTypes'
import {
  formatCrossViewSourceLabel,
  getSmInputChainOverviewSubtitle, 
  getSmInputChainOverviewTitleText, 
  getStateOverviewTitleText, 
  getTypedDataBodySubtitle, 
  isConditionalEntryDescriptionNode, 
  isDiagramConditionalEntryWrapper, 
  isDiagramPortalNode, 
  isDiagramTransitionWrapper, 
  isSmInputChainOverviewLeaf, 
  isStateMachineDiagramRoot, 
  isStateOverviewLeaf, 
  isTransitionDescriptionNode,
} from "../graph/DiagramConversion"
import { isDiagramGroupNode, isDiagramNoteNode, readDiagramGroupLabel } from "../graph/diagramFrameNodes"
import { ellipsizeDiagramText } from "../graph/diagramTextMetrics"
import type { BodyPaintModel } from "../graph/NodeBodyPresent"
import { blenderVisualForCategory, NodeChromeHints, resolveNodeChromeCategory } from "../graph/NodeChromeTheme"
import { NodePinDesc, NodePinShape, PinSide } from "../graph/NodePins"
import { clearNodeRowsHost, paintNodeRows } from "../graph/NodeRowPainter"
import { PIN_COLOR_FALLBACK } from "../graph/pinTyping"
import { createDiagramText, DiagramText } from "../graph/pixiText"
import { findCrossViewConnForPinPortal } from "../graph/portalTopology"
import { isTypedDataBodyDiagramNode } from "../graph/typedDataBodyDiagramNodeTypes"
import { SimNodeState } from "../sim"

export const ROOT_CONTAINER_LABEL = 'root-container'
export const BG_SPRITE_LABEL = 'node-bg-texture'
export const HEADER_SPRITE_LABEL = 'node-header-texture'
export const BORDER_GRAPHICS_LABEL = 'node-border-graphics'
export const TITLE_TEXT_LABEL = 'node-title-text'
export const SUBTITLE_TEXT_LABEL = 'node-subtitle-text'
export const OPEN_SCOPE_BTN_TEXT_LABEL = 'open-scope-btn-text'
export const BODY_CONTAINER_LABEL = 'body-container'
export const SIM_HIGHLIGHT_CONTAINER_LABEL = 'sim-highlight-container'
export const SIM_HIGHLIGHT_GRAPHICS_LABEL = 'sim-highlight-graphics'
export const SIM_VALUE_BADGE_TEXT_LABEL = 'sim-value-badge-text'
export const PINS_CONTAINER_LABEL = 'pins-container'
export const NODE_PIN_LABEL = 'node-pin'
export const NODE_PIN_SHAPE_GRAPHICS_LABEL = 'node-pin-shape-graphics'
export const PIN_STRIPS_CONTAINER_LABEL = 'pin-strips-container'
export const PIN_STRIP_BAND_CONTAINER_LABEL = 'pin-strip-band-container'

export const NODE_HEADER_HEIGHT = 40
export const NODE_CORNER_RADIUS = 4
export const NODE_HORIZONTAL_PADDING = 10
export const NODE_TITLE_TEXT_SIZE = 12
export const OPEN_SCOPE_BTN_SIZE = 22
export const PIN_RADIUS = 5
export const PIN_HIT_PADDING = 4
export const PIN_SNAP_STRIP_WIDTH = 36
export const PIN_SNAP_STRIP_INSET = PIN_RADIUS + PIN_HIT_PADDING
export const PIN_STRIP_CLUSTER_GAP = 32
export const PIN_STRIP_CLUSTER_PAD = 10
export const SELECTION_OUTLINE_SCREEN_PX = 1.5
export const SIM_ACTIVE_OUTLINE_SCREEN_PX = 3
export const SIM_ACTIVE_INSET_SCREEN_PX = 2
export const SIM_VALUE_BADGE_MAX_WIDTH = 80

export const DEFAULT_NODE_FILL_COLOR_HEX = '#3a3a3a'
export const DEFAULT_HEADER_TITLE_TEXT_COLOR_HEX = '#ffffff'
export const DEFAULT_HEADER_SUBTITLE_TEXT_COLOR_HEX = '#5a6a7a'
export const DEFAULT_BORDER_COLOR_HEX = '#9ec9ef'
export const DEFAULT_SELECTED_BORDER_COLOR_HEX = '#ffffff'
export const DEFAULT_SIM_ACTIVE_HIGHLIGHT_COLOR_HEX = '#4772b3'

export interface PixiDiagramNodeVisualOptions {
  titleText?: string
  subtitleText?: string
  /** When set, skip the ▣ title row (portal boxes show source arrow on subtitle only). */
  hideTitleLine?: boolean
  /** Hex color for bg nine-slice tint (keep opaque; use fillAlpha for transparency). */
  fill?: string
  fillAlpha?: number
  headerFill?: string
  stroke?: string
  strokeDash?: number[]
  titleFill?: string
  subtitleFill?: string
}

export interface PixiDiagramNodeCtx {
  worldLengthForScreenPx(screenPx: number): number
  beginInputPinDrag(diagramNodeId: string, pos: { x: number, y: number }): void
  beginOutputPinDrag(diagramNodeId: string, pos: { x: number, y: number }): void
}

export interface PixiDiagramNodeProps {
  ctx: PixiDiagramNodeCtx,
  diagramNodeId: string,
  diagramNodeType: string,
  showOpenScopeBtn: boolean,
  selected: boolean,
  x: number,
  y: number,
  width: number,
  height: number,
  visualOptions: PixiDiagramNodeVisualOptions,
  nodePins: NodePinDesc[],
  bodyModel: BodyPaintModel,
  simNodeState?: SimNodeState,
}

export class PixiDiagramNode {
  private static _nodeBgTemplateTexture: Texture
  private static _nodeHeaderBgTemplateTexture: Texture

  private readonly _ctx: PixiDiagramNodeCtx
  private readonly _diagramNodeId: string
  private readonly _diagramNodeType: string
  private _showOpenScopeBtn: boolean
  private _selected: boolean
  private _x: number
  private _y: number
  private _width: number
  private _height: number
  private _visualOptions: PixiDiagramNodeVisualOptions
  private _nodePinsDescs: NodePinDesc[]
  private _simNodeState?: SimNodeState
  private _bodyModel: BodyPaintModel

  private readonly _pixiContainer: Container
  private readonly _bgNineSliceSprite: NineSliceSprite
  private readonly _headerBgNineSliceSprite: NineSliceSprite
  private readonly _borderGraphics: Graphics
  private readonly _titlePixiText: DiagramText
  private readonly _subtitleText: DiagramText
  private _openScopeBtnLabelText?: DiagramText
  private readonly _bodyPixiContainer: Container
  private readonly _simContainer: Container
  private _simHighlightGraphics?: Graphics
  private _simValueBadgeText?: DiagramText
  private readonly _pinsPixiContainer: Container
  private readonly _pinStripsPixiContainer: Container

  constructor(props: PixiDiagramNodeProps) {
    this._ctx = props.ctx
    this._diagramNodeId = props.diagramNodeId
    this._diagramNodeType = props.diagramNodeType
    this._showOpenScopeBtn = props.showOpenScopeBtn
    this._selected = false
    this._x = props.x
    this._y = props.y
    this._width = props.width
    this._height = props.height
    this._visualOptions = props.visualOptions
    this._nodePinsDescs = props.nodePins
    this._simNodeState = props.simNodeState
    this._bodyModel = props.bodyModel
    
    this._pixiContainer = new Container()
    this._bgNineSliceSprite = new NineSliceSprite({
      texture: PixiDiagramNode.nodeBgTemplateTexture,
      leftWidth: NODE_CORNER_RADIUS,
      rightWidth: NODE_CORNER_RADIUS,
      topHeight: NODE_CORNER_RADIUS,
      bottomHeight: NODE_CORNER_RADIUS,
      label: BG_SPRITE_LABEL,
      eventMode: 'static',
      cursor: 'pointer',
    })
    this._headerBgNineSliceSprite = new NineSliceSprite({
      texture: PixiDiagramNode.nodeHeaderBgTemplateTexture,
      leftWidth: NODE_CORNER_RADIUS,
      rightWidth: NODE_CORNER_RADIUS,
      topHeight: NODE_CORNER_RADIUS,
      bottomHeight: NODE_CORNER_RADIUS,
      label: HEADER_SPRITE_LABEL,
      eventMode: 'static',
      cursor: 'pointer',
    })

    this._borderGraphics = new Graphics()

    this._titlePixiText = createDiagramText({
      text: props.visualOptions.titleText ?? '',
      style: {
        fontSize: NODE_TITLE_TEXT_SIZE,
      },
    })

    this._subtitleText = createDiagramText({
      text: props.visualOptions.subtitleText ?? '',
      style: {
        fontSize: 10,
      },
    })

    this._bodyPixiContainer = new Container()
    this._simContainer = new Container()

    this._pinsPixiContainer = new Container()
    this._pinStripsPixiContainer = new Container()
  }

  public setup(): void {
    this._pixiContainer.addChild(this._bgNineSliceSprite)
    
    this._pixiContainer.addChild(this._headerBgNineSliceSprite)

    this._borderGraphics.label = BORDER_GRAPHICS_LABEL
    this._borderGraphics.eventMode = 'static'
    this._borderGraphics.cursor = 'pointer'
    this._pixiContainer.addChild(this._borderGraphics)

    this._titlePixiText.label = SUBTITLE_TEXT_LABEL
    this._titlePixiText.x = NODE_HORIZONTAL_PADDING
    this._titlePixiText.y = 5
    this._pixiContainer.addChild(this._titlePixiText)
    
    this._subtitleText.label = SUBTITLE_TEXT_LABEL
    this._subtitleText.x = NODE_HORIZONTAL_PADDING
    this._subtitleText.y = 20
    this._pixiContainer.addChild(this._subtitleText)

    this._bodyPixiContainer.label = BODY_CONTAINER_LABEL
    this._pixiContainer.addChild(this._bodyPixiContainer)
    
    this._simContainer.label = SIM_HIGHLIGHT_CONTAINER_LABEL
    this._pixiContainer.addChild(this._simContainer)

    this._pinsPixiContainer.label = PINS_CONTAINER_LABEL
    this._pixiContainer.addChild(this._pinsPixiContainer)

    this._pinStripsPixiContainer.label = PIN_STRIPS_CONTAINER_LABEL
    this._pixiContainer.addChild(this._pinStripsPixiContainer)
  }

  public update(): void {
    this.updateRoot()

    this._bgNineSliceSprite.width = this._width
    this._bgNineSliceSprite.height = this._height
    this._bgNineSliceSprite.tint = this._visualOptions.fill ?? DEFAULT_NODE_FILL_COLOR_HEX
    this._bgNineSliceSprite.alpha = this._visualOptions.fillAlpha ?? 1
    this._bgNineSliceSprite.hitArea = new Rectangle(0, 0, this._width, this._height)

    this._headerBgNineSliceSprite.width = this._width
    this._headerBgNineSliceSprite.height = Math.min(NODE_HEADER_HEIGHT, this._height - NODE_CORNER_RADIUS)
    this._headerBgNineSliceSprite.tint = this._visualOptions.headerFill ?? DEFAULT_NODE_FILL_COLOR_HEX

    const titleText = `▣ ${this._visualOptions.titleText ?? this.diagramNodeId}`
    const titleTextMaxWidth = this._width - NODE_HORIZONTAL_PADDING * 2
      - (this._showOpenScopeBtn ? OPEN_SCOPE_BTN_SIZE : 0)
      - (this._simNodeState ? SIM_VALUE_BADGE_MAX_WIDTH : 0)

    this._titlePixiText.text = ellipsizeDiagramText(titleText, titleTextMaxWidth, NODE_TITLE_TEXT_SIZE)
    this._titlePixiText.tint = this._visualOptions.titleFill ?? DEFAULT_HEADER_TITLE_TEXT_COLOR_HEX
    
    this._subtitleText.text = this._visualOptions.subtitleText ?? this._diagramNodeType.slice(0, 50) + (this._diagramNodeType.length > 50 ? '...' : '')
    this._subtitleText.tint = this._visualOptions.subtitleFill ?? DEFAULT_HEADER_SUBTITLE_TEXT_COLOR_HEX

    this.updateOpenScopeBtn()

    this.updateBody()

    this.updateBorder()

    this.updateSim()

    this.updatePins()
  }

  public updateRoot(): void {
    this._pixiContainer.position.set(this._x, this._y)
  }

  public updateBody(): void {
    const model = this._bodyModel
    if (model.kind === 'empty') {
      clearNodeRowsHost(this._bodyPixiContainer)
      return
    }
    paintNodeRows(this._bodyPixiContainer, model.layout, {
      contentWidth: this._width,
    })
  }

  public updateBorder(): void {
    PixiDiagramNode._drawNodeBorder(this._borderGraphics, this._width, this._height, this._ctx.worldLengthForScreenPx(SELECTION_OUTLINE_SCREEN_PX))
    this._borderGraphics.tint = this._selected ? DEFAULT_SELECTED_BORDER_COLOR_HEX : '#333'
  }

  public updateOpenScopeBtn(): void {
    if (!this._showOpenScopeBtn) {
      this._openScopeBtnLabelText?.destroy({ children: true })
      this._openScopeBtnLabelText = undefined
      return
    }

    if (!this._openScopeBtnLabelText) {
      this._openScopeBtnLabelText = this._createOpenScopeBtnLabelText()
      this._pixiContainer.addChild(this._openScopeBtnLabelText)
    }

    this._openScopeBtnLabelText.x = Math.max(4, this._width - OPEN_SCOPE_BTN_SIZE - NODE_HORIZONTAL_PADDING)
    this._openScopeBtnLabelText.y = 8
  }

  private _createOpenScopeBtnLabelText(): DiagramText {
    const openScopeBtnLabelText = createDiagramText({
      text: '⧉',
      style: {
        fontSize: 14,
      },
    })

    openScopeBtnLabelText.label = OPEN_SCOPE_BTN_TEXT_LABEL
    openScopeBtnLabelText.eventMode = 'static'
    openScopeBtnLabelText.cursor = 'pointer'
    openScopeBtnLabelText.tint = DEFAULT_HEADER_TITLE_TEXT_COLOR_HEX
    openScopeBtnLabelText.hitArea = new Rectangle(0, 0, OPEN_SCOPE_BTN_SIZE, OPEN_SCOPE_BTN_SIZE)

    return openScopeBtnLabelText
  }

  public updateSim(): void {
    this.updateSimHighlightGraphics()
    this.updateSimValueBadge()
  }

  public updateSimHighlightGraphics(): void {
    const simNodeState = this._simNodeState
    if (!simNodeState || !simNodeState.active) {
      this._simHighlightGraphics?.destroy({ children: true })
      this._simHighlightGraphics = undefined
      return
    }
    
    let simHighlightGraphics = this._simHighlightGraphics
    if (!simHighlightGraphics) {
      simHighlightGraphics = this._simHighlightGraphics = new Graphics()
      simHighlightGraphics.label = SIM_HIGHLIGHT_GRAPHICS_LABEL
      simHighlightGraphics.eventMode = 'none'
      this._simContainer.addChild(simHighlightGraphics)
    }

    const inset = this._ctx.worldLengthForScreenPx(SIM_ACTIVE_INSET_SCREEN_PX)
    const strokeWidth = this._ctx.worldLengthForScreenPx(SIM_ACTIVE_OUTLINE_SCREEN_PX)
    simHighlightGraphics.clear()
    const w = Math.max(1, this._width - inset * 2)
    const h = Math.max(1, this._height - inset * 2)
    simHighlightGraphics.roundRect(inset, inset, w, h, Math.max(0, NODE_CORNER_RADIUS - inset))
    simHighlightGraphics.stroke({ width: strokeWidth, color: DEFAULT_SIM_ACTIVE_HIGHLIGHT_COLOR_HEX, alpha: 1 })
  }

  public updateSimValueBadge(): void {
    const simNodeState = this._simNodeState
    if (!simNodeState || !simNodeState.active) {
      this._simValueBadgeText?.destroy({ children: true })
      this._simValueBadgeText = undefined
      return
    }

    if (typeof simNodeState.weight !== 'number'
      && typeof simNodeState.conditionTruth !== 'boolean'
    ) {
      this._simValueBadgeText?.destroy({ children: true })
      this._simValueBadgeText = undefined
      return
    }

    const labelText = PixiDiagramNode.resolveSimValueBadgeLabelText(simNodeState)
    const textColorHex = PixiDiagramNode.resolveSimValueBadgeFillColorHex(simNodeState)

    let simValueBadgeText = this._simValueBadgeText
    if (!simValueBadgeText) {
      simValueBadgeText = this._simValueBadgeText = createDiagramText({
        text: labelText,
        style: {
          fontSize: 11,
        },
      })
      simValueBadgeText.label = SIM_VALUE_BADGE_TEXT_LABEL
      simValueBadgeText.anchor.set(1, 0)
      this._simContainer.addChild(simValueBadgeText)
    }

    simValueBadgeText.text = labelText
    simValueBadgeText.tint = textColorHex
    simValueBadgeText.x = this._width - 10
    simValueBadgeText.y = 5
  }

  public static resolveSimValueBadgeLabelText(simNodeState: SimNodeState): string {
    if (typeof simNodeState.weight === 'number') {
      return Number.isInteger(simNodeState.weight) || Math.abs(simNodeState.weight - Math.round(simNodeState.weight)) < 1e-6
        ? String(Math.round(simNodeState.weight))
        : simNodeState.weight.toFixed(2)
    }
    return simNodeState.conditionTruth === true ? 'T' : 'F'
  }

  public static resolveSimValueBadgeFillColorHex(simNodeState: SimNodeState): string {
    if (simNodeState.conditionTruth === true) {
      return '#5ec4a8'
    }
    if (simNodeState.conditionTruth === false) {
      return '#ff8a8a'
    }
    return '#e8b84a'
  }

  public updatePins(): void {
    this._pinsPixiContainer.removeChildren()
    this._pinStripsPixiContainer.removeChildren()

    if (!this._nodePinsDescs.length) {
      return
    }

    for (const nodePinDesc of this._nodePinsDescs) {
      this._pinsPixiContainer.addChild(this._createNodePin(nodePinDesc))
    }

    const nodePinDescsSortedByY = this._nodePinsDescs
      .filter((desc) => desc.side === 'in')
      .sort((a, b) => a.localY - b.localY)
      
    let previousPinLocalY = 0
    let pinBandPixiContainer: Container | null = null
    for (const nodePinDesc of nodePinDescsSortedByY) {
      if (pinBandPixiContainer === null || (nodePinDesc.localY - previousPinLocalY > PIN_STRIP_CLUSTER_GAP)) {
        if (pinBandPixiContainer !== null) {
          pinBandPixiContainer.hitArea = new Rectangle(
            -PIN_SNAP_STRIP_WIDTH,
            -PIN_STRIP_CLUSTER_PAD,
            PIN_SNAP_STRIP_WIDTH + PIN_SNAP_STRIP_INSET,
            (previousPinLocalY + PIN_STRIP_CLUSTER_PAD) - pinBandPixiContainer.y + PIN_STRIP_CLUSTER_PAD * 2,
          )
        }
        
        const nextPinBandPixiContainer = new Container()
        this._pinStripsPixiContainer.addChild(nextPinBandPixiContainer)
        nextPinBandPixiContainer.label = PIN_STRIP_BAND_CONTAINER_LABEL
        nextPinBandPixiContainer.y = nodePinDesc.localY - PIN_STRIP_CLUSTER_PAD
        nextPinBandPixiContainer.eventMode = 'static'
        nextPinBandPixiContainer.cursor = 'pointer'
        nextPinBandPixiContainer.on('pointerdown', (e: FederatedPointerEvent) => {
          if (e.button !== 0) return
          e.stopPropagation()
          this._ctx.beginInputPinDrag(this._diagramNodeId, { x: e.global.x, y: e.global.y })
        })

        pinBandPixiContainer = nextPinBandPixiContainer
      }

      previousPinLocalY = nodePinDesc.localY
    }
    if (pinBandPixiContainer !== null) {
      pinBandPixiContainer.hitArea = new Rectangle(
        -PIN_SNAP_STRIP_WIDTH,
        -PIN_STRIP_CLUSTER_PAD,
        PIN_SNAP_STRIP_WIDTH + PIN_SNAP_STRIP_INSET,
        (previousPinLocalY + PIN_STRIP_CLUSTER_PAD) - pinBandPixiContainer.y + PIN_STRIP_CLUSTER_PAD * 2,
      )
    }
  }

  private _createNodePin(
    nodePinDesc: NodePinDesc,
  ): Container {
    const pinPixiContainer = new Container()
    pinPixiContainer.label = NODE_PIN_LABEL
    pinPixiContainer.x = PixiDiagramNode.pinLocalX(nodePinDesc.side, this._width)
    pinPixiContainer.y = nodePinDesc.localY
    pinPixiContainer.eventMode = 'passive'
    
    const pinPixiGraphics = new Graphics()
    pinPixiContainer.addChild(pinPixiGraphics)

    pinPixiGraphics.label = NODE_PIN_SHAPE_GRAPHICS_LABEL
    PixiDiagramNode._drawNodePinShape(pinPixiGraphics, nodePinDesc.shape, nodePinDesc.pinColor)

    if (nodePinDesc.side === 'out') {
      pinPixiGraphics.cursor = 'pointer'
      pinPixiGraphics.eventMode = 'static'
      const paddedHitAreaRadius = PIN_RADIUS + PIN_HIT_PADDING
      pinPixiGraphics.hitArea = new Rectangle(
        -paddedHitAreaRadius, 
        -paddedHitAreaRadius, 
        paddedHitAreaRadius * 2, 
        paddedHitAreaRadius * 2
      )
      pinPixiGraphics.on('pointerdown', (e: FederatedPointerEvent) => {
        if (e.button !== 0) return
        e.stopPropagation()
        this._ctx.beginOutputPinDrag(this._diagramNodeId, { x: e.global.x, y: e.global.y })
      })
    } else {
      pinPixiGraphics.eventMode = 'none'
    }

    if (nodePinDesc.label && !nodePinDesc.hideLabel) {
      const pinLabelText = nodePinDesc.label.length > 14 
        ? `${nodePinDesc.label.slice(0, 12)}…` 
        : nodePinDesc.label
      const pinLabelPixiText = createDiagramText({
        text: pinLabelText,
        style: {
          fontSize: 8,
          fill: '#ffffff',
        },
      })
      pinPixiContainer.addChild(pinLabelPixiText)

      pinLabelPixiText.eventMode = 'none'
      if (nodePinDesc.side === 'out') {
        pinLabelPixiText.anchor.set(1, 0.5)
        pinLabelPixiText.x = -PIN_RADIUS - 3
        pinLabelPixiText.y = 0
      } else {
        pinLabelPixiText.anchor.set(0, 0.5)
        pinLabelPixiText.x = PIN_RADIUS + 3
        pinLabelPixiText.y = 0
      }
    }

    return pinPixiContainer
  }

  public destroy(): void {
    this._pixiContainer.destroy({ children: true })
  }

  public get diagramNodeId(): string {
    return this._diagramNodeId
  }

  public get pixiContainer(): Container {
    return this._pixiContainer
  }

  public get showOpenScopeBtn(): boolean {
    return this._showOpenScopeBtn
  }

  public set showOpenScopeBtn(value: boolean) {
    this._showOpenScopeBtn = value
  }

  public get x(): number {
    return this._x
  }

  public set x(value: number) {
    this._x = value
  }

  public get y(): number {
    return this._y
  }

  public set y(value: number) {
    this._y = value
  }

  public get width(): number {
    return this._width
  }

  public set width(value: number) {
    this._width = value
  }

  public get height(): number {
    return this._height
  }

  public set height(value: number) {
    this._height = value
  }

  public get selected(): boolean {
    return this._selected
  }
  
  public set selected(value: boolean) {
    this._selected = value
  }


  public get visualOptions(): PixiDiagramNodeVisualOptions {
    return this._visualOptions
  }

  public set visualOptions(value: PixiDiagramNodeVisualOptions) {
    this._visualOptions = value
  }

  public get bodyModel(): BodyPaintModel {
    return this._bodyModel
  }

  public set bodyModel(value: BodyPaintModel) {
    this._bodyModel = value
  }

  public get nodePinsDescs(): NodePinDesc[] {
    return this._nodePinsDescs
  }

  public set nodePinsDescs(value: NodePinDesc[]) {
    this._nodePinsDescs = value
  }

  public get simNodeState(): SimNodeState | undefined {
    return this._simNodeState
  }

  public set simNodeState(value: SimNodeState | undefined) {
    this._simNodeState = value
  }

  public getPinPosition(pinId: string): { x: number, y: number } | undefined {
    const pinPixiContainers = this._pinsPixiContainer.children
    for (let i = 0; i < this._nodePinsDescs.length; i++) {
      const nodePinDesc = this._nodePinsDescs[i]
      if (nodePinDesc.pinId === pinId) {
        return pinPixiContainers[i]?.position.clone()
      }
    }
    return undefined
  }

  private static _drawNodeBorder(graphics: Graphics, width: number, height: number, borderWidth: number): void {
    graphics.clear()
    graphics.roundRect(0, 0, width, height, NODE_CORNER_RADIUS)
    graphics.stroke({ width: borderWidth, color: 0xffffff, })
  }

  private static _drawNodePinShape(graphics: Graphics, shape?: NodePinShape, pinColorHex?: string): void {
    const _pinColorHex = pinColorHex ?? PIN_COLOR_FALLBACK
    graphics.clear()
    if (shape === 'diamond') {
      const s = PIN_RADIUS + 1
      graphics.poly([0, -s, s, 0, 0, s, -s, 0])
      graphics.fill({ color: _pinColorHex })
      graphics.poly([0, -s, s, 0, 0, s, -s, 0])
      graphics.stroke({ width: 1.25, color: 0xffffff })
    } else {
      graphics.circle(0, 0, PIN_RADIUS)
      graphics.fill({ color: _pinColorHex })
      graphics.circle(0, 0, PIN_RADIUS)
      graphics.stroke({ width: 1, color: 0xffffff })
    }
  }

  public static chromeHintsForNode(diagramNode: RenderNode): NodeChromeHints {
    return {
      isPortal: isDiagramPortalNode(diagramNode),
      isStateMachine: isStateMachineDiagramRoot(diagramNode),
      isState: isStateOverviewLeaf(diagramNode),
      isTransition: isTransitionDescriptionNode(diagramNode) || isDiagramTransitionWrapper(diagramNode),
      isConditionalEntry:
        isConditionalEntryDescriptionNode(diagramNode) || isDiagramConditionalEntryWrapper(diagramNode),
      isGroup: !!(diagramNode.isGroup || diagramNode.type === 'PropertyGroup'),
    }
  }

  public static resolvePixiDiagramNodeVisualOptions(diagramData: RenderData, diagramNode: RenderNode): PixiDiagramNodeVisualOptions {
    const chrome = blenderVisualForCategory(
      resolveNodeChromeCategory(diagramNode.type, PixiDiagramNode.chromeHintsForNode(diagramNode))
    )

    if (isDiagramPortalNode(diagramNode)) {
      const crossConn = findCrossViewConnForPinPortal(diagramData, diagramNode)
      const originalFrom =
        crossConn?.metadata?.originalFrom ??
        (diagramNode.metadata?.originalFrom as string | undefined) ??
        crossConn?.from ??
        ''
      if (originalFrom) {
        return {
          titleText: '',
          subtitleText: formatCrossViewSourceLabel(
            originalFrom,
            diagramData.handlesRegistry,
            diagramData.allNodes
          ),
          hideTitleLine: true,
          ...chrome,
        }
      }
      const pin = crossConn?.pinName ?? (diagramNode.metadata?.pinName as string | undefined)
      return {
        titleText: '',
        subtitleText: pin ? `← ${pin}` : '←',
        hideTitleLine: true,
        ...chrome,
      }
    }
    if (isStateMachineDiagramRoot(diagramNode)) {
      const smId =
        (diagramNode.metadata?.stateMachineNodeId as string | undefined) ??
        (diagramNode.metadata?.ownerStateMachineId as string | undefined)
      return {
        titleText: smId ?? diagramNode.id,
        subtitleText: 'State Machine',
        ...chrome,
      }
    }
    if (isStateOverviewLeaf(diagramNode)) {
      return {
        titleText: getStateOverviewTitleText(diagramNode),
        subtitleText: 'State',
        ...chrome,
      }
    }
    if (isSmInputChainOverviewLeaf(diagramNode)) {
      return {
        titleText: getSmInputChainOverviewTitleText(diagramNode, diagramData.handlesRegistry),
        subtitleText: getSmInputChainOverviewSubtitle(diagramNode),
        ...chrome,
      }
    }
    if (isTransitionDescriptionNode(diagramNode)) {
      return {
        titleText: diagramNode.id,
        subtitleText: 'transition',
        ...chrome,
      }
    }
    if (isConditionalEntryDescriptionNode(diagramNode)) {
      return {
        titleText: diagramNode.id,
        subtitleText: 'conditionalEntry',
        ...chrome,
      }
    }
    if (isTypedDataBodyDiagramNode(diagramNode)) {
      return {
        titleText: diagramNode.id,
        subtitleText: getTypedDataBodySubtitle(diagramNode),
        ...chrome,
      }
    }
    const smProperty = diagramNode.metadata?.smPropertyName as string | undefined
    if (smProperty) {
      const shortType = diagramNode.type.replace(/^animAnimNode_/, '')
      return {
        titleText: smProperty,
        subtitleText: shortType,
        ...chrome,
      }
    }
    if (isDiagramGroupNode(diagramNode)) {
      const label = readDiagramGroupLabel(diagramNode).trim()
      return {
        titleText: label || 'Group',
        subtitleText: 'Group',
        fill: '#000000',
        fillAlpha: 0.2,
        stroke: 'rgba(51, 54, 58, 0.2)',
        strokeDash: [6, 4],
        titleFill: 'rgba(210, 214, 222, 0.9)',
        subtitleFill: 'rgba(150, 156, 168, 0.75)',
      }
    }
    if (isDiagramNoteNode(diagramNode)) {
      return {
        titleText: 'Note',
        subtitleText: '',
        fill: '#483e20',
        fillAlpha: 0.55,
        stroke: 'rgba(200, 170, 80, 0.7)',
        titleFill: 'rgba(240, 220, 150, 0.95)',
        subtitleFill: 'rgba(180, 160, 100, 0.7)',
      }
    }
    if (diagramNode.isGroup || diagramNode.type === 'PropertyGroup') {
      const propertyName = diagramNode.metadata?.propertyName as string | undefined
      return {
        titleText: propertyName || diagramNode.id,
        subtitleText: 'PropertyGroup',
        fill: '#000000',
        fillAlpha: 0.8,
        stroke: 'rgba(161, 166, 173, 0.2)',
        strokeDash: [6, 4],
        titleFill: 'rgba(210, 214, 222, 0.9)',
        subtitleFill: 'rgba(150, 156, 168, 0.75)',
      }
    }
    return {
      titleText: diagramNode.id,
      subtitleText: diagramNode.type,
      ...chrome,
    }
  }

  public static pinLocalX(side: PinSide, nodeWidth: number): number {
    return side === 'out' ? nodeWidth : 0
  }

  public static ensureStaticResources(): void {
    if (!this._nodeBgTemplateTexture) {
      this._nodeBgTemplateTexture = this._createNodeBgTemplateTexture()
    }
    if (!this._nodeHeaderBgTemplateTexture) {
      this._nodeHeaderBgTemplateTexture = this._createNodeHeaderBgTemplateTexture()
    }
  }

  public static get nodeBgTemplateTexture(): Texture {
    this.ensureStaticResources()
    return this._nodeBgTemplateTexture
  }

  public static get nodeHeaderBgTemplateTexture(): Texture {
    this.ensureStaticResources()
    return this._nodeHeaderBgTemplateTexture
  }

  private static _createNodeBgTemplateTexture(): Texture {
    return this._createCanvasTemplateTexture((ctx, size) => {
      ctx.roundRect(0, 0, size, size, NODE_CORNER_RADIUS)
      ctx.fill()
    })
  }

  private static _createNodeHeaderBgTemplateTexture(): Texture {
    return this._createCanvasTemplateTexture((ctx, size) => {
      const r = NODE_CORNER_RADIUS
      ctx.moveTo(r, 0)
      ctx.lineTo(size - r, 0)
      ctx.arcTo(size, 0, size, r, r)
      ctx.lineTo(size, size)
      ctx.lineTo(0, size)
      ctx.lineTo(0, r)
      ctx.arcTo(0, 0, r, 0, r)
      ctx.closePath()
      ctx.fill()
    })
  }

  private static _createCanvasTemplateTexture(
    draw: (ctx: CanvasRenderingContext2D, size: number) => void,
  ): Texture {
    const size = NODE_CORNER_RADIUS * 4
    const resolution = 4
    const canvas = document.createElement('canvas')
    canvas.width = size * resolution
    canvas.height = size * resolution
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      throw new Error('Could not create 2d context for node template texture')
    }
    ctx.scale(resolution, resolution)
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    draw(ctx, size)
    return Texture.from({
      resource: canvas,
      resolution,
      autoGarbageCollect: false,
    })
  }
}
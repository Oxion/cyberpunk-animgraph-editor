/**
 * Declarative node body: list of NodeRows → layout frames → paint + pins.
 * Single source for size, text Y, and pin anchors.
 */

import type { AnimgraphNode } from './animgraphTypes'
import type { DiagramConnection, RenderData, RenderNode } from './diagramTypes'
import { NodeDefinitionRegistry } from '../NodeDefinition'
import { getInputPinColor, resolvePinColorFromType } from './pinTyping/resolvePinColor'
import {
  PROPERTY_ROW_BODY_TOP,
  PROPERTY_ROW_FONT_SIZE,
  NODE_CONTENT_MAX_WIDTH,
  NODE_OPEN_SCOPE_BTN_SIZE,
  SM_INPUT_CHAIN_OVERVIEW_BODY_HEIGHT,
  SM_INPUT_CHAIN_OVERVIEW_BODY_LINE_HEIGHT,
  SM_INPUT_CHAIN_OVERVIEW_BODY_PAD_Y,
  SM_INPUT_CHAIN_OVERVIEW_WIDTH,
  SM_NODE_HEADER_HEIGHT,
  STATE_OVERVIEW_BODY_HEIGHT,
  STATE_OVERVIEW_WIDTH,
} from './NodeChromeMetrics'
import {
  measureDiagramTextWidth,
  ROW_TEXT_HORIZONTAL_PAD,
} from './diagramTextMetrics'
import {
  type DiagramPropertyRow,
  DIAGRAM_CONDITIONAL_ENTRY_WRAPPER_TYPE,
  DIAGRAM_TRANSITION_WRAPPER_TYPE,
  formatCrossViewPinRowText,
  getConditionalEntryDescriptionPropertyRows,
  getStateOverviewPropertyRows,
  getTransitionDescriptionPropertyRows,
  getTypedDataPropertyRows,
  isConditionalEntryDescriptionNode,
  isDiagramOverviewLeaf,
  isDiagramPortalNode,
  isSmInputChainOverviewLeaf,
  isStateMachineDiagramRoot,
  isTransitionDescriptionNode,
  type StateMachineRingPresentation,
  buildStateMachineRingPresentation,
} from './DiagramConversion'
import { getCrossViewConnsForHost, isVirtualOverviewPinId, makeCrossViewConnectionPortalPinId, makeCrossViewPinId } from './crossViewPinIds'
import {
  DIAGRAM_FRAME_DEFAULT_WIDTH,
  isDiagramFrameNode,
  isDiagramNoteNode,
  noteFooterHeight,
  readDiagramNoteText,
  NOTE_FOOTER_MIN_HEIGHT,
} from './diagramFrameNodes'
import { ANIM_NODE_STATE_TYPE_SET } from './animNodeStateTypes'
import { ANIM_NODE_TYPE_STATE_FROZEN } from './animNodeTypes'
import { DIAGRAM_NODE_TYPE_NOTE, DIAGRAM_NODE_TYPE_PORTAL } from './diagramNodeTypes'
import {
  computeStateMachineDetailPanelSize,
  CONDITIONAL_ENTRY_TYPE,
  getStateNodesFromSm,
  TRANSITION_DESCRIPTION_TYPE,
} from './StateMachineDetailLayout'
import type { NodePinDesc, PinSide } from './NodePins'
import { isTypedDataBodyDiagramNode, TYPED_DATA_BODY_DIAGRAM_NODE_TYPES_SET } from './typedDataBodyDiagramNodeTypes'

/** Default pitch for single-line text rows (matches legacy property rows). */
export const NODE_ROW_TEXT_HEIGHT = SM_INPUT_CHAIN_OVERVIEW_BODY_LINE_HEIGHT

export type NodeRow =
  | { kind: 'output'; pinId: 'output'; label: string; pinColor?: string; height?: number }
  | { kind: 'input'; pinId: string; label: string; pinColor?: string; height?: number }
  | { kind: 'portal'; pinId: string; label: string; pinColor?: string; height?: number }
  | { kind: 'field'; label: string; height?: number }
  | { kind: 'multiline'; label: string; height: number }
  | { kind: 'note'; label: string; height: number }
  | { kind: 'sm-ring'; height: number; presentation?: StateMachineRingPresentation }
  | { kind: 'spacer'; height: number }

export type NodeRowFrame = {
  rowIndex: number
  row: NodeRow
  /** Top of row in node-local space. */
  y: number
  height: number
  /** Text baseline/top for label rows (node-local). */
  textY?: number
  /** Pin center Y when row has a socket. */
  pinLocalY?: number
  pinId?: string
  pinSide?: PinSide
  pinShape?: 'circle' | 'diamond'
}

export type NodeRowLayout = {
  headerHeight: number
  /** Preferred content width (load / footprint). */
  width: number
  /** Resize floor — narrower nodes trim row text instead of growing back. */
  minWidth: number
  /** Total node height including header. */
  height: number
  /** Body band height below header (for min-body parity). */
  bodyHeight: number
  frames: NodeRowFrame[]
}

export type LayoutNodeRowsOptions = {
  headerHeight?: number
  width?: number
  /** Minimum body height below header (legacy overview min). */
  minBodyHeight?: number
  /** Extra pad after text-like rows before total body height (legacy PAD_Y). */
  bodyPadY?: number
  bodyTop?: number
  /**
   * `overview` — property-row pitch under header (State/SM/typed).
   * `stacked` — Blender pin stack Y (HEADER+10 + i×16).
   */
  mode?: 'overview' | 'stacked'
  /** Existing node height used to clamp stacked pin Y. */
  nodeHeight?: number
}

const STACKED_PIN_TOP_PAD = 10
const STACKED_PIN_SPACING = 16

function rowHasPin(row: NodeRow): row is NodeRow & { pinId: string } {
  return row.kind === 'output' || row.kind === 'input' || row.kind === 'portal'
}

function defaultRowHeight(row: NodeRow): number {
  if (
    row.kind === 'sm-ring' ||
    row.kind === 'spacer' ||
    row.kind === 'multiline' ||
    row.kind === 'note'
  ) {
    return row.height
  }
  return row.height ?? NODE_ROW_TEXT_HEIGHT
}

function layoutStackedNodeRows(rows: NodeRow[], options: LayoutNodeRowsOptions): NodeRowLayout {
  const headerHeight = options.headerHeight ?? SM_NODE_HEADER_HEIGHT
  const width = options.width ?? 120
  const nodeHeight = Math.max(options.nodeHeight ?? 80, headerHeight + 20)
  const frames: NodeRowFrame[] = []
  let rowIndex = 0

  for (const row of rows) {
    if (
      row.kind === 'field' ||
      row.kind === 'multiline' ||
      row.kind === 'note' ||
      row.kind === 'sm-ring' ||
      row.kind === 'spacer'
    ) {
      // Description / extras: pack below pin stack.
      continue
    }
    const pinLocalY = Math.min(
      nodeHeight - 9,
      headerHeight + STACKED_PIN_TOP_PAD + rowIndex * STACKED_PIN_SPACING
    )
    const textY = pinLocalY - PROPERTY_ROW_FONT_SIZE * 0.5
    const frame: NodeRowFrame = {
      rowIndex: frames.length,
      row,
      y: textY,
      height: STACKED_PIN_SPACING,
      textY,
    }
    if (rowHasPin(row)) {
      frame.pinId = row.pinId
      frame.pinSide = row.kind === 'output' ? 'out' : 'in'
      frame.pinLocalY = pinLocalY
      frame.pinShape = row.kind === 'portal' ? 'diamond' : 'circle'
    }
    frames.push(frame)
    rowIndex += 1
  }

  // Trailing field/multiline (description) under pins.
  let cursor =
    headerHeight +
    STACKED_PIN_TOP_PAD +
    Math.max(rowIndex, 1) * STACKED_PIN_SPACING
  for (const row of rows) {
    if (row.kind !== 'field' && row.kind !== 'multiline' && row.kind !== 'note') continue
    const height = defaultRowHeight(row)
    frames.push({
      rowIndex: frames.length,
      row,
      y: cursor,
      height,
      textY: cursor,
    })
    cursor += height
  }

  const bodyHeight = Math.max(nodeHeight - headerHeight, cursor - headerHeight)
  return {
    headerHeight,
    width,
    minWidth: width,
    bodyHeight,
    height: headerHeight + bodyHeight,
    frames,
  }
}

/**
 * Pack rows into frames. Text-like rows share BODY_TOP + pitch; `sm-ring` starts
 * after the legacy pin-block height (n×line + padY) so ring Y matches old chrome.
 */
export function layoutNodeRows(
  rows: NodeRow[],
  options: LayoutNodeRowsOptions = {}
): NodeRowLayout {
  if (options.mode === 'stacked') {
    return layoutStackedNodeRows(rows, options)
  }

  const headerHeight = options.headerHeight ?? SM_NODE_HEADER_HEIGHT
  const width = options.width ?? STATE_OVERVIEW_WIDTH
  const minBodyHeight = options.minBodyHeight ?? SM_INPUT_CHAIN_OVERVIEW_BODY_HEIGHT
  const bodyPadY = options.bodyPadY ?? SM_INPUT_CHAIN_OVERVIEW_BODY_PAD_Y
  const bodyTop = options.bodyTop ?? PROPERTY_ROW_BODY_TOP

  const textLike = rows.filter((r) => r.kind !== 'sm-ring')
  const ringRows = rows.filter((r) => r.kind === 'sm-ring')

  const frames: NodeRowFrame[] = []
  let cursor = headerHeight + bodyTop

  for (let i = 0; i < textLike.length; i++) {
    const row = textLike[i]!
    const height = defaultRowHeight(row)
    const frame: NodeRowFrame = {
      rowIndex: frames.length,
      row,
      y: cursor,
      height,
    }
    if (row.kind === 'output' || row.kind === 'input' || row.kind === 'portal' || row.kind === 'field') {
      frame.textY = cursor
    }
    if (row.kind === 'multiline' || row.kind === 'note') {
      frame.textY = cursor
    }
    if (rowHasPin(row)) {
      frame.pinId = row.pinId
      frame.pinSide = row.kind === 'output' ? 'out' : 'in'
      frame.pinLocalY = cursor + PROPERTY_ROW_FONT_SIZE * 0.5
      frame.pinShape = row.kind === 'portal' ? 'diamond' : 'circle'
    }
    frames.push(frame)
    cursor += height
  }

  const textRowsHeight = textLike.reduce((sum, r) => sum + defaultRowHeight(r), 0)
  const pinBlockHeight = Math.max(
    minBodyHeight,
    Math.max(textLike.length, 1) * NODE_ROW_TEXT_HEIGHT + bodyPadY
  )
  const contentBody = Math.max(minBodyHeight, textRowsHeight + bodyPadY, pinBlockHeight)

  let ringY = headerHeight + contentBody
  for (const row of ringRows) {
    const height = defaultRowHeight(row)
    frames.push({
      rowIndex: frames.length,
      row,
      y: ringY,
      height,
    })
    ringY += height
  }

  const ringTotal = ringRows.reduce((s, r) => s + defaultRowHeight(r), 0)
  const bodyHeight = contentBody + ringTotal
  return {
    headerHeight,
    width,
    minWidth: width,
    bodyHeight,
    height: headerHeight + bodyHeight,
    frames,
  }
}

/** Convert DiagramPropertyRow list into NodeRows (no sm-ring). */
export function propertyRowsToNodeRows(
  rows: DiagramPropertyRow[],
  ownerType?: string
): NodeRow[] {
  const outputColor = ownerType
    ? resolvePinColorFromType(ownerType) ?? undefined
    : undefined
  return rows.map((row) => {
    if (row.pinId === 'output') {
      return {
        kind: 'output' as const,
        pinId: 'output' as const,
        label: row.text,
        pinColor: outputColor,
      }
    }
    if (row.key === 'portal' || (row.pinId && isVirtualOverviewPinId(row.pinId))) {
      if (!row.pinId) return { kind: 'field' as const, label: row.text }
      return {
        kind: 'portal' as const,
        pinId: row.pinId,
        label: row.text,
        pinColor: resolvePinColorFromType('animAnimNode_Base') ?? undefined,
      }
    }
    if (row.pinId) {
      const pinColor = ownerType
        ? getInputPinColor(ownerType, row.pinId) ?? undefined
        : undefined
      return { kind: 'input' as const, pinId: row.pinId, label: row.text, pinColor }
    }
    return { kind: 'field' as const, label: row.text }
  })
}

function makeOutputRow(nodeType: string, label = 'out'): NodeRow {
  return {
    kind: 'output',
    pinId: 'output',
    label,
    pinColor: resolvePinColorFromType(nodeType) ?? undefined,
  }
}

/** Ensure an output row exists (typed nodes / transitions often omit it in property lists). */
function withOutputRow(nodeType: string, rows: NodeRow[]): NodeRow[] {
  if (rows.some((r) => r.kind === 'output')) return rows
  return [makeOutputRow(nodeType), ...rows]
}

function getHandleForNode(
  node: RenderNode,
  handlesRegistry?: Map<string, AnimgraphNode>
): AnimgraphNode | undefined {
  if (!handlesRegistry) return undefined
  return handlesRegistry.get(node.data?.originalNodeId ?? node.id)
}

function getInputSlotCount(
  inputName: string,
  nodeType: string,
  handle: AnimgraphNode | undefined
): number {
  if (!handle) return 1
  const type = handle.Data?.$type ?? nodeType
  const handler = NodeDefinitionRegistry.getNodeInputHandler(type, inputName)
  try {
    return Math.max(handler.count(handle), 1)
  } catch {
    const value = handle.Data?.[inputName]
    if (Array.isArray(value)) return Math.max(value.length, 1)
    return 1
  }
}

type RowBuildCtx = {
  diagramData: RenderData,
  node: RenderNode,
}

type RowBuilder = (ctx: RowBuildCtx) => NodeRow[]

function buildCrossViewPortalPinRows({
  node,
  diagramData,
}: RowBuildCtx): NodeRow[] {
  return getCrossViewConnsForHost(diagramData, node)
    .map((conn) => {
      return {
        kind: 'portal' as const,
        pinId: makeCrossViewConnectionPortalPinId(conn),
        label: formatCrossViewPinRowText(conn, diagramData.handlesRegistry, diagramData.allNodes),
        pinColor: resolvePinColorFromType('animAnimNode_Base') ?? undefined,
      }
    })
}

function buildSmRows(ctx: RowBuildCtx): NodeRow[] {
  const { node, diagramData } = ctx
  const rows: NodeRow[] = [
    makeOutputRow('animAnimNode_StateMachine'),
    ...buildCrossViewPortalPinRows(ctx),
  ]
  const stateIds = node.metadata?.stateIds as string[] | undefined
  const stateCount =
    typeof stateIds?.length === 'number'
      ? stateIds.length
      : getStateNodesFromSm(node, diagramData.allNodes).length
  const panel = computeStateMachineDetailPanelSize(stateCount)
  rows.push(
    diagramData
      ? {
          kind: 'sm-ring',
          height: panel.height,
          presentation: buildStateMachineRingPresentation(node, diagramData),
        }
      : { kind: 'sm-ring', height: panel.height }
  )
  return rows
}

function buildStateRows({ node, diagramData }: RowBuildCtx): NodeRow[] {
  return propertyRowsToNodeRows(
    getStateOverviewPropertyRows(diagramData, node),
    node.type
  )
}

function buildTransitionDescriptionRows({ node, diagramData }: RowBuildCtx): NodeRow[] {
  return withOutputRow(
    node.type,
    propertyRowsToNodeRows(
      getTransitionDescriptionPropertyRows(node, diagramData.handlesRegistry),
      node.type
    )
  )
}

function buildConditionalEntryDescriptionRows({
  node,
  diagramData,
}: RowBuildCtx): NodeRow[] {
  return withOutputRow(
    node.type,
    propertyRowsToNodeRows(
      getConditionalEntryDescriptionPropertyRows(node, diagramData.handlesRegistry),
      node.type
    )
  )
}

function buildTypedDataRows({ node, diagramData }: RowBuildCtx): NodeRow[] {
  return withOutputRow(
    node.type,
    propertyRowsToNodeRows(
      getTypedDataPropertyRows(node, diagramData.handlesRegistry),
      node.type
    )
  )
}

/** Overview wrappers share description field text, but never expose sockets. */
function propertyRowsAsFields(rows: DiagramPropertyRow[]): NodeRow[] {
  return rows.map((row) => ({ kind: 'field' as const, label: row.text }))
}

function buildTransitionWrapperRows({ node, diagramData }: RowBuildCtx): NodeRow[] {
  return propertyRowsAsFields(
    getTransitionDescriptionPropertyRows(node, diagramData.handlesRegistry)
  )
}

function buildConditionalEntryWrapperRows({ node, diagramData }: RowBuildCtx): NodeRow[] {
  return propertyRowsAsFields(
    getConditionalEntryDescriptionPropertyRows(node, diagramData.handlesRegistry)
  )
}

function buildEmptyRows(): NodeRow[] {
  return []
}

function buildNoteRows({ node }: RowBuildCtx): NodeRow[] {
  const width = Math.max(node.size?.width ?? DIAGRAM_FRAME_DEFAULT_WIDTH, 80)
  return [
    {
      kind: 'note',
      label: readDiagramNoteText(node).trim(),
      height: noteFooterHeight(node, width),
    },
  ]
}

function buildDefaultStackedRows({ node, diagramData }: RowBuildCtx): NodeRow[] {
  const handle = getHandleForNode(node, diagramData.handlesRegistry)
  const rows: NodeRow[] = [makeOutputRow(node.type)]
  for (const inputName of NodeDefinitionRegistry.getInputFields(node.type)) {
    const slots = getInputSlotCount(inputName, node.type, handle)
    for (let i = 0; i < slots; i++) {
      const pinId = `${inputName}[${i}]`
      rows.push({
        kind: 'input',
        pinId,
        label: slots > 1 ? `${inputName}[${i}]` : inputName,
      })
    }
  }
  if (node.description?.trim()) {
    rows.push({ kind: 'field', label: node.description.trim() })
  }
  return rows
}

const ROW_BUILDERS_BY_TYPE: Record<string, RowBuilder> = {
  animAnimNode_StateMachine: buildSmRows,
  animAnimNode_StateMachineDiagram: buildSmRows,
  animAnimNode_State: buildStateRows,
  [ANIM_NODE_TYPE_STATE_FROZEN]: buildStateRows,
  [TRANSITION_DESCRIPTION_TYPE]: buildTransitionDescriptionRows,
  [CONDITIONAL_ENTRY_TYPE]: buildConditionalEntryDescriptionRows,
  [DIAGRAM_TRANSITION_WRAPPER_TYPE]: buildTransitionWrapperRows,
  [DIAGRAM_CONDITIONAL_ENTRY_WRAPPER_TYPE]: buildConditionalEntryWrapperRows,
  [DIAGRAM_NODE_TYPE_PORTAL]: buildEmptyRows,
  [DIAGRAM_NODE_TYPE_NOTE]: buildNoteRows,
  PropertyGroup: buildEmptyRows,
}

for (const diagramNodeType of TYPED_DATA_BODY_DIAGRAM_NODE_TYPES_SET) {
  ROW_BUILDERS_BY_TYPE[diagramNodeType] = buildTypedDataRows
}

/** Build row list for any diagram node (dispatcher). */
export function buildNodeRows(
  diagramData: RenderData,
  node: RenderNode,
): NodeRow[] {
  const ctx: RowBuildCtx = { diagramData, node, }
  const byType = ROW_BUILDERS_BY_TYPE[node.type]
  if (byType) return byType(ctx)
  if (isDiagramFrameNode(node) || node.isGroup) return buildEmptyRows()
  return buildDefaultStackedRows(ctx)
}

export function layoutOptionsForNode(node: RenderNode): LayoutNodeRowsOptions {
  if (isDiagramNoteNode(node)) {
    return {
      width: Math.max(node.size?.width ?? DIAGRAM_FRAME_DEFAULT_WIDTH, 80),
      minBodyHeight: NOTE_FOOTER_MIN_HEIGHT,
      mode: 'overview',
    }
  }
  if (isStateMachineDiagramRoot(node)) {
    return {
      width: STATE_OVERVIEW_WIDTH,
      // SM pin block is exactly n×line + pad (no overview min body).
      minBodyHeight: 0,
      mode: 'overview',
    }
  }
  if (ANIM_NODE_STATE_TYPE_SET.has(node.type)) {
    return {
      width: STATE_OVERVIEW_WIDTH,
      minBodyHeight: STATE_OVERVIEW_BODY_HEIGHT,
      mode: 'overview',
    }
  }
  if (
    isTransitionDescriptionNode(node) ||
    isConditionalEntryDescriptionNode(node) ||
    isTypedDataBodyDiagramNode(node) ||
    isSmInputChainOverviewLeaf(node)
  ) {
    return {
      width: SM_INPUT_CHAIN_OVERVIEW_WIDTH,
      minBodyHeight: SM_INPUT_CHAIN_OVERVIEW_BODY_HEIGHT,
      mode: 'overview',
    }
  }
  return {
    width: Math.max(node.size?.width ?? 120, 120),
    nodeHeight: Math.max(node.size?.height ?? 80, 80),
    mode: 'stacked',
  }
}

const HEADER_TITLE_INSET = 5
const HEADER_TYPE_FONT_SIZE = 10
const HEADER_ID_FONT_SIZE = 12
const STACKED_WIDTH_FLOOR = 120

function truncateChromeLabel(text: string, maxLen = 50): string {
  return text.length > maxLen ? `${text.slice(0, maxLen)}...` : text
}

/** Max single-line row label width + horizontal pads. */
function measureRowsContentWidth(rows: NodeRow[]): number {
  let maxW = 0
  const pad = ROW_TEXT_HORIZONTAL_PAD
  for (const row of rows) {
    if (
      row.kind === 'multiline' ||
      row.kind === 'note' ||
      row.kind === 'sm-ring' ||
      row.kind === 'spacer'
    ) {
      continue
    }
    const textW = measureDiagramTextWidth(row.label, PROPERTY_ROW_FONT_SIZE)
    maxW = Math.max(maxW, textW + pad * 2)
  }
  return maxW
}

function measureHeaderContentWidth(node: RenderNode): number {
  const nodeId = node.id || 'Unknown'
  const nodeType = node.type || 'Unknown'
  const typeLabel = truncateChromeLabel(nodeType)
  const idLabel = truncateChromeLabel(nodeId)
  const typeWidth = measureDiagramTextWidth(typeLabel, HEADER_TYPE_FONT_SIZE)
  const idWidth = measureDiagramTextWidth(`▣ ${idLabel}`, HEADER_ID_FONT_SIZE)
  const titleReserve = nodeShowsOpenScope(node)
    ? NODE_OPEN_SCOPE_BTN_SIZE + 12
    : 10
  return Math.max(typeWidth, idWidth) + HEADER_TITLE_INSET + titleReserve
}

function widthFloorForNode(
  node: RenderNode,
  allNodes?: Map<string, RenderNode>
): number {
  if (isDiagramNoteNode(node)) {
    return Math.max(node.size?.width ?? DIAGRAM_FRAME_DEFAULT_WIDTH, 80)
  }
  if (isStateMachineDiagramRoot(node)) {
    const stateIds = node.metadata?.stateIds as string[] | undefined
    const stateCount =
      typeof stateIds?.length === 'number'
        ? stateIds.length
        : getStateNodesFromSm(node, allNodes).length
    const panel = computeStateMachineDetailPanelSize(stateCount)
    return Math.max(panel.width, STATE_OVERVIEW_WIDTH)
  }
  if (ANIM_NODE_STATE_TYPE_SET.has(node.type)) return STATE_OVERVIEW_WIDTH
  if (
    isTransitionDescriptionNode(node) ||
    isConditionalEntryDescriptionNode(node) ||
    isTypedDataBodyDiagramNode(node) ||
    isSmInputChainOverviewLeaf(node)
  ) {
    return SM_INPUT_CHAIN_OVERVIEW_WIDTH
  }
  return Math.max(node.size?.width ?? STACKED_WIDTH_FLOOR, STACKED_WIDTH_FLOOR)
}

function applyPreferredWidth(
  layout: NodeRowLayout,
  node: RenderNode,
  rows: NodeRow[],
  allNodes?: Map<string, RenderNode>
): NodeRowLayout {
  const floor = widthFloorForNode(node, allNodes)
  const measuredRows = measureRowsContentWidth(rows)
  const measuredHeader = measureHeaderContentWidth(node)
  const contentNeed = Math.max(floor, measuredRows, measuredHeader)
  const capped =
    isStateMachineDiagramRoot(node)
      ? contentNeed
      : Math.min(NODE_CONTENT_MAX_WIDTH, contentNeed)
  return {
    ...layout,
    minWidth: floor,
    width: Math.max(capped, floor),
  }
}

/** Full layout for a node (rows + size). */
export function layoutNodeBody(
  node: RenderNode,
  diagramData: RenderData,
): NodeRowLayout {
  const rows = buildNodeRows(diagramData, node)
  const opts = layoutOptionsForNode(node)
  const layout = layoutNodeRows(rows, opts)
  return applyPreferredWidth(layout, node, rows, diagramData.allNodes)
}

/** Pins derived from layout frames (property-row / row-composed nodes). */
export function pinsFromRowLayout(
  layout: NodeRowLayout,
  _nodeWidth: number
): NodePinDesc[] {
  const height = layout.height
  const pins: NodePinDesc[] = []
  for (const frame of layout.frames) {
    if (!frame.pinId || frame.pinLocalY == null || !frame.pinSide) continue
    const label =
      frame.row.kind === 'output'
        ? 'out'
        : frame.row.kind === 'input' || frame.row.kind === 'portal'
          ? frame.row.label
          : String(frame.row.kind)
    const pinColor =
      frame.row.kind === 'output' || frame.row.kind === 'input' || frame.row.kind === 'portal'
        ? frame.row.pinColor
        : undefined
    pins.push({
      pinId: frame.pinId,
      side: frame.pinSide,
      label,
      localY: Math.min(height - 9, frame.pinLocalY),
      hideLabel: true,
      shape: frame.pinShape ?? 'circle',
      pinColor,
    })
  }
  return pins
}

/** Whether this node uses the row-composition body path. */
export function nodeUsesRowComposition(node: RenderNode): boolean {
  if (isDiagramNoteNode(node)) return true
  if (isDiagramOverviewLeaf(node)) return true
  if (isTransitionDescriptionNode(node)) return true
  if (isConditionalEntryDescriptionNode(node)) return true
  if (isTypedDataBodyDiagramNode(node)) return true
  if (isDiagramPortalNode(node)) return false
  if (isDiagramFrameNode(node) || node.isGroup || node.type === 'PropertyGroup') return false
  return true
}

/** Overview-style nodes keep open-scope; stacked default does not. */
export function nodeShowsOpenScope(node: RenderNode): boolean {
  return isDiagramOverviewLeaf(node)
}

/** Convenience for size APIs. */
export function computeNodeSizeFromRows(
  node: RenderNode,
  diagramData: RenderData,
): { width: number; height: number } {
  const layout = layoutNodeBody(node, diagramData)
  return { width: layout.width, height: layout.height }
}
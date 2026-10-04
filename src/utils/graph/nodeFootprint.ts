/**
 * Single footprint API for diagram nodes — shared by parser layout, add-node, and paint.
 * Source of truth for row-composed bodies: NodeRowModel.layoutNodeBody / computeNodeSizeFromRows.
 *
 * Per-node-kind strategies decide how content (rows, description, note text, …) maps to size.
 * Height is the primary axis content usually changes; width is preserved or taken from content min.
 *
 * Do not import this from DiagramConversion (cycle: NodeRowModel → DiagramConversion).
 */

import type { AnimgraphNode } from './animgraphTypes'
import type { DiagramConnection, RenderData, RenderNode } from './diagramTypes'
import {
  isConditionalEntryDescriptionNode,
  isDiagramOverviewLeaf,
  isStateMachineDiagramRoot,
  isTransitionDescriptionNode,
} from './DiagramConversion'
import { isDiagramNoteNode } from './diagramFrameNodes'
import { DEFAULT_CHILD_SLOT, getChildSlot } from './nodeChildSlots'
import {
  computeNodeSizeFromRows,
  nodeUsesRowComposition,
  type NodeRowLayout
} from './NodeRowModel'
import { isTypedDataBodyDiagramNode } from './typedDataBodyDiagramNodeTypes'

export type NodeFootprint = { width: number; height: number }

export type FootprintCtx = {
  diagramData: RenderData,
}

/**
 * Footprint policy for a diagram node kind.
 * `resolve` measures preferred content size; `autoApply` gates writing `node.size`.
 */
export type NodeFootprintStrategy = {
  resolve(node: RenderNode, ctx: FootprintCtx): NodeFootprint
  /** When true, applyNodeFootprint may overwrite node.size / bounds. */
  autoApply: boolean
}

/** Row layout + chrome size. Paint uses stored size; writers must keep node.size in sync. */
export type RowComposedChrome = {
  layout: NodeRowLayout
  width: number
  height: number
}

function storedFootprint(node: RenderNode): NodeFootprint {
  return {
    width: node.size?.width ?? 120,
    height: node.size?.height ?? 80,
  }
}

function hasVisibleBodyChildren(node: RenderNode): boolean {
  return getChildSlot(node, DEFAULT_CHILD_SLOT).some((child) => child.visible !== false)
}

/** Row-composed content size; optionally keep grown container when children sit in-card. */
function rowContentStrategy(options?: { fitVisibleChildren?: boolean }): NodeFootprintStrategy {
  return {
    autoApply: true,
    resolve(node, ctx) {
      const rows = computeNodeSizeFromRows(
        node,
        ctx.diagramData,
      )
      if (options?.fitVisibleChildren && hasVisibleBodyChildren(node)) {
        const stored = storedFootprint(node)
        return {
          width: Math.max(rows.width, stored.width),
          // Content (description/rows) mainly grows height; width floors at content min.
          height: Math.max(rows.height, stored.height),
        }
      }
      return rows
    },
  }
}

/**
 * Default: may measure row composition for layout helpers, but do not auto-overwrite
 * stored size (ELK / manual / PropertyGroup containers).
 */
const defaultFootprintStrategy: NodeFootprintStrategy = {
  autoApply: false,
  resolve(node, ctx) {
    if (nodeUsesRowComposition(node)) {
      return computeNodeSizeFromRows(
        node,
        ctx.diagramData,
      )
    }
    return storedFootprint(node)
  },
}

const rowAuto = rowContentStrategy()
const rowAutoFitChildren = rowContentStrategy({ fitVisibleChildren: true })

/** Pick footprint strategy by diagram node kind; unknown kinds use default. */
export function resolveFootprintStrategy(node: RenderNode): NodeFootprintStrategy {
  if (isDiagramNoteNode(node)) return rowAutoFitChildren
  if (isStateMachineDiagramRoot(node)) return rowAuto
  if (isDiagramOverviewLeaf(node)) return rowAuto
  if (isTransitionDescriptionNode(node)) return rowAuto
  if (isConditionalEntryDescriptionNode(node)) return rowAuto
  if (isTypedDataBodyDiagramNode(node)) return rowAutoFitChildren
  return defaultFootprintStrategy
}

/** Whether applyNodeFootprint will write size for this node. */
export function nodeFootprintAutoApplies(node: RenderNode): boolean {
  return resolveFootprintStrategy(node).autoApply
}

/**
 * Overview / SM cards keep a compact row footprint (children are scope-only).
 * Typed-data nodes with in-card children must keep the larger fitted size.
 */
export function nodeFootprintMustFitChildren(node: RenderNode): boolean {
  if (isDiagramOverviewLeaf(node) || isStateMachineDiagramRoot(node)) return false
  if (!nodeFootprintAutoApplies(node)) return false
  return hasVisibleBodyChildren(node)
}

/** Preferred content footprint from the node's strategy (does not write). */
export function resolveNodeFootprint(
  diagramData: RenderData,
  node: RenderNode,
): NodeFootprint {
  return resolveFootprintStrategy(node).resolve(node, {
    diagramData,
  })
}

/**
 * Painted chrome size = stored node.size (strict).
 * Call applyNodeFootprint / diagramNodeEdits before paint when content changes size.
 */
export function resolvePaintFootprint(
  _node: RenderNode,
  stored: NodeFootprint,
  _handlesRegistry?: Map<string, AnimgraphNode>,
  _allNodes?: Map<string, RenderNode>,
  _connections?: DiagramConnection[]
): NodeFootprint {
  return stored
}

/**
 * Write strategy footprint into node.size / bounds when autoApply.
 * Returns the size that applies (stored if strategy does not auto-apply).
 */
export function applyNodeFootprint(
  node: RenderNode,
  diagramData: RenderData,
): NodeFootprint {
  const strategy = resolveFootprintStrategy(node)
  const ctx: FootprintCtx = { diagramData }
  if (!strategy.autoApply) {
    return storedFootprint(node)
  }
  const size = strategy.resolve(node, ctx)
  node.size = { width: size.width, height: size.height }
  if (node.position) {
    node.bounds = {
      x: node.position.x,
      y: node.position.y,
      width: size.width,
      height: size.height,
    }
  }
  return size
}

/**
 * Re-apply auto footprints for all positioned nodes (post-convert / post-portal).
 */
export function applyDiagramNodeFootprints(diagramData: RenderData): void {
  for (const node of diagramData.allNodes.values()) {
    applyNodeFootprint(node, diagramData)
  }
}

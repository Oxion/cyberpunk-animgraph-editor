import {
  runElkLayeredCompoundLayout,
  runElkLayeredLayout,
  type ElkDirection,
  type ElkLayeredEdgeInput,
} from './ElkGraphLayout'
import { runColaFlowLayout } from './ColaFlowLayout'
import { runTidyTreeLayout } from './TidyTreeLayout'

export type DirectChildrenLayoutMode = 'tidy-tree' | 'elk-compound' | 'cola-flow'

export interface DirectChildrenLayoutContext {
  parentId: string
  parentType?: string
}

export interface DirectChildrenLayoutNode {
  id: string
  width: number
  height: number
}

export interface DirectChildrenLayoutInput {
  nodes: DirectChildrenLayoutNode[]
  edges: ElkLayeredEdgeInput[]
  direction?: ElkDirection
  nodeNodeSpacing?: number
  layerSpacing?: number
  /** Parent render node — used for layout error diagnostics. */
  layoutContext?: DirectChildrenLayoutContext
}

/** Virtual compound input box (not a diagram node). Local to the layout parent. */
export interface LayoutDebugContainer {
  id: string
  x: number
  y: number
  width: number
  height: number
  role: 'input' | 'hub'
  innerHubId?: string
  depth: number
}

export interface DirectChildrenLayoutOutput {
  positions: Map<string, { x: number; y: number }>
  debugContainers?: LayoutDebugContainer[]
}

export function throwDirectChildrenLayoutError(
  context: DirectChildrenLayoutContext | undefined,
  reason: string,
  detail?: string
): never {
  const parentLabel = context
    ? `${context.parentId}${context.parentType ? ` (${context.parentType})` : ''}`
    : 'unknown parent'
  const suffix = detail ? ` — ${detail}` : ''
  const message = `[layout error] ${parentLabel}: ${reason}${suffix}`
  console.error(message)
  throw new Error(message)
}

function wrapLayoutPositions(
  positions: Map<string, { x: number; y: number }> | null
): DirectChildrenLayoutOutput | null {
  if (!positions) return null
  return { positions }
}

/** Layout direct render children (flat boxes + uplifted edges). */
export async function runDirectChildrenLayout(
  mode: DirectChildrenLayoutMode,
  input: DirectChildrenLayoutInput
): Promise<DirectChildrenLayoutOutput | null> {
  if (input.nodes.length === 0) {
    return { positions: new Map() }
  }

  const direction = input.direction ?? 'RIGHT'

  if (input.edges.length === 0) {
    return wrapLayoutPositions(
      await runElkLayeredLayout({
        nodes: input.nodes,
        edges: [],
        direction,
        nodeNodeSpacing: input.nodeNodeSpacing,
        layerSpacing: input.layerSpacing,
      })
    )
  }

  if (mode === 'cola-flow') {
    return runColaFlowLayout(input)
  }

  if (mode === 'tidy-tree') {
    return runTidyTreeLayout(input)
  }

  return wrapLayoutPositions(
    await runElkLayeredCompoundLayout({
      nodes: input.nodes,
      edges: input.edges,
      direction: 'RIGHT',
      nodeNodeSpacing: input.nodeNodeSpacing,
      layerSpacing: input.layerSpacing,
    })
  )
}

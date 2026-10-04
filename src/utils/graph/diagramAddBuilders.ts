/**
 * Diagram-type builders for Add Node — produce a ready RenderNode (sized, positioned, metadata).
 * Placement into parent/root is done by applyAddNodePlan, not here.
 */

import type { RenderData, RenderNode } from './diagramTypes'
import { getWorldPosition } from './DiagramGeometry'
import {
  DIAGRAM_CONDITIONAL_ENTRY_WRAPPER_TYPE,
  DIAGRAM_TRANSITION_WRAPPER_TYPE,
} from './DiagramConversion'
import {
  DIAGRAM_NODE_TYPE_GROUP,
  DIAGRAM_NODE_TYPE_NOTE,
  DIAGRAM_NODE_TYPE_PROPERTY_GROUP,
} from './DiagramNodeDefinition'
import {
  DIAGRAM_FRAME_DEFAULT_HEIGHT,
  DIAGRAM_FRAME_DEFAULT_WIDTH,
} from './diagramFrameNodes'
import type { CanAddNodeResult } from './nodeAddRules'
import {
  computeSizeForNewNodeType,
  createMinimalRenderNode,
} from './nodeAddBootstrap'

export type DiagramAddBuilderInput = {
  id: string
  diagramNodeType: string
  /** Resolved animgraph node type when attach is present; otherwise same as diagramNodeType. */
  animgraphNodeType: string
  gate: Extract<CanAddNodeResult, { ok: true }>
  viewportCenter: { x: number; y: number }
  diagramData: RenderData
  preferredSlotName?: string
  /** Animgraph root handle id for wrappers (Description / Entry). */
  rootHandleId?: string
  /** When set, skip viewport-centered placement (paste / explicit layout). */
  localPosition?: { x: number; y: number }
}

export type DiagramAddBuilder = (input: DiagramAddBuilderInput) => RenderNode

function positionInPlace(
  input: DiagramAddBuilderInput,
  size: { width: number; height: number }
): { x: number; y: number } {
  if (input.localPosition) {
    return { ...input.localPosition }
  }
  const world = {
    x: input.viewportCenter.x - size.width / 2,
    y: input.viewportCenter.y - size.height / 2,
  }
  const parent = input.gate.place.diagramTarget
  if (!parent) return world
  const parentWorld = getWorldPosition(parent)
  if (!parentWorld) return world
  return { x: world.x - parentWorld.x, y: world.y - parentWorld.y }
}

function sizedNode(
  input: DiagramAddBuilderInput,
  extras: {
    metadata?: Record<string, unknown>
    data?: Record<string, unknown>
    isContainer?: boolean
    size?: { width: number; height: number }
  } = {}
): RenderNode {
  const draft = createMinimalRenderNode({
    id: input.id,
    type: input.diagramNodeType,
    size: extras.size ?? { width: 240, height: 80 },
    metadata: extras.metadata ?? {},
    ...(extras.data ? { data: extras.data } : {}),
  })
  
  const size =
    extras.size ??
    computeSizeForNewNodeType(input.diagramData, draft)
  return createMinimalRenderNode({
    id: input.id,
    type: input.diagramNodeType,
    size,
    position: positionInPlace(input, size),
    metadata: extras.metadata ?? {},
    ...(extras.data ? { data: extras.data } : {}),
    isContainer: extras.isContainer ?? false,
  })
}

const buildDiagramFrame: DiagramAddBuilder = (input) =>
  sizedNode(input, {
    isContainer: true,
    data: {},
    size: {
      width: DIAGRAM_FRAME_DEFAULT_WIDTH,
      height: DIAGRAM_FRAME_DEFAULT_HEIGHT,
    },
  })

const buildPropertyGroup: DiagramAddBuilder = (input) => {
  const slotName = input.gate.slot?.name ?? input.preferredSlotName
  const node = sizedNode(input, {
    metadata: slotName
      ? {
          propertyName: slotName,
        }
      : {},
    isContainer: true,
  })
  if (slotName) {
    node.isGroup = true
    node.groupType = 'property'
  }
  return node
}

function buildWrapper(input: DiagramAddBuilderInput): RenderNode {
  const rootHandleId = input.rootHandleId ?? input.id
  const node = sizedNode(input, {
    data: { originalNodeId: rootHandleId },
    isContainer: true,
  })
  node.layout = 'horizontal'
  return node
}

const buildTransitionWrapper: DiagramAddBuilder = (input) => buildWrapper(input)

const buildConditionalEntryWrapper: DiagramAddBuilder = (input) => buildWrapper(input)

const buildState: DiagramAddBuilder = (input) =>
  sizedNode(input, {
    isContainer: true,
  })

const buildDefault: DiagramAddBuilder = (input) => sizedNode(input)

const buildersByDiagramNodeType: Record<string, DiagramAddBuilder> = {
  [DIAGRAM_NODE_TYPE_PROPERTY_GROUP]: buildPropertyGroup,
  [DIAGRAM_NODE_TYPE_GROUP]: buildDiagramFrame,
  [DIAGRAM_NODE_TYPE_NOTE]: buildDiagramFrame,
  [DIAGRAM_TRANSITION_WRAPPER_TYPE]: buildTransitionWrapper,
  [DIAGRAM_CONDITIONAL_ENTRY_WRAPPER_TYPE]: buildConditionalEntryWrapper,
  animAnimNode_State: buildState,
}

/** Prefer animgraph node type when diagram type is a generic chrome that still needs State builder. */
export function resolveDiagramBuilder(
  diagramNodeType: string,
  animgraphNodeType: string
): DiagramAddBuilder {
  return (
    buildersByDiagramNodeType[diagramNodeType] ??
    buildersByDiagramNodeType[animgraphNodeType] ??
    buildDefault
  )
}

export function buildDiagramNode(input: DiagramAddBuilderInput): RenderNode {
  return resolveDiagramBuilder(input.diagramNodeType, input.animgraphNodeType)(input)
}
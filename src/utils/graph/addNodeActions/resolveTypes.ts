import type { RenderNode } from '../diagramTypes'
import type { CanAddNodeResult, NodeAddRulesContext } from '../nodeAddRules'
import type { AddNodeAction } from './types'

export type DiagramAddActionsResolverInput = {
  id: string
  gate: Extract<CanAddNodeResult, { ok: true }>
  diagramNodeType: string
  animgraphNodeType: string
  diagramParent: RenderNode | null
  parentSlot: string
  ctx: NodeAddRulesContext
  allocId: () => string
}

export type DiagramAddActionsResolveResult = {
  actions: AddNodeAction[]
  /** For wrappers: animgraph root handle id (Description / Entry). */
  rootHandleId?: string
}

export type DiagramAddActionsResolver = (
  input: DiagramAddActionsResolverInput
) => DiagramAddActionsResolveResult

import {
  ANIM_NODE_TYPE_CONDITIONAL_ENTRY,
  ANIM_NODE_TYPE_STATE,
  ANIM_NODE_TYPE_TRANSITION_DESCRIPTION,
} from '../../animNodeTypes'
import {
  DIAGRAM_CONDITIONAL_ENTRY_WRAPPER_TYPE,
  DIAGRAM_TRANSITION_WRAPPER_TYPE,
} from '../../diagramNodeTypes'
import type {
  DiagramAddActionsResolveResult,
  DiagramAddActionsResolver,
  DiagramAddActionsResolverInput,
} from '../resolveTypes'
import { resolveDefaultActions } from './default'
import { resolveStateActions } from './state'
import {
  resolveConditionalEntryWrapperActions,
  resolveTransitionWrapperActions,
  resolveWrapperRootBodyActions,
} from './wrappers'

export { resolveDefaultActions } from './default'
export { resolveStateActions } from './state'
export {
  resolveConditionalEntryWrapperActions,
  resolveTransitionWrapperActions,
  resolveWrapperRootBodyActions,
} from './wrappers'

export const resolversByDiagramNodeType: Record<string, DiagramAddActionsResolver> = {
  [DIAGRAM_TRANSITION_WRAPPER_TYPE]: resolveTransitionWrapperActions,
  [DIAGRAM_CONDITIONAL_ENTRY_WRAPPER_TYPE]: resolveConditionalEntryWrapperActions,
  [ANIM_NODE_TYPE_TRANSITION_DESCRIPTION]: resolveWrapperRootBodyActions,
  [ANIM_NODE_TYPE_CONDITIONAL_ENTRY]: resolveWrapperRootBodyActions,
  [ANIM_NODE_TYPE_STATE]: resolveStateActions,
}
export function resolveAddNodeActions(
  input: DiagramAddActionsResolverInput
): DiagramAddActionsResolveResult {
  const resolver =
    resolversByDiagramNodeType[input.diagramNodeType] ?? resolveDefaultActions
  return resolver(input)
}

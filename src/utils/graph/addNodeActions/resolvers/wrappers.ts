import {
  ANIM_NODE_TYPE_CONDITIONAL_ENTRY,
  ANIM_NODE_TYPE_TRANSITION_DESCRIPTION,
} from '../../animNodeTypes'
import { DEFAULT_CHILD_SLOT } from '../../nodeChildSlots'
import {
  compileAttachWithRequiredChildren,
  compileRequiredChildrenActions,
  placeInParentAction,
  pushAnimgraphHandleActions,
  registerFloatingHandleAction,
} from '../compile'
import type {  DiagramAddActionsResolveResult,
  DiagramAddActionsResolver,
  DiagramAddActionsResolverInput,
} from '../resolveTypes'
import type { AddNodeAction, EnsureDiagramChildAction } from '../types'

/** Fold Step A (root Description/Entry + attach to PG) into wrapper creation. */
function resolveWrapperFoldRootActions(
  input: DiagramAddActionsResolverInput,
  rootDiagramNodeType: string,
  rootIdSuffix: string
): DiagramAddActionsResolveResult {
  const rootHandleId = `${input.id}${rootIdSuffix}`
  const ensureRoot: EnsureDiagramChildAction = {
    kind: 'ensure-diagram-child',
    id: rootHandleId,
    diagramNodeType: rootDiagramNodeType,
    parent: { kind: 'primary', parentSlot: DEFAULT_CHILD_SLOT },
  }
  const attach = input.gate.animgraphAttach
  if (attach) {
    return {
      rootHandleId,
      actions: [
        placeInParentAction(input, 'append-bottom-grow'),
        ensureRoot,
        ...compileAttachWithRequiredChildren(
          input,
          rootHandleId,
          rootDiagramNodeType,
          attach,
          rootHandleId
        ),
      ],
    }
  }

  // Non-strict / pin: wrapper box + floating Description/Entry handle (not in parent Data).
  const actions: AddNodeAction[] = [
    placeInParentAction(input, 'append-bottom-grow'),
    ensureRoot,
  ]
  const animType = input.gate.animgraphNodeType
  if (animType) {
    actions.push(registerFloatingHandleAction(rootHandleId, animType))
    actions.push(
      ...compileRequiredChildrenActions(
        input,
        rootHandleId,
        animType,
        rootHandleId,
        false
      )
    )
  }
  return { rootHandleId, actions }
}

export const resolveTransitionWrapperActions: DiagramAddActionsResolver = (input) =>
  resolveWrapperFoldRootActions(input, ANIM_NODE_TYPE_TRANSITION_DESCRIPTION, '_description')

export const resolveConditionalEntryWrapperActions: DiagramAddActionsResolver = (input) =>
  resolveWrapperFoldRootActions(input, ANIM_NODE_TYPE_CONDITIONAL_ENTRY, '_entry')

/**
 * Standalone add of Description / Entry under an existing wrapper (Step A only).
 * Relies on gate.animgraphAttach when the profile provides PG slot attach.
 */
export function resolveWrapperRootBodyActions(
  input: DiagramAddActionsResolverInput
): DiagramAddActionsResolveResult {
  const actions: AddNodeAction[] = [placeInParentAction(input)]
  pushAnimgraphHandleActions(actions, input, input.id, input.id)
  return { actions }
}

import { NodeDefinitionRegistry } from '../../NodeDefinition'
import type { AnimgraphAttachContext } from '../nodeAddRules'
import { resolveChildSlots } from '../nodeAddRules'
import { resolvePlaceInParentMode } from './placeMode'
import type { DiagramAddActionsResolverInput } from './resolveTypes'
import type {
  AddNodeAction,
  AttachHandleAction,
  PlaceInParentAction,
  PlaceInParentMode,
  RegisterFloatingHandleAction,
} from './types'

export function attachHandleAction(
  handleId: string,
  animgraphNodeType: string,
  attach: AnimgraphAttachContext
): AttachHandleAction {
  return { kind: 'attach-handle', handleId, animgraphNodeType, attach }
}

/**
 * Diagram + handle actions for NodeDefinition.requireTypes
 * (e.g. State.nodes → PropertyGroup + Output). Parent handle must already exist.
 * @param initInAnimgraph — false under floating parent (Data ref only, no nodesToInit).
 */
export function compileRequiredChildrenActions(
  input: DiagramAddActionsResolverInput,
  parentHandleId: string,
  animgraphNodeType: string,
  ownerDiagramId: string,
  initInAnimgraph = true
): AddNodeAction[] {
  const actions: AddNodeAction[] = []
  const slots = resolveChildSlots(
    NodeDefinitionRegistry.getNodeDefinition(animgraphNodeType),
    animgraphNodeType
  )
  for (const slot of slots) {
    const required = slot.requireTypes
    if (!required || required.length === 0) continue

    for (const requiredType of required) {
      const childId = input.allocId()
      actions.push({
        kind: 'ensure-property-group',
        ownerDiagramId,
        slotName: slot.name,
      })
      actions.push({
        kind: 'ensure-diagram-child',
        id: childId,
        diagramNodeType: requiredType,
        parent: {
          kind: 'property-group',
          ownerDiagramId,
          slotName: slot.name,
        },
      })
      actions.push({
        kind: 'attach-handle-to',
        handleId: childId,
        animgraphNodeType: requiredType,
        parentHandleId,
        slotName: slot.name,
        ...(initInAnimgraph ? {} : { initInAnimgraph: false }),
      })
    }
  }
  return actions
}

/**
 * attach-handle + requireTypes bootstrap (e.g. State.nodes → PropertyGroup + Output).
 */
export function compileAttachWithRequiredChildren(
  input: DiagramAddActionsResolverInput,
  handleId: string,
  animgraphNodeType: string,
  attach: AnimgraphAttachContext,
  ownerDiagramId: string
): AddNodeAction[] {
  return [
    attachHandleAction(handleId, animgraphNodeType, attach),
    ...compileRequiredChildrenActions(
      input,
      handleId,
      animgraphNodeType,
      ownerDiagramId
    ),
  ]
}

export function placeInParentAction(
  input: DiagramAddActionsResolverInput,
  mode?: PlaceInParentMode
): PlaceInParentAction {
  return {
    kind: 'place-in-parent',
    mode: mode ?? resolvePlaceInParentMode(),
  }
}

export function registerFloatingHandleAction(
  handleId: string,
  animgraphNodeType: string
): RegisterFloatingHandleAction {
  return { kind: 'register-floating-handle', handleId, animgraphNodeType }
}

/** Strict list → attach; otherwise floating handle when gate has an animgraph type. */
export function pushAnimgraphHandleActions(
  actions: AddNodeAction[],
  input: DiagramAddActionsResolverInput,
  handleId: string,
  ownerDiagramId: string
): void {
  const attach = input.gate.animgraphAttach
  if (attach) {
    actions.push(
      ...compileAttachWithRequiredChildren(
        input,
        handleId,
        input.animgraphNodeType,
        attach,
        ownerDiagramId
      )
    )
    return
  }
  const animType = input.gate.animgraphNodeType
  if (!animType) return
  actions.push(registerFloatingHandleAction(handleId, animType))
  actions.push(
    ...compileRequiredChildrenActions(
      input,
      handleId,
      animType,
      ownerDiagramId,
      false
    )
  )
}

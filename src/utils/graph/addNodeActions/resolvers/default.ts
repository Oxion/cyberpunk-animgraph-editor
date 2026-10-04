import {
  placeInParentAction,
  pushAnimgraphHandleActions,
} from '../compile'
import type { DiagramAddActionsResolver } from '../resolveTypes'
import type { AddNodeAction } from '../types'

export const resolveDefaultActions: DiagramAddActionsResolver = (input) => {
  const actions: AddNodeAction[] = [placeInParentAction(input)]
  pushAnimgraphHandleActions(actions, input, input.id, input.id)
  return { actions }
}

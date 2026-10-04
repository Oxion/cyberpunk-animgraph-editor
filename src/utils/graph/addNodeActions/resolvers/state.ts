import {
  placeInParentAction,
  pushAnimgraphHandleActions,
} from '../compile'
import type { DiagramAddActionsResolver } from '../resolveTypes'

export const resolveStateActions: DiagramAddActionsResolver = (input) => {
  const actions = [placeInParentAction(input, 'append-bottom-grow')]
  pushAnimgraphHandleActions(actions, input, input.id, input.id)
  return { actions }
}

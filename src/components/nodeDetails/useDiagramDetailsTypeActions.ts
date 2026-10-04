import { computed, inject } from 'vue'
import {
  getDiagramDetailsActionDef,
  resolveDiagramDetailsActionIds,
  type DiagramDetailsActionId,
} from './actions'
import {
  nodeDetailsContextKey,
  type NodeDetailsContext,
} from '../../composables/useNodeDetailsContext'

export function useDiagramDetailsTypeActions() {
  const {
    selectedNode,
    selectedStateMachineRing,
    openSmRingFromSelection,
    canOpenStateAppliedLinks,
    openStateAppliedLinksFromSelection,
    moveSelectedSmStateByDelta,
    canMoveSmStateUp,
    canMoveSmStateDown,
    canLayoutSmStatesGroup,
    layoutSelectedSmStatesGroup,
  } = inject<NodeDetailsContext>(nodeDetailsContextKey)!

  function isTypeActionAvailable(id: DiagramDetailsActionId): boolean {
    switch (id) {
      case 'stateAppliedLinks':
        return canOpenStateAppliedLinks.value
      case 'openSmRing':
        return selectedStateMachineRing.value != null
      case 'smStateMoveUp':
      case 'smStateMoveDown':
        return canMoveSmStateUp.value || canMoveSmStateDown.value
      case 'smStatesGroupLayout':
        return canLayoutSmStatesGroup.value
    }
  }

  function runTypeAction(id: DiagramDetailsActionId): void {
    switch (id) {
      case 'stateAppliedLinks':
        openStateAppliedLinksFromSelection()
        return
      case 'openSmRing':
        openSmRingFromSelection()
        return
      case 'smStateMoveUp':
        moveSelectedSmStateByDelta(-1)
        return
      case 'smStateMoveDown':
        moveSelectedSmStateByDelta(1)
        return
      case 'smStatesGroupLayout':
        layoutSelectedSmStatesGroup()
    }
  }

  const visibleTypeActions = computed(() =>
    resolveDiagramDetailsActionIds(selectedNode.value?.type)
      .filter(isTypeActionAvailable)
      .map((id) => ({
        ...getDiagramDetailsActionDef(id),
        disabled:
          id === 'smStateMoveUp'
            ? !canMoveSmStateUp.value
            : id === 'smStateMoveDown'
              ? !canMoveSmStateDown.value
              : false,
      }))
  )

  return { visibleTypeActions, runTypeAction }
}

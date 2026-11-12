import type { AppCommandArgs } from '../core/commands/types'
import { moveInputNodesOnly } from '../composables/tools/moveResizeSession'
import { requireActiveDiagramId } from '../stores/graphProject'
import {
  selectedIncomingConnectionsRef,
  selectedNodeConnectionsComputed,
} from '../stores/graphSession'
import { getConnectionKey } from '../utils/graph/diagramModel'
import { Commands } from './ids'

export function arrangeInputsSelectAll() {
  const connections = selectedNodeConnectionsComputed.value
  if (!connections) return
  connections.incoming.forEach((conn) => {
    selectedIncomingConnectionsRef.value.add(getConnectionKey(conn))
  })
}

export function arrangeInputsDeselectAll() {
  selectedIncomingConnectionsRef.value.clear()
}

export function arrangeInputsToggle(args: AppCommandArgs<typeof Commands.arrangeInputs.toggle>) {
  if (args.checked) selectedIncomingConnectionsRef.value.add(args.key)
  else selectedIncomingConnectionsRef.value.delete(args.key)
}

export function arrangeInputsRun(args: AppCommandArgs<typeof Commands.arrangeInputs.run>) {
  moveInputNodesOnly(requireActiveDiagramId(), args.margin, args.spacing)
}

import type { AppCommandArgs } from '../core/commands/types'
import { requireActiveDiagramId } from '../stores/graphProject'
import { createConnection } from '../stores/graphWireRecord'
import { Commands } from './ids'

export function addConnectionCreate(args: AppCommandArgs<typeof Commands.addConnection.create>) {
  const result = createConnection(
    requireActiveDiagramId(),
    args.fromId,
    args.toId,
    args.pinName
  )
  if (!result.ok && result.message) alert(result.message)
}

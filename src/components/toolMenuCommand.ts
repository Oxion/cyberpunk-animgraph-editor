import type { AppCommandId } from '@/core/commands'
import type { AppToolId } from '@/core/tools'
import { Commands } from '@/app/commands/ids'

/** Menu shortcut display only — tools do not reference commands. */
export const toolMenuCommand: Partial<Record<AppToolId, AppCommandId>> = {
  move: Commands.grabMove.begin,
  resize: Commands.resize.begin,
  addNode: Commands.addNode.focus,
  addConnection: Commands.addConnection.focus,
}

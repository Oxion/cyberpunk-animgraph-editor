import './types'
import { registerAppCommandDefs } from './catalog'
import { registerAllAppCommandHandlers } from './registerHandlers'

export type * from './types'
export { Commands } from './ids'
export { copySelection } from './copySelection'
export { pasteNodes } from './pasteNodes'
export { deleteSelection } from './deleteSelection'
export { deselectAll } from './deselectAll'
export { selectChildren } from './selectChildren'

/** Register catalog defs and handlers. Call once at app startup. */
export function registerAppCommands(): void {
  registerAppCommandDefs()
  registerAllAppCommandHandlers()
}

import { registerAppCommandDefs } from "./defsCatalog"
import { registerAllAppCommandHandlers } from "./handlersCatalog"

export { Commands } from './ids'

/** Register catalog defs and handlers. Call once at app startup. */
export function registerAppCommands(): void {
  registerAppCommandDefs()
  registerAllAppCommandHandlers()
}
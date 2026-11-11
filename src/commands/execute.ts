import { commandEnabled } from '../stores/appContext'
import { getAppCommand } from './catalog'
import { getAppCommandHandler } from './handlers'
import type { AppCommandArgs, AppCommandId } from './types'

type ExecuteRest<K extends AppCommandId> = AppCommandArgs<K> extends undefined
  ? [] | [event?: KeyboardEvent]
  : [AppCommandArgs<K>]

/** Single public invoke path — gates on command `when`, then runs the handler. */
export function executeCommand<K extends AppCommandId>(id: K, ...rest: ExecuteRest<K>): void {
  if (!commandEnabled(id)) return
  const handler = getAppCommandHandler(id)
  if (!handler) {
    if (!getAppCommand(id).hidden) {
      console.warn(`[commands] No handler registered for "${id}"`)
    }
    return
  }
  ;(handler as (...args: unknown[]) => void)(...rest)
}

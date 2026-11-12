import { PredicateContext } from '@/core/when'
import { getAppCommand } from './catalog'
import { getAppCommandHandler } from './handlers'
import { commandEnabled } from './predicate'
import type { AppCommandArgs, AppCommandId } from './types'

export type ExecuteRest<K extends AppCommandId> = AppCommandArgs<K> extends undefined
  ? [] | [event?: KeyboardEvent]
  : [AppCommandArgs<K>]

/** Single public invoke path — gates on command `when`, then runs the handler. */
export function executeCommand<K extends AppCommandId>(id: K, ctx: PredicateContext, ...rest: ExecuteRest<K>): boolean {
  const command = getAppCommand(id)
  
  if (!commandEnabled(command, ctx)) return false
  
  const handler = getAppCommandHandler(id)
  if (!handler) {
    if (!command.hidden) {
      console.warn(`[commands] No handler registered for "${id}"`)
    }
    return false
  }

  ;(handler as (...args: unknown[]) => void)(...rest)
  
  return true
}

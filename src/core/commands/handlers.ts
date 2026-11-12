import type { AppCommandArgs, AppCommandId } from './types'

export type AppCommandHandler<K extends AppCommandId = AppCommandId> = AppCommandArgs<K> extends undefined
  ? (event?: KeyboardEvent) => void | Promise<void>
  : (args: AppCommandArgs<K>) => void | Promise<void>

export type AppCommandHandlers = { [K in AppCommandId]?: AppCommandHandler<K> }

const handlers: AppCommandHandlers = {}

export function registerAppCommandHandler<K extends AppCommandId>(
  id: K,
  handler: AppCommandHandler<K>
): void {
  handlers[id] = handler as AppCommandHandlers[K]
}

export function getAppCommandHandler<K extends AppCommandId>(id: K): AppCommandHandler<K> | undefined {
  return handlers[id] as AppCommandHandler<K> | undefined
}

export function getAppCommandHandlers(): AppCommandHandlers {
  return handlers
}

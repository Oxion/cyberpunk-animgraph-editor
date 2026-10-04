import type { AppCommandId } from './types'

/** Invoked by hotkeys and UI. Event is the triggering keyboard event when from a hotkey. */
export type AppCommandHandler = (event: KeyboardEvent) => void

export type AppCommandHandlers = { [K in AppCommandId]?: AppCommandHandler }

const handlers: AppCommandHandlers = {}

export function registerAppCommandHandler(id: AppCommandId, handler: AppCommandHandler): void {
  handlers[id] = handler
}

export function getAppCommandHandler(id: AppCommandId): AppCommandHandler | undefined {
  return handlers[id]
}

export function getAppCommandHandlers(): AppCommandHandlers {
  return handlers
}

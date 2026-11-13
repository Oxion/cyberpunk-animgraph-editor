import type { AppToolHandlers, AppToolId } from './types'

const handlers = new Map<string, AppToolHandlers>()

export function registerToolHandlers(id: AppToolId, next: AppToolHandlers): void {
  handlers.set(id, next)
}

export function getToolHandlers(id: AppToolId): AppToolHandlers | undefined {
  return handlers.get(id)
}

export function getAllToolHandlers(): ReadonlyMap<string, AppToolHandlers> {
  return handlers
}

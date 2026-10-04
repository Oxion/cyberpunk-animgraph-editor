import type { AppCommand, AppCommandId } from './types'

let catalog: Record<AppCommandId, AppCommand> | undefined

function requireCatalog(): Record<AppCommandId, AppCommand> {
  if (!catalog) throw new Error('[commands] catalog is not registered')
  return catalog
}

export function registerAppCommandCatalog(commands: Record<AppCommandId, AppCommand>): void {
  // Replace allowed — Vite HMR may re-run App setup with updated defs.
  catalog = commands
}

export function isAppCommandId(id: string): id is AppCommandId {
  return Boolean(catalog) && Object.prototype.hasOwnProperty.call(catalog, id)
}

export function getAppCommand<K extends AppCommandId>(id: K): Extract<AppCommand, { id: K }> {
  return requireCatalog()[id] as Extract<AppCommand, { id: K }>
}

export function getAppCommandLabel(id: string): string {
  return isAppCommandId(id) ? requireCatalog()[id].label : id
}

export function getAppCommandGroup(id: string): string {
  return (isAppCommandId(id) ? requireCatalog()[id].group : undefined)?.trim() || 'Other'
}

export function listAppCommands(): AppCommand[] {
  return Object.values(requireCatalog())
}

import type { AppTool, AppToolId } from './types'

let catalog: Record<AppToolId, AppTool> | undefined

function requireCatalog(): Record<AppToolId, AppTool> {
  if (!catalog) throw new Error('[tools] catalog is not registered')
  return catalog
}

export function registerAppToolCatalog(tools: Record<AppToolId, AppTool>): void {
  catalog = tools
}

export function isAppToolId(id: string): id is AppToolId {
  return Boolean(catalog) && Object.prototype.hasOwnProperty.call(catalog, id)
}

export function getAppTool<K extends AppToolId>(id: K): Extract<AppTool, { id: K }> {
  return requireCatalog()[id] as Extract<AppTool, { id: K }>
}

export function getAppToolLabel(id: string): string {
  return isAppToolId(id) ? requireCatalog()[id].label : id
}

export function listAppTools(): AppTool[] {
  return Object.values(requireCatalog())
}

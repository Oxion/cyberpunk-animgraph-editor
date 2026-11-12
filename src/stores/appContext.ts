import { appCommandWithIdEnabled } from '@/app/commands/predicate'
import { resolveAppPredicateContext } from '@/app/when/context'
import { whenTrue } from '@/core/when'
import type { AppToolId } from '../appTools/catalog'
import { appToolItems } from '../appTools/catalog'
import { activeToolsRegistry } from './toolManager'

export function canActivateAppTool(id: AppToolId): boolean {
  const tool = appToolItems.find((item) => item.id === id)
  if (!tool) return true
  if (tool.when) return whenTrue(tool.when, resolveAppPredicateContext())
  if (tool.commandId) return appCommandWithIdEnabled(tool.commandId)
  return true
}

export function canToggleAppTool(id: AppToolId): boolean {
  if (activeToolsRegistry[id]) return true
  return canActivateAppTool(id)
}

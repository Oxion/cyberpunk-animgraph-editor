import type { AppToolId } from '../appTools/catalog'
import { appToolItems } from '../appTools/catalog'
import { getAppCommand, type AppCommandId } from '../commands'
import type { AppContext, AppFocus } from '../when'
import { whenTrue } from '../when'
import {
  focusedDiagramSurface,
  getActiveDiagramRenderer,
  isStateLinksRootContext,
  isStateLinksRootViewFocused,
} from './diagramRenderers'
import { hasProject } from './graphProject'
import { selectedNodeIdsRef } from './graphSession'
import { activeToolsRegistry, focusedTool, toolManager } from './toolManager'
import { moveToolState } from './tools/move'
import { resizeToolState } from './tools/resize'

export function liveInProgressTool(): string {
  if (moveToolState.session) return 'move'
  if (resizeToolState.session) return 'resize'
  return getActiveDiagramRenderer()?.isPinDragging() ? 'connectionDrag' : ''
}

function liveFocus(): AppFocus {
  const el = document.activeElement
  if (
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    (el instanceof HTMLElement && el.isContentEditable)
  ) {
    return 'textInput'
  }
  if (focusedDiagramSurface.value) {
    return isStateLinksRootViewFocused() ? 'graphReadonly' : 'graph'
  }
  return hasProject.value ? 'ui' : 'none'
}

/** Live context keys for menus / tools / command preconditions. */
export function liveAppContext(): AppContext {
  return {
    focus: liveFocus(),
    diagramEditable: hasProject.value && !isStateLinksRootContext(),
    focusedTool: focusedTool.value ?? '',
    activeToolCount: toolManager.getActiveToolIds().length,
    inProgressTool: liveInProgressTool(),
    hasSelection: selectedNodeIdsRef.value.length > 0,
    hasGraph: hasProject.value,
  }
}

export function whenEnabled(id: string | undefined, ctx: AppContext = liveAppContext()): boolean {
  return whenTrue(id, ctx)
}

export function commandEnabled(id: AppCommandId, ctx: AppContext = liveAppContext()): boolean {
  return whenEnabled(getAppCommand(id).when, ctx)
}

export function canActivateAppTool(id: AppToolId): boolean {
  const tool = appToolItems.find((item) => item.id === id)
  if (!tool) return true
  if (tool.when) return whenEnabled(tool.when)
  if (tool.commandId) return commandEnabled(tool.commandId)
  return true
}

export function canToggleAppTool(id: AppToolId): boolean {
  if (activeToolsRegistry[id]) return true
  return canActivateAppTool(id)
}

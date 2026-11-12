import { focusedDiagramSurface, getActiveDiagramRenderer, isStateLinksRootContext, isStateLinksRootViewFocused } from "@/stores/diagramRenderers"
import { moveToolState, resizeToolState } from "@/stores/tools"
import { AppFocus } from "./types"
import { hasProject } from "@/stores/graphProject"
import { PredicateContext } from "@/core/when"
import { focusedTool, toolManager } from "@/stores/toolManager"
import { selectedNodeIdsRef } from "@/stores/graphSession"

// TODO not related to when
export function resolveAppInProgressTool(): string {
  if (moveToolState.session) return 'move'
  if (resizeToolState.session) return 'resize'
  return getActiveDiagramRenderer()?.isPinDragging() ? 'connectionDrag' : ''
}

// TODO not related to when
function resolveAppFocus(): AppFocus {
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

export function resolveAppPredicateContext(): PredicateContext {
  return {
    focus: resolveAppFocus(),
    diagramEditable: hasProject.value && !isStateLinksRootContext(),
    focusedTool: focusedTool.value ?? '',
    activeToolCount: toolManager.getActiveToolIds().length,
    inProgressTool: resolveAppInProgressTool(),
    hasSelection: selectedNodeIdsRef.value.length > 0,
    hasGraph: hasProject.value,
  }
}
import { focusedDiagramSurface, isStateLinksRootContext, isStateLinksRootViewFocused } from "@/stores/diagramRenderers"
import { AppFocus } from "./types"
import { hasProject } from "@/stores/graphProject"
import { PredicateContext } from "@/core/when"
import { focusedTool, getInProgressToolId, getStackToolIds } from "@/app/tools/pipeline"
import { selectedNodeIdsRef } from "@/stores/graphSession"

export function resolveAppInProgressTool(): string {
  return getInProgressToolId() ?? ''
}

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
    activeToolCount: getStackToolIds().length,
    inProgressTool: resolveAppInProgressTool(),
    hasSelection: selectedNodeIdsRef.value.length > 0,
    hasGraph: hasProject.value,
  }
}

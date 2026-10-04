import type { AppContext, AppFocus } from './types'

export function resolveAppFocus(
  event: KeyboardEvent,
  diagramHostFocused: boolean,
  diagramEditable: boolean
): AppFocus {
  const target = event.target
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  ) {
    return 'textInput'
  }
  if (diagramHostFocused) return diagramEditable ? 'graph' : 'graphReadonly'
  return 'ui'
}

export function buildAppContext(input: {
  event: KeyboardEvent
  diagramHostFocused: boolean
  diagramEditable: boolean
  focusedTool: string
  activeToolCount: number
  inProgressTool: string
  hasSelection: boolean
  hasGraph: boolean
}): AppContext {
  return {
    focus: resolveAppFocus(input.event, input.diagramHostFocused, input.diagramEditable),
    diagramEditable: input.diagramEditable,
    focusedTool: input.focusedTool,
    activeToolCount: input.activeToolCount,
    inProgressTool: input.inProgressTool,
    hasSelection: input.hasSelection,
    hasGraph: input.hasGraph,
  }
}

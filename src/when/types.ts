/** DOM / keyboard target. Analog of VS Code `editorTextFocus` vs sidebar vs input. */
export type AppFocus = 'graph' | 'graphReadonly' | 'ui' | 'textInput' | 'none'

/**
 * Shared snapshot for command preconditions, menus, tools, and keybindings.
 * Analog of VS Code context keys — not owned by hotkeys.
 */
export interface AppContext {
  focus: AppFocus
  /** Last diagram surface allows edits (state-links root → false). */
  diagramEditable: boolean
  focusedTool: string
  activeToolCount: number
  inProgressTool: string
  hasSelection: boolean
  hasGraph: boolean
}

export type WhenPredicate = (ctx: AppContext) => boolean
export type WhenPredicateMap = Record<string, WhenPredicate>

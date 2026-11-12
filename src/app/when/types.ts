/** DOM / keyboard target. Analog of VS Code `editorTextFocus` vs sidebar vs input. */
export type AppFocus = 'graph' | 'graphReadonly' | 'ui' | 'textInput' | 'none'

declare module '@/core/when' {
  interface PredicateContext {
    focus: AppFocus
    /** Last diagram surface allows edits (state-links root → false). */
    diagramEditable: boolean
    focusedTool: string
    activeToolCount: number
    inProgressTool: string
    hasSelection: boolean
    hasGraph: boolean
  }
}
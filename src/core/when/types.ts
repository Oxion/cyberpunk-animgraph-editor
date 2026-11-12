/**
 * Shared snapshot for command preconditions, menus, tools, and keybindings.
 * Analog of VS Code context keys — not owned by hotkeys.
 */
export interface PredicateContext {}

export type WhenPredicate = (ctx: PredicateContext) => boolean
export type WhenPredicateMap = Record<string, WhenPredicate>

import type { AppContext, WhenPredicateMap } from './types'

function noToolInProgress(ctx: AppContext): boolean {
  return !ctx.inProgressTool
}

function onlyActiveTool(ctx: AppContext, tool: string): boolean {
  return ctx.focusedTool === tool && ctx.activeToolCount === 1
}

function graphSelectionIdle(ctx: AppContext): boolean {
  return noToolInProgress(ctx) && ctx.diagramEditable && ctx.hasSelection
}

/** Named when-predicates — command `when`, keybinding `when`, tool `when`. */
export const defaultWhenPredicates: WhenPredicateMap = {
  always: () => true,
  moveInProgress: (ctx) => ctx.inProgressTool === 'move',
  moveNotInProgress: (ctx) => ctx.inProgressTool !== 'move',
  resizeInProgress: (ctx) => ctx.inProgressTool === 'resize',
  resizeNotInProgress: (ctx) => ctx.inProgressTool !== 'resize',
  connectionDragInProgress: (ctx) => ctx.inProgressTool === 'connectionDrag',
  noToolInProgress,
  graphFocused: (ctx) => ctx.focus === 'graph',
  graphEditable: (ctx) => ctx.diagramEditable,
  canBeginGrabMove: graphSelectionIdle,
  canBeginResize: graphSelectionIdle,
  canNudgeSelection: (ctx) =>
    ctx.hasSelection &&
    (ctx.inProgressTool === 'move' || (noToolInProgress(ctx) && ctx.diagramEditable)),
  canDeleteSelection: graphSelectionIdle,
  canFocusAppTool: (ctx) => noToolInProgress(ctx) && ctx.hasGraph && ctx.diagramEditable,
  toolIsMove: (ctx) => onlyActiveTool(ctx, 'move'),
  toolIsResize: (ctx) => onlyActiveTool(ctx, 'resize'),
  canPickConnectionEndpoint: (ctx) =>
    ctx.focusedTool === 'addConnection' && ctx.hasSelection && ctx.diagramEditable,
  canCopySelection: graphSelectionIdle,
  canDeselectAll: (ctx) => ctx.hasSelection && noToolInProgress(ctx),
  canSelectChildren: graphSelectionIdle,
  canPasteNodes: (ctx) => noToolInProgress(ctx) && ctx.diagramEditable && ctx.hasGraph,
  canSaveProject: (ctx) => ctx.hasGraph,
}

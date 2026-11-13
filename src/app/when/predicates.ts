import { registerPredicate, type PredicateContext } from '@/core/when'

function noToolInProgress(ctx: PredicateContext): boolean {
  return !ctx.inProgressTool
}

function onlyActiveTool(ctx: PredicateContext, tool: string): boolean {
  return ctx.focusedTool === tool && ctx.activeToolCount === 1
}

function graphSelectionIdle(ctx: PredicateContext): boolean {
  return noToolInProgress(ctx) && ctx.diagramEditable && ctx.hasSelection
}

export const registerAppPredicates = () => {
  registerPredicate('moveInProgress', (ctx) => ctx.inProgressTool === 'move')
  registerPredicate('moveNotInProgress', (ctx) => ctx.inProgressTool !== 'move')
  registerPredicate('resizeInProgress', (ctx) => ctx.inProgressTool === 'resize')
  registerPredicate('resizeNotInProgress', (ctx) => ctx.inProgressTool !== 'resize')
  registerPredicate('connectionDragInProgress', (ctx) => ctx.inProgressTool === 'connectionDrag')
  registerPredicate('noToolInProgress', (ctx) => !ctx.inProgressTool)
  registerPredicate('graphFocused', (ctx) => ctx.focus === 'graph')
  registerPredicate('graphEditable', (ctx) => ctx.diagramEditable)
  registerPredicate('canBeginGrabMove', graphSelectionIdle)
  registerPredicate('canBeginResize', graphSelectionIdle)
  registerPredicate('canNudgeSelection', (ctx) =>
    ctx.hasSelection &&
    (ctx.inProgressTool === 'move' ||
      ctx.inProgressTool === 'nodeNudge' ||
      (noToolInProgress(ctx) && ctx.diagramEditable))
  )
  registerPredicate('canDeleteSelection', graphSelectionIdle)
  registerPredicate('canFocusAppTool', (ctx) => noToolInProgress(ctx) && ctx.hasGraph && ctx.diagramEditable)
  registerPredicate('toolIsMove', (ctx) => onlyActiveTool(ctx, 'move'))
  registerPredicate('toolIsResize', (ctx) => onlyActiveTool(ctx, 'resize'))
  registerPredicate('canPickConnectionEndpoint', (ctx) => ctx.focusedTool === 'addConnection' && ctx.hasSelection && ctx.diagramEditable)
  registerPredicate('canCopySelection', graphSelectionIdle)
  registerPredicate('canDeselectAll', (ctx) => ctx.hasSelection && noToolInProgress(ctx))
  registerPredicate('canSelectChildren', graphSelectionIdle)
  registerPredicate('canPasteNodes', (ctx) => noToolInProgress(ctx) && ctx.diagramEditable && ctx.hasGraph)
  registerPredicate('canSaveProject', (ctx) => ctx.hasGraph)
}
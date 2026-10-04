import type { DiagramConnection } from '../diagramTypes'
import type { AddedNodePlacement, NodeLayoutState, NodePositionState } from '../GraphHistory'
import type { HandleMutationSnapshot } from '../addNodePlan'
import type { DeleteNodesSnapshot } from '../deleteNodePlan'
import type { SmStateMoveAnimgraphSnapshot } from '../smStateArrayMove'

/** Move/reposition nodes (keyboard, arrange inputs, ELK arrange, etc.). */
export interface MoveNodesCommand {
  type: 'MoveNodes'
  label: string
  before: NodePositionState[]
  after: NodePositionState[]
}

/** Resize / full layout patch (position + size). */
export interface ApplyLayoutsCommand {
  type: 'ApplyLayouts'
  label: string
  before: NodeLayoutState[]
  after: NodeLayoutState[]
}

/** Add diagram nodes (and optional animgraph handles + bootstrap). */
export interface AddNodesCommand {
  type: 'AddNodes'
  label: string
  placements: AddedNodePlacement[]
  handle?: HandleMutationSnapshot
  handles?: HandleMutationSnapshot[]
  parentRefreshIds: string[]
  parentLayoutsBefore?: NodeLayoutState[]
  parentLayoutsAfter?: NodeLayoutState[]
  connections?: DiagramConnection[]
}

/** Cascade-delete a diagram node (+ subtree) with wires / handles. */
export interface DeleteNodesCommand {
  type: 'DeleteNodes'
  label: string
  snapshot: DeleteNodesSnapshot
}

/** Reorder SM.Data.states + remap index refs + states-group layout. */
export interface MoveSmStateCommand {
  type: 'MoveSmState'
  label: string
  animgraphBefore: SmStateMoveAnimgraphSnapshot
  animgraphAfter: SmStateMoveAnimgraphSnapshot
  layoutsBefore: NodeLayoutState[]
  layoutsAfter: NodeLayoutState[]
  dirtyIds: string[]
}

export type GraphCommand =
  | MoveNodesCommand
  | ApplyLayoutsCommand
  | AddNodesCommand
  | DeleteNodesCommand
  | MoveSmStateCommand

export function commandLabel(command: GraphCommand): string {
  return command.label
}

export function createAddNodesCommand(input: {
  label: string
  placements: AddedNodePlacement[]
  handle?: HandleMutationSnapshot
  handles?: HandleMutationSnapshot[]
  parentRefreshIds?: string[]
  parentLayoutsBefore?: NodeLayoutState[]
  parentLayoutsAfter?: NodeLayoutState[]
  connections?: DiagramConnection[]
}): AddNodesCommand {
  return {
    type: 'AddNodes',
    label: input.label,
    placements: input.placements,
    handle: input.handle,
    handles: input.handles,
    parentRefreshIds: input.parentRefreshIds ?? [],
    parentLayoutsBefore: input.parentLayoutsBefore,
    parentLayoutsAfter: input.parentLayoutsAfter,
    connections: input.connections,
  }
}

export function createDeleteNodesCommand(input: {
  label: string
  snapshot: DeleteNodesSnapshot
}): DeleteNodesCommand {
  return {
    type: 'DeleteNodes',
    label: input.label,
    snapshot: input.snapshot,
  }
}

export function createMoveSmStateCommand(input: {
  label: string
  animgraphBefore: SmStateMoveAnimgraphSnapshot
  animgraphAfter: SmStateMoveAnimgraphSnapshot
  layoutsBefore: NodeLayoutState[]
  layoutsAfter: NodeLayoutState[]
  dirtyIds: string[]
}): MoveSmStateCommand {
  return {
    type: 'MoveSmState',
    label: input.label,
    animgraphBefore: input.animgraphBefore,
    animgraphAfter: input.animgraphAfter,
    layoutsBefore: input.layoutsBefore,
    layoutsAfter: input.layoutsAfter,
    dirtyIds: input.dirtyIds,
  }
}

export function createApplyLayoutsCommand(input: {
  label: string
  before: NodeLayoutState[]
  after: NodeLayoutState[]
}): ApplyLayoutsCommand {
  return {
    type: 'ApplyLayouts',
    label: input.label,
    before: input.before,
    after: input.after,
  }
}

import type { GraphViewChromeAction, GraphViewEntry, GraphViewKind } from '../../types/GraphView'
import { isStackableViewKind } from '../../types/DiagramBodyView'

/** Type-dependent chrome for diagram views (custom UI per view kind). */
export function getGraphViewChromeActions(entry: GraphViewEntry): GraphViewChromeAction[] {
  if (entry.kind === 'graph-scope' && entry.payload.stateMachineNodeId) {
    return [
      {
        id: 'open-sm-ring',
        label: 'SM Ring',
        title: 'Open state machine ring diagram',
      },
    ]
  }
  return []
}

export function getGraphViewCapabilities(kind: GraphViewKind): { stackable: boolean } {
  return { stackable: isStackableViewKind(kind) }
}

export function createMainGraphView(projectDiagramId = 'main'): GraphViewEntry<'main'> {
  const isPrimary = projectDiagramId === 'main'
  return {
    id: isPrimary ? 'main' : `main_${projectDiagramId}`,
    kind: 'main',
    title: isPrimary ? 'Main' : projectDiagramId,
    crumb: isPrimary ? 'Main' : projectDiagramId,
    projectDiagramId,
    selection: { nodeIds: [], primaryNodeId: null },
    payload: {},
  }
}

let viewSeq = 0

export function createGraphScopeView(opts: {
  scopeRootId: string
  label: string
  stateMachineNodeId?: string
  hideScopeRoot?: boolean
  projectDiagramId?: string
}): GraphViewEntry<'graph-scope'> {
  viewSeq += 1
  return {
    id: `view_scope_${opts.scopeRootId}_${viewSeq}`,
    kind: 'graph-scope',
    title: opts.label,
    crumb: opts.label,
    projectDiagramId: opts.projectDiagramId ?? 'main',
    selection: { nodeIds: [], primaryNodeId: null },
    payload: {
      scopeRootId: opts.scopeRootId,
      stateMachineNodeId: opts.stateMachineNodeId,
      hideScopeRoot: opts.hideScopeRoot ?? Boolean(opts.stateMachineNodeId),
    },
  }
}

export function createSmRingView(opts: {
  stateMachineNodeId: string
  label: string
  projectDiagramId?: string
}): GraphViewEntry<'sm-ring'> {
  viewSeq += 1
  return {
    id: `view_smring_${opts.stateMachineNodeId}_${viewSeq}`,
    kind: 'sm-ring',
    title: `SM Ring · ${opts.label}`,
    crumb: `Ring · ${opts.label}`,
    projectDiagramId: opts.projectDiagramId ?? 'main',
    payload: {
      stateMachineNodeId: opts.stateMachineNodeId,
    },
  }
}

export function createStateLinksView(opts: {
  stateNodeId: string
  label: string
  stateMachineNodeId?: string
  projectDiagramId?: string
}): GraphViewEntry<'state-links'> {
  viewSeq += 1
  return {
    id: `view_statelinks_${opts.stateNodeId}_${viewSeq}`,
    kind: 'state-links',
    title: opts.label,
    crumb: opts.label,
    projectDiagramId: opts.projectDiagramId ?? 'main',
    selection: { nodeIds: [], primaryNodeId: null },
    payload: {
      stateNodeId: opts.stateNodeId,
      stateMachineNodeId: opts.stateMachineNodeId,
    },
  }
}

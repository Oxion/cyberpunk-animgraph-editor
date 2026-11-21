import type { GraphViewEntry } from '../../types/GraphView'
import { openParallelGraphBody, pushEntry } from '../../stores/activeGraphView'
import { openLensWindow, openSmRingWindow, openStateLinksWindow } from '../../stores/appWindows'
import { activeBodyViewId, firstNonClosableId } from '../../stores/bodyViews'
import { registerGraphView } from '../../stores/graphViewRegistry'
import { pushWindowStack } from '../../stores/windowStacks'

export type PresentGraphViewTarget = 'push' | 'parallel' | 'window'

export type PresentGraphViewOptions = {
  target: PresentGraphViewTarget
  /** Body or window stack id when target is push. Defaults to active / first non-closable body. */
  stackId?: string
  preview?: boolean
  maximized?: boolean
  offsetIndex?: number
}

/**
 * Single router for presenting a GraphViewEntry into body stack / parallel body / window.
 * Host is chosen by `target`, not stored on the entry.
 */
export function presentGraphView(entry: GraphViewEntry, options: PresentGraphViewOptions): string | null {
  if (options.target === 'parallel') {
    registerGraphView(entry)
    return openParallelGraphBody([entry.id], {
      preview: options.preview !== false,
    })
  }

  if (options.target === 'push') {
    const stackId =
      options.stackId ?? (activeBodyViewId.value || firstNonClosableId() || '')
    if (!stackId) return null
    registerGraphView(entry)
    if (stackId.startsWith('win_')) {
      pushWindowStack(stackId, entry.id)
      return stackId
    }
    pushEntry(entry.id, stackId)
    return stackId
  }

  if (entry.kind === 'graph-scope') {
    return openLensWindow(
      {
        rootNodeId: entry.payload.scopeRootId,
        rootLabel: entry.title,
        hideScopeRoot: entry.payload.hideScopeRoot,
        projectDiagramId: entry.projectDiagramId,
      },
      {
        preview: options.preview,
        maximized: options.maximized,
        offsetIndex: options.offsetIndex,
      }
    )
  }
  if (entry.kind === 'state-links') {
    return openStateLinksWindow(
      {
        stateNodeId: entry.payload.stateNodeId,
        rootLabel: entry.title,
        stateMachineNodeId: entry.payload.stateMachineNodeId,
        projectDiagramId: entry.projectDiagramId,
      },
      {
        preview: options.preview,
        maximized: options.maximized,
        offsetIndex: options.offsetIndex,
      }
    )
  }
  if (entry.kind === 'sm-ring') {
    return openSmRingWindow(
      {
        stateMachineNodeId: entry.payload.stateMachineNodeId,
        rootLabel: entry.title,
        projectDiagramId: entry.projectDiagramId,
      },
      {
        preview: options.preview,
        maximized: options.maximized,
        offsetIndex: options.offsetIndex,
      }
    )
  }
  return null
}

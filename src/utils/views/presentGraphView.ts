import type { GraphViewEntry } from '../../types/GraphView'
import {
  MAIN_BODY_ID,
  openParallelBody,
  pushEntry,
} from '../../stores/bodyViews'
import { openLensWindow, openSmRingWindow, openStateLinksWindow } from '../../stores/appWindows'
import { pushWindowStack } from '../../stores/windowStacks'

export type PresentGraphViewTarget = 'push' | 'parallel' | 'window'

export type PresentGraphViewOptions = {
  target: PresentGraphViewTarget
  /** Body or window stack id when target is push. Defaults to Main body. */
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
    return openParallelBody(entry, { preview: options.preview !== false })
  }

  if (options.target === 'push') {
    const stackId = options.stackId ?? MAIN_BODY_ID
    if (stackId.startsWith('win_')) {
      pushWindowStack(stackId, entry)
      return stackId
    }
    pushEntry(entry, stackId)
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

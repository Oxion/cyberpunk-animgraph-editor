import type { RenderData, RenderNode } from '../diagramTypes'
import {
  applyNodeLayouts,
  applyNodePositions,
  captureNodeLayout,
  captureNodePosition,
  pairLayoutChanges,
  pairPositionChanges,
  type NodeLayoutState,
  type NodePositionState,
} from '../GraphHistory'
import type { ApplyLayoutsCommand, MoveNodesCommand } from './types'

/** Accumulates before-states during a continuous gesture; builds one typed command on end. */
export class PositionGesture {
  private capture: Map<string, NodePositionState> | null = null
  private label = 'Move nodes'

  get isOpen(): boolean {
    return this.capture !== null
  }

  begin(label: string): void {
    if (this.capture) return
    this.label = label
    this.capture = new Map()
  }

  track(node: RenderNode): void {
    if (!this.capture || this.capture.has(node.id)) return
    this.capture.set(node.id, captureNodePosition(node))
  }

  /** Close gesture and build a MoveNodes command, or null if nothing changed. */
  end(graphData: RenderData | null, labelOverride?: string): MoveNodesCommand | null {
    if (!this.capture || !graphData) {
      this.capture = null
      return null
    }

    const ids = [...this.capture.keys()]
    const beforeStates = ids.map((id) => this.capture!.get(id)!)
    const afterStates = ids
      .map((id) => graphData.allNodes.get(id))
      .filter((node): node is RenderNode => Boolean(node))
      .map(captureNodePosition)
    const label = labelOverride ?? this.label
    this.capture = null

    const { before, after } = pairPositionChanges(beforeStates, afterStates)
    if (before.length === 0) return null

    return {
      type: 'MoveNodes',
      label,
      before,
      after,
    }
  }

  cancel(): void {
    this.capture = null
  }

  /**
   * Restore captured before-states and clear the gesture (no history command).
   * Returns restored node ids.
   */
  restore(graphData: RenderData | null): string[] {
    if (!this.capture || !graphData) {
      this.capture = null
      return []
    }
    const beforeStates = [...this.capture.values()]
    this.capture = null
    return applyNodePositions(graphData, beforeStates)
  }
}

/** Same pattern for resize / layout patches. */
export class LayoutGesture {
  private capture: Map<string, NodeLayoutState> | null = null
  private label = 'Resize node'

  get isOpen(): boolean {
    return this.capture !== null
  }

  begin(label: string): void {
    if (this.capture) return
    this.label = label
    this.capture = new Map()
  }

  track(node: RenderNode): void {
    if (!this.capture || this.capture.has(node.id)) return
    this.capture.set(node.id, captureNodeLayout(node))
  }

  end(graphData: RenderData | null, labelOverride?: string): ApplyLayoutsCommand | null {
    if (!this.capture || !graphData) {
      this.capture = null
      return null
    }

    const ids = [...this.capture.keys()]
    const beforeStates = ids.map((id) => this.capture!.get(id)!)
    const afterStates = ids
      .map((id) => graphData.allNodes.get(id))
      .filter((node): node is RenderNode => Boolean(node))
      .map(captureNodeLayout)
    const label = labelOverride ?? this.label
    this.capture = null

    const { before, after } = pairLayoutChanges(beforeStates, afterStates)
    if (before.length === 0) return null

    return {
      type: 'ApplyLayouts',
      label,
      before,
      after,
    }
  }

  cancel(): void {
    this.capture = null
  }

  restore(graphData: RenderData | null): string[] {
    if (!this.capture || !graphData) {
      this.capture = null
      return []
    }
    const beforeStates = [...this.capture.values()]
    this.capture = null
    return applyNodeLayouts(graphData, beforeStates)
  }
}

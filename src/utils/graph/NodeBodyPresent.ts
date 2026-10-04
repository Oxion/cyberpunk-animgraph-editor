import type { RenderData, RenderNode } from './diagramTypes'
import {
  layoutNodeBody,
  nodeUsesRowComposition,
  type NodeRowLayout,
} from './NodeRowModel'

export type BodyPaintModel =
  | { kind: 'empty' }
  | {
      kind: 'rows'
      layout: NodeRowLayout
    }

export type BodyPresentStrategy = {
  present(node: RenderNode, renderData: RenderData): BodyPaintModel
}

const defaultBodyPresentStrategy: BodyPresentStrategy = {
  present(node, diagramData) {
    if (!nodeUsesRowComposition(node)) return { kind: 'empty' }
    return {
      kind: 'rows',
      layout: layoutNodeBody(node, diagramData),
    }
  },
}

/** Per-type present registry; unknown kinds use the row-composition default. */
export function resolveBodyPresentStrategy(_node: RenderNode): BodyPresentStrategy {
  return defaultBodyPresentStrategy
}

export function presentNodeBody(node: RenderNode, diagramData: RenderData): BodyPaintModel {
  return resolveBodyPresentStrategy(node).present(node, diagramData)
}

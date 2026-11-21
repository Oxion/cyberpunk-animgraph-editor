import { RenderNode } from "../graph/diagramTypes"
import { IPixiDiagramRendererNodeStageChangesMap } from "./types"

export const PixiDiagramRendererPluginHostBeforeNodeCreatedEventType = 'before-node-created'

export type PixiDiagramRendererPluginHostBeforeNodeCreatedEvent = {
  type: typeof PixiDiagramRendererPluginHostBeforeNodeCreatedEventType
  diagramNode: RenderNode
  outStageChanges: IPixiDiagramRendererNodeStageChangesMap[keyof IPixiDiagramRendererNodeStageChangesMap][]
}
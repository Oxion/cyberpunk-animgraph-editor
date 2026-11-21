import { IPixiDiagramRendererNode, IPixiDiagramRendererNodeStageChangesMap } from "./types"

export const PixiDiagramRendererPluginHostNodeSelectedEventType = 'node-selected'

export type PixiDiagramRendererPluginHostNodeSelectedEvent = {
  type: typeof PixiDiagramRendererPluginHostNodeSelectedEventType
  node: IPixiDiagramRendererNode<IPixiDiagramRendererNodeStageChangesMap>
}
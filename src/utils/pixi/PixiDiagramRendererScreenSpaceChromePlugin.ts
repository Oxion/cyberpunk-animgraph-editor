import { watcher } from "@/lib/eagerReactive";
import { IPixiDiagramRendererPlugin, IPixiDiagramRendererPluginHost } from "./types";
import { CameraStageChangeKind } from "./PixiDiagramRendererNodeCameraStageChange";
import { WatcherSub } from "@/lib/eagerReactive/types";

export class PixiDiagramRendererScreenSpaceChromePlugin implements IPixiDiagramRendererPlugin {
  private _pluginHost?: IPixiDiagramRendererPluginHost
  private _viewportChangesEffectSub?: WatcherSub

  private get pluginHost(): IPixiDiagramRendererPluginHost {
    if (!this._pluginHost) {
      throw new Error('Plugin host not attached')
    }
    return this._pluginHost
  }

  attach(pluginHost: IPixiDiagramRendererPluginHost): void {
    this._pluginHost = pluginHost

    this._viewportChangesEffectSub = watcher([
      this.pluginHost.camera.zoomRef,
      this.pluginHost.viewportMountedDiagramNodeIdsSetRef,
    ], this._handleViewportChanges.bind(this))
  }

  detach(): void {
    this._viewportChangesEffectSub?.remove()
  }

  private _handleViewportChanges() {
    const diagramNodeIdToPixiDiagramNodeMap = this.pluginHost.diagramNodeIdToPixiDiagramNodeMap
    const viewportMountedDiagramNodeIdsSet = this.pluginHost.viewportMountedDiagramNodeIdsSetRef.value
    for (const diagramNodeId of viewportMountedDiagramNodeIdsSet) {
      const pixiDiagramNode = diagramNodeIdToPixiDiagramNodeMap.get(diagramNodeId)
      if (!pixiDiagramNode) continue

      pixiDiagramNode.stage({
        kind: CameraStageChangeKind,
      })
      pixiDiagramNode.update()
    }
  }
}
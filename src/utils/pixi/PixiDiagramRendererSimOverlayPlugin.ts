import { watcher } from "@/lib/eagerReactive"
import { RenderNode } from "../graph/diagramTypes"
import { SimNodeState, SimSnapshot, SimSnapshotUpdate } from "../sim"
import { SimStageChangeKind } from "./PixiDiagramRendererNodeSimStageChange"
import { PixiDiagramRendererPluginHostBeforeNodeCreatedEvent, PixiDiagramRendererPluginHostBeforeNodeCreatedEventType } from "./PixiDiagramRendererPluginHostBeforeNodeCreatedEvent"
import { IPixiDiagramRendererPlugin, IPixiDiagramRendererPluginHost } from "./types"
import { WatcherSub } from "@/lib/eagerReactive/types"

export type PixiDiagramRendererSimOverlayPluginProps = {
  simSnaphot?: SimSnapshot
}

export class PixiDiagramRendererSimOverlayPlugin implements IPixiDiagramRendererPlugin {
  private _pluginHost?: IPixiDiagramRendererPluginHost
  
  private _viewportChangesEffectSub?: WatcherSub

  private _simSnaphot?: SimSnapshot

  /** sim HandleId / metadata keys → render node ids (for delta overlay). */
  private simOverlayKeyIndex: Map<string, string[]> | null = null

  constructor(props: PixiDiagramRendererSimOverlayPluginProps = {}) {
    this._simSnaphot = props.simSnaphot
  }

  private _getPluginHost(): IPixiDiagramRendererPluginHost {
    if (!this._pluginHost) {
      throw new Error('Plugin host not attached')
    }
    return this._pluginHost
  }

  attach(pluginHost: IPixiDiagramRendererPluginHost): void {
    this._pluginHost = pluginHost

    this._pluginHost.on(
      PixiDiagramRendererPluginHostBeforeNodeCreatedEventType, 
      this._handleBeforeNodeCreated.bind(this)
    )
    this._viewportChangesEffectSub = watcher([
      this._pluginHost.camera.zoomRef,
      this._pluginHost.viewportMountedDiagramNodeIdsSetRef,
    ], this._handleViewportChanges.bind(this))
  }

  detach(): void {
    this._viewportChangesEffectSub?.remove()
  }

  applySimSnapshot(simSnapshot?: SimSnapshot): void {
    const prevSimSnapshot = this._simSnaphot
    this._simSnaphot = simSnapshot

    const simSnapshotUpdate = simSnapshot?.update
    if (!!prevSimSnapshot && !!simSnapshotUpdate && !!simSnapshotUpdate.nodeDelta) {
      if (Object.keys(simSnapshotUpdate.nodeDelta.changes).length === 0 && simSnapshotUpdate.nodeDelta.removed.length === 0) return
      this._applySimOverlayDelta(simSnapshotUpdate.simNodeStateByHandleId, simSnapshotUpdate.nodeDelta)
      return
    }

    this._applySimOverlayFull(simSnapshotUpdate?.simNodeStateByHandleId)
  }

  private _simOverlayLookupKeys(diagramNode?: RenderNode): string[] {
    return [
      diagramNode?.data?.originalNodeId as string | undefined,
      diagramNode?.id,
      diagramNode?.metadata?.handleId as string | undefined,
      diagramNode?.metadata?.originalNodeId as string | undefined,
      // After promote, diagram root id == HandleId; metadata kept for legacy keys / shell.
      diagramNode?.metadata?.stateMachineNodeId as string | undefined,
      diagramNode?.metadata?.ownerStateMachineId as string | undefined,
    ].filter((k): k is string => Boolean(k))
  }

  private _ensureSimOverlayKeyIndex(): Map<string, string[]> {
    if (this.simOverlayKeyIndex) return this.simOverlayKeyIndex
    const index = new Map<string, string[]>()
    const add = (key: string | undefined, nodeId: string) => {
      if (!key) return
      let list = index.get(key)
      if (!list) {
        list = []
        index.set(key, list)
      }
      if (!list.includes(nodeId)) list.push(nodeId)
    }
    for (const [diagramNodeId, diagramNode] of this._getPluginHost().diagramData.allNodes) {
      for (const key of this._simOverlayLookupKeys(diagramNode)) add(key, diagramNodeId)
    }
    this.simOverlayKeyIndex = index
    return index
  }

  private _lookupSimNodeState(
    animgraphHandleIdToSimNodeState?: SimSnapshotUpdate['simNodeStateByHandleId'],
    diagramNode?: RenderNode,
  ): SimNodeState | undefined {
    if (!animgraphHandleIdToSimNodeState) return

    for (const key of this._simOverlayLookupKeys(diagramNode)) {
      const st = animgraphHandleIdToSimNodeState[key]
      if (st) return st
    }
    return
  }

  private _applySimOverlayFull(
    animgraphHandleIdToSimNodeState?: SimSnapshotUpdate['simNodeStateByHandleId'],
  ): void {
    const diagramNodeIdToPixiDiagramNodeMap = this._getPluginHost().diagramNodeIdToPixiDiagramNodeMap
    if (!animgraphHandleIdToSimNodeState) {
      for (const [_diagramNodeId, pixiDiagramNode] of diagramNodeIdToPixiDiagramNodeMap) {
        pixiDiagramNode.stage({
          kind: SimStageChangeKind,
          simNodeState: undefined,
        })
        pixiDiagramNode.update()
      }
      return
    }

    for (const [diagramNodeId, pixiDiagramNode] of diagramNodeIdToPixiDiagramNodeMap) {
      const diagramNode = this._getPluginHost().diagramData.allNodes.get(diagramNodeId)
      if (!diagramNode) continue

      pixiDiagramNode.stage({
        kind: SimStageChangeKind,
        simNodeState: this._lookupSimNodeState(animgraphHandleIdToSimNodeState, diagramNode),
      })
      pixiDiagramNode.update()
    }
  }

  private _applySimOverlayDelta(
    animgraphHandleIdToSimNodeState: SimSnapshotUpdate['simNodeStateByHandleId'],
    delta: NonNullable<SimSnapshotUpdate['nodeDelta']>
  ): void {
    this._applySimOverlayForSimKeys(
      animgraphHandleIdToSimNodeState, 
      Object.keys(delta.changes), 
      delta.removed
    )
  }

  private _applySimOverlayForSimKeys(
    animgraphHandleIdToSimNodeState: SimSnapshotUpdate['simNodeStateByHandleId'],
    ...simKeysList: readonly string[][]
  ): void {
    const diagramNodeIdToDiagramNodeMap = this._getPluginHost().diagramData.allNodes
    const diagramNodeIdToPixiDiagramNodeMap = this._getPluginHost().diagramNodeIdToPixiDiagramNodeMap
    const index = this._ensureSimOverlayKeyIndex()
    const touchedDiagramNodeIds = new Set<string>()

    for (const simKeys of simKeysList) {
      for (const simKey of simKeys) {
        const diagramNodeIds = index.get(simKey)
        if (!diagramNodeIds) continue

        for (const diagramNodeId of diagramNodeIds) {
          if (touchedDiagramNodeIds.has(diagramNodeId)) continue
          
          const pixiDiagramNode = diagramNodeIdToPixiDiagramNodeMap.get(diagramNodeId)
          if (!pixiDiagramNode) continue

          touchedDiagramNodeIds.add(diagramNodeId)
          
          const diagramNode = diagramNodeIdToDiagramNodeMap.get(diagramNodeId)
          pixiDiagramNode.stage({
            kind: SimStageChangeKind,
            simNodeState: this._lookupSimNodeState(animgraphHandleIdToSimNodeState, diagramNode),
          })
          pixiDiagramNode.update()
        }
      }
    }
  }

  private _handleViewportChanges() {
    const animgraphHandleIdToSimNodeState = this._simSnaphot?.update?.simNodeStateByHandleId
    const diagramNodeIdToDiagramNodeMap = this._getPluginHost().diagramData.allNodes
    const diagramNodeIdToPixiDiagramNodeMap = this._getPluginHost().diagramNodeIdToPixiDiagramNodeMap
    const viewportMountedDiagramNodeIdsSet = this._getPluginHost().viewportMountedDiagramNodeIdsSetRef.value
    for (const diagramNodeId of viewportMountedDiagramNodeIdsSet) {
      const pixiDiagramNode = diagramNodeIdToPixiDiagramNodeMap.get(diagramNodeId)
      if (!pixiDiagramNode) continue

      const diagramNode = diagramNodeIdToDiagramNodeMap.get(diagramNodeId)
      pixiDiagramNode.stage({
        kind: SimStageChangeKind,
        simNodeState: this._lookupSimNodeState(animgraphHandleIdToSimNodeState, diagramNode),
      })
      pixiDiagramNode.update()
    }
  }

  private _handleBeforeNodeCreated(event: PixiDiagramRendererPluginHostBeforeNodeCreatedEvent): void {
    event.outStageChanges.push({
      kind: SimStageChangeKind,
      simNodeState: undefined,
    })
  }
}
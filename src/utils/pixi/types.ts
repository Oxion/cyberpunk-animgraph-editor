import { Container } from "pixi.js"
import { RenderData } from "../graph/diagramTypes"
import { NodePinDesc } from "../graph/NodePins"
import { Signal } from "@/lib/eagerReactive"
import { Camera } from "../PixiGraphRenderer"

/** Host callbacks injected into renderer nodes (drag, LOD). */
export interface PixiDiagramRendererNodeCtx {
  worldLengthForScreenPx(screenPx: number): number
  beginInputPinDrag(diagramNodeId: string, pos: { x: number, y: number }): void
  beginOutputPinDrag(diagramNodeId: string, pos: { x: number, y: number }): void
}

export interface IPixiDiagramRendererNode<StageChangesMapT extends Record<keyof StageChangesMapT, { kind: PropertyKey }>> {
  readonly diagramNodeId: string
  readonly diagramNodeType: string
  readonly pixiContainer: Container
  readonly connectionsPixiContainer: Container
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly selected: boolean
  readonly nodePinsDescs: NodePinDesc[]
  setup(): void
  stage(change: StageChangesMapT[keyof StageChangesMapT]): void
  update(): void
  destroy(): void
  getPinPosition(pinId: string): { x: number, y: number } | undefined
}


export interface IPixiDiagramRendererNodeStageChangesMap {} 

type _AssertStageChangesMap = IPixiDiagramRendererNodeStageChangesMap extends Record<
  keyof IPixiDiagramRendererNodeStageChangesMap,
  { kind: PropertyKey }
> ? true : never

const _assertStageChangesMap: _AssertStageChangesMap = true
void _assertStageChangesMap


export interface IPixiDiagramRendererPluginHostEventsMap {}

export type PixiDiagramRendererPluginHostEventType = keyof IPixiDiagramRendererPluginHostEventsMap
export type PixiDiagramRendererPluginHostEvent = IPixiDiagramRendererPluginHostEventsMap[PixiDiagramRendererPluginHostEventType]

type _AssertPluginHostEventsMap = IPixiDiagramRendererPluginHostEventsMap extends Record<
  keyof IPixiDiagramRendererPluginHostEventsMap,
  { type: PropertyKey }
> ? true : never

const _assertPluginHostEventsMap: _AssertPluginHostEventsMap = true
void _assertPluginHostEventsMap


export interface IPixiDiagramRendererPluginHost {
  readonly diagramData: RenderData
  readonly camera: Camera
  readonly diagramNodeIdToPixiDiagramNodeMap: ReadonlyMap<string, IPixiDiagramRendererNode<IPixiDiagramRendererNodeStageChangesMap>>
  readonly viewportMountedDiagramNodeIdsSetRef: Signal<ReadonlySet<string>>
  on<T extends PixiDiagramRendererPluginHostEventType>(
    eventType: T, 
    callback: (event: IPixiDiagramRendererPluginHostEventsMap[T]
  ) => void): void
}

export interface IPixiDiagramRendererPlugin {
  attach(pluginHost: IPixiDiagramRendererPluginHost): void
  detach(): void
}
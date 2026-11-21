import { SimNodeState } from "../sim";

export const SimStageChangeKind = 'sim'

export interface IPixiDiagramRendererNodeSimStageChange {
  kind: typeof SimStageChangeKind,
  simNodeState: SimNodeState | undefined,
}

declare module './types' {
  interface IPixiDiagramRendererNodeStageChangesMap {
    [SimStageChangeKind]: IPixiDiagramRendererNodeSimStageChange,
  }
}
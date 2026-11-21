export const CameraStageChangeKind = 'camera'

export interface IPixiDiagramRendererNodeCameraStageChange {
  kind: typeof CameraStageChangeKind,
}

declare module './types' {
  interface IPixiDiagramRendererNodeStageChangesMap {
    [CameraStageChangeKind]: IPixiDiagramRendererNodeCameraStageChange,
  }
}
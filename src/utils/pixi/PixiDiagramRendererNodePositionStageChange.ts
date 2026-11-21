export const PositionStageChangeKind = 'position'

export interface IPixiDiagramRendererNodePositionStageChange {
  kind: typeof PositionStageChangeKind,
  position: { x: number, y: number },
}
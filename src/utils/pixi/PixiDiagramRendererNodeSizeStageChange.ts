export const SizeStageChangeKind = 'size'

export interface IPixiDiagramRendererNodeSizeStageChange {
  kind: typeof SizeStageChangeKind,
  size: { width: number, height: number },
}
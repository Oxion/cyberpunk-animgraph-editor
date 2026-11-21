export const SelectedStageChangeKind = 'selected'

export interface IPixiDiagramRendererNodeSelectedStageChange {
  kind: typeof SelectedStageChangeKind,
  selected: boolean,
}

// declare module '@/utils/PixiGraphRenderer' {
//   interface IPixiDiagramRendererNodeStageChangesMap {
//     [SelectedStageChangeKind]: IPixiDiagramRendererNodeSelectedStageChange,
//   }
// }
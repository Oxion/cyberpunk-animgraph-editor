import { PixiDiagramNodeVisualOptions } from "./PixiDiagramNode";

export const VisualOptionsStageChangeKind = 'visual-options'

export interface IPixiDiagramRendererNodeVisualOptionsStageChange {
  kind: typeof VisualOptionsStageChangeKind,
  visualOptions: PixiDiagramNodeVisualOptions,
}

// declare module '@/utils/PixiGraphRenderer' {
//   interface IPixiDiagramRendererNodeStageChangesMap {
//     [BodyStageChangeKind]: IPixiDiagramRendererNodeBodyStageChange,
//   }
// }
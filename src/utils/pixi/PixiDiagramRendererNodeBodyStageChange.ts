import { BodyPaintModel } from "../graph/NodeBodyPresent";

export const BodyStageChangeKind = 'body'

export interface IPixiDiagramRendererNodeBodyStageChange {
  kind: typeof BodyStageChangeKind,
  bodyModel: BodyPaintModel,
}

// declare module '@/utils/PixiGraphRenderer' {
//   interface IPixiDiagramRendererNodeStageChangesMap {
//     [BodyStageChangeKind]: IPixiDiagramRendererNodeBodyStageChange,
//   }
// }
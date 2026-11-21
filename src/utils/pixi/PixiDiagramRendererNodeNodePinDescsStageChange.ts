import { NodePinDesc } from "../graph/NodePins";

export const NodePinDescsStageChangeKind = 'node-pin-descs'

export interface IPixiDiagramRendererNodeNodePinDescsStageChange {
  kind: typeof NodePinDescsStageChangeKind,
  nodePinDescs: NodePinDesc[],
}
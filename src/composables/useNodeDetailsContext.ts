import { provide, type ComputedRef, type InjectionKey, type Ref } from 'vue'
import type { AnimgraphNode } from '../utils/graph/animgraphTypes'
import type { DiagramConnection, RenderNode } from '../utils/graph/diagramTypes'
import type { StateMachineRingPresentation } from '../utils/graph/DiagramConversion'
import { setFlushPendingHandleFieldEdit } from '../stores/graphHistory'
import { setWiringNotifySelectedHandleDataChanged } from '../stores/graphWiring'
import {
  flushPendingHandleFieldEditImpl,
  notifySelectedHandleDataChanged,
  recordHandleFieldEdit,
  recordHandleFieldsEdit,
  removePinArraySlot,
  renamePinHandleId,
  reorderPinArraySlot,
  selectedHandleData,
  snapshotHandleField,
  snapshotHandleFields,
} from '../stores/graphHandleEdits'

export type NodeDetailsSection = 'general' | 'transform' | 'connections' | 'typeDetails'

export interface NodeDetailsContext {
  selectedNode: Ref<RenderNode | null>
  nodeDescription: Ref<string>
  onDescriptionChange: () => void
  saveNodeDescription: () => void
  saveNodeText: (text: string) => void
  saveNodeLabel: (label: string) => void
  logSelectedNodeData: () => void
  activeNodeDetailsTab: Ref<NodeDetailsSection>
  selectedNodeConnectionCount: ComputedRef<number>
  nodePosition: Ref<{ x: number; y: number }>
  applyNodePosition: () => void
  selectedNodeConnectionsComputed: ComputedRef<{ incoming: DiagramConnection[]; outgoing: DiagramConnection[] } | null>
  nodeSize: Ref<{ width: number; height: number }>
  applyNodeSize: () => void
  panToConnectedNode: (conn: DiagramConnection, isIncoming: boolean) => void
  connectionsEditMode: Ref<boolean>
  confirmDeleteConnection: (conn: DiagramConnection) => void
  selectedStateMachineRing: ComputedRef<StateMachineRingPresentation | null>
  openSmRingFromSelection: () => void
  canOpenStateAppliedLinks: ComputedRef<boolean>
  openStateAppliedLinksFromSelection: () => void
  selectedHandleData: ComputedRef<Record<string, unknown> | null>
  handleDataRevision: Ref<number>
  notifySelectedHandleDataChanged: () => void
  snapshotHandleField: (key: string) => unknown
  snapshotHandleFields: (keys: readonly string[]) => Record<string, unknown>
  recordHandleFieldEdit: (
    key: string,
    before: unknown,
    options?: { immediate?: boolean }
  ) => void
  recordHandleFieldsEdit: (
    keys: readonly string[],
    before: Record<string, unknown>
  ) => void
  handlesRegistry: ComputedRef<Map<string, AnimgraphNode> | null>
  allNodes: ComputedRef<Map<string, RenderNode> | null>
  removePinArraySlot: (inputName: string, index: number) => void
  reorderPinArraySlot: (inputName: string, index: number, delta: -1 | 1) => void
  renamePinHandleId: (
    oldId: string,
    newId: string
  ) => { ok: true } | { ok: false; reason: string }
  moveSmStateToIndex: (stateId: string, toIndex: number) => Promise<void>
  moveSelectedSmStateByDelta: (delta: -1 | 1) => void
  canMoveSmStateUp: ComputedRef<boolean>
  canMoveSmStateDown: ComputedRef<boolean>
  canLayoutSmStatesGroup: ComputedRef<boolean>
  layoutSelectedSmStatesGroup: () => void
}

export const nodeDetailsContextKey: InjectionKey<NodeDetailsContext> = Symbol('nodeDetailsContext')

export {
  findIncomingPinConnection,
  removePinArraySlot,
  getPinInputArray,
  remapIncomingPinName,
  reorderPinArraySlot,
  renamePinHandleId,
  selectedHandleData,
  refreshNodesBoundToHandle,
  notifySelectedHandleDataChanged,
  scheduleHandleChromeRefresh,
  cloneHandleFieldValue,
  asEmbeddedHandleSnapshot,
  snapshotHandleField,
  handleFieldValuesEqual,
  applyHandleFieldValue,
  applyHandleFieldPatch,
  pushHandleFieldHistory,
  flushPendingHandleFieldEditImpl,
  snapshotHandleFields,
  recordHandleFieldsEdit,
  recordHandleFieldEdit,
} from '../stores/graphHandleEdits'

export function setupNodeDetailsContext(ctx: NodeDetailsContext) {
  provide(nodeDetailsContextKey, ctx)
  setFlushPendingHandleFieldEdit(flushPendingHandleFieldEditImpl)
  setWiringNotifySelectedHandleDataChanged(notifySelectedHandleDataChanged)
  return {
    selectedHandleData,
    notifySelectedHandleDataChanged,
    snapshotHandleField,
    snapshotHandleFields,
    recordHandleFieldEdit,
    recordHandleFieldsEdit,
    removePinArraySlot,
    reorderPinArraySlot,
    renamePinHandleId,
  }
}

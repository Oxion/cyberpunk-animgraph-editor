import { computed, shallowRef, watch } from 'vue'
import { selectedNodeRef } from '../../stores/graphSession'
import {
  getHistoryForDiagram,
  graphHistoryState,
  handleDataRevision,
} from '../../stores/graphHistory'
import { refreshPinFootprints } from '../../stores/graphPaint'
import { getRenderData, requireActiveDiagramId } from '../../stores/graphProject'
import { attachHandleToolCache, attachHandleToolState } from '../../stores/tools'
import { NodeDefinitionRegistry } from '../../utils/NodeDefinition'
import { findDiagramBoxForHandle } from '../../utils/graph/animgraphContainOwner'
import {
  addHandleRefs,
  createHandle,
  deleteHandles,
} from '../../utils/graph/animgraphMutation'
import { mutationCtxFromRenderData } from '../../utils/graph/diagramMutationCtx'
import type { AnimgraphObject } from '../../utils/graph/animgraphTypes'
import type { RenderNode } from '../../utils/graph/diagramTypes'

export type AttachHandleAction = {
  diagramId: string
  node: RenderNode
  handleId: string
  handleData: Partial<AnimgraphObject>
  parentHandleId?: string
  parentHandleChildrenPropertyName?: string
  handleIsNode: boolean
  run: () => void
  dataFromSelected: () => void
}

export const attachHandleAction = shallowRef<AttachHandleAction | null>(null)

export const createAttachHandleAction = (diagramId: string): AttachHandleAction | null => {
  const diagramData = getRenderData(diagramId)
  const selectedNodeValue = selectedNodeRef.value
  if (!selectedNodeValue) {
    console.error('No selected node')
    return null
  }

  if (!diagramData) {
    console.error('No graph data')
    return null
  }

  const selectedNodeAnimgraphHandle = diagramData.handlesRegistry.get(
    selectedNodeValue.data.originalNodeId ?? ''
  )
  if (selectedNodeAnimgraphHandle) {
    console.error('Node already has an attached animgraph handle')
    return null
  }

  const parentHandleId =
    selectedNodeValue.parent && selectedNodeValue.parent.type !== 'PropertyGroup'
      ? selectedNodeValue.parent.data.originalNodeId
      : selectedNodeValue.parent && selectedNodeValue.parent.parent
        ? selectedNodeValue.parent.parent.data.originalNodeId
        : undefined

  const parentHandle = diagramData.handlesRegistry.get(parentHandleId ?? '')
  const parentType = parentHandle?.Data.$type ?? ''
  const parentChildFields = NodeDefinitionRegistry.getChildFields(parentType)

  const parentHandleChildrenPropertyName =
    selectedNodeValue.parent &&
    selectedNodeValue.parent.type === 'PropertyGroup' &&
    selectedNodeValue.parent.data.childrenPropertyName &&
    parentChildFields.includes(selectedNodeValue.parent.data.childrenPropertyName)
      ? selectedNodeValue.parent.data.childrenPropertyName
      : parentChildFields[0]

  const handleTemplateData = NodeDefinitionRegistry.getHandleTypeDataTemplate(selectedNodeValue.type) ?? {
    $type: selectedNodeValue.type,
  }

  const action: AttachHandleAction = {
    diagramId,
    node: selectedNodeValue,
    handleId: selectedNodeValue.data.originalNodeId || selectedNodeValue.id,
    handleData: handleTemplateData as Partial<AnimgraphObject>,
    parentHandleId: parentHandleId,
    parentHandleChildrenPropertyName: parentHandleChildrenPropertyName,
    handleIsNode: NodeDefinitionRegistry.isNodesToInitType(selectedNodeValue.type),
    run() {
      const gd = getRenderData(this.diagramId)
      if (!gd) {
        console.error('No graph data')
        return
      }

      const node = this.node
      if (!node) {
        console.error('Node not set')
        return
      }

      const confirmedNode = gd.allNodes.get(node.id)
      if (!confirmedNode) {
        console.error('Node not found')
        return
      }

      const handleId = this.handleId
      if (!handleId) {
        console.error('Handle ID not set')
        return
      }

      if (gd.handlesRegistry.has(handleId)) {
        console.error('Handle already exists')
        return
      }

      const handleData = this.handleData
      if (!handleData) {
        console.error('Handle data not set')
        return
      }

      if (!handleData.$type) {
        console.error('Handle type not set')
        return
      }

      const beforeOriginalNodeId = confirmedNode.data.originalNodeId
      const handleDataClone = JSON.parse(JSON.stringify(handleData)) as AnimgraphObject

      confirmedNode.data.originalNodeId = handleId

      const mutCtx = mutationCtxFromRenderData(gd)
      createHandle(mutCtx, handleId, handleDataClone)

      if (
        this.parentHandleId &&
        this.parentHandleChildrenPropertyName &&
        this.handleIsNode
      ) {
        const attachResult = addHandleRefs(
          mutCtx,
          this.parentHandleId,
          this.parentHandleChildrenPropertyName,
          [handleId]
        )
        if (!attachResult.ok) {
          console.warn(attachResult.message)
        }
      }

      handleDataRevision.value++
      const refreshIds = [confirmedNode.id]
      if (this.parentHandleId) {
        const ownerBox = findDiagramBoxForHandle(gd, this.parentHandleId)
        if (ownerBox && !refreshIds.includes(ownerBox.id)) refreshIds.push(ownerBox.id)
      }
      refreshPinFootprints(this.diagramId, refreshIds)

      if (!graphHistoryState.isApplying) {
        const nodeId = confirmedNode.id
        const parentHandleId = this.parentHandleId
        const parentProp = this.parentHandleChildrenPropertyName
        const handleIsNode = this.handleIsNode
        const actionDiagramId = this.diagramId

        getHistoryForDiagram(actionDiagramId).push({
          label: 'Attach handle',
          undo: () => {
            const data = getRenderData(actionDiagramId)
            if (!data) return
            graphHistoryState.isApplying = true
            try {
              const n = data.allNodes.get(nodeId)
              if (n) n.data.originalNodeId = beforeOriginalNodeId
              deleteHandles(mutationCtxFromRenderData(data), [handleId])
              handleDataRevision.value++
              refreshPinFootprints(actionDiagramId, [nodeId])
            } finally {
              graphHistoryState.isApplying = false
            }
          },
          redo: () => {
            const data = getRenderData(actionDiagramId)
            if (!data) return
            graphHistoryState.isApplying = true
            try {
              const n = data.allNodes.get(nodeId)
              if (!n) return
              n.data.originalNodeId = handleId
              const ctx = mutationCtxFromRenderData(data)
              createHandle(ctx, handleId, JSON.parse(JSON.stringify(handleDataClone)))
              if (parentHandleId && parentProp && handleIsNode) {
                addHandleRefs(ctx, parentHandleId, parentProp, [handleId])
              }
              handleDataRevision.value++
              refreshPinFootprints(actionDiagramId, [nodeId])
            } finally {
              graphHistoryState.isApplying = false
            }
          },
        })
      }
    },
    dataFromSelected() {
      const selectedNodeValue = selectedNodeRef.value
      if (!selectedNodeValue) {
        console.error('No selected node')
        return
      }

      const gd = getRenderData(this.diagramId)
      if (!gd) {
        console.error('No graph data')
        return
      }

      const selectedNodeAnimgraphHandle = gd.handlesRegistry.get(
        selectedNodeValue.data.originalNodeId ?? ''
      )
      if (!selectedNodeAnimgraphHandle) {
        console.error('No attached animgraph handle')
        return
      }

      if (selectedNodeAnimgraphHandle.Data.$type !== this.handleData.$type) {
        console.error(
          'Handle type mismatch',
          selectedNodeAnimgraphHandle.Data.$type,
          this.handleData.$type
        )
        return
      }

      const dataCopy = JSON.parse(JSON.stringify(selectedNodeAnimgraphHandle.Data))
      Object.keys(this.handleData).forEach((key) => {
        this.handleData[key] = dataCopy[key]
      })
    },
  }

  return action
}

export const createAttachHandleActionForUI = () => {
  const action = createAttachHandleAction(requireActiveDiagramId())
  if (action) {
    attachHandleAction.value = action
    attachHandleToolState.actionNodeId = action.node.id
  }
}

export const clearAttachHandleAction = () => {
  attachHandleAction.value = null
  attachHandleToolState.actionNodeId = null
}

export function useAttachHandleTool() {
  const toolData = computed(() => ({
    hasSelection: Boolean(selectedNodeRef.value),
    actionNodeId: attachHandleToolState.actionNodeId,
  }))

  watch(
    toolData,
    (val) => {
      Object.assign(attachHandleToolCache, val)
    },
    { immediate: true }
  )

  return { toolData }
}

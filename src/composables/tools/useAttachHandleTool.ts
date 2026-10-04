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
      const beforeParentChildren =
        this.parentHandleId && this.parentHandleChildrenPropertyName
          ? JSON.parse(
              JSON.stringify(
                gd.handlesRegistry.get(this.parentHandleId)?.Data[this.parentHandleChildrenPropertyName] ??
                  null
              )
            )
          : null
      const beforeNodesToInit = JSON.parse(JSON.stringify(gd.originalAnimgraph?.nodesToInit ?? []))

      confirmedNode.data.originalNodeId = handleId

      gd.handlesRegistry.set(handleId, {
        HandleId: handleId,
        Data: handleData as AnimgraphObject,
      })

      if (this.parentHandleId && this.parentHandleChildrenPropertyName && this.handleIsNode) {
        const parentHandle = gd.handlesRegistry.get(this.parentHandleId)
        if (parentHandle) {
          const childrenPropValue = parentHandle.Data[this.parentHandleChildrenPropertyName]
          if (Array.isArray(childrenPropValue)) {
            childrenPropValue.push({ HandleRefId: handleId })

            const parentHandleChildrenHandler = NodeDefinitionRegistry.getHandleTypeChildrenHandler(
              parentHandle.Data.$type,
              this.parentHandleChildrenPropertyName
            )
            if (parentHandleChildrenHandler) {
              parentHandleChildrenHandler.ensureOrder(
                gd.handlesRegistry,
                parentHandle,
                this.parentHandleChildrenPropertyName
              )
            }
          } else if (!childrenPropValue) {
            parentHandle.Data[this.parentHandleChildrenPropertyName] = { HandleRefId: handleId }
          } else {
            console.warn(`Children property supports only one child and its set`, parentHandle, childrenPropValue)
          }
        } else {
          console.warn(`Parent handle not found: ${this.parentHandleId}`)
        }
      }

      if (this.handleIsNode) {
        gd.originalAnimgraph.nodesToInit.push({
          HandleRefId: handleId,
        })
      }

      handleDataRevision.value++
      refreshPinFootprints(this.diagramId, [confirmedNode.id])

      if (!graphHistoryState.isApplying) {
        const afterHandle = JSON.parse(JSON.stringify(gd.handlesRegistry.get(handleId)))
        const afterParentChildren =
          this.parentHandleId && this.parentHandleChildrenPropertyName
            ? JSON.parse(
                JSON.stringify(
                  gd.handlesRegistry.get(this.parentHandleId)?.Data[this.parentHandleChildrenPropertyName] ??
                    null
                )
              )
            : null
        const afterNodesToInit = JSON.parse(JSON.stringify(gd.originalAnimgraph?.nodesToInit ?? []))
        const nodeId = confirmedNode.id
        const parentHandleId = this.parentHandleId
        const parentProp = this.parentHandleChildrenPropertyName
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
              data.handlesRegistry.delete(handleId)
              if (parentHandleId && parentProp) {
                const parent = data.handlesRegistry.get(parentHandleId)
                if (parent) {
                  if (beforeParentChildren === null) delete parent.Data[parentProp]
                  else parent.Data[parentProp] = JSON.parse(JSON.stringify(beforeParentChildren))
                }
              }
              if (data.originalAnimgraph) {
                data.originalAnimgraph.nodesToInit = JSON.parse(JSON.stringify(beforeNodesToInit))
              }
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
              data.handlesRegistry.set(handleId, JSON.parse(JSON.stringify(afterHandle)))
              if (parentHandleId && parentProp) {
                const parent = data.handlesRegistry.get(parentHandleId)
                if (parent) {
                  if (afterParentChildren === null) delete parent.Data[parentProp]
                  else parent.Data[parentProp] = JSON.parse(JSON.stringify(afterParentChildren))
                }
              }
              if (data.originalAnimgraph) {
                data.originalAnimgraph.nodesToInit = JSON.parse(JSON.stringify(afterNodesToInit))
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

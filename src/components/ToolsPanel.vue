<template>
  <SidebarPanel
    :title="title"
    v-model:collapsed="collapsed"
    v-model:height="height"
    :fill="fill"
    :min-height="minHeight"
    :max-height="maxHeight"
  >
    <template v-if="sessionHeaderComp" #header>
      <component :is="sessionHeaderComp" v-bind="sessionHeaderProps" />
    </template>
    <template v-else-if="activeToolIds.length > 1" #header>
      <div class="tools-active-chips">
        <button
          v-for="id in activeToolIds"
          :key="id"
          type="button"
          class="tools-active-chip"
          :class="{ 'tools-active-chip--focused': id === tool }"
          :title="getAppToolLabel(id)"
          @click="toolManager.focusTool(id)"
        >
          <span class="tools-active-chip__label">{{ shortToolLabel(id) }}</span>
          <span
            class="tools-active-chip__close"
            title="Deactivate"
            @click.stop="toolManager.deactivateTool(id)"
          >×</span>
        </button>
      </div>
    </template>

    <component
      v-if="tool"
      :is="bodyComp"
      ref="bodyRef"
      v-bind="bodyProps"
      v-on="bodyListeners"
    />
  </SidebarPanel>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { AppToolId } from '../appTools/catalog'
import { getAppToolLabel } from '../appTools/catalog'
import { Commands } from '../appCommands/ids'
import type { AppCommandArgs } from '../commands'
import { executeCommand } from '../commands'
import SidebarPanel from './SidebarPanel.vue'
import { toolUiRegistry } from './tools/toolUiRegistry'
import { selectedNodeRef, selectedNodeIdsRef, nodePositionRef, nodeSizeRef } from '../stores/graphSession'
import {
  addNodeToolCache,
  arrangeInputsToolCache,
  arrangeSelectionToolCache,
  attachHandleToolState,
  moveToolState,
  resizeToolState,
} from '../stores/tools'
import { focusedTool, toolManager } from '../stores/toolManager'

const props = defineProps<{
  fill: boolean
  minHeight: number
  maxHeight: number
  resolveSelectInputsNewCount: (recursive: boolean) => number
}>()

const collapsed = defineModel<boolean>('collapsed', { default: false })
const height = defineModel<number>('height', { required: true })

const bodyRef = ref<unknown>(null)

const tool = focusedTool
const title = computed(() => getAppToolLabel(tool.value))
const activeToolIds = computed(() => toolManager.getActiveToolIds())
const selectedCount = computed(() => selectedNodeIdsRef.value.length)
const hasSelection = computed(() => Boolean(selectedNodeRef.value))

const uiEntry = computed(() => (tool.value ? toolUiRegistry[tool.value] : null))
const bodyComp = computed(() => uiEntry.value?.Body)

const sessionHeaderComp = computed(() => {
  if (!uiEntry.value?.Header || !tool.value) return undefined
  if (tool.value === 'move' && moveToolState.session) return uiEntry.value.Header
  if (tool.value === 'resize' && resizeToolState.session) return uiEntry.value.Header
  return undefined
})

const resizeSizeDelta = computed(() => {
  const session = resizeToolState.session
  const primaryId = selectedNodeRef.value?.id
  if (!session || !primaryId) return { width: 0, height: 0 }
  const start = session.startLayouts.get(primaryId)
  if (!start) return { width: 0, height: 0 }
  const size = nodeSizeRef.value
  return {
    width: size.width - start.width,
    height: size.height - start.height,
  }
})

const sessionHeaderProps = computed(() => {
  if (tool.value === 'move') {
    const session = moveToolState.session
    return {
      position: nodePositionRef.value,
      delta: session ? { ...session.appliedDelta } : { x: 0, y: 0 },
    }
  }
  if (tool.value === 'resize') {
    return {
      size: nodeSizeRef.value,
      position: nodePositionRef.value,
      sizeDelta: resizeSizeDelta.value,
    }
  }
  return {}
})

const bodyProps = computed(() => {
  switch (tool.value) {
    case 'move': {
      const session = moveToolState.session
      return {
        selectedCount: selectedCount.value,
        active: Boolean(session),
        position: nodePositionRef.value,
        delta: session ? { ...session.appliedDelta } : { x: 0, y: 0 },
        axisLock: session?.axisLock ?? ('none' as const),
      }
    }
    case 'resize': {
      const session = resizeToolState.session
      return {
        selectedCount: selectedCount.value,
        active: Boolean(session),
        size: nodeSizeRef.value,
        position: nodePositionRef.value,
        sizeDelta: resizeSizeDelta.value,
        sideLock: session?.sideLock ?? ('none' as const),
      }
    }
    case 'addNode':
      return { ...addNodeToolCache }
    case 'pasteNode':
      return {}
    case 'addConnection':
      return {}
    case 'arrangeInputs':
      return {
        hasSelection: hasSelection.value,
        ...arrangeInputsToolCache,
      }
    case 'selectInputs':
      return {
        selectedCount: selectedCount.value,
        resolveNewCount: props.resolveSelectInputsNewCount,
      }
    case 'arrangeSelection':
      return {
        selectedCount: selectedCount.value,
        ...arrangeSelectionToolCache,
      }
    case 'attachHandle':
      return {
        hasSelection: hasSelection.value,
        actionNodeId: attachHandleToolState.actionNodeId,
      }
    default:
      return {}
  }
})

const bodyListeners = computed(() => {
  switch (tool.value) {
    case 'move':
      return {
        start: () => executeCommand(Commands.grabMove.begin),
        confirm: () => executeCommand(Commands.grabMove.confirm),
        cancel: () => executeCommand(Commands.grabMove.cancel),
        clearAxisLock: () => executeCommand(Commands.grabMove.clearAxisLock),
        setAxisLock: (v: 'x' | 'y') =>
          executeCommand(v === 'x' ? Commands.grabMove.lockX : Commands.grabMove.lockY),
      }
    case 'resize':
      return {
        start: () => executeCommand(Commands.resize.begin),
        confirm: () => executeCommand(Commands.resize.confirm),
        cancel: () => executeCommand(Commands.resize.cancel),
        clearSideLock: () => executeCommand(Commands.resize.clearSideLock),
        setSideLock: (v: 'left' | 'right' | 'top' | 'bottom') => {
          if (v === 'top') executeCommand(Commands.resize.lockTop)
          else if (v === 'left') executeCommand(Commands.resize.lockLeft)
          else if (v === 'bottom') executeCommand(Commands.resize.lockBottom)
          else executeCommand(Commands.resize.lockRight)
        },
      }
    case 'addNode':
      return {
        add: (p: { id: string; type: string; slotName?: string }) =>
          executeCommand(Commands.nodes.add, p),
      }
    case 'pasteNode':
      return {
        paste: () => executeCommand(Commands.nodes.paste),
      }
    case 'addConnection':
      return {
        create: (p: { fromId: string; toId: string; pinName: string }) =>
          executeCommand(Commands.addConnection.create, p),
      }
    case 'arrangeInputs':
      return {
        selectAll: () => executeCommand(Commands.arrangeInputs.selectAll),
        deselectAll: () => executeCommand(Commands.arrangeInputs.deselectAll),
        toggle: (key: string, checked: boolean) =>
          executeCommand(Commands.arrangeInputs.toggle, { key, checked }),
        arrange: (p: { margin: number; spacing: number }) =>
          executeCommand(Commands.arrangeInputs.run, p),
      }
    case 'selectInputs':
      return {
        add: (recursive: boolean) => executeCommand(Commands.selectInputs.add, { recursive }),
      }
    case 'arrangeSelection':
      return {
        arrange: (p: AppCommandArgs<typeof Commands.arrangeSelection.run>) =>
          executeCommand(Commands.arrangeSelection.run, p),
      }
    case 'attachHandle':
      return {
        create: () => executeCommand(Commands.attachHandle.create),
        clear: () => executeCommand(Commands.attachHandle.clear),
        dataFromSelected: () => executeCommand(Commands.attachHandle.dataFromSelected),
        run: () => executeCommand(Commands.attachHandle.run),
      }
    default:
      return {}
  }
})

const shortToolLabel = (id: AppToolId) =>
  getAppToolLabel(id).replace(/^Arrange /, '').slice(0, 10)
</script>

<style>
.tools-active-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  max-width: 100%;
}

.tools-active-chip {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  max-width: 7.5rem;
  padding: 1px 2px 1px 6px;
  border: 1px solid #545454;
  border-radius: var(--radius-sm);
  background: #2a2a2a;
  color: #c8c8dc;
  font-size: 10px;
  line-height: 1.2;
  cursor: pointer;
}

.tools-active-chip:hover {
  background: #3a3a3a;
}

.tools-active-chip--focused {
  border-color: #4772b3;
  background: #2a3545;
  color: #e6e6e6;
}

.tools-active-chip__label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tools-active-chip__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  border-radius: 2px;
  opacity: 0.7;
  font-size: 12px;
  line-height: 1;
}

.tools-active-chip__close:hover {
  background: #444;
  opacity: 1;
}

.tool-hint {
  margin: 0;
  color: #c8c8dc;
  font-size: 12px;
  line-height: 1.4;
  text-align: center;
}

.tool-hint--muted {
  color: #8a8a9a;
  text-align: left;
}

.tool-hint--hotkeys {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 4px 6px;
}

.tool-action-info {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  padding: 4px 0;
  font-size: 12px;
}

.tool-action-label {
  color: #a0a0b0;
}

.tool-action-value {
  color: #e6e6e6;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 11px;
}
</style>

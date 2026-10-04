<script setup lang="ts">
import {
  Check,
  ChevronDown,
  ChevronUp,
  CircleHelp,
  CircleOff,
  DownloadIcon,
  FolderOpenIcon,
  InfoIcon,
  LayoutGrid,
  Network,
  Redo2,
  SaveIcon,
  SettingsIcon,
  Trash2,
  Undo2,
  Waypoints,
  Workflow,
} from 'lucide-vue-next'
import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarLabel,
  MenubarMenu,
  MenubarSeparator,
  MenubarShortcut,
  MenubarTrigger,
} from '@/components/ui/menubar'
import { computed } from 'vue'
import { isElectron } from '../utils/platform'
import { isSettingsWindowOpen, toggleSettingsWindow } from '../stores/appWindows'
import { hasProject } from '../stores/graphProject'
import { selectedNodeRef } from '../stores/graphSession'
import { commandShortcut } from '../stores/hotkeyBindings'
import { canToggleAppTool, commandEnabled, whenEnabled } from '../stores/appContext'
import { activeToolsRegistry } from '../stores/toolManager'
import { ANIM_NODE_STATE_TYPE_SET } from '../utils/graph/animNodeStateTypes'
import { isSmStatesPropertyGroup } from '../utils/graph/DiagramConversion'
import HotkeyKbd from './HotkeyKbd.vue'
import {
  addMenuTools,
  arrangeMenuTools,
  editMenuTools,
  selectMenuTools,
  type AppToolId,
} from '../appTools/catalog'

defineProps<{
  filename: string | null
  canUndo: boolean
  canRedo: boolean
  canDeleteSelection: boolean
  canMoveSmStateUp: boolean
  canMoveSmStateDown: boolean
  canLayoutSmStatesGroup: boolean
  undoTitle: string
  redoTitle: string
  graphInfo: boolean
  simOpen: boolean
  debugMode: boolean
}>()

const emit = defineEmits<{
  'update:graphInfo': [value: boolean]
  'load-sample': []
  open: []
  'add-animgraph': []
  save: []
  'save-as': []
  export: []
  undo: []
  redo: []
  delete: []
  'deselect-all': []
  'select-children': []
  'move-sm-state-up': []
  'move-sm-state-down': []
  'layout-sm-states-group': []
  'toggle-sim': []
  'toggle-tool': [id: AppToolId]
  'open-render-stats': []
  about: []
}>()

const isStateSelected = computed(() => {
  const node = selectedNodeRef.value
  return Boolean(node && ANIM_NODE_STATE_TYPE_SET.has(node.type))
})

const isSmStatesGroupSelected = computed(() => isSmStatesPropertyGroup(selectedNodeRef.value))

const hasNodeMenuItems = computed(
  () => isStateSelected.value || isSmStatesGroupSelected.value
)

const graphEditable = computed(() => whenEnabled('graphEditable'))
const electronApp = isElectron()

async function onQuit() {
  await window.electronAPI?.windowClose()
}
</script>

<template>
  <Menubar
    class="header-menubar h-auto gap-px rounded-none border-0 bg-transparent p-0 shadow-none"
    aria-label="Main menu"
  >
    <MenubarMenu>
      <MenubarTrigger class="header-menu-btn">File</MenubarTrigger>
      <MenubarContent class="header-menu-content" :side-offset="4" :align-offset="0">
        <template v-if="filename">
          <MenubarLabel
            class="header-menu-file max-w-64 truncate font-data text-xs font-normal text-muted-foreground"
            :title="filename"
          >
            {{ filename }}
          </MenubarLabel>
          <MenubarSeparator />
        </template>
        <MenubarItem v-if="!hasProject" class="header-menu-item" @select="emit('load-sample')">
          Load Sample
        </MenubarItem>
        <MenubarItem class="header-menu-item" @select="emit('open')">
          <FolderOpenIcon class="size-3.5" />
          Open...
        </MenubarItem>
        <MenubarItem
          v-if="hasProject"
          class="header-menu-item"
          @select="emit('add-animgraph')"
        >
          <Workflow class="size-3.5" />
          Add Animgraph...
        </MenubarItem>
        <MenubarSeparator />
        <MenubarItem
          class="header-menu-item"
          :disabled="!hasProject"
          @select="emit('save')"
        >
          <SaveIcon class="size-3.5" />
          Save
          <MenubarShortcut v-if="commandShortcut('document.save')">
            <HotkeyKbd command="document.save" size="sm" />
          </MenubarShortcut>
        </MenubarItem>
        <MenubarItem
          class="header-menu-item"
          :disabled="!hasProject"
          @select="emit('save-as')"
        >
          <SaveIcon class="size-3.5" />
          Save As...
          <MenubarShortcut v-if="commandShortcut('document.saveAs')">
            <HotkeyKbd command="document.saveAs" size="sm" />
          </MenubarShortcut>
        </MenubarItem>
        <MenubarSeparator />
        <MenubarItem
          class="header-menu-item"
          :disabled="!hasProject"
          @select="emit('export')"
        >
          <DownloadIcon class="size-3.5" />
          Export...
        </MenubarItem>
        <template v-if="electronApp">
          <MenubarSeparator />
          <MenubarItem class="header-menu-item" @select="onQuit">
            Quit
          </MenubarItem>
        </template>
      </MenubarContent>
    </MenubarMenu>

    <MenubarMenu>
      <MenubarTrigger class="header-menu-btn" :disabled="!hasProject">Edit</MenubarTrigger>
      <MenubarContent class="header-menu-content min-w-48" :side-offset="4" :align-offset="0">
        <MenubarItem
          class="header-menu-item"
          :disabled="!canUndo"
          :title="undoTitle"
          @select="emit('undo')"
        >
          <Undo2 class="size-3.5" />
          Undo
          <MenubarShortcut v-if="commandShortcut('history.undo')">
            <HotkeyKbd command="history.undo" size="sm" />
          </MenubarShortcut>
        </MenubarItem>
        <MenubarItem
          class="header-menu-item"
          :disabled="!canRedo"
          :title="redoTitle"
          @select="emit('redo')"
        >
          <Redo2 class="size-3.5" />
          Redo
          <MenubarShortcut v-if="commandShortcut('history.redo')">
            <HotkeyKbd command="history.redo" size="sm" />
          </MenubarShortcut>
        </MenubarItem>
        <MenubarSeparator />
        <MenubarItem
          class="header-menu-item"
          :disabled="!canDeleteSelection"
          :title="commandShortcut('selection.delete') ? `Delete selected node (${commandShortcut('selection.delete')})` : 'Delete selected node'"
          @select="emit('delete')"
        >
          <Trash2 class="size-3.5" />
          Delete
          <MenubarShortcut v-if="commandShortcut('selection.delete')">
            <HotkeyKbd command="selection.delete" size="sm" />
          </MenubarShortcut>
        </MenubarItem>
        <MenubarSeparator />
        <MenubarItem
          v-for="tool in editMenuTools"
          :key="tool.id"
          class="header-menu-item"
          :disabled="!canToggleAppTool(tool.id)"
          :title="tool.label"
          @select="emit('toggle-tool', tool.id)"
        >
          <component :is="tool.icon" class="size-3.5" />
          {{ tool.label }}
          <Check v-if="activeToolsRegistry[tool.id]" class="ml-auto size-3.5 opacity-80" />
          <MenubarShortcut v-else-if="tool.commandId && commandShortcut(tool.commandId)">
            <HotkeyKbd :command="tool.commandId" size="sm" />
          </MenubarShortcut>
        </MenubarItem>
      </MenubarContent>
    </MenubarMenu>

    <MenubarMenu>
      <MenubarTrigger class="header-menu-btn" :disabled="!hasProject || !graphEditable">Select</MenubarTrigger>
      <MenubarContent class="header-menu-content min-w-52" :side-offset="4" :align-offset="0">
        <MenubarItem
          class="header-menu-item"
          :disabled="!commandEnabled('selection.deselectAll')"
          title="Clear node selection"
          @select="emit('deselect-all')"
        >
          <CircleOff class="size-3.5" />
          Deselect All
        </MenubarItem>
        <MenubarSeparator />
        <MenubarItem
          class="header-menu-item"
          :disabled="!commandEnabled('selection.selectChildren')"
          title="Add direct children of selected nodes to selection"
          @select="emit('select-children')"
        >
          <Network class="size-3.5" />
          Select Children
        </MenubarItem>
        <MenubarItem
          v-for="tool in selectMenuTools"
          :key="tool.id"
          class="header-menu-item"
          :disabled="!canToggleAppTool(tool.id)"
          @select="emit('toggle-tool', tool.id)"
        >
          <component :is="tool.icon" class="size-3.5" />
          {{ tool.label }}
          <Check v-if="activeToolsRegistry[tool.id]" class="ml-auto size-3.5 opacity-80" />
        </MenubarItem>
      </MenubarContent>
    </MenubarMenu>

    <MenubarMenu>
      <MenubarTrigger class="header-menu-btn" :disabled="!hasProject || !graphEditable">Arrange</MenubarTrigger>
      <MenubarContent class="header-menu-content min-w-52" :side-offset="4" :align-offset="0">
        <MenubarItem
          v-for="tool in arrangeMenuTools"
          :key="tool.id"
          class="header-menu-item"
          :disabled="!canToggleAppTool(tool.id)"
          @select="emit('toggle-tool', tool.id)"
        >
          <component :is="tool.icon" class="size-3.5" />
          {{ tool.label }}
          <Check v-if="activeToolsRegistry[tool.id]" class="ml-auto size-3.5 opacity-80" />
        </MenubarItem>
      </MenubarContent>
    </MenubarMenu>

    <MenubarMenu>
      <MenubarTrigger class="header-menu-btn" :disabled="!hasProject || !graphEditable">Add</MenubarTrigger>
      <MenubarContent class="header-menu-content min-w-52" :side-offset="4" :align-offset="0">
        <MenubarItem
          v-for="tool in addMenuTools"
          :key="tool.id"
          class="header-menu-item"
          :disabled="!canToggleAppTool(tool.id)"
          @select="emit('toggle-tool', tool.id)"
        >
          <component :is="tool.icon" class="size-3.5" />
          {{ tool.label }}
          <Check v-if="activeToolsRegistry[tool.id]" class="ml-auto size-3.5 opacity-80" />
          <MenubarShortcut v-else-if="tool.commandId && commandShortcut(tool.commandId)">
            <HotkeyKbd :command="tool.commandId" size="sm" />
          </MenubarShortcut>
        </MenubarItem>
      </MenubarContent>
    </MenubarMenu>

    <MenubarMenu v-if="hasNodeMenuItems">
      <MenubarTrigger class="header-menu-btn">Node</MenubarTrigger>
      <MenubarContent class="header-menu-content min-w-48" :side-offset="4" :align-offset="0">
        <MenubarItem
          v-if="isStateSelected"
          class="header-menu-item"
          :disabled="!canMoveSmStateUp"
          title="Move selected State earlier in SM.states"
          @select="emit('move-sm-state-up')"
        >
          <ChevronUp class="size-3.5" />
          Move State Up
        </MenubarItem>
        <MenubarItem
          v-if="isStateSelected"
          class="header-menu-item"
          :disabled="!canMoveSmStateDown"
          title="Move selected State later in SM.states"
          @select="emit('move-sm-state-down')"
        >
          <ChevronDown class="size-3.5" />
          Move State Down
        </MenubarItem>
        <MenubarItem
          v-if="isSmStatesGroupSelected"
          class="header-menu-item"
          :disabled="!canLayoutSmStatesGroup"
          title="Layout states children and fit PropertyGroup size"
          @select="emit('layout-sm-states-group')"
        >
          <LayoutGrid class="size-3.5" />
          Layout States Group
        </MenubarItem>
      </MenubarContent>
    </MenubarMenu>
    <button
      v-else
      type="button"
      class="header-menu-btn"
      disabled
    >
      Node
    </button>

    <MenubarMenu>
      <MenubarTrigger class="header-menu-btn">View</MenubarTrigger>
      <MenubarContent class="header-menu-content" :side-offset="4" :align-offset="0">
        <MenubarItem
          class="header-menu-item"
          :disabled="!hasProject"
          @select="emit('update:graphInfo', !graphInfo)"
        >
          <InfoIcon class="size-3.5" />
          Graph Info
          <Check v-if="graphInfo" class="ml-auto size-3.5 opacity-80" />
        </MenubarItem>
        <MenubarItem
          class="header-menu-item"
          :disabled="!hasProject"
          @select="emit('toggle-sim')"
        >
          <Waypoints class="size-3.5" />
          Simulation
          <Check v-if="simOpen" class="ml-auto size-3.5 opacity-80" />
        </MenubarItem>
        <MenubarItem
          class="header-menu-item"
          @select="toggleSettingsWindow(!isSettingsWindowOpen)"
        >
          <SettingsIcon class="size-3.5" />
          Settings
          <Check v-if="isSettingsWindowOpen" class="ml-auto size-3.5 opacity-80" />
        </MenubarItem>
        <MenubarSeparator />
        <MenubarItem class="header-menu-item" @select="emit('about')">
          <CircleHelp class="size-3.5" />
          About
        </MenubarItem>
        <template v-if="debugMode">
          <MenubarSeparator />
          <MenubarItem
            class="header-menu-item"
            :disabled="!hasProject"
            @select="emit('open-render-stats')"
          >
            Render Stats for Active
          </MenubarItem>
        </template>
      </MenubarContent>
    </MenubarMenu>
  </Menubar>
</template>

<style scoped>
.header-menubar {
  display: flex;
  align-items: center;
  gap: 1px;
  min-width: 0;
  padding: 0 4px;
}

.header-menu-btn {
  display: inline-flex;
  align-items: center;
  height: 24px;
  padding: 0 8px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: #e6e6e6;
  font-size: 12px;
  font-weight: 500;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  transition: background 0.1s ease, color 0.1s ease;
}

.header-menu-btn:hover:not(:disabled):not([data-disabled]),
.header-menu-btn:focus:not(:disabled):not([data-disabled]),
.header-menu-btn[data-state='open'] {
  background: #4772b3;
  color: #ffffff;
}

.header-menu-btn:disabled,
.header-menu-btn[data-disabled] {
  opacity: 0.4;
  cursor: default;
}

.header-menu-content {
  min-width: 12rem;
}

.header-menu-item {
  gap: 8px;
  font-size: 12px;
}
</style>

<template>
  <Tabs
    v-model="activeNodeDetailsTab"
    class="w-full min-h-0 flex-col gap-0"
    :class="fill && !collapsed ? 'flex-1 basis-0' : 'flex-none'"
  >
    <SidebarPanel
      :title="title"
      v-model:collapsed="collapsed"
      v-model:height="height"
      :fill="fill"
      :min-height="minHeight"
      :max-height="maxHeight"
    >
      <template #header>
        <button
          type="button"
          class="sidebar-node-details-btn"
          :title="openScopeTitle"
          :disabled="!hasSelection"
          @click="emit('openBody')"
        >
          <ScanEyeIcon :size="14" />
        </button>
        <button
          type="button"
          class="sidebar-node-details-btn"
          title="Open children in lens window (Shift: include node itself)"
          :disabled="!hasSelection"
          @click="emit('openLens', $event)"
        >
          <AppWindowIcon :size="14" />
        </button>
        <button
          type="button"
          class="sidebar-node-details-btn"
          title="Pan to node"
          :disabled="!hasSelection"
          @click="emit('panTo')"
        >
          <LocateFixedIcon :size="14" />
        </button>
      </template>
      <template v-if="hasSelection" #subheader>
        <div class="sidebar-node-details-subheader">
          <div
            v-if="visibleTypeActions.length > 0"
            class="sidebar-node-details-subheader__row"
          >
            <NodeDetailsTypeActions />
          </div>
          <div
            ref="tabsRowEl"
            class="sidebar-node-details-subheader__row sidebar-node-details-subheader__row--tabs"
          >
            <TabsList class="grid h-8 w-full shrink-0 grid-cols-4 rounded-sm bg-muted/60 p-0.5">
              <TabsTrigger
                value="typeDetails"
                class="h-7 gap-1 rounded-sm px-1 text-[11px]"
                :title="propsTabTitle"
                :aria-label="propsTabTitle"
              >
                <SlidersHorizontal class="size-3.5 shrink-0" :size="14" />
                <span v-if="!tabsIconOnly" class="truncate">{{ propsTabTitle }}</span>
              </TabsTrigger>
              <TabsTrigger
                value="general"
                class="h-7 gap-1 rounded-sm px-1 text-[11px]"
                title="General"
                aria-label="General"
              >
                <Info class="size-3.5 shrink-0" :size="14" />
                <span v-if="!tabsIconOnly" class="truncate">General</span>
              </TabsTrigger>
              <TabsTrigger
                value="transform"
                class="h-7 gap-1 rounded-sm px-1 text-[11px]"
                title="Transform"
                aria-label="Transform"
              >
                <Move class="size-3.5 shrink-0" :size="14" />
                <span v-if="!tabsIconOnly" class="truncate">Transform</span>
              </TabsTrigger>
              <TabsTrigger
                value="connections"
                class="h-7 gap-1 rounded-sm px-1 text-[11px]"
                title="Connections"
                aria-label="Connections"
              >
                <Link2 class="size-3.5 shrink-0" :size="14" />
                <span v-if="!tabsIconOnly" class="truncate">Connections</span>
                <span
                  v-if="selectedNodeConnectionCount > 0"
                  class="shrink-0 opacity-70"
                  :class="tabsIconOnly ? 'text-[10px]' : 'ml-0.5'"
                >{{ selectedNodeConnectionCount }}</span>
              </TabsTrigger>
            </TabsList>
          </div>
        </div>
      </template>
      <div v-if="!hasSelection" class="node-details-empty">
        <p>Select a node on the graph</p>
      </div>
      <div v-else class="sidebar-node-details-body">
        <NodeDetailsAccordion />
      </div>
    </SidebarPanel>
  </Tabs>
</template>

<script setup lang="ts">
import { computed, inject, ref } from 'vue'
import { useResizeObserver } from '@vueuse/core'
import {
  AppWindowIcon,
  Info,
  Link2,
  LocateFixedIcon,
  Move,
  ScanEyeIcon,
  SlidersHorizontal,
} from 'lucide-vue-next'
import NodeDetailsAccordion from './NodeDetailsAccordion.vue'
import NodeDetailsTypeActions from './nodeDetails/NodeDetailsTypeActions.vue'
import { resolveDiagramDetailsPanel } from './nodeDetails'
import SidebarPanel from './SidebarPanel.vue'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useDiagramDetailsTypeActions } from './nodeDetails/useDiagramDetailsTypeActions'
import type { NodeDetailsContext } from '../composables/useNodeDetailsContext'
import { nodeDetailsContextKey } from '../composables/useNodeDetailsContext'

/** Below this tabs-row width, show icons only. */
const TABS_ICON_ONLY_MAX_WIDTH = 360

defineProps<{
  title: string
  hasSelection: boolean
  openScopeTitle: string
  fill: boolean
  minHeight: number
  maxHeight: number
}>()

const collapsed = defineModel<boolean>('collapsed', { default: false })
const height = defineModel<number>('height', { required: true })

const emit = defineEmits<{
  openBody: []
  openLens: [event: MouseEvent]
  panTo: []
}>()

const {
  selectedNode,
  activeNodeDetailsTab,
  selectedNodeConnectionCount,
} = inject<NodeDetailsContext>(nodeDetailsContextKey)!

const { visibleTypeActions } = useDiagramDetailsTypeActions()

const propsTabTitle = computed(
  () => resolveDiagramDetailsPanel(selectedNode.value?.type)?.title ?? 'Props'
)

const tabsRowEl = ref<HTMLElement | null>(null)
const tabsIconOnly = ref(false)

useResizeObserver(tabsRowEl, (entries) => {
  const width = entries[0]?.contentRect.width ?? 0
  tabsIconOnly.value = width > 0 && width < TABS_ICON_ONLY_MAX_WIDTH
})
</script>

<style scoped>
.sidebar-node-details-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border-radius: 4px;
  background: #2a3545;
  border: 1px solid rgba(100, 100, 130, 0.5);
  color: #c8d8e8;
}

.sidebar-node-details-btn:hover:not(:disabled) {
  background: #3a4a60;
}

.sidebar-node-details-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.sidebar-node-details-subheader {
  display: flex;
  width: 100%;
  flex-direction: column;
  align-items: stretch;
}

.sidebar-node-details-subheader__row {
  display: flex;
  align-items: center;
  min-height: 32px;
  padding: 0 8px;
  border-bottom: 1px solid #1f1f1f;
}

.sidebar-node-details-subheader__row:last-child {
  border-bottom: none;
}

.sidebar-node-details-subheader__row--tabs {
  padding: 4px 8px;
}

.sidebar-node-details-body {
  display: flex;
  flex: 1 0 auto;
  flex-direction: column;
  min-height: 0;
}

.node-details-empty {
  padding: 8px 0;
  color: #999;
  font-size: 12px;
}
</style>

<template>
  <footer
    v-if="
      diagramTaskbarItemsComputed.length > 0 ||
      bodyViewTaskbarItemsComputed.length > 0 ||
      windowItems.length > 0 ||
      (pinnedItems?.length ?? 0) > 0 ||
      showSimOverlaySelectComputed
    "
    class="relative z-60 flex h-9 shrink-0 items-center gap-2 overflow-x-auto overflow-y-hidden border-t border-border bg-panel px-2 py-1"
  >
    <div
      v-if="showSimOverlaySelectComputed"
      class="flex shrink-0 items-center gap-1 pr-1"
    >
      <SimRunnerSelect
        v-model="overlayRunnerId"
        :diagram-id="activeDiagramIdRef"
        trigger-class="h-6! w-[8.5rem]"
        trigger-title="Runner whose sim overlay to paint on the active diagram"
        placeholder="Runner"
      >
        <template #leading>
          <Waypoints class="shrink-0 opacity-85" :size="12" aria-hidden="true" />
        </template>
      </SimRunnerSelect>
      <div
        v-if="diagramTaskbarItemsComputed.length > 0"
        class="my-1 h-4 w-px shrink-0 self-center bg-hairline"
        aria-hidden="true"
      />
    </div>

    <div v-if="diagramTaskbarItemsComputed.length > 0" class="flex shrink-0 items-center gap-1 pr-1">
      <Button
        v-for="item in diagramTaskbarItemsComputed"
        :key="item.id"
        type="button"
        variant="ghost"
        size="sm"
        class="h-6 max-w-[180px] shrink-0 justify-start gap-1.5 rounded-sm border border-transparent px-2.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
        :class="itemClass(item)"
        :title="item.title"
        @click="emit('select-diagram', item.id)"
      >
        <span class="shrink-0 text-[10px] opacity-85">▤</span>
        <span class="truncate">{{ item.title }}</span>
      </Button>
    </div>

    <div v-if="(pinnedItems?.length ?? 0) > 0" class="flex shrink-0 items-center gap-1 pr-1">
      <div
        v-if="diagramTaskbarItemsComputed.length > 0"
        class="my-1 h-4 w-px shrink-0 self-center bg-hairline"
        aria-hidden="true"
      />
      <Button
        v-for="item in pinnedItems"
        :key="item.id"
        type="button"
        variant="ghost"
        size="sm"
        class="h-6 max-w-[220px] shrink-0 justify-start gap-1.5 rounded-sm border border-transparent px-2.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
        :class="itemClass(item)"
        :title="item.title"
        @click="emit('select', item.id)"
      >
        <span class="shrink-0 text-[10px] opacity-85">▢</span>
        <span class="truncate">{{ item.title }}</span>
      </Button>
    </div>

    <template v-if="bodyViewTaskbarItemsComputed.length > 0">
      <div
        v-if="diagramTaskbarItemsComputed.length > 0 || (pinnedItems?.length ?? 0) > 0"
        class="my-1 h-4 w-px shrink-0 self-center bg-hairline"
        aria-hidden="true"
      />
      <div class="flex shrink-0 items-center gap-1 px-1">
        <Button
          v-for="item in bodyViewTaskbarItemsComputed"
          :key="item.id"
          type="button"
          variant="ghost"
          size="sm"
          class="h-6 max-w-[220px] shrink-0 justify-start gap-1.5 rounded-sm border border-transparent px-2.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
          :class="itemClass(item)"
          :title="item.title"
          @click="emit('select', item.id)"
        >
          <span class="shrink-0 text-[10px] opacity-85">▣</span>
          <span class="truncate">{{ item.title }}</span>
        </Button>
      </div>
    </template>

    <template v-if="windowItems.length > 0">
      <div
        v-if="bodyViewTaskbarItemsComputed.length > 0 || diagramTaskbarItemsComputed.length > 0 || (pinnedItems?.length ?? 0) > 0"
        class="my-1 h-4 w-0.5 shrink-0 self-center bg-hairline"
        aria-hidden="true"
      />
      <div class="flex shrink-0 items-center gap-1 px-1">
        <Button
          v-for="item in windowItems"
          :key="item.id"
          type="button"
          variant="ghost"
          size="sm"
          class="h-6 max-w-[220px] shrink-0 justify-start gap-1.5 rounded-sm border border-transparent px-2.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
          :class="itemClass(item)"
          :title="item.title"
          @click="emit('select', item.id)"
        >
          <span class="shrink-0 text-[10px] opacity-85">{{ iconFor(item.type) }}</span>
          <span class="truncate">{{ item.title }}</span>
        </Button>
      </div>
    </template>
  </footer>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Waypoints } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import SimRunnerSelect from './sim/SimRunnerSelect.vue'
import { activeDiagramId as activeDiagramIdRef, listDiagramIds } from '../stores/graphProject'
import { sim } from '../stores/animgraphSim'
import { activeBodyViewId as activeBodyViewIdRef, bodyBelongsToDiagram, bodyViews } from '@/stores/bodyViews.ts'
import { bodyViewRoot, bodyViewTop } from '@/types/DiagramBodyView.ts'

export interface TaskbarItem {
  id: string
  title: string
  type: string
  minimized: boolean
  active: boolean
  preview?: boolean
}

const overlayRunnerId = defineModel<string>('overlayRunnerId', { default: '' })

const props = withDefaults(
  defineProps<{
    pinnedItems?: TaskbarItem[]
    windowItems?: TaskbarItem[]
  }>(),
  {
    pinnedItems: () => [],
    windowItems: () => [],
  }
)

const emit = defineEmits<{
  select: [id: string]
  'select-diagram': [id: string]
}>()

const showSimOverlaySelectComputed = computed(() => {
  return sim.active.value === true && !!activeDiagramIdRef.value
})

const diagramTaskbarItemsComputed = computed(() => {
  const activeDiagramId = activeDiagramIdRef.value
  return listDiagramIds.value.map((diagramId): TaskbarItem => {
    return {
      id: diagramId,
      title: diagramId,
      type: 'diagram',
      minimized: false,
      active: activeDiagramId === diagramId,
    }
  })
})

const bodyViewTaskbarItemsComputed = computed(() => {
  const activeDiagramId = activeDiagramIdRef.value
  if (!activeDiagramId) return []

  const root = bodyViews.value.find((bodyView) => {
    return !bodyView.closable && bodyView.id === activeDiagramId
  })
  const parallels = bodyViews.value.filter((bodyView) => {
    return bodyView.closable && bodyBelongsToDiagram(bodyView, activeDiagramId)
  })

  const activeBodyViewId = activeBodyViewIdRef.value

  const items: Array<TaskbarItem> = []

  if (root && parallels.length > 0) {
    items.push({
      id: root.id,
      title: bodyViewRoot(root).title,
      type: 'body-main',
      minimized: activeBodyViewId !== root.id,
      active: activeBodyViewId === root.id,
      preview: false,
    })
  }

  for (const bodyView of parallels) {
    items.push({
      id: bodyView.id,
      title: `${bodyView.preview ? 'Preview · ' : ''}${bodyViewTop(bodyView).title}`,
      type: 'body-view',
      minimized: bodyView.minimized || activeBodyViewId !== bodyView.id,
      active: activeBodyViewId === bodyView.id && !bodyView.minimized,
      preview: bodyView.preview,
    })
  }

  return items
})

const itemClass = (item: TaskbarItem) => ({
  'bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground': item.active,
  'opacity-65 italic': item.minimized,
  'border-dashed border-hairline': item.preview && !item.active,
})

const iconFor = (type: string): string => {
  if (type === 'body-view') return '▣'
  if (type === 'body-main' || type === 'diagram') return '▤'
  if (type === 'lens') return '◉'
  if (type === 'sm-ring') return '◎'
  if (type === 'state-links') return '⧉'
  if (type === 'settings') return '⚙'
  if (type === 'render-stats') return '▤'
  if (type === 'sim-skeleton') return '◇'
  if (type === 'sim-status') return '◫'
  return '▢'
}
</script>

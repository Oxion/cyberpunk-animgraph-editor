<template>
  <footer
    v-if="
      diagramItems.length > 0 ||
      bodyItems.length > 0 ||
      windowItems.length > 0 ||
      (pinnedItems?.length ?? 0) > 0
    "
    class="relative z-60 flex h-9 shrink-0 items-center gap-2 overflow-x-auto overflow-y-hidden border-t border-border bg-panel px-2 py-1"
  >
    <div v-if="diagramItems.length > 0" class="flex shrink-0 items-center gap-1 pr-1">
      <Button
        v-for="item in diagramItems"
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
        v-if="diagramItems.length > 0"
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

    <template v-if="bodyItems.length > 0">
      <div
        v-if="diagramItems.length > 0 || (pinnedItems?.length ?? 0) > 0"
        class="my-1 h-4 w-px shrink-0 self-center bg-hairline"
        aria-hidden="true"
      />
      <div class="flex shrink-0 items-center gap-1 px-1">
        <Button
          v-for="item in bodyItems"
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
        v-if="bodyItems.length > 0 || diagramItems.length > 0 || (pinnedItems?.length ?? 0) > 0"
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
import { Button } from '@/components/ui/button'

export interface TaskbarItem {
  id: string
  title: string
  type: string
  minimized: boolean
  active: boolean
  preview?: boolean
}

withDefaults(
  defineProps<{
    diagramItems?: TaskbarItem[]
    pinnedItems?: TaskbarItem[]
    bodyItems?: TaskbarItem[]
    windowItems?: TaskbarItem[]
  }>(),
  {
    diagramItems: () => [],
    pinnedItems: () => [],
    bodyItems: () => [],
    windowItems: () => [],
  }
)

const emit = defineEmits<{
  select: [id: string]
  'select-diagram': [id: string]
}>()

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
  return '▢'
}
</script>

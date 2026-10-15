<template>
  <div class="flex flex-col">
    <div
      class="flex min-w-0 items-stretch rounded-sm"
      :class="
        canSelect && selectedId === node.runnerId
          ? 'bg-accent text-accent-foreground'
          : canSelect
            ? 'hover:bg-muted/60'
            : 'opacity-80'
      "
    >
      <!-- Depth columns: vertical guides under each ancestor expand icon -->
      <span
        v-for="d in depth"
        :key="d"
        class="relative w-5 shrink-0"
        aria-hidden="true"
      >
        <span
          class="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-hairline"
        />
      </span>
      <button
        v-if="hasChildren"
        type="button"
        class="relative inline-flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground"
        :aria-expanded="expanded"
        :title="expanded ? 'Collapse' : 'Expand'"
        @click.stop="expanded = !expanded"
      >
        <span
          aria-hidden="true"
          class="inline-block size-0 border-y-[3.5px] border-l-[5px] border-y-transparent border-l-current opacity-70 transition-transform duration-150"
          :class="expanded ? 'rotate-90' : ''"
        />
      </button>
      <button
        v-if="canSelect"
        type="button"
        class="font-data min-w-0 flex-1 truncate px-1 py-1 text-left text-[11px]"
        :title="node.title"
        @click="emit('select', node.runnerId)"
      >
        {{ node.title }}
      </button>
      <span
        v-else
        class="font-data min-w-0 flex-1 truncate px-1 py-1 text-[11px] text-muted-foreground"
        :title="node.title"
      >
        {{ node.title }}
      </span>
    </div>
    <template v-if="expanded && hasChildren">
      <SimRunnerSelectNode
        v-for="child in node.children"
        :key="child.runnerId"
        :node="child"
        :selected-id="selectedId"
        :depth="depth + 1"
        :selectable="selectable"
        @select="emit('select', $event)"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { SimRunnerTreeNode } from '../../composables/useAnimgraphSim'

const props = defineProps<{
  node: SimRunnerTreeNode
  selectedId: string
  depth: number
  /** When omitted, every node is selectable. */
  selectable?: (runnerId: string) => boolean
}>()

const emit = defineEmits<{
  select: [runnerId: string]
}>()

const expanded = ref(true)

const hasChildren = computed(() => props.node.children.length > 0)

const canSelect = computed(() =>
  props.selectable ? props.selectable(props.node.runnerId) : true
)
</script>

<template>
  <Popover v-model:open="open">
    <PopoverTrigger as-child>
      <Button
        type="button"
        size="sm"
        variant="outline"
        class="h-6! max-w-full min-w-0 justify-between gap-1 rounded-sm px-2 py-0 text-[11px] font-normal text-foreground"
        :class="triggerClass"
        :title="$slots.leading ? undefined : triggerTitle"
        :disabled="!hasOptions"
      >
        <span
          v-if="$slots.leading"
          class="shrink-0 [&_svg]:size-3"
          :title="triggerTitle"
        >
          <slot name="leading" />
        </span>
        <span
          class="min-w-0 flex-1 truncate text-left"
          :title="selectedTitle || undefined"
        >
          {{ selectedTitle || placeholder }}
        </span>
        <ChevronsUpDown class="size-3 shrink-0 opacity-60" :size="12" />
      </Button>
    </PopoverTrigger>
    <PopoverContent
      align="start"
      class="w-max min-w-[var(--reka-popover-trigger-width,8.5rem)] max-w-[min(24rem,90vw)] max-h-64 overflow-y-auto rounded-sm p-1"
    >
      <p v-if="!hasOptions" class="m-0 px-2 py-1.5 text-[11px] text-muted-foreground">
        {{ emptyLabel }}
      </p>
      <template v-else-if="flatPaths">
        <button
          v-for="opt in pathOptions"
          :key="opt.runnerId"
          type="button"
          class="font-data flex w-full min-w-0 rounded-sm px-2 py-1 text-left text-[11px]"
          :class="
            modelValue === opt.runnerId
              ? 'bg-accent text-accent-foreground'
              : 'hover:bg-muted/60'
          "
          :title="opt.title"
          @click="onSelect(opt.runnerId)"
        >
          <span class="truncate">{{ opt.title }}</span>
        </button>
      </template>
      <SimRunnerSelectNode
        v-else-if="tree"
        :node="tree"
        :selected-id="modelValue"
        :depth="0"
        :selectable="isSelectable"
        @select="onSelect"
      />
    </PopoverContent>
  </Popover>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ChevronsUpDown } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  simListBoundRunnerPaths,
  simListBoundRunnerTree,
  simRunnersRev,
} from '../../stores/animgraphSim'
import { projectRef } from '../../stores/graphProject'
import type {
  SimRunnerPathOption,
  SimRunnerTreeNode,
} from '../../composables/useAnimgraphSim'
import SimRunnerSelectNode from './SimRunnerSelectNode.vue'

const props = withDefaults(
  defineProps<{
    placeholder?: string
    triggerClass?: string
    triggerTitle?: string
    /**
     * When set, flat path list of runners executing this diagram
     * (at-node / taskbar overlay). Otherwise full bound tree.
     */
    diagramId?: string | null
  }>(),
  {
    placeholder: 'Runner',
    triggerClass: 'w-[min(14rem,100%)]',
    triggerTitle: 'Select execution runner',
    diagramId: null,
  }
)

const modelValue = defineModel<string>({ required: true })

const open = ref(false)

/** Diagram-filtered pickers use flat ancestry paths, not a nested tree. */
const flatPaths = computed(() => Boolean(props.diagramId?.trim()))

const pathOptions = computed((): SimRunnerPathOption[] => {
  void simRunnersRev.value
  void projectRef.value
  if (!flatPaths.value) return []
  return simListBoundRunnerPaths(props.diagramId)
})

const tree = computed((): SimRunnerTreeNode | null => {
  void simRunnersRev.value
  void projectRef.value
  if (flatPaths.value) return null
  return simListBoundRunnerTree()
})

const hasOptions = computed(() =>
  flatPaths.value ? pathOptions.value.length > 0 : tree.value != null
)

const emptyLabel = computed(() =>
  props.diagramId ? 'No runners for this diagram' : 'No bound runners'
)

/** Synthetic forest wrapper (`__diagram:…`) is not a real runner. */
const isSelectable = (runnerId: string) => !runnerId.startsWith('__diagram:')

const findTitleInTree = (node: SimRunnerTreeNode | null, id: string): string => {
  if (!node) return ''
  if (node.runnerId === id) return node.title
  for (const child of node.children) {
    const hit = findTitleInTree(child, id)
    if (hit) return hit
  }
  return ''
}

/** First selectable runner id in tree order. */
const firstSelectableId = (node: SimRunnerTreeNode | null): string => {
  if (!node) return ''
  if (isSelectable(node.runnerId)) return node.runnerId
  for (const child of node.children) {
    const hit = firstSelectableId(child)
    if (hit) return hit
  }
  return ''
}

const selectedTitle = computed(() => {
  if (flatPaths.value) {
    return pathOptions.value.find((o) => o.runnerId === modelValue.value)?.title ?? ''
  }
  return findTitleInTree(tree.value, modelValue.value)
})

watch(
  [flatPaths, pathOptions, tree],
  () => {
    if (flatPaths.value) {
      const opts = pathOptions.value
      if (!opts.length) {
        modelValue.value = ''
        return
      }
      if (!modelValue.value || !opts.some((o) => o.runnerId === modelValue.value)) {
        modelValue.value = opts[0]!.runnerId
      }
      return
    }
    const t = tree.value
    if (!t) {
      modelValue.value = ''
      return
    }
    if (
      !modelValue.value ||
      !isSelectable(modelValue.value) ||
      !findTitleInTree(t, modelValue.value)
    ) {
      modelValue.value = firstSelectableId(t)
    }
  },
  { immediate: true }
)

const onSelect = (runnerId: string) => {
  if (!flatPaths.value && !isSelectable(runnerId)) return
  modelValue.value = runnerId
  open.value = false
}
</script>

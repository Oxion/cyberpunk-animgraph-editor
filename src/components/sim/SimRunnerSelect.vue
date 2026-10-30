<template>
  <Popover v-model:open="openRef">
    <PopoverTrigger as-child>
      <Button
        type="button"
        size="sm"
        variant="outline"
        class="h-6! max-w-full min-w-0 justify-between gap-1 rounded-sm px-2 py-0 text-[11px] font-normal text-foreground"
        :class="triggerClass"
        :title="$slots.leading ? undefined : triggerTitle"
        :disabled="!hasOptionsComputed"
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
          :title="selectedTitleComputed || undefined"
        >
          {{ selectedTitleComputed || placeholder }}
        </span>
        <ChevronsUpDown class="size-3 shrink-0 opacity-60" :size="12" />
      </Button>
    </PopoverTrigger>
    <PopoverContent
      align="start"
      class="w-max min-w-[var(--reka-popover-trigger-width,8.5rem)] max-w-[min(24rem,90vw)] max-h-64 overflow-y-auto rounded-sm p-1"
    >
      <p v-if="!hasOptionsComputed" class="m-0 px-2 py-1.5 text-[11px] text-muted-foreground">
        {{ emptyLabelComputed }}
      </p>
      <template v-else-if="variantDataComputed.mode === 'flat'">
        <button
          v-for="opt in variantDataComputed.options"
          :key="opt.runnerId"
          type="button"
          class="font-data flex w-full min-w-0 rounded-sm px-2 py-1 text-left text-[11px]"
          :class="
            selectedRunnerIdModel === opt.runnerId
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
        v-else-if="variantDataComputed.mode === 'tree' && variantDataComputed.rootNode"
        :node="variantDataComputed.rootNode"
        :selected-id="selectedRunnerIdModel"
        :depth="0"
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
  sim,
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

const selectedRunnerIdModel = defineModel<string>({ required: true })

const openRef = ref(false)

type FlatVariantData = {
  mode: 'flat'
  options: SimRunnerPathOption[]
}

type TreeVariantData = {
  mode: 'tree'
  rootNode: SimRunnerTreeNode | null
}

const variantDataComputed = computed<FlatVariantData | TreeVariantData>(() => {
  void sim.runnersRev.value
  void projectRef.value

  if (props.diagramId) {
    return {
      mode: 'flat',
      options: sim.listBoundRunnerPaths(props.diagramId),
    }
  }

  return {
    mode: 'tree',
    rootNode: sim.listBoundRunnerTree(),
  }
})

const hasOptionsComputed = computed(() => {
  const variantData = variantDataComputed.value
  return variantData.mode === 'flat' 
    ? variantData.options.length > 0 
    : variantData.rootNode != null
})

const emptyLabelComputed = computed(() => {
  return variantDataComputed.value.mode === 'flat'
    ? 'No runners for this diagram' 
    : 'No bound runners'
})

const findTitleInTree = (node: SimRunnerTreeNode | null, id: string): string => {
  if (!node) return ''
  if (node.runnerId === id) return node.title
  for (const child of node.children) {
    const hit = findTitleInTree(child, id)
    if (hit) return hit
  }
  return ''
}

const selectedTitleComputed = computed(() => {
  const variantData = variantDataComputed.value
  const selectedRunnerId = selectedRunnerIdModel.value
  if (variantData.mode === 'flat') {
    return variantData.options.find((o) => o.runnerId === selectedRunnerId)?.title ?? ''
  }
  return findTitleInTree(variantData.rootNode, selectedRunnerId)
})

watch([variantDataComputed], () => {
  const variantData = variantDataComputed.value
  if (variantData.mode === 'flat') {
    const opts = variantData.options
    if (!opts.length) {
      selectedRunnerIdModel.value = ''
      return
    }

    if (!selectedRunnerIdModel.value || !opts.some((o) => o.runnerId === selectedRunnerIdModel.value)) {
      selectedRunnerIdModel.value = opts[0]!.runnerId
    }

    return
  }

  const treeRootNode = variantData.rootNode
  if (!treeRootNode) {
    selectedRunnerIdModel.value = ''
    return
  }

  if (
    !selectedRunnerIdModel.value ||
    !findTitleInTree(treeRootNode, selectedRunnerIdModel.value)
  ) {
    selectedRunnerIdModel.value = treeRootNode.runnerId
  }
}, { immediate: true })

const onSelect = (runnerId: string) => {
  selectedRunnerIdModel.value = runnerId
  openRef.value = false
}
</script>

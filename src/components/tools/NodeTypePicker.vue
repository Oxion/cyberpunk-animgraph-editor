<template>
  <Popover v-if="options.length > 0" v-model:open="open">
    <PopoverTrigger as-child>
      <Button
        type="button"
        variant="outline"
        class="h-8 w-full justify-between rounded-sm px-2 text-xs font-normal"
      >
        <span class="truncate text-left">
          {{ selectedOption?.label ?? placeholder }}
        </span>
        <ChevronsUpDownIcon class="ml-1 size-3.5 shrink-0 opacity-60" />
      </Button>
    </PopoverTrigger>
    <PopoverContent
      align="start"
      :side-offset="4"
      class="w-(--reka-popper-anchor-width) max-w-(--reka-popper-available-width) p-0"
      @open-auto-focus="onOpenAutoFocus"
    >
      <div class="flex flex-wrap gap-0.5 border-b border-border/60 p-1">
        <button
          type="button"
          class="inline-flex size-7 items-center justify-center rounded-sm"
          :class="tabClass(null)"
          title="All (Shift+↑↓ or Ctrl+Tab)"
          @click="setActiveGroup(null)"
        >
          <LayoutGridIcon class="size-3.5" />
        </button>
        <button
          v-for="tab in visibleTabs"
          :key="tab.id"
          type="button"
          class="inline-flex size-7 items-center justify-center rounded-sm"
          :class="tabClass(tab.id)"
          :title="`${tab.label} (Shift+↑↓ or Ctrl+Tab)`"
          @click="setActiveGroup(tab.id)"
        >
          <component :is="GROUP_ICONS[tab.id]" class="size-3.5" />
        </button>
      </div>

      <div class="border-b border-border/60 p-1.5">
        <Input
          ref="searchInputRef"
          v-model="searchQuery"
          type="search"
          placeholder="Search types…"
          class="h-7 rounded-sm text-xs"
          title="↑↓ options · Enter select · Shift+↑↓ / Ctrl+Tab tabs"
          @keydown="onSearchKeydown"
        />
      </div>

      <ScrollArea class="h-52">
        <div ref="listRootRef" class="p-1">
          <template v-if="filteredSections.length === 0">
            <div class="px-2 py-3 text-center text-[11px] text-muted-foreground">
              No matches
            </div>
          </template>
          <template v-else>
            <div
              v-for="section in filteredSections"
              :key="section.id"
              class="mb-1 last:mb-0"
            >
              <div
                v-if="activeGroupId === null"
                class="px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
              >
                {{ section.label }}
              </div>
              <button
                v-for="opt in section.options"
                :key="opt.key"
                type="button"
                :data-option-key="opt.key"
                class="flex w-full items-center rounded-sm px-2 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground"
                :class="optionRowClass(opt.key)"
                @mouseenter="activeKey = opt.key"
                @click="selectOption(opt)"
              >
                <span class="truncate">{{ opt.label }}</span>
              </button>
            </div>
          </template>
        </div>
      </ScrollArea>
    </PopoverContent>
  </Popover>
  <div
    v-else
    class="flex h-8 items-center rounded-sm border border-border/60 px-2 text-xs text-muted-foreground"
  >
    {{ emptyLabel }}
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { Component } from 'vue'
import {
  ArrowLeftRightIcon,
  BlendIcon,
  BoxIcon,
  CalculatorIcon,
  ChevronsUpDownIcon,
  ClapperboardIcon,
  GitBranchIcon,
  KeyboardIcon,
  LayersIcon,
  LayoutGridIcon,
  Move3dIcon,
  TagIcon,
  WorkflowIcon,
} from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  NODE_TYPE_GROUPS,
  classifyNodeType,
  nodeTypeGroupLabel,
  type NodeTypeGroupId,
} from '@/utils/graph/nodeTypeGroups'

export type NodeTypeOption = {
  /** Unique select value (`type#slot`). */
  key: string
  diagramNodeType: string
  /** Type name used for auto id (animgraph type when present). */
  idFromType: string
  label: string
  slotName?: string
}

const props = withDefaults(
  defineProps<{
    options: NodeTypeOption[]
    modelValue: string
    placeholder?: string
    emptyLabel?: string
  }>(),
  {
    placeholder: 'Select type…',
    emptyLabel: 'No types available',
  }
)

const emit = defineEmits<{
  'update:modelValue': [key: string]
}>()

const GROUP_ICONS: Record<NodeTypeGroupId, Component> = {
  diagram: LayersIcon,
  blend: BlendIcon,
  branch: GitBranchIcon,
  math: CalculatorIcon,
  'state-machine': WorkflowIcon,
  animation: ClapperboardIcon,
  transform: Move3dIcon,
  input: KeyboardIcon,
  converter: ArrowLeftRightIcon,
  value: TagIcon,
  other: BoxIcon,
}

const open = ref(false)
const searchQuery = ref('')
const activeGroupId = ref<NodeTypeGroupId | null>(null)
/** Keyboard / hover highlight (not yet committed). */
const activeKey = ref('')
const searchInputRef = ref<InstanceType<typeof Input> | null>(null)
const listRootRef = ref<HTMLElement | null>(null)

const selectedOption = computed(() =>
  props.options.find((o) => o.key === props.modelValue)
)

const optionsByGroup = computed(() => {
  const map = new Map<NodeTypeGroupId, NodeTypeOption[]>()
  for (const opt of props.options) {
    const groupId = classifyNodeType(opt.diagramNodeType)
    const list = map.get(groupId)
    if (list) list.push(opt)
    else map.set(groupId, [opt])
  }
  return map
})

const visibleTabs = computed(() =>
  NODE_TYPE_GROUPS.filter((g) => (optionsByGroup.value.get(g.id)?.length ?? 0) > 0)
)

/** Tab strip order: All, then visible purpose tabs. */
const tabOrder = computed((): Array<NodeTypeGroupId | null> => [
  null,
  ...visibleTabs.value.map((t) => t.id),
])

type Section = {
  id: NodeTypeGroupId
  label: string
  options: NodeTypeOption[]
}

const filteredSections = computed((): Section[] => {
  const q = searchQuery.value.trim().toLowerCase()
  const match = (opt: NodeTypeOption) => {
    if (!q) return true
    return (
      opt.label.toLowerCase().includes(q) ||
      opt.diagramNodeType.toLowerCase().includes(q) ||
      (opt.slotName?.toLowerCase().includes(q) ?? false)
    )
  }

  const groupIds: NodeTypeGroupId[] = activeGroupId.value
    ? [activeGroupId.value]
    : NODE_TYPE_GROUPS.map((g) => g.id)

  const sections: Section[] = []
  for (const id of groupIds) {
    const raw = optionsByGroup.value.get(id) ?? []
    const options = raw.filter(match)
    if (options.length === 0) continue
    sections.push({
      id,
      label: nodeTypeGroupLabel(id),
      options,
    })
  }
  return sections
})

const flatOptions = computed(() =>
  filteredSections.value.flatMap((section) => section.options)
)

function tabClass(id: NodeTypeGroupId | null): string {
  const active = activeGroupId.value === id
  return active
    ? 'bg-accent text-accent-foreground'
    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
}

function optionRowClass(key: string): string {
  if (key === activeKey.value) return 'bg-accent text-accent-foreground'
  if (key === props.modelValue) return 'bg-accent/40 text-accent-foreground'
  return ''
}

function setActiveGroup(id: NodeTypeGroupId | null) {
  activeGroupId.value = id
}

function syncActiveKey() {
  const list = flatOptions.value
  if (list.length === 0) {
    activeKey.value = ''
    return
  }
  if (list.some((o) => o.key === activeKey.value)) return
  if (list.some((o) => o.key === props.modelValue)) {
    activeKey.value = props.modelValue
    return
  }
  activeKey.value = list[0]?.key ?? ''
}

function scrollActiveIntoView() {
  void nextTick(() => {
    const root = listRootRef.value
    if (!root || !activeKey.value) return
    const el = root.querySelector(
      `[data-option-key="${CSS.escape(activeKey.value)}"]`
    ) as HTMLElement | null
    el?.scrollIntoView({ block: 'nearest' })
  })
}

function moveActive(delta: number) {
  const list = flatOptions.value
  if (list.length === 0) return
  const idx = list.findIndex((o) => o.key === activeKey.value)
  const next =
    idx < 0
      ? delta > 0
        ? 0
        : list.length - 1
      : (idx + delta + list.length) % list.length
  activeKey.value = list[next]!.key
  scrollActiveIntoView()
}

function moveTab(delta: number) {
  const tabs = tabOrder.value
  if (tabs.length === 0) return
  const idx = tabs.findIndex((t) => t === activeGroupId.value)
  const from = idx < 0 ? 0 : idx
  const next = (from + delta + tabs.length) % tabs.length
  activeGroupId.value = tabs[next] ?? null
}

function focusSearch() {
  void nextTick(() => {
    const el = searchInputRef.value?.$el as HTMLInputElement | undefined
    el?.focus()
  })
}

function onOpenAutoFocus(event: Event) {
  event.preventDefault()
  focusSearch()
}

function selectOption(opt: NodeTypeOption) {
  emit('update:modelValue', opt.key)
  open.value = false
}

function onSearchKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.stopPropagation()
    open.value = false
    return
  }

  if (event.key === 'ArrowDown') {
    event.preventDefault()
    if (event.shiftKey) moveTab(1)
    else moveActive(1)
    return
  }

  if (event.key === 'ArrowUp') {
    event.preventDefault()
    if (event.shiftKey) moveTab(-1)
    else moveActive(-1)
    return
  }

  if (event.key === 'Tab' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault()
    moveTab(event.shiftKey ? -1 : 1)
    return
  }

  if (event.key === 'Enter') {
    event.preventDefault()
    const opt = flatOptions.value.find((o) => o.key === activeKey.value)
    if (opt) selectOption(opt)
  }
}

watch(open, (isOpen) => {
  if (isOpen) {
    searchQuery.value = ''
    syncActiveKey()
    focusSearch()
  }
})

watch([filteredSections, () => props.modelValue], () => {
  syncActiveKey()
})

watch(
  () => props.options,
  (options) => {
    if (options.length === 0) {
      if (props.modelValue) emit('update:modelValue', '')
      open.value = false
      return
    }
    if (!options.some((o) => o.key === props.modelValue)) {
      emit('update:modelValue', options[0]?.key ?? '')
    }
    if (
      activeGroupId.value &&
      !(optionsByGroup.value.get(activeGroupId.value)?.length)
    ) {
      activeGroupId.value = null
    }
  },
  { immediate: true }
)
</script>

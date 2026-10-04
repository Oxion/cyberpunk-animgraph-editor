<template>
  <Popover v-model:open="open">
    <PopoverTrigger as-child>
      <Button
        type="button"
        variant="outline"
        class="h-8 w-full justify-between rounded-sm px-2 text-xs font-normal"
      >
        <span class="flex min-w-0 items-center gap-1.5 text-left">
          <span
            class="size-2.5 shrink-0 rounded-full border border-black/25"
            :class="selectedPin ? undefined : 'border-dashed border-muted-foreground/70 bg-transparent'"
            :style="
              selectedPin
                ? { backgroundColor: selectedPin.pinColor || fallbackColor }
                : undefined
            "
          />
          <span class="truncate">{{ selectedLabel }}</span>
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
      <div class="border-b border-border/60 p-1.5">
        <Input
          ref="searchInputRef"
          v-model="searchQuery"
          type="search"
          placeholder="Search pins…"
          class="h-7 rounded-sm text-xs"
          title="↑↓ options · Enter select"
          @keydown="onSearchKeydown"
        />
      </div>
      <ScrollArea class="h-52">
        <div ref="listRootRef" class="p-1">
          <button
            type="button"
            :data-option-key="NONE_KEY"
            class="flex w-full items-center gap-1.5 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground"
            :class="optionRowClass(NONE_KEY)"
            @mouseenter="activeKey = NONE_KEY"
            @click="selectKey(NONE_KEY)"
          >
            <span class="size-2.5 shrink-0 rounded-full border border-dashed border-muted-foreground/70" />
            <span class="text-muted-foreground">None</span>
          </button>
          <template v-if="filteredPins.length === 0 && searchQuery.trim()">
            <div class="px-2 py-3 text-center text-[11px] text-muted-foreground">
              No matches
            </div>
          </template>
          <button
            v-for="opt in filteredPins"
            :key="opt.pinId"
            type="button"
            :data-option-key="opt.pinId"
            class="flex w-full items-center gap-1.5 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground"
            :class="optionRowClass(opt.pinId)"
            @mouseenter="activeKey = opt.pinId"
            @click="selectKey(opt.pinId)"
          >
            <span
              class="size-2.5 shrink-0 rounded-full border border-black/25"
              :style="{ backgroundColor: opt.pinColor || fallbackColor }"
            />
            <span class="truncate">{{ opt.label }}</span>
          </button>
        </div>
      </ScrollArea>
    </PopoverContent>
  </Popover>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { ChevronsUpDownIcon } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { PIN_COLOR_FALLBACK } from '@/utils/graph/pinTyping'
import type { InputPinOption } from '@/utils/graph/NodePins'

const NONE_KEY = '__none__'
const fallbackColor = PIN_COLOR_FALLBACK

const props = defineProps<{
  options: InputPinOption[]
  modelValue: string
}>()

const emit = defineEmits<{
  'update:modelValue': [pinId: string]
}>()

const open = ref(false)
const searchQuery = ref('')
const activeKey = ref(NONE_KEY)
const searchInputRef = ref<InstanceType<typeof Input> | null>(null)
const listRootRef = ref<HTMLElement | null>(null)

const selectedPin = computed(() =>
  props.options.find((o) => o.pinId === props.modelValue)
)

const selectedLabel = computed(() => selectedPin.value?.label ?? 'None')

const selectedKey = computed(() =>
  props.modelValue ? props.modelValue : NONE_KEY
)

const filteredPins = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return props.options
  return props.options.filter(
    (o) =>
      o.label.toLowerCase().includes(q) || o.pinId.toLowerCase().includes(q)
  )
})

const flatKeys = computed(() => [
  NONE_KEY,
  ...filteredPins.value.map((o) => o.pinId),
])

function optionRowClass(key: string): string {
  if (key === activeKey.value) return 'bg-accent text-accent-foreground'
  if (key === selectedKey.value) return 'bg-accent/40 text-accent-foreground'
  return ''
}

function selectKey(key: string) {
  emit('update:modelValue', key === NONE_KEY ? '' : key)
  open.value = false
}

function syncActiveKey() {
  const list = flatKeys.value
  if (list.includes(activeKey.value)) return
  if (list.includes(selectedKey.value)) {
    activeKey.value = selectedKey.value
    return
  }
  activeKey.value = list[0] ?? NONE_KEY
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
  const list = flatKeys.value
  if (list.length === 0) return
  const idx = list.indexOf(activeKey.value)
  const next =
    idx < 0
      ? delta > 0
        ? 0
        : list.length - 1
      : (idx + delta + list.length) % list.length
  activeKey.value = list[next]!
  scrollActiveIntoView()
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

function onSearchKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.stopPropagation()
    open.value = false
    return
  }
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    moveActive(1)
    return
  }
  if (event.key === 'ArrowUp') {
    event.preventDefault()
    moveActive(-1)
    return
  }
  if (event.key === 'Enter') {
    event.preventDefault()
    if (flatKeys.value.includes(activeKey.value)) selectKey(activeKey.value)
  }
}

watch(open, (isOpen) => {
  if (isOpen) {
    searchQuery.value = ''
    syncActiveKey()
    focusSearch()
  }
})

watch([filteredPins, () => props.modelValue], () => {
  syncActiveKey()
})
</script>

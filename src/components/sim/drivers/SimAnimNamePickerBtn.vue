<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { ChevronDown } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { simClipNames } from '@/stores/animgraphSim'

const props = withDefaults(
  defineProps<{
    modelValue: string
    title?: string
  }>(),
  {
    title: 'Pick animation',
  }
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const open = ref(false)
const searchQuery = ref('')
const activeName = ref('')
const searchInputRef = ref<InstanceType<typeof Input> | null>(null)
const listRootRef = ref<HTMLElement | null>(null)

const filtered = computed(() => {
  const names = simClipNames.value ?? []
  const q = searchQuery.value.trim().toLowerCase()
  const list = q
    ? names.filter((n) => n.toLowerCase().includes(q))
    : names.slice()
  return list.sort((a, b) => a.localeCompare(b))
})

function select(name: string) {
  emit('update:modelValue', name)
  open.value = false
}

function syncActive() {
  const list = filtered.value
  if (list.includes(activeName.value)) return
  if (props.modelValue && list.includes(props.modelValue)) {
    activeName.value = props.modelValue
    return
  }
  activeName.value = list[0] ?? ''
}

function scrollActiveIntoView() {
  void nextTick(() => {
    const root = listRootRef.value
    if (!root || !activeName.value) return
    const el = root.querySelector(
      `[data-anim-name="${CSS.escape(activeName.value)}"]`
    ) as HTMLElement | null
    el?.scrollIntoView({ block: 'nearest' })
  })
}

function moveActive(delta: number) {
  const list = filtered.value
  if (!list.length) return
  const idx = list.indexOf(activeName.value)
  const next =
    idx < 0
      ? delta > 0
        ? 0
        : list.length - 1
      : (idx + delta + list.length) % list.length
  activeName.value = list[next]!
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
    if (activeName.value && filtered.value.includes(activeName.value)) {
      select(activeName.value)
    }
  }
}

watch(open, (isOpen) => {
  if (isOpen) {
    searchQuery.value = ''
    syncActive()
    focusSearch()
  }
})

watch([filtered, () => props.modelValue], () => {
  if (open.value) syncActive()
})
</script>

<template>
  <Popover v-model:open="open">
    <PopoverTrigger as-child>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        class="h-[26px] w-7 shrink-0 rounded-sm px-0"
        :title="title"
        :aria-label="title"
      >
        <ChevronDown class="size-3.5" :size="14" />
      </Button>
    </PopoverTrigger>
    <PopoverContent
      align="end"
      :side-offset="4"
      class="w-64 p-0"
      @open-auto-focus="onOpenAutoFocus"
    >
      <div class="border-b border-border/60 p-1.5">
        <Input
          ref="searchInputRef"
          v-model="searchQuery"
          type="search"
          placeholder="Filter animations…"
          class="h-7 rounded-sm text-xs"
          title="↑↓ options · Enter select"
          @keydown="onSearchKeydown"
        />
      </div>
      <ScrollArea class="h-52">
        <div ref="listRootRef" class="p-1">
          <div
            v-if="!filtered.length"
            class="px-2 py-3 text-center text-[11px] text-muted-foreground"
          >
            {{
              simClipNames.length === 0 ? 'No animations loaded' : 'No matches'
            }}
          </div>
          <button
            v-for="name in filtered"
            :key="name"
            type="button"
            :data-anim-name="name"
            class="flex w-full items-center rounded-sm px-2 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground"
            :class="
              name === activeName
                ? 'bg-accent text-accent-foreground'
                : name === modelValue
                  ? 'bg-accent/40 text-accent-foreground'
                  : ''
            "
            @mouseenter="activeName = name"
            @click="select(name)"
          >
            <span class="truncate">{{ name }}</span>
          </button>
        </div>
      </ScrollArea>
    </PopoverContent>
  </Popover>
</template>

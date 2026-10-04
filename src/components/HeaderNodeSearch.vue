<template>
  <div class="header-node-search relative flex w-[min(280px,40vw)] shrink-0 flex-col items-stretch">
    <Popover v-model:open="open" :modal="false">
      <PopoverAnchor as-child>
        <InputGroup class="h-7 rounded-sm">
          <InputGroupInput
            v-model="nodeSearchId"
            placeholder="Node ID…"
            class="h-7 text-xs"
            autocomplete="off"
            spellcheck="false"
            @focus="onInputFocus"
            @keydown="onInputKeydown"
          />
          <InputGroupAddon align="inline-end" class="py-0">
            <InputGroupButton
              size="icon-xs"
              title="Go to Node"
              aria-label="Go to Node"
              @click="goToResolved(false)"
            >
              <LocateFixedIcon />
            </InputGroupButton>
            <InputGroupButton
              size="icon-xs"
              title="Go & Zoom"
              aria-label="Go & Zoom"
              @click="goToResolved(true)"
            >
              <ZoomInIcon />
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </PopoverAnchor>

      <PopoverContent
        align="start"
        :side-offset="4"
        class="min-w-(--reka-popper-anchor-width) w-max max-w-[min(32rem,var(--reka-popper-available-width),calc(100vw-1rem))] rounded-sm p-0"
        @open-auto-focus.prevent
        @close-auto-focus.prevent
        @focus-outside.prevent
        @pointer-down-outside="onPointerDownOutside"
        @interact-outside="onPointerDownOutside"
      >
        <div class="flex items-center justify-between gap-2 border-b border-border px-2 py-1">
          <span class="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
            {{ matches.length }} match{{ matches.length === 1 ? '' : 'es' }}
          </span>
          <Button
            v-if="matches.length > PREVIEW_LIMIT"
            type="button"
            variant="ghost"
            size="xs"
            class="h-auto rounded-sm px-1 py-0 text-[11px] text-muted-foreground hover:text-foreground"
            @click="showAll = !showAll"
          >
            {{ showAll ? 'Show less' : 'Show all' }}
          </Button>
        </div>

        <ScrollArea class="min-h-0" :style="{ height: listHeightCss }">
          <div ref="listRootRef" class="p-1">
            <div
              v-if="matches.length === 0"
              class="px-2 py-3 text-center text-[11px] text-muted-foreground"
            >
              No matches
            </div>
            <button
              v-for="item in visibleMatches"
              :key="item.id"
              type="button"
              :data-option-key="item.id"
              class="flex h-7 w-full items-center gap-2 rounded-sm px-2 text-left text-xs hover:bg-accent hover:text-accent-foreground"
              :class="item.id === activeId ? 'bg-accent text-accent-foreground' : ''"
              @mouseenter="activeId = item.id"
              @click="selectMatch(item.id, false)"
            >
              <span
                class="min-w-0 flex-1 truncate font-mono tabular-nums"
                :title="item.id"
              >{{ item.id }}</span>
              <span
                class="max-w-[48%] shrink-0 truncate text-[10px] text-muted-foreground"
                :title="item.type"
              >
                {{ item.type }}
              </span>
            </button>
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>

    <div
      v-if="panToNodeMessage"
      class="absolute top-[calc(100%+4px)] right-0 left-0 z-40 rounded-sm border border-border bg-card px-2 py-1 text-center text-[11px] leading-snug shadow-lg"
      :class="
        panToNodeMessage.type === 'error'
          ? 'border-destructive/65 text-[#f0b0b0]'
          : 'border-primary/55 text-[#b8d0f0]'
      "
    >
      {{ panToNodeMessage.text }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { LocateFixedIcon, ZoomInIcon } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group'
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  nodeSearchId,
  panToNode,
  panToNodeMessage,
  panToNodeWithZoom,
} from '@/composables/useGraphNavigation'
import { getRenderData } from '@/stores/graphProject'

const PREVIEW_LIMIT = 10
/** Matches `h-7` rows + list `p-1` padding. */
const ROW_HEIGHT_REM = 1.75
const LIST_PAD_REM = 0.5
const EMPTY_HEIGHT_REM = 2.75

const props = defineProps<{
  diagramId: string
}>()

type MatchItem = { id: string; type: string }

const open = ref(false)
const showAll = ref(false)
const activeId = ref('')
const listRootRef = ref<HTMLElement | null>(null)

const query = computed(() => nodeSearchId.value.trim())

const matches = computed((): MatchItem[] => {
  const q = query.value.toLowerCase()
  if (!q) return []

  const data = getRenderData(props.diagramId)
  if (!data) return []

  const exact: MatchItem[] = []
  const starts: MatchItem[] = []
  const contains: MatchItem[] = []

  for (const node of data.allNodes.values()) {
    const idLower = node.id.toLowerCase()
    if (!idLower.includes(q)) continue
    const item = { id: node.id, type: node.type }
    if (idLower === q) exact.push(item)
    else if (idLower.startsWith(q)) starts.push(item)
    else contains.push(item)
  }

  const byId = (a: MatchItem, b: MatchItem) => a.id.localeCompare(b.id)
  exact.sort(byId)
  starts.sort(byId)
  contains.sort(byId)
  return [...exact, ...starts, ...contains]
})

const visibleMatches = computed(() =>
  showAll.value ? matches.value : matches.value.slice(0, PREVIEW_LIMIT)
)

const listHeightCss = computed(() => {
  const rows = matches.value.length === 0 ? 0 : visibleMatches.value.length
  const contentRem =
    rows === 0 ? EMPTY_HEIGHT_REM : LIST_PAD_REM + rows * ROW_HEIGHT_REM
  // Cap by viewport / popper room, leave space for the matches header row.
  return `min(${contentRem}rem, calc(var(--reka-popover-content-available-height, var(--reka-popper-available-height, 100vh)) - 2rem), calc(100vh - 6rem))`
})

function syncActiveId() {
  const list = visibleMatches.value
  if (list.length === 0) {
    activeId.value = ''
    return
  }
  if (list.some((item) => item.id === activeId.value)) return
  const exact = list.find(
    (item) => item.id.toLowerCase() === query.value.toLowerCase()
  )
  activeId.value = exact?.id ?? list[0]!.id
}

function scrollActiveIntoView() {
  void nextTick(() => {
    const root = listRootRef.value
    if (!root || !activeId.value) return
    const el = root.querySelector(
      `[data-option-key="${CSS.escape(activeId.value)}"]`
    ) as HTMLElement | null
    el?.scrollIntoView({ block: 'nearest' })
  })
}

function moveActive(delta: number) {
  const list = visibleMatches.value
  if (list.length === 0) return
  const idx = list.findIndex((item) => item.id === activeId.value)
  const next =
    idx < 0
      ? delta > 0
        ? 0
        : list.length - 1
      : (idx + delta + list.length) % list.length
  activeId.value = list[next]!.id
  scrollActiveIntoView()
}

function resolveTargetId(): string | null {
  const q = query.value
  if (!q) return null
  const exact = matches.value.find(
    (item) => item.id.toLowerCase() === q.toLowerCase()
  )
  if (exact) return exact.id
  if (activeId.value && matches.value.some((item) => item.id === activeId.value)) {
    return activeId.value
  }
  return matches.value[0]?.id ?? q
}

async function goToResolved(withZoom: boolean) {
  const targetId = resolveTargetId()
  if (!targetId) {
    await (withZoom ? panToNodeWithZoom(props.diagramId) : panToNode(props.diagramId))
    return
  }
  nodeSearchId.value = targetId
  open.value = false
  if (withZoom) await panToNodeWithZoom(props.diagramId, targetId)
  else await panToNode(props.diagramId, targetId)
}

async function selectMatch(id: string, withZoom: boolean) {
  nodeSearchId.value = id
  open.value = false
  if (withZoom) await panToNodeWithZoom(props.diagramId, id)
  else await panToNode(props.diagramId, id)
}

function onInputFocus() {
  if (!query.value) return
  // Defer: the same pointerdown that focused the input must not dismiss the popover.
  queueMicrotask(() => {
    if (query.value) open.value = true
  })
}

function onPointerDownOutside(event: Event) {
  const target = event.target as HTMLElement | null
  // Anchor (input group) lives outside PopoverContent; keep open while using it.
  if (target?.closest?.('.header-node-search')) {
    event.preventDefault()
  }
}

function onInputKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    if (open.value) {
      event.preventDefault()
      event.stopPropagation()
      open.value = false
    }
    return
  }

  if (event.key === 'ArrowDown') {
    if (!query.value) return
    event.preventDefault()
    if (!open.value) open.value = true
    else moveActive(1)
    return
  }

  if (event.key === 'ArrowUp') {
    if (!open.value || !query.value) return
    event.preventDefault()
    moveActive(-1)
    return
  }

  if (event.key === 'Enter') {
    event.preventDefault()
    void goToResolved(false)
  }
}

watch(query, (q) => {
  showAll.value = false
  if (!q) {
    open.value = false
    activeId.value = ''
    return
  }
  open.value = true
})

watch([matches, visibleMatches], () => {
  syncActiveId()
})

watch(open, (isOpen) => {
  if (isOpen) syncActiveId()
})
</script>

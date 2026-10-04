<template>
  <div class="flex h-full min-h-0 overflow-hidden text-xs text-foreground">
    <nav
      class="flex w-40 shrink-0 flex-col gap-0.5 border-r border-border bg-panel p-1.5"
      aria-label="Settings sections"
    >
      <button
        v-for="section in sections"
        :key="section.id"
        type="button"
        class="rounded-sm px-2 py-1.5 text-left text-xs transition-colors"
        :class="
          activeSection === section.id
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:bg-accent hover:text-foreground'
        "
        @click="activeSection = section.id"
      >
        {{ section.label }}
      </button>
    </nav>

    <ScrollArea class="min-h-0 min-w-0 flex-1">
      <div class="flex flex-col gap-4 p-3">
        <template v-if="activeSection === 'connections'">
          <h3 class="m-0 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            Connections
          </h3>

          <label class="flex items-center gap-2">
            <Checkbox
              :model-value="connectionSettings.highlightSelectedNodeConnections"
              @update:model-value="
                (v) =>
                  emit('update:connectionSettings', {
                    ...connectionSettings,
                    highlightSelectedNodeConnections: v === true,
                  })
              "
            />
            <span>Highlight selected node connections</span>
          </label>

          <div class="flex items-center gap-3">
            <Label class="w-28 shrink-0 text-[11px] text-muted-foreground">Color</Label>
            <input
              type="color"
              class="h-7 w-10 cursor-pointer rounded-sm border border-border bg-transparent p-0.5"
              :value="connectionSettings.selectedNodeConnectionColor"
              @input="
                emit('update:connectionSettings', {
                  ...connectionSettings,
                  selectedNodeConnectionColor: ($event.target as HTMLInputElement).value,
                })
              "
            />
          </div>

          <div class="flex items-center gap-3">
            <Label class="w-28 shrink-0 text-[11px] text-muted-foreground">Overlay</Label>
            <Slider
              class="flex-1"
              :model-value="[connectionSettings.selectedNodeConnectionOverlayAmount]"
              :min="0"
              :max="1"
              :step="0.05"
              @update:model-value="
                (v) =>
                  emit('update:connectionSettings', {
                    ...connectionSettings,
                    selectedNodeConnectionOverlayAmount: Array.isArray(v) ? (v[0] ?? 0.4) : 0.4,
                  })
              "
            />
            <span class="font-data w-10 shrink-0 text-right">
              {{ Math.round(connectionSettings.selectedNodeConnectionOverlayAmount * 100) }}%
            </span>
          </div>

          <div class="flex items-center gap-3">
            <Label class="w-28 shrink-0 text-[11px] text-muted-foreground">Width</Label>
            <Slider
              class="flex-1"
              :model-value="[connectionSettings.selectedNodeConnectionWidth]"
              :min="1"
              :max="10"
              :step="1"
              @update:model-value="
                (v) =>
                  emit('update:connectionSettings', {
                    ...connectionSettings,
                    selectedNodeConnectionWidth: Array.isArray(v) ? (v[0] ?? 2) : 2,
                  })
              "
            />
            <span class="font-data w-6 shrink-0 text-right">
              {{ connectionSettings.selectedNodeConnectionWidth }}
            </span>
          </div>

          <div class="flex items-center gap-3">
            <Label class="w-28 shrink-0 text-[11px] text-muted-foreground">Opacity</Label>
            <Slider
              class="flex-1"
              :model-value="[connectionSettings.selectedNodeConnectionOpacity]"
              :min="0.1"
              :max="1"
              :step="0.1"
              @update:model-value="
                (v) =>
                  emit('update:connectionSettings', {
                    ...connectionSettings,
                    selectedNodeConnectionOpacity: Array.isArray(v) ? (v[0] ?? 0.8) : 0.8,
                  })
              "
            />
            <span class="font-data w-10 shrink-0 text-right">
              {{ Math.round(connectionSettings.selectedNodeConnectionOpacity * 100) }}%
            </span>
          </div>
        </template>

        <template v-else-if="activeSection === 'canvas'">
          <h3 class="m-0 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            Canvas
          </h3>

          <label class="flex items-center gap-2">
            <Checkbox
              :model-value="gridSettings.enabled"
              @update:model-value="(v) => patchGrid({ enabled: v === true })"
            />
            <span>Show grid</span>
          </label>

          <div class="flex flex-col gap-4" :class="{ 'opacity-50': !gridSettings.enabled }">
            <div class="flex items-center gap-3">
              <Label class="w-28 shrink-0 text-[11px] text-muted-foreground">Color</Label>
              <input
                type="color"
                class="h-7 w-10 cursor-pointer rounded-sm border border-border bg-transparent p-0.5"
                :disabled="!gridSettings.enabled"
                :value="gridSettings.color"
                @input="
                  patchGrid({ color: ($event.target as HTMLInputElement).value })
                "
              />
            </div>

            <div class="flex items-center gap-3">
              <Label class="w-28 shrink-0 text-[11px] text-muted-foreground">Opacity</Label>
              <Slider
                class="flex-1"
                :disabled="!gridSettings.enabled"
                :model-value="[gridSettings.opacity]"
                :min="0.04"
                :max="0.5"
                :step="0.02"
                @update:model-value="
                  (v) => patchGrid({ opacity: Array.isArray(v) ? (v[0] ?? 0.16) : 0.16 })
                "
              />
              <span class="font-data w-10 shrink-0 text-right">
                {{ Math.round(gridSettings.opacity * 100) }}%
              </span>
            </div>

            <div class="flex items-center gap-3">
              <Label class="w-28 shrink-0 text-[11px] text-muted-foreground">Spacing</Label>
              <Slider
                class="flex-1"
                :disabled="!gridSettings.enabled"
                :model-value="[gridSettings.spacing]"
                :min="8"
                :max="80"
                :step="2"
                @update:model-value="
                  (v) => patchGrid({ spacing: Array.isArray(v) ? (v[0] ?? 20) : 20 })
                "
              />
              <span class="font-data w-6 shrink-0 text-right">
                {{ gridSettings.spacing }}
              </span>
            </div>

            <div class="flex items-center gap-3">
              <Label class="w-28 shrink-0 text-[11px] text-muted-foreground">Coarse every</Label>
              <Slider
                class="flex-1"
                :disabled="!gridSettings.enabled"
                :model-value="[gridSettings.coarseEvery]"
                :min="4"
                :max="16"
                :step="1"
                @update:model-value="
                  (v) => patchGrid({ coarseEvery: Array.isArray(v) ? (v[0] ?? 10) : 10 })
                "
              />
              <span class="font-data w-6 shrink-0 text-right">
                {{ gridSettings.coarseEvery }}
              </span>
            </div>

            <div class="flex items-center gap-3">
              <Label class="w-28 shrink-0 text-[11px] text-muted-foreground">Coarse fade</Label>
              <Slider
                class="flex-1"
                :disabled="!gridSettings.enabled"
                :model-value="[gridSettings.fadeStart]"
                :min="0"
                :max="0.85"
                :step="0.05"
                @update:model-value="
                  (v) => patchGrid({ fadeStart: Array.isArray(v) ? (v[0] ?? 0.5) : 0.5 })
                "
              />
              <span class="font-data w-10 shrink-0 text-right">
                {{ Math.round(gridSettings.fadeStart * 100) }}%
              </span>
            </div>
          </div>

          <p class="m-0 text-[11px] text-muted-foreground">
            Coarse fade is how far through a zoom-out loop the larger dots appear (50% = halfway).
          </p>
        </template>

        <template v-else-if="activeSection === 'debug'">
          <h3 class="m-0 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            Debug
          </h3>
          <label class="flex items-center gap-2" :class="{ 'opacity-50': !hasGraph }">
            <Checkbox
              :model-value="debugMode"
              :disabled="!hasGraph"
              @update:model-value="(v) => emit('update:debugMode', v === true)"
            />
            <span>Debug mode</span>
          </label>
          <p class="m-0 text-[11px] text-muted-foreground">
            Unlocks debug overlays and the View menu stats entry.
          </p>
          <template v-if="debugMode">
            <label class="flex items-center gap-2" :class="{ 'opacity-50': !hasGraph }">
              <Checkbox
                :model-value="debugTiles"
                :disabled="!hasGraph"
                @update:model-value="(v) => emit('update:debugTiles', v === true)"
              />
              <span>Show debug tiles</span>
            </label>
            <label class="flex items-center gap-2" :class="{ 'opacity-50': !hasGraph }">
              <Checkbox
                :model-value="debugLayoutContainers"
                :disabled="!hasGraph"
                @update:model-value="(v) => emit('update:debugLayoutContainers', v === true)"
              />
              <span>Show layout containers</span>
            </label>
            <div class="mt-2 flex flex-col gap-2 border-t border-border pt-3">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                class="h-7 w-fit rounded-sm px-2 text-xs"
                :disabled="!hasGraph"
                @click="emit('open-render-stats')"
              >
                Open stats for active renderer
              </Button>
              <p class="m-0 text-[11px] text-muted-foreground">
                Opens a new window bound to the current Main / body / window renderer. Same renderer reuses its window.
              </p>
            </div>

            <div class="mt-2 flex flex-col gap-2 border-t border-border pt-3">
              <label class="flex items-center gap-2">
                <Checkbox
                  :model-value="textLodOverrideEnabled"
                  @update:model-value="onTextLodOverrideToggle"
                />
                <span>Override text LOD threshold (CSS px)</span>
              </label>
              <p class="m-0 text-[11px] text-muted-foreground">
                Default: cache nodes when pin/row text ≤
                {{ defaultTextLodScreenPx }} CSS px (`fontSize × zoom`). Override is handy for A/B.
              </p>
              <div class="flex items-center gap-3" :class="{ 'opacity-50': !textLodOverrideEnabled }">
                <Label class="w-28 shrink-0 text-[11px] text-muted-foreground">Threshold</Label>
                <Slider
                  class="flex-1"
                  :disabled="!textLodOverrideEnabled"
                  :model-value="[textLodThresholdPx]"
                  :min="0"
                  :max="24"
                  :step="0.5"
                  @update:model-value="onTextLodThresholdSlide"
                />
                <span class="font-data w-10 shrink-0 text-right">
                  {{ textLodThresholdPx }}
                </span>
              </div>
            </div>
          </template>
          <p v-else-if="!hasGraph" class="m-0 text-[11px] text-muted-foreground">
            Load a graph to enable debug mode.
          </p>
          <p v-else class="m-0 text-[11px] text-muted-foreground">
            Enable debug mode to configure overlays and stats.
          </p>
        </template>

        <template v-else>
          <div class="flex items-center justify-between gap-2">
            <h3 class="m-0 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
              Hotkeys
            </h3>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              class="h-7 rounded-sm px-2 text-xs"
              @click="resetAllHotkeyBindings"
            >
              Reset all
            </Button>
          </div>

          <p class="m-0 text-[11px] text-muted-foreground">
            Click a shortcut to replace it, + to add another, × to remove. Esc cancels capture.
          </p>

          <Input
            v-model="hotkeySearch"
            type="search"
            placeholder="Search hotkeys…"
            class="h-7 rounded-sm px-2 text-xs"
          />

          <p
            v-if="filteredGroups.length === 0"
            class="m-0 text-[11px] text-muted-foreground"
          >
            No hotkeys match.
          </p>

          <div v-else class="flex flex-col gap-3">
            <section
              v-for="group in filteredGroups"
              :key="group.name"
              class="flex flex-col gap-1"
            >
              <h4 class="m-0 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                {{ group.name }}
              </h4>
              <div
                v-for="row in group.bindings"
                :key="row.binding.id"
                class="@container rounded-sm border border-border bg-canvas/40 px-2 py-1.5"
              >
                <div
                  class="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2 gap-y-1.5 @[24rem]:grid-cols-[minmax(0,1fr)_auto_auto]"
                >
                  <div class="min-w-0">
                    <div class="truncate text-foreground" :title="row.command.label">
                      {{ row.command.label }}
                    </div>
                    <div
                      class="truncate text-[10px] text-muted-foreground"
                      :title="formatHotkeyWhenLabel(row.binding)"
                    >
                      {{ formatHotkeyWhenLabel(row.binding) }}
                    </div>
                    <div
                      v-if="conflictMap[row.binding.id]"
                      class="truncate text-[10px] text-amber-400"
                      :title="conflictMap[row.binding.id]"
                    >
                      Conflicts: {{ conflictMap[row.binding.id] }}
                    </div>
                  </div>

                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    class="col-start-2 row-start-1 h-7 shrink-0 rounded-sm px-2 text-xs text-muted-foreground @[24rem]:col-start-3"
                    title="Reset to default"
                    @click="resetHotkeyBinding(row.binding.id)"
                  >
                    ↺
                  </Button>

                  <div
                    class="col-span-2 flex flex-wrap items-center gap-1 border-t border-border/60 pt-1.5 @[24rem]:col-span-1 @[24rem]:col-start-2 @[24rem]:row-start-1 @[24rem]:justify-end @[24rem]:border-t-0 @[24rem]:pt-0"
                  >
                    <span
                      v-if="row.binding.chords.length === 0 && !isCapturing(row.binding.id, 'append')"
                      class="px-1 text-[11px] text-muted-foreground"
                    >
                      —
                    </span>
                    <ButtonGroup
                      v-for="(chord, chordIndex) in row.binding.chords"
                      :key="`${row.binding.id}-${chordIndex}-${formatChord(chord)}`"
                      :aria-label="formatChord(chord)"
                    >
                      <Button
                        type="button"
                        size="sm"
                        :variant="isCapturing(row.binding.id, chordIndex) ? 'default' : 'outline'"
                        class="h-7 px-1.5"
                        :title="`Replace ${formatChord(chord)}`"
                        @click="startCapture(row.binding.id, chordIndex)"
                      >
                        <span
                          v-if="isCapturing(row.binding.id, chordIndex)"
                          class="font-data text-[11px]"
                        >
                          Press keys…
                        </span>
                        <HotkeyKbd v-else :keys="formatChord(chord)" size="sm" />
                      </Button>
                      <Button
                        v-if="!isCapturing(row.binding.id, chordIndex)"
                        type="button"
                        variant="outline"
                        size="icon-sm"
                        class="h-7 w-6 text-[11px] text-muted-foreground"
                        title="Remove shortcut"
                        aria-label="Remove shortcut"
                        @click="removeChord(row, chordIndex)"
                      >
                        ×
                      </Button>
                    </ButtonGroup>
                    <Button
                      type="button"
                      size="sm"
                      :variant="isCapturing(row.binding.id, 'append') ? 'default' : 'outline'"
                      class="h-7 w-7 shrink-0 rounded-sm px-0 text-xs"
                      title="Add shortcut"
                      @click="startCapture(row.binding.id, 'append')"
                    >
                      {{ isCapturing(row.binding.id, 'append') ? '…' : '+' }}
                    </Button>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </template>
      </div>
    </ScrollArea>
  </div>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Slider } from '@/components/ui/slider'
import HotkeyKbd from './HotkeyKbd.vue'
import { formatHotkeyWhenLabel } from './hotkeyWhenLabels'
import type { HotkeyBindingConfig } from '../utils/hotkeys'
import {
  chordFromKeyboardEvent,
  findChordConflicts,
  formatChord,
  formatChords,
  removeChordAt,
  upsertChord,
} from '../utils/hotkeys'
import { defaultWhenPredicates } from '../when'
import { getAppCommand, type AppCommand } from '../commands'
import { DEFAULT_TEXT_LOD_CACHE_SCREEN_PX } from '../utils/graph/pixiText'
import type { DiagramGridSettings } from '../utils/graph/diagramDotGrid'
import {
  hotkeyBindings,
  resetAllHotkeyBindings,
  resetHotkeyBinding,
  setHotkeyChords,
} from '../stores/hotkeyBindings'

export type SettingsSectionId = 'connections' | 'canvas' | 'hotkeys' | 'debug'

export type ConnectionSettingsModel = {
  highlightSelectedNodeConnections: boolean
  selectedNodeConnectionColor: string
  selectedNodeConnectionOverlayAmount: number
  selectedNodeConnectionWidth: number
  selectedNodeConnectionOpacity: number
}

type CaptureSlot = number | 'append'
type CaptureState = { id: string; index: CaptureSlot }

type HotkeyBindingView = {
  binding: HotkeyBindingConfig
  command: AppCommand
}

const props = defineProps<{
  connectionSettings: ConnectionSettingsModel
  gridSettings: DiagramGridSettings
  debugMode: boolean
  debugTiles: boolean
  debugLayoutContainers: boolean
  /** `null` = auto threshold from resolution / default CSS px. */
  textLodCacheScreenPx: number | null
  hasGraph: boolean
}>()

const emit = defineEmits<{
  'update:connectionSettings': [value: ConnectionSettingsModel]
  'update:gridSettings': [value: DiagramGridSettings]
  'update:debugMode': [value: boolean]
  'update:debugTiles': [value: boolean]
  'update:debugLayoutContainers': [value: boolean]
  'update:textLodCacheScreenPx': [value: number | null]
  'open-render-stats': []
}>()

const sections = [
  { id: 'connections' as const, label: 'Connections' },
  { id: 'canvas' as const, label: 'Canvas' },
  { id: 'hotkeys' as const, label: 'Hotkeys' },
  { id: 'debug' as const, label: 'Debug' },
]

const activeSection = ref<SettingsSectionId>('connections')
const capturing = ref<CaptureState | null>(null)
const hotkeySearch = ref('')
const defaultTextLodScreenPx = DEFAULT_TEXT_LOD_CACHE_SCREEN_PX

const patchGrid = (patch: Partial<DiagramGridSettings>) => {
  emit('update:gridSettings', { ...props.gridSettings, ...patch })
}

const textLodOverrideEnabled = computed(() => props.textLodCacheScreenPx != null)
const textLodThresholdPx = computed(() =>
  props.textLodCacheScreenPx ?? DEFAULT_TEXT_LOD_CACHE_SCREEN_PX
)

const onTextLodOverrideToggle = (v: boolean | 'indeterminate') => {
  if (v === true) {
    emit('update:textLodCacheScreenPx', DEFAULT_TEXT_LOD_CACHE_SCREEN_PX)
    return
  }
  emit('update:textLodCacheScreenPx', null)
}

const onTextLodThresholdSlide = (v: number[] | undefined) => {
  if (!textLodOverrideEnabled.value) return
  const px = Array.isArray(v) ? (v[0] ?? DEFAULT_TEXT_LOD_CACHE_SCREEN_PX) : DEFAULT_TEXT_LOD_CACHE_SCREEN_PX
  emit('update:textLodCacheScreenPx', px)
}

const bindingGroupName = (row: HotkeyBindingView): string => row.command.group?.trim() || 'Other'

const editableBindings = computed(() =>
  hotkeyBindings.value
    .map((binding) => ({ binding, command: getAppCommand(binding.id) }))
    .filter((row) => !row.command.hidden)
)

const conflictMap = computed(() => {
  const map: Record<string, string> = {}
  const configs = editableBindings.value.map((row) => row.binding)
  for (const row of editableBindings.value) {
    const conflicts = findChordConflicts(
      configs,
      row.binding.id,
      row.binding.chords,
      defaultWhenPredicates
    )
    if (conflicts.length) map[row.binding.id] = conflicts.join(', ')
  }
  return map
})

const bindingMatchesSearch = (row: HotkeyBindingView, query: string): boolean => {
  if (!query) return true
  const haystack = [
    row.command.label,
    row.binding.id,
    bindingGroupName(row),
    formatChords(row.binding.chords),
    formatHotkeyWhenLabel(row.binding),
  ]
    .join(' ')
    .toLowerCase()
  return haystack.includes(query)
}

const filteredGroups = computed(() => {
  const query = hotkeySearch.value.trim().toLowerCase()
  const groups: { name: string; bindings: HotkeyBindingView[] }[] = []
  const indexByName = new Map<string, number>()

  for (const binding of editableBindings.value) {
    if (!bindingMatchesSearch(binding, query)) continue
    const name = bindingGroupName(binding)
    let index = indexByName.get(name)
    if (index === undefined) {
      index = groups.length
      indexByName.set(name, index)
      groups.push({ name, bindings: [] })
    }
    groups[index]!.bindings.push(binding)
  }

  return groups
})

const isCapturing = (id: string, index: CaptureSlot): boolean =>
  capturing.value?.id === id && capturing.value.index === index

const stopCapture = () => {
  capturing.value = null
  window.removeEventListener('keydown', onCaptureKeydown, true)
}

const onCaptureKeydown = (event: KeyboardEvent) => {
  if (!capturing.value) return
  event.preventDefault()
  event.stopPropagation()
  event.stopImmediatePropagation()

  if (event.key === 'Escape') {
    stopCapture()
    return
  }

  const chord = chordFromKeyboardEvent(event)
  if (!chord) return

  const { id, index } = capturing.value
  const row = editableBindings.value.find((item) => item.binding.id === id)
  if (!row) {
    stopCapture()
    return
  }

  const nextChords = upsertChord(row.binding.chords, chord, index)
  setHotkeyChords({ id, chords: nextChords })
  stopCapture()
}

const startCapture = (id: string, index: CaptureSlot) => {
  if (isCapturing(id, index)) {
    stopCapture()
    return
  }
  stopCapture()
  capturing.value = { id, index }
  window.addEventListener('keydown', onCaptureKeydown, true)
}

const removeChord = (row: HotkeyBindingView, index: number) => {
  if (capturing.value?.id === row.binding.id) stopCapture()
  setHotkeyChords({
    id: row.binding.id,
    chords: removeChordAt(row.binding.chords, index),
  })
}

onUnmounted(() => {
  stopCapture()
})
</script>

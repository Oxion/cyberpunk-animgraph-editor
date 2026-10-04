<script setup lang="ts">
import { computed, inject } from 'vue'
import { ChevronDownIcon, ChevronUpIcon, PlusIcon, TrashIcon } from 'lucide-vue-next'
import {
  nodeDetailsContextKey,
  type NodeDetailsContext,
} from '../../../composables/useNodeDetailsContext'
import { structWrefNodeTarget } from '../../../utils/animFieldSchema'
import { resolveHandleId } from '../../../utils/graph/diagramMaterialize'
import PropertyEmbedRef from './PropertyEmbedRef.vue'

const props = defineProps<{
  dataKey: string
  label: string
  baseType: string
  /** Pin-input array: remove must disconnect / reindex wires. */
  pinBound?: boolean
}>()

const {
  selectedHandleData,
  handleDataRevision,
  notifySelectedHandleDataChanged,
  snapshotHandleField,
  recordHandleFieldEdit,
  removePinArraySlot,
  reorderPinArraySlot,
  handlesRegistry,
} = inject<NodeDetailsContext>(nodeDetailsContextKey)!

const data = computed(() => {
  void handleDataRevision.value
  return selectedHandleData.value
})

/**
 * Pin arrays (link or ref): compact slot list only — no nested node Data in details.
 * Edit connected nodes via their diagram boxes.
 */
const pinSlotsOnly = computed(() => props.pinBound === true)

/** Blank link wrapper (`animPoseLink`) vs bare ref slot (`null`). */
const isLinkElement = computed(() => structWrefNodeTarget(props.baseType) != null)

const rows = computed(() => {
  void handleDataRevision.value
  const raw = data.value?.[props.dataKey]
  const n = Array.isArray(raw) ? raw.length : 0
  return Array.from({ length: n }, (_, i) => i)
})

function slotHandleId(index: number): string {
  void handleDataRevision.value
  const raw = data.value?.[props.dataKey]
  const slot = Array.isArray(raw) ? raw[index] : undefined
  const reg = handlesRegistry.value
  return (reg ? resolveHandleId(slot, reg) : null) ?? '—'
}

/** Digits for max index — keeps badge width aligned across rows. */
const indexBadgeCh = computed(() => {
  const max = Math.max(0, rows.value.length - 1)
  return String(max).length
})

function ensureArray(d: Record<string, unknown>): unknown[] {
  let arr = d[props.dataKey]
  if (!Array.isArray(arr)) {
    arr = []
    d[props.dataKey] = arr
  }
  return arr as unknown[]
}

function mutate(fn: (arr: unknown[]) => void) {
  const d = data.value
  if (!d) return
  const before = snapshotHandleField(props.dataKey)
  fn(ensureArray(d))
  notifySelectedHandleDataChanged()
  recordHandleFieldEdit(props.dataKey, before, { immediate: true })
}

function addRow() {
  mutate((arr) => {
    if (isLinkElement.value) {
      arr.push({ $type: props.baseType, node: null })
      return
    }
    arr.push(null)
  })
}

function removeRow(index: number) {
  if (props.pinBound) {
    removePinArraySlot(props.dataKey, index)
    return
  }
  mutate((arr) => {
    if (index >= 0 && index < arr.length) arr.splice(index, 1)
  })
}

function moveRow(index: number, delta: -1 | 1) {
  const other = index + delta
  if (other < 0 || other >= rows.value.length) return
  if (props.pinBound) {
    reorderPinArraySlot(props.dataKey, index, delta)
    return
  }
  mutate((arr) => {
    if (other < 0 || other >= arr.length) return
    const tmp = arr[index]
    arr[index] = arr[other]
    arr[other] = tmp
  })
}
</script>

<template>
  <div class="prop-list">
    <div class="prop-list__head">
      <span>{{ label }}</span>
      <button
        type="button"
        class="prop-list__icon-btn"
        :title="`Add ${label}`"
        :aria-label="`Add ${label}`"
        @click="addRow"
      >
        <PlusIcon :size="12" />
      </button>
    </div>
    <div v-if="rows.length === 0" class="prop-list__empty">none</div>
    <template v-if="pinSlotsOnly">
      <div
        v-for="index in rows"
        :key="index"
        class="prop-list__row"
      >
        <span
          class="prop-list__index"
          :style="{ minWidth: `${indexBadgeCh}ch` }"
        >{{ index }}</span>
        <span class="prop-list__label">{{ slotHandleId(index) }}</span>
        <div class="prop-list__actions">
          <button
            type="button"
            class="prop-list__icon-btn"
            :disabled="index === 0"
            title="Move up"
            aria-label="Move up"
            @click="moveRow(index, -1)"
          >
            <ChevronUpIcon :size="12" />
          </button>
          <button
            type="button"
            class="prop-list__icon-btn"
            :disabled="index >= rows.length - 1"
            title="Move down"
            aria-label="Move down"
            @click="moveRow(index, 1)"
          >
            <ChevronDownIcon :size="12" />
          </button>
          <button
            type="button"
            class="prop-list__icon-btn prop-list__icon-btn--danger"
            :title="`Remove ${label}[${index}]`"
            :aria-label="`Remove ${label}[${index}]`"
            @click="removeRow(index)"
          >
            <TrashIcon :size="12" />
          </button>
        </div>
      </div>
    </template>
    <template v-else>
      <div
        v-for="index in rows"
        :key="index"
        class="prop-list__slot"
      >
        <div class="prop-list__slot-head">
          <span>[{{ index }}]</span>
          <div class="prop-list__actions">
            <button
              type="button"
              class="prop-list__icon-btn"
              :disabled="index === 0"
              title="Move up"
              aria-label="Move up"
              @click="moveRow(index, -1)"
            >
              <ChevronUpIcon :size="12" />
            </button>
            <button
              type="button"
              class="prop-list__icon-btn"
              :disabled="index >= rows.length - 1"
              title="Move down"
              aria-label="Move down"
              @click="moveRow(index, 1)"
            >
              <ChevronDownIcon :size="12" />
            </button>
            <button
              type="button"
              class="prop-list__icon-btn prop-list__icon-btn--danger"
              :title="`Remove ${label}[${index}]`"
              :aria-label="`Remove ${label}[${index}]`"
              @click="removeRow(index)"
            >
              <TrashIcon :size="12" />
            </button>
          </div>
        </div>
        <PropertyEmbedRef
          :data-key="dataKey"
          :label="`[${index}]`"
          :base-type="baseType"
          :index="index"
          :pin-bound="pinBound"
        />
      </div>
    </template>
  </div>
</template>

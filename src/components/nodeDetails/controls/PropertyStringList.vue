<script setup lang="ts">
import { computed, inject } from 'vue'
import { PlusIcon, TrashIcon } from 'lucide-vue-next'
import {
  nodeDetailsContextKey,
  type NodeDetailsContext,
} from '../../../composables/useNodeDetailsContext'
import {
  generateArrayElementValue,
} from '../../../utils/animFieldSchema'
import {
  readStringField,
  writeStringOrCName,
} from '../handleDataFields'
import PropertyTextField from './PropertyTextField.vue'

const props = defineProps<{
  dataKey: string
  label: string
}>()

const {
  selectedHandleData,
  handleDataRevision,
  notifySelectedHandleDataChanged,
  snapshotHandleField,
  recordHandleFieldEdit,
} = inject<NodeDetailsContext>(nodeDetailsContextKey)!

const data = computed(() => {
  void handleDataRevision.value
  return selectedHandleData.value
})

const ownerType = computed(() => {
  const t = data.value?.$type
  return typeof t === 'string' ? t : ''
})

const rows = computed(() => {
  void handleDataRevision.value
  const raw = data.value?.[props.dataKey]
  const n = Array.isArray(raw) ? raw.length : 0
  return Array.from({ length: n }, (_, i) => i)
})

function blankElement(): unknown {
  const fromField = generateArrayElementValue(ownerType.value, props.dataKey)
  if (fromField !== undefined) return fromField
  return { $type: 'CName', $storage: 'string', $value: 'None' }
}

function ensureArray(d: Record<string, unknown>): unknown[] {
  let arr = d[props.dataKey]
  if (!Array.isArray(arr)) {
    arr = []
    d[props.dataKey] = arr
  }
  return arr as unknown[]
}

function mutate(immediate: boolean, fn: (arr: unknown[]) => void) {
  const d = data.value
  if (!d) return
  const before = snapshotHandleField(props.dataKey)
  fn(ensureArray(d))
  notifySelectedHandleDataChanged()
  recordHandleFieldEdit(props.dataKey, before, { immediate })
}

function itemText(index: number): string {
  void handleDataRevision.value
  const raw = data.value?.[props.dataKey]
  const item = Array.isArray(raw) ? raw[index] : undefined
  return readStringField(item)
}

function setItem(index: number, text: string) {
  mutate(true, (arr) => {
    while (arr.length <= index) arr.push(blankElement())
    const holder: Record<string, unknown> = { value: arr[index] }
    writeStringOrCName(holder, 'value', text)
    arr[index] = holder.value
  })
}

function addRow() {
  mutate(true, (arr) => {
    arr.push(blankElement())
  })
}

function removeRow(index: number) {
  mutate(true, (arr) => {
    if (index >= 0 && index < arr.length) arr.splice(index, 1)
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
    <div
      v-for="index in rows"
      :key="index"
      class="prop-list__row justify-between"
    >
      <PropertyTextField
        class="min-w-0 flex-1 border-none bg-transparent p-0"
        :label="`[${index}]`"
        :model-value="itemText(index)"
        @update:model-value="setItem(index, $event)"
      />
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

<script setup lang="ts">
import { computed, inject } from 'vue'
import { PlusIcon, TrashIcon } from 'lucide-vue-next'
import {
  nodeDetailsContextKey,
  type NodeDetailsContext,
} from '../../../composables/useNodeDetailsContext'
import {
  fieldTypeName,
  generateArrayElementTemplate,
  generateArrayElementValue,
  generateDataTemplate,
  getAnimTypeFields,
  isArrayFieldType,
} from '../../../utils/animFieldSchema'
import PropertyStructElement, {
  type StructValuePatch,
} from './PropertyStructElement.vue'

const props = defineProps<{
  dataKey: string
  label: string
  elementType: string
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

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function elementTypeName(): string {
  const field = getAnimTypeFields(ownerType.value).find((f) => f.key === props.dataKey)
  if (field && isArrayFieldType(field.type)) return fieldTypeName(field.type.array)
  return props.elementType
}

function blankElement(): unknown {
  const fromField = generateArrayElementValue(ownerType.value, props.dataKey)
  if (fromField !== undefined) return fromField
  const named = elementTypeName()
  return (
    generateArrayElementTemplate(ownerType.value, props.dataKey) ??
    generateDataTemplate(named) ??
    { $type: named }
  )
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

function applyPathInPlace(
  root: Record<string, unknown>,
  path: string[],
  value: unknown,
  typeName: string
) {
  let cursor = root
  let currentType = typeName
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i]
    const field = getAnimTypeFields(currentType).find((f) => f.key === key)
    const childType = field ? fieldTypeName(field.type) : key
    let next = asRecord(cursor[key])
    if (!next) {
      next = generateDataTemplate(childType) ?? { $type: childType }
      cursor[key] = next
    }
    cursor = next
    currentType = childType
  }
  cursor[path[path.length - 1]] = value
}

function onPatch(index: number, patch: StructValuePatch) {
  mutate(patch.immediate, (arr) => {
    while (arr.length <= index) arr.push(blankElement())
    if (arr[index] == null) arr[index] = blankElement()
    if (patch.path.length === 0) {
      arr[index] = patch.value
      return
    }
    let root = asRecord(arr[index])
    if (!root) {
      root = asRecord(blankElement()) ?? { $type: elementTypeName() }
      arr[index] = root
    }
    applyPathInPlace(root, patch.path, patch.value, elementTypeName())
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

function elementAt(index: number): unknown {
  void handleDataRevision.value
  const raw = data.value?.[props.dataKey]
  return Array.isArray(raw) ? raw[index] : undefined
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
      class="prop-list__slot"
    >
      <div class="prop-list__slot-head">
        <span>[{{ index }}]</span>
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
      <PropertyStructElement
        :label="label"
        :type="elementTypeName()"
        :value="elementAt(index)"
        :revision="handleDataRevision"
        @change="onPatch(index, $event)"
      />
    </div>
  </div>
</template>


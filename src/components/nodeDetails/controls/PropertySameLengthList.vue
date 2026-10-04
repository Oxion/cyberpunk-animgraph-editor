<script setup lang="ts">
import { computed, inject } from 'vue'
import { PlusIcon, TrashIcon } from 'lucide-vue-next'
import {
  nodeDetailsContextKey,
  type NodeDetailsContext,
} from '../../../composables/useNodeDetailsContext'
import {
  fieldTypeName,
  generateArrayElementValue,
  generateDataTemplate,
  getAnimTypeFields,
  isArrayFieldType,
  resolveAnimType,
  type AnimFieldType,
} from '../../../utils/animFieldSchema'
import PropertyStructElement, {
  type StructValuePatch,
} from './PropertyStructElement.vue'

const props = defineProps<{
  label: string
  groupId: string
  groupFields: readonly string[]
}>()

const {
  selectedHandleData,
  handleDataRevision,
  notifySelectedHandleDataChanged,
  snapshotHandleField,
  snapshotHandleFields,
  recordHandleFieldEdit,
  recordHandleFieldsEdit,
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
  let max = 0
  for (const key of props.groupFields) {
    const raw = data.value?.[key]
    if (Array.isArray(raw)) max = Math.max(max, raw.length)
  }
  return Array.from({ length: max }, (_, i) => i)
})

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function elementType(fieldKey: string): AnimFieldType {
  const field = getAnimTypeFields(ownerType.value).find((f) => f.key === fieldKey)
  if (field && isArrayFieldType(field.type)) return field.type.array
  return 'unknown'
}

function elementTypeName(fieldKey: string): string {
  return fieldTypeName(elementType(fieldKey))
}

function isStructElement(fieldKey: string): boolean {
  const name = elementTypeName(fieldKey)
  if (name === 'QsTransform' || name === 'Vector4' || name === 'Quaternion') return true
  const kind = resolveAnimType(name)?.kind
  return kind === 'struct' || kind === 'class'
}

function blankElement(fieldKey: string): unknown {
  const value = generateArrayElementValue(ownerType.value, fieldKey)
  return value === undefined ? 0 : value
}

function ensureArray(d: Record<string, unknown>, key: string): unknown[] {
  let arr = d[key]
  if (!Array.isArray(arr)) {
    arr = []
    d[key] = arr
  }
  return arr as unknown[]
}

function mutateField(
  fieldKey: string,
  immediate: boolean,
  fn: (arr: unknown[]) => void
) {
  const d = data.value
  if (!d) return
  const before = snapshotHandleField(fieldKey)
  fn(ensureArray(d, fieldKey))
  notifySelectedHandleDataChanged()
  recordHandleFieldEdit(fieldKey, before, { immediate })
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

function padIndex(arr: unknown[], index: number, fieldKey: string) {
  while (arr.length <= index) arr.push(blankElement(fieldKey))
  if (arr[index] == null) arr[index] = blankElement(fieldKey)
}

function onPatch(fieldKey: string, index: number, patch: StructValuePatch) {
  mutateField(fieldKey, patch.immediate, (arr) => {
    padIndex(arr, index, fieldKey)
    if (patch.path.length === 0) {
      arr[index] = patch.value
      return
    }
    let root = asRecord(arr[index])
    if (!root) {
      root = asRecord(blankElement(fieldKey)) ?? { $type: elementTypeName(fieldKey) }
      arr[index] = root
    }
    applyPathInPlace(root, patch.path, patch.value, elementTypeName(fieldKey))
  })
}

function addRow() {
  const d = data.value
  if (!d) return
  const before = snapshotHandleFields(props.groupFields)
  for (const key of props.groupFields) {
    ensureArray(d, key).push(blankElement(key))
  }
  notifySelectedHandleDataChanged()
  recordHandleFieldsEdit(props.groupFields, before)
}

function removeRow(index: number) {
  const d = data.value
  if (!d) return
  const before = snapshotHandleFields(props.groupFields)
  for (const key of props.groupFields) {
    const arr = ensureArray(d, key)
    if (index >= 0 && index < arr.length) arr.splice(index, 1)
  }
  notifySelectedHandleDataChanged()
  recordHandleFieldsEdit(props.groupFields, before)
}

function elementAt(fieldKey: string, index: number): unknown {
  void handleDataRevision.value
  const raw = data.value?.[fieldKey]
  return Array.isArray(raw) ? raw[index] : undefined
}
</script>

<template>
  <div class="prop-list" :data-group="groupId">
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
      <div
        v-for="fieldKey in groupFields"
        :key="fieldKey"
        class="flex flex-col gap-1"
      >
        <div v-if="isStructElement(fieldKey)" class="text-xs text-muted-foreground">
          {{ fieldKey }}
        </div>
        <PropertyStructElement
          :label="fieldKey"
          :type="elementType(fieldKey)"
          :value="elementAt(fieldKey, index)"
          :revision="handleDataRevision"
          @change="onPatch(fieldKey, index, $event)"
        />
      </div>
    </div>
  </div>
</template>


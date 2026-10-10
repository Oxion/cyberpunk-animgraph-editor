<script setup lang="ts">
import { computed, inject } from 'vue'
import {
  nodeDetailsContextKey,
  type NodeDetailsContext,
} from '../../../composables/useNodeDetailsContext'
import { generateDataTemplate } from '../../../utils/animFieldSchema'
import { applyStructPath } from '../structPath'
import PropertyStructElement, {
  type StructValuePatch,
} from './PropertyStructElement.vue'

const props = defineProps<{
  dataKey: string
  label: string
  structType: string
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

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function obj(): Record<string, unknown> | null {
  void handleDataRevision.value
  return asRecord(data.value?.[props.dataKey])
}

function onChange(patch: StructValuePatch) {
  const d = data.value
  if (!d) return
  const before = snapshotHandleField(props.dataKey)
  if (patch.path.length === 0) {
    d[props.dataKey] = patch.value
  } else {
    let root = asRecord(d[props.dataKey])
    if (!root) {
      root = generateDataTemplate(props.structType) ?? { $type: props.structType }
      d[props.dataKey] = root
    }
    applyStructPath(root, patch.path, patch.value, props.structType)
  }
  notifySelectedHandleDataChanged()
  recordHandleFieldEdit(props.dataKey, before, { immediate: patch.immediate })
}
</script>

<template>
  <div class="prop-list">
    <div class="prop-list__head">{{ label }}</div>
    <div class="flex flex-col gap-1.5 px-2 pb-2">
      <PropertyStructElement
        :label="label"
        :type="structType"
        :value="obj()"
        :revision="handleDataRevision"
        :grouped="false"
        :data-key="dataKey"
        :data-path="[dataKey]"
        @change="onChange"
      />
    </div>
  </div>
</template>

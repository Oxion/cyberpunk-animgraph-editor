<script setup lang="ts">
import { computed, inject } from 'vue'
import { PlusIcon, TrashIcon } from 'lucide-vue-next'
import {
  defaultValueForFieldType,
  generateDataTemplate,
} from '../../../utils/animFieldSchema'
import {
  nodeDetailsContextKey,
  type NodeDetailsContext,
} from '../../../composables/useNodeDetailsContext'
import PropertyStructElement, {
  type StructValuePatch,
} from './PropertyStructElement.vue'

defineOptions({ name: 'PropertyStructArray' })

const props = defineProps<{
  label: string
  elementType: string
  value: unknown
  revision?: number
}>()

const emit = defineEmits<{
  change: [payload: StructValuePatch]
}>()

const { handleDataRevision } = inject<NodeDetailsContext>(nodeDetailsContextKey)!

function revision(): number {
  return props.revision ?? handleDataRevision.value
}

function items(): unknown[] {
  void revision()
  return Array.isArray(props.value) ? props.value : []
}

const rows = computed(() => {
  void revision()
  return items().map((_, i) => i)
})

function blank(): unknown {
  const named = props.elementType
  const tmpl = generateDataTemplate(named)
  if (tmpl) return tmpl
  const value = defaultValueForFieldType(named)
  if (value !== undefined && value !== null) {
    return typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value
  }
  return { $type: named }
}

function addRow() {
  emit('change', { path: [], value: [...items(), blank()], immediate: true })
}

function removeRow(index: number) {
  const next = items().slice()
  if (index >= 0 && index < next.length) next.splice(index, 1)
  emit('change', { path: [], value: next, immediate: true })
}

function onPatch(index: number, patch: StructValuePatch) {
  if (patch.path.length === 0) {
    const next = items().slice()
    next[index] = patch.value
    emit('change', { path: [], value: next, immediate: patch.immediate })
    return
  }
  emit('change', {
    path: [String(index), ...patch.path],
    value: patch.value,
    immediate: patch.immediate,
  })
}

function elementAt(index: number): unknown {
  void revision()
  return items()[index]
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
        :type="elementType"
        :value="elementAt(index)"
        :revision="revision()"
        @change="onPatch(index, $event)"
      />
    </div>
  </div>
</template>


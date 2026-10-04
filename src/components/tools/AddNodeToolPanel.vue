<template>
  <FieldGroup class="gap-3">
    <FieldSet class="gap-1 rounded-sm border border-border/60 bg-muted/30 px-2 py-1.5">
      <FieldLegend variant="label" class="mb-0 text-xs">
        Target
      </FieldLegend>
      <FieldDescription class="text-[11px] leading-snug">
        {{ targetLabel }}
      </FieldDescription>
    </FieldSet>

    <Field class="gap-1.5">
      <FieldLabel for="new-node-id" class="text-xs">
        Node ID
      </FieldLabel>
      <InputGroup class="h-8 rounded-sm">
        <InputGroupInput
          id="new-node-id"
          v-model="settings.draftNodeId"
          type="text"
          :readonly="isAutoId"
          :placeholder="isAutoId ? 'Auto ID…' : 'Enter node ID…'"
          class="h-8 text-xs"
          :class="isAutoId ? 'text-muted-foreground' : undefined"
        />
        <InputGroupAddon align="inline-end" class="py-0">
          <InputGroupButton
            size="icon-xs"
            :variant="isAutoId ? 'secondary' : 'ghost'"
            :title="idModeTitle"
            :aria-label="idModeTitle"
            :aria-pressed="isAutoId"
            @click="toggleIdMode"
          >
            <SparklesIcon v-if="isAutoId" />
            <PencilIcon v-else />
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </Field>

    <Field class="gap-1.5">
      <FieldLabel class="text-xs">
        Node Type
      </FieldLabel>
      <NodeTypePicker
        v-model="settings.selectedTypeKey"
        :options="addableTypes"
      />
    </Field>

    <FieldError
      v-if="gateMessage"
      class="text-[11px] text-amber-600 dark:text-amber-400"
    >
      {{ gateMessage }}
    </FieldError>

    <Button
      class="w-full rounded-sm"
      :disabled="!canSubmit"
      @click="onAdd"
    >
      Add Node
    </Button>
  </FieldGroup>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue'
import { PencilIcon, SparklesIcon } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group'
import { getActiveRenderData } from '@/stores/graphProject'
import { whenEnabled } from '@/stores/appContext'
import { addNodeToolState } from '@/stores/tools'
import {
  collectOccupiedNodeIds,
  suggestIdFromNodeType,
} from '@/utils/graph/nodeAddBootstrap'
import NodeTypePicker, {
  type NodeTypeOption,
} from './NodeTypePicker.vue'

export type { NodeTypeOption }

const props = defineProps<{
  targetLabel: string
  addableTypes: NodeTypeOption[]
  gateMessage?: string
}>()

const emit = defineEmits<{
  add: [payload: { id: string; type: string; slotName?: string }]
}>()

const settings = addNodeToolState

const isAutoId = computed(() => settings.idMode === 'auto')

const idModeTitle = computed(() =>
  isAutoId.value ? 'Auto ID (click for manual)' : 'Manual ID (click for auto)'
)

const selectedOption = computed(() =>
  props.addableTypes.find((o) => o.key === settings.selectedTypeKey)
)

const canSubmit = computed(
  () => whenEnabled('graphEditable') && !!settings.draftNodeId.trim() && !!selectedOption.value
)

const occupiedIds = () => {
  const data = getActiveRenderData()
  return collectOccupiedNodeIds({
    handlesRegistry: data?.handlesRegistry ?? new Map(),
    allNodes: data?.allNodes,
  })
}

const applySuggestedId = (reserved?: string) => {
  const opt = selectedOption.value
  if (!opt) {
    settings.draftNodeId = ''
    return
  }
  const occupied = occupiedIds()
  if (reserved) occupied.add(reserved)
  settings.draftNodeId = suggestIdFromNodeType(opt.idFromType, occupied)
}

watch(
  () => props.addableTypes,
  (types) => {
    if (types.length === 0) {
      settings.selectedTypeKey = ''
      return
    }
    if (!types.some((o) => o.key === settings.selectedTypeKey)) {
      settings.selectedTypeKey = types[0]?.key ?? ''
    }
  },
  { immediate: true }
)

watch(
  () => [settings.selectedTypeKey, selectedOption.value?.idFromType] as const,
  () => {
    if (settings.idMode === 'auto') applySuggestedId()
  },
  { immediate: true }
)

const toggleIdMode = () => {
  if (settings.idMode === 'auto') {
    settings.idMode = 'manual'
    return
  }
  settings.idMode = 'auto'
  applySuggestedId()
}

const onAdd = () => {
  const id = settings.draftNodeId.trim()
  const opt = selectedOption.value
  if (!id || !opt) return
  emit('add', {
    id,
    type: opt.diagramNodeType,
    ...(opt.slotName ? { slotName: opt.slotName } : {}),
  })
  if (settings.idMode === 'auto') applySuggestedId(id)
}
</script>

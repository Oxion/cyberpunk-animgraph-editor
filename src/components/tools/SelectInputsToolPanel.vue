<template>
  <p v-if="selectedCount === 0" class="tool-hint">
    Select one or more nodes on the graph first
  </p>
  <FieldGroup v-else class="gap-3">
    <FieldDescription class="text-[11px] leading-snug">
      {{ selectedCount }} node(s) selected.
      <template v-if="newCount > 0">
        {{ newCount }} input node(s) to add.
      </template>
      <template v-else>
        No new input nodes found.
      </template>
    </FieldDescription>

    <Field orientation="horizontal" class="items-center gap-2">
      <Checkbox
        id="select-inputs-recursive"
        v-model="settings.recursive"
      />
      <FieldLabel
        for="select-inputs-recursive"
        class="text-xs font-normal"
      >
        Recursive (inputs of inputs)
      </FieldLabel>
    </Field>

    <Button
      class="w-full"
      :disabled="newCount === 0"
      @click="executeAppCommand(Commands.selectInputs.add, { recursive: settings.recursive })"
    >
      Add Inputs to Selection
    </Button>
  </FieldGroup>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Commands } from '@/app/commands'
import { executeAppCommand } from '@/app/commands/execute'
import { getActiveRenderData } from '@/stores/graphProject'
import { selectedNodeIdsRef } from '@/stores/graphSession'
import { selectInputsToolState } from '@/stores/tools'
import { collectInputNodeIds } from '@/utils/graph/diagramUtils'

const settings = selectInputsToolState
const selectedCount = computed(() => selectedNodeIdsRef.value.length)
const newCount = computed(() => {
  const data = getActiveRenderData()
  if (!data || selectedNodeIdsRef.value.length === 0) return 0
  const selectedSet = new Set(selectedNodeIdsRef.value)
  const inputIds = collectInputNodeIds(
    selectedNodeIdsRef.value,
    data.connections,
    settings.recursive
  )
  return inputIds.filter((id) => !selectedSet.has(id)).length
})
</script>

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
      @click="emit('add', settings.recursive)"
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
import { selectInputsToolState } from '@/stores/tools'

const props = defineProps<{
  selectedCount: number
  resolveNewCount: (recursive: boolean) => number
}>()

const emit = defineEmits<{
  add: [recursive: boolean]
}>()

const settings = selectInputsToolState
const newCount = computed(() => props.resolveNewCount(settings.recursive))
</script>

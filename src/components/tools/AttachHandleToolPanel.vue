<template>
  <Button
    class="w-full rounded-sm"
    :disabled="!hasSelection"
    @click="emit('create')"
  >
    Create
  </Button>

  <template v-if="actionNodeId">
    <Button variant="secondary" class="w-full rounded-sm" @click="emit('clear')">
      Clear
    </Button>
    <div class="divider"></div>
    <div class="tool-action-info">
      <span class="tool-action-label">Node ID:</span>
      <span class="tool-action-value">{{ actionNodeId }}</span>
    </div>
    <Button
      variant="secondary"
      class="w-full rounded-sm"
      :disabled="!hasSelection"
      @click="emit('dataFromSelected')"
    >
      Data from Selected
    </Button>
    <Button class="w-full rounded-sm" @click="emit('run')">
      Run
    </Button>
  </template>

  <div v-if="!hasSelection" class="tool-hint">
    Select a node first to create action
  </div>
</template>

<script setup lang="ts">
import { Button } from '@/components/ui/button'

defineProps<{
  hasSelection: boolean
  actionNodeId: string | null
}>()

const emit = defineEmits<{
  create: []
  clear: []
  dataFromSelected: []
  run: []
}>()
</script>

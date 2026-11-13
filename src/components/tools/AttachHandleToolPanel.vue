<template>
  <Button
    class="w-full rounded-sm"
    :disabled="!hasSelection"
    @click="executeAppCommand(Commands.attachHandle.create)"
  >
    Create
  </Button>

  <template v-if="actionNodeId">
    <Button
      variant="secondary"
      class="w-full rounded-sm"
      @click="executeAppCommand(Commands.attachHandle.clear)"
    >
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
      @click="executeAppCommand(Commands.attachHandle.dataFromSelected)"
    >
      Data from Selected
    </Button>
    <Button
      class="w-full rounded-sm"
      @click="executeAppCommand(Commands.attachHandle.run)"
    >
      Run
    </Button>
  </template>

  <div v-if="!hasSelection" class="tool-hint">
    Select a node first to create action
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Button } from '@/components/ui/button'
import { Commands } from '@/app/commands'
import { executeAppCommand } from '@/app/commands/execute'
import { selectedNodeRef } from '@/stores/graphSession'
import { attachHandleToolState } from '@/stores/tools'

const hasSelection = computed(() => Boolean(selectedNodeRef.value))
const actionNodeId = computed(() => attachHandleToolState.actionNodeId)
</script>

<script setup lang="ts">
import { Zap } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { useDiagramDetailsTypeActions } from './useDiagramDetailsTypeActions'

const { visibleTypeActions, runTypeAction } = useDiagramDetailsTypeActions()
</script>

<template>
  <div class="flex w-full min-h-7 items-center justify-between gap-2">
    <div class="flex min-w-0 items-center gap-1.5">
      <span class="inline-flex size-5 shrink-0 items-center justify-center text-muted-foreground" aria-hidden="true">
        <Zap :size="14" />
      </span>
      <span class="text-xs font-semibold text-foreground">Actions</span>
    </div>
    <div class="flex items-center gap-1">
      <Button
        v-for="action in visibleTypeActions"
        :key="action.id"
        type="button"
        size="icon-xs"
        variant="outline"
        :title="action.title"
        :disabled="action.disabled"
        @click.stop="runTypeAction(action.id)"
      >
        <component :is="action.icon" :size="14" />
      </Button>
    </div>
  </div>
</template>

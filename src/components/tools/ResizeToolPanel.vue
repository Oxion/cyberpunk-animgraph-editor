<template>
  <FieldGroup class="gap-3">
    <template v-if="!active">
      <p v-if="selectedCount === 0" class="tool-hint">
        Select one or more nodes, then
        <template v-if="commandShortcut('resize.begin')">
          press
          <HotkeyKbd command="resize.begin" size="sm" />
          or
        </template>
        Start Resize.
      </p>
      <FieldDescription v-else class="text-[11px] leading-snug">
        Mouse resizes. Lock a side: x−/x+/y−/y+.
        x− and y− also move position so the opposite edge stays fixed.
        Parents grow recursively on overflow to fit the selection bbox.
      </FieldDescription>
      <Button
        type="button"
        class="inline-flex w-full items-center justify-center gap-1.5"
        :disabled="!commandEnabled('resize.begin')"
        @click="emit('start')"
      >
        <span>Start Resize</span>
        <HotkeyKbd command="resize.begin" />
      </Button>
    </template>

    <template v-else>
      <div class="flex min-w-0 flex-wrap gap-1">
        <Button
          type="button"
          size="xs"
          class="inline-flex items-center gap-1"
          :variant="sideLock === 'none' ? 'default' : 'outline'"
          @click="emit('clearSideLock')"
        >
          <span>Free</span>
          <span class="text-[10px] text-muted-foreground">R+B</span>
        </Button>
        <Button
          type="button"
          size="xs"
          class="inline-flex items-center gap-1"
          :variant="sideLock === 'left' ? 'default' : 'outline'"
          @click="emit('setSideLock', 'left')"
        >
          <span>x−</span>
          <HotkeyKbd command="resize.lockLeft" size="sm" />
        </Button>
        <Button
          type="button"
          size="xs"
          class="inline-flex items-center gap-1"
          :variant="sideLock === 'right' ? 'default' : 'outline'"
          @click="emit('setSideLock', 'right')"
        >
          <span>x+</span>
          <HotkeyKbd command="resize.lockRight" size="sm" />
        </Button>
        <Button
          type="button"
          size="xs"
          class="inline-flex items-center gap-1"
          :variant="sideLock === 'top' ? 'default' : 'outline'"
          @click="emit('setSideLock', 'top')"
        >
          <span>y−</span>
          <HotkeyKbd command="resize.lockTop" size="sm" />
        </Button>
        <Button
          type="button"
          size="xs"
          class="inline-flex items-center gap-1"
          :variant="sideLock === 'bottom' ? 'default' : 'outline'"
          @click="emit('setSideLock', 'bottom')"
        >
          <span>y+</span>
          <HotkeyKbd command="resize.lockBottom" size="sm" />
        </Button>
      </div>

      <div class="grid grid-cols-2 gap-1.5">
        <Button
          type="button"
          class="inline-flex w-full items-center justify-center gap-1.5"
          @click="emit('confirm')"
        >
          <span>OK</span>
          <HotkeyKbd command="resize.confirm" size="sm" />
        </Button>
        <Button
          type="button"
          variant="secondary"
          class="inline-flex w-full items-center justify-center gap-1.5"
          @click="emit('cancel')"
        >
          <span>Cancel</span>
          <HotkeyKbd command="resize.cancel" size="sm" />
        </Button>
      </div>
    </template>
  </FieldGroup>
</template>

<script setup lang="ts">
import { Button } from '@/components/ui/button'
import { FieldDescription, FieldGroup } from '@/components/ui/field'
import { commandShortcut } from '../../stores/hotkeyBindings'
import { commandEnabled } from '../../stores/appContext'
import HotkeyKbd from '../HotkeyKbd.vue'

defineProps<{
  selectedCount: number
  active: boolean
  size: { width: number; height: number }
  position: { x: number; y: number }
  sizeDelta: { width: number; height: number }
  sideLock: 'none' | 'left' | 'right' | 'top' | 'bottom'
}>()

const emit = defineEmits<{
  start: []
  confirm: []
  cancel: []
  clearSideLock: []
  setSideLock: ['left' | 'right' | 'top' | 'bottom']
}>()
</script>

<template>
  <FieldGroup class="gap-3">
    <template v-if="!active">
      <p v-if="selectedCount === 0" class="tool-hint">
        Select one or more nodes, then
        <template v-if="commandShortcut('grabMove.begin')">
          press
          <HotkeyKbd command="grabMove.begin" size="sm" />
          or
        </template>
        Start Move.
      </p>
      <FieldDescription v-else class="text-[11px] leading-snug">
        Blender-style grab: move follows the cursor.
        Parents grow recursively on overflow to fit the selection bbox.
        <template v-if="commandShortcut('grabMove.lockX') || commandShortcut('grabMove.lockY')">
          Lock axis with
          <HotkeyKbd command="grabMove.lockX" size="sm" />
          <template v-if="commandShortcut('grabMove.lockX') && commandShortcut('grabMove.lockY')"> / </template>
          <HotkeyKbd command="grabMove.lockY" size="sm" />.
        </template>
      </FieldDescription>
      <Button
        type="button"
        class="inline-flex w-full items-center justify-center gap-1.5"
        :disabled="!commandEnabled('grabMove.begin')"
        @click="emit('start')"
      >
        <span>Start Move</span>
        <HotkeyKbd command="grabMove.begin" />
      </Button>
    </template>

    <template v-else>
      <div class="flex min-w-0 flex-wrap gap-1">
        <Button
          type="button"
          size="xs"
          :variant="axisLock === 'none' ? 'default' : 'outline'"
          @click="emit('clearAxisLock')"
        >
          Free
        </Button>
        <Button
          type="button"
          size="xs"
          class="inline-flex items-center gap-1"
          :variant="axisLock === 'x' ? 'default' : 'outline'"
          @click="emit('setAxisLock', 'x')"
        >
          <span>X</span>
          <HotkeyKbd command="grabMove.lockX" size="sm" />
        </Button>
        <Button
          type="button"
          size="xs"
          class="inline-flex items-center gap-1"
          :variant="axisLock === 'y' ? 'default' : 'outline'"
          @click="emit('setAxisLock', 'y')"
        >
          <span>Y</span>
          <HotkeyKbd command="grabMove.lockY" size="sm" />
        </Button>
      </div>

      <div class="grid grid-cols-2 gap-1.5">
        <Button
          type="button"
          class="inline-flex w-full items-center justify-center gap-1.5"
          @click="emit('confirm')"
        >
          <span>OK</span>
          <HotkeyKbd command="grabMove.confirm" size="sm" />
        </Button>
        <Button
          type="button"
          variant="secondary"
          class="inline-flex w-full items-center justify-center gap-1.5"
          @click="emit('cancel')"
        >
          <span>Cancel</span>
          <HotkeyKbd command="grabMove.cancel" size="sm" />
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
  position: { x: number; y: number }
  delta: { x: number; y: number }
  axisLock: 'none' | 'x' | 'y'
}>()

const emit = defineEmits<{
  start: []
  confirm: []
  cancel: []
  clearAxisLock: []
  setAxisLock: ['x' | 'y']
}>()
</script>

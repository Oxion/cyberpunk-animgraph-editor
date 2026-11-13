<template>
  <FieldGroup class="gap-3">
    <template v-if="!active">
      <p v-if="selectedCount === 0" class="tool-hint">
        Select one or more nodes, then
        <template v-if="hasHotkeyBinding(Commands.resize.begin)">
          press
          <HotkeyKbd :chord="getFirstHotkeyChord(Commands.resize.begin)" size="sm" />
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
        :disabled="!appCommandWithIdEnabled(Commands.resize.begin)"
        @click="executeAppCommand(Commands.resize.begin)"
      >
        <span>Start Resize</span>
        <HotkeyKbd :chord="getFirstHotkeyChord(Commands.resize.begin)" />
      </Button>
    </template>

    <template v-else>
      <div class="flex min-w-0 flex-wrap gap-1">
        <Button
          type="button"
          size="xs"
          class="inline-flex items-center gap-1"
          :variant="sideLock === 'none' ? 'default' : 'outline'"
          @click="executeAppCommand(Commands.resize.clearSideLock)"
        >
          <span>Free</span>
          <span class="text-[10px] text-muted-foreground">R+B</span>
        </Button>
        <Button
          type="button"
          size="xs"
          class="inline-flex items-center gap-1"
          :variant="sideLock === 'left' ? 'default' : 'outline'"
          @click="executeAppCommand(Commands.resize.lockLeft)"
        >
          <span>x−</span>
          <HotkeyKbd :chord="getFirstHotkeyChord(Commands.resize.lockLeft)" size="sm" />
        </Button>
        <Button
          type="button"
          size="xs"
          class="inline-flex items-center gap-1"
          :variant="sideLock === 'right' ? 'default' : 'outline'"
          @click="executeAppCommand(Commands.resize.lockRight)"
        >
          <span>x+</span>
          <HotkeyKbd :chord="getFirstHotkeyChord(Commands.resize.lockRight)" size="sm" />
        </Button>
        <Button
          type="button"
          size="xs"
          class="inline-flex items-center gap-1"
          :variant="sideLock === 'top' ? 'default' : 'outline'"
          @click="executeAppCommand(Commands.resize.lockTop)"
        >
          <span>y−</span>
          <HotkeyKbd :chord="getFirstHotkeyChord(Commands.resize.lockTop)" size="sm" />
        </Button>
        <Button
          type="button"
          size="xs"
          class="inline-flex items-center gap-1"
          :variant="sideLock === 'bottom' ? 'default' : 'outline'"
          @click="executeAppCommand(Commands.resize.lockBottom)"
        >
          <span>y+</span>
          <HotkeyKbd :chord="getFirstHotkeyChord(Commands.resize.lockBottom)" size="sm" />
        </Button>
      </div>

      <div class="grid grid-cols-2 gap-1.5">
        <Button
          type="button"
          class="inline-flex w-full items-center justify-center gap-1.5"
          @click="executeAppCommand(Commands.resize.confirm)"
        >
          <span>OK</span>
          <HotkeyKbd :chord="getFirstHotkeyChord(Commands.resize.confirm)" size="sm" />
        </Button>
        <Button
          type="button"
          variant="secondary"
          class="inline-flex w-full items-center justify-center gap-1.5"
          @click="executeAppCommand(Commands.resize.cancel)"
        >
          <span>Cancel</span>
          <HotkeyKbd :chord="getFirstHotkeyChord(Commands.resize.cancel)" size="sm" />
        </Button>
      </div>
    </template>
  </FieldGroup>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Button } from '@/components/ui/button'
import { FieldDescription, FieldGroup } from '@/components/ui/field'
import { Commands } from '@/app/commands'
import { executeAppCommand } from '@/app/commands/execute'
import { appCommandWithIdEnabled } from '@/app/commands/predicate'
import { getFirstHotkeyChord, hasHotkeyBinding } from '../../stores/hotkeyBindings'
import { selectedNodeIdsRef } from '../../stores/graphSession'
import { resizeSessionState } from '@/app/tools/handlers/resize'
import HotkeyKbd from '../HotkeyKbd.vue'

const selectedCount = computed(() => selectedNodeIdsRef.value.length)
const active = computed(() => Boolean(resizeSessionState.session))
const sideLock = computed(() => resizeSessionState.session?.sideLock ?? ('none' as const))
</script>

<template>
  <FieldGroup class="gap-3">
    <template v-if="!active">
      <p v-if="selectedCount === 0" class="tool-hint">
        Select one or more nodes, then
        <template v-if="hasHotkeyBinding(Commands.grabMove.begin)">
          press
          <HotkeyKbd :chord="getFirstHotkeyChord(Commands.grabMove.begin)" size="sm" />
          or
        </template>
        Start Move.
      </p>
      <FieldDescription v-else class="text-[11px] leading-snug">
        Blender-style grab: move follows the cursor.
        Parents grow recursively on overflow to fit the selection bbox.
        <template v-if="hasHotkeyBinding(Commands.grabMove.lockX) || hasHotkeyBinding(Commands.grabMove.lockY)">
          Lock axis with
          <HotkeyKbd :chord="getFirstHotkeyChord(Commands.grabMove.lockX)" size="sm" />
          <template v-if="hasHotkeyBinding(Commands.grabMove.lockX) && hasHotkeyBinding(Commands.grabMove.lockY)"> / </template>
          <HotkeyKbd :chord="getFirstHotkeyChord(Commands.grabMove.lockY)" size="sm" />.
        </template>
      </FieldDescription>
      <Button
        type="button"
        class="inline-flex w-full items-center justify-center gap-1.5"
        :disabled="!appCommandWithIdEnabled(Commands.grabMove.begin)"
        @click="executeAppCommand(Commands.grabMove.begin)"
      >
        <span>Start Move</span>
        <HotkeyKbd :chord="getFirstHotkeyChord(Commands.grabMove.begin)" />
      </Button>
    </template>

    <template v-else>
      <div class="flex min-w-0 flex-wrap gap-1">
        <Button
          type="button"
          size="xs"
          :variant="axisLock === 'none' ? 'default' : 'outline'"
          @click="executeAppCommand(Commands.grabMove.clearAxisLock)"
        >
          Free
        </Button>
        <Button
          type="button"
          size="xs"
          class="inline-flex items-center gap-1"
          :variant="axisLock === 'x' ? 'default' : 'outline'"
          @click="executeAppCommand(Commands.grabMove.lockX)"
        >
          <span>X</span>
          <HotkeyKbd :chord="getFirstHotkeyChord(Commands.grabMove.lockX)" size="sm" />
        </Button>
        <Button
          type="button"
          size="xs"
          class="inline-flex items-center gap-1"
          :variant="axisLock === 'y' ? 'default' : 'outline'"
          @click="executeAppCommand(Commands.grabMove.lockY)"
        >
          <span>Y</span>
          <HotkeyKbd :chord="getFirstHotkeyChord(Commands.grabMove.lockY)" size="sm" />
        </Button>
      </div>

      <div class="grid grid-cols-2 gap-1.5">
        <Button
          type="button"
          class="inline-flex w-full items-center justify-center gap-1.5"
          @click="executeAppCommand(Commands.grabMove.confirm)"
        >
          <span>OK</span>
          <HotkeyKbd :chord="getFirstHotkeyChord(Commands.grabMove.confirm)" size="sm" />
        </Button>
        <Button
          type="button"
          variant="secondary"
          class="inline-flex w-full items-center justify-center gap-1.5"
          @click="executeAppCommand(Commands.grabMove.cancel)"
        >
          <span>Cancel</span>
          <HotkeyKbd :chord="getFirstHotkeyChord(Commands.grabMove.cancel)" size="sm" />
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
import { moveSessionState } from '@/app/tools/handlers/move'
import HotkeyKbd from '../HotkeyKbd.vue'

const selectedCount = computed(() => selectedNodeIdsRef.value.length)
const active = computed(() => Boolean(moveSessionState.session))
const axisLock = computed(() => moveSessionState.session?.axisLock ?? ('none' as const))
</script>

<script setup lang="ts">
import { computed } from 'vue'
import type { AppCommandId } from '../commands'
import { commandShortcut } from '../stores/hotkeyBindings'

const props = withDefaults(
  defineProps<{
    /** Single key, chord ("Ctrl+Z"), or list of key labels. */
    keys?: string | string[]
    /** Resolve the first chord from current hotkey bindings. */
    command?: AppCommandId
    size?: 'sm' | 'md'
  }>(),
  { size: 'md' }
)

const parts = computed(() => {
  const source = props.command ? commandShortcut(props.command) : props.keys
  if (!source) return []
  if (Array.isArray(source)) return source.filter(Boolean)
  return source
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean)
})
</script>

<template>
  <span
    v-if="parts.length"
    class="inline-flex shrink-0 items-center gap-0.5 align-middle"
    :class="size === 'sm' ? 'text-[9px]' : 'text-[10px]'"
    aria-hidden="true"
  >
    <template v-for="(part, i) in parts" :key="`${part}-${i}`">
      <kbd
        class="hotkey-kbd inline-flex items-center justify-center rounded-sm border border-hairline border-b-2 bg-secondary px-1.5 font-mono font-semibold text-muted-foreground"
        :class="size === 'sm' ? 'h-4 min-w-[18px] px-1 text-[10px]' : 'h-5 min-w-[22px] text-[11px]'"
      >
        {{ part }}
      </kbd>
      <span v-if="i < parts.length - 1" class="font-semibold text-muted-foreground">+</span>
    </template>
  </span>
</template>

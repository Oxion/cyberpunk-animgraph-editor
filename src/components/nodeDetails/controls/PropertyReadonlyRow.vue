<script setup lang="ts">
import { ref } from 'vue'
import { CheckIcon, CopyIcon } from 'lucide-vue-next'

const props = withDefaults(
  defineProps<{
    label: string
    value: string
    /** Show a one-click copy button (opt-in, case by case). */
    copyable?: boolean
  }>(),
  {
    copyable: false,
  }
)

const copied = ref(false)
let copiedTimer: ReturnType<typeof setTimeout> | undefined

async function copyValue() {
  const text = props.value
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    return
  }
  copied.value = true
  if (copiedTimer) clearTimeout(copiedTimer)
  copiedTimer = setTimeout(() => {
    copied.value = false
  }, 1200)
}
</script>

<template>
  <div class="prop-chrome gap-2 pl-2" :class="{ 'pr-2': !copyable }">
    <span class="prop-chrome-muted max-w-[42%] shrink-0">{{ label }}</span>
    <input
      type="text"
      class="h-full min-w-0 flex-1 cursor-text border-none bg-transparent p-0 text-right text-[11px] leading-[26px] text-foreground outline-none select-text"
      :value="value"
      readonly
      tabindex="0"
      :aria-label="label"
      :title="value"
    >
    <button
      v-if="copyable"
      type="button"
      class="prop-chrome-side prop-chrome-side--right"
      :aria-label="`Copy ${label}`"
      :title="copied ? 'Copied' : 'Copy'"
      @click="copyValue"
    >
      <CheckIcon
        v-if="copied"
        class="shrink-0 text-primary"
        :size="12"
        :stroke-width="2.5"
      />
      <CopyIcon
        v-else
        class="shrink-0"
        :size="12"
        :stroke-width="2"
      />
    </button>
  </div>
</template>

<template>
  <div
    class="pointer-events-none absolute inset-0 z-[5] flex items-center justify-center bg-canvas/80"
    aria-live="polite"
    aria-busy="true"
  >
    <div class="flex flex-col items-center gap-3">
      <div
        class="size-7 animate-spin rounded-full border-2 border-hairline border-t-primary"
        aria-hidden="true"
      />
      <p class="m-0 text-sm text-muted-foreground">{{ label }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    label?: string
  }>(),
  {
    label: 'Loading diagram…',
  }
)
</script>

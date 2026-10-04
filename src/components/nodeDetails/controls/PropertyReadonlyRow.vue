<script setup lang="ts">
defineProps<{
  label: string
  value: string
}>()
</script>

<template>
  <div class="prop-chrome">
    <span class="prop-chrome-muted min-w-0 flex-1 px-2">{{ label }}</span>
    <span class="prop-chrome-value max-w-[55%] truncate px-2 text-right leading-[26px]">{{ value }}</span>
  </div>
</template>

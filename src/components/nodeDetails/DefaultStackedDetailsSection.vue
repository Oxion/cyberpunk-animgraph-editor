<script setup lang="ts">
/**
 * Fallback panel for diagram types without a dedicated registry entry.
 * Same dynamic Data editors as TypedData (scalars / bool / CName; pins as presence).
 */
import TypedDataDetailsSection from './TypedDataDetailsSection.vue'
</script>

<template>
  <TypedDataDetailsSection />
</template>

<script setup lang="ts">
import HandleDataFieldsForm from './HandleDataFieldsForm.vue'
import { CONDITIONAL_ENTRY_PROPERTY_FIELDS } from './handleDataFields'
</script>

<template>
  <HandleDataFieldsForm :fields="CONDITIONAL_ENTRY_PROPERTY_FIELDS" />
</template>

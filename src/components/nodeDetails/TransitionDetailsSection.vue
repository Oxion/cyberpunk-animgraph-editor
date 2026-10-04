<script setup lang="ts">
import HandleDataFieldsForm from './HandleDataFieldsForm.vue'
import { TRANSITION_PROPERTY_FIELDS } from './handleDataFields'
</script>

<template>
  <HandleDataFieldsForm :fields="TRANSITION_PROPERTY_FIELDS" />
</template>

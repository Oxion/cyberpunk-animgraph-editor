<script setup lang="ts">
import { ref, watch, inject } from 'vue'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  nodeDetailsContextKey,
  type NodeDetailsContext,
} from '../../composables/useNodeDetailsContext'
import { readDiagramNoteText } from '../../utils/graph/diagramFrameNodes'

const { selectedNode, saveNodeText } = inject<NodeDetailsContext>(nodeDetailsContextKey)!

const draft = ref('')

watch(
  selectedNode,
  (node) => {
    draft.value = node ? readDiagramNoteText(node) : ''
  },
  { immediate: true }
)

function save() {
  saveNodeText(draft.value)
}
</script>

<template>
  <div class="note-details">
    <Textarea
      v-model="draft"
      placeholder="Note text"
      class="note-details__text min-h-[6rem] rounded-sm text-xs"
      rows="5"
    />
    <Button size="sm" class="rounded-sm" @click="save">
      Save text
    </Button>
  </div>
</template>

<style scoped>
.note-details {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 2px;
}

.note-details__text {
  width: 100%;
}
</style>

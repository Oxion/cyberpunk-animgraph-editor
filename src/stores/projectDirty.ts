import { ref } from 'vue'

/** True after edits since last successful save / fresh load. */
export const isProjectDirty = ref(false)

export function markProjectDirty() {
  isProjectDirty.value = true
}

export function clearProjectDirty() {
  isProjectDirty.value = false
}

/** Returns false if the user cancels. */
export function confirmDiscardUnsavedChanges(): boolean {
  if (!isProjectDirty.value) return true
  return confirm('You have unsaved changes. Discard them and continue?')
}

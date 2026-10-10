import { ref } from 'vue'

/** Absolute path of the loaded project file, or null when unsaved / browser-only. */
export const currentLoadedPath = ref<string | null>(null)

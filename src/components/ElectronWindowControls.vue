<script setup lang="ts">
import { Copy, Minus, Square, X } from 'lucide-vue-next'
import { onMounted, onUnmounted, ref } from 'vue'
import { isElectron } from '../utils/platform'

const visible = isElectron()
const maximized = ref(false)

async function refreshMaximized() {
  if (!visible || !window.electronAPI) return
  maximized.value = await window.electronAPI.windowIsMaximized()
}

async function onMinimize() {
  await window.electronAPI?.windowMinimize()
}

async function onMaximize() {
  await window.electronAPI?.windowMaximize()
}

async function onClose() {
  await window.electronAPI?.windowClose()
}

let stopMaximizedWatch: (() => void) | undefined

onMounted(() => {
  if (!visible) return
  void refreshMaximized()
  stopMaximizedWatch = window.electronAPI?.onMaximizedChanged((value) => {
    maximized.value = value
  })
})

onUnmounted(() => {
  stopMaximizedWatch?.()
})
</script>

<template>
  <div v-if="visible" class="window-controls" role="group" aria-label="Window controls">
    <button
      type="button"
      class="window-controls__btn"
      title="Minimize"
      aria-label="Minimize"
      @click="onMinimize"
    >
      <Minus :size="14" aria-hidden="true" />
    </button>
    <button
      type="button"
      class="window-controls__btn"
      :title="maximized ? 'Restore' : 'Maximize'"
      :aria-label="maximized ? 'Restore' : 'Maximize'"
      @click="onMaximize"
    >
      <Copy v-if="maximized" :size="12" aria-hidden="true" class="window-controls__restore" />
      <Square v-else :size="12" aria-hidden="true" />
    </button>
    <button
      type="button"
      class="window-controls__btn window-controls__btn--close"
      title="Close"
      aria-label="Close"
      @click="onClose"
    >
      <X :size="14" aria-hidden="true" />
    </button>
  </div>
</template>

<style scoped>
.window-controls {
  display: flex;
  align-items: stretch;
  align-self: stretch;
  margin: -4px -10px -4px 8px;
  -webkit-app-region: no-drag;
  app-region: no-drag;
}

.window-controls__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 46px;
  min-height: 36px;
  padding: 0;
  border: none;
  border-radius: 0;
  background: transparent;
  color: #d0d0d0;
  cursor: pointer;
  transition: background 0.1s ease, color 0.1s ease;
}

.window-controls__btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #ffffff;
}

.window-controls__btn--close:hover {
  background: #e81123;
  color: #ffffff;
}

.window-controls__restore {
  transform: translate(0.5px, -0.5px);
}
</style>

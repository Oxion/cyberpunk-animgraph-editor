import { createApp } from 'vue'
import App from './App.vue'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import './style.css'
import { confirmDiscardUnsavedChanges } from './stores/projectDirty'
import { simApplyLiveBridgeLine, simSetLiveBridgeActive } from './stores/animgraphSim'

document.documentElement.classList.add('dark')

createApp(App).mount('#app')

window.electronAPI?.onTryClose(() => confirmDiscardUnsavedChanges())
window.electronAPI?.onLiveBridgeLine((line) => {
  // console.log('[live-bridge]', line)
  simApplyLiveBridgeLine(line)
})
window.electronAPI?.onLiveBridgeStatus((status) => {
  // Stop only — start is explicit via startLiveBridge() (clean mode before connect).
  if (!status.enabled) simSetLiveBridgeActive(false)
})

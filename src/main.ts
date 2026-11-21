import { createApp } from 'vue'
import App from './App.vue'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import './style.css'
import { confirmDiscardUnsavedChanges } from './stores/projectDirty'
import { startGraphViewGc } from './stores/graphViewGc'

document.documentElement.classList.add('dark')

startGraphViewGc()
createApp(App).mount('#app')

window.electronAPI?.onTryClose(() => confirmDiscardUnsavedChanges())
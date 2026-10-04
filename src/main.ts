import { createApp } from 'vue'
import App from './App.vue'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import './style.css'
import { confirmDiscardUnsavedChanges } from './stores/projectDirty'

document.documentElement.classList.add('dark')

createApp(App).mount('#app')

window.electronAPI?.onTryClose(() => confirmDiscardUnsavedChanges())

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

// Global types for Vue components
declare global {
  interface Window {
    // Add any global window properties here if needed
  }
}

export {}

import { effectScope, reactive, ref, type EffectScope } from 'vue'
import type { AppToolId } from '../appTools/catalog'
import { appToolItems } from '../appTools/catalog'

export type ToolRunner = () => void

const activeScopes = new Map<AppToolId, EffectScope>()
const runners = new Map<AppToolId, ToolRunner>()
const deactivateHooks = new Map<AppToolId, Set<() => void>>()

/** Optional future: tool declares cache slots it may read (unused in v1). */
export type ToolMeta = {
  readsCache?: readonly AppToolId[]
}

export const toolMeta: Partial<Record<AppToolId, ToolMeta>> = {}

/** Tools whose runners / calcs are running. Several may be active at once. */
export const activeToolsRegistry = reactive(
  Object.fromEntries(appToolItems.map((t) => [t.id, false])) as Record<AppToolId, boolean>
)

/** Tool currently shown in the Tools panel. */
export const focusedTool = ref<AppToolId | null>(null)

export function registerToolRunner(id: AppToolId, runner: ToolRunner): void {
  runners.set(id, runner)
}

export function onToolDeactivate(id: AppToolId, hook: () => void): () => void {
  let set = deactivateHooks.get(id)
  if (!set) {
    set = new Set()
    deactivateHooks.set(id, set)
  }
  set.add(hook)
  return () => set!.delete(hook)
}

function runDeactivateHooks(id: AppToolId): void {
  const set = deactivateHooks.get(id)
  if (!set) return
  for (const hook of set) {
    try {
      hook()
    } catch (e) {
      console.error(`tool deactivate hook failed for ${id}`, e)
    }
  }
}

function firstActiveTool(except?: AppToolId): AppToolId | null {
  for (const item of appToolItems) {
    if (item.id === except) continue
    if (activeToolsRegistry[item.id]) return item.id
  }
  return null
}

export const toolManager = {
  isActive(tool: AppToolId): boolean {
    return activeToolsRegistry[tool]
  },

  activateTool(tool: AppToolId): void {
    if (activeScopes.has(tool)) {
      if (focusedTool.value == null) focusedTool.value = tool
      return
    }

    const runner = runners.get(tool)
    if (!runner) {
      console.warn(`No runner registered for tool ${tool}`)
    }

    const scope = effectScope()
    activeScopes.set(tool, scope)
    activeToolsRegistry[tool] = true
    if (focusedTool.value == null) focusedTool.value = tool

    scope.run(() => {
      runner?.()
    })
  },

  deactivateTool(tool: AppToolId): void {
    const scope = activeScopes.get(tool)
    if (!scope) return

    runDeactivateHooks(tool)
    scope.stop()
    activeScopes.delete(tool)
    activeToolsRegistry[tool] = false

    if (focusedTool.value === tool) {
      focusedTool.value = firstActiveTool(tool)
    }
  },

  toggleTool(tool: AppToolId): void {
    if (activeToolsRegistry[tool]) {
      this.deactivateTool(tool)
    } else {
      this.activateTool(tool)
    }
  },

  focusTool(tool: AppToolId): void {
    if (!activeToolsRegistry[tool]) {
      this.activateTool(tool)
      return
    }
    focusedTool.value = tool
  },

  /** Deactivate all tools (e.g. graph unload). */
  deactivateAll(): void {
    for (const id of [...activeScopes.keys()]) {
      this.deactivateTool(id)
    }
    focusedTool.value = null
  },

  getActiveToolIds(): AppToolId[] {
    return appToolItems.map((t) => t.id).filter((id) => activeToolsRegistry[id])
  },
}

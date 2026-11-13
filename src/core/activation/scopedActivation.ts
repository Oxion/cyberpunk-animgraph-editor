import { effectScope, reactive, type EffectScope } from 'vue'

export type ActivationRunner = () => void

const activeScopes = new Map<string, EffectScope>()
const runners = new Map<string, ActivationRunner>()
const deactivateHooks = new Map<string, Set<() => void>>()

/** Ids whose runners are currently live. */
export const activeRegistry = reactive<Record<string, boolean>>({})

export function registerRunner(id: string, runner: ActivationRunner): void {
  runners.set(id, runner)
}

export function onDeactivate(id: string, hook: () => void): () => void {
  let set = deactivateHooks.get(id)
  if (!set) {
    set = new Set()
    deactivateHooks.set(id, set)
  }
  set.add(hook)
  return () => set!.delete(hook)
}

function runDeactivateHooks(id: string): void {
  const set = deactivateHooks.get(id)
  if (!set) return
  for (const hook of set) {
    try {
      hook()
    } catch (e) {
      console.error(`activation deactivate hook failed for ${id}`, e)
    }
  }
}

export function isActive(id: string): boolean {
  return Boolean(activeRegistry[id])
}

export function activate(id: string): void {
  if (activeScopes.has(id)) return

  const runner = runners.get(id)
  if (!runner) {
    console.warn(`No runner registered for activation id ${id}`)
  }

  const scope = effectScope()
  activeScopes.set(id, scope)
  activeRegistry[id] = true

  scope.run(() => {
    runner?.()
  })
}

export function deactivate(id: string): void {
  const scope = activeScopes.get(id)
  if (!scope) return

  runDeactivateHooks(id)
  scope.stop()
  activeScopes.delete(id)
  activeRegistry[id] = false
}

export function toggle(id: string): void {
  if (isActive(id)) deactivate(id)
  else activate(id)
}

export function deactivateAll(): void {
  for (const id of [...activeScopes.keys()]) {
    deactivate(id)
  }
}

export function getActiveIds(): string[] {
  return [...activeScopes.keys()]
}

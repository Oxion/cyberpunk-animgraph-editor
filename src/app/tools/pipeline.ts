import { computed, ref } from 'vue'
import {
  activate,
  activeRegistry,
  deactivate,
  deactivateAll as activationDeactivateAll,
  isActive,
  onDeactivate as activationOnDeactivate,
  registerRunner,
} from '@/core/activation'
import {
  getAppTool,
  getToolHandlers,
  isAppToolId,
  type AppToolId,
  type SessionEndReason,
} from '@/core/tools'
import { resolveAppPredicateContext } from '@/app/when/context'
import { whenTrue } from '@/core/when'

/** Bottom = base tool; top = focused / modal. */
export const toolStack = ref<AppToolId[]>([])

export const focusedTool = computed(() => {
  const stack = toolStack.value
  return stack.length ? stack[stack.length - 1]! : null
})

/** Topmost non-hidden tool for Tools panel (skips modal-only tools like connectionDrag). */
export const panelTool = computed(() => {
  const stack = toolStack.value
  for (let i = stack.length - 1; i >= 0; i--) {
    const id = stack[i]!
    if (!isAppToolId(id)) continue
    if (!getAppTool(id).hidden) return id
  }
  return null
})

const inProgressId = ref<AppToolId | null>(null)

export function isToolInProgress(id: AppToolId): boolean {
  return inProgressId.value === id
}

export function getInProgressToolId(): AppToolId | null {
  return inProgressId.value
}

/** Tool def `when` — same role as commandEnabled for commands. */
export function toolEnabled(id: AppToolId): boolean {
  const tool = getAppTool(id)
  return !tool.when || whenTrue(tool.when, resolveAppPredicateContext())
}

/** Menu: allow toggle-off even when `when` is false. */
export function canToggleTool(id: AppToolId): boolean {
  if (isActive(id) || focusedTool.value === id) return true
  return toolEnabled(id)
}

/**
 * Bring `id` to stack top for a modal session.
 * Any other in-progress tool is ended via lifecycle (`onSessionEnd`); tools never name each other.
 */
export function ensureToolForSession(id: AppToolId): boolean {
  if (!toolEnabled(id)) return false

  const top = focusedTool.value
  const inProgress = inProgressId.value

  if (inProgress && inProgress !== id) {
    endSession(inProgress, 'preempt')
    replaceTopTool(id)
    return true
  }

  if (top === id) {
    if (!isActive(id)) activate(id)
    return true
  }

  pushTool(id)
  return true
}

function wireActivationRunner(id: AppToolId): void {
  registerRunner(id, () => {
    getToolHandlers(id)?.onActivate?.()
  })
  activationOnDeactivate(id, () => {
    getToolHandlers(id)?.onDeactivate?.()
  })
}

/** Call after handlers catalog is registered. */
export function wireAllToolActivationRunners(ids: AppToolId[]): void {
  for (const id of ids) {
    activeRegistry[id] = false
    wireActivationRunner(id)
  }
}

function activateTop(): void {
  const top = focusedTool.value
  if (top) activate(top)
}

function deactivateId(id: AppToolId): void {
  if (inProgressId.value === id) {
    endSession(id, 'preempt')
  }
  if (isActive(id)) deactivate(id)
}

export function startSession(id: AppToolId): boolean {
  if (focusedTool.value !== id || !isActive(id)) {
    console.warn(`startSession(${id}): tool is not the active stack top`)
    return false
  }
  if (inProgressId.value === id) return true
  const started = getToolHandlers(id)?.onSessionStart?.()
  if (started === false) return false
  inProgressId.value = id
  return true
}

export function endSession(id: AppToolId, reason: SessionEndReason): void {
  if (inProgressId.value !== id) return
  inProgressId.value = null
  getToolHandlers(id)?.onSessionEnd?.(reason)
  if (reason !== 'preempt' && toolStack.value.length > 1 && focusedTool.value === id) {
    popTool()
  }
}

export function pushTool(id: AppToolId): void {
  const top = focusedTool.value
  if (top === id) {
    if (!isActive(id)) activate(id)
    return
  }
  if (top) deactivateId(top)
  toolStack.value = [...toolStack.value, id]
  activate(id)
}

/** Replace stack top without affecting entries below (gesture switch). */
export function replaceTopTool(id: AppToolId): void {
  const stack = toolStack.value
  if (stack.length === 0) {
    selectTool(id)
    return
  }
  const top = stack[stack.length - 1]!
  if (top === id) {
    if (!isActive(id)) activate(id)
    return
  }
  deactivateId(top)
  toolStack.value = [...stack.slice(0, -1), id]
  activate(id)
}

export function popTool(): void {
  const stack = toolStack.value
  if (stack.length === 0) return
  const top = stack[stack.length - 1]!
  deactivateId(top)
  toolStack.value = stack.slice(0, -1)
  activateTop()
}

/** Replace stack with a single tool. Gates on tool def `when`. */
export function selectTool(id: AppToolId): boolean {
  if (!toolEnabled(id)) return false

  const prev = [...toolStack.value]
  if (prev.length === 1 && prev[0] === id) {
    if (!isActive(id)) activate(id)
    return true
  }
  for (let i = prev.length - 1; i >= 0; i--) {
    deactivateId(prev[i]!)
  }
  toolStack.value = [id]
  activate(id)
  return true
}

export function toggleTool(id: AppToolId): boolean {
  if (focusedTool.value === id) {
    clearTools()
    return true
  }
  return selectTool(id)
}

export function clearTools(): void {
  const prev = [...toolStack.value]
  for (let i = prev.length - 1; i >= 0; i--) {
    deactivateId(prev[i]!)
  }
  toolStack.value = []
}

export function deactivateAllTools(): void {
  clearTools()
  activationDeactivateAll()
}

export function isFocusedTool(id: AppToolId): boolean {
  return focusedTool.value === id
}

export function isToolActive(id: AppToolId): boolean {
  return isActive(id)
}

export function getStackToolIds(): AppToolId[] {
  return [...toolStack.value]
}

/** Reactive map for menu checks — mirrors activation for live runners. */
export { activeRegistry as activeToolsRegistry }

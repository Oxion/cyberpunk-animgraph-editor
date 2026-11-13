/** Shape registered in AppToolMap. `id` is `string` here; each map value narrows it. */
export interface AppToolDef {
  id: string
  label: string
  /** Named when-predicate. Omit = always. */
  when?: string
  /** Hide from menus / Tools panel chrome. */
  hidden?: boolean
}

/**
 * Id → def map. Empty here; app tools defs augment with concrete tools.
 */
export interface AppToolMap {}

export type AppToolId = keyof AppToolMap & string
export type AppTool = AppToolMap[AppToolId]

export type SessionEndReason = 'confirm' | 'cancel' | 'preempt'

export type AppToolHandlers = {
  /** Runs inside effectScope while the tool is activation-active. */
  onActivate?: () => void
  /** Before scope.stop; session already ended with preempt if needed. */
  onDeactivate?: () => void
  /** Return false to abort — pipeline will not mark the tool in-progress. */
  onSessionStart?: () => boolean | void
  onSessionEnd?: (reason: SessionEndReason) => void
}

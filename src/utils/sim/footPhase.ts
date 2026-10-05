/**
 * FootPhase helpers for transition conditions (event-driven, no Sample required).
 */

import type { ClipEvent } from './clipLibrary'

export type FootPhaseName =
  | 'RightUp'
  | 'RightForward'
  | 'LeftUp'
  | 'LeftForward'
  | 'NotConsidered'
  | string

const FOOT_PHASE_SET = new Set([
  'RightUp',
  'RightForward',
  'LeftUp',
  'LeftForward',
  'NotConsidered',
])

export function normalizeFootPhase(raw: unknown): FootPhaseName | null {
  if (typeof raw === 'string' && raw && raw !== 'None') {
    return FOOT_PHASE_SET.has(raw) || raw.length > 0 ? raw : null
  }
  if (raw && typeof raw === 'object') {
    const o = raw as Record<string, unknown>
    const v = o.$value ?? o.value
    if (typeof v === 'string' && v) return v
  }
  return null
}

export function isFootPhaseEventType(type: string | undefined): boolean {
  if (!type) return false
  return (
    type === 'animAnimEvent_FootPhase' ||
    type.endsWith('AnimEvent_FootPhase') ||
    /FootPhase/i.test(type)
  )
}

/** Read phase from clip event (parsed field or name heuristic). */
export function footPhaseFromClipEvent(ev: ClipEvent): FootPhaseName | null {
  if (ev.footPhase) return ev.footPhase
  if (isFootPhaseEventType(ev.type)) {
    // Some exports put phase in eventName
    if (FOOT_PHASE_SET.has(ev.name)) return ev.name
  }
  return null
}

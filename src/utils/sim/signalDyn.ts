/**
 * AnimNode_Signal — latch + blendIn/Out + cooldown (animNode_Signal.cpp).
 */

import { readBool, readCName, readNumber } from './simDataUtils'
import type { SimInputBoard } from './SimInputBoard'

export type SignalDynState = {
  isSignaled: boolean
  /** Progress through current blend phase (0..blendIn when on, 0..blendOut when off) */
  timeProgress: number
  cooldownTimer: number
}

export type SignalNodeParams = {
  blendIn: number
  blendOut: number
  startEvent: string
  endEvent: string
  defaultState: boolean
  cooldown: number
}

export function readSignalParams(data: Record<string, unknown>): SignalNodeParams {
  return {
    blendIn: Math.max(0, readNumber(data.blendIn, 0)),
    blendOut: Math.max(0, readNumber(data.blendOut, 0)),
    startEvent: readCName(data.startEvent),
    endEvent: readCName(data.endEvent),
    defaultState: readBool(data.defaultState),
    cooldown: readNumber(data.cooldown, 0),
  }
}

/** OnActivated — defaultState + initial progress/cooldown. */
export function createSignalState(params: SignalNodeParams): SignalDynState {
  return {
    isSignaled: params.defaultState,
    timeProgress: params.defaultState ? params.blendIn : params.blendOut,
    cooldownTimer: params.cooldown,
  }
}

/**
 * Engine helper::ContainsExternalOrAnimEvent.
 * Duration events: DurStart matches startEvent, DurEnd matches endEvent; Tick matches both.
 * Sources: external (this frame), last-frame anim events, last-frame anim-end events.
 */
export function signalEventPresent(
  board: SimInputBoard,
  eventName: string,
  isStartEvent: boolean
): boolean {
  if (!eventName || eventName === 'None') return false
  if (board.externalEvents.has(eventName)) return true
  if (board.lastFrameAnimEndEvents.has(eventName)) return true

  const phases = board.getLastFrameAnimEventPhases(eventName)
  if (phases && phases.size > 0) {
    if (phases.has('tick')) return true
    if (isStartEvent) return phases.has('durStart')
    return phases.has('durEnd')
  }
  // Name present without phase metadata (legacy / inject edge) → Tick semantics
  if (board.lastFrameAnimEvents.has(eventName)) return true
  return false
}

/** AnimNode_Signal::OnUpdate */
export function stepSignal(
  state: SignalDynState,
  params: SignalNodeParams,
  board: SimInputBoard,
  dt: number
): void {
  const blendIn = params.blendIn
  const blendOut = params.blendOut
  const useCooldown = params.cooldown > 0

  if (state.isSignaled) {
    state.timeProgress = clamp(state.timeProgress + dt, 0, blendIn)

    if (
      signalEventPresent(board, params.endEvent, false) ||
      (useCooldown && state.cooldownTimer <= 0)
    ) {
      state.isSignaled = false
      state.timeProgress =
        blendIn > 0 ? (1 - state.timeProgress / blendIn) * blendOut : 0
    } else if (useCooldown) {
      state.cooldownTimer -= dt
    }
  } else {
    state.timeProgress = clamp(state.timeProgress + dt, 0, blendOut)

    if (signalEventPresent(board, params.startEvent, true)) {
      state.isSignaled = true
      state.timeProgress =
        blendOut > 0 ? (1 - state.timeProgress / blendOut) * blendIn : 0
      state.cooldownTimer = params.cooldown
    }
  }
}

/** AnimNode_Signal::OnGetValue */
export function signalGetValue(state: SignalDynState, params: SignalNodeParams): number {
  if (state.isSignaled) {
    if (params.blendIn > 0) return clamp(state.timeProgress / params.blendIn, 0, 1)
    return 1
  }
  if (params.blendOut > 0) return clamp(1 - state.timeProgress / params.blendOut, 0, 1)
  return 0
}

function clamp(n: number, lo: number, hi: number): number {
  // When blend duration is 0, Clamp(_, 0, 0) → 0 in engine
  if (hi < lo) return lo
  return Math.min(hi, Math.max(lo, n))
}

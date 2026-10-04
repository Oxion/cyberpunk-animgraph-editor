/**
 * Offline SkAnim clip clock — time advance, timeline CollectEvents, PushAnimEndEvent.
 * No bone Sample.
 */

import type { ClipLibrary, ClipMeta } from './clipLibrary'
import type { SimInputBoard } from './SimInputBoard'
import { SimInputBoard as Board } from './SimInputBoard'

export type ClipClockState = {
  prevTime: number
  currTime: number
  /** Clip name last resolved (for debug) */
  animName: string
  /** True after at least one Update while on the active pose path */
  wasActive: boolean
  /** Prevent double-advance if walked twice in one step */
  stepped: boolean
  /**
   * Optional HUD resolve override (e.g. AnimDatabase without loaded CSV → no-db).
   * Cleared each beginClipClockStep.
   */
  resolveHint?: import('./simTypes').SimClipResolve
}

export type ClipClockNodeFields = {
  animation: string
  isLooped: boolean
  resume: boolean
  collectEvents: boolean
  fireAnimLoopEvent: boolean
  animLoopEventName: string
  clipFront: number
  clipEnd: number
}

export function createClipClockState(): ClipClockState {
  return {
    prevTime: 0,
    currTime: 0,
    animName: '',
    wasActive: false,
    stepped: false,
  }
}

/** Effective playback window (engine SkAnim clipFront / clipEnd). */
export function clipWindow(clip: ClipMeta, clipFront: number, clipEnd: number) {
  const front = Math.max(0, clipFront)
  const endPad = Math.max(0, clipEnd)
  const animEnd = Math.max(clip.duration - endPad, 0)
  const clippedDur = Math.max(animEnd - front, 0)
  return { front, animEnd, clippedDur }
}

/**
 * Fire timeline events with time in (prevTime, currTime], including loop wraps.
 * Mirrors CollectEvents span (simplified, no cookie).
 * Valued events pass `value` when present on ClipEvent.
 */
export function collectClipEventsInRange(
  clip: ClipMeta,
  prevTime: number,
  currTime: number,
  loops: number,
  front: number,
  animEnd: number,
  fire: (name: string, value?: number) => void
): void {
  if (!clip.events.length) return
  const emit = (ev: ClipMeta['events'][number]) => {
    fire(ev.name, ev.value)
  }
  if (loops === 0) {
    for (const ev of clip.events) {
      if (ev.time > prevTime && ev.time <= currTime) emit(ev)
    }
    return
  }
  // Looped: events from prev→animEnd, full loops, then front→curr
  for (const ev of clip.events) {
    if (ev.time > prevTime && ev.time <= animEnd) emit(ev)
  }
  for (let L = 1; L < loops; L++) {
    for (const ev of clip.events) {
      if (ev.time > front && ev.time <= animEnd) emit(ev)
    }
  }
  for (const ev of clip.events) {
    if (ev.time > front && ev.time <= currTime) emit(ev)
  }
}

export type AdvanceClipClockResult = {
  progress: number
  ended: boolean
  missing: boolean
  animName: string
  currTime: number
  duration: number
}

/**
 * One Update tick for an active SkAnim-family node.
 */
export function advanceClipClock(
  state: ClipClockState,
  fields: ClipClockNodeFields,
  dt: number,
  library: ClipLibrary | null,
  board: SimInputBoard,
  isWrapperActive: (name: string) => boolean
): AdvanceClipClockResult {
  if (state.stepped) {
    return {
      progress: 0,
      ended: false,
      missing: false,
      animName: state.animName,
      currTime: state.currTime,
      duration: 0,
    }
  }
  state.stepped = true

  const animName = fields.animation
  state.animName = animName

  if (!animName || animName === 'None') {
    board.fireAnimEnd()
    state.wasActive = true
    return {
      progress: 0,
      ended: true,
      missing: true,
      animName,
      currTime: 0,
      duration: 0,
    }
  }

  const clip =
    library && library.entryCount > 0
      ? library.resolveClip(animName, isWrapperActive)
      : undefined

  if (!clip) {
    // Engine: missing anim still PushAnimEndEvent
    board.fireAnimEnd(
      fields.fireAnimLoopEvent && fields.animLoopEventName
        ? fields.animLoopEventName
        : undefined
    )
    state.wasActive = true
    return {
      progress: 0,
      ended: true,
      missing: true,
      animName,
      currTime: 0,
      duration: 0,
    }
  }

  const { front, animEnd, clippedDur } = clipWindow(
    clip,
    fields.clipFront,
    fields.clipEnd
  )

  if (!state.wasActive) {
    if (!fields.resume) {
      state.currTime = front
      state.prevTime = front
    }
    state.wasActive = true
  }

  state.prevTime = state.currTime
  state.currTime += Math.max(0, dt)

  let loops = 0
  let ended = false

  if (state.currTime >= animEnd) {
    if (fields.isLooped && clippedDur > 1e-8) {
      while (state.currTime > animEnd) {
        state.currTime -= clippedDur
        loops++
      }
      // Keep in window
      if (state.currTime < front) state.currTime = front
      ended = true
    } else {
      state.currTime = animEnd
      ended = true
    }
  } else if (state.currTime < front) {
    if (fields.isLooped && clippedDur > 1e-8) {
      while (state.currTime < front) {
        state.currTime += clippedDur
        loops--
      }
      ended = true
    } else {
      state.currTime = front
      ended = true
    }
  }

  if (ended) {
    board.fireAnimEnd(
      fields.fireAnimLoopEvent && fields.animLoopEventName !== 'None'
        ? fields.animLoopEventName || undefined
        : undefined
    )
  }

  if (fields.collectEvents) {
    collectClipEventsInRange(
      clip,
      state.prevTime,
      state.currTime,
      Math.max(0, loops),
      front,
      animEnd,
      (name, value) => board.fireAnimEvent(name, value)
    )
  }

  const progress =
    clippedDur > 1e-8 ? (state.currTime - front) / clippedDur : ended ? 1 : 0

  return {
    progress: Math.max(0, Math.min(1, progress)),
    ended,
    missing: false,
    animName,
    currTime: state.currTime,
    duration: clip.duration,
  }
}

/** Begin-of-step: clear per-frame stepped flags; deactivate clocks not touched. */
export function beginClipClockStep(clocks: Map<string, ClipClockState>): void {
  for (const s of clocks.values()) {
    s.stepped = false
    s.resolveHint = undefined
  }
}

export function deactivateClipClock(state: ClipClockState): void {
  state.wasActive = false
  state.stepped = false
}

export { Board as ClipClockBoardRef }

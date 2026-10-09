/**
 * Offline SkAnim clip clock — time advance, timeline CollectEvents, PushAnimEndEvent.
 * Pose sampling lives in sampleWalk (glb), not here.
 */

import type { ClipLibrary, ClipMeta } from './clipLibrary'
import type { SimAnimEventPhase, SimInputBoard } from './SimInputBoard'
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
  /** SkOneShotAnim: playing shot until progress hits end (cleared on deactivate). */
  oneShotRunning?: boolean
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

type ClipEventEdge = {
  time: number
  name: string
  value?: number
  phase: SimAnimEventPhase
  footPhase?: string
}

/** Expand clip events into Tick / DurStart / DurEnd edges (eventsContainer RebuildRuntimeStorage). */
function clipEventEdges(clip: ClipMeta): ClipEventEdge[] {
  const out: ClipEventEdge[] = []
  for (const ev of clip.events) {
    if (!ev.name || ev.name === 'None') continue
    const footPhase = ev.footPhase
    if (ev.duration > 0) {
      out.push({ time: ev.time, name: ev.name, value: ev.value, phase: 'durStart', footPhase })
      out.push({
        time: ev.time + ev.duration,
        name: ev.name,
        value: ev.value,
        phase: 'durEnd',
        footPhase,
      })
    } else {
      out.push({ time: ev.time, name: ev.name, value: ev.value, phase: 'tick', footPhase })
    }
  }
  return out
}

/**
 * Fire timeline events with time in (prevTime, currTime], including loop wraps.
 * Mirrors CollectEvents span (simplified, no cookie).
 * Duration events emit DurStart at start and DurEnd at start+duration.
 */
export function collectClipEventsInRange(
  clip: ClipMeta,
  prevTime: number,
  currTime: number,
  loops: number,
  front: number,
  animEnd: number,
  fire: (name: string, value?: number, phase?: SimAnimEventPhase, footPhase?: string) => void
): void {
  const edges = clipEventEdges(clip)
  if (!edges.length) return
  const emit = (edge: ClipEventEdge) => {
    fire(edge.name, edge.value, edge.phase, edge.footPhase)
  }
  const inSpan = (t: number, lo: number, hi: number) => t > lo && t <= hi

  if (loops === 0) {
    for (const edge of edges) {
      if (inSpan(edge.time, prevTime, currTime)) emit(edge)
    }
    return
  }
  // Looped: events from prev→animEnd, full loops, then front→curr
  for (const edge of edges) {
    if (inSpan(edge.time, prevTime, animEnd)) emit(edge)
  }
  for (let L = 1; L < loops; L++) {
    for (const edge of edges) {
      if (inSpan(edge.time, front, animEnd)) emit(edge)
    }
  }
  for (const edge of edges) {
    if (inSpan(edge.time, front, currTime)) emit(edge)
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
 * SkPhaseAnim: map named timeline phase (duration event) → clipFront / clipEnd pads.
 * Engine CacheClipping: clipFront = eventStart, clipEnd = duration - eventEnd.
 */
export function resolvePhaseClipPads(
  clip: Pick<ClipMeta, 'duration' | 'events'>,
  phase: string
): { clipFront: number; clipEnd: number } | null {
  if (!phase || phase === 'None') return null
  const key = phase.toLowerCase()
  const ev =
    clip.events.find((e) => e.name.toLowerCase() === key && e.duration > 0) ??
    clip.events.find((e) => e.name.toLowerCase() === key)
  if (!ev) return null
  const start = Math.max(0, ev.time)
  const end = ev.duration > 0 ? ev.time + ev.duration : clip.duration
  return {
    clipFront: start,
    clipEnd: Math.max(0, clip.duration - end),
  }
}

export type AdvanceClipClockOpts = {
  /** SkDurationAnim / SkPhaseWithDuration: stretch clipped window to this many seconds. */
  targetPlaybackDuration?: number
  /** SkSpeedAnim / SkPhaseWithSpeed: currTime += speed * dt (default 1). */
  speedScale?: number
}

/**
 * One Update tick for an active SkAnim-family node.
 * @param opts.targetPlaybackDuration — stretch clip so clipped window fits N seconds.
 * @param opts.speedScale — multiply dt (engine SkSpeedAnim UpdateRuntimeData).
 */
export function advanceClipClock(
  state: ClipClockState,
  fields: ClipClockNodeFields,
  dt: number,
  library: ClipLibrary | null,
  board: SimInputBoard,
  isWrapperActive: (name: string) => boolean,
  opts?: number | AdvanceClipClockOpts
): AdvanceClipClockResult {
  const options: AdvanceClipClockOpts =
    typeof opts === 'number' ? { targetPlaybackDuration: opts } : opts ?? {}
  const targetPlaybackDuration = options.targetPlaybackDuration
  const speedScale = options.speedScale ?? 1
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

  // SkDurationAnim: timeScale = clippedDur / durationLink (1 if duration ≤ 0)
  // SkSpeedAnim: playDt = speed * dt (may be negative for reverse)
  let playDt = dt * speedScale
  if (targetPlaybackDuration !== undefined) {
    const dur = Math.max(0, targetPlaybackDuration)
    const timeScale = dur > 0 && clippedDur > 0 ? clippedDur / dur : 1
    playDt *= timeScale
  }

  state.prevTime = state.currTime
  state.currTime += playDt

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
      (name, value, phase, footPhase) =>
        board.fireAnimEvent(name, value, phase ?? 'tick', footPhase)
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
  state.oneShotRunning = undefined
}

export { Board as ClipClockBoardRef }

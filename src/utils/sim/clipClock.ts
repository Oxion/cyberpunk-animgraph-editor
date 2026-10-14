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
   * Winning AnimSetup entry id last frame (wrapper / priority resolve).
   * Used for applyInertializationOnAnimSetSwap dirty detect.
   */
  setupEntryId: string
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
    setupEntryId: '',
  }
}

export function ensureClipClock(
  clocks: Map<string, ClipClockState>,
  key: string
): ClipClockState {
  let s = clocks.get(key)
  if (!s) {
    s = createClipClockState()
    clocks.set(key, s)
  }
  return s
}

/** MixerSlot multi-entry keys (status CLIP lists these when stepped). */
export function mixerSlotClockKey(handleId: string, slot: string): string {
  return `${handleId}::${slot}`
}

export type ScrubClipClockOpts = {
  currTime: number
  /** Explicit prev for CollectEvents; default = previous clock.currTime. */
  prevTime?: number
  loops?: number
  collectEvents?: boolean
  /** MuteAnimEvents::FACE_ANIMS */
  skipFaceEvents?: boolean
  clipFront?: number
  clipEnd?: number
  /** SkFrameAnim: fire AnimEnd when scrub lands on animEnd. */
  fireAnimEndName?: string
  fireAnimEndOnce?: boolean
}

export type ScrubClipClockResult = {
  progress: number
  missing: boolean
  currTime: number
  duration: number
  animEnd: number
  front: number
}

/**
 * External-time clock tick (SkFrameAnim scrub / MixerSlot array entries).
 * Marks stepped; CollectEvents over prev→curr; optional AnimEnd at animEnd.
 * Does not += dt.
 */
export function scrubClipClock(
  state: ClipClockState,
  animName: string,
  library: ClipLibrary | null,
  board: SimInputBoard,
  isWrapperActive: (name: string) => boolean,
  opts: ScrubClipClockOpts
): ScrubClipClockResult {
  if (state.stepped) {
    return {
      progress: 0,
      missing: false,
      currTime: state.currTime,
      duration: 0,
      animEnd: 0,
      front: 0,
    }
  }
  state.stepped = true
  state.wasActive = true
  state.animName = animName || ''

  if (!animName || animName === 'None') {
    state.resolveHint = 'empty'
    return {
      progress: 0,
      missing: true,
      currTime: 0,
      duration: 0,
      animEnd: 0,
      front: 0,
    }
  }

  const resolved =
    library && library.entryCount > 0
      ? library.resolveClipEntry(animName, isWrapperActive)
      : undefined
  const clip = resolved?.clip
  state.setupEntryId = resolved?.entryId ?? ''

  if (!library || library.entryCount === 0) {
    state.resolveHint = 'no-lib'
  } else if (!clip) {
    state.resolveHint = library.hasClipAnywhere(animName) ? 'gated' : 'missing'
  }

  const duration = clip && clip.duration > 0 ? clip.duration : 0
  const front = Math.max(0, opts.clipFront ?? 0)
  const endPad = Math.max(0, opts.clipEnd ?? 0)
  const animEnd = duration > 0 ? Math.max(duration - endPad, 0) : 0
  const window = Math.max(0, animEnd - front)

  const prevTime =
    opts.prevTime !== undefined ? opts.prevTime : state.currTime
  const currTime = opts.currTime
  state.prevTime = prevTime
  state.currTime = currTime

  if (clip && opts.fireAnimEndName && opts.fireAnimEndName !== 'None' && animEnd > 0) {
    if (Math.abs(currTime - animEnd) < 1e-5) {
      const timeMoved = Math.abs(prevTime - currTime) > 1e-5
      if (!opts.fireAnimEndOnce || timeMoved) {
        board.fireAnimEnd(opts.fireAnimEndName)
      }
    }
  }

  if (clip && opts.collectEvents !== false && animEnd > 0) {
    collectClipEventsInRange(
      clip,
      prevTime,
      currTime,
      Math.max(0, opts.loops ?? 0),
      front,
      animEnd,
      (name, value, phase, footPhase) =>
        board.fireAnimEvent(name, value, phase ?? 'tick', footPhase),
      { skipFaceEvents: !!opts.skipFaceEvents }
    )
  }

  const progress = window > 1e-8 ? (currTime - front) / window : 0
  return {
    progress: Math.max(0, Math.min(1, progress)),
    missing: !clip,
    currTime,
    duration,
    animEnd,
    front,
  }
}

export type TickClipClockDtOpts = {
  collectEvents?: boolean
  /** MuteAnimEvents::FACE_ANIMS */
  skipFaceEvents?: boolean
  /** Wrap with fmod (MixerSlot idle). Default true. */
  loop?: boolean
  /** SkAnim-style AnimEnd — off for MixerSlot. */
  fireAnimEnd?: boolean
  fireAnimEndName?: string
}

/**
 * += dt clock tick with optional loop wrap (MixerSlot idle).
 * No clipFront/End window. No AnimEnd unless opted in.
 */
export function tickClipClockDt(
  state: ClipClockState,
  animName: string,
  dt: number,
  library: ClipLibrary | null,
  board: SimInputBoard,
  isWrapperActive: (name: string) => boolean,
  opts?: TickClipClockDtOpts
): { loops: number; missing: boolean; duration: number } {
  if (state.stepped) {
    return { loops: 0, missing: false, duration: 0 }
  }
  state.stepped = true
  state.wasActive = true
  state.animName = animName || ''

  if (!animName || animName === 'None') {
    state.resolveHint = 'empty'
    return { loops: 0, missing: true, duration: 0 }
  }

  const resolved =
    library && library.entryCount > 0
      ? library.resolveClipEntry(animName, isWrapperActive)
      : undefined
  const clip = resolved?.clip
  state.setupEntryId = resolved?.entryId ?? ''

  if (!library || library.entryCount === 0) {
    state.resolveHint = 'no-lib'
  } else if (!clip) {
    state.resolveHint = library.hasClipAnywhere(animName) ? 'gated' : 'missing'
  }

  const duration = clip && clip.duration > 0 ? clip.duration : 0
  if (!(duration > 0)) {
    return { loops: 0, missing: !clip, duration: 0 }
  }

  state.prevTime = state.currTime
  const next = state.currTime + dt
  let loops = 0
  const loop = opts?.loop !== false
  if (loop) {
    state.currTime = ((next % duration) + duration) % duration
    loops = Math.floor(next / duration) - Math.floor(state.prevTime / duration)
  } else {
    state.currTime = Math.min(next, duration)
    if (state.currTime >= duration - 1e-8) {
      loops = 0
      if (opts?.fireAnimEnd) {
        board.fireAnimEnd(
          opts.fireAnimEndName && opts.fireAnimEndName !== 'None'
            ? opts.fireAnimEndName
            : undefined
        )
      }
    }
  }

  if (clip && opts?.collectEvents !== false) {
    collectClipEventsInRange(
      clip,
      state.prevTime,
      state.currTime,
      Math.max(0, loops),
      0,
      duration,
      (name, value, phase, footPhase) =>
        board.fireAnimEvent(name, value, phase ?? 'tick', footPhase),
      { skipFaceEvents: !!opts?.skipFaceEvents }
    )
  }

  return { loops: Math.max(0, loops), missing: !clip, duration }
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

/** Engine MuteAnimEvents::FACE_ANIMS → AnimEvent_WorkspotPlayFacialAnim::IsMute. */
export function isFaceAnimEvent(ev: { type?: string; name: string }): boolean {
  const t = (ev.type || '').toLowerCase()
  return (
    t.includes('workspotplayfacial') ||
    t.includes('facialanim') ||
    t.includes('face_anim') ||
    t.includes('playfacial')
  )
}

/** Expand clip events into Tick / DurStart / DurEnd edges (eventsContainer RebuildRuntimeStorage). */
function clipEventEdges(
  clip: ClipMeta,
  skipFaceEvents = false
): ClipEventEdge[] {
  const out: ClipEventEdge[] = []
  for (const ev of clip.events) {
    if (!ev.name || ev.name === 'None') continue
    if (skipFaceEvents && isFaceAnimEvent(ev)) continue
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
  fire: (name: string, value?: number, phase?: SimAnimEventPhase, footPhase?: string) => void,
  opts?: { skipFaceEvents?: boolean }
): void {
  const edges = clipEventEdges(clip, !!opts?.skipFaceEvents)
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
  /**
   * Same anim name re-acquired from a different setup entry while already
   * active (engine AnimWrapper::IsDirty / RefreshWhenDirty).
   */
  animSetSwapped: boolean
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
      animSetSwapped: false,
    }
  }
  state.stepped = true

  const animName = fields.animation
  state.animName = animName

  if (!animName || animName === 'None') {
    board.fireAnimEnd()
    state.wasActive = true
    state.setupEntryId = ''
    return {
      progress: 0,
      ended: true,
      missing: true,
      animName,
      currTime: 0,
      duration: 0,
      animSetSwapped: false,
    }
  }

  const resolved =
    library && library.entryCount > 0
      ? library.resolveClipEntry(animName, isWrapperActive)
      : undefined
  const clip = resolved?.clip
  const entryId = resolved?.entryId ?? ''

  // Engine RefreshWhenDirty: dirty swap while already playing (not activation frame).
  const animSetSwapped =
    state.wasActive &&
    !!state.setupEntryId &&
    !!entryId &&
    state.setupEntryId !== entryId
  state.setupEntryId = entryId

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
      animSetSwapped: false,
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
    animSetSwapped,
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
  state.setupEntryId = ''
  state.oneShotRunning = undefined
}

export { Board as ClipClockBoardRef }

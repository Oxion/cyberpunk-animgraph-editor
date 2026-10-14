/**
 * animAnimNode_MixerSlot — body cinematic mixer (service-event driven).
 * Facial events ignored (FacialMixerSlot). Trajectory optional.
 */

import type { AnimgraphNode } from '../graph/animgraphTypes'
import type { InstanceStore } from '../InstanceStore'
import type { ClipLibrary } from './clipLibrary'
import type { ClipPoseLibrary } from './clipPoseLibrary'
import {
  requestInertialization,
  type InertializationRequestSink,
} from './engineParity'
import type { ExtraFloatTrackCollector } from './extraTrackCollector'
import {
  blendAddMulPose,
  blendAdditiveLocal,
  blendByMask,
  convertAbsoluteToAdditiveFromRig,
  convertToAdditiveFrameLocal,
  createPose,
  interpolatePose,
  renormalizePose,
  zeroPoseAccumulate,
  type Pose,
} from './pose'
import { applyTrajectory, extractTrajectory } from './poseTrajectory'
import { IDENTITY_QS, slerpQs, type Qs } from './poseFk'
import { getRigPartMask } from './rigResource'
import type { SimCompileCtx } from './simCompile'
import { readNumber } from './simDataUtils'
import type { SimAnimEventPhase, SimInputBoard } from './SimInputBoard'
import type {
  MixerSlotAddIdleParams,
  MixerSlotIdleParams,
  MixerSlotParams,
  MixerSlotTrajectoryBlendParams,
  SimServiceEvent,
} from './simServiceEvents'
import {
  ensureClipClock,
  mixerSlotClockKey,
  scrubClipClock,
  tickClipClockDt,
  type ClipClockState,
} from './clipClock'
import {
  copyTimeRelated,
  createMixerSlotDyn,
  emptyMixerSlotEntry,
  entryFromParams,
  hasMixerSlotWork,
  MixerSlotDynDef,
  type MixerSlotAnimEntry,
  type MixerSlotDyn,
} from './mixerSlotDyn'
import type { SampleCtx } from './sampleWalk'

/** Local pool helpers — avoid circular import with sampleWalk. */
function acquirePose(ctx: SampleCtx): Pose {
  const pool = ctx.poseScratch
  if (pool.depth >= pool.stack.length) {
    pool.stack.push(
      createPose(
        pool.boneCount,
        pool.trackCount,
        pool.stackCapacity,
        pool.trackStackCapacity,
        pool.extraTrackCapacity
      )
    )
  }
  return pool.stack[pool.depth++]!
}

function releasePose(ctx: SampleCtx): void {
  if (ctx.poseScratch.depth > 0) ctx.poseScratch.depth--
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v))
}

function readCaps(node: AnimgraphNode): {
  maxNormal: number
  maxAdditive: number
  maxOverride: number
} {
  const d = node.Data ?? {}
  return {
    maxNormal: Math.max(0, readNumber(d.maxNormalAnimEntriesCount, 2)),
    maxAdditive: Math.max(0, readNumber(d.maxAdditiveAnimEntriesCount, 2)),
    maxOverride: Math.max(0, readNumber(d.maxOverrideAnimEntriesCount, 2)),
  }
}

export function ensureMixerSlotDyn(
  store: InstanceStore,
  node: AnimgraphNode
): MixerSlotDyn {
  let s = store.get(MixerSlotDynDef, node.HandleId)
  if (!s) {
    s = store.set(MixerSlotDynDef, node.HandleId, createMixerSlotDyn(readCaps(node)))
  }
  return s
}

function pushCapped(
  list: MixerSlotAnimEntry[],
  entry: MixerSlotAnimEntry,
  cap: number
): void {
  if (!(entry.weight > 0) || !entry.animationName) return
  if (list.length >= cap) return
  list.push(entry)
}

function clearIdle(dyn: MixerSlotDyn): void {
  dyn.idleBlendWeight = 0
  dyn.addIdleWeight = 0
  dyn.firstIdle = emptyMixerSlotEntry()
  dyn.secondIdle = emptyMixerSlotEntry()
  dyn.firstAddIdle = emptyMixerSlotEntry()
  dyn.secondAddIdle = emptyMixerSlotEntry()
}

function clearArrays(dyn: MixerSlotDyn): void {
  dyn.normal.length = 0
  dyn.additive.length = 0
  dyn.override.length = 0
}

function applyIdleParams(dyn: MixerSlotDyn, p: MixerSlotIdleParams): void {
  if (p.isFacial) return
  const prevA = { ...dyn.firstIdle }
  const prevB = { ...dyn.secondIdle }
  clearIdle(dyn)
  dyn.idleBlendWeight = clamp01(p.blendWeight ?? 0)
  const mute = p.muteAnimEvents ?? 'NONE'
  dyn.firstIdle = emptyMixerSlotEntry({
    animationName: p.firstAnimation || '',
    weight: clamp01(p.firstWeight ?? 0),
    muteAnimEvents: mute,
  })
  dyn.secondIdle = emptyMixerSlotEntry({
    animationName: p.secondAnimation || '',
    weight: clamp01(p.secondWeight ?? 0),
    muteAnimEvents: mute,
  })
  dyn.firstAddIdle = emptyMixerSlotEntry({
    animationName: p.firstAddAnimation || '',
    muteAnimEvents: mute,
  })
  dyn.secondAddIdle = emptyMixerSlotEntry({
    animationName: p.secondAddAnimation || '',
    muteAnimEvents: mute,
  })
  if (
    dyn.firstIdle.animationName &&
    dyn.firstIdle.animationName === prevA.animationName
  ) {
    copyTimeRelated(dyn.firstIdle, prevA)
  } else if (
    dyn.firstIdle.animationName &&
    dyn.firstIdle.animationName === prevB.animationName
  ) {
    copyTimeRelated(dyn.firstIdle, prevB)
  }
  if (
    dyn.secondIdle.animationName &&
    dyn.secondIdle.animationName === prevB.animationName
  ) {
    copyTimeRelated(dyn.secondIdle, prevB)
  } else if (
    dyn.secondIdle.animationName &&
    dyn.secondIdle.animationName === prevA.animationName
  ) {
    copyTimeRelated(dyn.secondIdle, prevA)
  }
  dyn.idleDirty = true
}

function applyAddIdle(dyn: MixerSlotDyn, p: MixerSlotAddIdleParams): void {
  if (p.isFacial) return
  dyn.addIdleWeight = p.weight ?? 1
}

function applySlotParams(dyn: MixerSlotDyn, p: MixerSlotParams): void {
  if (p.isFacial) return
  clearArrays(dyn)
  dyn.enableInertiaBlend = !!p.enableInertiaBlend
  for (const raw of p.normalAnimParamsList ?? []) {
    const e = entryFromParams(raw)
    if (e.convertToAdditive) pushCapped(dyn.additive, e, dyn.maxAdditive)
    else pushCapped(dyn.normal, e, dyn.maxNormal)
  }
  for (const raw of p.additiveAnimParamsList ?? []) {
    pushCapped(dyn.additive, entryFromParams(raw), dyn.maxAdditive)
  }
  for (const raw of p.overrideAnimParamsList ?? []) {
    const e = entryFromParams(raw)
    if (e.convertToAdditive) pushCapped(dyn.additive, e, dyn.maxAdditive)
    else pushCapped(dyn.override, e, dyn.maxOverride)
  }
  dyn.arrayDirty = true
}

function applyTrajParams(
  dyn: MixerSlotDyn,
  p: MixerSlotTrajectoryBlendParams
): void {
  dyn.trajectory.enabled = true
  dyn.trajectory.blendIn = p.blendIn ?? 1
  if (p.inTransform) dyn.trajectory.inTransform = { ...p.inTransform }
}

export function applyMixerSlotServiceEvents(
  dyn: MixerSlotDyn,
  events: readonly SimServiceEvent[]
): void {
  for (const e of events) {
    if (e.kind === 'MixerSlotIdleParams') applyIdleParams(dyn, e)
    else if (e.kind === 'MixerSlotAddIdleParams') applyAddIdle(dyn, e)
    else if (e.kind === 'MixerSlotParams') applySlotParams(dyn, e)
    else if (e.kind === 'MixerSlotTrajectoryBlendParams') applyTrajParams(dyn, e)
  }
}

function resolveDuration(
  name: string,
  clipLibrary: ClipLibrary | null,
  clipPose: ClipPoseLibrary | null,
  isWrap: (n: string) => boolean
): number {
  if (!name) return 0
  const winner = clipLibrary?.resolveClipEntry(name, isWrap)
  if (winner?.clip.duration && winner.clip.duration > 0) return winner.clip.duration
  const anim = clipPose?.findAnimation(name, winner?.entryId ?? null)
  return anim?.duration ?? 0
}

function isAnimAdditive(
  name: string,
  clipLibrary: ClipLibrary | null,
  clipPose: ClipPoseLibrary | null,
  isWrap: (n: string) => boolean
): boolean {
  const winner = clipLibrary?.resolveClipEntry(name, isWrap)
  const type =
    winner?.clip.animationType ||
    clipPose?.findAnimation(name, winner?.entryId ?? null)?.animationType ||
    ''
  return typeof type === 'string' && type.toLowerCase().startsWith('additive')
}

function initEntryDuration(
  entry: MixerSlotAnimEntry,
  clipLibrary: ClipLibrary | null,
  clipPose: ClipPoseLibrary | null,
  isWrap: (n: string) => boolean
): void {
  if (!entry.animationName) {
    entry.cachedDuration = 0
    return
  }
  entry.cachedDuration = resolveDuration(
    entry.animationName,
    clipLibrary,
    clipPose,
    isWrap
  )
}

export function compileMixerSlotNode(
  node: AnimgraphNode,
  ctx: SimCompileCtx
): void {
  ensureMixerSlotDyn(ctx.instanceStore, node)
  ctx.addEventListener(
    [
      'MixerSlotParams',
      'MixerSlotIdleParams',
      'MixerSlotAddIdleParams',
      'MixerSlotTrajectoryBlendParams',
    ],
    (events, rt) => {
      const dyn = ensureMixerSlotDyn(rt.instanceStore, node)
      applyMixerSlotServiceEvents(dyn, events)
    }
  )
}

/** Walk/Update ctx fields used by MixerSlot (structural subset of WalkCtx). */
export type MixerSlotUpdateCtx = {
  instanceStore: InstanceStore
  dt: number
  clipLibrary: ClipLibrary | null
  clipPoseLibrary: ClipPoseLibrary | null
  board: SimInputBoard
  clipClocks: Map<string, ClipClockState>
  inertialization: InertializationRequestSink
  extraTracks?: ExtraFloatTrackCollector | null
}

/** Shared Update/Sample weight plan (engine OnUpdate passes 1–4). */
export type MixerSlotWeights = {
  inputLink: number
  idleA: number
  idleB: number
  addIdleA: number
  addIdleB: number
  normalAcc: number
  normalAlpha: number
  hasNormalAnims: boolean
}

export function computeMixerSlotWeights(
  dyn: MixerSlotDyn,
  isEntryValid: (e: MixerSlotAnimEntry) => boolean
): MixerSlotWeights {
  let inputLink = 1
  let idleA = 0
  let idleB = 0
  let addIdleA = 0
  let addIdleB = 0

  let normalAcc = 0
  for (const e of dyn.normal) {
    if (isEntryValid(e)) normalAcc += e.weight
  }

  const hasWork =
    isEntryValid(dyn.firstIdle) ||
    isEntryValid(dyn.secondIdle) ||
    dyn.normal.length > 0 ||
    dyn.override.length > 0 ||
    dyn.additive.length > 0

  if (hasWork) {
    const idleBlend = clamp01(dyn.idleBlendWeight)
    const firstOk = isEntryValid(dyn.firstIdle)
    const secondOk = isEntryValid(dyn.secondIdle)
    const firstAddOk = isEntryValid(dyn.firstAddIdle)
    const secondAddOk = isEntryValid(dyn.secondAddIdle)

    if ((firstOk || secondOk) && normalAcc < 1) {
      const idleWeightA = firstOk ? clamp01(dyn.firstIdle.weight) : 0
      const idleWeightB = secondOk ? clamp01(dyn.secondIdle.weight) : 0
      const idleWeightAdd =
        firstAddOk || secondAddOk ? dyn.addIdleWeight : 0
      const setA = idleWeightA > 0.01
      const setB = idleWeightB > 0.01
      const setAdd = idleWeightAdd > 0.01

      if (setA && setB) {
        inputLink = 0
        idleA = 1 - idleBlend
        idleB = idleBlend
        if (setAdd && firstAddOk) addIdleA = (1 - idleBlend) * idleWeightAdd
        if (setAdd && secondAddOk) addIdleB = idleBlend * idleWeightAdd
      } else if (setA) {
        const weightA = idleBlend * idleWeightA
        inputLink = 1 - weightA
        idleA = weightA
        if (setAdd && firstAddOk) addIdleA = idleBlend * idleWeightAdd
      } else if (setB) {
        const weightB = (1 - idleBlend) * idleWeightB
        inputLink = 1 - weightB
        idleB = weightB
        if (setAdd && secondAddOk) addIdleB = idleBlend * idleWeightAdd
      }
    }

    if (dyn.normal.length > 0 && normalAcc > 0) {
      const alpha = Math.min(normalAcc, 1)
      const complement = 1 - alpha
      inputLink *= complement
      idleA *= complement
      idleB *= complement
      addIdleA *= complement
      addIdleB *= complement
    }
  }

  return {
    inputLink,
    idleA,
    idleB,
    addIdleA,
    addIdleB,
    normalAcc,
    normalAlpha: Math.min(normalAcc, 1),
    hasNormalAnims: dyn.normal.length > 0,
  }
}

export type AnimEventFrameSnap = {
  events: Set<string>
  phases: Map<string, Set<SimAnimEventPhase>>
  values: Map<string, number>
  footPhases: Set<string>
  animEndEvents: Set<string>
  anyAnimEnd: boolean
}

/** Snapshot timeline events for UpdateWithEventsWeight gate. */
export function snapshotAnimEventFrame(board: SimInputBoard): AnimEventFrameSnap {
  const phases = new Map<string, Set<SimAnimEventPhase>>()
  for (const [k, v] of board.animEventPhases) {
    phases.set(k, new Set(v))
  }
  return {
    events: new Set(board.animEvents),
    phases,
    values: new Map(board.animEventValues),
    footPhases: new Set(board.footPhases),
    animEndEvents: new Set(board.animEndEvents),
    anyAnimEnd: board.anyAnimEnd,
  }
}

/** Restore board to snap — drops events fired by inputLink when weight < 1. */
export function restoreAnimEventFrame(
  board: SimInputBoard,
  snap: AnimEventFrameSnap
): void {
  board.animEvents.clear()
  for (const e of snap.events) board.animEvents.add(e)
  board.animEventPhases.clear()
  for (const [k, v] of snap.phases) board.animEventPhases.set(k, new Set(v))
  board.animEventValues.clear()
  for (const [k, v] of snap.values) board.animEventValues.set(k, v)
  board.footPhases.clear()
  for (const e of snap.footPhases) board.footPhases.add(e)
  board.animEndEvents.clear()
  for (const e of snap.animEndEvents) board.animEndEvents.add(e)
  board.anyAnimEnd = snap.anyAnimEnd
}

function entryResolvableLib(
  entry: MixerSlotAnimEntry,
  clipLibrary: ClipLibrary | null,
  isWrap: (n: string) => boolean
): boolean {
  if (!entry.animationName) return false
  return !!clipLibrary?.resolveClipEntry(entry.animationName, isWrap)
}

/** Dirty flags + reclassify normals → additive/override. */
export function prepareMixerSlotState(
  node: AnimgraphNode,
  ctx: Pick<
    MixerSlotUpdateCtx,
    | 'instanceStore'
    | 'clipLibrary'
    | 'clipPoseLibrary'
    | 'board'
    | 'inertialization'
  >
): MixerSlotDyn {
  const dyn = ensureMixerSlotDyn(ctx.instanceStore, node)
  const caps = readCaps(node)
  dyn.maxNormal = caps.maxNormal
  dyn.maxAdditive = caps.maxAdditive
  dyn.maxOverride = caps.maxOverride

  if (dyn.enableInertiaBlend) {
    dyn.enableInertiaBlend = false
    requestInertialization(ctx.inertialization, 0.5)
  }

  const isWrap = (n: string) => ctx.board.isWrapperActive(n)

  if (dyn.idleDirty) {
    dyn.idleDirty = false
    initEntryDuration(dyn.firstIdle, ctx.clipLibrary, ctx.clipPoseLibrary, isWrap)
    initEntryDuration(dyn.secondIdle, ctx.clipLibrary, ctx.clipPoseLibrary, isWrap)
    initEntryDuration(
      dyn.firstAddIdle,
      ctx.clipLibrary,
      ctx.clipPoseLibrary,
      isWrap
    )
    initEntryDuration(
      dyn.secondAddIdle,
      ctx.clipLibrary,
      ctx.clipPoseLibrary,
      isWrap
    )
  }

  if (dyn.arrayDirty) {
    dyn.arrayDirty = false
    for (let i = dyn.normal.length - 1; i >= 0; i--) {
      const e = dyn.normal[i]!
      initEntryDuration(e, ctx.clipLibrary, ctx.clipPoseLibrary, isWrap)
      if (
        isAnimAdditive(e.animationName, ctx.clipLibrary, ctx.clipPoseLibrary, isWrap)
      ) {
        if (dyn.additive.length < dyn.maxAdditive) dyn.additive.push(e)
        dyn.normal.splice(i, 1)
      } else if (e.bodyPartMask) {
        if (dyn.override.length < dyn.maxOverride) dyn.override.push(e)
        dyn.normal.splice(i, 1)
      }
    }
    for (const e of dyn.additive) {
      initEntryDuration(e, ctx.clipLibrary, ctx.clipPoseLibrary, isWrap)
    }
    for (const e of dyn.override) {
      initEntryDuration(e, ctx.clipLibrary, ctx.clipPoseLibrary, isWrap)
    }
  }

  return dyn
}

function syncEntryFromClock(
  entry: MixerSlotAnimEntry,
  clock: ClipClockState,
  loops = 0
): void {
  entry.previousTime = clock.prevTime
  entry.currentTime = clock.currTime
  entry.loops = loops
}

function muteSkipFace(entry: MixerSlotAnimEntry): boolean {
  return entry.muteAnimEvents === 'FACE_ANIMS'
}

/**
 * Idle: always tick when named; `collectEvents` = active && !mute.
 * Array scrub: only when active (weight>0).
 */
function driveEntryClock(
  handleId: string,
  slot: string,
  entry: MixerSlotAnimEntry,
  collectEvents: boolean,
  ctx: MixerSlotUpdateCtx,
  mode: 'idle' | 'scrub'
): void {
  if (!entry.animationName) return
  const key = mixerSlotClockKey(handleId, slot)
  const clock = ensureClipClock(ctx.clipClocks, key)
  const isWrap = (n: string) => ctx.board.isWrapperActive(n)
  const collect = collectEvents && entry.muteAnimEvents !== 'ALL'
  const skipFace = muteSkipFace(entry)

  if (mode === 'idle') {
    if (clock.animName !== entry.animationName) {
      clock.currTime = entry.currentTime
      clock.prevTime = entry.previousTime
      clock.wasActive = false
    }
    const tick = tickClipClockDt(
      clock,
      entry.animationName,
      ctx.dt,
      ctx.clipLibrary,
      ctx.board,
      isWrap,
      {
        collectEvents: collect,
        loop: true,
        fireAnimEnd: false,
        skipFaceEvents: skipFace,
      }
    )
    syncEntryFromClock(entry, clock, tick.loops)
    if (tick.duration > 0) entry.cachedDuration = tick.duration
    return
  }

  if (!collectEvents && !(entry.weight > 0)) return
  scrubClipClock(clock, entry.animationName, ctx.clipLibrary, ctx.board, isWrap, {
    prevTime: entry.previousTime,
    currTime: entry.currentTime,
    loops: entry.loops,
    collectEvents: collect,
    skipFaceEvents: skipFace,
  })
  syncEntryFromClock(entry, clock, entry.loops)
}

function markExtraFromEntry(
  entry: MixerSlotAnimEntry,
  ctx: MixerSlotUpdateCtx
): void {
  const collector = ctx.extraTracks
  if (!collector || !entry.animationName) return
  const isWrap = (n: string) => ctx.board.isWrapperActive(n)
  const winner = ctx.clipLibrary?.resolveClipEntry(entry.animationName, isWrap)
  const tracks = winner?.clip.extraFloatTracks
  if (!tracks?.length) return
  for (const name of tracks) collector.mark(name)
}

/** Update: keyed clip clocks + CollectEvents; request inertia; mark extras. */
export function updateMixerSlot(
  node: AnimgraphNode,
  ctx: MixerSlotUpdateCtx
): boolean {
  const dyn = prepareMixerSlotState(node, ctx)
  const hid = node.HandleId
  const isWrap = (n: string) => ctx.board.isWrapperActive(n)
  const isValid = (e: MixerSlotAnimEntry) =>
    entryResolvableLib(e, ctx.clipLibrary, isWrap)
  const weights = computeMixerSlotWeights(dyn, isValid)

  // Idle CollectEvents gated by weight table + !hasNormalAnims (engine).
  if (dyn.firstIdle.animationName) {
    driveEntryClock(
      hid,
      'idle0',
      dyn.firstIdle,
      weights.idleA > 0 && !weights.hasNormalAnims,
      ctx,
      'idle'
    )
  }
  if (dyn.secondIdle.animationName) {
    driveEntryClock(
      hid,
      'idle1',
      dyn.secondIdle,
      weights.idleB > 0 && !weights.hasNormalAnims,
      ctx,
      'idle'
    )
  }

  // Additive idles share time with base idles (engine SyncAnims).
  dyn.firstAddIdle.previousTime = dyn.firstIdle.previousTime
  dyn.firstAddIdle.currentTime = dyn.firstIdle.currentTime
  dyn.firstAddIdle.loops = dyn.firstIdle.loops
  dyn.secondAddIdle.previousTime = dyn.secondIdle.previousTime
  dyn.secondAddIdle.currentTime = dyn.secondIdle.currentTime
  dyn.secondAddIdle.loops = dyn.secondIdle.loops

  driveEntryClock(
    hid,
    'idleAdd0',
    dyn.firstAddIdle,
    weights.addIdleA > 0 && !!dyn.firstAddIdle.animationName,
    ctx,
    'scrub'
  )
  driveEntryClock(
    hid,
    'idleAdd1',
    dyn.secondAddIdle,
    weights.addIdleB > 0 && !!dyn.secondAddIdle.animationName,
    ctx,
    'scrub'
  )

  for (let i = 0; i < dyn.normal.length; i++) {
    const e = dyn.normal[i]!
    driveEntryClock(hid, `n${i}`, e, e.weight > 0, ctx, 'scrub')
    if (e.weight > 0) markExtraFromEntry(e, ctx)
  }
  for (let i = 0; i < dyn.override.length; i++) {
    driveEntryClock(hid, `o${i}`, dyn.override[i]!, dyn.override[i]!.weight > 0, ctx, 'scrub')
  }
  for (let i = 0; i < dyn.additive.length; i++) {
    driveEntryClock(hid, `a${i}`, dyn.additive[i]!, dyn.additive[i]!.weight > 0, ctx, 'scrub')
  }

  return hasMixerSlotWork(dyn)
}

function sampleEntry(
  entry: MixerSlotAnimEntry,
  ctx: SampleCtx,
  out: Pose
): boolean {
  if (!entry.animationName) return false
  const isWrap = (n: string) => ctx.board.isWrapperActive(n)
  const winner = ctx.clipLibrary?.resolveClipEntry(entry.animationName, isWrap)
  if (!winner) return false
  const ok = ctx.clipPoseLibrary.sample(
    entry.animationName,
    entry.currentTime,
    ctx.rig,
    out,
    winner.entryId
  )
  if (!ok) return false
  if (entry.convertToAdditive) {
    const first = acquirePose(ctx)
    try {
      const ok0 = ctx.clipPoseLibrary.sample(
        entry.animationName,
        0,
        ctx.rig,
        first,
        winner.entryId
      )
      if (ok0) convertToAdditiveFrameLocal(first, out, out)
      else convertAbsoluteToAdditiveFromRig(out, ctx.rig)
    } finally {
      releasePose(ctx)
    }
  }
  return true
}

function entryResolvable(entry: MixerSlotAnimEntry, ctx: SampleCtx): boolean {
  if (!entry.animationName) return false
  const isWrap = (n: string) => ctx.board.isWrapperActive(n)
  return !!ctx.clipLibrary?.resolveClipEntry(entry.animationName, isWrap)
}

/**
 * OnSample: start from input pose in `out`, then idle → normal → override → additive.
 */
export function sampleMixerSlot(
  node: AnimgraphNode,
  store: InstanceStore,
  ctx: SampleCtx,
  out: Pose
): void {
  const dyn = store.get(MixerSlotDynDef, node.HandleId)
  if (!dyn || !hasMixerSlotWork(dyn)) return

  const weights = computeMixerSlotWeights(dyn, (e) => entryResolvable(e, ctx))
  const idleBlend = clamp01(dyn.idleBlendWeight)

  // Pass 1 — idle (weight table)
  if (weights.idleA > 0 || weights.idleB > 0) {
    const setA = weights.idleA > 0.01
    const setB = weights.idleB > 0.01
    const setAddA = weights.addIdleA > 0.01
    const setAddB = weights.addIdleB > 0.01

    if (setA && setB) {
      const aBuf = acquirePose(ctx)
      const bBuf = acquirePose(ctx)
      try {
        sampleEntry(dyn.firstIdle, ctx, aBuf)
        sampleEntry(dyn.secondIdle, ctx, bBuf)
        const blended = acquirePose(ctx)
        try {
          interpolatePose(blended, aBuf, bBuf, idleBlend)
          interpolatePose(out, out, blended, 1)
        } finally {
          releasePose(ctx)
        }
        if (setAddA) {
          sampleEntry(dyn.firstAddIdle, ctx, aBuf)
          blendAdditiveLocal(out, out, aBuf, weights.addIdleA)
        }
        if (setAddB) {
          sampleEntry(dyn.secondAddIdle, ctx, bBuf)
          blendAdditiveLocal(out, out, bBuf, weights.addIdleB)
        }
      } finally {
        releasePose(ctx)
        releasePose(ctx)
      }
    } else if (setA) {
      const aBuf = acquirePose(ctx)
      try {
        sampleEntry(dyn.firstIdle, ctx, aBuf)
        interpolatePose(out, aBuf, out, 1 - weights.idleA)
        if (setAddA) {
          sampleEntry(dyn.firstAddIdle, ctx, aBuf)
          blendAdditiveLocal(out, out, aBuf, weights.addIdleA)
        }
      } finally {
        releasePose(ctx)
      }
    } else if (setB) {
      const bBuf = acquirePose(ctx)
      try {
        sampleEntry(dyn.secondIdle, ctx, bBuf)
        interpolatePose(out, out, bBuf, weights.idleB)
        if (setAddB) {
          sampleEntry(dyn.secondAddIdle, ctx, bBuf)
          blendAdditiveLocal(out, out, bBuf, weights.addIdleB)
        }
      } finally {
        releasePose(ctx)
      }
    }
  }

  // Pass 2 — normals: BlendAddMul → Renormalize → Interpolate
  let trajAccW = 0
  const trajAcc: Qs = { ...IDENTITY_QS }
  trajAcc.qw = 0
  trajAcc.sx = 0
  trajAcc.sy = 0
  trajAcc.sz = 0
  const wantTraj = dyn.trajectory.enabled
  const trajBone = ctx.rig.boneIndexByName.get('trajectory')

  if (dyn.normal.length && weights.normalAcc > 0) {
    const acc = acquirePose(ctx)
    const tmp = acquirePose(ctx)
    try {
      zeroPoseAccumulate(acc)
      let accW = 0
      for (const e of dyn.normal) {
        if (!sampleEntry(e, ctx, tmp)) continue
        if (
          trajBone !== undefined &&
          trajBone >= 0 &&
          (e.extractTrajectoryForBlend || wantTraj)
        ) {
          const entryTraj: Qs = { ...IDENTITY_QS }
          extractTrajectory(tmp, ctx.rig, trajBone, entryTraj)
          const tw = e.weight
          trajAccW += tw
          trajAcc.tx += entryTraj.tx * tw
          trajAcc.ty += entryTraj.ty * tw
          trajAcc.tz += entryTraj.tz * tw
          trajAcc.sx += entryTraj.sx * tw
          trajAcc.sy += entryTraj.sy * tw
          trajAcc.sz += entryTraj.sz * tw
          let qx = entryTraj.qx
          let qy = entryTraj.qy
          let qz = entryTraj.qz
          let qw = entryTraj.qw
          if (
            trajAcc.qx * qx +
              trajAcc.qy * qy +
              trajAcc.qz * qz +
              trajAcc.qw * qw <
            0
          ) {
            qx = -qx
            qy = -qy
            qz = -qz
            qw = -qw
          }
          trajAcc.qx += qx * tw
          trajAcc.qy += qy * tw
          trajAcc.qz += qz * tw
          trajAcc.qw += qw * tw
        }
        blendAddMulPose(acc, tmp, e.weight)
        accW += e.weight
      }
      if (accW > 0) {
        renormalizePose(acc, weights.normalAcc)
        interpolatePose(out, out, acc, weights.normalAlpha)
      }
    } finally {
      releasePose(ctx)
      releasePose(ctx)
    }
  }

  // Pass 3 — override
  if (dyn.override.length) {
    const ov = acquirePose(ctx)
    try {
      for (const e of dyn.override) {
        if (!e.bodyPartMask) continue
        if (!sampleEntry(e, ctx, ov)) continue
        const mask = getRigPartMask(ctx.rig, e.bodyPartMask)
        if (mask) blendByMask(out, out, ov, e.weight, mask)
      }
    } finally {
      releasePose(ctx)
    }
  }

  // Pass 4 — additive
  if (dyn.additive.length) {
    const add = acquirePose(ctx)
    try {
      for (const e of dyn.additive) {
        if (!sampleEntry(e, ctx, add)) continue
        if (
          !e.convertToAdditive &&
          !isAnimAdditive(
            e.animationName,
            ctx.clipLibrary,
            ctx.clipPoseLibrary,
            (n) => ctx.board.isWrapperActive(n)
          )
        ) {
          convertAbsoluteToAdditiveFromRig(add, ctx.rig)
        }
        const mask = e.bodyPartMask
          ? getRigPartMask(ctx.rig, e.bodyPartMask)
          : null
        blendAdditiveLocal(out, out, add, e.weight, mask)
      }
    } finally {
      releasePose(ctx)
    }
  }

  // Trajectory: FastRenormalize + optional Slerp(inTransform) + Apply
  if (trajAccW > 0 && trajBone !== undefined && trajBone >= 0) {
    const inv = 1 / trajAccW
    trajAcc.tx *= inv
    trajAcc.ty *= inv
    trajAcc.tz *= inv
    trajAcc.sx *= inv
    trajAcc.sy *= inv
    trajAcc.sz *= inv
    const qlen =
      Math.hypot(trajAcc.qx, trajAcc.qy, trajAcc.qz, trajAcc.qw) || 1
    trajAcc.qx /= qlen
    trajAcc.qy /= qlen
    trajAcc.qz /= qlen
    trajAcc.qw /= qlen

    let finalTraj = trajAcc
    const b = clamp01(dyn.trajectory.blendIn)
    if (wantTraj && b < 1) {
      const xf = dyn.trajectory.inTransform
      const inQs: Qs = {
        tx: xf.tx,
        ty: xf.ty,
        tz: xf.tz,
        qx: xf.qx,
        qy: xf.qy,
        qz: xf.qz,
        qw: xf.qw,
        sx: xf.sx,
        sy: xf.sy,
        sz: xf.sz,
      }
      finalTraj = slerpQs(inQs, trajAcc, b)
    }
    applyTrajectory(out, ctx.rig, finalTraj)
  }
}

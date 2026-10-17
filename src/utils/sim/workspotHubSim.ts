/**
 * animAnimNode_WorkspotHub — UpdateWorkspot-driven pose player (engine parity subset).
 */

import type { AnimgraphNode } from '../graph/animgraphTypes'
import type { InstanceStore } from '../InstanceStore'
import type { ClipLibrary } from './clipLibrary'
import type { ClipPoseLibrary } from './clipPoseLibrary'
import {
  collectClipEventsInRange,
  ensureClipClock,
  isFaceAnimEvent,
  scrubClipClock,
  type ClipClockState,
} from './clipClock'
import {
  blendAdditiveLocal,
  createPose,
  copyPose,
  identityPose,
  interpolatePose,
  type Pose,
} from './pose'
import type { RigEntry } from './rigResource'
import { isAdditiveAnimationType } from './clipPoseLibrary'
import type { SimCompileCtx } from './simCompile'
import { readBool, readCName, readNumber, resolveHandle } from './simDataUtils'
import type { SimInputBoard } from './SimInputBoard'
import type { SampleCtx } from './sampleWalk'
import {
  createWorkspotHubDyn,
  emptyWorkspotHubFacial,
  isWorkspotHubBlending,
  WorkspotHubDynDef,
  type WorkspotHubDyn,
  type WorkspotHubFacialRecord,
  type WorkspotHubRecord,
} from './workspotHubDyn'
import {
  UPDATE_WORKSPOT_FEATURE as GROUP,
  UpdateWorkspotProp as P,
  type UpdateWorkspotPropName,
} from './workspotHubKeys'

/** AnimFeatureUpdateWorkspot::Flags — RED_FLAG(n) = 1<<(n-1). */
export const UpdateWorkspotFlags = {
  isPaused: 1 << 0,
  isExitAnim: 1 << 1,
  enableMotion: 1 << 2,
  isLooped: 1 << 3,
  isActive: 1 << 4,
  isAnimValid: 1 << 5,
} as const

export type WorkspotEventFilter = 'Default' | 'AlwaysCollect' | 'Solo' | 'Mute'

/** Walk/Update ctx fields used by WorkspotHub (structural subset of WalkCtx). */
export type WorkspotHubUpdateCtx = {
  instanceStore: InstanceStore
  handles: Map<string, AnimgraphNode>
  dt: number
  time: number
  board: SimInputBoard
  clipLibrary: ClipLibrary | null
  clipPoseLibrary: ClipPoseLibrary | null
  clipClocks: Map<string, ClipClockState>
  isFacial: boolean
  /** Nested GraphSlot parent inputLink Update. */
  parentPoseUpdate?: () => void
  /** Update a pose-graph successor (records updateSucc + recurse). */
  followUpdate: (
    parent: AnimgraphNode,
    child: AnimgraphNode | null | undefined
  ) => void
}

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

function writeRefLocal(out: Pose, rig: RigEntry): void {
  const n = out.boneCount
  out.translation.set(rig.refTranslation.subarray(0, n * 3))
  out.rotation.set(rig.refRotation.subarray(0, n * 4))
  out.scale.set(rig.refScale.subarray(0, n * 3))
  out.tracks.fill(0)
}

function sampleIsFacial(ctx: SampleCtx): boolean {
  return !!ctx.lookAtSpace?.isFacial
}

function featNum(board: SimInputBoard, prop: UpdateWorkspotPropName, fallback: number): number {
  const v = board.getFeature(GROUP, prop)
  return v !== undefined && Number.isFinite(v) ? v : fallback
}

function featBool(
  board: SimInputBoard,
  prop: UpdateWorkspotPropName,
  fallback = false
): boolean {
  const v = board.getBoolFeature(GROUP, prop)
  return v === undefined ? fallback : v === true
}

function featStr(board: SimInputBoard, prop: UpdateWorkspotPropName): string {
  const v = board.getStringFeature(GROUP, prop)
  if (!v || v === 'None') return ''
  return v
}

export function compileWorkspotHubNode(
  node: AnimgraphNode,
  ctx: SimCompileCtx
): void {
  ctx.instanceStore.set(WorkspotHubDynDef, node.HandleId, createWorkspotHubDyn())
  // Seed UpdateWorkspot board defaults once (first hub wins).
  const { board } = ctx
  const d = node.Data ?? {}
  if (board.getFeature(GROUP, P.timeScale) === undefined) {
    board.setFeature(GROUP, P.timeScale, 1)
  }
  if (board.getFeature(GROUP, P.facialKeyWeight) === undefined) {
    board.setFeature(GROUP, P.facialKeyWeight, readNumber(d.facialKeyWeight, 0.75))
  }
  if (board.getBoolFeature(GROUP, P.isActive) === undefined) {
    board.setBoolFeature(GROUP, P.isActive, true)
  }
  if (board.getBoolFeature(GROUP, P.globalBlendIn) === undefined) {
    board.setBoolFeature(GROUP, P.globalBlendIn, true)
  }
}

export function ensureWorkspotHubDyn(
  store: InstanceStore,
  node: AnimgraphNode
): WorkspotHubDyn {
  let s = store.get(WorkspotHubDynDef, node.HandleId)
  if (!s) {
    s = store.set(WorkspotHubDynDef, node.HandleId, createWorkspotHubDyn())
  }
  return s
}

function parseEventFilter(raw: unknown): WorkspotEventFilter {
  const s = String(raw ?? 'Default')
  if (s.includes('AlwaysCollect')) return 'AlwaysCollect'
  if (s.includes('Solo')) return 'Solo'
  if (s.includes('Mute')) return 'Mute'
  return 'Default'
}

/** Engine ShouldCollectEvents. */
export function shouldCollectEvents(
  filter: WorkspotEventFilter,
  weight: number
): boolean {
  switch (filter) {
    case 'Mute':
      return false
    case 'Default':
      return weight > 0.5
    case 'AlwaysCollect':
    case 'Solo':
    default:
      return true
  }
}

function readWorkEntryId(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw >>> 0
  if (typeof raw === 'string' && raw.trim() !== '') {
    const n = Number(raw)
    if (Number.isFinite(n)) return n >>> 0
  }
  if (raw && typeof raw === 'object') {
    const o = raw as Record<string, unknown>
    if (typeof o.m_id === 'number') return o.m_id >>> 0
    if (typeof o.id === 'number') return o.id >>> 0
    if (typeof o.$value === 'number') return o.$value >>> 0
  }
  return -1
}

export type WorkspotHubSockets = {
  ids: number[]
  links: unknown[]
}

export function readWorkspotHubSockets(node: AnimgraphNode): WorkspotHubSockets {
  const d = node.Data ?? {}
  const idsRaw = Array.isArray(d.additionalLinkIds) ? d.additionalLinkIds : []
  const linksRaw = Array.isArray(d.additionalLinks) ? d.additionalLinks : []
  const ids = idsRaw.map(readWorkEntryId)
  return { ids, links: linksRaw }
}

function findSocketIndex(sockets: WorkspotHubSockets, entryId: number): number {
  if (entryId < 0) return -1
  for (let i = 0; i < sockets.ids.length; i++) {
    if (sockets.ids[i] === entryId) return i
  }
  return -1
}

function resolveSocketLink(
  handles: Map<string, AnimgraphNode>,
  sockets: WorkspotHubSockets,
  entryId: number
): AnimgraphNode | null {
  const ind = findSocketIndex(sockets, entryId)
  if (ind < 0) return null
  const link = sockets.links[ind]
  return resolveHandle(handles, link)
}

function clipDuration(
  name: string,
  clipLibrary: ClipLibrary | null,
  clipPose: ClipPoseLibrary | null,
  isWrap: (n: string) => boolean
): number {
  if (!name) return 0
  const winner = clipLibrary?.resolveClipEntry(name, isWrap)
  if (winner?.clip.duration && winner.clip.duration > 0) return winner.clip.duration
  return clipPose?.findAnimation(name, winner?.poseSetId ?? null)?.duration ?? 0
}

function clipHasAnim(
  name: string,
  clipLibrary: ClipLibrary | null,
  clipPose: ClipPoseLibrary | null,
  isWrap: (n: string) => boolean
): boolean {
  if (!name) return false
  if (clipLibrary?.resolveClipEntry(name, isWrap)) return true
  return !!clipPose?.findAnimation(name, null)
}

function pushAnimEnd(board: SimInputBoard, animLoopEventName: string): void {
  board.fireAnimEnd(animLoopEventName && animLoopEventName !== 'None' ? animLoopEventName : undefined)
}

function activateRecord(
  record: WorkspotHubRecord,
  board: SimInputBoard,
  time: number,
  sockets: WorkspotHubSockets,
  handles: Map<string, AnimgraphNode>,
  hub: AnimgraphNode,
  followUpdate: WorkspotHubUpdateCtx['followUpdate'],
  clipLibrary: ClipLibrary | null,
  clipPose: ClipPoseLibrary | null,
  isWrap: (n: string) => boolean
): void {
  const recordId = featNum(board, P.recordID, 0) >>> 0
  const entryId = Number.isFinite(recordId) ? recordId : 0
  const link = resolveSocketLink(handles, sockets, entryId)
  if (link && record.entryId !== entryId) {
    followUpdate(hub, link)
  }

  // Engine forceAnimTime: <0 means unset. Board default 0 = start at 0.
  const forceAnimTime = featNum(board, P.forceAnimTime, -1)
  const animBlendTime = featNum(board, P.animBlendTime, 0)
  const timeScale = featNum(board, P.timeScale, 1)
  // Workspot sets start to current global time when an entry begins.
  const boardStart = board.getFeature(GROUP, P.animationStartTime)
  const animationStartTime =
    boardStart !== undefined && boardStart > 0 ? boardStart : time
  const animName = featStr(board, P.animName)

  record.prevTime = 0
  record.currTime = forceAnimTime > 0 ? forceAnimTime : 0
  record.timeScale = timeScale > 0 ? timeScale : 1
  record.loops = 0
  record.entryId = entryId
  record.animationStartTime = animationStartTime
  record.animationLastLocalTime = 0
  record.blendTime = animBlendTime
  record.playbackCounter = Math.trunc(featNum(board, P.updateCounter, 0))
  record.enableMotion = featBool(board, P.enableMotion)
  record.isExitAnim = featBool(board, P.isExitAnim)
  record.isLooped = featBool(board, P.isLooped)
  record.animName = animName
  record.hasClip = !!link || clipHasAnim(animName, clipLibrary, clipPose, isWrap)
}

/** Engine IsEntryMatching — entryId+updateCounter, or looped same animName (no socket). */
function isEntryMatching(
  curr: WorkspotHubRecord,
  board: SimInputBoard,
  sockets: WorkspotHubSockets,
  currAnimName: string
): boolean {
  const isLooped = featBool(board, P.isLooped)
  const featureAnim = featStr(board, P.animName)
  const entryInd = findSocketIndex(sockets, curr.entryId)
  const canContinue =
    isLooped &&
    !!currAnimName &&
    currAnimName === featureAnim &&
    entryInd === -1 &&
    curr.timeScale === featNum(board, P.timeScale, 1)

  const recordId = featNum(board, P.recordID, 0) >>> 0
  const updateCounter = Math.trunc(featNum(board, P.updateCounter, 0))
  const areTheSame =
    curr.entryId === recordId && curr.playbackCounter === updateCounter
  return areTheSame || canContinue
}

function updateRecordTime(
  record: WorkspotHubRecord,
  board: SimInputBoard,
  dt: number,
  time: number,
  sockets: WorkspotHubSockets,
  handles: Map<string, AnimgraphNode>,
  clipLibrary: ClipLibrary | null,
  clipPose: ClipPoseLibrary | null,
  isWrap: (n: string) => boolean,
  isCoverHubHack: boolean,
  animLoopEventName: string
): void {
  const link = resolveSocketLink(handles, sockets, record.entryId)
  if (link) {
    // Links updated in UpdateLinks…
    return
  }
  if (!record.animName) return

  const duration = clipDuration(record.animName, clipLibrary, clipPose, isWrap)

  record.prevTime = record.currTime
  record.loops = 0
  if (featBool(board, P.isPaused)) {
    record.animationStartTime = time - record.currTime / (record.timeScale || 1)
    return
  }

  // Prefer engine global-time formula; fall back to += dt when start unset.
  const scale = record.timeScale > 0 ? record.timeScale : 1
  let animLocalTime = scale * (time - record.animationStartTime)
  if (!(animLocalTime >= 0) || !Number.isFinite(animLocalTime)) {
    animLocalTime = record.currTime + dt * scale
  }
  // If global formula collapses (start≈time every frame), still advance by dt.
  if (Math.abs(animLocalTime - record.currTime) < 1e-8 && dt > 0) {
    animLocalTime = record.currTime + dt * scale
  }
  record.currTime = animLocalTime

  if (duration > 0) {
    // Engine UpdateRecord uses latched RuntimeData.m_isLooped from Activate.
    if (record.isLooped) {
      if (record.currTime > duration) {
        record.currTime = record.currTime % duration
      }
    } else {
      record.currTime = Math.min(record.currTime, duration)
    }

    if (
      animLocalTime - record.animationLastLocalTime > duration ||
      record.currTime < record.prevTime
    ) {
      record.loops++
      if (isCoverHubHack) pushAnimEnd(board, animLoopEventName)
    }
  }
  record.animationLastLocalTime = animLocalTime
  record.hasClip = clipHasAnim(record.animName, clipLibrary, clipPose, isWrap)
}

function collectRecordEvents(
  record: WorkspotHubRecord,
  board: SimInputBoard,
  clipLibrary: ClipLibrary | null,
  isWrap: (n: string) => boolean,
  filter: WorkspotEventFilter,
  eventWeight: number,
  skipFaceEvents: boolean
): void {
  if (!shouldCollectEvents(filter, eventWeight)) return
  if (!record.animName) return
  const winner = clipLibrary?.resolveClipEntry(record.animName, isWrap)
  const clip = winner?.clip
  if (!clip || !(clip.duration > 0)) return
  collectClipEventsInRange(
    clip,
    record.prevTime,
    record.currTime,
    record.loops,
    0,
    clip.duration,
    (name, value, phase, footPhase) =>
      board.fireAnimEvent(name, value, phase ?? 'tick', footPhase),
    { skipFaceEvents }
  )
}

function updateFacialIdle(
  dyn: WorkspotHubDyn,
  node: AnimgraphNode,
  board: SimInputBoard,
  time: number
): void {
  const d = node.Data ?? {}
  let nextIdle = featStr(board, P.facialIdleAnimation)
  let nextKey = featStr(board, P.facialIdleKeyAnimation)
  let nextKeyWeight = featNum(board, P.facialKeyWeight, readNumber(d.facialKeyWeight, 0.75))

  if (!nextIdle) {
    nextIdle = dyn.useFemaleFacial
      ? readCName(d.facialIdleFemaleAnimation)
      : readCName(d.facialIdleMaleAnimation)
    nextKey = dyn.useFemaleFacial
      ? readCName(d.facialIdleKey_FemaleAnimation)
      : readCName(d.facialIdleKey_MaleAnimation)
    if (nextIdle === 'None') nextIdle = ''
    if (nextKey === 'None') nextKey = ''
    nextKeyWeight = readNumber(d.facialKeyWeight, 0.75)
  }

  const curr = dyn.facialCurr
  if (
    curr.idleAnimName !== nextIdle ||
    curr.keyAnimName !== nextKey ||
    curr.keyWeight !== nextKeyWeight
  ) {
    dyn.facialNext = emptyWorkspotHubFacial({
      idleAnimName: nextIdle,
      keyAnimName: nextKey,
      keyWeight: nextKeyWeight,
      blendTime: featNum(board, P.animBlendTime, 0),
      animationStartTime: featNum(board, P.animationStartTime, time),
      currTime: 0,
    })
    dyn.facialBlendWeight = 0
  }
}

function advanceFacialTimes(dyn: WorkspotHubDyn, time: number, clipLibrary: ClipLibrary | null, clipPose: ClipPoseLibrary | null, isWrap: (n: string) => boolean): void {
  const curr = dyn.facialCurr
  const dur = clipDuration(curr.idleAnimName, clipLibrary, clipPose, isWrap)
  if (dur > 0) {
    const total = time - curr.animationStartTime
    curr.currTime = ((total % dur) + dur) % dur
  } else {
    dyn.facialBlendWeight = 1
  }

  if (isWorkspotHubBlending(dyn.facialBlendWeight)) {
    const next = dyn.facialNext
    const ndur = clipDuration(next.idleAnimName, clipLibrary, clipPose, isWrap)
    if (ndur > 0) {
      const total = time - next.animationStartTime
      next.currTime = ((total % ndur) + ndur) % ndur
      const bt = next.blendTime > 0 ? next.blendTime : 1
      dyn.facialBlendWeight = Math.min(1, next.currTime / bt)
    }
  }
  if (dyn.facialBlendWeight >= 1) {
    dyn.facialCurr = { ...dyn.facialNext }
    dyn.facialBlendWeight = -1
  }
}

function facialSyncReceive(
  dyn: WorkspotHubDyn,
  board: SimInputBoard,
  time: number,
  clipLibrary: ClipLibrary | null,
  clipPose: ClipPoseLibrary | null,
  isWrap: (n: string) => boolean
): void {
  // Body hub dispatches WorkspotPlayFacialAnim names into animEvents this frame.
  let syncName = ''
  for (const name of board.animEvents) {
    // Event name is the facial anim when type isn't available on the set.
    if (name && name !== 'None') {
      // Prefer names that look like facial sync; otherwise take last face-like.
      if (
        name.toLowerCase().includes('facial') ||
        name.toLowerCase().includes('face')
      ) {
        syncName = name
      }
    }
  }
  // Also scan clip timeline event types via last-fired values — keep name if any.
  if (!syncName) {
    for (const name of board.animEvents) {
      if (isFaceAnimEvent({ name })) {
        syncName = name
        break
      }
    }
  }

  if (syncName) {
    const dur = clipDuration(syncName, clipLibrary, clipPose, isWrap)
    if (dur > 0) {
      dyn.facialSync.animName = syncName
      dyn.facialSync.animationStartTime = time
      dyn.facialSync.animationEndTime = time + dur
      dyn.facialSync.currentTime = 0
    }
  }

  if (dyn.facialSync.animName) {
    if (time <= dyn.facialSync.animationEndTime) {
      dyn.facialSync.currentTime = time - dyn.facialSync.animationStartTime
    } else {
      dyn.facialSync.animName = ''
      dyn.facialSync.currentTime = 0
    }
  }
}

/**
 * Update: advance clocks, entry match/blend, selective link Update, CollectEvents.
 * @returns whether the hub is active this frame (for markActive).
 */
export function updateWorkspotHub(
  node: AnimgraphNode,
  ctx: WorkspotHubUpdateCtx
): boolean {
  const dyn = ensureWorkspotHubDyn(ctx.instanceStore, node)
  const d = node.Data ?? {}
  const sockets = readWorkspotHubSockets(node)
  const filter = parseEventFilter(d.eventFilterType)
  const isCoverHubHack = readBool(d.isCoverHubHack)
  const animLoopEventName = readCName(d.animLoopEventName)
  const { board, handles } = ctx
  const isWrap = (n: string) => board.isWrapperActive(n)

  if (filter === 'Solo') {
    board.animEvents.clear()
    board.animEventPhases.clear()
    board.animEventValues.clear()
    board.footPhases.clear()
  }

  const updateCounter = Math.trunc(featNum(board, P.updateCounter, 0))
  if (dyn.playbackCounterEventReset !== updateCounter) {
    dyn.curr.loops = 0
    dyn.next.loops = 0
    dyn.playbackCounterEventReset = updateCounter
  }

  const blending = isWorkspotHubBlending(dyn.blendWeight)

  if (dyn.curr.hasClip || dyn.curr.animName) {
    updateRecordTime(
      dyn.curr,
      board,
      ctx.dt,
      ctx.time,
      sockets,
      handles,
      ctx.clipLibrary,
      ctx.clipPoseLibrary,
      isWrap,
      isCoverHubHack,
      animLoopEventName
    )

    const globalBlendDuration = featNum(board, P.globalBlendDuration, 0)
    if (featBool(board, P.globalBlendIn, true)) {
      dyn.globalBlendTime = Math.min(
        dyn.globalBlendTime + ctx.dt,
        globalBlendDuration
      )
    } else {
      const duration = clipDuration(
        dyn.curr.animName,
        ctx.clipLibrary,
        ctx.clipPoseLibrary,
        isWrap
      )
      if (duration > 0 && dyn.curr.currTime > duration - globalBlendDuration) {
        dyn.globalBlendTime = Math.max(dyn.globalBlendTime - ctx.dt, 0)
      }
    }
  }

  if (blending && (dyn.next.hasClip || dyn.next.animName)) {
    updateRecordTime(
      dyn.next,
      board,
      ctx.dt,
      ctx.time,
      sockets,
      handles,
      ctx.clipLibrary,
      ctx.clipPoseLibrary,
      isWrap,
      isCoverHubHack,
      animLoopEventName
    )
  }

  const currAnim = dyn.curr.animName
  if (!currAnim && featStr(board, P.animName)) {
    if (dyn.curr.entryId !== dyn.next.entryId) {
      // deactivate old link — no-op for offline
    }
    activateRecord(
      dyn.next,
      board,
      ctx.time,
      sockets,
      handles,
      node,
      ctx.followUpdate,
      ctx.clipLibrary,
      ctx.clipPoseLibrary,
      isWrap
    )
    dyn.curr = { ...dyn.next }
    dyn.blendWeight = -1
  } else if (!isEntryMatching(dyn.next, board, sockets, currAnim)) {
    const forcedBlend = featNum(board, P.forcedBlendIn, 0)
    if (forcedBlend > 0) {
      dyn.curr.blendTime = forcedBlend
      dyn.next.blendTime = forcedBlend
    }
    if (dyn.blendWeight > 0.5) {
      dyn.curr = { ...dyn.next }
    }
    activateRecord(
      dyn.next,
      board,
      ctx.time,
      sockets,
      handles,
      node,
      ctx.followUpdate,
      ctx.clipLibrary,
      ctx.clipPoseLibrary,
      isWrap
    )
    dyn.blendWeight = 0
  }

  if (isWorkspotHubBlending(dyn.blendWeight)) {
    const blendTime = dyn.curr.blendTime
    if (
      blendTime > 0 &&
      (dyn.curr.hasClip || dyn.curr.animName) &&
      (dyn.next.hasClip || dyn.next.animName)
    ) {
      const timer = ctx.time - dyn.next.animationStartTime
      dyn.blendWeight = clamp01(timer / blendTime)
    } else {
      dyn.blendWeight = 1
    }
  }

  if (dyn.blendWeight >= 1) {
    if (!isCoverHubHack) pushAnimEnd(board, animLoopEventName)
    dyn.curr = { ...dyn.next }
    dyn.next.animationStartTime = 0
    dyn.blendWeight = -1
  }

  if (ctx.isFacial) {
    updateFacialIdle(dyn, node, board, ctx.time)
    facialSyncReceive(
      dyn,
      board,
      ctx.time,
      ctx.clipLibrary,
      ctx.clipPoseLibrary,
      isWrap
    )
    advanceFacialTimes(
      dyn,
      ctx.time,
      ctx.clipLibrary,
      ctx.clipPoseLibrary,
      isWrap
    )
  }

  // UpdateLinksAndCollectEventsAndExtraData
  let parentWeight = 0
  let currWeight = 0
  let nextWeight = 0
  const isBlend = isWorkspotHubBlending(dyn.blendWeight)
  const facialIdleActive = ctx.isFacial && !!dyn.facialCurr.idleAnimName

  if (facialIdleActive) {
    currWeight = 1
    if (isBlend) {
      currWeight = 1 - dyn.blendWeight
      nextWeight = dyn.blendWeight
    }
  } else {
    const globalBlendDuration = featNum(board, P.globalBlendDuration, 0)
    if (
      dyn.globalBlendTime < globalBlendDuration &&
      ctx.parentPoseUpdate &&
      globalBlendDuration > 0
    ) {
      const blendAmount = dyn.globalBlendTime / globalBlendDuration
      parentWeight = 1 - blendAmount
      currWeight = blendAmount
    } else {
      currWeight = 1
    }
    if (isBlend) {
      parentWeight *= 1 - dyn.blendWeight
      currWeight *= 1 - dyn.blendWeight
      nextWeight = dyn.blendWeight
    }
  }

  if (parentWeight > 0 && ctx.parentPoseUpdate) {
    ctx.parentPoseUpdate()
  }

  let alreadyUpdated = -1
  const updateForRecord = (record: WorkspotHubRecord, eventWeight: number) => {
    const ind = findSocketIndex(sockets, record.entryId)
    const link = resolveSocketLink(handles, sockets, record.entryId)
    if (ind >= 0 && link) {
      if (alreadyUpdated !== ind) ctx.followUpdate(node, link)
      alreadyUpdated = ind
      return
    }
    collectRecordEvents(
      record,
      board,
      ctx.clipLibrary,
      isWrap,
      filter,
      eventWeight,
      ctx.isFacial
    )
    if (!record.hasClip && !record.animName && ctx.parentPoseUpdate) {
      ctx.parentPoseUpdate()
    }
  }

  if (currWeight > 0) updateForRecord(dyn.curr, 1)
  if (nextWeight > 0) updateForRecord(dyn.next, 1)

  // Status CLIP + stepped clock (events already collected above → collectEvents false).
  if (dyn.curr.animName && !resolveSocketLink(handles, sockets, dyn.curr.entryId)) {
    const clock = ensureClipClock(ctx.clipClocks, node.HandleId)
    scrubClipClock(
      clock,
      dyn.curr.animName,
      ctx.clipLibrary,
      board,
      isWrap,
      {
        prevTime: dyn.curr.prevTime,
        currTime: dyn.curr.currTime,
        loops: dyn.curr.loops,
        collectEvents: false,
        skipFaceEvents: ctx.isFacial,
      }
    )
    if (
      clock.resolveHint &&
      clock.resolveHint !== 'ok' &&
      ctx.clipPoseLibrary?.findAnimation(dyn.curr.animName, null)
    ) {
      clock.resolveHint = 'ok'
    }
  }

  if (!ctx.isFacial) {
    // Facial sync dispatch uses events already collected into board.animEvents
    facialSyncReceive(
      dyn,
      board,
      ctx.time,
      ctx.clipLibrary,
      ctx.clipPoseLibrary,
      isWrap
    )
  }

  return (
    featBool(board, P.isActive, true) &&
    (!!dyn.curr.animName ||
      !!resolveSocketLink(handles, sockets, dyn.curr.entryId) ||
      !!dyn.facialCurr.idleAnimName)
  )
}

function sampleClipRecord(
  record: WorkspotHubRecord,
  ctx: SampleCtx,
  out: Pose
): boolean {
  if (!record.animName) return false
  const isWrap = (n: string) => ctx.board.isWrapperActive(n)
  const winner = ctx.clipLibrary?.resolveClipEntry(record.animName, isWrap)
  const anim = ctx.clipPoseLibrary.findAnimation(
    record.animName,
    winner?.poseSetId ?? null
  )
  const additive = anim && isAdditiveAnimationType(anim.animationType)
  if (additive) {
    if (sampleIsFacial(ctx)) identityPose(out)
    else writeRefLocal(out, ctx.rig)
    const add = acquirePose(ctx)
    try {
      const okAdd = ctx.clipPoseLibrary.sample(
        record.animName,
        record.currTime,
        ctx.rig,
        add,
        winner?.poseSetId ?? null
      )
      if (!okAdd) return false
      blendAdditiveLocal(out, out, add, 1)
      return true
    } finally {
      releasePose(ctx)
    }
  }
  return ctx.clipPoseLibrary.sample(
    record.animName,
    record.currTime,
    ctx.rig,
    out,
    winner?.poseSetId ?? null
  )
}

function sampleRecord(
  record: WorkspotHubRecord,
  node: AnimgraphNode,
  ctx: SampleCtx,
  out: Pose,
  alreadySampled: { index: number },
  sampleLink: (linked: AnimgraphNode, out: Pose) => boolean
): boolean {
  const sockets = readWorkspotHubSockets(node)
  const ind = findSocketIndex(sockets, record.entryId)
  const link = resolveSocketLink(ctx.handles, sockets, record.entryId)
  if (ind >= 0 && link) {
    if (alreadySampled.index !== ind) {
      sampleLink(link, out)
    }
    alreadySampled.index = ind
    return true
  }
  alreadySampled.index = -1
  if (sampleClipRecord(record, ctx, out)) return true
  if (ctx.parentPoseSample) return ctx.parentPoseSample(out)
  if (sampleIsFacial(ctx)) identityPose(out)
  else writeRefLocal(out, ctx.rig)
  return false
}

function sampleFacialLayer(
  facial: WorkspotHubFacialRecord,
  ctx: SampleCtx,
  out: Pose
): boolean {
  if (!facial.idleAnimName) return false
  const isWrap = (n: string) => ctx.board.isWrapperActive(n)
  const winner = ctx.clipLibrary?.resolveClipEntry(facial.idleAnimName, isWrap)
  const ok = ctx.clipPoseLibrary.sample(
    facial.idleAnimName,
    facial.currTime,
    ctx.rig,
    out,
    winner?.poseSetId ?? null
  )
  if (!ok) return false
  if (facial.keyAnimName && facial.keyWeight > 0) {
    const key = acquirePose(ctx)
    try {
      const kw = ctx.clipLibrary?.resolveClipEntry(facial.keyAnimName, isWrap)
      const okKey = ctx.clipPoseLibrary.sample(
        facial.keyAnimName,
        0,
        ctx.rig,
        key,
        kw?.poseSetId ?? null
      )
      if (okKey) blendAdditiveLocal(out, out, key, facial.keyWeight)
    } finally {
      releasePose(ctx)
    }
  }
  return true
}

function sampleFacialSync(dyn: WorkspotHubDyn, ctx: SampleCtx, out: Pose): void {
  if (!dyn.facialSync.animName) return
  const isWrap = (n: string) => ctx.board.isWrapperActive(n)
  const winner = ctx.clipLibrary?.resolveClipEntry(dyn.facialSync.animName, isWrap)
  const sync = acquirePose(ctx)
  try {
    const ok = ctx.clipPoseLibrary.sample(
      dyn.facialSync.animName,
      dyn.facialSync.currentTime,
      ctx.rig,
      sync,
      winner?.poseSetId ?? null
    )
    if (!ok) return
    const dur =
      winner?.clip.duration ||
      ctx.clipPoseLibrary.findAnimation(
        dyn.facialSync.animName,
        winner?.poseSetId ?? null
      )?.duration ||
      0
    const transition = Math.min(dur * 0.15, 0.3)
    let blendAmount = 1
    const t = dyn.facialSync.currentTime
    if (t < transition && transition > 0) blendAmount = t / transition
    else if (dur > 0 && t > dur - transition)
      blendAmount = (dur - t) / transition
    blendAdditiveLocal(out, out, sync, clamp01(blendAmount))
  } finally {
    releasePose(ctx)
  }
}

/**
 * OnSample: body curr/next (+ global parent blend) or facial idle/key/sync.
 */
export function sampleWorkspotHub(
  node: AnimgraphNode,
  store: InstanceStore,
  ctx: SampleCtx,
  out: Pose,
  sampleLink: (linked: AnimgraphNode, out: Pose) => boolean
): void {
  const dyn = store.get(WorkspotHubDynDef, node.HandleId)
  if (!dyn) {
    writeRefLocal(out, ctx.rig)
    return
  }

  const blending = isWorkspotHubBlending(dyn.blendWeight)
  const facialIdleActive = sampleIsFacial(ctx) && !!dyn.facialCurr.idleAnimName
  const already = { index: -1 }

  if (facialIdleActive) {
    const firstOk = sampleRecord(dyn.curr, node, ctx, out, already, sampleLink)
    let secondOk = false
    if (blending) {
      const scoped = acquirePose(ctx)
      try {
        const prevInd = already.index
        secondOk = sampleRecord(
          dyn.next,
          node,
          ctx,
          scoped,
          already,
          sampleLink
        )
        if (
          prevInd === -1 ||
          already.index === -1 ||
          prevInd !== already.index
        ) {
          if (firstOk || secondOk) {
            if (!firstOk) identityPose(out)
            if (!secondOk) identityPose(scoped)
            interpolatePose(out, out, scoped, dyn.blendWeight)
          }
        }
      } finally {
        releasePose(ctx)
      }
    }

    const facialOut = acquirePose(ctx)
    try {
      sampleFacialLayer(dyn.facialCurr, ctx, facialOut)
      if (isWorkspotHubBlending(dyn.facialBlendWeight)) {
        const nextF = acquirePose(ctx)
        try {
          if (sampleFacialLayer(dyn.facialNext, ctx, nextF)) {
            interpolatePose(
              facialOut,
              facialOut,
              nextF,
              dyn.facialBlendWeight
            )
          }
        } finally {
          releasePose(ctx)
        }
      }
      sampleFacialSync(dyn, ctx, facialOut)

      if (blending) {
        if (firstOk && !secondOk) {
          interpolatePose(out, out, facialOut, dyn.blendWeight)
        } else if (!firstOk && secondOk) {
          interpolatePose(out, out, facialOut, 1 - dyn.blendWeight)
        } else if (!firstOk && !secondOk) {
          copyPose(out, facialOut)
        }
      } else if (!firstOk && !secondOk) {
        copyPose(out, facialOut)
      }
    } finally {
      releasePose(ctx)
    }
    return
  }

  // Body path
  const globalBlendDuration = featNum(ctx.board, P.globalBlendDuration, 0)
  if (
    dyn.globalBlendTime < globalBlendDuration &&
    ctx.parentPoseSample &&
    globalBlendDuration > 0
  ) {
    ctx.parentPoseSample(out)
    const work = acquirePose(ctx)
    try {
      sampleRecord(dyn.curr, node, ctx, work, already, sampleLink)
      const blendAmount = dyn.globalBlendTime / globalBlendDuration
      interpolatePose(out, out, work, blendAmount)
    } finally {
      releasePose(ctx)
    }
  } else {
    sampleRecord(dyn.curr, node, ctx, out, already, sampleLink)
  }

  if (blending && dyn.blendWeight > 0) {
    const scoped = acquirePose(ctx)
    try {
      const prevInd = already.index
      sampleRecord(dyn.next, node, ctx, scoped, already, sampleLink)
      if (
        prevInd === -1 ||
        already.index === -1 ||
        prevInd !== already.index
      ) {
        interpolatePose(out, out, scoped, dyn.blendWeight)
      }
    } finally {
      releasePose(ctx)
    }
  }
}

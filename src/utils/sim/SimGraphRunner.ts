import type { AnimgraphNode } from '../graph/animgraphTypes'
import type { RenderData } from '../graph/diagramTypes'
import { NodeDefinitionRegistry } from '../NodeDefinition'
import { isAnimType } from '../animTypes/registry'
import {
  checkRuntimeCondition,
  checkStaticCondition,
  normalizeCompareFunc,
  type CheckConditionCtx,
} from './checkCondition'
import { SimConditionDyn } from './conditionDyn'
import {
  blend2WeightFromInput,
  blendByMaskDynamicBlendActive,
  blendMultipleFirstInputActive,
  blendMultipleSecondInputActive,
  blendOverrideInputActive,
  buildBlendMultipleSlots,
  selectBlendMultipleInputs,
} from './engineParity'
import {
  evalAnimMathExpression,
  getCompiledMathExpr,
  type MathExprCompileCache,
} from './evalAnimMathExpression'
import {
  evalAnimMathExpressionFloatMixed,
  evalAnimMathExpressionVector,
  vec4Mag3,
  ZERO_VEC4,
  type SimVec4,
} from './evalAnimMathExpressionVector'
import {
  clearBoneOpFrameCache,
  clearMathExprPoseFrameCache,
  createBoneOpFrameCache,
  createMathExprPoseFrameCache,
  IDENTITY_QUAT_STATE,
  mulQuatState,
  nlerpQuatState,
  type BoneOpFrameCache,
  type BoneOpQuatState,
  type BoneOpRotateState,
  type BoneOpTranslateState,
  type MathExprPoseFloatSocketSnap,
  type MathExprPoseFrameCache,
  type MathExprPoseQuatSocketSnap,
  type MathExprPoseVectorSocketSnap,
} from './boneOpDyn'
import {
  createFloatRandomState,
  createFloatSinusState,
  evalCurveFloatData,
  evalCurveVector4Data,
  evalFloatTimeDependentSinus,
  readDampDefaults,
  readDampVectorDefaults,
  readSpringDefaults,
  stepCriticalSpringDamp,
  stepDampFloat,
  stepDampVector,
  stepFloatRandom,
  stepFloatTimeDependentSinus,
  stepSpringDamp,
  wrapAroundRange,
  type FloatDynState,
  type FloatRandomState,
  type FloatSinusState,
} from './floatDyn'
import {
  createSignalState,
  readSignalParams,
  signalGetValue,
  stepSignal,
  type SignalDynState,
} from './signalDyn'
import {
  advanceClipClock,
  beginClipClockStep,
  clipWindow,
  collectClipEventsInRange,
  createClipClockState,
  deactivateClipClock,
  resolvePhaseClipPads,
  type ClipClockState,
} from './clipClock'
import {
  readAnimDatabaseDepotPath,
  resolveAnimDatabaseName,
  resolveAnimDatabaseRow,
  type AnimDatabaseLibrary,
} from './animDatabase'
import {
  handleType,
  isLogicOpOr,
  readBool,
  readCName,
  readCNameList,
  readNumber,
  readTagList,
  readVector4,
  resolveHandle,
} from './simDataUtils'
import type { ClipLibrary } from './clipLibrary'
import { DEFAULT_ANIM_FPS } from './clipLibrary'
import type { ClipPoseLibrary } from './clipPoseLibrary'
import type { RigEntry } from './rigResource'
import type { Qs } from './poseFk'
import {
  IDENTITY_QS,
  lerpQs,
  qsFromPosRotScale,
  slerpQs,
} from './poseFk'
import { readBoneTrs, readStackBoneTrs, copyPose, createPose, DEFAULT_STACK_CAPACITY, type Pose } from './pose'
import {
  allocSampleScratch,
  sampleGraphPose,
  samplePoseFromNode,
  type PoseScratchPool,
} from './sampleWalk'
import {
  createSimSampleLog,
  flushSimSampleLog,
  simSampleLogLine,
} from './simSampleLog'
import { buildStackPairing } from './stackPairing'
import type { SimInputBoard } from './SimInputBoard'
import {
  evaluateSmTransitionBlendAlpha,
  findStateMachineHandles,
  findStateOutput,
  SimStateMachineRuntime,
  updateStateMachine,
} from './SimStateMachine'
import type { SimNodeState, SimSnapshot, SimActiveClip, SimClipResolve, SimSampleWarning } from './simTypes'
import { diffSimNodeStates, emptySimSnapshot } from './simTypes'

/** Classify SkAnim clip lookup for HUD (ok / empty / no-lib / missing / gated). */
function classifyClipResolve(
  animName: string,
  library: ClipLibrary | null,
  isWrapperActive: (name: string) => boolean
): SimClipResolve {
  if (!animName || animName === 'None') return 'empty'
  if (!library || library.entryCount === 0) return 'no-lib'
  if (library.resolveClip(animName, isWrapperActive)) return 'ok'
  if (library.hasClipAnywhere(animName)) return 'gated'
  return 'missing'
}

/**
 * Mark SkAnim clock for HUD; advance only when a ClipLibrary is loaded
 * (avoids AnimEnd spam with empty library).
 */
function runSkAnimClipClock(node: AnimgraphNode, ctx: WalkCtx): number {
  const d = (node.Data ?? {}) as Record<string, unknown>
  const fields = readSkAnimClockFields(d)
  const clock = ensureClipClock(ctx.clipClocks, node.HandleId)
  if (ctx.clipLibrary && ctx.clipLibrary.entryCount > 0) {
    const result = advanceClipClock(
      clock,
      fields,
      ctx.dt,
      ctx.clipLibrary,
      ctx.board,
      (n) => ctx.board.isWrapperActive(n)
    )
    return result.progress
  }
  // No library: still expose active clip name in status (no time / no AnimEnd)
  if (clock.stepped) return 0
  clock.stepped = true
  clock.animName = fields.animation || 'None'
  clock.wasActive = true
  return 0
}

/** SkSpeedAnim / SkSyncedMasterAnim: currTime += Speed * dt. */
function runSkSpeedAnimClipClock(node: AnimgraphNode, ctx: WalkCtx): number {
  const d = (node.Data ?? {}) as Record<string, unknown>
  const speedH = resolveHandle(ctx.handles, resolveSpeedLinkRaw(d))
  if (speedH) updateFromNode(speedH, ctx)
  const speed = speedH ? readFloatSource(speedH, ctx, 1) : 1
  const fields = readSkAnimClockFields(d)
  const clock = ensureClipClock(ctx.clipClocks, node.HandleId)
  if (ctx.clipLibrary && ctx.clipLibrary.entryCount > 0) {
    const result = advanceClipClock(
      clock,
      fields,
      ctx.dt,
      ctx.clipLibrary,
      ctx.board,
      (n) => ctx.board.isWrapperActive(n),
      { speedScale: Number.isFinite(speed) ? speed : 1 }
    )
    return result.progress
  }
  if (clock.stepped) return 0
  clock.stepped = true
  clock.animName = fields.animation || 'None'
  clock.wasActive = true
  return 0
}

/**
 * SkPhaseAnim family: clip window from named phase event; optional duration stretch / speed.
 */
function runSkPhaseAnimClipClock(
  node: AnimgraphNode,
  ctx: WalkCtx,
  mode: 'phase' | 'duration' | 'speed'
): number {
  const d = (node.Data ?? {}) as Record<string, unknown>
  const phase = readCName(d.phase)
  let targetPlaybackDuration: number | undefined
  let speedScale = 1

  if (mode === 'duration') {
    const durationH = resolveHandle(ctx.handles, d.durationLink)
    if (durationH) updateFromNode(durationH, ctx)
    if (durationH) {
      const raw = readFloatSource(durationH, ctx, 0)
      targetPlaybackDuration = Number.isFinite(raw) ? Math.max(0, raw) : 0
    }
  }
  if (mode === 'speed') {
    const speedH = resolveHandle(ctx.handles, resolveSpeedLinkRaw(d))
    if (speedH) updateFromNode(speedH, ctx)
    const speed = speedH ? readFloatSource(speedH, ctx, 1) : 1
    speedScale = Number.isFinite(speed) ? speed : 1
  }

  const fields = readSkAnimClockFields(d)
  const clock = ensureClipClock(ctx.clipClocks, node.HandleId)
  const isWrap = (n: string) => ctx.board.isWrapperActive(n)
  const animName = fields.animation || 'None'
  const clip =
    ctx.clipLibrary && ctx.clipLibrary.entryCount > 0
      ? ctx.clipLibrary.resolveClip(animName, isWrap)
      : undefined
  const phaseFields = applyPhaseToClockFields(fields, clip, phase)

  if (ctx.clipLibrary && ctx.clipLibrary.entryCount > 0) {
    const result = advanceClipClock(
      clock,
      phaseFields,
      ctx.dt,
      ctx.clipLibrary,
      ctx.board,
      isWrap,
      { targetPlaybackDuration, speedScale }
    )
    return result.progress
  }
  if (clock.stepped) return 0
  clock.stepped = true
  clock.animName = animName
  clock.wasActive = true
  return 0
}

/**
 * SkOneShotAnim clock only (caller Updates input pose link).
 * Returns shot blend weight for markActive (0..1).
 */
function runSkOneShotAnimClipClock(node: AnimgraphNode, ctx: WalkCtx): number {
  const d = (node.Data ?? {}) as Record<string, unknown>
  const clock = ensureClipClock(ctx.clipClocks, node.HandleId)
  if (!clock.wasActive) clock.oneShotRunning = true

  let shotWeight = 0
  if (clock.oneShotRunning) {
    const fields = { ...readSkAnimClockFields(d), isLooped: false }
    const blendIn = readNumber(d.blendIn, 0)
    const blendOut = readNumber(d.blendOut, 0)
    if (ctx.clipLibrary && ctx.clipLibrary.entryCount > 0) {
      const result = advanceClipClock(
        clock,
        fields,
        ctx.dt,
        ctx.clipLibrary,
        ctx.board,
        (n) => ctx.board.isWrapperActive(n)
      )
      shotWeight = oneShotBlendWeight(
        result.currTime,
        result.duration,
        blendIn,
        blendOut
      )
      if (result.progress >= 1 - 1e-6 || result.ended) {
        clock.oneShotRunning = false
        if (result.currTime >= result.duration) shotWeight = 0
      }
    } else {
      if (!clock.stepped) {
        clock.stepped = true
        clock.animName = fields.animation || 'None'
        clock.wasActive = true
      }
      clock.oneShotRunning = false
    }
  } else if (!clock.stepped) {
    // Still on path after shot ended — keep HUD name without advancing time
    clock.stepped = true
    clock.animName = readSkAnimClockFields(d).animation || 'None'
  }
  return shotWeight
}

/**
 * SkDurationAnim: stretch playback so clipped clip fits durationLink seconds.
 * No durationLink → same as SkAnim. Registers clip clock for status HUD.
 */
function runSkDurationAnimClipClock(node: AnimgraphNode, ctx: WalkCtx): number {
  const d = (node.Data ?? {}) as Record<string, unknown>
  const durationH = resolveHandle(ctx.handles, d.durationLink)
  if (durationH) updateFromNode(durationH, ctx)

  const fields = readSkAnimClockFields(d)
  const clock = ensureClipClock(ctx.clipClocks, node.HandleId)
  const isWrap = (n: string) => ctx.board.isWrapperActive(n)

  if (!durationH) {
    // Engine: no durationLink → normal SkAnim UpdateRuntimeData
    runSkAnimClipClock(node, ctx)
  } else if (!clock.stepped) {
    const rawDur = readFloatSource(durationH, ctx, 0)
    const targetDuration = Number.isFinite(rawDur) ? Math.max(0, rawDur) : 0
    if (ctx.clipLibrary && ctx.clipLibrary.entryCount > 0) {
      advanceClipClock(
        clock,
        fields,
        ctx.dt,
        ctx.clipLibrary,
        ctx.board,
        isWrap,
        targetDuration
      )
    } else {
      clock.stepped = true
      clock.animName = fields.animation || 'None'
      clock.wasActive = true
      if (!clock.animName || clock.animName === 'None') clock.resolveHint = 'empty'
      else clock.resolveHint = 'no-lib'
    }
  }

  // Progress from clock even if already stepped this frame (tick then Update).
  const animName = clock.animName || fields.animation || 'None'
  const clip =
    ctx.clipLibrary && ctx.clipLibrary.entryCount > 0
      ? ctx.clipLibrary.resolveClip(animName, isWrap)
      : undefined
  if (!clip || clip.duration <= 0) return 0
  const { front, clippedDur } = clipWindow(clip, fields.clipFront, fields.clipEnd)
  if (clippedDur <= 1e-8) return 0
  return Math.max(0, Math.min(1, (clock.currTime - front) / clippedDur))
}

/**
 * SkFrameAnim: scrub by progressLink (0..1) / timeLink (sec) / frameLink (frame).
 * Still registers a clip clock so HUD status lists the anim (unlike time-driven SkAnim).
 */
function runSkFrameAnimClipClock(node: AnimgraphNode, ctx: WalkCtx): number {
  const d = (node.Data ?? {}) as Record<string, unknown>
  for (const key of ['progressLink', 'timeLink', 'frameLink'] as const) {
    const h = resolveHandle(ctx.handles, d[key])
    if (h) updateFromNode(h, ctx)
  }
  const fields = readSkAnimClockFields(d)
  const clock = ensureClipClock(ctx.clipClocks, node.HandleId)
  const animName = fields.animation || 'None'
  clock.stepped = true
  clock.wasActive = true
  clock.animName = animName

  const isWrap = (n: string) => ctx.board.isWrapperActive(n)
  const clip =
    ctx.clipLibrary && ctx.clipLibrary.entryCount > 0
      ? ctx.clipLibrary.resolveClip(animName, isWrap)
      : undefined
  const duration = clip && clip.duration > 0 ? clip.duration : 0
  const front = Math.max(0, fields.clipFront)
  const endPad = Math.max(0, fields.clipEnd)
  const window = Math.max(0, duration - front - endPad)

  let currTime = front
  const progressH = resolveHandle(ctx.handles, d.progressLink)
  const timeH = resolveHandle(ctx.handles, d.timeLink)
  const frameH = resolveHandle(ctx.handles, d.frameLink)
  // Engine: progress / time / frame are alternate drivers (progress preferred when linked).
  if (progressH) {
    const p = readFloatSource(progressH, ctx, 0)
    const u = Number.isFinite(p) ? Math.min(1, Math.max(0, p)) : 0
    currTime = front + u * window
  } else if (timeH) {
    const t = readFloatSource(timeH, ctx, 0)
    currTime = Number.isFinite(t) ? Math.max(0, t) : front
  } else if (frameH) {
    const frame = readFloatSource(frameH, ctx, 0)
    const fps =
      clip?.numFrames && duration > 0 ? clip.numFrames / duration : DEFAULT_ANIM_FPS
    currTime = Number.isFinite(frame) ? frame / Math.max(1e-6, fps) : front
  }

  const prevTime = clock.currTime
  clock.prevTime = prevTime
  clock.currTime = currTime
  if (!ctx.clipLibrary || ctx.clipLibrary.entryCount === 0) {
    clock.resolveHint = animName && animName !== 'None' ? 'no-lib' : 'empty'
  } else if (!clip) {
    clock.resolveHint = ctx.clipLibrary.hasClipAnywhere(animName) ? 'gated' : 'missing'
  }

  // Engine SkFrameAnim::OnUpdate — fireAnimLoopEvent at animEnd; once unless time moved.
  if (clip && fields.fireAnimLoopEvent && fields.animLoopEventName && fields.animLoopEventName !== 'None') {
    const animEnd = Math.max(duration - endPad, 0)
    if (Math.abs(currTime - animEnd) < 1e-5) {
      const fireOnce = readBool(d.fireAnimEndOnceOnAnimEnd)
      const timeMoved = Math.abs(prevTime - currTime) > 1e-5
      if (!fireOnce || timeMoved) {
        ctx.board.fireAnimEnd(fields.animLoopEventName)
      }
    }
  }

  // Timeline events across scrub (prev→curr).
  if (clip && fields.collectEvents) {
    const animEnd = Math.max(duration - endPad, 0)
    collectClipEventsInRange(
      clip,
      prevTime,
      currTime,
      0,
      front,
      animEnd,
      (name, value, phase, footPhase) =>
        ctx.board.fireAnimEvent(name, value, phase ?? 'tick', footPhase)
    )
  }

  const progress = window > 1e-8 ? (currTime - front) / window : 0
  return Math.max(0, Math.min(1, progress))
}

/** Resolve AnimDatabase CSV row → animation CName, then run clip clock. */
function runAnimDatabaseClipClock(node: AnimgraphNode, ctx: WalkCtx) {
  const d = (node.Data ?? {}) as Record<string, unknown>
  const depot = readAnimDatabaseDepotPath(d)
  const db = ctx.animDbLibrary?.findByDepotPath(depot)
  const clock = ensureClipClock(ctx.clipClocks, node.HandleId)

  if (!db) {
    if (clock.stepped) return
    clock.stepped = true
    clock.animName = depot || 'None'
    clock.wasActive = true
    clock.resolveHint = 'no-db'
    return
  }

  const inputLinks = Array.isArray(d.inputLinks) ? d.inputLinks : []
  const inputs: number[] = []
  for (const link of inputLinks) {
    const h = resolveHandle(ctx.handles, link)
    if (h) updateFromNode(h, ctx)
    inputs.push(Math.round(h ? readFloatSource(h, ctx, 0) : 0))
  }
  const row = resolveAnimDatabaseRow(db, inputs)
  let animName = row?.animationName || resolveAnimDatabaseName(db, inputs) || 'None'

  // If primary clip missing/gated but row has fallback, prefer fallback when resolvable.
  const isWrap = (n: string) => ctx.board.isWrapperActive(n)
  if (
    ctx.clipLibrary &&
    ctx.clipLibrary.entryCount > 0 &&
    animName &&
    animName !== 'None' &&
    row?.fallbackAnimationName
  ) {
    const primary = ctx.clipLibrary.resolveClip(animName, isWrap)
    if (!primary) {
      const fb = row.fallbackAnimationName
      if (fb && fb !== 'None' && ctx.clipLibrary.resolveClip(fb, isWrap)) {
        animName = fb
      }
    }
  }

  const fields = {
    ...readSkAnimClockFields(d),
    animation: animName,
  }
  // Reset playback when database picks a different clip (sim: re-query each frame)
  if (clock.wasActive && clock.animName && clock.animName !== animName) {
    clock.wasActive = false
  }
  if (ctx.clipLibrary && ctx.clipLibrary.entryCount > 0) {
    advanceClipClock(
      clock,
      fields,
      ctx.dt,
      ctx.clipLibrary,
      ctx.board,
      isWrap
    )
    if (animName === 'None') clock.resolveHint = 'missing'
    return
  }
  if (clock.stepped) return
  clock.stepped = true
  clock.animName = animName
  clock.wasActive = true
  if (animName === 'None') clock.resolveHint = 'missing'
}

function markActive(
  nodes: Record<string, SimNodeState>,
  id: string,
  patch: Partial<SimNodeState> = {}
): void {
  const prev = nodes[id] ?? { active: false }
  nodes[id] = { ...prev, active: true, ...patch }
}

function markInactive(
  nodes: Record<string, SimNodeState>,
  id: string,
  force = false
): void {
  if (!force && nodes[id]?.active) return
  nodes[id] = { ...(nodes[id] ?? {}), active: false }
}

/** Shared float-eval context (board + stateful damp/spring/latch/signal). */
type FloatEvalCtx = {
  board: SimInputBoard
  handles: Map<string, AnimgraphNode>
  dt: number
  floatDyn: Map<string, FloatDynState>
  floatUpdated: Set<string>
  /** VectorLatch / DampVector latched or damped Vector4. */
  vectorDyn: Map<string, SimVec4>
  /** TransformLatch latched Qs. */
  transformDyn: Map<string, Qs>
  randomDyn: Map<string, FloatRandomState>
  sinusDyn: Map<string, FloatSinusState>
  signalDyn: Map<string, SignalDynState>
  signalUpdated: Set<string>
  clipLibrary: ClipLibrary | null
  /** Per-runner math expression compile cache (idents + scalar/mixed). */
  mathExprCache: MathExprCompileCache
}

type WalkCtx = FloatEvalCtx & {
  nodes: Record<string, SimNodeState>
  /** Previous frame overlay — resetOnActivation for bone ops. */
  prevNodes: Record<string, SimNodeState> | null
  visited: Set<string>
  runtimes: Map<string, SimStateMachineRuntime>
  condCtx: CheckConditionCtx
  clipClocks: Map<string, ClipClockState>
  animDbLibrary: AnimDatabaseLibrary | null
  /** Cached StaticSwitch Init results (handleId → useTrue). */
  staticSwitchResults: Map<string, boolean>
  /** Frame meta for nested GraphSlot runners. */
  time: number
  playing: boolean
  speed: number
  /**
   * Project GraphSlot attach: resolve slot name → child diagram runner.
   * Nested updates share the board; child owns its own dyn/SM state.
   */
  slotHost?: SimGraphSlotHost
  /** GraphSlotInput → Update parent slot inputLink (engine m_parentGraphLink). */
  parentPoseUpdate?: () => void
  /** GraphSlotInput → Sample parent slot inputLink pose. */
  parentPoseSample?: (out: Pose) => boolean
  /**
   * Build parentPoseSample for a nested GraphSlot step (samples inputLink
   * with this runner's Sample buffers / libraries).
   */
  makeParentPoseSample?: (inputLink: AnimgraphNode) => (out: Pose) => boolean
  /** AdditionalFloatTrack local time (engine i_time), shared with Sample. */
  additionalFloatTrackTimes: Map<string, number>
  /**
   * Update-traversal successors this frame: parentHandleId → childHandleIds
   * in visit order (role order for blends: base/first then blend/second).
   * Value/weight links are not recorded — only followUpdate targets.
   */
  updateSucc: Map<string, string[]>
  boneOpCache: BoneOpFrameCache
  boneRotateDyn: Map<string, BoneOpRotateState>
  boneQuatDyn: Map<string, BoneOpQuatState>
  boneTranslateDyn: Map<string, BoneOpTranslateState>
  mathExprPoseCache: MathExprPoseFrameCache
}

/** Project GraphSlot attach: resolve slot name → nested diagram Update. */
export type SimGraphSlotHost = {
  /**
   * Run nested diagram Update (shared board, no endFrame).
   * Returns null when slot name missing, unknown, or cycle.
   */
  stepNested(
    slotName: string,
    parentPoseUpdate?: () => void,
    parentPoseSample?: (out: Pose) => boolean
  ): { diagramId: string; snap: SimSnapshot } | null
  /** Latest nested Sample pose for slot (after stepNested this frame). */
  getNestedPose(slotName: string): Pose | null
}

export type SimStepOptions = {
  /** When false, caller owns board.endFrame (multi-runner / nested publish). Default true. */
  endBoardFrame?: boolean
  slotHost?: SimGraphSlotHost
  parentPoseUpdate?: () => void
  parentPoseSample?: (out: Pose) => boolean
}

function isGraphSlotType(t: string | null | undefined): boolean {
  return (
    t === 'animAnimNode_GraphSlot' ||
    t === 'animAnimNode_GraphSlot_Test' ||
    t === 'animAnimNode_GraphSlotConditions'
  )
}

/** Record Update walk edge (deduped). Not for weight/value links. */
function recordUpdateSucc(ctx: WalkCtx, parentId: string, childId: string): void {
  let arr = ctx.updateSucc.get(parentId)
  if (!arr) {
    arr = []
    ctx.updateSucc.set(parentId, arr)
  }
  if (arr.includes(childId)) return
  arr.push(childId)
}

/** Follow a graph successor during Update and record the edge for Sample. */
function followUpdate(
  parent: AnimgraphNode,
  child: AnimgraphNode | null | undefined,
  ctx: WalkCtx
): void {
  if (!child) return
  recordUpdateSucc(ctx, parent.HandleId, child.HandleId)
  updateFromNode(child, ctx)
}

/** Successors worth recording (skip pure value sources). */
function isUpdateSuccTarget(node: AnimgraphNode): boolean {
  const t = handleType(node)
  if (!t.startsWith('animAnimNode_')) return false
  if (
    isFloatValueNodeType(t) ||
    isVectorValueNodeType(t) ||
    isQuaternionValueNodeType(t)
  ) {
    return false
  }
  return true
}

/** Plain SkAnim clock path (excludes frame/duration/speed/phase/oneshot + AnimDatabase). */
function isClipClockSkAnimType(t: string | null | undefined): boolean {
  if (!t || !isAnimType(t, 'animAnimNode_SkAnim')) return false
  if (isSkFrameAnimType(t)) return false
  if (t === 'animAnimNode_SkDurationAnim') return false
  if (t === 'animAnimNode_AnimDatabase') return false
  if (isSkSpeedAnimType(t)) return false
  if (isSkPhaseAnimType(t)) return false
  if (isSkOneShotAnimType(t)) return false
  return true
}

function isSkFrameAnimType(t: string | null | undefined): boolean {
  return t === 'animAnimNode_SkFrameAnim' || t === 'animAnimNode_SkFrameAnimByTrack'
}

function isSkDurationAnimType(t: string | null | undefined): boolean {
  return t === 'animAnimNode_SkDurationAnim'
}

function isSkSpeedAnimType(t: string | null | undefined): boolean {
  return !!t && isAnimType(t, 'animAnimNode_SkSpeedAnim')
}

function isSkPhaseAnimType(t: string | null | undefined): boolean {
  return !!t && isAnimType(t, 'animAnimNode_SkPhaseAnim')
}

function isSkPhaseWithDurationType(t: string | null | undefined): boolean {
  return !!t && isAnimType(t, 'animAnimNode_SkPhaseWithDurationAnim')
}

function isSkPhaseWithSpeedType(t: string | null | undefined): boolean {
  return !!t && isAnimType(t, 'animAnimNode_SkPhaseWithSpeedAnim')
}

function isSkOneShotAnimType(t: string | null | undefined): boolean {
  return t === 'animAnimNode_SkOneShotAnim'
}

function isAnimDatabaseType(t: string | null | undefined): boolean {
  return t === 'animAnimNode_AnimDatabase'
}

/** Resolve Speed floatLink (SkSpeedAnim RTTI name "Speed", or speedLink). */
function resolveSpeedLinkRaw(d: Record<string, unknown>): unknown {
  return d.Speed ?? d.speedLink ?? d.speed
}

function applyPhaseToClockFields(
  fields: ReturnType<typeof readSkAnimClockFields>,
  clip: import('./clipLibrary').ClipMeta | undefined,
  phase: string
): ReturnType<typeof readSkAnimClockFields> {
  if (!clip || !phase || phase === 'None') return fields
  const pads = resolvePhaseClipPads(clip, phase)
  if (!pads) return fields
  return { ...fields, clipFront: pads.clipFront, clipEnd: pads.clipEnd }
}

function oneShotBlendWeight(
  currTime: number,
  duration: number,
  blendIn: number,
  blendOut: number
): number {
  if (!(duration > 0)) return 0
  if (currTime > duration) return 0
  if (blendIn > 0 && currTime < blendIn) return currTime / blendIn
  if (blendOut > 0 && duration - currTime < blendOut) return (duration - currTime) / blendOut
  return 1
}

function readSkAnimClockFields(data: Record<string, unknown>) {
  return {
    animation: readCName(data.animation),
    isLooped: data.isLooped === undefined ? true : readBool(data.isLooped),
    resume: readBool(data.resume),
    collectEvents: data.collectEvents === undefined ? true : readBool(data.collectEvents),
    fireAnimLoopEvent: readBool(data.fireAnimLoopEvent),
    animLoopEventName: readCName(data.animLoopEventName),
    clipFront: readNumber(data.clipFront, 0),
    clipEnd: readNumber(data.clipEnd, 0),
  }
}

function ensureClipClock(
  clocks: Map<string, ClipClockState>,
  handleId: string
): ClipClockState {
  let s = clocks.get(handleId)
  if (!s) {
    s = createClipClockState()
    clocks.set(handleId, s)
  }
  return s
}

/**
 * Advance SkAnim clocks along a pose path without touching overlay visited.
 * Used before SM CheckTransitions so AnimEnd is visible same frame (engine order).
 */
function tickClipClocksAlongPose(
  node: AnimgraphNode | null,
  ctx: WalkCtx,
  clockVisited: Set<string>
): void {
  if (!node) return
  if (clockVisited.has(node.HandleId)) return
  clockVisited.add(node.HandleId)

  const t = handleType(node)
  const d = (node.Data ?? {}) as Record<string, unknown>
  const { handles } = ctx

  if (t === 'animAnimNode_Output') {
    tickClipClocksAlongPose(
      resolveHandle(handles, d.inputNode ?? d.input ?? d.node),
      ctx,
      clockVisited
    )
    return
  }

  if (t === 'animAnimNode_State' || t === 'animAnimNode_StateFrozen') {
    tickClipClocksAlongPose(findStateOutput(node, handles), ctx, clockVisited)
    return
  }

  if (isAnimDatabaseType(t)) {
    runAnimDatabaseClipClock(node, ctx)
    return
  }

  if (isSkOneShotAnimType(t)) {
    runSkOneShotAnimClipClock(node, ctx)
    return
  }

  if (isSkPhaseWithDurationType(t)) {
    runSkPhaseAnimClipClock(node, ctx, 'duration')
    return
  }

  if (isSkPhaseWithSpeedType(t)) {
    runSkPhaseAnimClipClock(node, ctx, 'speed')
    return
  }

  if (isSkPhaseAnimType(t)) {
    runSkPhaseAnimClipClock(node, ctx, 'phase')
    return
  }

  if (isSkSpeedAnimType(t)) {
    runSkSpeedAnimClipClock(node, ctx)
    return
  }

  if (isClipClockSkAnimType(t)) {
    runSkAnimClipClock(node, ctx)
    return
  }

  if (isSkDurationAnimType(t)) {
    runSkDurationAnimClipClock(node, ctx)
    return
  }

  if (isSkFrameAnimType(t)) {
    runSkFrameAnimClipClock(node, ctx)
    return
  }

  // Follow same pose branching heuristics as updateFromNode for common mixers
  if (t === 'animAnimNode_Blend2') {
    const weightNode = resolveHandle(handles, d.weightNode)
    let weight = 0
    if (weightNode) {
      const raw = readFloatSource(weightNode, ctx, NaN)
      if (Number.isFinite(raw)) {
        weight = blend2WeightFromInput(
          raw,
          readNumber(d.minInputValue, 0),
          readNumber(d.maxInputValue, 1)
        )
      }
    }
    const first = resolveHandle(handles, d.firstInputNode)
    const second = resolveHandle(handles, d.secondInputNode)
    if (first && weight < 1) tickClipClocksAlongPose(first, ctx, clockVisited)
    if (second && weight > 0) tickClipClocksAlongPose(second, ctx, clockVisited)
    return
  }

  if (t === 'animAnimNode_Switch') {
    const weightNode = resolveHandle(handles, d.weightNode)
    let weight = 0
    if (weightNode) weight = readFloatSource(weightNode, ctx, 0)
    const inputs = Array.isArray(d.inputNodes) ? d.inputNodes : []
    const numInputs = readNumber(d.numInputs, inputs.length)
    const index = switchIndexFromWeight(weight, Math.max(numInputs, inputs.length))
    const h = resolveHandle(handles, inputs[index])
    tickClipClocksAlongPose(h, ctx, clockVisited)
    return
  }

  if (t === 'animAnimNode_BlendMultiple') {
    const { slots, select } = resolveBlendMultipleSelection(
      d as Record<string, unknown>,
      ctx
    )
    if (
      select.firstIndex >= 0 &&
      blendMultipleFirstInputActive(select.alpha)
    ) {
      tickClipClocksAlongPose(
        resolveHandle(handles, slots.refs[select.firstIndex]),
        ctx,
        clockVisited
      )
    }
    if (
      select.secondIndex >= 0 &&
      blendMultipleSecondInputActive(select.alpha)
    ) {
      tickClipClocksAlongPose(
        resolveHandle(handles, slots.refs[select.secondIndex]),
        ctx,
        clockVisited
      )
    }
    return
  }

  if (t === 'animAnimNode_StaticSwitch' || t === 'animAnimNode_RuntimeSwitch') {
    const cond = resolveHandle(handles, d.condition)
    let useTrue: boolean
    if (t === 'animAnimNode_StaticSwitch') {
      useTrue =
        ctx.staticSwitchResults?.get(node.HandleId) ??
        checkStaticCondition(cond, ctx.board, {
          clipLibrary: ctx.clipLibrary,
          isWrapperActive: (n) => ctx.board.isWrapperActive(n),
        })
    } else {
      useTrue = checkRuntimeCondition(cond, ctx.board, {
        clipLibrary: ctx.clipLibrary,
        isWrapperActive: (n) => ctx.board.isWrapperActive(n),
      })
    }
    const branch = useTrue
      ? resolveHandle(handles, d.True ?? d.true)
      : resolveHandle(handles, d.False ?? d.false)
    tickClipClocksAlongPose(branch, ctx, clockVisited)
    return
  }

  if (t === 'animAnimNode_BlendAdditive') {
    tickClipClocksAlongPose(resolveHandle(handles, d.inputNode), ctx, clockVisited)
    const wNode = resolveHandle(handles, d.weightNode)
    let w = 0
    if (wNode) w = readFloatSource(wNode, ctx, 0)
    if (isBlendAdditiveInputActive(w)) {
      tickClipClocksAlongPose(resolveHandle(handles, d.addedInputNode), ctx, clockVisited)
    }
    return
  }

  if (t === 'animAnimNode_BlendOverride') {
    // Always tick base; override only when control weight > ACTIVATION_THRESHOLD.
    tickClipClocksAlongPose(resolveHandle(handles, d.inputNode), ctx, clockVisited)
    const wNode = resolveHandle(handles, d.weightNode)
    const raw = wNode ? readFloatSource(wNode, ctx, 0) : 0
    const weight = Math.min(1, Math.max(0, raw))
    if (blendOverrideInputActive(weight)) {
      tickClipClocksAlongPose(resolveHandle(handles, d.overrideInputNode), ctx, clockVisited)
    }
    return
  }

  // Generic: follow pose input pins
  forEachLinkedInput(node, handles, (linked) =>
    tickClipClocksAlongPose(linked, ctx, clockVisited)
  )
}

/** Follow diagram pin inputs (schema + extraPins), not a hardcoded field list. */
function forEachLinkedInput(
  node: AnimgraphNode,
  handles: Map<string, AnimgraphNode>,
  visit: (linked: AnimgraphNode | null) => void
): void {
  const t = handleType(node)
  if (!t) return
  for (const pinName of NodeDefinitionRegistry.getInputFields(t)) {
    const handler = NodeDefinitionRegistry.getNodeInputHandler(t, pinName)
    const n = handler.count(node)
    for (let i = 0; i < n; i++) {
      visit(resolveHandle(handles, handler.get(node, i)))
    }
  }
}

/** Dim an unused pose branch (Switch/Blend unused inputs) without Update.
 * Skip nodes already Update()'d this frame — shared base poses (e.g. BlendAdditive
 * inputNode) must stay lit even if also reachable from an unused branch.
 */
function markInactiveBranch(
  node: AnimgraphNode | null,
  handles: Map<string, AnimgraphNode>,
  nodes: Record<string, SimNodeState>,
  seen: Set<string>,
  activeVisited: Set<string>
): void {
  if (!node) return
  if (seen.has(node.HandleId)) return
  if (activeVisited.has(node.HandleId)) return
  seen.add(node.HandleId)
  markInactive(nodes, node.HandleId, true)

  forEachLinkedInput(node, handles, (linked) =>
    markInactiveBranch(linked, handles, nodes, seen, activeVisited)
  )
  // State / SM pose graphs live in contain fields, not pins.
  const d = node.Data ?? {}
  for (const key of ['nodes', 'outputNode', 'states'] as const) {
    const val = d[key]
    if (Array.isArray(val)) {
      for (const ref of val) {
        markInactiveBranch(resolveHandle(handles, ref), handles, nodes, seen, activeVisited)
      }
    } else if (val != null) {
      markInactiveBranch(resolveHandle(handles, val), handles, nodes, seen, activeVisited)
    }
  }
}

/** Engine AnimNode_BlendAdditive::ACTIVATION_THRESHOLD */
const BLEND_ADDITIVE_ACTIVATION = 0.01

function isBlendAdditiveInputActive(weight: number): boolean {
  return Math.abs(weight) > BLEND_ADDITIVE_ACTIVATION
}

function boardFloat(
  board: SimInputBoard,
  varName: string,
  fallback: number
): number {
  if (!varName) return fallback
  const v = board.floatVars.get(varName)
  return v !== undefined ? v : fallback
}

function linkOrConst(
  link: unknown,
  constVal: unknown,
  fctx: FloatEvalCtx,
  fallback: number,
  depth: number
): number {
  const h = resolveHandle(fctx.handles, link)
  if (h) return readFloatSource(h, fctx, fallback, depth + 1)
  return readNumber(constVal, fallback)
}

function compareFloatOp(a: number, b: number, operation: unknown): boolean {
  const eps = Number.EPSILON * 8
  switch (normalizeCompareFunc(operation)) {
    case 'equal':
      return Math.abs(a - b) <= eps
    case 'notequal':
      return Math.abs(a - b) > eps
    case 'less':
      return a < b
    case 'lessequal':
      return a <= b
    case 'greater':
      return a > b
    case 'greaterequal':
      return a >= b
    default:
      return Math.abs(a - b) <= eps
  }
}

function evalFloatMathOp(a: number, b: number, operationType: unknown): number {
  const op = String(operationType ?? 'Abs')
    .replace(/^AGMO_/i, '')
    .toLowerCase()
  switch (op) {
    case 'add':
      return a + b
    case 'subtract':
      return a - b
    case 'multiply':
      return a * b
    case 'divide': {
      const d = Math.abs(b) < Number.EPSILON ? Math.sign(b || 1) * Number.EPSILON : b
      return a / d
    }
    case 'safedivide':
      return Math.abs(b) < Number.EPSILON ? 0 : a / b
    case 'atan':
      return Math.atan2(a, b) / Math.PI
    case 'anglediff': {
      let ret = a - b
      while (ret < -1) ret += 2
      while (ret > 1) ret -= 2
      return ret
    }
    case 'length':
      return Math.sqrt(a * a + b * b)
    case 'abs':
    default:
      return Math.abs(a)
  }
}

/** Collect float socket vars from MathExpressionFloat expressionData. */
function collectMathFloatSocketVars(
  node: AnimgraphNode,
  fctx: FloatEvalCtx,
  depth: number
): Record<string, number> {
  const vars: Record<string, number> = {}
  const sockets = node.Data?.expressionData?.floatSockets
  if (!Array.isArray(sockets)) return vars
  const compiled = getCompiledMathExpr(mathExpressionString(node), fctx.mathExprCache)
  const idents = compiled?.floatIdents ?? []
  sockets.forEach((socket: any, index: number) => {
    const varId = readNumber(socket?.expressionVarId, index)
    const letter = String.fromCharCode(65 + Math.max(0, varId))
    const named = readCName(socket?.variableName)
    const ident = idents[varId] ?? idents[index]
    const src = resolveHandle(fctx.handles, socket?.link ?? socket)
    const v = readFloatSource(src, fctx, 0, depth + 1)
    if (named) vars[named] = v
    if (ident) vars[ident] = v
    vars[letter] = v
    if (index === 0 || varId === 0) {
      if (vars.In === undefined) vars.In = v
      if (vars.in === undefined) vars.in = v
    }
  })
  return vars
}

/** Collect quaternion socket vars (`#quaternion`) from expressionData. */
function collectMathQuatSocketVars(
  node: AnimgraphNode,
  fctx: FloatEvalCtx,
  depth: number
): Record<string, SimVec4> {
  const vars: Record<string, SimVec4> = {}
  const sockets = node.Data?.expressionData?.quaternionSockets
  if (!Array.isArray(sockets)) return vars
  const compiled = getCompiledMathExpr(mathExpressionString(node), fctx.mathExprCache)
  const idents = compiled?.quatIdents ?? []
  sockets.forEach((socket: any, index: number) => {
    const varId = readNumber(socket?.expressionVarId, index)
    const letter = String.fromCharCode(65 + Math.max(0, varId))
    const named = readCName(socket?.variableName)
    const ident = idents[varId] ?? idents[index]
    const src = resolveHandle(fctx.handles, socket?.link ?? socket)
    const q = src ? readQuatSource(src, fctx, IDENTITY_QUAT_STATE, depth + 1) : IDENTITY_QUAT_STATE
    const v: SimVec4 = { x: q.x, y: q.y, z: q.z, w: q.w }
    if (named) vars[named] = v
    if (ident) vars[ident] = v
    vars[letter] = v
    // Engine AutoRegisterVar stores `#name`; also bind bare name.
    if (ident?.startsWith('#') && ident.length > 1) {
      vars[ident.slice(1)] = v
    }
    if (index === 0 || varId === 0) {
      if (vars.In === undefined) vars.In = v
      if (vars.in === undefined) vars.in = v
    }
  })
  return vars
}

function evalMathExpressionFloat(
  node: AnimgraphNode,
  fctx: FloatEvalCtx,
  depth = 0
): number {
  const expr = mathExpressionString(node)
  const compiled = getCompiledMathExpr(expr, fctx.mathExprCache)
  const floatVars = collectMathFloatSocketVars(node, fctx, depth)
  const vectorVars = collectMathVectorSocketVars(node, fctx, depth)
  const quatVars = collectMathQuatSocketVars(node, fctx, depth)
  if (compiled) {
    const needsMixed =
      Object.keys(vectorVars).length > 0 ||
      Object.keys(quatVars).length > 0 ||
      compiled.needsMixed
    const result = needsMixed
      ? evalAnimMathExpressionFloatMixed(
          expr,
          floatVars,
          vectorVars,
          quatVars,
          fctx.mathExprCache
        )
      : evalAnimMathExpression(expr, floatVars, fctx.mathExprCache)
    if (result != null) return result
  }
  const first = Object.values(floatVars)[0]
  return first ?? 0
}

function mathExpressionString(node: AnimgraphNode): string {
  return String(
    node.Data?.expressionString ??
      node.Data?.expressionData?.expressionString ??
      node.Data?.expression ??
      ''
  )
}

/** Collect vector socket vars from MathExpressionVector expressionData. */
function collectMathVectorSocketVars(
  node: AnimgraphNode,
  fctx: FloatEvalCtx,
  depth: number
): Record<string, SimVec4> {
  const vars: Record<string, SimVec4> = {}
  const sockets = node.Data?.expressionData?.vectorSockets
  if (!Array.isArray(sockets)) return vars
  const compiled = getCompiledMathExpr(mathExpressionString(node), fctx.mathExprCache)
  const idents = compiled?.vectorIdents ?? []
  sockets.forEach((socket: any, index: number) => {
    const varId = readNumber(socket?.expressionVarId, index)
    const letter = String.fromCharCode(65 + Math.max(0, varId))
    const named = readCName(socket?.variableName)
    const ident = idents[varId] ?? idents[index]
    const src = resolveHandle(fctx.handles, socket?.link ?? socket)
    const v = readVectorSource(src, fctx, ZERO_VEC4, depth + 1)
    if (named) vars[named] = v
    if (ident) vars[ident] = v
    vars[letter] = v
    if (index === 0 || varId === 0) {
      if (vars.In === undefined) vars.In = v
      if (vars.in === undefined) vars.in = v
      if (vars.Input === undefined) vars.Input = v
    }
  })
  return vars
}

function evalMathExpressionVector(
  node: AnimgraphNode,
  fctx: FloatEvalCtx,
  depth = 0
): SimVec4 {
  const floatVars = collectMathFloatSocketVars(node, fctx, depth)
  const vectorVars = collectMathVectorSocketVars(node, fctx, depth)
  const expr = mathExpressionString(node)
  if (expr) {
    const result = evalAnimMathExpressionVector(
      expr,
      floatVars,
      vectorVars,
      {},
      fctx.mathExprCache
    )
    if (result) return result
  }
  const first = Object.values(vectorVars)[0]
  return first ?? ZERO_VEC4
}

function evalFloatInterpolation(
  node: AnimgraphNode,
  fctx: FloatEvalCtx,
  depth: number
): number {
  const d = node.Data ?? {}
  const x = linkOrConst(d.inputNode, 0, fctx, 0, depth)
  const x1 = readNumber(d.x1, 0)
  const x2 = readNumber(d.x2, 1)
  const y1 = readNumber(d.y1, 0)
  const y2 = readNumber(d.y2, 1)
  if (Math.abs(x2 - x1) < Number.EPSILON) return y1
  const t = Math.min(1, Math.max(0, (x - x1) / (x2 - x1)))
  // Matches engine AnimNode_FloatInterpolation::OnGetValue — m_interpolationType
  // (AGMI_SIN / AGMI_BEZIER) is stored but unused; always linear remap + clamp.
  return y1 + (y2 - y1) * t
}

function evalSignalFloat(node: AnimgraphNode, fctx: FloatEvalCtx): number {
  const id = node.HandleId
  const params = readSignalParams((node.Data ?? {}) as Record<string, unknown>)
  if (fctx.signalUpdated.has(id)) {
    const existing = fctx.signalDyn.get(id)
    return existing ? signalGetValue(existing, params) : 0
  }
  let state = fctx.signalDyn.get(id)
  if (!state) {
    state = createSignalState(params)
    fctx.signalDyn.set(id, state)
  }
  fctx.signalUpdated.add(id)
  stepSignal(state, params, fctx.board, fctx.dt)
  return signalGetValue(state, params)
}

/**
 * AnimNode_EventValue — latch last-frame valued timeline event value.
 * Holds until next matching valued event (animNode_Numeric.cpp).
 */
function evalEventValueFloat(node: AnimgraphNode, fctx: FloatEvalCtx): number {
  const id = node.HandleId
  const d = node.Data ?? {}
  const eventName = readCName(d.eventName)
  const def = readNumber(d.defaultValue, 0)
  if (fctx.floatUpdated.has(id)) {
    return fctx.floatDyn.get(id)?.value ?? def
  }
  let state = fctx.floatDyn.get(id)
  if (!state) {
    state = { value: def, velocity: 0 }
    fctx.floatDyn.set(id, state)
  }
  fctx.floatUpdated.add(id)
  const hit = fctx.board.getLastFrameAnimEventValue(eventName)
  if (hit !== undefined) state.value = hit
  return state.value
}

/** AnimNode_Event — eventValue while last-frame event present, else default. */
function evalEventFloat(node: AnimgraphNode, board: SimInputBoard): number {
  const d = node.Data ?? {}
  const eventName = readCName(d.eventName)
  const def = readNumber(d.defaultValue, 0)
  if (eventName && board.hasAnimEvent(eventName)) {
    return readNumber(d.eventValue, 1)
  }
  return def
}

/** AnimNode_TagValue — data-flow tag float, optional oneMinus. */
function evalTagValueFloat(node: AnimgraphNode, board: SimInputBoard): number {
  const d = node.Data ?? {}
  const tag = readCName(d.tag)
  const def = readNumber(d.defaultValue, 0)
  const hit = board.getTagValue(tag)
  if (hit === undefined) return def
  return readBool(d.oneMinus) ? 1 - hit : hit
}

/**
 * AnimNode_AnimSetTagValue — 1 if any node tag matches active anim-set tags.
 */
function evalAnimSetTagValueFloat(
  node: AnimgraphNode,
  board: SimInputBoard,
  library: ClipLibrary | null
): number {
  const tags = readTagList((node.Data ?? {}).tags)
  if (!tags.length || !library || library.entryCount === 0) return 0
  return library.hasRuntimeTags(tags, (n) => board.isWrapperActive(n)) ? 1 : 0
}

/**
 * AnimNode_MultiBoolToFloatValue — AND/OR of AnimFeature bools → onTrue/onFalse.
 */
function evalMultiBoolToFloat(node: AnimgraphNode, board: SimInputBoard): number {
  const d = node.Data ?? {}
  const onTrue = readNumber(d.onTrue, 1)
  const onFalse = readNumber(d.onFalse, 0)
  const allMust = readBool(d.allMustBeTrue)
  const inputs = Array.isArray(d.inputsData) ? d.inputsData : []
  if (!inputs.length) return onFalse

  if (allMust) {
    for (const raw of inputs) {
      if (!raw || typeof raw !== 'object') return onFalse
      const e = raw as Record<string, unknown>
      const group = readCName(e.group)
      const name = readCName(e.name)
      const v = board.getBoolFeature(group, name)
      if (v !== true) return onFalse
    }
    return onTrue
  }

  for (const raw of inputs) {
    if (!raw || typeof raw !== 'object') continue
    const e = raw as Record<string, unknown>
    const group = readCName(e.group)
    const name = readCName(e.name)
    if (board.getBoolFeature(group, name) === true) return onTrue
  }
  return onFalse
}

/**
 * AnimNode_Timer — elapsed seconds since activate (reset when dyn state created).
 */
function evalTimerFloat(node: AnimgraphNode, fctx: FloatEvalCtx): number {
  const id = node.HandleId
  if (fctx.floatUpdated.has(id)) {
    return fctx.floatDyn.get(id)?.value ?? 0
  }
  let state = fctx.floatDyn.get(id)
  if (!state) {
    state = { value: 0, velocity: 0 }
    fctx.floatDyn.set(id, state)
  } else {
    state.value += Math.max(0, fctx.dt)
  }
  fctx.floatUpdated.add(id)
  return state.value
}

/**
 * AnimNode_WrapperValue::RecacheWrapperValue — OR/AND of active wrapper flags → 0/1,
 * then optional oneMinus. Active = weight >= 0.5 (SetAnimWrapperWeight).
 */
function evalWrapperValueFloat(node: AnimgraphNode, board: SimInputBoard): number {
  const d = node.Data ?? {}
  const names = readCNameList(d.wrapperNames)
  let ret = false
  if (names.length > 0) {
    if (isLogicOpOr(d.logicOp)) {
      for (const name of names) {
        if (board.isWrapperActive(name)) {
          ret = true
          break
        }
      }
    } else {
      ret = true
      for (const name of names) {
        if (!board.isWrapperActive(name)) {
          ret = false
          break
        }
      }
    }
  }
  if (readBool(d.oneMinus)) ret = !ret
  return ret ? 1 : 0
}

/** Types that participate in float value Update + badge. */
function isFloatValueNodeType(t: string): boolean {
  return (
    t === 'animAnimNode_FloatInput' ||
    t === 'animAnimNode_IntInput' ||
    t === 'animAnimNode_BoolInput' ||
    t === 'animAnimNode_FloatConstant' ||
    t === 'animAnimNode_IntConstant' ||
    t === 'animAnimNode_FloatVariable' ||
    t === 'animAnimNode_IntVariable' ||
    t === 'animAnimNode_BoolVariable' ||
    t === 'animAnimNode_DampFloat' ||
    t === 'animAnimNode_SpringDamp' ||
    t === 'animAnimNode_CriticalSpringDamp' ||
    t === 'animAnimNode_MathExpressionFloat' ||
    t === 'animAnimNode_FloatComparator' ||
    t === 'animAnimNode_FloatMathOp' ||
    t === 'animAnimNode_FloatClamp' ||
    t === 'animAnimNode_FloatJoin' ||
    t === 'animAnimNode_FloatLatch' ||
    t === 'animAnimNode_BoolJoin' ||
    t === 'animAnimNode_BoolLatch' ||
    t === 'animAnimNode_IntJoin' ||
    t === 'animAnimNode_IntLatch' ||
    t === 'animAnimNode_FloatInterpolation' ||
    t === 'animAnimNode_FloatCumulative' ||
    t === 'animAnimNode_CurveFloatValue' ||
    t === 'animAnimNode_FloatRandom' ||
    t === 'animAnimNode_FloatTimeDependentSinus' ||
    t === 'animAnimNode_Signal' ||
    t === 'animAnimNode_EventValue' ||
    t === 'animAnimNode_Event' ||
    t === 'animAnimNode_TagValue' ||
    t === 'animAnimNode_WrapperValue' ||
    t === 'animAnimNode_AnimSetTagValue' ||
    t === 'animAnimNode_MultiBoolToFloatValue' ||
    t === 'animAnimNode_Timer' ||
    t === 'animAnimNode_IntToFloatConverter' ||
    t === 'animAnimNode_BoolToFloatConverter' ||
    t === 'animAnimNode_FloatToIntConverter' ||
    t === 'animAnimNode_FloatToBoolConverter' ||
    t === 'animAnimNode_CoordinateFromVector' ||
    /Converter$/i.test(t)
  )
}

/** Types that participate in vector value Update + length badge. */
function isVectorValueNodeType(t: string): boolean {
  return (
    t === 'animAnimNode_VectorInput' ||
    t === 'animAnimNode_VectorConstant' ||
    t === 'animAnimNode_VectorJoin' ||
    t === 'animAnimNode_VectorVariable' ||
    t === 'animAnimNode_VectorLatch' ||
    t === 'animAnimNode_DampVector' ||
    t === 'animAnimNode_CurveVectorValue' ||
    t === 'animAnimNode_MathExpressionVector' ||
    t === 'animAnimNode_VectorInterpolation' ||
    t === 'animAnimNode_VectorWsToMs'
  )
}

function isTransformValueNodeType(t: string): boolean {
  return (
    t === 'animAnimNode_TransformConstant' ||
    t === 'animAnimNode_TransformInterpolation' ||
    t === 'animAnimNode_TransformJoin' ||
    t === 'animAnimNode_TransformLatch' ||
    t === 'animAnimNode_TransformVariable'
  )
}

function isQuaternionValueNodeType(t: string): boolean {
  return (
    t === 'animAnimNode_QuaternionConstant' ||
    t === 'animAnimNode_QuaternionInput' ||
    t === 'animAnimNode_QuaternionJoin' ||
    t === 'animAnimNode_QuaternionInterpolation' ||
    t === 'animAnimNode_QuaternionVariable' ||
    t === 'animAnimNode_QuaternionLatch'
  )
}

function readQuaternionValue(
  raw: unknown,
  fallback: BoneOpQuatState = IDENTITY_QUAT_STATE
): BoneOpQuatState {
  if (!raw || typeof raw !== 'object') return { ...fallback }
  const o = raw as Record<string, unknown>
  return {
    x: readNumber(o.i ?? o.X ?? o.x, fallback.x),
    y: readNumber(o.j ?? o.Y ?? o.y, fallback.y),
    z: readNumber(o.k ?? o.Z ?? o.z, fallback.z),
    w: readNumber(o.r ?? o.W ?? o.w, fallback.w),
  }
}

/** Read quaternion from a quat source node. */
function readQuatSource(
  source: AnimgraphNode | null,
  fctx: FloatEvalCtx,
  fallback: BoneOpQuatState = IDENTITY_QUAT_STATE,
  depth = 0
): BoneOpQuatState {
  if (!source || depth > 32) return { ...fallback }
  const t = handleType(source)
  const d = source.Data ?? {}
  const { handles } = fctx

  if (t === 'animAnimNode_QuaternionConstant') {
    return readQuaternionValue(d.value, fallback)
  }

  if (t === 'animAnimNode_QuaternionJoin') {
    const input = resolveHandle(handles, d.input)
    if (input) return readQuatSource(input, fctx, fallback, depth + 1)
    return { ...fallback }
  }

  if (t === 'animAnimNode_QuaternionInterpolation') {
    const a = readQuatSource(resolveHandle(handles, d.firstInput), fctx, fallback, depth + 1)
    const b = readQuatSource(resolveHandle(handles, d.secondInput), fctx, IDENTITY_QUAT_STATE, depth + 1)
    const wNode = resolveHandle(handles, d.weight)
    const w = wNode ? readFloatSource(wNode, fctx, 0, depth + 1) : 0
    return nlerpQuatState(a, b, Math.min(1, Math.max(0, w)))
  }

  // Engine AnimNode_QuaternionVariable::OnGetValue — board quat var or identity.
  if (t === 'animAnimNode_QuaternionVariable') {
    const name = readCName(d.variableName)
    if (!name || name === 'None') return { ...fallback }
    const q = fctx.board.quatVars.get(name)
    return q ? { x: q.x, y: q.y, z: q.z, w: q.w } : { ...IDENTITY_QUAT_STATE }
  }

  if (t === 'animAnimNode_QuaternionInput') {
    const group = readCName(d.group)
    const name = readCName(d.name)
    if (!group || !name || name === 'None') return { ...fallback }
    const q = fctx.board.getQuatFeature(group, name)
    if (!q) return { ...fallback }
    return { x: q.x, y: q.y, z: q.z, w: q.w }
  }

  if (t === 'animAnimNode_QuaternionLatch') {
    const input = resolveHandle(handles, d.input)
    if (input) return readQuatSource(input, fctx, fallback, depth + 1)
    return { ...fallback }
  }

  return { ...fallback }
}

function resolvePoseInputLink(
  handles: Map<string, AnimgraphNode>,
  d: Record<string, unknown>
): AnimgraphNode | null {
  return (
    resolveHandle(handles, d.inputNode) ??
    resolveHandle(handles, d.inputLink) ??
    resolveHandle(handles, d.input)
  )
}

function wasBoneOpActive(ctx: WalkCtx, handleId: string): boolean {
  return !!ctx.prevNodes?.[handleId]?.active
}

function walkFloatValueInputs(node: AnimgraphNode, ctx: WalkCtx): void {
  forEachLinkedInput(node, ctx.handles, (linked) => updateFromNode(linked, ctx))
}

/** Read Vector4 from a vector source node (Input / Constant / Join / MathExpression). */
function readVectorSource(
  source: AnimgraphNode | null,
  fctx: FloatEvalCtx,
  fallback: SimVec4 = ZERO_VEC4,
  depth = 0
): SimVec4 {
  if (!source || depth > 32) return fallback
  const t = handleType(source)
  const d = source.Data ?? {}
  const { board, handles } = fctx

  if (t === 'animAnimNode_VectorInput') {
    const group = readCName(d.group)
    const name = readCName(d.name)
    if (!group || !name || name === 'None') return fallback
    return board.getVectorFeature(group, name) ?? fallback
  }

  if (t === 'animAnimNode_VectorConstant') {
    return readVector4(d.value, fallback)
  }

  // Engine AnimNode_VectorVariable::OnGetValue — board vector var or ZERO_3D_POINT.
  if (t === 'animAnimNode_VectorVariable') {
    const name = readCName(d.variableName)
    if (!name || name === 'None') return fallback
    const v = board.vectorVars.get(name)
    return v ? { ...v } : { x: 0, y: 0, z: 0, w: 0 }
  }

  if (t === 'animAnimNode_VectorJoin') {
    const input = resolveHandle(handles, d.input)
    if (input) return readVectorSource(input, fctx, fallback, depth + 1)
    return fallback
  }

  // Engine AnimNode_VectorInterpolation::OnGetValue — Lerp(weight, first, second).
  if (t === 'animAnimNode_VectorInterpolation') {
    const a = readVectorSource(
      resolveHandle(handles, d.firstInput),
      fctx,
      fallback,
      depth + 1
    )
    const b = readVectorSource(
      resolveHandle(handles, d.secondInput),
      fctx,
      ZERO_VEC4,
      depth + 1
    )
    const wNode = resolveHandle(handles, d.weight)
    const w = Math.min(1, Math.max(0, wNode ? readFloatSource(wNode, fctx, 0, depth + 1) : 0))
    const u = 1 - w
    return {
      x: a.x * u + b.x * w,
      y: a.y * u + b.y * w,
      z: a.z * u + b.z * w,
      w: a.w * u + b.w * w,
    }
  }

  // Engine AnimNode_VectorWsToMs — inv(entity L2W). Offline: identity L2W → passthrough.
  if (t === 'animAnimNode_VectorWsToMs') {
    const input = resolveHandle(handles, d.vectorWs)
    return input ? readVectorSource(input, fctx, fallback, depth + 1) : fallback
  }

  if (t === 'animAnimNode_MathExpressionVector') {
    return evalMathExpressionVector(source, fctx, depth)
  }

  // Engine AnimNode_CurveVectorValue::OnGetValue — EvalAt(curveData, argument).
  if (t === 'animAnimNode_CurveVectorValue') {
    const argNode = resolveHandle(handles, d.argument)
    const arg = argNode ? readFloatSource(argNode, fctx, 0, depth + 1) : 0
    return evalCurveVector4Data(d.curveData, arg, fallback)
  }

  if (t === 'animAnimNode_VectorLatch' || t === 'animAnimNode_DampVector') {
    return evalStatefulVectorNode(source, t, fctx, depth)
  }

  return fallback
}

/** Read Qs transform from TransformValue family nodes. */
function readTransformSource(
  source: AnimgraphNode | null,
  fctx: FloatEvalCtx,
  fallback: Qs = IDENTITY_QS,
  depth = 0
): Qs {
  if (!source || depth > 32) return { ...fallback }
  const t = handleType(source)
  const d = source.Data ?? {}
  const { board, handles } = fctx

  if (t === 'animAnimNode_TransformConstant') {
    return qsFromPosRotScale(d.pos, d.rotation, d.scale)
  }

  if (t === 'animAnimNode_TransformVariable') {
    const name = readCName(d.variableName)
    if (!name || name === 'None') return { ...fallback }
    const v = board.transformVars.get(name)
    return v ? { ...v } : { ...IDENTITY_QS }
  }

  if (t === 'animAnimNode_TransformJoin') {
    const input = resolveHandle(handles, d.input)
    if (input) return readTransformSource(input, fctx, fallback, depth + 1)
    return { ...fallback }
  }

  if (t === 'animAnimNode_TransformLatch') {
    const id = source.HandleId
    if (fctx.floatUpdated.has(id)) {
      return fctx.transformDyn.get(id) ? { ...fctx.transformDyn.get(id)! } : { ...fallback }
    }
    let state = fctx.transformDyn.get(id)
    if (!state) {
      const input = resolveHandle(handles, d.input)
      state = input
        ? { ...readTransformSource(input, fctx, IDENTITY_QS, depth + 1) }
        : { ...IDENTITY_QS }
      fctx.transformDyn.set(id, state)
    }
    fctx.floatUpdated.add(id)
    return { ...state }
  }

  if (t === 'animAnimNode_TransformInterpolation') {
    const a = readTransformSource(
      resolveHandle(handles, d.firstInput),
      fctx,
      fallback,
      depth + 1
    )
    const b = readTransformSource(
      resolveHandle(handles, d.secondInput),
      fctx,
      IDENTITY_QS,
      depth + 1
    )
    const wNode = resolveHandle(handles, d.weight)
    const w = Math.min(1, Math.max(0, wNode ? readFloatSource(wNode, fctx, 0, depth + 1) : 0))
    const kind = String(d.interpolationType ?? 'Spherical')
    if (kind.includes('Linear') && !kind.includes('Spherical')) return lerpQs(a, b, w)
    return slerpQs(a, b, w)
  }

  return { ...fallback }
}

/** BoolLatch / IntLatch — sample input once on activate (like FloatLatch). */
function evalScalarLatchNode(
  source: AnimgraphNode,
  fctx: FloatEvalCtx,
  depth: number
): number {
  const id = source.HandleId
  if (fctx.floatUpdated.has(id)) {
    return fctx.floatDyn.get(id)?.value ?? 0
  }
  let state = fctx.floatDyn.get(id)
  if (!state) {
    const input = resolveHandle(fctx.handles, source.Data?.input)
    const v = input ? readFloatSource(input, fctx, 0, depth + 1) : 0
    state = { value: v, velocity: 0 }
    fctx.floatDyn.set(id, state)
  }
  fctx.floatUpdated.add(id)
  return state.value
}

/**
 * VectorLatch (capture on activate) / DampVector (per-component damp each frame).
 */
function evalStatefulVectorNode(
  source: AnimgraphNode,
  t: string,
  fctx: FloatEvalCtx,
  depth: number
): SimVec4 {
  const id = source.HandleId
  if (fctx.floatUpdated.has(id)) {
    return fctx.vectorDyn.get(id) ? { ...fctx.vectorDyn.get(id)! } : { ...ZERO_VEC4 }
  }
  const d = source.Data ?? {}
  const { handles, dt } = fctx

  if (t === 'animAnimNode_VectorLatch') {
    let state = fctx.vectorDyn.get(id)
    if (!state) {
      const input = resolveHandle(handles, d.input)
      state = input
        ? { ...readVectorSource(input, fctx, ZERO_VEC4, depth + 1) }
        : { ...ZERO_VEC4 }
      fctx.vectorDyn.set(id, state)
    }
    fctx.floatUpdated.add(id)
    return { ...state }
  }

  // DampVector
  const defs = readDampVectorDefaults(d)
  const inputNode = resolveHandle(handles, d.inputNode)
  const inputValue = inputNode
    ? readVectorSource(inputNode, fctx, defs.defaultInitial, depth + 1)
    : defs.defaultInitial
  let increaseSpeed = defs.increaseSpeed
  const incNode = resolveHandle(handles, d.increaseSpeedNode)
  if (incNode) increaseSpeed = readVectorSource(incNode, fctx, increaseSpeed, depth + 1)
  let decreaseSpeed = defs.decreaseSpeed
  const decNode = resolveHandle(handles, d.decreaseSpeedNode)
  if (decNode) decreaseSpeed = readVectorSource(decNode, fctx, decreaseSpeed, depth + 1)

  let state = fctx.vectorDyn.get(id)
  if (!state) {
    state = {
      ...(defs.startFromDefault ? defs.defaultInitial : inputValue),
    }
    fctx.vectorDyn.set(id, state)
  }
  stepDampVector(state, inputValue, increaseSpeed, decreaseSpeed, dt)
  fctx.floatUpdated.add(id)
  return { ...state }
}

/** Read numeric value from a float/int source node (variable / constant / AnimFeature input). */
function readFloatSource(
  source: AnimgraphNode | null,
  fctx: FloatEvalCtx,
  fallback = 0,
  depth = 0
): number {
  if (!source || depth > 32) return fallback
  const t = handleType(source)
  const d = source.Data ?? {}
  const { board, handles } = fctx

  // External AnimFeature: group + name (FloatInput / IntInput)
  if (t === 'animAnimNode_FloatInput' || t === 'animAnimNode_IntInput') {
    const group = readCName(d.group)
    const name = readCName(d.name)
    const fromFeature = board.getFeature(group, name)
    if (fromFeature !== undefined) return fromFeature
    return fallback
  }

  if (t === 'animAnimNode_BoolInput') {
    const group = readCName(d.group)
    const name = readCName(d.name)
    const fromFeature = board.getBoolFeature(group, name)
    if (fromFeature !== undefined) return fromFeature ? 1 : 0
    return fallback
  }

  if (t === 'animAnimNode_FloatConstant' || t === 'animAnimNode_IntConstant') {
    return readNumber(d.value ?? d.floatValue, fallback)
  }

  if (t === 'animAnimNode_IntVariable') {
    const name = readCName(d.variableName)
    if (name && board.intVars.has(name)) return board.intVars.get(name)!
    return fallback
  }

  if (t === 'animAnimNode_FloatVariable') {
    const name = readCName(d.variableName)
    if (!name || name === 'None') return fallback
    // Unset board var → 0 (engine default); UI often shows ??0 without seeding the map.
    return boardFloat(board, name, 0)
  }

  if (t === 'animAnimNode_BoolVariable') {
    const name = readCName(d.variableName)
    if (name && board.boolVars.has(name)) return board.boolVars.get(name) ? 1 : 0
    return fallback
  }

  if (t === 'animAnimNode_MathExpressionFloat') {
    return evalMathExpressionFloat(source, fctx, depth)
  }

  if (t === 'animAnimNode_FloatComparator') {
    const a = linkOrConst(d.firstInputLink, d.firstValue, fctx, 0, depth)
    const b = linkOrConst(d.secondInputLink, d.secondValue, fctx, 0, depth)
    const ok = compareFloatOp(a, b, d.operation)
    return ok
      ? linkOrConst(d.trueInputLink, d.trueValue, fctx, 0, depth)
      : linkOrConst(d.falseInputLink, d.falseValue, fctx, 0, depth)
  }

  if (t === 'animAnimNode_FloatMathOp') {
    const a = linkOrConst(d.firstInputNode, 0, fctx, 0, depth)
    const b = linkOrConst(d.secondInputNode, 0, fctx, 0, depth)
    return evalFloatMathOp(a, b, d.operationType ?? d.operation)
  }

  if (t === 'animAnimNode_FloatClamp') {
    const v = linkOrConst(d.inputNode, 0, fctx, 0, depth)
    const min = readNumber(d.min, 0)
    const max = readNumber(d.max, 1)
    return Math.min(max, Math.max(min, v))
  }

  if (t === 'animAnimNode_FloatInterpolation') {
    return evalFloatInterpolation(source, fctx, depth)
  }

  if (t === 'animAnimNode_FloatCumulative') {
    return evalFloatCumulative(source, fctx, depth)
  }

  // Engine AnimNode_FloatToBoolConverter — 0.f != input.
  if (t === 'animAnimNode_FloatToBoolConverter') {
    const input = resolveHandle(handles, d.inputNode ?? d.input)
    const v = input ? readFloatSource(input, fctx, 0, depth + 1) : 0
    return v !== 0 ? 1 : 0
  }

  if (t === 'animAnimNode_Signal') {
    return evalSignalFloat(source, fctx)
  }

  if (t === 'animAnimNode_WrapperValue') {
    return evalWrapperValueFloat(source, board)
  }

  if (
    t === 'animAnimNode_FloatJoin' ||
    t === 'animAnimNode_IntJoin' ||
    t === 'animAnimNode_BoolJoin'
  ) {
    const input = resolveHandle(handles, d.input)
    if (input) return readFloatSource(input, fctx, fallback, depth + 1)
    return fallback
  }

  if (t === 'animAnimNode_BoolLatch' || t === 'animAnimNode_IntLatch') {
    return evalScalarLatchNode(source, fctx, depth)
  }

  // Engine AnimNode_CoordinateFromVector::OnGetValue — pick X/Y/Z/W from vector input.
  // Field name has engine typo: vectorCoodrinateType.
  if (t === 'animAnimNode_CoordinateFromVector') {
    const input = resolveHandle(handles, d.input)
    const v = input ? readVectorSource(input, fctx, ZERO_VEC4, depth + 1) : ZERO_VEC4
    const raw = d.vectorCoodrinateType ?? d.vectorCoordinateType ?? 0
    if (raw === 1 || raw === 'Y' || String(raw).endsWith('Y')) return v.y
    if (raw === 2 || raw === 'Z' || String(raw).endsWith('Z')) return v.z
    if (raw === 3 || raw === 'W' || String(raw).endsWith('W')) return v.w
    return v.x
  }

  if (t === 'animAnimNode_CurveFloatValue') {
    const argNode = resolveHandle(handles, d.argument)
    const arg = argNode ? readFloatSource(argNode, fctx, 0, depth + 1) : 0
    return evalCurveFloatData(d.curveData, arg)
  }

  if (
    t === 'animAnimNode_DampFloat' ||
    t === 'animAnimNode_SpringDamp' ||
    t === 'animAnimNode_CriticalSpringDamp' ||
    t === 'animAnimNode_FloatLatch'
  ) {
    return evalStatefulFloatNode(source, t, fctx, depth)
  }

  if (t === 'animAnimNode_FloatRandom') {
    return evalFloatRandomNode(source, fctx)
  }

  if (t === 'animAnimNode_FloatTimeDependentSinus') {
    return evalFloatSinusNode(source, fctx)
  }

  if (t === 'animAnimNode_EventValue') {
    return evalEventValueFloat(source, fctx)
  }

  if (t === 'animAnimNode_Event') {
    return evalEventFloat(source, fctx.board)
  }

  if (t === 'animAnimNode_TagValue') {
    return evalTagValueFloat(source, fctx.board)
  }

  if (t === 'animAnimNode_AnimSetTagValue') {
    return evalAnimSetTagValueFloat(source, fctx.board, fctx.clipLibrary)
  }

  if (t === 'animAnimNode_MultiBoolToFloatValue') {
    return evalMultiBoolToFloat(source, fctx.board)
  }

  if (t === 'animAnimNode_Timer') {
    return evalTimerFloat(source, fctx)
  }

  // Common value converters / joins — follow single input
  if (
    t === 'animAnimNode_IntToFloatConverter' ||
    t === 'animAnimNode_BoolToFloatConverter' ||
    t === 'animAnimNode_FloatToIntConverter' ||
    /Converter$/i.test(t)
  ) {
    const input = resolveHandle(handles, d.inputNode ?? d.input)
    if (input) return readFloatSource(input, fctx, fallback, depth + 1)
  }

  const varName = readCName(d.variableName)
  const fromVar = boardFloat(board, varName, NaN)
  if (Number.isFinite(fromVar)) return fromVar
  return readNumber(
    d.value ?? d.floatValue ?? d.defaultValue ?? d.defaultInitialValue,
    fallback
  )
}

/**
 * Engine AnimNode_FloatCumulative::OnUpdate — accumulate input, optional clamp /
 * normalize180 / override / resetSpeed / external-event reset.
 */
function evalFloatCumulative(
  source: AnimgraphNode,
  fctx: FloatEvalCtx,
  depth: number
): number {
  const id = source.HandleId
  if (fctx.floatUpdated.has(id)) {
    return fctx.floatDyn.get(id)?.value ?? 0
  }
  const d = source.Data ?? {}
  const { handles, dt, board } = fctx
  const defaultValue = readNumber(d.defaultValue, 0)
  const clamp = d.clamp === undefined ? true : readBool(d.clamp)
  const normalize180Default = d.normalize180 === undefined ? true : readBool(d.normalize180)

  let state = fctx.floatDyn.get(id)
  if (!state) {
    state = { value: defaultValue, velocity: 0 }
    fctx.floatDyn.set(id, state)
  }

  const applyLimits = (value: number): number => {
    let v = value
    const normNode = resolveHandle(handles, d.normalize180Input)
    const normalize =
      normNode != null
        ? readFloatSource(normNode, fctx, normalize180Default ? 1 : 0, depth + 1) !== 0
        : normalize180Default
    if (normalize) {
      while (v > 180) v -= 360
      while (v < -180) v += 360
    }
    if (clamp) {
      const minN = resolveHandle(handles, d.minValue)
      const maxN = resolveHandle(handles, d.maxValue)
      const min = minN ? readFloatSource(minN, fctx, 0, depth + 1) : 0
      const max = maxN ? readFloatSource(maxN, fctx, 0, depth + 1) : 0
      v = Math.min(max, Math.max(min, v))
    }
    return v
  }

  const overrideNode = resolveHandle(handles, d.override)
  const override =
    overrideNode != null ? readFloatSource(overrideNode, fctx, 0, depth + 1) !== 0 : false

  let updated: number
  if (override) {
    const curNode = resolveHandle(handles, d.curValue)
    updated = applyLimits(
      curNode ? readFloatSource(curNode, fctx, defaultValue, depth + 1) : defaultValue
    )
  } else {
    let forceReset = false
    const resetEvent = readCName(d.resetExternalEventName)
    if (resetEvent && resetEvent !== 'None' && board.externalEvents.has(resetEvent)) {
      forceReset = true
    }
    const resetSpeedNode = resolveHandle(handles, d.resetSpeed)
    const resetSpeed = resetSpeedNode
      ? readFloatSource(resetSpeedNode, fctx, 0, depth + 1)
      : 0
    const currentValue = state.value
    const resetRequest = Math.abs(resetSpeed) > 0 && currentValue !== 0

    if (forceReset) {
      updated = defaultValue
    } else if (resetRequest) {
      const delta = Math.abs(currentValue * resetSpeed * dt)
      if (delta >= Math.abs(currentValue) || Math.abs(currentValue) < 0.1) {
        updated = 0
      } else {
        updated = currentValue - Math.sign(currentValue) * delta
      }
    } else {
      const input = resolveHandle(handles, d.inputNode)
      const delta = input ? readFloatSource(input, fctx, 0, depth + 1) : 0
      updated = applyLimits(currentValue + delta)
    }
  }

  state.value = updated
  fctx.floatUpdated.add(id)
  return state.value
}

/**
 * One Update per frame for damp/spring/latch (cached via floatUpdated).
 * Latch samples input on activate; damp/spring integrate with dt.
 */
function evalStatefulFloatNode(
  source: AnimgraphNode,
  t: string,
  fctx: FloatEvalCtx,
  depth: number
): number {
  const id = source.HandleId
  if (fctx.floatUpdated.has(id)) {
    return fctx.floatDyn.get(id)?.value ?? 0
  }

  const d = source.Data ?? {}
  const { handles, dt } = fctx
  let state = fctx.floatDyn.get(id)

  if (t === 'animAnimNode_FloatLatch') {
    if (!state) {
      const input = resolveHandle(handles, d.input)
      const v = input ? readFloatSource(input, fctx, 0, depth + 1) : 0
      state = { value: v, velocity: 0 }
      fctx.floatDyn.set(id, state)
    }
    fctx.floatUpdated.add(id)
    return state.value
  }

  if (t === 'animAnimNode_DampFloat') {
    const defs = readDampDefaults(d)
    const inputNode = resolveHandle(handles, d.inputNode)
    const inputValue = inputNode
      ? readFloatSource(inputNode, fctx, defs.defaultInitial, depth + 1)
      : defs.defaultInitial
    let increaseSpeed = defs.increaseSpeed
    const incNode = resolveHandle(handles, d.increaseSpeedNode)
    if (incNode) increaseSpeed = Math.max(0, readFloatSource(incNode, fctx, increaseSpeed, depth + 1))
    let decreaseSpeed = defs.decreaseSpeed
    const decNode = resolveHandle(handles, d.decreaseSpeedNode)
    if (decNode) decreaseSpeed = Math.max(0, readFloatSource(decNode, fctx, decreaseSpeed, depth + 1))

    if (!state) {
      const init = wrapAroundRange(
        defs.startFromDefault ? defs.defaultInitial : inputValue,
        defs.wrap,
        defs.rangeMin,
        defs.rangeMax
      )
      state = { value: init, velocity: 0 }
      fctx.floatDyn.set(id, state)
    }
    stepDampFloat(
      state,
      inputValue,
      increaseSpeed,
      decreaseSpeed,
      defs.wrap,
      defs.rangeMin,
      defs.rangeMax,
      dt
    )
    fctx.floatUpdated.add(id)
    return state.value
  }

  if (t === 'animAnimNode_SpringDamp') {
    const defs = readSpringDefaults(d)
    const inputNode = resolveHandle(handles, d.inputNode)
    const inputValue = inputNode
      ? readFloatSource(inputNode, fctx, defs.defaultInitial, depth + 1)
      : defs.defaultInitial

    if (!state) {
      const init = wrapAroundRange(
        defs.startFromDefault || !inputNode ? defs.defaultInitial : inputValue,
        defs.wrap,
        defs.rangeMin,
        defs.rangeMax
      )
      state = { value: init, velocity: 0 }
      fctx.floatDyn.set(id, state)
    }
    stepSpringDamp(
      state,
      inputValue,
      defs.massFactor,
      defs.springFactor,
      defs.dampFactor,
      defs.wrap,
      defs.rangeMin,
      defs.rangeMax,
      defs.timeStep,
      dt
    )
    fctx.floatUpdated.add(id)
    return state.value
  }

  // CriticalSpringDamp — activates at 0; then critically damps toward input
  {
    const inputNode = resolveHandle(handles, d.inputNode)
    let inputValue = inputNode ? readFloatSource(inputNode, fctx, 0, depth + 1) : 0
    if (readBool(d.useRange)) {
      const lo = readNumber(d.rangeMin, -180)
      const hi = readNumber(d.rangeMax, 180)
      inputValue = Math.min(hi, Math.max(lo, inputValue))
    }
    const smoothTime = readNumber(d.smoothTime, 1)

    if (!state) {
      state = { value: 0, velocity: 0 }
      fctx.floatDyn.set(id, state)
    }
    if (inputNode) {
      stepCriticalSpringDamp(state, inputValue, smoothTime, dt)
    }
    fctx.floatUpdated.add(id)
    return state.value
  }
}

/** MRound-style index for Switch (animNode_Switch.cpp SelectInputsAndCalculateAlpha). */
function switchIndexFromWeight(weight: number, numInputs: number): number {
  if (numInputs <= 0) return -1
  if (numInputs === 1) return 0
  const maxIndex = numInputs - 1
  if (weight >= 0 && weight <= maxIndex) return Math.round(weight)
  if (weight > maxIndex) return maxIndex
  return 0
}

function evalFloatRandomNode(source: AnimgraphNode, fctx: FloatEvalCtx): number {
  const id = source.HandleId
  if (fctx.floatUpdated.has(id)) {
    return fctx.randomDyn.get(id)?.value ?? 0
  }
  const d = source.Data ?? {}
  const min = readNumber(d.min, 0)
  const max = readNumber(d.max, 1)
  const rand = d.rand === undefined ? true : readBool(d.rand)
  const cooldown = readNumber(d.cooldown, 1)
  let state = fctx.randomDyn.get(id)
  if (!state) {
    state = createFloatRandomState(min, max)
    fctx.randomDyn.set(id, state)
  }
  stepFloatRandom(state, rand, cooldown, min, max, fctx.dt)
  fctx.floatUpdated.add(id)
  return state.value
}

function evalFloatSinusNode(source: AnimgraphNode, fctx: FloatEvalCtx): number {
  const id = source.HandleId
  if (fctx.floatUpdated.has(id)) {
    const existing = fctx.sinusDyn.get(id)
    if (!existing) return 0
    const d = source.Data ?? {}
    return evalFloatTimeDependentSinus(
      existing,
      readNumber(d.min, 0),
      readNumber(d.max, 1),
      readNumber(d.frequencyFactor, 1),
      readNumber(d.phaseFactor, 0)
    )
  }
  const d = source.Data ?? {}
  let state = fctx.sinusDyn.get(id)
  if (!state) {
    state = createFloatSinusState()
    fctx.sinusDyn.set(id, state)
  }
  const freq = readNumber(d.frequencyFactor, 1)
  stepFloatTimeDependentSinus(state, freq, fctx.dt)
  fctx.floatUpdated.add(id)
  return evalFloatTimeDependentSinus(
    state,
    readNumber(d.min, 0),
    readNumber(d.max, 1),
    freq,
    readNumber(d.phaseFactor, 0)
  )
}

function resolveBlendMultipleSelection(
  d: Record<string, unknown>,
  ctx: FloatEvalCtx
): {
  slots: { values: number[]; refs: unknown[] }
  select: ReturnType<typeof selectBlendMultipleInputs>
  inputWeight: number
} {
  const slots = buildBlendMultipleSlots(
    d.inputValues,
    d.sortedInputValues,
    Array.isArray(d.inputNodes) ? d.inputNodes : []
  )
  const weightNode = resolveHandle(ctx.handles, d.weightNode ?? d.input)
  const minWeight = readNumber(d.minWeight, 0)
  const maxWeight = readNumber(d.maxWeight, 1)
  const inputWeight = weightNode
    ? readFloatSource(weightNode, ctx, minWeight)
    : minWeight
  const select = selectBlendMultipleInputs(
    inputWeight,
    slots.values,
    minWeight,
    maxWeight,
    readBool(d.radialBlending)
  )
  return { slots, select, inputWeight }
}

function findRootHandle(
  handles: Map<string, AnimgraphNode>,
  originalAnimgraph: RenderData['originalAnimgraph'] | null | undefined
): AnimgraphNode | null {
  const fromChunk = resolveHandle(handles, originalAnimgraph?.rootNode)
  if (fromChunk) return fromChunk
  for (const h of handles.values()) {
    if (handleType(h) === 'animAnimNode_Root') return h
  }
  return null
}

/**
 * Game-like Update walk: AnimGraph::Update → m_rootNode->Update, following pose links.
 * Sample (numeric pose) runs after Update in SimGraphRunner.step.
 */
function updateFromNode(node: AnimgraphNode | null, ctx: WalkCtx): void {
  if (!node) return
  if (ctx.visited.has(node.HandleId)) return
  ctx.visited.add(node.HandleId)
  markActive(ctx.nodes, node.HandleId)

  const t = handleType(node)
  const d = node.Data ?? {}
  const { handles, board, nodes } = ctx

  if (t === 'animAnimNode_Root') {
    const out = resolveHandle(handles, d.outputNode)
    if (out) {
      followUpdate(node, out, ctx)
      return
    }
    const children = Array.isArray(d.nodes) ? d.nodes : []
    if (children.length > 0) {
      followUpdate(node, resolveHandle(handles, children[0]), ctx)
    }
    return
  }

  if (t === 'animAnimNode_Output') {
    followUpdate(node, resolveHandle(handles, d.inputNode ?? d.input ?? d.node), ctx)
    return
  }

  if (t === 'animAnimNode_GraphSlotInput') {
    // Engine: m_parentGraphLink->Update() — parent GraphSlot.inputLink pose path.
    markActive(nodes, node.HandleId)
    ctx.parentPoseUpdate?.()
    return
  }

  if (isGraphSlotType(t)) {
    const slotName = readCName(d.name)
    const inputLink = resolveHandle(handles, d.inputLink)
    const dontDeactivate = readBool(d.dontDeactivateInput)
    const parentPoseSample =
      inputLink && ctx.makeParentPoseSample
        ? ctx.makeParentPoseSample(inputLink)
        : undefined
    const nested =
      slotName && ctx.slotHost
        ? ctx.slotHost.stepNested(
            slotName,
            () => {
              followUpdate(node, inputLink, ctx)
            },
            parentPoseSample
          )
        : null

    if (nested) {
      markActive(nodes, node.HandleId, { alpha: 1 })
      // Engine: when dontDeactivateInput, also Update inputLink from the slot itself.
      if (dontDeactivate) followUpdate(node, inputLink, ctx)
      return
    }

    // No attached graph — passthrough inputLink (engine fallback).
    markActive(nodes, node.HandleId)
    followUpdate(node, inputLink, ctx)
    return
  }

  // Value sources / converters / math — badge shows current numeric value
  if (isFloatValueNodeType(t)) {
    walkFloatValueInputs(node, ctx)
    const v = readFloatSource(node, ctx, 0)
    markActive(nodes, node.HandleId, { weight: v, alpha: 1 })
    return
  }

  // Vector value sources — badge shows |xyz| length
  if (isVectorValueNodeType(t)) {
    walkFloatValueInputs(node, ctx)
    const v = readVectorSource(node, ctx, ZERO_VEC4)
    markActive(nodes, node.HandleId, { weight: vec4Mag3(v), alpha: 1 })
    return
  }

  // Transform value sources — badge shows translation length
  if (isTransformValueNodeType(t)) {
    walkFloatValueInputs(node, ctx)
    const qs = readTransformSource(node, ctx, IDENTITY_QS)
    markActive(nodes, node.HandleId, {
      weight: Math.hypot(qs.tx, qs.ty, qs.tz),
      alpha: 1,
    })
    return
  }

  if (isQuaternionValueNodeType(t)) {
    walkFloatValueInputs(node, ctx)
    markActive(nodes, node.HandleId, { alpha: 1 })
    return
  }

  if (t === 'animAnimNode_StateMachine') {
    let rt = ctx.runtimes.get(node.HandleId)
    if (!rt) {
      rt = new SimStateMachineRuntime(node.HandleId, readNumber(d.defaultStateIndex, 0))
      ctx.runtimes.set(node.HandleId, rt)
    }
    const states = Array.isArray(d.states) ? d.states : []

    // Engine OnUpdate: Update current state FIRST so AnimEnd/events feed CheckTransitions
    // same frame (animNode_StateMachine.cpp — "prevent one frame delay").
    if (!rt.isInTransition) {
      const pre = resolveHandle(handles, states[rt.activeStateIndex])
      if (pre) {
        tickClipClocksAlongPose(findStateOutput(pre, handles), ctx, new Set())
      }
    }

    updateStateMachine(node, rt, ctx.dt, board, handles, nodes, ctx.condCtx)

    const active = resolveHandle(handles, states[rt.activeStateIndex])
    if (active) {
      markActive(nodes, active.HandleId)
      const out = findStateOutput(active, handles)
      followUpdate(node, out, ctx)
    }
    if (rt.isInTransition && rt.targetStateIndex != null) {
      const target = resolveHandle(handles, states[rt.targetStateIndex])
      if (target) {
        markActive(nodes, target.HandleId)
        const out = findStateOutput(target, handles)
        followUpdate(node, out, ctx)
      }
    }
    // Explicit inactive: missing snapshot keys stay alpha 1 in overlay — SM
    // overview state nodes would never dim without this.
    states.forEach((ref, i) => {
      if (i === rt.activeStateIndex) return
      if (rt.isInTransition && i === rt.targetStateIndex) return
      const h = resolveHandle(handles, ref)
      if (!h) return
      markInactiveBranch(h, handles, nodes, new Set(), ctx.visited)
    })
    if (rt.firingTransitionHandleId) {
      const blendAlpha = evaluateSmTransitionBlendAlpha(
        node,
        rt,
        handles,
        rt.transitionProgress
      )
      markActive(nodes, rt.firingTransitionHandleId, {
        weight: blendAlpha,
        alpha: blendAlpha,
      })
    }
    for (const id of rt.eligibleTransitionIds) {
      markActive(nodes, id)
    }
    return
  }

  if (isAnimDatabaseType(t)) {
    // Update int input links first so values are current for lookup
    const links = Array.isArray(d.inputLinks) ? d.inputLinks : []
    for (const link of links) {
      const h = resolveHandle(handles, link)
      if (h) updateFromNode(h, ctx)
    }
    runAnimDatabaseClipClock(node, ctx)
    let weight = 0
    const clock = ctx.clipClocks.get(node.HandleId)
    if (clock && ctx.clipLibrary && ctx.clipLibrary.entryCount > 0) {
      const clip = ctx.clipLibrary.resolveClip(clock.animName, (n) =>
        board.isWrapperActive(n)
      )
      if (clip) {
        const front = readNumber(d.clipFront, 0)
        const endPad = readNumber(d.clipEnd, 0)
        const animEnd = Math.max(clip.duration - endPad, 0)
        const clipped = Math.max(animEnd - front, 0)
        weight = clipped > 1e-8 ? (clock.currTime - front) / clipped : 0
        weight = Math.max(0, Math.min(1, weight))
      }
    }
    markActive(nodes, node.HandleId, { weight, alpha: 1 })
    return
  }

  if (isSkOneShotAnimType(t)) {
    const shotW = runSkOneShotAnimClipClock(node, ctx)
    const input = resolveHandle(
      handles,
      d.Input ?? d.inputLink ?? d.input ?? d.InputLink
    )
    if (input) followUpdate(node, input, ctx)
    markActive(nodes, node.HandleId, { weight: shotW, alpha: 1 })
    return
  }

  if (isSkPhaseWithDurationType(t)) {
    const progress = runSkPhaseAnimClipClock(node, ctx, 'duration')
    markActive(nodes, node.HandleId, { weight: progress, alpha: 1 })
    return
  }

  if (isSkPhaseWithSpeedType(t)) {
    const progress = runSkPhaseAnimClipClock(node, ctx, 'speed')
    markActive(nodes, node.HandleId, { weight: progress, alpha: 1 })
    return
  }

  if (isSkPhaseAnimType(t)) {
    const progress = runSkPhaseAnimClipClock(node, ctx, 'phase')
    markActive(nodes, node.HandleId, { weight: progress, alpha: 1 })
    return
  }

  if (isSkSpeedAnimType(t)) {
    const progress = runSkSpeedAnimClipClock(node, ctx)
    markActive(nodes, node.HandleId, { weight: progress, alpha: 1 })
    return
  }

  if (isClipClockSkAnimType(t)) {
    let weight = 0
    const fields = readSkAnimClockFields(d as Record<string, unknown>)
    const clock = ensureClipClock(ctx.clipClocks, node.HandleId)
    if (ctx.clipLibrary && ctx.clipLibrary.entryCount > 0) {
      if (!clock.stepped) {
        advanceClipClock(
          clock,
          fields,
          ctx.dt,
          ctx.clipLibrary,
          board,
          (n) => board.isWrapperActive(n)
        )
      }
      const clip = ctx.clipLibrary.resolveClip(clock.animName, (n) =>
        board.isWrapperActive(n)
      )
      if (clip) {
        const front = readNumber(d.clipFront, 0)
        const endPad = readNumber(d.clipEnd, 0)
        const animEnd = Math.max(clip.duration - endPad, 0)
        const clipped = Math.max(animEnd - front, 0)
        weight = clipped > 1e-8 ? (clock.currTime - front) / clipped : 0
        weight = Math.max(0, Math.min(1, weight))
      }
    } else if (!clock.stepped) {
      clock.stepped = true
      clock.animName = fields.animation || 'None'
      clock.wasActive = true
    }
    markActive(nodes, node.HandleId, { weight, alpha: 1 })
    return
  }

  if (isSkDurationAnimType(t)) {
    const progress = runSkDurationAnimClipClock(node, ctx)
    markActive(nodes, node.HandleId, { weight: progress, alpha: 1 })
    return
  }

  // SkFrameAnimByTrack: Update inputWithTracks (tracks read at Sample) + link scrub.
  if (t === 'animAnimNode_SkFrameAnimByTrack') {
    followUpdate(node, resolveHandle(handles, d.inputWithTracks), ctx)
    const progress = runSkFrameAnimClipClock(node, ctx)
    markActive(nodes, node.HandleId, { weight: progress, alpha: 1 })
    return
  }

  if (t === 'animAnimNode_SkFrameAnim') {
    const progress = runSkFrameAnimClipClock(node, ctx)
    markActive(nodes, node.HandleId, { weight: progress, alpha: 1 })
    return
  }

  if (t === 'animAnimNode_State' || t === 'animAnimNode_StateFrozen') {
    const out = findStateOutput(node, handles)
    followUpdate(node, out, ctx)
    return
  }

  if (t === 'animAnimNode_Blend2') {
    const weightNode = resolveHandle(handles, d.weightNode)
    // Unset / unreadable weight → 0 (first input only). Never default to 0.5:
    // UI may show floatVars[name]??0 while board has no key → NaN → old 0.5 bug.
    let weight = 0
    if (weightNode) {
      updateFromNode(weightNode, ctx)
      const raw = readFloatSource(weightNode, ctx, 0)
      weight = blend2WeightFromInput(
        raw,
        readNumber(d.minInputValue, 0),
        readNumber(d.maxInputValue, 1)
      )
    }
    markActive(nodes, node.HandleId, { weight, alpha: weight })
    const first = resolveHandle(handles, d.firstInputNode)
    const second = resolveHandle(handles, d.secondInputNode)
    if (first) {
      if (weight < 1) followUpdate(node, first, ctx)
      else markInactiveBranch(first, handles, nodes, new Set(), ctx.visited)
    }
    if (second) {
      if (weight > 0) followUpdate(node, second, ctx)
      else markInactiveBranch(second, handles, nodes, new Set(), ctx.visited)
    }
    return
  }

  if (t === 'animAnimNode_BlendMultiple') {
    const weightNode = resolveHandle(handles, d.weightNode ?? d.input)
    if (weightNode) updateFromNode(weightNode, ctx)
    const { slots, select, inputWeight } = resolveBlendMultipleSelection(
      d as Record<string, unknown>,
      ctx
    )
    markActive(nodes, node.HandleId, { weight: inputWeight, alpha: select.alpha })
    slots.refs.forEach((ref, i) => {
      const h = resolveHandle(handles, ref)
      if (!h) return
      const activeFirst =
        i === select.firstIndex && blendMultipleFirstInputActive(select.alpha)
      const activeSecond =
        i === select.secondIndex && blendMultipleSecondInputActive(select.alpha)
      if (activeFirst || activeSecond) followUpdate(node, h, ctx)
      else markInactiveBranch(h, handles, nodes, new Set(), ctx.visited)
    })
    return
  }

  if (t === 'animAnimNode_Switch') {
    const weightNode = resolveHandle(handles, d.weightNode)
    let weight = 0
    if (weightNode) {
      updateFromNode(weightNode, ctx)
      weight = readFloatSource(weightNode, ctx, 0)
    }
    const inputs = Array.isArray(d.inputNodes) ? d.inputNodes : []
    const numInputs = readNumber(d.numInputs, inputs.length)
    const index = switchIndexFromWeight(weight, Math.max(numInputs, inputs.length))
    // Badge = selected input index (0-based), matching engine SelectInputs
    markActive(nodes, node.HandleId, { weight: index, alpha: 1 })
    inputs.forEach((ref, i) => {
      const h = resolveHandle(handles, ref)
      if (!h) return
      if (i === index) followUpdate(node, h, ctx)
      else markInactiveBranch(h, handles, nodes, new Set(), ctx.visited)
    })
    return
  }

  if (t === 'animAnimNode_StaticSwitch' || t === 'animAnimNode_RuntimeSwitch') {
    const cond = resolveHandle(handles, d.condition)
    if (cond) markActive(nodes, cond.HandleId)
    let useTrue: boolean
    if (t === 'animAnimNode_StaticSwitch') {
      useTrue =
        ctx.staticSwitchResults?.get(node.HandleId) ??
        checkStaticCondition(cond, board, {
          clipLibrary: ctx.clipLibrary,
          isWrapperActive: (n) => board.isWrapperActive(n),
        })
    } else {
      useTrue = checkRuntimeCondition(cond, board, {
        clipLibrary: ctx.clipLibrary,
        isWrapperActive: (n) => board.isWrapperActive(n),
      })
    }
    markActive(nodes, node.HandleId, { weight: useTrue ? 1 : 0, alpha: 1 })
    const trueIn = resolveHandle(handles, d.True ?? d.true)
    const falseIn = resolveHandle(handles, d.False ?? d.false)
    if (useTrue) {
      followUpdate(node, trueIn, ctx)
      if (falseIn) markInactiveBranch(falseIn, handles, nodes, new Set(), ctx.visited)
    } else {
      followUpdate(node, falseIn, ctx)
      if (trueIn) markInactiveBranch(trueIn, handles, nodes, new Set(), ctx.visited)
    }
    return
  }

  if (t === 'animAnimNode_BlendAdditive') {
    const weightNode = resolveHandle(handles, d.weightNode)
    let weight = 1
    if (weightNode) {
      updateFromNode(weightNode, ctx)
      weight = readFloatSource(weightNode, ctx, 1)
    }
    // bias/scale default 0/1 — same as engine CaclWeightFinalValue when unset
    const bias = readNumber(d.biasValue, 0)
    const scale = readNumber(d.scaleValue, 1)
    const alpha = (weight - bias) * scale
    markActive(nodes, node.HandleId, { weight: alpha, alpha: 1 })
    const base = resolveHandle(handles, d.inputNode)
    const additive = resolveHandle(handles, d.addedInputNode ?? d.additiveInputNode)
    // Base pose always updates (engine always LinkSafeUpdate inputNode)
    followUpdate(node, base, ctx)
    if (additive) {
      if (isBlendAdditiveInputActive(alpha)) followUpdate(node, additive, ctx)
      else markInactiveBranch(additive, handles, nodes, new Set(), ctx.visited)
    }
    return
  }

  if (t === 'animAnimNode_BlendOverride') {
    // animNode_BlendOverride.cpp OnUpdate:
    // always Update input + weight; clamp control 0..1; Update override if > 0.01.
    const weightNode = resolveHandle(handles, d.weightNode)
    if (weightNode) updateFromNode(weightNode, ctx)
    const raw = weightNode ? readFloatSource(weightNode, ctx, 0) : 0
    const weight = Math.min(1, Math.max(0, Number.isFinite(raw) ? raw : 0))
    markActive(nodes, node.HandleId, { weight, alpha: weight })
    const base = resolveHandle(handles, d.inputNode)
    const overrideIn = resolveHandle(handles, d.overrideInputNode)
    followUpdate(node, base, ctx)
    if (overrideIn) {
      if (blendOverrideInputActive(weight)) followUpdate(node, overrideIn, ctx)
      else markInactiveBranch(overrideIn, handles, nodes, new Set(), ctx.visited)
    }
    return
  }

  if (t === 'animAnimNode_BlendByMaskDynamic') {
    // animNode_BlendOverride.cpp OnUpdate: always Update base + weight;
    // GetValue mask (default -1) / weight (default 0, clamped 0..1);
    // Update blend only if weight > 0.01 and mask index in masks[].
    const weightNode = resolveHandle(handles, d.weight)
    const maskNode = resolveHandle(handles, d.mask)
    if (weightNode) updateFromNode(weightNode, ctx)
    if (maskNode) updateFromNode(maskNode, ctx)

    const rawWeight = weightNode ? readFloatSource(weightNode, ctx, 0) : 0
    const weight = Math.min(1, Math.max(0, rawWeight))
    const rawMask = maskNode ? readFloatSource(maskNode, ctx, -1) : -1
    const maskIndex = Number.isFinite(rawMask) ? Math.trunc(rawMask) : -1
    const masksCount = Array.isArray(d.masks) ? d.masks.length : 0
    const blendActive = blendByMaskDynamicBlendActive(weight, maskIndex, masksCount)

    markActive(nodes, node.HandleId, { weight, alpha: maskIndex })
    const base = resolveHandle(handles, d.base)
    const blend = resolveHandle(handles, d.blend)
    followUpdate(node, base, ctx)
    if (blend) {
      if (blendActive) followUpdate(node, blend, ctx)
      else markInactiveBranch(blend, handles, nodes, new Set(), ctx.visited)
    }
    return
  }

  // --- Procedural bone ops (pose child + value links → boneOpCache) ---
  if (
    t === 'animAnimNode_SetBoneTransform' ||
    t === 'animAnimNode_SetDrivenKey' ||
    t === 'animAnimNode_AdditionalTransform' ||
    t === 'animAnimNode_ParentTransform' ||
    t === 'animAnimNode_TranslationLimit'
  ) {
    followUpdate(node, resolvePoseInputLink(handles, d), ctx)
    return
  }

  if (t === 'animAnimNode_ParentConstraint') {
    followUpdate(node, resolvePoseInputLink(handles, d), ctx)
    const wNode = resolveHandle(handles, d.weightNode)
    const offT = resolveHandle(handles, d.offsetTranslationLS)
    const offE = resolveHandle(handles, d.offsetEulerRotationLS)
    if (wNode) updateFromNode(wNode, ctx)
    if (offT) updateFromNode(offT, ctx)
    if (offE) updateFromNode(offE, ctx)

    const staticW = readNumber(d.weight, 1)
    const weight = wNode ? readFloatSource(wNode, ctx, staticW) : staticW
    const snap = {
      weight,
      hasOffsetT: !!offT,
      offsetT: { x: 0, y: 0, z: 0 },
      hasOffsetE: !!offE,
      offsetE: { x: 0, y: 0, z: 0 },
    }
    if (offT) {
      const v = readVectorSource(offT, ctx, ZERO_VEC4)
      snap.offsetT = { x: v.x, y: v.y, z: v.z }
    }
    if (offE) {
      const v = readVectorSource(offE, ctx, ZERO_VEC4)
      snap.offsetE = { x: v.x, y: v.y, z: v.z }
    }
    ctx.boneOpCache.parentConstraint.set(node.HandleId, snap)
    markActive(nodes, node.HandleId, { weight, alpha: 1 })
    return
  }

  if (
    t === 'animAnimNode_FloatTrackDirectConnConstraint' ||
    t === 'animAnimNode_TransformToTrack'
  ) {
    followUpdate(node, resolvePoseInputLink(handles, d), ctx)
    const wNode = resolveHandle(handles, d.weightNode)
    const mNode = resolveHandle(handles, d.mulFactorNode)
    if (wNode) updateFromNode(wNode, ctx)
    if (mNode) updateFromNode(mNode, ctx)
    const staticW = readNumber(d.weight, 1)
    const staticM = readNumber(d.mulFactor, 1)
    const weight = wNode ? readFloatSource(wNode, ctx, staticW) : staticW
    const mulFactor = mNode ? readFloatSource(mNode, ctx, staticM) : staticM
    ctx.boneOpCache.floatTrackConn.set(node.HandleId, { weight, mulFactor })
    markActive(nodes, node.HandleId, { weight, alpha: 1 })
    return
  }

  if (
    t === 'animAnimNode_OrientConstraint' ||
    t === 'animAnimNode_PointConstraint' ||
    t === 'animAnimNode_MultipleParentConstraint' ||
    t === 'animAnimNode_AimConstraint' ||
    t === 'animAnimNode_AimConstraint_ObjectUp' ||
    t === 'animAnimNode_AimConstraint_ObjectRotationUp'
  ) {
    followUpdate(node, resolvePoseInputLink(handles, d), ctx)
    markActive(nodes, node.HandleId, { weight: readNumber(d.weight, 1), alpha: 1 })
    return
  }

  if (t === 'animAnimNode_SetBonePosition') {
    followUpdate(node, resolvePoseInputLink(handles, d), ctx)
    const posNode = resolveHandle(handles, d.positionMs)
    if (posNode) updateFromNode(posNode, ctx)
    const v = posNode ? readVectorSource(posNode, ctx) : ZERO_VEC4
    ctx.boneOpCache.positionMs.set(node.HandleId, { x: v.x, y: v.y, z: v.z })
    return
  }

  if (t === 'animAnimNode_SetBoneOrientation') {
    followUpdate(node, resolvePoseInputLink(handles, d), ctx)
    const oriNode = resolveHandle(handles, d.orientationMs)
    if (oriNode) updateFromNode(oriNode, ctx)
    const q = oriNode ? readQuatSource(oriNode, ctx) : IDENTITY_QUAT_STATE
    ctx.boneOpCache.orientationMs.set(node.HandleId, { ...q })
    return
  }

  // Engine AnimNode_TransformRotator — accumulate angle, Sample multiplies LS by axis-angle.
  if (t === 'animAnimNode_TransformRotator') {
    followUpdate(node, resolvePoseInputLink(handles, d), ctx)
    const valueNode = resolveHandle(handles, d.angleValueNode)
    const speedNode = resolveHandle(handles, d.angleSpeedNode)
    if (valueNode) updateFromNode(valueNode, ctx)
    if (speedNode) updateFromNode(speedNode, ctx)

    const valueScale = readNumber(d.valueScale, 1)
    const doClamp = readBool(d.clamp)
    const angleMin = readNumber(d.angleMin, -180)
    const angleMax = readNumber(d.angleMax, 180)

    let state = ctx.boneRotateDyn.get(node.HandleId)
    if (!state) {
      state = { angleDeg: 0 }
      ctx.boneRotateDyn.set(node.HandleId, state)
    }

    let newAngle = state.angleDeg
    if (valueNode) newAngle += readFloatSource(valueNode, ctx, 0) * valueScale
    if (speedNode) newAngle += readFloatSource(speedNode, ctx, 0) * valueScale * ctx.dt

    while (newAngle < -180) newAngle += 360
    while (newAngle > 180) newAngle -= 360
    if (doClamp) newAngle = Math.min(angleMax, Math.max(angleMin, newAngle))

    state.angleDeg = newAngle
    ctx.boneOpCache.rotateAngleDeg.set(node.HandleId, newAngle)
    markActive(nodes, node.HandleId, { weight: newAngle, alpha: 1 })
    return
  }

  // FloatTrackModifier(+MarkUnstable) — Sample mutates tracks; Update walks pose/float links.
  if (
    t === 'animAnimNode_FloatTrackModifier' ||
    t === 'animAnimNode_FloatTrackModifierMarkUnstable'
  ) {
    const poseIn = resolveHandle(handles, d.poseInputNode) ?? resolvePoseInputLink(handles, d)
    followUpdate(node, poseIn, ctx)
    const fIn = resolveHandle(handles, d.floatInputNode)
    if (fIn) updateFromNode(fIn, ctx)
    // Reuse floatTrackConn.weight as Sample secondArgument when inputFloatTrack missing.
    const floatVal = fIn ? readFloatSource(fIn, ctx, 0) : 0
    ctx.boneOpCache.floatTrackConn.set(node.HandleId, { weight: floatVal, mulFactor: 1 })
    markActive(nodes, node.HandleId, { weight: floatVal, alpha: 1 })
    return
  }

  // AdditionalFloatTrack — PoseLink + local i_time for curve Sample.
  if (t === 'animAnimNode_AdditionalFloatTrack') {
    const poseIn = resolveHandle(handles, d.poseInputNode) ?? resolvePoseInputLink(handles, d)
    followUpdate(node, poseIn, ctx)
    const prev = ctx.additionalFloatTrackTimes.get(node.HandleId) ?? 0
    ctx.additionalFloatTrackTimes.set(node.HandleId, prev + ctx.dt)
    markActive(nodes, node.HandleId, { alpha: 1 })
    return
  }

  if (t === 'animAnimNode_RotateBone') {
    followUpdate(node, resolvePoseInputLink(handles, d), ctx)
    const angleNode = resolveHandle(handles, d.angleNode)
    const minNode = resolveHandle(handles, d.minValueNode)
    const maxNode = resolveHandle(handles, d.maxValueNode)
    if (angleNode) updateFromNode(angleNode, ctx)
    if (minNode) updateFromNode(minNode, ctx)
    if (maxNode) updateFromNode(maxNode, ctx)

    const scale = readNumber(d.scale, 1)
    const biasAngle = readNumber(d.biasAngle, 0)
    const useIncremental = readBool(d.useIncrementalMode)
    const resetOnAct = d.resetOnActivation === undefined ? true : readBool(d.resetOnActivation)
    const clampRotation = readBool(d.clampRotation)
    let minAngle = readNumber(d.minAngle, -90)
    let maxAngle = readNumber(d.maxAngle, 90)
    if (minNode) minAngle = readFloatSource(minNode, ctx, minAngle)
    if (maxNode) maxAngle = readFloatSource(maxNode, ctx, maxAngle)

    let state = ctx.boneRotateDyn.get(node.HandleId)
    if (!state) {
      state = { angleDeg: biasAngle }
      ctx.boneRotateDyn.set(node.HandleId, state)
    } else if (resetOnAct && !wasBoneOpActive(ctx, node.HandleId)) {
      state.angleDeg = biasAngle
    }

    if (angleNode) {
      const angle = readFloatSource(angleNode, ctx, 0)
      if (useIncremental) state.angleDeg += angle * scale * ctx.dt
      else state.angleDeg = angle * scale + biasAngle
    } else {
      state.angleDeg = biasAngle
    }

    if (clampRotation) {
      state.angleDeg = Math.min(maxAngle, Math.max(minAngle, state.angleDeg))
    } else {
      state.angleDeg = state.angleDeg % 360
      if (state.angleDeg < 0) state.angleDeg += 360
    }

    ctx.boneOpCache.rotateAngleDeg.set(node.HandleId, state.angleDeg)
    markActive(nodes, node.HandleId, { weight: state.angleDeg })
    return
  }

  if (t === 'animAnimNode_RotateBoneByQuaternion') {
    followUpdate(node, resolvePoseInputLink(handles, d), ctx)
    const quatNode = resolveHandle(handles, d.quaternionNode)
    if (quatNode) updateFromNode(quatNode, ctx)
    const useIncremental = readBool(d.useIncrementalMode)
    const resetOnAct = d.resetOnActivation === undefined ? true : readBool(d.resetOnActivation)

    let state = ctx.boneQuatDyn.get(node.HandleId)
    if (!state) {
      state = { ...IDENTITY_QUAT_STATE }
      ctx.boneQuatDyn.set(node.HandleId, state)
    } else if (resetOnAct && !wasBoneOpActive(ctx, node.HandleId)) {
      state.x = 0
      state.y = 0
      state.z = 0
      state.w = 1
    }

    if (quatNode) {
      const value = readQuatSource(quatNode, ctx)
      if (useIncremental) {
        const step = nlerpQuatState(IDENTITY_QUAT_STATE, value, Math.min(1, Math.max(0, ctx.dt)))
        const next = mulQuatState(state, step)
        state.x = next.x
        state.y = next.y
        state.z = next.z
        state.w = next.w
      } else {
        state.x = value.x
        state.y = value.y
        state.z = value.z
        state.w = value.w
      }
    } else {
      state.x = 0
      state.y = 0
      state.z = 0
      state.w = 1
    }

    ctx.boneOpCache.rotateQuat.set(node.HandleId, { ...state })
    return
  }

  if (t === 'animAnimNode_TranslateBone') {
    followUpdate(node, resolvePoseInputLink(handles, d), ctx)
    const transNode = resolveHandle(handles, d.inputTranslation)
    if (transNode) updateFromNode(transNode, ctx)
    const scale = readVector4(d.scale, { x: 1, y: 1, z: 1, w: 1 })
    const bias = readVector4(d.biasValue, { x: 0, y: 0, z: 0, w: 0 })
    const useIncremental = readBool(d.useIncrementalMode)
    const resetOnAct = d.resetOnActivation === undefined ? true : readBool(d.resetOnActivation)

    let state = ctx.boneTranslateDyn.get(node.HandleId)
    if (!state) {
      state = { x: bias.x, y: bias.y, z: bias.z }
      ctx.boneTranslateDyn.set(node.HandleId, state)
    } else if (resetOnAct && !wasBoneOpActive(ctx, node.HandleId)) {
      state.x = bias.x
      state.y = bias.y
      state.z = bias.z
    }

    if (transNode) {
      const v = readVectorSource(transNode, ctx)
      if (useIncremental) {
        state.x += v.x * scale.x * ctx.dt
        state.y += v.y * scale.y * ctx.dt
        state.z += v.z * scale.z * ctx.dt
      } else {
        state.x = v.x * scale.x + bias.x
        state.y = v.y * scale.y + bias.y
        state.z = v.z * scale.z + bias.z
      }
    } else {
      state.x = bias.x
      state.y = bias.y
      state.z = bias.z
    }

    ctx.boneOpCache.translate.set(node.HandleId, { ...state })
    return
  }

  if (t === 'animAnimNode_RotationLimit') {
    followUpdate(node, resolvePoseInputLink(handles, d), ctx)
    const useEyes = readBool(d.useEyesLookAtBlendWeight)
    let weight = 1
    if (!useEyes) {
      const wNode = resolveHandle(handles, d.weightLink)
      if (wNode) {
        updateFromNode(wNode, ctx)
        weight = Math.min(1, Math.max(0, readFloatSource(wNode, ctx, 1)))
      }
    }
    ctx.boneOpCache.limitWeight.set(node.HandleId, weight)
    markActive(nodes, node.HandleId, { weight })
    return
  }

  if (t === 'animAnimNode_MathExpressionPose') {
    followUpdate(node, resolvePoseInputLink(handles, d), ctx)
    const exprData =
      d.expressionData && typeof d.expressionData === 'object'
        ? (d.expressionData as Record<string, unknown>)
        : null
    const floatSockets = Array.isArray(exprData?.floatSockets) ? exprData.floatSockets : []
    const vectorSockets = Array.isArray(exprData?.vectorSockets) ? exprData.vectorSockets : []
    const quatSockets = Array.isArray(exprData?.quaternionSockets)
      ? exprData.quaternionSockets
      : []
    const floatSnaps: MathExprPoseFloatSocketSnap[] = []
    for (let i = 0; i < floatSockets.length; i++) {
      const sock = floatSockets[i] as Record<string, unknown> | null
      if (!sock || typeof sock !== 'object') continue
      const link = resolveHandle(handles, sock.link ?? sock)
      if (link) updateFromNode(link, ctx)
      const trackRaw = sock.inputFloatTrack
      const trackObj =
        trackRaw && typeof trackRaw === 'object'
          ? (trackRaw as Record<string, unknown>)
          : null
      const trackName = readCName(trackObj?.name ?? trackRaw)
      floatSnaps.push({
        varId: readNumber(sock.expressionVarId, i),
        variableName: readCName(sock.variableName),
        inputTrackName: trackName === 'None' ? '' : trackName,
        linkValue: link ? readFloatSource(link, ctx, 0) : 0,
      })
    }
    const vectorSnaps: MathExprPoseVectorSocketSnap[] = []
    for (let i = 0; i < vectorSockets.length; i++) {
      const sock = vectorSockets[i] as Record<string, unknown> | null
      if (!sock || typeof sock !== 'object') continue
      const link = resolveHandle(handles, sock.link ?? sock)
      if (link) updateFromNode(link, ctx)
      const v = link ? readVectorSource(link, ctx, ZERO_VEC4) : ZERO_VEC4
      vectorSnaps.push({
        varId: readNumber(sock.expressionVarId, i),
        variableName: readCName(sock.variableName),
        linkValue: { x: v.x, y: v.y, z: v.z, w: v.w },
      })
    }
    const quatSnaps: MathExprPoseQuatSocketSnap[] = []
    for (let i = 0; i < quatSockets.length; i++) {
      const sock = quatSockets[i] as Record<string, unknown> | null
      if (!sock || typeof sock !== 'object') continue
      const link = resolveHandle(handles, sock.link ?? sock)
      if (link) updateFromNode(link, ctx)
      const q = link ? readQuatSource(link, ctx) : IDENTITY_QUAT_STATE
      quatSnaps.push({
        varId: readNumber(sock.expressionVarId, i),
        variableName: readCName(sock.variableName),
        linkValue: { x: q.x, y: q.y, z: q.z, w: q.w },
      })
    }
    ctx.mathExprPoseCache.floatSockets.set(node.HandleId, floatSnaps)
    ctx.mathExprPoseCache.vectorSockets.set(node.HandleId, vectorSnaps)
    ctx.mathExprPoseCache.quatSockets.set(node.HandleId, quatSnaps)
    return
  }

  // Generic pose/value links — follow diagram pins; record only succ targets.
  forEachLinkedInput(node, handles, (linked) => {
    if (linked && isUpdateSuccTarget(linked)) followUpdate(node, linked, ctx)
    else updateFromNode(linked, ctx)
  })
}

export class SimGraphRunner {
  /** Set by host when runner is created for a diagram. */
  diagramId = ''
  private runtimes = new Map<string, SimStateMachineRuntime>()
  private handles: Map<string, AnimgraphNode> = new Map()
  private originalAnimgraph: RenderData['originalAnimgraph'] | null = null
  /** Previous step node overlay — used to emit nodeDelta. */
  private prevNodes: Record<string, SimNodeState> | null = null
  /** Per-handle damp / spring / latch state (cleared on bind/reset / deactivate). */
  private floatDyn = new Map<string, FloatDynState>()
  /** VectorLatch / DampVector state. */
  private vectorDyn = new Map<string, SimVec4>()
  private transformDyn = new Map<string, Qs>()
  private randomDyn = new Map<string, FloatRandomState>()
  private sinusDyn = new Map<string, FloatSinusState>()
  /** Per-handle Signal latch / blend (cleared like floatDyn). */
  private signalDyn = new Map<string, SignalDynState>()
  /** Incremental bone-op state (Rotate/Translate); cleared on bind/reset. */
  private boneRotateDyn = new Map<string, BoneOpRotateState>()
  private boneQuatDyn = new Map<string, BoneOpQuatState>()
  private boneTranslateDyn = new Map<string, BoneOpTranslateState>()
  private boneOpCache = createBoneOpFrameCache()
  private mathExprPoseCache = createMathExprPoseFrameCache()
  /** Optional parent-transform MS map for ParentTransform Sample. */
  parentTransforms = new Map<string, Qs>()
  /** Join pose cache (engine diamond re-sample); poses reused, sampled cleared per Sample. */
  private joinPoseCache = {
    sampled: new Set<string>(),
    poses: new Map<string, Pose>(),
  }
  /** Anim setup / clip index for HasAnimation + SkAnim clock. */
  private clipLibrary: ClipLibrary | null = null
  /** Glb pose clips for Sample. */
  private clipPoseLibrary: ClipPoseLibrary | null = null
  /** Active rig (from RigLibrary.getActive). */
  private activeRig: RigEntry | null = null
  /** Bone names to copy into poseStats.inspect each frame. */
  poseInspectBones: string[] = []
  /**
   * When true, Sample appends diagnostics (null-pose Blend2, …) into poseStats.warnings.
   * Off by default — lastWrittenNull bookkeeping skipped.
   */
  sampleWarningsEnabled = false
  /**
   * Handles whose full pose is snapshotted during Sample (at that node).
   * Selection registers any node — inspect/stack HUD use the capture.
   */
  stackCaptureHandleIds = new Set<string>()
  private sampleOut: Pose | null = null
  private poseScratch: PoseScratchPool | null = null
  /** Update-traversal successors for Sample (cleared each step). */
  private updateSucc = new Map<string, string[]>()
  /** Transform stack capacity from Extender scan at bind. */
  private stackCapacity = DEFAULT_STACK_CAPACITY
  /** Track stack capacity from StackTracksExtender scan at bind. */
  private trackStackCapacity = DEFAULT_STACK_CAPACITY
  /** Transform Shrinker handleId → remove count (tag pairing). */
  private shrinkRemoveCountByHandleId = new Map<string, number>()
  /** Track Shrinker handleId → remove count. */
  private trackShrinkRemoveCountByHandleId = new Map<string, number>()
  /** Pooled full-pose snapshots for capture handles. */
  private capturedPoses = new Map<string, Pose>()
  /** Handles captured this Sample pass. */
  private capturedPoseThisFrame = new Set<string>()
  /** Loaded motion databases for AnimDatabase nodes. */
  private animDbLibrary: AnimDatabaseLibrary | null = null
  /** Per-SkAnim playback clocks */
  private clipClocks = new Map<string, ClipClockState>()
  /** AdditionalFloatTrack i_time (cleared when node leaves active Update path). */
  private additionalFloatTrackTimes = new Map<string, number>()
  /** MathExpression compile cache (idents + scalar/mixed); cleared on bind/reset. */
  private mathExprCache: MathExprCompileCache = new Map()
  /**
   * Per-graph Timed / ModifiedFloat dyn (engine instance buffer).
   * Not on SimInputBoard — HandleIds collide across nested graphs.
   */
  private conditionDyn = new SimConditionDyn()
  /** StaticSwitch Init cache — recomputed when dirty (bind/reset/clipLibrary). */
  private staticSwitchResults = new Map<string, boolean>()
  private staticSwitchDirty = true

  setClipLibrary(library: ClipLibrary | null): void {
    this.clipLibrary = library
    this.staticSwitchDirty = true
  }

  setClipPoseLibrary(library: ClipPoseLibrary | null): void {
    this.clipPoseLibrary = library
  }

  setActiveRig(rig: RigEntry | null): void {
    if (!rig) {
      this.activeRig = null
      this.sampleOut = null
      this.poseScratch = null
      return
    }
    // Same rig + live buffers → keep sampleOut (ensureRunner used to wipe nested poses).
    if (
      this.activeRig === rig &&
      this.sampleOut &&
      this.poseScratch &&
      this.sampleOut.boneCount === rig.boneNames.length &&
      this.sampleOut.stackCapacity === this.stackCapacity &&
      this.sampleOut.trackStackCapacity === this.trackStackCapacity
    ) {
      return
    }
    this.activeRig = rig
    this.reallocSampleBuffers()
  }

  private reallocSampleBuffers(): void {
    const rig = this.activeRig
    if (!rig) return
    const buf = allocSampleScratch(rig, this.stackCapacity, this.trackStackCapacity)
    this.sampleOut = buf.out
    this.poseScratch = buf.poseScratch
  }

  /** Whether this graph owns a handle (for capture / debug scoping). */
  hasHandle(handleId: string): boolean {
    return this.handles.has(handleId.trim())
  }

  /** Latest sampled pose (pooled) — not for reactive Vue binding. */
  getSampledPose(): Pose | null {
    return this.sampleOut
  }

  /**
   * Full pose snapshotted at a capture handle this Sample frame.
   * Not for reactive Vue binding.
   */
  getCapturedPose(handleId: string): Pose | null {
    if (!handleId || !this.capturedPoseThisFrame.has(handleId)) return null
    return this.capturedPoses.get(handleId) ?? null
  }

  /** Active rig used for Sample buffers (pooled reference). */
  getActiveRig(): RigEntry | null {
    return this.activeRig
  }

  /** Bind-time shrink remove count for a Shrinker handle (HUD). */
  getShrinkRemoveCount(handleId: string): number {
    return this.shrinkRemoveCountByHandleId.get(handleId) ?? 0
  }

  /** Register handles whose full pose is snapshotted at Sample (replaces set). */
  setStackCaptureHandleIds(ids: Iterable<string>): void {
    this.stackCaptureHandleIds.clear()
    for (const id of ids) {
      const s = typeof id === 'string' ? id.trim() : ''
      if (s) this.stackCaptureHandleIds.add(s)
    }
    for (const key of [...this.capturedPoses.keys()]) {
      if (!this.stackCaptureHandleIds.has(key)) this.capturedPoses.delete(key)
    }
  }

  private ensureCapturePose(handleId: string): Pose | null {
    const rig = this.activeRig
    if (!rig) return null
    let pose = this.capturedPoses.get(handleId)
    if (
      !pose ||
      pose.boneCount !== rig.boneNames.length ||
      pose.stackCapacity !== this.stackCapacity
    ) {
      pose = createPose(
        rig.boneNames.length,
        rig.trackNames.length,
        this.stackCapacity,
        this.trackStackCapacity
      )
      this.capturedPoses.set(handleId, pose)
    }
    return pose
  }

  private beginPoseCaptures(): void {
    this.capturedPoseThisFrame.clear()
  }

  private capturePoseFromSample(handleId: string, pose: Pose): void {
    const dest = this.ensureCapturePose(handleId)
    if (!dest) return
    copyPose(dest, pose)
    this.capturedPoseThisFrame.add(handleId)
  }

  /** Prefer captured pose for a registered handle; else final sampleOut. */
  private resolveHudPose(): { pose: Pose; handleId: string | null } | null {
    if (!this.sampleOut) return null
    for (const id of this.stackCaptureHandleIds) {
      if (!this.capturedPoseThisFrame.has(id)) continue
      const captured = this.capturedPoses.get(id)
      if (captured) return { pose: captured, handleId: id }
    }
    return { pose: this.sampleOut, handleId: null }
  }

  private buildStackStats(
    pose: Pose
  ): NonNullable<SimSnapshot['poseStats']>['stack'] | undefined {
    if (pose.stackCount <= 0) return undefined
    const names: string[] = []
    const bones: Record<string, NonNullable<ReturnType<typeof readStackBoneTrs>>> = {}
    for (let i = 0; i < pose.stackCount; i++) {
      const n = pose.stackNames[i] || `stack_${i}`
      names.push(n)
      const trs = readStackBoneTrs(pose, i)
      if (trs) bones[n] = trs
    }
    return { count: pose.stackCount, names, bones }
  }

  private buildTrackStackStats(
    pose: Pose
  ): NonNullable<SimSnapshot['poseStats']>['trackStack'] | undefined {
    if (pose.trackStackCount <= 0) return undefined
    const names: string[] = []
    const values: Record<string, number> = {}
    for (let i = 0; i < pose.trackStackCount; i++) {
      const n = pose.trackStackNames[i] || `track_stack_${i}`
      names.push(n)
      values[n] = pose.trackStackValues[i] ?? 0
    }
    return { count: pose.trackStackCount, names, values }
  }

  private readNamedTrs(pose: Pose, boneName: string): ReturnType<typeof readBoneTrs> {
    const rig = this.activeRig
    if (!rig) return null
    const key = boneName.toLowerCase()
    const idx = rig.boneIndexByName.get(key)
    if (idx !== undefined) return readBoneTrs(pose, idx)
    for (let si = 0; si < pose.stackCount; si++) {
      if ((pose.stackNames[si] ?? '').toLowerCase() !== key) continue
      return readStackBoneTrs(pose, si)
    }
    return null
  }

  /** Force StaticSwitch Init re-eval (entity tags / HasAnimation context changed). */
  invalidateStaticSwitches(): void {
    this.staticSwitchDirty = true
  }

  setAnimDatabaseLibrary(library: AnimDatabaseLibrary | null): void {
    this.animDbLibrary = library
  }

  bind(graphData: RenderData | null): void {
    this.handles = graphData?.handlesRegistry ?? new Map()
    this.originalAnimgraph = graphData?.originalAnimgraph ?? null
    this.runtimes.clear()
    this.floatDyn.clear()
    this.vectorDyn.clear()
    this.transformDyn.clear()
    this.randomDyn.clear()
    this.sinusDyn.clear()
    this.signalDyn.clear()
    this.boneRotateDyn.clear()
    this.boneQuatDyn.clear()
    this.boneTranslateDyn.clear()
    clearBoneOpFrameCache(this.boneOpCache)
    clearMathExprPoseFrameCache(this.mathExprPoseCache)
    this.parentTransforms.clear()
    this.joinPoseCache.sampled.clear()
    this.joinPoseCache.poses.clear()
    this.clipClocks.clear()
    this.additionalFloatTrackTimes.clear()
    this.mathExprCache.clear()
    this.conditionDyn.clear()
    this.staticSwitchResults.clear()
    this.staticSwitchDirty = true
    this.prevNodes = null
    this.capturedPoses.clear()
    this.capturedPoseThisFrame.clear()
    const pairing = buildStackPairing(this.handles)
    this.shrinkRemoveCountByHandleId = pairing.shrinkRemoveCountByHandleId
    this.trackShrinkRemoveCountByHandleId = pairing.trackShrinkRemoveCountByHandleId
    this.stackCapacity = pairing.suggestedStackCapacity
    this.trackStackCapacity = pairing.suggestedTrackStackCapacity
    if (this.activeRig) this.reallocSampleBuffers()
    for (const sm of findStateMachineHandles(this.handles)) {
      const def = readNumber(sm.Data?.defaultStateIndex, 0)
      this.runtimes.set(sm.HandleId, new SimStateMachineRuntime(sm.HandleId, def))
    }
  }

  reset(): void {
    this.prevNodes = null
    this.floatDyn.clear()
    this.vectorDyn.clear()
    this.transformDyn.clear()
    this.randomDyn.clear()
    this.sinusDyn.clear()
    this.signalDyn.clear()
    this.boneRotateDyn.clear()
    this.boneQuatDyn.clear()
    this.boneTranslateDyn.clear()
    clearBoneOpFrameCache(this.boneOpCache)
    clearMathExprPoseFrameCache(this.mathExprPoseCache)
    this.parentTransforms.clear()
    this.joinPoseCache.sampled.clear()
    this.joinPoseCache.poses.clear()
    this.clipClocks.clear()
    this.additionalFloatTrackTimes.clear()
    this.mathExprCache.clear()
    this.conditionDyn.clear()
    this.staticSwitchResults.clear()
    this.staticSwitchDirty = true
    for (const sm of findStateMachineHandles(this.handles)) {
      const rt = this.runtimes.get(sm.HandleId)
      const def = readNumber(sm.Data?.defaultStateIndex, 0)
      if (rt) rt.reset(def)
      else this.runtimes.set(sm.HandleId, new SimStateMachineRuntime(sm.HandleId, def))
    }
  }

  private recomputeStaticSwitches(board: SimInputBoard): void {
    this.staticSwitchResults.clear()
    for (const h of this.handles.values()) {
      if (handleType(h) !== 'animAnimNode_StaticSwitch') continue
      const cond = resolveHandle(this.handles, h.Data?.condition)
      this.staticSwitchResults.set(
        h.HandleId,
        checkStaticCondition(cond, board, {
          clipLibrary: this.clipLibrary,
          isWrapperActive: (n) => board.isWrapperActive(n),
        })
      )
    }
    this.staticSwitchDirty = false
  }

  private buildCondCtx(board: SimInputBoard): CheckConditionCtx {
    const ctx: CheckConditionCtx = { conditionDyn: this.conditionDyn }
    const lib = this.clipLibrary
    if (lib && lib.entryCount > 0) {
      ctx.hasAnimation = (animationName: string) =>
        lib.hasAnimation(animationName, (n) => board.isWrapperActive(n))
    }
    return ctx
  }

  step(
    dt: number,
    board: SimInputBoard,
    time: number,
    playing: boolean,
    speed: number,
    options?: SimStepOptions
  ): SimSnapshot {
    const endBoardFrame = options?.endBoardFrame !== false
    const nodes: Record<string, SimNodeState> = {}
    this.conditionDyn.beginStep()
    beginClipClockStep(this.clipClocks)
    // Captures may happen during nested parentPoseSample (Update) and Root Sample —
    // clear once at frame start so mid-step captures are not wiped before Root Sample.
    this.beginPoseCaptures()
    if (this.staticSwitchDirty) this.recomputeStaticSwitches(board)
    const floatUpdated = new Set<string>()
    const signalUpdated = new Set<string>()
    const condCtx = { ...this.buildCondCtx(board), dt }
    const sampleLog = createSimSampleLog(`diagram=${this.diagramId || '?'}`)
    const sampleVisitedAll = sampleLog ? new Set<string>() : undefined
    const sampleWarnings: SimSampleWarning[] | undefined = this.sampleWarningsEnabled
      ? []
      : undefined
    this.updateSucc.clear()
    clearBoneOpFrameCache(this.boneOpCache)
    clearMathExprPoseFrameCache(this.mathExprPoseCache)
    if (sampleLog) {
      const caps = [...this.stackCaptureHandleIds]
      const known = caps.filter((id) => this.hasHandle(id))
      simSampleLogLine(
        sampleLog,
        `begin diagram=${this.diagramId || '?'} captures=[${caps.join(',')}] knownInGraph=[${known.join(',')}] slotHost=${options?.slotHost ? 1 : 0}`
      )
    }

    const makeParentPoseSample = (inputLink: AnimgraphNode) => (out: Pose): boolean => {
      const rig = this.activeRig
      const poseScratch = this.poseScratch
      if (!rig || !this.clipPoseLibrary || !poseScratch) {
        return false
      }
      simSampleLogLine(
        sampleLog,
        `parentPoseSample inputLink=${inputLink.HandleId}`
      )
      return samplePoseFromNode(
        inputLink,
        {
          handles: this.handles,
          board,
          nodes,
          clipClocks: this.clipClocks,
          clipPoseLibrary: this.clipPoseLibrary,
          clipLibrary: this.clipLibrary,
          rig,
          staticSwitchResults: this.staticSwitchResults,
          runtimes: this.runtimes,
          sampleNested: (slotName) => options?.slotHost?.getNestedPose(slotName) ?? null,
          parentPoseSample: options?.parentPoseSample,
          shrinkRemoveCountByHandleId: this.shrinkRemoveCountByHandleId,
          trackShrinkRemoveCountByHandleId: this.trackShrinkRemoveCountByHandleId,
          stackCaptureHandleIds: this.stackCaptureHandleIds,
          captureStack: (handleId, pose) => this.capturePoseFromSample(handleId, pose),
          poseScratch,
          sampleLog,
          sampleVisitedAll,
          updateSucc: this.updateSucc,
          warningsEnabled: this.sampleWarningsEnabled,
          warnings: sampleWarnings,
          lastWrittenNull: false,
          boneOpCache: this.boneOpCache,
          additionalFloatTrackTimes: this.additionalFloatTrackTimes,
          mathExprCache: this.mathExprCache,
          mathExprPoseCache: this.mathExprPoseCache,
          parentTransforms: this.parentTransforms,
          joinPoseCache: this.joinPoseCache,
        },
        out
      )
    }

    const walkBase: Omit<WalkCtx, 'nodes' | 'visited'> = {
      handles: this.handles,
      board,
      dt,
      floatDyn: this.floatDyn,
      floatUpdated,
      vectorDyn: this.vectorDyn,
      transformDyn: this.transformDyn,
      randomDyn: this.randomDyn,
      sinusDyn: this.sinusDyn,
      signalDyn: this.signalDyn,
      signalUpdated,
      runtimes: this.runtimes,
      condCtx,
      clipLibrary: this.clipLibrary,
      clipClocks: this.clipClocks,
      animDbLibrary: this.animDbLibrary,
      staticSwitchResults: this.staticSwitchResults,
      time,
      playing,
      speed,
      slotHost: options?.slotHost,
      parentPoseUpdate: options?.parentPoseUpdate,
      parentPoseSample: options?.parentPoseSample,
      makeParentPoseSample,
      additionalFloatTrackTimes: this.additionalFloatTrackTimes,
      mathExprCache: this.mathExprCache,
      updateSucc: this.updateSucc,
      prevNodes: this.prevNodes,
      boneOpCache: this.boneOpCache,
      boneRotateDyn: this.boneRotateDyn,
      boneQuatDyn: this.boneQuatDyn,
      boneTranslateDyn: this.boneTranslateDyn,
      mathExprPoseCache: this.mathExprPoseCache,
    }

    const root = findRootHandle(this.handles, this.originalAnimgraph)
    if (root) {
      updateFromNode(root, {
        ...walkBase,
        nodes,
        visited: new Set(),
      })
    } else {
      // Fallback: no root — update all SMs (legacy)
      for (const sm of findStateMachineHandles(this.handles)) {
        updateFromNode(sm, {
          ...walkBase,
          nodes,
          visited: new Set(),
        })
      }
    }

    // Drop dyn state for nodes not updated this frame (deactivated → re-init on reactivate)
    for (const id of [...this.floatDyn.keys()]) {
      if (!floatUpdated.has(id)) this.floatDyn.delete(id)
    }
    for (const id of [...this.vectorDyn.keys()]) {
      if (!floatUpdated.has(id)) this.vectorDyn.delete(id)
    }
    for (const id of [...this.transformDyn.keys()]) {
      if (!floatUpdated.has(id)) this.transformDyn.delete(id)
    }
    for (const id of [...this.randomDyn.keys()]) {
      if (!floatUpdated.has(id)) this.randomDyn.delete(id)
    }
    for (const id of [...this.sinusDyn.keys()]) {
      if (!floatUpdated.has(id)) this.sinusDyn.delete(id)
    }
    for (const id of [...this.signalDyn.keys()]) {
      if (!signalUpdated.has(id)) this.signalDyn.delete(id)
    }
    // Reset AdditionalFloatTrack i_time when node leaves active Update path (OnActivated).
    for (const id of [...this.additionalFloatTrackTimes.keys()]) {
      if (!nodes[id]?.active) this.additionalFloatTrackTimes.delete(id)
    }
    // Deactivate clip clocks that were not stepped (left the active pose path)
    for (const [, clock] of this.clipClocks) {
      if (!clock.stepped && clock.wasActive) deactivateClipClock(clock)
    }

    if (endBoardFrame) board.endFrame()

    const sms: SimSnapshot['sms'] = {}
    const clips: SimActiveClip[] = []
    const isWrap = (n: string) => board.isWrapperActive(n)
    for (const [id, c] of this.clipClocks) {
      if (!c.stepped) continue
      let progress = 0
      const nodeW = nodes[id]?.weight
      if (typeof nodeW === 'number' && Number.isFinite(nodeW)) progress = nodeW
      const animName = c.animName || 'None'
      const resolve =
        c.resolveHint ?? classifyClipResolve(animName, this.clipLibrary, isWrap)
      clips.push({
        handleId: id,
        animName,
        time: resolve === 'ok' ? c.currTime : 0,
        progress: resolve === 'ok' ? progress : 0,
        resolve,
      })
    }

    for (const [id, rt] of this.runtimes) {
      sms[id] = rt.toState()
    }

    const nodeDelta = this.prevNodes ? diffSimNodeStates(this.prevNodes, nodes) : null
    this.prevNodes = nodes

    let poseStats: SimSnapshot['poseStats'] = null
    const rig = this.activeRig
    if (rig && this.clipPoseLibrary && this.sampleOut && this.poseScratch) {
      simSampleLogLine(sampleLog, '--- root Sample ---')
      if (sampleLog) {
        let edges = 0
        for (const arr of this.updateSucc.values()) edges += arr.length
        simSampleLogLine(
          sampleLog,
          `updateSucc parents=${this.updateSucc.size} edges=${edges}`
        )
      }
      this.joinPoseCache.sampled.clear()
      const result = sampleGraphPose(
        root,
        {
          handles: this.handles,
          board,
          nodes,
          clipClocks: this.clipClocks,
          clipPoseLibrary: this.clipPoseLibrary,
          clipLibrary: this.clipLibrary,
          rig,
          staticSwitchResults: this.staticSwitchResults,
          runtimes: this.runtimes,
          sampleNested: (slotName) => options?.slotHost?.getNestedPose(slotName) ?? null,
          parentPoseSample: options?.parentPoseSample,
          shrinkRemoveCountByHandleId: this.shrinkRemoveCountByHandleId,
          trackShrinkRemoveCountByHandleId: this.trackShrinkRemoveCountByHandleId,
          stackCaptureHandleIds: this.stackCaptureHandleIds,
          captureStack: (handleId, pose) => this.capturePoseFromSample(handleId, pose),
          poseScratch: this.poseScratch,
          missingGlb: [],
          sampleLog,
          sampleVisitedAll,
          updateSucc: this.updateSucc,
          warningsEnabled: this.sampleWarningsEnabled,
          warnings: sampleWarnings,
          lastWrittenNull: false,
          boneOpCache: this.boneOpCache,
          additionalFloatTrackTimes: this.additionalFloatTrackTimes,
          mathExprCache: this.mathExprCache,
          mathExprPoseCache: this.mathExprPoseCache,
          parentTransforms: this.parentTransforms,
          joinPoseCache: this.joinPoseCache,
        },
        this.sampleOut
      )
      for (const id of this.stackCaptureHandleIds) {
        simSampleLogLine(
          sampleLog,
          `after-root capture ${id}: ${this.capturedPoseThisFrame.has(id) ? 'YES' : 'NO'}`
        )
      }
      flushSimSampleLog(sampleLog)
      const hud = this.resolveHudPose()
      const atNodePose = hud?.handleId ? hud.pose : null
      const resultPose = this.sampleOut
      const inspect: NonNullable<SimSnapshot['poseStats']>['inspect'] = {}
      for (const boneName of this.poseInspectBones) {
        const atNode = atNodePose ? this.readNamedTrs(atNodePose, boneName) : undefined
        const result = this.readNamedTrs(resultPose, boneName) ?? undefined
        if (!atNode && !result) continue
        inspect[boneName] = {
          ...(atNode ? { atNode } : {}),
          ...(result ? { result } : {}),
        }
      }
      const stackPose = atNodePose ?? resultPose
      poseStats = {
        ok: result.ok,
        reason: result.reason,
        boneCount: rig.boneNames.length,
        trackCount: rig.trackNames.length,
        sampleMs: result.sampleMs,
        inspect: Object.keys(inspect).length ? inspect : undefined,
        stack: this.buildStackStats(stackPose),
        trackStack: this.buildTrackStackStats(stackPose),
        stackSourceHandleId: hud?.handleId ?? undefined,
        missingGlb: result.missingGlb,
        warnings: result.warnings,
      }
    } else {
      simSampleLogLine(
        sampleLog,
        `skip root Sample reason=${!rig ? 'no-rig' : !this.clipPoseLibrary ? 'no-glb' : 'no-buffers'}`
      )
      flushSimSampleLog(sampleLog)
      poseStats = {
        ok: false,
        reason: !rig ? 'no-rig' : !this.clipPoseLibrary ? 'no-glb' : 'no-buffers',
        boneCount: rig?.boneNames.length ?? 0,
        trackCount: rig?.trackNames.length ?? 0,
        sampleMs: 0,
      }
    }

    return {
      time,
      playing,
      speed,
      sms,
      nodes,
      nodeDelta,
      status: {
        rootHandleId: root?.HandleId ?? null,
        clips,
      },
      poseStats,
    }
  }

  getSnapshotEmpty(time: number, playing: boolean, speed: number): SimSnapshot {
    const snap = emptySimSnapshot()
    snap.time = time
    snap.playing = playing
    snap.speed = speed
    for (const [id, rt] of this.runtimes) {
      snap.sms[id] = rt.toState()
    }
    return snap
  }
}

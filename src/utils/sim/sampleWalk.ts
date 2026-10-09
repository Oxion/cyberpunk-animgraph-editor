/**
 * Offline Sample walk — follows Update `updateSucc` + overlay weights/clocks.
 */

import type { AnimgraphNode } from '../graph/animgraphTypes'
import {
  BLEND_BY_MASK_DYNAMIC_ACTIVATION,
  blendByMaskDynamicBlendActive,
  blendOverrideInputActive,
} from './engineParity'
import type { ClipPoseLibrary } from './clipPoseLibrary'
import type { ClipClockState } from './clipClock'
import type { ClipLibrary } from './clipLibrary'
import {
  applyOverrideBlendBones,
  blendAdditiveLocal,
  blendByMask,
  blendOverrideBoneBranch,
  clearStack,
  clearTrackStack,
  convertAbsoluteToAdditiveFromRig,
  copyPose,
  createPose,
  DEFAULT_STACK_CAPACITY,
  identityPose,
  interpolatePose,
  pushStackSlot,
  pushTrackSlot,
  readTrackValue,
  resolveTrackUnified,
  shrinkStack,
  shrinkTrackStack,
  writeTrackValue,
  type OverrideBoneWeight,
  type Pose,
} from './pose'
import type { BoneOpFrameCache, MathExprPoseFrameCache } from './boneOpDyn'
import {
  evalAnimMathExpression,
  getCompiledMathExpr,
  type MathExprCompileCache,
} from './evalAnimMathExpression'
import {
  evalAnimMathExpressionFloatMixed,
  IDENTITY_QUAT_VEC4,
  type SimVec4,
  ZERO_VEC4,
} from './evalAnimMathExpressionVector'
import { evalCurveFloatData } from './floatDyn'
import {
  applyAimConstraint,
  applyFloatTrackDirectConn,
  applyMultipleParentConstraint,
  applyOrientConstraint,
  applyPointConstraint,
  applyParentConstraint,
  IDENTITY_QS,
  preprocessPointWeights,
  type MultipleParentInfo,
  applyRotationLimitLs,
  applyTransformToTrack,
  applyTranslationLimit,
  eulerDegToQuat,
  getTransformMs,
  offsetBoneInSpace,
  parseSnapMethod,
  parseTransformAxis,
  parseTransformChannel,
  quatToEulerDeg,
  readBoneLs,
  readQsTransform,
  resolveUnifiedName,
  rotateBoneByAngle,
  rotateBoneByAxisVector,
  rotateBoneByQuaternion,
  setBoneRotationMs,
  setBoneTranslationMs,
  slerpQs,
  snapBoneToTarget,
  translateBoneLocal,
  writeBoneLs,
  type Qs,
  type SnapMethod,
} from './poseFk'
import { getRigPartMask, type RigEntry } from './rigResource'
import type { SimInputBoard } from './SimInputBoard'
import {
  evaluateSmTransitionBlendAlpha,
  type SimStateMachineRuntime,
} from './SimStateMachine'
import { handleType, readBool, readCName, readNumber, resolveHandle } from './simDataUtils'
import {
  simSampleLogLine,
  type SimSampleLog,
} from './simSampleLog'
import type { SimNodeState, SimSampleWarning } from './simTypes'
import { SIM_SAMPLE_WARNINGS_MAX } from './simSnapshot'

/**
 * Sample support: follows Update `updateSucc` only (no Data pose rediscovery).
 * Leaves (SkAnim / Identity) may have 0 successors.
 */

export type SampleCtx = {
  handles: Map<string, AnimgraphNode>
  board: SimInputBoard
  nodes: Record<string, SimNodeState>
  clipClocks: Map<string, ClipClockState>
  clipPoseLibrary: ClipPoseLibrary
  clipLibrary: ClipLibrary | null
  rig: RigEntry
  staticSwitchResults?: Map<string, boolean>
  /** SM runtimes from Update this frame */
  runtimes?: Map<string, SimStateMachineRuntime>
  /** Nested GraphSlot pose after nested Update+Sample */
  sampleNested?: (slotName: string) => Pose | null
  /** Parent GraphSlot.inputLink sample for GraphSlotInput */
  parentPoseSample?: (out: Pose) => boolean
  /** Transform Shrinker handleId → remove count (bind-time tag pairing) */
  shrinkRemoveCountByHandleId?: Map<string, number>
  /** Track Shrinker handleId → remove count */
  trackShrinkRemoveCountByHandleId?: Map<string, number>
  /**
   * HandleIds whose full pose should be snapshotted after Sample of that node (HUD).
   * Survives later Shrinker / blends on the path to root.
   */
  stackCaptureHandleIds?: Set<string>
  /** Copy live pose for a capture handle (runner-owned buffers). */
  captureStack?: (handleId: string, pose: Pose) => void
  /**
   * LIFO pose scratch pool for blend temps (acquirePose / releasePose).
   * Shared across nested samplePoseFromNode — depth is saved/restored.
   */
  poseScratch: PoseScratchPool
  /** Anim names that resolved clip but had no glb (mutated during walk) */
  missingGlb?: string[]
  /** Optional Sample-path debug (see simSampleLog.ts). */
  sampleLog?: SimSampleLog | null
  /** All handles entered this Sample ctx (incl. side-sample / fresh visited sets). */
  sampleVisitedAll?: Set<string>
  /**
   * Update-traversal successors (parent → child ids in visit/role order).
   * When present, Sample follows this instead of rediscovering Data pins.
   */
  updateSucc?: Map<string, string[]>
  /**
   * When true, Sample appends diagnostics into `warnings` (null-pose blends, …).
   * Off → zero cost beyond lastWrittenNull bookkeeping used only if enabled.
   */
  warningsEnabled?: boolean
  /** Append-only Sample warnings for this frame (shared with nested samples). */
  warnings?: SimSampleWarning[]
  /**
   * Set by every Sample write into the current `out` buffer: true = null/zero local pose.
   * Not on Pose (shared buffers). Default false; read after each child sample when warningsEnabled.
   */
  lastWrittenNull: boolean
  /** Update→Sample values for procedural bone ops (Rotate/Translate/SetPosition/…). */
  boneOpCache?: BoneOpFrameCache
  /**
   * AdditionalFloatTrack local time (engine i_time), advanced on Update.
   * Cleared when the node leaves the active Update path.
   */
  additionalFloatTrackTimes?: Map<string, number>
  /** Per-runner math expression compile cache (shared with Update). */
  mathExprCache?: MathExprCompileCache
  /** MathExpressionPose float-socket link snapshots from Update. */
  mathExprPoseCache?: MathExprPoseFrameCache
  /**
   * Parent-transform stack (name → MS Qs). ParentTransform Sample reads this;
   * falls back to pose unified MS when missing.
   */
  parentTransforms?: Map<string, Qs>
  /**
   * Engine AnimNode_Join: sample once per frame, replay cached pose on diamond re-entry.
   * `sampled` cleared each Sample; `poses` may be reused across frames.
   */
  joinPoseCache?: { sampled: Set<string>; poses: Map<string, Pose> }
}

export type SampleResult = {
  ok: boolean
  reason?: 'no-rig' | 'no-root' | 'empty'
  sampleMs: number
  bonesSampled: number
  missingGlb?: string[]
  warnings?: SimSampleWarning[]
}

function noteWrittenNull(ctx: SampleCtx, isNull: boolean): void {
  if (ctx.warningsEnabled) ctx.lastWrittenNull = isNull
}

function pushSampleWarning(ctx: SampleCtx, w: SimSampleWarning): void {
  if (!ctx.warningsEnabled || !ctx.warnings) return
  if (ctx.warnings.length >= SIM_SAMPLE_WARNINGS_MAX) return
  ctx.warnings.push(w)
}

function writeNullPose(ctx: SampleCtx, out: Pose): void {
  identityPose(out)
  noteWrittenNull(ctx, true)
}

function writeRefPose(ctx: SampleCtx, out: Pose): void {
  identityFromRig(out, ctx.rig)
  noteWrittenNull(ctx, false)
}

function noteMissingGlb(ctx: SampleCtx, animName: string): void {
  if (!ctx.missingGlb) return
  if (ctx.missingGlb.includes(animName)) return
  ctx.missingGlb.push(animName)
}

const EMPTY_SUCC: string[] = []
const DEFAULT_POSE_SCRATCH_SLOTS = 2

/** Growable LIFO pool of pose temps (reuse across frames). */
export type PoseScratchPool = {
  stack: Pose[]
  depth: number
  boneCount: number
  trackCount: number
  stackCapacity: number
  trackStackCapacity: number
}

export function createPoseScratchPool(
  boneCount: number,
  trackCount: number,
  stackCapacity = DEFAULT_STACK_CAPACITY,
  trackStackCapacity = DEFAULT_STACK_CAPACITY,
  initialSlots = DEFAULT_POSE_SCRATCH_SLOTS
): PoseScratchPool {
  const n = Math.max(0, boneCount | 0)
  const t = Math.max(0, trackCount | 0)
  const sc = Math.max(0, stackCapacity | 0)
  const tsc = Math.max(0, trackStackCapacity | 0)
  const slots = Math.max(1, initialSlots | 0)
  return {
    stack: Array.from({ length: slots }, () => createPose(n, t, sc, tsc)),
    depth: 0,
    boneCount: n,
    trackCount: t,
    stackCapacity: sc,
    trackStackCapacity: tsc,
  }
}

/** Push a temp pose (may grow the pool). Pair with releasePose in reverse order. */
export function acquirePose(ctx: SampleCtx): Pose {
  const pool = ctx.poseScratch
  if (pool.depth >= pool.stack.length) {
    pool.stack.push(
      createPose(pool.boneCount, pool.trackCount, pool.stackCapacity, pool.trackStackCapacity)
    )
  }
  return pool.stack[pool.depth++]!
}

/** Pop the last acquirePose. Must mirror acquire order (LIFO). */
export function releasePose(ctx: SampleCtx): void {
  if (ctx.poseScratch.depth > 0) ctx.poseScratch.depth--
}

function updateKids(ctx: SampleCtx, handleId: string): string[] {
  return ctx.updateSucc?.get(handleId) ?? EMPTY_SUCC
}

/** Debug-only (when `__SIM_SAMPLE_LOG`); no console.warn — leaves vs holes share 0-succ. */
function logMissingUpdateSucc(
  ctx: SampleCtx,
  node: AnimgraphNode,
  detail: string
): void {
  simSampleLogLine(
    ctx.sampleLog,
    `missing-succ ${detail} at ${node.HandleId} ${handleType(node)}`
  )
}

function sampleByHandleId(
  handleId: string | undefined,
  ctx: SampleCtx,
  out: Pose,
  visited: Set<string>
): boolean {
  if (!handleId) {
    writeRefPose(ctx, out)
    return false
  }
  return sampleNode(ctx.handles.get(handleId) ?? null, ctx, out, visited)
}

/** Require ≥1 Update successor; no Data rediscovery. */
function sampleRequiredSucc(
  node: AnimgraphNode,
  ctx: SampleCtx,
  out: Pose,
  visited: Set<string>
): boolean {
  const kids = updateKids(ctx, node.HandleId)
  if (!kids.length) {
    logMissingUpdateSucc(ctx, node, 'expected ≥1 child')
    writeRefPose(ctx, out)
    return false
  }
  simSampleLogLine(ctx.sampleLog, `succ ${node.HandleId} → [${kids.join(',')}]`)
  return sampleByHandleId(kids[0], ctx, out, visited)
}

/**
 * Sample active pose path into `out` (must match active rig bone count).
 */
export function sampleGraphPose(
  root: AnimgraphNode | null,
  ctx: SampleCtx,
  out: Pose
): SampleResult {
  const t0 =
    typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()
  if (!ctx.missingGlb) ctx.missingGlb = []
  if (ctx.warningsEnabled && !ctx.warnings) ctx.warnings = []
  ctx.lastWrittenNull = false
  ctx.poseScratch.depth = 0
  if (!ctx.updateSucc) {
    simSampleLogLine(ctx.sampleLog, 'sampleGraphPose without updateSucc map')
  }
  if (!root) {
    writeNullPose(ctx, out)
    return {
      ok: false,
      reason: 'no-root',
      sampleMs: 0,
      bonesSampled: out.boneCount,
      missingGlb: ctx.missingGlb,
      warnings: ctx.warnings?.length ? ctx.warnings : undefined,
    }
  }
  try {
    const visited = new Set<string>()
    const ok = sampleNode(root, ctx, out, visited)
    if (ctx.sampleLog) {
      const want = [...(ctx.stackCaptureHandleIds ?? [])]
      const all = ctx.sampleVisitedAll
      for (const id of want) {
        simSampleLogLine(
          ctx.sampleLog,
          `capture-target ${id}: visited=${all?.has(id) ? 1 : 0}`
        )
      }
      simSampleLogLine(
        ctx.sampleLog,
        `visited-count any=${all?.size ?? 0} stackLeft=${visited.size} scratchDepth=${ctx.poseScratch.depth} ok=${ok}`
      )
    }
    const t1 =
      typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()
    return {
      ok,
      reason: ok ? undefined : 'empty',
      sampleMs: t1 - t0,
      bonesSampled: out.boneCount,
      missingGlb: ctx.missingGlb.length ? ctx.missingGlb : undefined,
      warnings: ctx.warnings?.length ? ctx.warnings : undefined,
    }
  } finally {
    ctx.poseScratch.depth = 0
  }
}

/**
 * Sample a subtree into `out` (e.g. parent GraphSlot.inputLink for nested GraphSlotInput).
 */
export function samplePoseFromNode(
  node: AnimgraphNode | null,
  ctx: SampleCtx,
  out: Pose
): boolean {
  if (!ctx.missingGlb) ctx.missingGlb = []
  ctx.lastWrittenNull = false
  const savedDepth = ctx.poseScratch.depth
  try {
    return sampleNode(node, ctx, out, new Set())
  } finally {
    ctx.poseScratch.depth = savedDepth
  }
}

export function allocSampleScratch(
  rig: RigEntry,
  stackCapacity = DEFAULT_STACK_CAPACITY,
  trackStackCapacity = DEFAULT_STACK_CAPACITY
): { out: Pose; poseScratch: PoseScratchPool } {
  const n = rig.boneNames.length
  const t = rig.trackNames.length
  const sc = Math.max(0, stackCapacity | 0)
  const tsc = Math.max(0, trackStackCapacity | 0)
  return {
    out: createPose(n, t, sc, tsc),
    poseScratch: createPoseScratchPool(n, t, sc, tsc),
  }
}

function sampleNode(
  node: AnimgraphNode | null,
  ctx: SampleCtx,
  out: Pose,
  visited: Set<string>
): boolean {
  if (!node) {
    writeNullPose(ctx, out)
    simSampleLogLine(ctx.sampleLog, 'sample null → identity')
    return false
  }
  // `visited` is the recursion stack (add on enter, delete on exit), not
  // "sampled once this frame". Diamonds (BlendOverride base+override → same Join)
  // must re-sample; only a true cycle on the call stack is rejected.
  if (visited.has(node.HandleId)) {
    simSampleLogLine(ctx.sampleLog, `CYCLE ${node.HandleId} → ref pose`)
    writeRefPose(ctx, out)
    return false
  }
  visited.add(node.HandleId)
  ctx.sampleVisitedAll?.add(node.HandleId)
  const t = handleType(node)
  simSampleLogLine(ctx.sampleLog, `ENTER ${node.HandleId} ${t}`)

  try {
    const ok = sampleNodeDispatch(node, ctx, out, visited)
    maybeCapturePose(node, ctx, out)
    return ok
  } finally {
    visited.delete(node.HandleId)
  }
}

function sampleNodeDispatch(
  node: AnimgraphNode,
  ctx: SampleCtx,
  out: Pose,
  visited: Set<string>
): boolean {
  const t = handleType(node)

  switch (t) {
    case 'animAnimNode_Root':
    case 'animAnimNode_Output':
    case 'animAnimNode_State':
    case 'animAnimNode_StateFrozen':
      return sampleRequiredSucc(node, ctx, out, visited)

    case 'animAnimNode_StateMachine':
      return sampleStateMachine(node, ctx, out, visited)

    case 'animAnimNode_GraphSlotInput':
      if (ctx.parentPoseSample) {
        return ctx.parentPoseSample(out)
      }
      writeRefPose(ctx, out)
      return false

    case 'animAnimNode_GraphSlot':
    case 'animAnimNode_GraphSlot_Test':
    case 'animAnimNode_GraphSlotConditions':
      return sampleGraphSlot(node, ctx, out, visited)

    case 'animAnimNode_SkDurationAnim':
    case 'animAnimNode_SkAnim':
    case 'animAnimNode_SkFrameAnim':
    case 'animAnimNode_SkSpeedAnim':
    case 'animAnimNode_SkSyncedMasterAnim':
    case 'animAnimNode_SkPhaseAnim':
    case 'animAnimNode_SkPhaseWithDurationAnim':
    case 'animAnimNode_SkPhaseWithSpeedAnim':
    case 'animAnimNode_SkPhaseSlotWithDurationAnim':
      return sampleSkAnim(node, ctx, out)

    case 'animAnimNode_SkOneShotAnim':
      return sampleSkOneShotAnim(node, ctx, out, visited)

    case 'animAnimNode_SkFrameAnimByTrack':
      return sampleSkFrameAnimByTrack(node, ctx, out, visited)

    case 'animAnimNode_Blend2':
      return sampleBlend2(node, ctx, out, visited)

    case 'animAnimNode_BlendMultiple':
      return sampleBlendMultiple(node, ctx, out, visited)

    case 'animAnimNode_Switch':
      return sampleSwitch(node, ctx, out, visited)

    case 'animAnimNode_StaticSwitch':
      return sampleBoolSwitch(node, ctx, out, visited, true)

    case 'animAnimNode_RuntimeSwitch':
      return sampleBoolSwitch(node, ctx, out, visited, false)

    case 'animAnimNode_BlendAdditive':
      return sampleBlendAdditive(node, ctx, out, visited)

    case 'animAnimNode_BlendOverride':
      return sampleBlendOverride(node, ctx, out, visited)

    case 'animAnimNode_BlendByMaskDynamic':
      return sampleBlendByMaskDynamic(node, ctx, out, visited)

    case 'animAnimNode_StackTransformsExtender':
      return sampleStackTransformsExtender(node, ctx, out, visited)

    case 'animAnimNode_StackTransformsShrinker':
      return sampleStackTransformsShrinker(node, ctx, out, visited)

    case 'animAnimNode_StackTracksExtender':
      return sampleStackTracksExtender(node, ctx, out, visited)

    case 'animAnimNode_StackTracksShrinker':
      return sampleStackTracksShrinker(node, ctx, out, visited)

    case 'animAnimNode_SetBoneTransform':
      return sampleSetBoneTransform(node, ctx, out, visited)
    case 'animAnimNode_SetBonePosition':
      return sampleSetBonePosition(node, ctx, out, visited)
    case 'animAnimNode_SetBoneOrientation':
      return sampleSetBoneOrientation(node, ctx, out, visited)
    case 'animAnimNode_RotateBone':
      return sampleRotateBone(node, ctx, out, visited)
    case 'animAnimNode_TransformRotator':
      return sampleTransformRotator(node, ctx, out, visited)
    case 'animAnimNode_RotateBoneByQuaternion':
      return sampleRotateBoneByQuaternion(node, ctx, out, visited)
    case 'animAnimNode_TranslateBone':
      return sampleTranslateBone(node, ctx, out, visited)
    case 'animAnimNode_FloatTrackModifier':
    case 'animAnimNode_FloatTrackModifierMarkUnstable':
      return sampleFloatTrackModifier(node, ctx, out, visited)
    case 'animAnimNode_RotationLimit':
      return sampleRotationLimit(node, ctx, out, visited)
    case 'animAnimNode_TranslationLimit':
      return sampleTranslationLimit(node, ctx, out, visited)
    case 'animAnimNode_SetDrivenKey':
      return sampleSetDrivenKey(node, ctx, out, visited)
    case 'animAnimNode_AdditionalTransform':
      return sampleAdditionalTransform(node, ctx, out, visited)
    case 'animAnimNode_AdditionalFloatTrack':
      return sampleAdditionalFloatTrack(node, ctx, out, visited)
    case 'animAnimNode_ParentTransform':
      return sampleParentTransform(node, ctx, out, visited)
    case 'animAnimNode_ParentConstraint':
      return sampleParentConstraint(node, ctx, out, visited)
    case 'animAnimNode_FloatTrackDirectConnConstraint':
      return sampleFloatTrackDirectConn(node, ctx, out, visited)
    case 'animAnimNode_TransformToTrack':
      return sampleTransformToTrack(node, ctx, out, visited)
    case 'animAnimNode_OrientConstraint':
      return sampleOrientConstraint(node, ctx, out, visited)
    case 'animAnimNode_PointConstraint':
      return samplePointConstraint(node, ctx, out, visited)
    case 'animAnimNode_MultipleParentConstraint':
      return sampleMultipleParentConstraint(node, ctx, out, visited)
    case 'animAnimNode_AimConstraint':
    case 'animAnimNode_AimConstraint_ObjectUp':
    case 'animAnimNode_AimConstraint_ObjectRotationUp':
      return sampleAimConstraint(node, ctx, out, visited)

    case 'animAnimNode_Join':
      return sampleJoin(node, ctx, out, visited)

    case 'animAnimNode_MathExpressionPose':
      return sampleMathExpressionPose(node, ctx, out, visited)

    // Identity = zero local TRS (additive no-op). Reference = rig A-pose.
    case 'animAnimNode_IdentityPoseTerminator':
      writeNullPose(ctx, out)
      return true

    case 'animAnimNode_ReferencePoseTerminator':
      writeRefPose(ctx, out)
      return true

    default:
      // Other Sk*Anim variants (SkFrameAnim, …)
      if (t != null && t.startsWith('animAnimNode_Sk') && t.includes('Anim')) {
        return sampleSkAnim(node, ctx, out)
      }
      // Generic OnePoseInput / passthrough / pose leaves — only Update successors.
      {
        const kids = updateKids(ctx, node.HandleId)
        if (kids.length) {
          simSampleLogLine(ctx.sampleLog, `succ ${node.HandleId} → [${kids.join(',')}]`)
          return sampleByHandleId(kids[0], ctx, out, visited)
        }
        logMissingUpdateSucc(ctx, node, '0 children (leaf or missing succ)')
        writeRefPose(ctx, out)
        return true
      }
  }
}

function sampleStateMachine(
  node: AnimgraphNode,
  ctx: SampleCtx,
  out: Pose,
  visited: Set<string>
): boolean {
  const kids = updateKids(ctx, node.HandleId)
  if (kids.length === 1) return sampleByHandleId(kids[0], ctx, out, visited)
  if (kids.length >= 2) {
    // Transition: Update recorded active then target; blend via transition interpolator.
    const rt = ctx.runtimes?.get(node.HandleId)
    const linear = rt?.transitionProgress ?? 0
    const alpha = rt
      ? evaluateSmTransitionBlendAlpha(node, rt, ctx.handles, linear)
      : linear
    const a = acquirePose(ctx)
    const b = acquirePose(ctx)
    try {
      sampleByHandleId(kids[0], ctx, a, new Set(visited))
      const aNull = ctx.lastWrittenNull
      sampleByHandleId(kids[1], ctx, b, new Set(visited))
      const bNull = ctx.lastWrittenNull
      interpolatePose(out, a, b, alpha)
      if (ctx.warningsEnabled) {
        noteWrittenNull(ctx, alpha <= 0 ? aNull : alpha >= 1 ? bNull : aNull && bNull)
      }
    } finally {
      releasePose(ctx)
      releasePose(ctx)
    }
    return true
  }
  logMissingUpdateSucc(ctx, node, 'StateMachine expected ≥1 child')
  writeRefPose(ctx, out)
  return false
}

function sampleGraphSlot(
  node: AnimgraphNode,
  ctx: SampleCtx,
  out: Pose,
  visited: Set<string>
): boolean {
  const d = node.Data ?? {}
  const slotName = readCName(d.name)
  const dontDeactivate = readBool(d.dontDeactivateInput)
  const kids = updateKids(ctx, node.HandleId)
  if (slotName && ctx.sampleNested) {
    const nested = ctx.sampleNested(slotName)
    if (nested && nested.boneCount > 0 && out.boneCount > 0) {
      copyPose(out, nested)
      noteWrittenNull(ctx, false)
      simSampleLogLine(
        ctx.sampleLog,
        `GraphSlot ${node.HandleId} "${slotName}" nestedOK bones=${nested.boneCount} dontDeact=${dontDeactivate ? 1 : 0}`
      )
      // Side-sample Update successors (inputLink path) for captures only.
      if (dontDeactivate) {
        if (!kids.length) {
          logMissingUpdateSucc(ctx, node, 'dontDeactivate but 0 updateSucc kids')
        } else {
          const savedNull = ctx.lastWrittenNull
          const temp = acquirePose(ctx)
          try {
            simSampleLogLine(
              ctx.sampleLog,
              `GraphSlot ${node.HandleId} side-sample kids=[${kids.join(',')}]`
            )
            for (const id of kids) {
              sampleByHandleId(id, ctx, temp, new Set())
            }
          } finally {
            releasePose(ctx)
          }
          if (ctx.warningsEnabled) ctx.lastWrittenNull = savedNull
        }
      }
      return true
    }
    simSampleLogLine(
      ctx.sampleLog,
      `GraphSlot ${node.HandleId} "${slotName}" nestedMISS nestedBones=${nested?.boneCount ?? -1} outBones=${out.boneCount}`
    )
  }
  // No nested pose — passthrough via Update successors only.
  if (!kids.length) {
    logMissingUpdateSucc(ctx, node, 'GraphSlot passthrough with 0 children')
    writeRefPose(ctx, out)
    return false
  }
  return sampleByHandleId(kids[0], ctx, out, visited)
}

function sampleSkAnim(node: AnimgraphNode, ctx: SampleCtx, out: Pose): boolean {
  const clock = ctx.clipClocks.get(node.HandleId)
  const animName =
    clock?.animName ||
    readCName(node.Data?.animation) ||
    readCName(node.Data?.animationName) ||
    ''
  const time = clock?.currTime ?? 0
  // Missing / gated / no-glb → null local pose (additive no-op), not A-pose/T-pose.
  if (!animName || animName === 'None') {
    writeNullPose(ctx, out)
    return false
  }
  // Same gating as Update clip resolve: active setup entry by wrappers + priority
  const isWrap = (n: string) => ctx.board.isWrapperActive(n)
  const winner = ctx.clipLibrary?.resolveClipEntry(animName, isWrap)
  if (!winner) {
    writeNullPose(ctx, out)
    return false
  }
  const ok = ctx.clipPoseLibrary.sample(animName, time, ctx.rig, out, winner.entryId)
  if (!ok) {
    noteMissingGlb(ctx, animName)
    writeNullPose(ctx, out)
    return false
  }
  // SkAnim.convertToAdditive: absolute sample → delta vs rig ref
  const cta = node.Data?.convertToAdditive
  if (cta === 1 || cta === true) {
    convertAbsoluteToAdditiveFromRig(out, ctx.rig)
  }
  noteWrittenNull(ctx, false)
  return true
}

/**
 * Engine AnimNode_SkOneShotAnim::OnSample —
 * sample input, then blend SkAnim shot by blendIn/Out weight while running.
 */
function sampleSkOneShotAnim(
  node: AnimgraphNode,
  ctx: SampleCtx,
  out: Pose,
  visited: Set<string>
): boolean {
  const d = node.Data ?? {}
  const input = resolveHandle(
    ctx.handles,
    d.Input ?? d.inputLink ?? d.input ?? d.InputLink
  )
  const clock = ctx.clipClocks.get(node.HandleId)
  const running = !!clock?.oneShotRunning

  if (!running) {
    if (input) return sampleByHandleId(input.HandleId, ctx, out, visited)
    writeNullPose(ctx, out)
    return false
  }

  if (input) sampleByHandleId(input.HandleId, ctx, out, visited)
  else writeNullPose(ctx, out)

  const shot = acquirePose(ctx)
  try {
    const okShot = sampleSkAnim(node, ctx, shot)
    if (!okShot) return !!input
    const blendIn = readNumber(d.blendIn, 0)
    const blendOut = readNumber(d.blendOut, 0)
    const animName = clock?.animName || readCName(d.animation) || ''
    const isWrap = (n: string) => ctx.board.isWrapperActive(n)
    const clip =
      animName && animName !== 'None'
        ? ctx.clipLibrary?.resolveClip(animName, isWrap)
        : undefined
    const duration = clip?.duration ?? 0
    const t = clock?.currTime ?? 0
    let w = 1
    if (duration > 0) {
      if (t > duration) w = 0
      else if (blendIn > 0 && t < blendIn) w = t / blendIn
      else if (blendOut > 0 && duration - t < blendOut) w = (duration - t) / blendOut
    }
    w = Math.min(1, Math.max(0, w))
    if (w <= 0) return !!input
    if (w >= 1) {
      copyPose(out, shot)
      noteWrittenNull(ctx, false)
      return true
    }
    interpolatePose(out, out, shot, w)
    noteWrittenNull(ctx, false)
    return true
  } finally {
    releasePose(ctx)
  }
}

/**
 * Engine AnimNode_SkFrameAnimByTrack::OnSample —
 * sample inputWithTracks for float tracks, override clip clock time, then sample anim.
 */
function sampleSkFrameAnimByTrack(
  node: AnimgraphNode,
  ctx: SampleCtx,
  out: Pose,
  visited: Set<string>
): boolean {
  const d = node.Data ?? {}
  const trackPose = acquirePose(ctx)
  try {
    const kids = updateKids(ctx, node.HandleId)
    if (kids.length) {
      sampleByHandleId(kids[0], ctx, trackPose, new Set(visited))
    } else {
      const input = resolveHandle(ctx.handles, d.inputWithTracks)
      if (input) sampleNode(input, ctx, trackPose, new Set(visited))
      else identityPose(trackPose)
    }

    const clock = ctx.clipClocks.get(node.HandleId)
    if (clock) {
      const duration =
        ctx.clipLibrary && clock.animName && clock.animName !== 'None'
          ? ctx.clipLibrary.resolveClip(clock.animName, (n) =>
              ctx.board.isWrapperActive(n)
            )?.duration ?? 0
          : 0
      const dur = duration > 0 ? duration : 0

      const progressName = readNamedTrackFieldName(d.progressFloatTrack)
      const timeName = readNamedTrackFieldName(d.timeFloatTrack)
      const frameName = readNamedTrackFieldName(d.frameFloatTrack)

      // Engine applies each present track in order; later overrides earlier.
      const progressIdx = resolveTrackUnified(trackPose, ctx.rig, progressName)
      if (progressIdx >= 0) {
        const p = Math.min(1, Math.max(0, readTrackValue(trackPose, progressIdx)))
        clock.currTime = dur * p
      }
      const timeIdx = resolveTrackUnified(trackPose, ctx.rig, timeName)
      if (timeIdx >= 0) {
        const t = readTrackValue(trackPose, timeIdx)
        clock.currTime = dur > 0 ? Math.min(dur, Math.max(0, t)) : Math.max(0, t)
      }
      const frameIdx = resolveTrackUnified(trackPose, ctx.rig, frameName)
      if (frameIdx >= 0) {
        const frame = readTrackValue(trackPose, frameIdx)
        const t = frame / 30
        clock.currTime = dur > 0 ? Math.min(dur, Math.max(0, t)) : Math.max(0, t)
      }
    }
  } finally {
    releasePose(ctx)
  }
  return sampleSkAnim(node, ctx, out)
}

function sampleBlend2(
  node: AnimgraphNode,
  ctx: SampleCtx,
  out: Pose,
  visited: Set<string>
): boolean {
  const kids = updateKids(ctx, node.HandleId)
  const weight = ctx.nodes[node.HandleId]?.weight ?? 0
  if (kids.length === 1) return sampleByHandleId(kids[0], ctx, out, visited)
  if (kids.length >= 2) {
    const a = acquirePose(ctx)
    const b = acquirePose(ctx)
    try {
      sampleByHandleId(kids[0], ctx, a, new Set(visited))
      const aNull = ctx.lastWrittenNull
      sampleByHandleId(kids[1], ctx, b, new Set(visited))
      const bNull = ctx.lastWrittenNull
      interpolatePose(out, a, b, weight)
      if (ctx.warningsEnabled) {
        let side: 'first' | 'second' | 'both' | null = null
        if (weight <= 0) {
          if (aNull) side = 'first'
        } else if (weight >= 1) {
          if (bNull) side = 'second'
        } else if (aNull || bNull) {
          side = aNull && bNull ? 'both' : aNull ? 'first' : 'second'
        }
        if (side) {
          pushSampleWarning(ctx, {
            code: 'blend2-null-input',
            handleId: node.HandleId,
            weight,
            side,
            message: `Blend2 #${node.HandleId} weight=${weight.toFixed(3)} null ${side}`,
          })
        }
        noteWrittenNull(
          ctx,
          weight <= 0 ? aNull : weight >= 1 ? bNull : aNull && bNull
        )
      }
    } finally {
      releasePose(ctx)
      releasePose(ctx)
    }
    return true
  }
  logMissingUpdateSucc(ctx, node, 'Blend2 expected ≥1 child')
  writeRefPose(ctx, out)
  return false
}

function sampleBlendMultiple(
  node: AnimgraphNode,
  ctx: SampleCtx,
  out: Pose,
  visited: Set<string>
): boolean {
  const kids = updateKids(ctx, node.HandleId)
  const alpha = ctx.nodes[node.HandleId]?.alpha ?? 0
  if (kids.length === 1) return sampleByHandleId(kids[0], ctx, out, visited)
  if (kids.length >= 2) {
    const a = acquirePose(ctx)
    const b = acquirePose(ctx)
    try {
      sampleByHandleId(kids[0], ctx, a, new Set(visited))
      const aNull = ctx.lastWrittenNull
      sampleByHandleId(kids[1], ctx, b, new Set(visited))
      const bNull = ctx.lastWrittenNull
      interpolatePose(out, a, b, alpha)
      if (ctx.warningsEnabled) {
        noteWrittenNull(ctx, alpha <= 0 ? aNull : alpha >= 1 ? bNull : aNull && bNull)
      }
    } finally {
      releasePose(ctx)
      releasePose(ctx)
    }
    return true
  }
  logMissingUpdateSucc(ctx, node, 'BlendMultiple expected ≥1 child')
  writeRefPose(ctx, out)
  return false
}

function sampleSwitch(
  node: AnimgraphNode,
  ctx: SampleCtx,
  out: Pose,
  visited: Set<string>
): boolean {
  const kids = updateKids(ctx, node.HandleId)
  if (kids.length) {
    simSampleLogLine(ctx.sampleLog, `Switch ${node.HandleId} succ → ${kids[0]}`)
    return sampleByHandleId(kids[0], ctx, out, visited)
  }
  logMissingUpdateSucc(ctx, node, 'Switch expected 1 child')
  writeRefPose(ctx, out)
  return false
}

function sampleBoolSwitch(
  node: AnimgraphNode,
  ctx: SampleCtx,
  out: Pose,
  visited: Set<string>,
  _isStatic: boolean
): boolean {
  const kids = updateKids(ctx, node.HandleId)
  if (kids.length) return sampleByHandleId(kids[0], ctx, out, visited)
  logMissingUpdateSucc(ctx, node, 'BoolSwitch expected 1 child')
  writeRefPose(ctx, out)
  return false
}

function sampleBlendAdditive(
  node: AnimgraphNode,
  ctx: SampleCtx,
  out: Pose,
  visited: Set<string>
): boolean {
  const d = node.Data ?? {}
  const kids = updateKids(ctx, node.HandleId)
  const weight = ctx.nodes[node.HandleId]?.weight ?? 0
  if (!kids.length) {
    logMissingUpdateSucc(ctx, node, 'BlendAdditive expected ≥1 child')
    writeRefPose(ctx, out)
    return false
  }
  sampleByHandleId(kids[0], ctx, out, visited)
  if (kids.length >= 2 && Math.abs(weight) > 0.01) {
    const baseNull = ctx.lastWrittenNull
    const addBuf = acquirePose(ctx)
    try {
      sampleByHandleId(kids[1], ctx, addBuf, new Set(visited))
      // Engine: accumulate local deltas only. Additive clips must already be deltas
      // (native buffer / GLB strip on load). Do not subtract ref here.
      const maskName = readCName(d.maskName)
      const mask = maskName ? getRigPartMask(ctx.rig, maskName) : null
      blendAdditiveLocal(out, out, addBuf, weight, mask)
      // Additive on null base still yields null locals if add is identity-delta.
      if (ctx.warningsEnabled) noteWrittenNull(ctx, baseNull && ctx.lastWrittenNull)
    } finally {
      releasePose(ctx)
    }
  }
  return true
}

/**
 * animNode_BlendOverride::OnSample — base always; override when weight > threshold;
 * blendMethod (Mask / BoneBranch) then legacy m_bones.
 */
function sampleBlendOverride(
  node: AnimgraphNode,
  ctx: SampleCtx,
  out: Pose,
  visited: Set<string>
): boolean {
  const kids = updateKids(ctx, node.HandleId)
  const weight = ctx.nodes[node.HandleId]?.weight ?? 0
  if (!kids.length) {
    logMissingUpdateSucc(ctx, node, 'BlendOverride expected ≥1 child')
    writeRefPose(ctx, out)
    return false
  }
  sampleByHandleId(kids[0], ctx, out, visited)
  if (!blendOverrideInputActive(weight) || kids.length < 2) {
    return true
  }
  const baseNull = ctx.lastWrittenNull
  const ovBuf = acquirePose(ctx)
  try {
    sampleByHandleId(kids[1], ctx, ovBuf, new Set(visited))
    applyBlendOverrideMethods(node, ctx, out, ovBuf, weight)
    if (ctx.warningsEnabled) noteWrittenNull(ctx, baseNull && ctx.lastWrittenNull)
  } finally {
    releasePose(ctx)
  }
  return true
}

function applyBlendOverrideMethods(
  node: AnimgraphNode,
  ctx: SampleCtx,
  baseOut: Pose,
  overridePose: Pose,
  alpha: number
): void {
  const d = node.Data ?? {}
  const method = unwrapEmbedded(d.blendMethod)
  const methodType =
    method && typeof method.$type === 'string' ? (method.$type as string) : ''

  if (methodType === 'animPoseBlendMethod_Mask') {
    const maskName = readCName(method!.maskName)
    const mask = maskName ? getRigPartMask(ctx.rig, maskName) : null
    if (mask) blendByMask(baseOut, baseOut, overridePose, alpha, mask)
  } else if (methodType === 'animPoseBlendMethod_BoneBranch') {
    const overrides = readOverrideBoneWeights(method!.bones, ctx.rig)
    blendOverrideBoneBranch(
      baseOut,
      baseOut,
      overridePose,
      alpha,
      ctx.rig.boneParents,
      overrides
    )
  }

  // Legacy m_bones on the BlendOverride node itself
  const legacy = readOverrideBoneWeights(d.bones, ctx.rig)
  if (legacy.length) applyOverrideBlendBones(baseOut, overridePose, alpha, legacy)
}

function unwrapEmbedded(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (o.Data && typeof o.Data === 'object') return o.Data as Record<string, unknown>
  return o
}

function readOverrideBoneWeights(
  raw: unknown,
  rig: RigEntry
): OverrideBoneWeight[] {
  if (!Array.isArray(raw)) return []
  const out: OverrideBoneWeight[] = []
  for (const item of raw) {
    const info = unwrapEmbedded(item)
    if (!info) continue
    const name = readTransformIndexName(info.transformIndex)
    const boneIndex = name ? (rig.boneIndexByName.get(name.toLowerCase()) ?? -1) : -1
    const weight = readNumber(info.weight, 1)
    if (boneIndex >= 0) out.push({ boneIndex, weight })
  }
  return out
}

function readTransformIndexName(raw: unknown): string {
  const ti = unwrapEmbedded(raw)
  if (!ti) return ''
  return readCName(ti.name) || readCName(ti.bone) || ''
}

function maskHasAnyBone(mask: Uint8Array): boolean {
  for (let i = 0; i < mask.length; i++) {
    if (mask[i]) return true
  }
  return false
}

function readMaskListEntryName(maskEntry: unknown): string {
  return (
    readCName(maskEntry) ||
    (maskEntry && typeof maskEntry === 'object'
      ? readCName((maskEntry as { name?: unknown }).name)
      : '')
  )
}

function sampleBlendByMaskDynamic(
  node: AnimgraphNode,
  ctx: SampleCtx,
  out: Pose,
  visited: Set<string>
): boolean {
  const d = node.Data ?? {}
  const kids = updateKids(ctx, node.HandleId)
  const weight = ctx.nodes[node.HandleId]?.weight ?? 0
  const maskIndex = Math.trunc(ctx.nodes[node.HandleId]?.alpha ?? -1)
  const masks = Array.isArray(d.masks) ? d.masks : []

  if (!kids.length) {
    logMissingUpdateSucc(ctx, node, 'BlendByMaskDynamic expected ≥1 child')
    writeRefPose(ctx, out)
    return false
  }
  sampleByHandleId(kids[0], ctx, out, visited)

  const wantBlend = weight > BLEND_BY_MASK_DYNAMIC_ACTIVATION
  if (ctx.warningsEnabled && wantBlend) {
    if (maskIndex < 0 || maskIndex >= masks.length) {
      pushSampleWarning(ctx, {
        code: 'blend-mask-oob',
        handleId: node.HandleId,
        weight,
        maskIndex,
        message: `BlendByMaskDynamic #${node.HandleId} mask=${maskIndex} oob (masks=${masks.length})`,
      })
    } else {
      const maskName = readMaskListEntryName(masks[maskIndex])
      const mask = maskName ? getRigPartMask(ctx.rig, maskName) : null
      if (!mask) {
        pushSampleWarning(ctx, {
          code: 'blend-mask-missing',
          handleId: node.HandleId,
          weight,
          maskIndex,
          maskName,
          message: `BlendByMaskDynamic #${node.HandleId} part "${maskName || '?'}" not on active rig`,
        })
      } else if (!maskHasAnyBone(mask)) {
        pushSampleWarning(ctx, {
          code: 'blend-mask-empty',
          handleId: node.HandleId,
          weight,
          maskIndex,
          maskName,
          message: `BlendByMaskDynamic #${node.HandleId} part "${maskName}" has empty bone mask`,
        })
      }
    }
  }

  if (
    kids.length >= 2 &&
    blendByMaskDynamicBlendActive(weight, maskIndex, masks.length)
  ) {
    const aNull = ctx.lastWrittenNull
    const blendBuf = acquirePose(ctx)
    try {
      sampleByHandleId(kids[1], ctx, blendBuf, new Set(visited))
      const bNull = ctx.lastWrittenNull
      const maskName = readMaskListEntryName(masks[maskIndex])
      const mask = maskName ? getRigPartMask(ctx.rig, maskName) : null
      // Engine: FindRigPartByName miss → keep base only (no full-body interpolate)
      if (mask) blendByMask(out, out, blendBuf, weight, mask)
      if (ctx.warningsEnabled) {
        noteWrittenNull(ctx, weight <= 0 ? aNull : weight >= 1 ? bNull : aNull && bNull)
      }
    } finally {
      releasePose(ctx)
    }
  }
  return true
}

function identityFromRig(out: Pose, rig: RigEntry): void {
  out.translation.set(rig.refTranslation.subarray(0, out.boneCount * 3))
  out.rotation.set(rig.refRotation.subarray(0, out.boneCount * 4))
  out.scale.set(rig.refScale.subarray(0, out.boneCount * 3))
  out.tracks.fill(0)
  clearStack(out)
  clearTrackStack(out)
}

function unwrapData(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (o.Data && typeof o.Data === 'object') return o.Data as Record<string, unknown>
  return o
}

/**
 * Inline Data, or HandleId/HandleRefId stub → registry payload.
 * After AnimgraphParser.unwrapAnimgraphNodes nested handles are stubs only.
 */
function resolveEmbeddedData(
  raw: unknown,
  handles: Map<string, AnimgraphNode>
): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object') return null
  const inline = unwrapData(raw)
  if (inline?.$type) return inline
  const resolved = resolveHandle(handles, raw)
  if (resolved) {
    return (
      unwrapData(resolved) ??
      (resolved.Data as Record<string, unknown> | undefined) ??
      null
    )
  }
  if (inline && !('HandleId' in inline) && !('HandleRefId' in inline)) return inline
  return null
}

function readArrayItem(arr: unknown, i: number): unknown {
  return Array.isArray(arr) ? arr[i] : undefined
}

function readTransformIndexFromRaw(raw: unknown): string {
  const ti = unwrapData(raw)
  if (!ti) return readCName(raw)
  return readCName(ti.name) || readCName(ti.bone) || ''
}

function warnBoneMissing(ctx: SampleCtx, handleId: string, boneName: string): void {
  pushSampleWarning(ctx, {
    code: 'bone-op-missing',
    handleId,
    message: `Bone op #${handleId} missing bone "${boneName || '?'}"`,
  })
}

function sampleOnePoseChild(
  node: AnimgraphNode,
  ctx: SampleCtx,
  out: Pose,
  visited: Set<string>,
  label: string
): boolean {
  const kids = updateKids(ctx, node.HandleId)
  if (!kids.length) {
    logMissingUpdateSucc(ctx, node, `${label} expected ≥1 child`)
    writeRefPose(ctx, out)
    return false
  }
  return sampleByHandleId(kids[0], ctx, out, visited)
}

/**
 * Engine AnimNode_Join — single pose input; cache pose so diamond consumers
 * (BlendOverride base+override → same Join) do not re-walk the subtree.
 */
function sampleJoin(
  node: AnimgraphNode,
  ctx: SampleCtx,
  out: Pose,
  visited: Set<string>
): boolean {
  const cache = ctx.joinPoseCache
  const id = node.HandleId
  if (cache?.sampled.has(id)) {
    const hit = cache.poses.get(id)
    if (hit) {
      copyPose(out, hit)
      simSampleLogLine(ctx.sampleLog, `Join ${id} cache hit`)
      return true
    }
  }

  const ok = sampleOnePoseChild(node, ctx, out, visited, 'Join')
  if (cache) {
    let buf = cache.poses.get(id)
    if (
      !buf ||
      buf.boneCount !== out.boneCount ||
      buf.trackCount !== out.trackCount ||
      buf.stackCapacity !== out.stackCapacity ||
      buf.trackStackCapacity !== out.trackStackCapacity
    ) {
      buf = createPose(
        out.boneCount,
        out.trackCount,
        out.stackCapacity,
        out.trackStackCapacity
      )
      cache.poses.set(id, buf)
    }
    copyPose(buf, out)
    cache.sampled.add(id)
  }
  return ok
}

function sampleSetBoneTransform(
  node: AnimgraphNode,
  ctx: SampleCtx,
  out: Pose,
  visited: Set<string>
): boolean {
  const ok = sampleOnePoseChild(node, ctx, out, visited, 'SetBoneTransform')
  const entries = Array.isArray(node.Data?.entries) ? node.Data.entries : []
  for (const raw of entries) {
    const e = unwrapData(raw)
    if (!e) continue
    const changeName = readTransformIndexFromRaw(e.transformToChange)
    const changeIdx = resolveUnifiedName(out, ctx.rig, changeName)
    if (changeIdx < 0) {
      if (changeName) warnBoneMissing(ctx, node.HandleId, changeName)
      continue
    }
    const method = parseSnapMethod(e.setMethod)
    const snapToRef = readBool(e.snapToReference)
    const sourceName = readTransformIndexFromRaw(e.sourceBone)
    const sourceIdx = resolveUnifiedName(out, ctx.rig, sourceName)
    if (method !== 'NoSnapping' && sourceIdx >= 0) {
      snapBoneToTarget(out, ctx.rig, changeIdx, sourceIdx, method, snapToRef)
    }
    const offsetSpaceName = readTransformIndexFromRaw(e.offsetSpaceBone)
    const offsetSpaceIdx = resolveUnifiedName(out, ctx.rig, offsetSpaceName)
    if (offsetSpaceIdx >= 0) {
      const offsetToRef = readBool(e.offsetToReference)
      const offset = readQsTransform(e.offset)
      offsetBoneInSpace(out, ctx.rig, changeIdx, offsetSpaceIdx, offset, offsetToRef)
    }
  }
  return ok
}

function sampleSetBonePosition(
  node: AnimgraphNode,
  ctx: SampleCtx,
  out: Pose,
  visited: Set<string>
): boolean {
  const ok = sampleOnePoseChild(node, ctx, out, visited, 'SetBonePosition')
  const boneName = readTransformIndexFromRaw(node.Data?.bone)
  const idx = resolveUnifiedName(out, ctx.rig, boneName)
  if (idx < 0) {
    if (boneName) warnBoneMissing(ctx, node.HandleId, boneName)
    return ok
  }
  const pos = ctx.boneOpCache?.positionMs.get(node.HandleId)
  if (!pos) return ok
  setBoneTranslationMs(out, ctx.rig, idx, pos.x, pos.y, pos.z)
  return ok
}

function sampleSetBoneOrientation(
  node: AnimgraphNode,
  ctx: SampleCtx,
  out: Pose,
  visited: Set<string>
): boolean {
  const ok = sampleOnePoseChild(node, ctx, out, visited, 'SetBoneOrientation')
  const boneName = readTransformIndexFromRaw(node.Data?.bone)
  const idx = resolveUnifiedName(out, ctx.rig, boneName)
  if (idx < 0) {
    if (boneName) warnBoneMissing(ctx, node.HandleId, boneName)
    return ok
  }
  const q = ctx.boneOpCache?.orientationMs.get(node.HandleId)
  if (!q) return ok
  setBoneRotationMs(out, ctx.rig, idx, q.x, q.y, q.z, q.w)
  return ok
}

function sampleRotateBone(
  node: AnimgraphNode,
  ctx: SampleCtx,
  out: Pose,
  visited: Set<string>
): boolean {
  const ok = sampleOnePoseChild(node, ctx, out, visited, 'RotateBone')
  const d = node.Data ?? {}
  const boneName = readTransformIndexFromRaw(d.bone)
  const idx = resolveUnifiedName(out, ctx.rig, boneName)
  if (idx < 0) {
    if (boneName) warnBoneMissing(ctx, node.HandleId, boneName)
    return ok
  }
  const angle = ctx.boneOpCache?.rotateAngleDeg.get(node.HandleId)
  if (angle === undefined) return ok
  const axis = parseTransformAxis(d.axis)
  const inModelSpace = readBool(d.inModelSpace)
  rotateBoneByAngle(out, ctx.rig, idx, axis, angle, inModelSpace)
  return ok
}

/** Engine AnimNode_TransformRotator::OnSample — axis-angle post-multiply in LS. */
function sampleTransformRotator(
  node: AnimgraphNode,
  ctx: SampleCtx,
  out: Pose,
  visited: Set<string>
): boolean {
  const ok = sampleOnePoseChild(node, ctx, out, visited, 'TransformRotator')
  const d = node.Data ?? {}
  const transformName = readTransformIndexFromRaw(d.transform)
  const idx = resolveUnifiedName(out, ctx.rig, transformName)
  if (idx < 0) {
    if (transformName) warnBoneMissing(ctx, node.HandleId, transformName)
    return ok
  }
  const angle = ctx.boneOpCache?.rotateAngleDeg.get(node.HandleId)
  if (angle === undefined) return ok
  const axisRaw = d.axis
  let ax = 0
  let ay = 0
  let az = 1
  if (axisRaw && typeof axisRaw === 'object') {
    const a = axisRaw as Record<string, unknown>
    const nx = Number(a.X ?? a.x)
    const ny = Number(a.Y ?? a.y)
    const nz = Number(a.Z ?? a.z)
    if (Number.isFinite(nx)) ax = nx
    if (Number.isFinite(ny)) ay = ny
    if (Number.isFinite(nz)) az = nz
  }
  rotateBoneByAxisVector(out, idx, ax, ay, az, angle)
  return ok
}

/**
 * Engine AnimNode_FloatTrackModifier::OnSample —
 * operate on named float track using input track or float link (Update snap).
 */
function sampleFloatTrackModifier(
  node: AnimgraphNode,
  ctx: SampleCtx,
  out: Pose,
  visited: Set<string>
): boolean {
  // Base is PoseLink (not OnePoseInput) — follow updateSucc / poseInputNode.
  const kids = updateKids(ctx, node.HandleId)
  let ok = true
  if (kids.length) {
    ok = sampleByHandleId(kids[0], ctx, out, visited)
  } else {
    const poseIn = resolveHandle(ctx.handles, node.Data?.poseInputNode)
    if (poseIn) ok = sampleNode(poseIn, ctx, out, visited)
    else writeRefPose(ctx, out)
  }

  const d = node.Data ?? {}
  const trackName = readNamedTrackFieldName(d.floatTrack)
  const trackIdx = resolveTrackUnified(out, ctx.rig, trackName)
  if (trackIdx < 0) return ok

  const firstArgument = readTrackValue(out, trackIdx)
  let secondArgument = 0
  const inputTrackName = readNamedTrackFieldName(d.inputFloatTrack)
  const inputTrackIdx = resolveTrackUnified(out, ctx.rig, inputTrackName)
  if (inputTrackIdx >= 0) {
    secondArgument = readTrackValue(out, inputTrackIdx)
  } else {
    const snap = ctx.boneOpCache?.floatTrackConn.get(node.HandleId)
    if (snap) secondArgument = snap.weight
  }

  const op = String(d.operationType ?? 'Override')
  let result = secondArgument
  if (op.includes('Multiply')) result = firstArgument * secondArgument
  else if (op.includes('SubtractSwapped')) result = secondArgument - firstArgument
  else if (op.includes('Subtract')) result = firstArgument - secondArgument
  else if (op.includes('Add')) result = firstArgument + secondArgument
  else if (op.includes('WeightComplement')) result = 1 - secondArgument
  // else Override

  writeTrackValue(out, trackIdx, result)
  return ok
}

function sampleRotateBoneByQuaternion(
  node: AnimgraphNode,
  ctx: SampleCtx,
  out: Pose,
  visited: Set<string>
): boolean {
  const ok = sampleOnePoseChild(node, ctx, out, visited, 'RotateBoneByQuaternion')
  const boneName = readTransformIndexFromRaw(node.Data?.bone)
  const idx = resolveUnifiedName(out, ctx.rig, boneName)
  if (idx < 0) {
    if (boneName) warnBoneMissing(ctx, node.HandleId, boneName)
    return ok
  }
  const q = ctx.boneOpCache?.rotateQuat.get(node.HandleId)
  if (!q) return ok
  rotateBoneByQuaternion(out, idx, q.x, q.y, q.z, q.w)
  return ok
}

function sampleTranslateBone(
  node: AnimgraphNode,
  ctx: SampleCtx,
  out: Pose,
  visited: Set<string>
): boolean {
  const ok = sampleOnePoseChild(node, ctx, out, visited, 'TranslateBone')
  const boneName = readTransformIndexFromRaw(node.Data?.bone)
  const idx = resolveUnifiedName(out, ctx.rig, boneName)
  if (idx < 0) {
    if (boneName) warnBoneMissing(ctx, node.HandleId, boneName)
    return ok
  }
  const t = ctx.boneOpCache?.translate.get(node.HandleId)
  if (!t) {
    // No link compiled → bias only from Data
    const bias = readVector3FromData(node.Data?.biasValue)
    translateBoneLocal(out, idx, bias.x, bias.y, bias.z)
    return ok
  }
  translateBoneLocal(out, idx, t.x, t.y, t.z)
  return ok
}

function readVector3FromData(raw: unknown): { x: number; y: number; z: number } {
  if (!raw || typeof raw !== 'object') return { x: 0, y: 0, z: 0 }
  const o = raw as Record<string, unknown>
  return {
    x: readNumber(o.X ?? o.x, 0),
    y: readNumber(o.Y ?? o.y, 0),
    z: readNumber(o.Z ?? o.z, 0),
  }
}

function readSmoothClamp(raw: unknown): { min: number; max: number; curve?: unknown } {
  const o = unwrapData(raw)
  if (!o) return { min: -180, max: 180 }
  return {
    min: readNumber(o.min, -180),
    max: readNumber(o.max, 180),
    curve: o.marginEaseOutCurve,
  }
}

function readFloatClamp(raw: unknown): {
  useMin: boolean
  min: number
  useMax: boolean
  max: number
} {
  const o = unwrapData(raw)
  if (!o) return { useMin: false, min: 0, useMax: false, max: 0 }
  return {
    useMin: readBool(o.useMin),
    min: readNumber(o.min, 0),
    useMax: readBool(o.useMax),
    max: readNumber(o.max, 0),
  }
}

function sampleRotationLimit(
  node: AnimgraphNode,
  ctx: SampleCtx,
  out: Pose,
  visited: Set<string>
): boolean {
  const ok = sampleOnePoseChild(node, ctx, out, visited, 'RotationLimit')
  const d = node.Data ?? {}
  const boneName = readTransformIndexFromRaw(d.constrainedTransform)
  const idx = resolveUnifiedName(out, ctx.rig, boneName)
  if (idx < 0) {
    if (boneName) warnBoneMissing(ctx, node.HandleId, boneName)
    return ok
  }
  const weight = ctx.boneOpCache?.limitWeight.get(node.HandleId) ?? 1
  applyRotationLimitLs(
    out,
    idx,
    readSmoothClamp(d.limitOnX),
    readSmoothClamp(d.limitOnY),
    readSmoothClamp(d.limitOnZ),
    weight
  )
  return ok
}

function sampleTranslationLimit(
  node: AnimgraphNode,
  ctx: SampleCtx,
  out: Pose,
  visited: Set<string>
): boolean {
  const ok = sampleOnePoseChild(node, ctx, out, visited, 'TranslationLimit')
  const d = node.Data ?? {}
  const boneName = readTransformIndexFromRaw(d.constrainedTransform)
  const idx = resolveUnifiedName(out, ctx.rig, boneName)
  if (idx < 0) {
    if (boneName) warnBoneMissing(ctx, node.HandleId, boneName)
    return ok
  }
  const parentName = readTransformIndexFromRaw(d.parentTransform)
  const parentIdx = parentName ? resolveUnifiedName(out, ctx.rig, parentName) : -1
  applyTranslationLimit(
    out,
    ctx.rig,
    idx,
    parentIdx,
    readFloatClamp(d.limitOnXAxis),
    readFloatClamp(d.limitOnYAxis),
    readFloatClamp(d.limitOnZAxis)
  )
  return ok
}

type DrivenChannelType =
  | 'FloatTrack'
  | 'TransX'
  | 'TransY'
  | 'TransZ'
  | 'RotEulZ_Pitch'
  | 'RotEulX_Roll'
  | 'RotEulY_Yaw'
  | 'ScaleX'
  | 'ScaleY'
  | 'ScaleZ'
  | 'RotQuatX'
  | 'RotQuatY'
  | 'RotQuatZ'
  | 'RotQuatW'

function parseDrivenChannelType(raw: unknown): DrivenChannelType {
  const s = String(raw ?? 'FloatTrack')
  const known: DrivenChannelType[] = [
    'FloatTrack',
    'TransX',
    'TransY',
    'TransZ',
    'RotEulZ_Pitch',
    'RotEulX_Roll',
    'RotEulY_Yaw',
    'ScaleX',
    'ScaleY',
    'ScaleZ',
    'RotQuatX',
    'RotQuatY',
    'RotQuatZ',
    'RotQuatW',
  ]
  for (const k of known) {
    if (s.includes(k) || s.endsWith(k)) return k
  }
  return 'FloatTrack'
}

function readDrivenChannel(
  pose: Pose,
  rig: RigEntry,
  channelName: string,
  channelType: DrivenChannelType
): number {
  if (channelType === 'FloatTrack') {
    const ti = resolveTrackUnified(pose, rig, channelName)
    return readTrackValue(pose, ti)
  }
  const bi = resolveUnifiedName(pose, rig, channelName)
  if (bi < 0) return 0
  const ls: Qs = {
    tx: 0,
    ty: 0,
    tz: 0,
    qx: 0,
    qy: 0,
    qz: 0,
    qw: 1,
    sx: 1,
    sy: 1,
    sz: 1,
  }
  if (!readBoneLs(pose, bi, ls)) return 0
  switch (channelType) {
    case 'TransX':
      return ls.tx
    case 'TransY':
      return ls.ty
    case 'TransZ':
      return ls.tz
    case 'ScaleX':
      return ls.sx
    case 'ScaleY':
      return ls.sy
    case 'ScaleZ':
      return ls.sz
    case 'RotQuatX':
      return ls.qx
    case 'RotQuatY':
      return ls.qy
    case 'RotQuatZ':
      return ls.qz
    case 'RotQuatW':
      return ls.qw
    case 'RotEulZ_Pitch':
    case 'RotEulX_Roll':
    case 'RotEulY_Yaw': {
      const e = quatToEulerDeg(ls.qx, ls.qy, ls.qz, ls.qw)
      if (channelType === 'RotEulZ_Pitch') return e.pitch
      if (channelType === 'RotEulX_Roll') return e.roll
      return e.yaw
    }
    default:
      return 0
  }
}

function writeDrivenChannel(
  pose: Pose,
  rig: RigEntry,
  channelName: string,
  channelType: DrivenChannelType,
  value: number
): void {
  if (channelType === 'FloatTrack') {
    writeTrackValue(pose, resolveTrackUnified(pose, rig, channelName), value)
    return
  }
  const bi = resolveUnifiedName(pose, rig, channelName)
  if (bi < 0) return
  const ls: Qs = {
    tx: 0,
    ty: 0,
    tz: 0,
    qx: 0,
    qy: 0,
    qz: 0,
    qw: 1,
    sx: 1,
    sy: 1,
    sz: 1,
  }
  if (!readBoneLs(pose, bi, ls)) return
  switch (channelType) {
    case 'TransX':
      ls.tx = value
      break
    case 'TransY':
      ls.ty = value
      break
    case 'TransZ':
      ls.tz = value
      break
    case 'ScaleX':
      ls.sx = value
      break
    case 'ScaleY':
      ls.sy = value
      break
    case 'ScaleZ':
      ls.sz = value
      break
    case 'RotQuatX':
      ls.qx = value
      break
    case 'RotQuatY':
      ls.qy = value
      break
    case 'RotQuatZ':
      ls.qz = value
      break
    case 'RotQuatW':
      ls.qw = value
      break
    case 'RotEulZ_Pitch':
    case 'RotEulX_Roll':
    case 'RotEulY_Yaw': {
      const e = quatToEulerDeg(ls.qx, ls.qy, ls.qz, ls.qw)
      if (channelType === 'RotEulZ_Pitch') e.pitch = value
      else if (channelType === 'RotEulX_Roll') e.roll = value
      else e.yaw = value
      const q = eulerDegToQuat(e.pitch, e.roll, e.yaw)
      ls.qx = q.qx
      ls.qy = q.qy
      ls.qz = q.qz
      ls.qw = q.qw
      break
    }
    default:
      return
  }
  writeBoneLs(pose, bi, ls)
}

function sampleSetDrivenKey(
  node: AnimgraphNode,
  ctx: SampleCtx,
  out: Pose,
  visited: Set<string>
): boolean {
  const ok = sampleOnePoseChild(node, ctx, out, visited, 'SetDrivenKey')
  const provider = unwrapData(node.Data?.provider)
  const entries = Array.isArray(provider?.entries) ? provider.entries : []
  for (const raw of entries) {
    const e = unwrapData(raw)
    if (!e) continue
    const inName = readCName(e.inChannelName)
    const outName = readCName(e.outChannelName)
    const inType = parseDrivenChannelType(e.inChanelType ?? e.inChannelType)
    const outType = parseDrivenChannelType(e.outChanelType ?? e.outChannelType)
    const inVal = readDrivenChannel(out, ctx.rig, inName, inType)
    const outVal = evalCurveFloatData(e.curve, inVal)
    writeDrivenChannel(out, ctx.rig, outName, outType, outVal)
  }
  return ok
}

function readHandleStubId(raw: unknown): string {
  if (!raw || typeof raw !== 'object') return '?'
  const o = raw as { HandleId?: string; HandleRefId?: string }
  return String(o.HandleId || o.HandleRefId || '?')
}

function sampleAdditionalTransform(
  node: AnimgraphNode,
  ctx: SampleCtx,
  out: Pose,
  visited: Set<string>
): boolean {
  const ok = sampleOnePoseChild(node, ctx, out, visited, 'AdditionalTransform')
  const container =
    resolveEmbeddedData(node.Data?.additionalTransforms, ctx.handles) ??
    unwrapData(node.Data?.additionalTransforms)
  const entries = Array.isArray(container?.entries)
    ? container.entries
    : Array.isArray(node.Data?.additionalTransforms)
      ? (node.Data.additionalTransforms as unknown[])
      : []
  for (let i = 0; i < entries.length; i++) {
    const raw = entries[i]
    const e = resolveEmbeddedData(raw, ctx.handles)
    if (!e) {
      // Empty list is fine; a present slot that fails to resolve is not.
      pushSampleWarning(ctx, {
        code: 'additional-transform-entry',
        handleId: node.HandleId,
        message: `AdditionalTransform #${node.HandleId} entry[${i}] unresolved (handle ${readHandleStubId(raw)})`,
      })
      continue
    }
    const info = unwrapData(e.transformInfo) ?? e
    const name = readCName(info.name) || readCName(e.name)
    if (!name || name === 'None') continue
    const value = readQsTransform(e.value)
    let idx = resolveUnifiedName(out, ctx.rig, name)
    if (idx < 0) {
      const parentName = readCName(info.parentName)
      const parentUnified = resolveUnifiedName(out, ctx.rig, parentName)
      const ref = readQsTransform(info.referenceTransformLs)
      const slot = pushStackSlot(
        out,
        name,
        parentUnified,
        value.tx || ref.tx,
        value.ty || ref.ty,
        value.tz || ref.tz,
        value.qx,
        value.qy,
        value.qz,
        value.qw,
        value.sx,
        value.sy,
        value.sz
      )
      if (slot < 0) continue
      idx = out.boneCount + slot
    }
    writeBoneLs(out, idx, value)
  }
  return ok
}

/**
 * Engine AnimNode_AdditionalFloatTrack::OnSample —
 * curve(i_time) → extra/rig float track; missing tracks pushed onto track stack.
 */
function sampleAdditionalFloatTrack(
  node: AnimgraphNode,
  ctx: SampleCtx,
  out: Pose,
  visited: Set<string>
): boolean {
  // Base is PoseLink (not OnePoseInput) — follow updateSucc / poseInputNode.
  const kids = updateKids(ctx, node.HandleId)
  let ok = true
  if (kids.length) {
    ok = sampleByHandleId(kids[0], ctx, out, visited)
  } else {
    const poseIn = resolveHandle(ctx.handles, node.Data?.poseInputNode)
    if (poseIn) ok = sampleNode(poseIn, ctx, out, visited)
    else {
      logMissingUpdateSucc(ctx, node, 'AdditionalFloatTrack expected poseInputNode')
      writeRefPose(ctx, out)
      return false
    }
  }

  const container =
    resolveEmbeddedData(node.Data?.additionalTracks, ctx.handles) ??
    unwrapData(node.Data?.additionalTracks)
  const entries = Array.isArray(container?.entries) ? container.entries : []
  const overwrite =
    container && Object.prototype.hasOwnProperty.call(container, 'overwriteExistingValues')
      ? readBool(container.overwriteExistingValues)
      : true
  const time = ctx.additionalFloatTrackTimes?.get(node.HandleId) ?? 0

  for (let i = 0; i < entries.length; i++) {
    const raw = entries[i]
    const e = resolveEmbeddedData(raw, ctx.handles)
    if (!e) {
      pushSampleWarning(ctx, {
        code: 'additional-float-track-entry',
        handleId: node.HandleId,
        message: `AdditionalFloatTrack #${node.HandleId} entry[${i}] unresolved (handle ${readHandleStubId(raw)})`,
      })
      continue
    }
    const info = unwrapData(e.trackInfo) ?? e
    const name = readCName(info.name) || readCName(e.name)
    if (!name || name === 'None') continue
    const ref = readNumber(info.referenceValue, 0)
    let idx = resolveTrackUnified(out, ctx.rig, name)
    if (idx < 0) {
      const slot = pushTrackSlot(out, name, ref)
      if (slot < 0) {
        pushSampleWarning(ctx, {
          code: 'additional-float-track-entry',
          handleId: node.HandleId,
          message: `AdditionalFloatTrack #${node.HandleId} track stack full, cannot add "${name}"`,
        })
        continue
      }
      idx = out.trackCount + slot
    } else if (!overwrite) {
      continue
    }
    const values = e.values
    let value = ref
    if (values && typeof values === 'object') {
      const els = (values as { Elements?: unknown }).Elements
      if (Array.isArray(els) && els.length > 0) {
        value = evalCurveFloatData(values, time)
      }
    }
    writeTrackValue(out, idx, value)
  }
  return ok
}

function parseInterpolationType(raw: unknown): 'Slerp' | 'Lerp' {
  const s = String(raw ?? 'Slerp')
  if (s.includes('Lerp') && !s.includes('Slerp')) return 'Lerp'
  return 'Slerp'
}

function sampleParentConstraint(
  node: AnimgraphNode,
  ctx: SampleCtx,
  out: Pose,
  visited: Set<string>
): boolean {
  const ok = sampleOnePoseChild(node, ctx, out, visited, 'ParentConstraint')
  const d = node.Data ?? {}
  const transformName = readTransformIndexFromRaw(d.transformIndex)
  const parentName = readTransformIndexFromRaw(d.parentTransformIndex)
  const transformIdx = resolveUnifiedName(out, ctx.rig, transformName)
  const parentIdx = resolveUnifiedName(out, ctx.rig, parentName)
  if (transformIdx < 0) {
    if (transformName) warnBoneMissing(ctx, node.HandleId, transformName)
    return ok
  }
  if (parentIdx < 0) {
    if (parentName) {
      pushSampleWarning(ctx, {
        code: 'bone-op-missing',
        handleId: node.HandleId,
        message: `ParentConstraint #${node.HandleId} missing parent "${parentName}"`,
      })
    }
    return ok
  }

  const snap = ctx.boneOpCache?.parentConstraint.get(node.HandleId)
  let weight = snap?.weight ?? readNumber(d.weight, 1)
  const trackName = readNamedTrackFieldName(d.weightFloatTrack)
  if (trackName && trackName !== 'None') {
    const ti = resolveTrackUnified(out, ctx.rig, trackName)
    if (ti >= 0) weight = readTrackValue(out, ti)
  }

  applyParentConstraint(
    out,
    ctx.rig,
    transformIdx,
    parentIdx,
    weight,
    parseInterpolationType(d.interpolationType),
    readBool(d.useBoneReferencePoseAsDefaultOffset),
    snap?.hasOffsetE ? snap.offsetE : null,
    snap?.hasOffsetT ? snap.offsetT : null
  )
  return ok
}

/**
 * Engine AnimNode_FloatTrackDirectConnConstraint::OnSample —
 * track × mulFactor → LS channel; Slerp by weight.
 */
function sampleFloatTrackDirectConn(
  node: AnimgraphNode,
  ctx: SampleCtx,
  out: Pose,
  visited: Set<string>
): boolean {
  const ok = sampleOnePoseChild(node, ctx, out, visited, 'FloatTrackDirectConn')
  const d = node.Data ?? {}
  const transformName = readTransformIndexFromRaw(d.transformIndex)
  const trackName = readNamedTrackFieldName(d.floatTrackIndex)
  const transformIdx = resolveUnifiedName(out, ctx.rig, transformName)
  const trackIdx = resolveTrackUnified(out, ctx.rig, trackName)

  if (transformIdx < 0) {
    if (transformName) warnBoneMissing(ctx, node.HandleId, transformName)
    return ok
  }
  if (trackIdx < 0) {
    if (trackName && trackName !== 'None') {
      pushSampleWarning(ctx, {
        code: 'bone-op-missing',
        handleId: node.HandleId,
        message: `FloatTrackDirectConn #${node.HandleId} missing track "${trackName}"`,
      })
    }
    return ok
  }

  const snap = ctx.boneOpCache?.floatTrackConn.get(node.HandleId)
  const weight = snap?.weight ?? readNumber(d.weight, 1)
  const mulFactor = snap?.mulFactor ?? readNumber(d.mulFactor, 1)
  if (!(weight > 0)) return ok

  const floatTrack = mulFactor * readTrackValue(out, trackIdx)
  applyFloatTrackDirectConn(
    out,
    transformIdx,
    parseTransformChannel(d.channel),
    floatTrack,
    weight
  )
  return ok
}

/**
 * Engine AnimNode_TransformToTrack::OnSample —
 * LS channel × mulFactor → track; Lerp by weight.
 */
function sampleTransformToTrack(
  node: AnimgraphNode,
  ctx: SampleCtx,
  out: Pose,
  visited: Set<string>
): boolean {
  const ok = sampleOnePoseChild(node, ctx, out, visited, 'TransformToTrack')
  const d = node.Data ?? {}
  const transformName = readTransformIndexFromRaw(d.transformIndex)
  const trackName = readNamedTrackFieldName(d.floatTrackIndex)
  const transformIdx = resolveUnifiedName(out, ctx.rig, transformName)
  const trackIdx = resolveTrackUnified(out, ctx.rig, trackName)

  if (transformIdx < 0) {
    if (transformName) warnBoneMissing(ctx, node.HandleId, transformName)
    return ok
  }
  if (trackIdx < 0) {
    if (trackName && trackName !== 'None') {
      pushSampleWarning(ctx, {
        code: 'bone-op-missing',
        handleId: node.HandleId,
        message: `TransformToTrack #${node.HandleId} missing track "${trackName}"`,
      })
    }
    return ok
  }

  const snap = ctx.boneOpCache?.floatTrackConn.get(node.HandleId)
  const weight = snap?.weight ?? readNumber(d.weight, 1)
  const mulFactor = snap?.mulFactor ?? readNumber(d.mulFactor, 1)
  applyTransformToTrack(
    out,
    transformIdx,
    trackIdx,
    parseTransformChannel(d.channel),
    mulFactor,
    weight
  )
  return ok
}

function resolveConstraintWeight(
  node: AnimgraphNode,
  ctx: SampleCtx,
  pose: Pose
): number {
  const d = node.Data ?? {}
  const mode = String(d.weightMode ?? '')
  const trackName = readNamedTrackFieldName(d.weightFloatTrack)
  const useTrack =
    mode.includes('FloatTrack') ||
    (!mode.includes('Static') && !!trackName && trackName !== 'None')
  if (useTrack && trackName && trackName !== 'None') {
    const ti = resolveTrackUnified(pose, ctx.rig, trackName)
    if (ti >= 0) {
      const w = readTrackValue(pose, ti)
      return Math.min(1, Math.max(0, w))
    }
  }
  return Math.min(1, Math.max(0, readNumber(d.weight, 1)))
}

/**
 * Legacy SourceChannel_WeightedVector / WeightedQuat peel (diagram-projected data).
 * Prefer modern constraint fields; use this only as fallback.
 * Aim ignores returned weight (engine Resave copies transform only).
 */
function peelWeightedChannelEntry(
  raw: unknown,
  pose: Pose,
  ctx: SampleCtx
): { boneName: string; boneIdx: number; weight: number } | null {
  const e = resolveEmbeddedData(raw, ctx.handles)
  if (!e) return null
  const ch = resolveEmbeddedData(e.channel, ctx.handles)
  const src = ch ?? e
  const boneName = readTransformIndexFromRaw(src.transformIndex ?? src.transform)
  const boneIdx = resolveUnifiedName(pose, ctx.rig, boneName)
  let weight = readNumber(e.weight, 1)
  const trackName = readNamedTrackFieldName(e.weightFloatTrack)
  if (trackName && trackName !== 'None') {
    const ti = resolveTrackUnified(pose, ctx.rig, trackName)
    if (ti >= 0) weight = readTrackValue(pose, ti)
  }
  return {
    boneName,
    boneIdx,
    weight: Math.min(1, Math.max(0, weight)),
  }
}

function sampleOrientConstraint(
  node: AnimgraphNode,
  ctx: SampleCtx,
  out: Pose,
  visited: Set<string>
): boolean {
  const ok = sampleOnePoseChild(node, ctx, out, visited, 'OrientConstraint')
  const d = node.Data ?? {}
  const transformName = readTransformIndexFromRaw(d.transformIndex)
  const transformIdx = resolveUnifiedName(out, ctx.rig, transformName)
  if (transformIdx < 0) {
    if (transformName) warnBoneMissing(ctx, node.HandleId, transformName)
    return ok
  }

  const inputs: number[] = []
  const weights: number[] = []
  const weighted = Array.isArray(d.inputWeightedTransforms) ? d.inputWeightedTransforms : []
  if (weighted.length) {
    for (const raw of weighted) {
      const e = unwrapData(raw)
      if (!e) continue
      const name = readTransformIndexFromRaw(e.transform)
      const idx = resolveUnifiedName(out, ctx.rig, name)
      if (idx < 0) {
        if (name) warnBoneMissing(ctx, node.HandleId, name)
        return ok
      }
      inputs.push(idx)
      weights.push(readNumber(e.weight, 1))
    }
  } else {
    // Fallback: WeightedQuat channels
    const legacy = Array.isArray(d.inputTransforms) ? d.inputTransforms : []
    for (const raw of legacy) {
      const peeled = peelWeightedChannelEntry(raw, out, ctx)
      if (!peeled) continue
      if (peeled.boneIdx < 0) {
        if (peeled.boneName) warnBoneMissing(ctx, node.HandleId, peeled.boneName)
        return ok
      }
      inputs.push(peeled.boneIdx)
      weights.push(peeled.weight)
    }
  }
  if (!inputs.length) return ok

  applyOrientConstraint(
    out,
    ctx.rig,
    transformIdx,
    inputs,
    weights,
    resolveConstraintWeight(node, ctx, out)
  )
  return ok
}

function resolveParentInfoWeight(
  e: Record<string, unknown>,
  pose: Pose,
  ctx: SampleCtx
): number {
  const mode = String(e.parentWeightMode ?? '')
  const trackName = readNamedTrackFieldName(e.parentTrackWeight)
  const useTrack =
    mode.includes('FloatTrack') ||
    (!mode.includes('Static') && !!trackName && trackName !== 'None')
  let w = readNumber(e.parentStaticWeight, 1)
  if (useTrack && trackName && trackName !== 'None') {
    const ti = resolveTrackUnified(pose, ctx.rig, trackName)
    if (ti >= 0) w = readTrackValue(pose, ti)
  }
  w = Math.min(1, Math.max(0, w))
  if (readBool(e.useComplementWeight)) w = 1 - w
  return w
}

function sampleMultipleParentConstraint(
  node: AnimgraphNode,
  ctx: SampleCtx,
  out: Pose,
  visited: Set<string>
): boolean {
  const ok = sampleOnePoseChild(node, ctx, out, visited, 'MultipleParentConstraint')
  const d = node.Data ?? {}
  const transformName = readTransformIndexFromRaw(d.transformIndex)
  const transformIdx = resolveUnifiedName(out, ctx.rig, transformName)
  if (transformIdx < 0) {
    if (transformName) warnBoneMissing(ctx, node.HandleId, transformName)
    return ok
  }

  const parents: MultipleParentInfo[] = []
  const modern = Array.isArray(d.parentsTransforms) ? d.parentsTransforms : []
  if (modern.length) {
    for (const raw of modern) {
      const e = unwrapData(raw)
      if (!e) continue
      const name = readTransformIndexFromRaw(e.parentTransform)
      const idx = resolveUnifiedName(out, ctx.rig, name)
      if (idx < 0) {
        if (name) warnBoneMissing(ctx, node.HandleId, name)
        return ok
      }
      parents.push({
        parentUnified: idx,
        weight: resolveParentInfoWeight(e, out, ctx),
        useOffset: readBool(e.useOffset),
        offset: readQsTransform(e.offset),
      })
    }
  } else {
    // Fallback: legacy parentsTransform[+parentsWeight] SourceChannels
    const legT = Array.isArray(d.parentsTransform) ? d.parentsTransform : []
    const legW = Array.isArray(d.parentsWeight) ? d.parentsWeight : []
    for (let i = 0; i < legT.length; i++) {
      const tRaw = resolveEmbeddedData(legT[i], ctx.handles)
      if (!tRaw) continue
      const name = readTransformIndexFromRaw(tRaw.transformIndex ?? tRaw.transform)
      const idx = resolveUnifiedName(out, ctx.rig, name)
      if (idx < 0) {
        if (name) warnBoneMissing(ctx, node.HandleId, name)
        return ok
      }
      let w = 1
      let useComplement = false
      const wEntry = legW[i]
      if (wEntry != null) {
        const wData = resolveEmbeddedData(wEntry, ctx.handles)
        if (wData) {
          useComplement = readBool(wData.useComplementValue)
          const trackName = readNamedTrackFieldName(wData.floatTrack)
          if (trackName && trackName !== 'None') {
            const ti = resolveTrackUnified(out, ctx.rig, trackName)
            if (ti >= 0) w = readTrackValue(out, ti)
          } else {
            w = readNumber(wData.weight ?? wData.value, 1)
          }
        }
      }
      w = Math.min(1, Math.max(0, w))
      if (useComplement) w = 1 - w
      parents.push({
        parentUnified: idx,
        weight: w,
        useOffset: false,
        offset: { ...IDENTITY_QS },
      })
    }
  }
  if (!parents.length) return ok

  applyMultipleParentConstraint(
    out,
    ctx.rig,
    transformIdx,
    parents,
    resolveConstraintWeight(node, ctx, out),
    parseInterpolationType(d.interpolationType)
  )
  return ok
}

function samplePointConstraint(
  node: AnimgraphNode,
  ctx: SampleCtx,
  out: Pose,
  visited: Set<string>
): boolean {
  const ok = sampleOnePoseChild(node, ctx, out, visited, 'PointConstraint')
  const d = node.Data ?? {}
  const transformName = readTransformIndexFromRaw(d.transformIndex)
  const transformIdx = resolveUnifiedName(out, ctx.rig, transformName)
  if (transformIdx < 0) {
    if (transformName) warnBoneMissing(ctx, node.HandleId, transformName)
    return ok
  }

  const inputs: number[] = []
  const weights: number[] = []
  const weighted = Array.isArray(d.inputWeightedTransforms) ? d.inputWeightedTransforms : []
  if (weighted.length) {
    for (const raw of weighted) {
      const e = unwrapData(raw)
      if (!e) continue
      const name = readTransformIndexFromRaw(e.transform)
      const idx = resolveUnifiedName(out, ctx.rig, name)
      if (idx < 0) {
        if (name) warnBoneMissing(ctx, node.HandleId, name)
        return ok
      }
      inputs.push(idx)
      weights.push(readNumber(e.weight, 1))
    }
  } else {
    // Fallback: WeightedVector channels
    const legacy = Array.isArray(d.inputTransforms) ? d.inputTransforms : []
    for (const raw of legacy) {
      const peeled = peelWeightedChannelEntry(raw, out, ctx)
      if (!peeled) continue
      if (peeled.boneIdx < 0) {
        if (peeled.boneName) warnBoneMissing(ctx, node.HandleId, peeled.boneName)
        return ok
      }
      inputs.push(peeled.boneIdx)
      weights.push(peeled.weight)
    }
  }
  if (!inputs.length) return ok

  const preRaw = Array.isArray(d.preprocessedWeights) ? d.preprocessedWeights : null
  const pre =
    preRaw && preRaw.length === weights.length
      ? preRaw.map((w) => readNumber(w, 0))
      : preprocessPointWeights(weights)

  applyPointConstraint(
    out,
    ctx.rig,
    transformIdx,
    inputs,
    weights,
    resolveConstraintWeight(node, ctx, out),
    pre
  )
  return ok
}

/** Resolve AimConstraint upTransform channel → MS point. */
type AimUpPointResult =
  | { ok: true; x: number; y: number; z: number }
  | { ok: false; detail: string }

function resolveAimUpPoint(
  node: AnimgraphNode,
  ctx: SampleCtx,
  pose: Pose,
  boneIdx: number
): AimUpPointResult {
  const d = node.Data ?? {}
  const t = handleType(node)

  if (t === 'animAnimNode_AimConstraint_ObjectRotationUp') {
    const upName = readTransformIndexFromRaw(d.upTransform)
    const upIdx = resolveUnifiedName(pose, ctx.rig, upName)
    if (upIdx < 0) {
      return {
        ok: false,
        detail: upName
          ? `missing up bone "${upName}"`
          : 'missing upTransform bone name',
      }
    }
    const upMs = {
      tx: 0,
      ty: 0,
      tz: 0,
      qx: 0,
      qy: 0,
      qz: 0,
      qw: 1,
      sx: 1,
      sy: 1,
      sz: 1,
    }
    const boneMs = { ...upMs }
    if (!getTransformMs(pose, ctx.rig, upIdx, upMs)) {
      return { ok: false, detail: `up bone "${upName}" MS resolve failed` }
    }
    if (!getTransformMs(pose, ctx.rig, boneIdx, boneMs)) {
      return { ok: false, detail: 'constrained bone MS resolve failed' }
    }
    const v = readVector3FromData(d.upTransformVector)
    const axis = v.x === 0 && v.y === 0 && v.z === 0 ? { x: 0, y: 1, z: 0 } : v
    // Rotate(upRot, vec) + bonePos
    const ix = upMs.qw * axis.x + upMs.qy * axis.z - upMs.qz * axis.y
    const iy = upMs.qw * axis.y + upMs.qz * axis.x - upMs.qx * axis.z
    const iz = upMs.qw * axis.z + upMs.qx * axis.y - upMs.qy * axis.x
    const iw = -upMs.qx * axis.x - upMs.qy * axis.y - upMs.qz * axis.z
    return {
      ok: true,
      x: boneMs.tx + (ix * upMs.qw + iw * -upMs.qx + iy * -upMs.qz - iz * -upMs.qy),
      y: boneMs.ty + (iy * upMs.qw + iw * -upMs.qy + iz * -upMs.qx - ix * -upMs.qz),
      z: boneMs.tz + (iz * upMs.qw + iw * -upMs.qz + ix * -upMs.qy - iy * -upMs.qx),
    }
  }

  if (t === 'animAnimNode_AimConstraint_ObjectUp') {
    const upName = readTransformIndexFromRaw(d.upTransform)
    const upIdx = resolveUnifiedName(pose, ctx.rig, upName)
    if (upIdx < 0) {
      return {
        ok: false,
        detail: upName
          ? `missing up bone "${upName}"`
          : 'missing upTransform bone name',
      }
    }
    const ms = {
      tx: 0,
      ty: 0,
      tz: 0,
      qx: 0,
      qy: 0,
      qz: 0,
      qw: 1,
      sx: 1,
      sy: 1,
      sz: 1,
    }
    if (!getTransformMs(pose, ctx.rig, upIdx, ms)) {
      return { ok: false, detail: `up bone "${upName}" MS resolve failed` }
    }
    return { ok: true, x: ms.tx, y: ms.ty, z: ms.tz }
  }

  // Base AimConstraint: upTransform is IAnimNodeSourceChannel_Vector (Handle or inline)
  const ch = resolveEmbeddedData(d.upTransform, ctx.handles)
  if (!ch) {
    return { ok: false, detail: 'missing upTransform channel' }
  }
  const chType = String(ch.$type ?? '')

  if (chType.includes('StaticVector')) {
    const v = readVector3FromData(ch.data ?? ch.value ?? ch)
    return { ok: true, x: v.x, y: v.y, z: v.z }
  }
  if (chType.includes('OrientationVector')) {
    const oriName = readTransformIndexFromRaw(ch.transformIndex)
    const inputName = readTransformIndexFromRaw(ch.inputTransformIndex)
    const oriIdx = resolveUnifiedName(pose, ctx.rig, oriName)
    const inputIdx = resolveUnifiedName(pose, ctx.rig, inputName || readTransformIndexFromRaw(d.transformIndex))
    if (oriIdx < 0) {
      return {
        ok: false,
        detail: oriName
          ? `missing OrientationVector bone "${oriName}"`
          : 'missing OrientationVector.transformIndex',
      }
    }
    if (inputIdx < 0) {
      return {
        ok: false,
        detail: inputName
          ? `missing OrientationVector input "${inputName}"`
          : 'missing OrientationVector.inputTransformIndex',
      }
    }
    const oriMs = {
      tx: 0,
      ty: 0,
      tz: 0,
      qx: 0,
      qy: 0,
      qz: 0,
      qw: 1,
      sx: 1,
      sy: 1,
      sz: 1,
    }
    const inMs = { ...oriMs }
    if (!getTransformMs(pose, ctx.rig, oriIdx, oriMs)) {
      return { ok: false, detail: `OrientationVector bone "${oriName}" MS resolve failed` }
    }
    if (!getTransformMs(pose, ctx.rig, inputIdx, inMs)) {
      return {
        ok: false,
        detail: `OrientationVector input "${inputName || '?'}" MS resolve failed`,
      }
    }
    const up = readVector3FromData(ch.up)
    const axis = up.x === 0 && up.y === 0 && up.z === 0 ? { x: 0, y: 1, z: 0 } : up
    const ix = oriMs.qw * axis.x + oriMs.qy * axis.z - oriMs.qz * axis.y
    const iy = oriMs.qw * axis.y + oriMs.qz * axis.x - oriMs.qx * axis.z
    const iz = oriMs.qw * axis.z + oriMs.qx * axis.y - oriMs.qy * axis.x
    const iw = -oriMs.qx * axis.x - oriMs.qy * axis.y - oriMs.qz * axis.z
    return {
      ok: true,
      x: inMs.tx + (ix * oriMs.qw + iw * -oriMs.qx + iy * -oriMs.qz - iz * -oriMs.qy),
      y: inMs.ty + (iy * oriMs.qw + iw * -oriMs.qy + iz * -oriMs.qx - ix * -oriMs.qz),
      z: inMs.tz + (iz * oriMs.qw + iw * -oriMs.qz + ix * -oriMs.qy - iy * -oriMs.qx),
    }
  }

  // TransformVector / ReferenceTransformVector / default: MS translation of transformIndex
  const boneName = readTransformIndexFromRaw(ch.transformIndex ?? ch.transform)
  const idx = resolveUnifiedName(pose, ctx.rig, boneName)
  if (idx < 0) {
    return {
      ok: false,
      detail: boneName
        ? `missing up bone "${boneName}"${chType ? ` (${chType.replace(/^animAnimNodeSourceChannel_/, '')})` : ''}`
        : `missing upTransform.transformIndex${chType ? ` (${chType})` : ''}`,
    }
  }
  if (chType.includes('ReferenceTransform')) {
    // Bind pose MS translation approx via FK of ref LS — use current if no ref helper
    const ms = {
      tx: 0,
      ty: 0,
      tz: 0,
      qx: 0,
      qy: 0,
      qz: 0,
      qw: 1,
      sx: 1,
      sy: 1,
      sz: 1,
    }
    if (!getTransformMs(pose, ctx.rig, idx, ms)) {
      return { ok: false, detail: `up bone "${boneName}" MS resolve failed` }
    }
    return { ok: true, x: ms.tx, y: ms.ty, z: ms.tz }
  }
  const ms = {
    tx: 0,
    ty: 0,
    tz: 0,
    qx: 0,
    qy: 0,
    qz: 0,
    qw: 1,
    sx: 1,
    sy: 1,
    sz: 1,
  }
  if (!getTransformMs(pose, ctx.rig, idx, ms)) {
    return { ok: false, detail: `up bone "${boneName}" MS resolve failed` }
  }
  return { ok: true, x: ms.tx, y: ms.ty, z: ms.tz }
}

function sampleAimConstraint(
  node: AnimgraphNode,
  ctx: SampleCtx,
  out: Pose,
  visited: Set<string>
): boolean {
  const ok = sampleOnePoseChild(node, ctx, out, visited, 'AimConstraint')
  const d = node.Data ?? {}
  const transformName = readTransformIndexFromRaw(d.transformIndex)
  let targetName = readTransformIndexFromRaw(d.targetTransform)
  // Fallback only: legacy targetTransforms[0] WeightedVector → channel TransformVector
  if (!targetName) {
    const arr = Array.isArray(d.targetTransforms) ? d.targetTransforms : []
    const peeled = peelWeightedChannelEntry(arr[0], out, ctx)
    if (peeled) targetName = peeled.boneName
  }
  const transformIdx = resolveUnifiedName(out, ctx.rig, transformName)
  const targetIdx = resolveUnifiedName(out, ctx.rig, targetName)
  if (transformIdx < 0) {
    if (transformName) warnBoneMissing(ctx, node.HandleId, transformName)
    return ok
  }
  if (targetIdx < 0) {
    if (targetName) warnBoneMissing(ctx, node.HandleId, targetName)
    return ok
  }

  const targetMs = {
    tx: 0,
    ty: 0,
    tz: 0,
    qx: 0,
    qy: 0,
    qz: 0,
    qw: 1,
    sx: 1,
    sy: 1,
    sz: 1,
  }
  if (!getTransformMs(out, ctx.rig, targetIdx, targetMs)) return ok
  const upRes = resolveAimUpPoint(node, ctx, out, transformIdx)
  if (!upRes.ok) {
    pushSampleWarning(ctx, {
      code: 'bone-op-missing',
      handleId: node.HandleId,
      message: `AimConstraint #${node.HandleId} ${upRes.detail}`,
    })
    return ok
  }

  const fwd = readVector3FromData(d.forwardAxisLS)
  const upAx = readVector3FromData(d.upAxisLS)
  applyAimConstraint(
    out,
    ctx.rig,
    transformIdx,
    { x: targetMs.tx, y: targetMs.ty, z: targetMs.tz },
    { x: upRes.x, y: upRes.y, z: upRes.z },
    fwd.x === 0 && fwd.y === 0 && fwd.z === 0 ? { x: 1, y: 0, z: 0 } : fwd,
    upAx.x === 0 && upAx.y === 0 && upAx.z === 0 ? { x: 0, y: 1, z: 0 } : upAx,
    resolveConstraintWeight(node, ctx, out)
  )
  return ok
}

function sampleParentTransform(
  node: AnimgraphNode,
  ctx: SampleCtx,
  out: Pose,
  visited: Set<string>
): boolean {
  const ok = sampleOnePoseChild(node, ctx, out, visited, 'ParentTransform')
  const mapping = Array.isArray(node.Data?.mapping) ? node.Data.mapping : []
  for (const raw of mapping) {
    const e = unwrapData(raw)
    if (!e) continue
    const fromName = readCName(e.from)
    const toName = readCName(e.to)
    if (!toName || toName === 'None') continue
    const toIdx = resolveUnifiedName(out, ctx.rig, toName)
    if (toIdx < 0) {
      warnBoneMissing(ctx, node.HandleId, toName)
      continue
    }
    let fromQs: Qs | null = null
    const cached = fromName ? ctx.parentTransforms?.get(fromName.toLowerCase()) : undefined
    if (cached) {
      fromQs = cached
    } else {
      const fromIdx = resolveUnifiedName(out, ctx.rig, fromName)
      if (fromIdx >= 0) {
        const ms: Qs = {
          tx: 0,
          ty: 0,
          tz: 0,
          qx: 0,
          qy: 0,
          qz: 0,
          qw: 1,
          sx: 1,
          sy: 1,
          sz: 1,
        }
        if (getTransformMs(out, ctx.rig, fromIdx, ms)) fromQs = ms
      }
    }
    if (!fromQs) {
      pushSampleWarning(ctx, {
        code: 'bone-op-missing',
        handleId: node.HandleId,
        message: `ParentTransform #${node.HandleId} missing from "${fromName || '?'}"`,
      })
      continue
    }

    // Engine: weightTrack blend current→from (intended Interpolate; weight≥1 → snap).
    const weightTrackName = readNamedTrackFieldName(e.weightTrack)
    let weight = 1
    if (weightTrackName && weightTrackName !== 'None') {
      const wi = resolveTrackUnified(out, ctx.rig, weightTrackName)
      if (wi >= 0) weight = readTrackValue(out, wi)
    }
    if (weight >= 1) {
      writeBoneLs(out, toIdx, fromQs)
    } else if (weight > 0) {
      const current: Qs = {
        tx: 0,
        ty: 0,
        tz: 0,
        qx: 0,
        qy: 0,
        qz: 0,
        qw: 1,
        sx: 1,
        sy: 1,
        sz: 1,
      }
      readBoneLs(out, toIdx, current)
      writeBoneLs(out, toIdx, slerpQs(current, fromQs, weight))
    }
  }
  return ok
}

function mathExpressionPoseString(node: AnimgraphNode): string {
  const d = node.Data ?? {}
  const exprData =
    d.expressionData && typeof d.expressionData === 'object'
      ? (d.expressionData as Record<string, unknown>)
      : null
  return String(
    d.expressionString ?? exprData?.expressionString ?? exprData?.expression ?? d.expression ?? ''
  )
}

function readNamedTrackFieldName(raw: unknown): string {
  if (raw == null) return ''
  if (typeof raw === 'string') return raw
  if (typeof raw !== 'object') return ''
  const o = raw as Record<string, unknown>
  const inner =
    o.Data && typeof o.Data === 'object' ? (o.Data as Record<string, unknown>) : o
  return readCName(inner.name) || readCName(raw)
}

function sampleMathExpressionPose(
  node: AnimgraphNode,
  ctx: SampleCtx,
  out: Pose,
  visited: Set<string>
): boolean {
  const ok = sampleOnePoseChild(node, ctx, out, visited, 'MathExpressionPose')
  const expr = mathExpressionPoseString(node)
  const outTrackName = readNamedTrackFieldName(node.Data?.outputFloatTrack)
  const outIdx = resolveTrackUnified(out, ctx.rig, outTrackName)
  if (outIdx < 0) {
    if (outTrackName) {
      pushSampleWarning(ctx, {
        code: 'math-expr-pose',
        handleId: node.HandleId,
        message: `MathExpressionPose #${node.HandleId} output track "${outTrackName}" missing`,
      })
    }
    return ok
  }

  const floatSnaps = ctx.mathExprPoseCache?.floatSockets.get(node.HandleId) ?? []
  const vectorSnaps = ctx.mathExprPoseCache?.vectorSockets.get(node.HandleId) ?? []
  const quatSnaps = ctx.mathExprPoseCache?.quatSockets.get(node.HandleId) ?? []
  const compiled = getCompiledMathExpr(expr, ctx.mathExprCache)
  const floatIdents = compiled?.floatIdents ?? []
  const vectorIdents = compiled?.vectorIdents ?? []
  const quatIdents = compiled?.quatIdents ?? []
  const floatVars: Record<string, number> = {}
  const vectorVars: Record<string, SimVec4> = {}
  const quatVars: Record<string, SimVec4> = {}

  const exprData =
    node.Data?.expressionData && typeof node.Data.expressionData === 'object'
      ? (node.Data.expressionData as Record<string, unknown>)
      : null

  // Prefer Update snapshots; also rebuild from Data if cache empty (side-sample paths)
  const floatSockets =
    floatSnaps.length > 0
      ? floatSnaps
      : (() => {
          const arr = Array.isArray(exprData?.floatSockets) ? exprData.floatSockets : []
          return arr.map((raw, i) => {
            const sock =
              raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null
            const trackName = readNamedTrackFieldName(sock?.inputFloatTrack)
            return {
              varId: readNumber(sock?.expressionVarId, i),
              variableName: readCName(sock?.variableName),
              inputTrackName: trackName === 'None' ? '' : trackName,
              linkValue: 0,
            }
          })
        })()

  const vectorSockets =
    vectorSnaps.length > 0
      ? vectorSnaps
      : (() => {
          const arr = Array.isArray(exprData?.vectorSockets) ? exprData.vectorSockets : []
          return arr.map((raw, i) => {
            const sock =
              raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null
            return {
              varId: readNumber(sock?.expressionVarId, i),
              variableName: readCName(sock?.variableName),
              linkValue: { ...ZERO_VEC4 },
            }
          })
        })()

  const quatSockets =
    quatSnaps.length > 0
      ? quatSnaps
      : (() => {
          const arr = Array.isArray(exprData?.quaternionSockets)
            ? exprData.quaternionSockets
            : []
          return arr.map((raw, i) => {
            const sock =
              raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null
            return {
              varId: readNumber(sock?.expressionVarId, i),
              variableName: readCName(sock?.variableName),
              linkValue: { ...IDENTITY_QUAT_VEC4 },
            }
          })
        })()

  for (let i = 0; i < floatSockets.length; i++) {
    const s = floatSockets[i]!
    let v = s.linkValue
    if (s.inputTrackName) {
      const ti = resolveTrackUnified(out, ctx.rig, s.inputTrackName)
      if (ti >= 0) v = readTrackValue(out, ti)
    }
    const letter = String.fromCharCode(65 + Math.max(0, s.varId))
    const ident = floatIdents[s.varId] ?? floatIdents[i]
    if (s.variableName) floatVars[s.variableName] = v
    if (ident) floatVars[ident] = v
    floatVars[letter] = v
    if (i === 0 || s.varId === 0) {
      if (floatVars.In === undefined) floatVars.In = v
      if (floatVars.in === undefined) floatVars.in = v
    }
  }

  for (let i = 0; i < vectorSockets.length; i++) {
    const s = vectorSockets[i]!
    const v = s.linkValue
    const letter = String.fromCharCode(65 + Math.max(0, s.varId))
    const ident = vectorIdents[s.varId] ?? vectorIdents[i]
    if (s.variableName) vectorVars[s.variableName] = v
    if (ident) vectorVars[ident] = v
    vectorVars[letter] = v
    // Engine AutoRegisterVar stores full `$name`; also bind bare name.
    if (ident?.startsWith('$') && ident.length > 1) {
      vectorVars[ident.slice(1)] = v
    }
  }

  for (let i = 0; i < quatSockets.length; i++) {
    const s = quatSockets[i]!
    const v = s.linkValue
    const letter = String.fromCharCode(65 + Math.max(0, s.varId))
    const ident = quatIdents[s.varId] ?? quatIdents[i]
    if (s.variableName) quatVars[s.variableName] = v
    if (ident) quatVars[ident] = v
    quatVars[letter] = v
    if (ident?.startsWith('#') && ident.length > 1) {
      quatVars[ident.slice(1)] = v
    }
  }

  if (!expr.trim()) {
    pushSampleWarning(ctx, {
      code: 'math-expr-pose',
      handleId: node.HandleId,
      message: `MathExpressionPose #${node.HandleId} empty expressionString`,
    })
    return ok
  }

  const needsMixed =
    Object.keys(vectorVars).length > 0 ||
    Object.keys(quatVars).length > 0 ||
    !!compiled?.needsMixed

  const result = needsMixed
    ? evalAnimMathExpressionFloatMixed(
        expr,
        floatVars,
        vectorVars,
        quatVars,
        ctx.mathExprCache
      )
    : evalAnimMathExpression(expr, floatVars, ctx.mathExprCache)
  if (result == null) {
    pushSampleWarning(ctx, {
      code: 'math-expr-pose',
      handleId: node.HandleId,
      message: `MathExpressionPose #${node.HandleId} eval failed`,
    })
    return ok
  }

  writeTrackValue(out, outIdx, result)
  return ok
}

function sampleStackTracksExtender(
  node: AnimgraphNode,
  ctx: SampleCtx,
  out: Pose,
  visited: Set<string>
): boolean {
  const ok = sampleOnePoseChild(node, ctx, out, visited, 'StackTracksExtender')
  const newTracks = Array.isArray(node.Data?.newTracks) ? node.Data.newTracks : []
  let capacityWarned = false
  for (let i = 0; i < newTracks.length; i++) {
    if (out.trackStackCount >= out.trackStackCapacity) {
      if (!capacityWarned) {
        capacityWarned = true
        console.warn(
          `[sim] StackTracksExtender ${node.HandleId}: track stack full (${out.trackStackCapacity}), skipping remaining`
        )
      }
      break
    }
    const info = unwrapData(newTracks[i])
    const name = info
      ? readCName(info.name) || `track_stack_${i}`
      : readCName(newTracks[i]) || `track_stack_${i}`
    const ref = info ? readNumber(info.referenceValue, 0) : 0
    if (pushTrackSlot(out, name, ref) < 0) break
  }
  return ok
}

function sampleStackTracksShrinker(
  node: AnimgraphNode,
  ctx: SampleCtx,
  out: Pose,
  visited: Set<string>
): boolean {
  const kids = updateKids(ctx, node.HandleId)
  if (!kids.length) {
    logMissingUpdateSucc(ctx, node, 'StackTracksShrinker expected 1 child')
    writeRefPose(ctx, out)
    return false
  }
  const ok = sampleByHandleId(kids[0], ctx, out, visited)
  const remove = ctx.trackShrinkRemoveCountByHandleId?.get(node.HandleId) ?? 0
  if (remove > 0) shrinkTrackStack(out, remove)
  return ok
}

function sampleStackTransformsExtender(
  node: AnimgraphNode,
  ctx: SampleCtx,
  out: Pose,
  visited: Set<string>
): boolean {
  const d = node.Data ?? {}
  const kids = updateKids(ctx, node.HandleId)
  if (!kids.length) {
    logMissingUpdateSucc(ctx, node, 'StackExtender expected 1 child')
    writeRefPose(ctx, out)
    return false
  }
  const ok = sampleByHandleId(kids[0], ctx, out, visited)
  const infos = Array.isArray(d.transformInfos) ? d.transformInfos : []
  if (!infos.length) return ok

  let capacityWarned = false
  for (let i = 0; i < infos.length; i++) {
    if (out.stackCount >= out.stackCapacity) {
      if (!capacityWarned) {
        capacityWarned = true
        console.warn(
          `[sim] StackTransformsExtender ${node.HandleId}: stack full (${out.stackCapacity}), skipping remaining`
        )
      }
      break
    }
    const info = unwrapData(infos[i])
    if (!info) continue
    const name = readCName(info.name) || `stack_${i}`
    const parentName = readCName(info.parentName)
    const parentUnified = resolveUnifiedName(out, ctx.rig, parentName)
    if (parentUnified < 0 && parentName && parentName !== 'None') {
      // Missing parent — skip this slot (engine aborts whole extender; we clamp)
      continue
    }
    const ref = readQsTransform(info.referenceTransformLs)
    const slot = pushStackSlot(
      out,
      name,
      parentUnified,
      ref.tx,
      ref.ty,
      ref.tz,
      ref.qx,
      ref.qy,
      ref.qz,
      ref.qw,
      ref.sx,
      ref.sy,
      ref.sz
    )
    if (slot < 0) break
    const stackUnified = out.boneCount + slot

    const snapMethod: SnapMethod = parseSnapMethod(readArrayItem(d.snapMethods, i))
    const snapToRef = readBool(readArrayItem(d.snapToReferenceValues, i))
    const snapTarget = unwrapData(readArrayItem(d.snapTargetBones, i))
    const snapName = snapTarget ? readCName(snapTarget.name) : ''
    const snapUnified = resolveUnifiedName(out, ctx.rig, snapName)
    if (snapMethod !== 'NoSnapping' && snapUnified >= 0) {
      snapBoneToTarget(out, ctx.rig, stackUnified, snapUnified, snapMethod, snapToRef)
    }

    const offsetSpace = unwrapData(readArrayItem(d.offsetSpaceBones, i))
    const offsetSpaceName = offsetSpace ? readCName(offsetSpace.name) : ''
    const offsetSpaceUnified = resolveUnifiedName(out, ctx.rig, offsetSpaceName)
    if (offsetSpaceUnified >= 0) {
      const offsetToRef = readBool(readArrayItem(d.offsetToReferenceValues, i))
      const offset = readQsTransform(readArrayItem(d.offsets, i))
      offsetBoneInSpace(out, ctx.rig, stackUnified, offsetSpaceUnified, offset, offsetToRef)
    }
  }
  return ok
}

function sampleStackTransformsShrinker(
  node: AnimgraphNode,
  ctx: SampleCtx,
  out: Pose,
  visited: Set<string>
): boolean {
  const kids = updateKids(ctx, node.HandleId)
  if (!kids.length) {
    logMissingUpdateSucc(ctx, node, 'StackShrinker expected 1 child')
    writeRefPose(ctx, out)
    return false
  }
  const ok = sampleByHandleId(kids[0], ctx, out, visited)
  const remove = ctx.shrinkRemoveCountByHandleId?.get(node.HandleId) ?? 0
  if (remove > 0) shrinkStack(out, remove)
  return ok
}

function maybeCapturePose(node: AnimgraphNode, ctx: SampleCtx, out: Pose): void {
  if (!ctx.stackCaptureHandleIds?.has(node.HandleId)) return
  simSampleLogLine(
    ctx.sampleLog,
    `CAPTURE ${node.HandleId} bones=${out.boneCount} tx0=${out.translation[0]?.toFixed(4) ?? '?'} ty0=${out.translation[1]?.toFixed(4) ?? '?'} tz0=${out.translation[2]?.toFixed(4) ?? '?'}`
  )
  ctx.captureStack?.(node.HandleId, out)
}

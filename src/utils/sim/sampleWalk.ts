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
  convertAbsoluteToAdditiveFromRig,
  copyPose,
  createPose,
  DEFAULT_STACK_CAPACITY,
  identityPose,
  interpolatePose,
  pushStackSlot,
  shrinkStack,
  type OverrideBoneWeight,
  type Pose,
} from './pose'
import type { BoneOpFrameCache } from './boneOpDyn'
import { evalCurveFloatData } from './floatDyn'
import {
  applyRotationLimitLs,
  applyTranslationLimit,
  eulerDegToQuat,
  getTransformMs,
  offsetBoneInSpace,
  parseSnapMethod,
  parseTransformAxis,
  quatToEulerDeg,
  readQsTransform,
  resolveUnifiedName,
  rotateBoneByAngle,
  rotateBoneByQuaternion,
  setBoneRotationMs,
  setBoneTranslationMs,
  snapBoneToTarget,
  translateBoneLocal,
  writeBoneLs,
  type Qs,
  type SnapMethod,
} from './poseFk'
import { getRigPartMask, type RigEntry } from './rigResource'
import type { SimInputBoard } from './SimInputBoard'
import type { SimStateMachineRuntime } from './SimStateMachine'
import { handleType, readBool, readCName, readNumber } from './simDataUtils'
import {
  simSampleLogLine,
  type SimSampleLog,
} from './simSampleLog'
import type { SimNodeState, SimSampleWarning } from './simTypes'
import { SIM_SAMPLE_WARNINGS_MAX } from './simTypes'

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
  /** Shrinker handleId → remove count (bind-time tag pairing) */
  shrinkRemoveCountByHandleId?: Map<string, number>
  /**
   * HandleIds whose full pose should be snapshotted after Sample of that node (HUD).
   * Survives later Shrinker / blends on the path to root.
   */
  stackCaptureHandleIds?: Set<string>
  /** Copy live pose for a capture handle (runner-owned buffers). */
  captureStack?: (handleId: string, pose: Pose) => void
  /** Scratch poses for blend temps */
  scratchA: Pose
  scratchB: Pose
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
   * Parent-transform stack (name → MS Qs). ParentTransform Sample reads this;
   * falls back to pose unified MS when missing.
   */
  parentTransforms?: Map<string, Qs>
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
  const visited = new Set<string>()
  const ok = sampleNode(root, ctx, out, visited)
  if (ctx.sampleLog) {
    const want = [...(ctx.stackCaptureHandleIds ?? [])]
    const all = ctx.sampleVisitedAll
    for (const id of want) {
      simSampleLogLine(
        ctx.sampleLog,
        `capture-target ${id}: main=${visited.has(id) ? 1 : 0} any=${all?.has(id) ? 1 : 0}`
      )
    }
    simSampleLogLine(
      ctx.sampleLog,
      `visited-count main=${visited.size} any=${all?.size ?? 0} ok=${ok}`
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
  return sampleNode(node, ctx, out, new Set())
}

export function allocSampleScratch(
  rig: RigEntry,
  stackCapacity = DEFAULT_STACK_CAPACITY
): { scratchA: Pose; scratchB: Pose; out: Pose } {
  const n = rig.boneNames.length
  const t = rig.trackNames.length
  const sc = Math.max(0, stackCapacity | 0)
  return {
    out: createPose(n, t, sc),
    scratchA: createPose(n, t, sc),
    scratchB: createPose(n, t, sc),
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
  if (visited.has(node.HandleId)) {
    // Cycle — leave out as-is (already captured on first visit)
    simSampleLogLine(ctx.sampleLog, `REVISIT ${node.HandleId} skip`)
    return true
  }
  visited.add(node.HandleId)
  ctx.sampleVisitedAll?.add(node.HandleId)
  const t = handleType(node)
  simSampleLogLine(ctx.sampleLog, `ENTER ${node.HandleId} ${t}`)

  const ok = sampleNodeDispatch(node, ctx, out, visited)
  maybeCapturePose(node, ctx, out)
  return ok
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
      return sampleSkAnim(node, ctx, out)

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

    case 'animAnimNode_SetBoneTransform':
      return sampleSetBoneTransform(node, ctx, out, visited)
    case 'animAnimNode_SetBonePosition':
      return sampleSetBonePosition(node, ctx, out, visited)
    case 'animAnimNode_SetBoneOrientation':
      return sampleSetBoneOrientation(node, ctx, out, visited)
    case 'animAnimNode_RotateBone':
      return sampleRotateBone(node, ctx, out, visited)
    case 'animAnimNode_RotateBoneByQuaternion':
      return sampleRotateBoneByQuaternion(node, ctx, out, visited)
    case 'animAnimNode_TranslateBone':
      return sampleTranslateBone(node, ctx, out, visited)
    case 'animAnimNode_RotationLimit':
      return sampleRotationLimit(node, ctx, out, visited)
    case 'animAnimNode_TranslationLimit':
      return sampleTranslationLimit(node, ctx, out, visited)
    case 'animAnimNode_SetDrivenKey':
      return sampleSetDrivenKey(node, ctx, out, visited)
    case 'animAnimNode_AdditionalTransform':
      return sampleAdditionalTransform(node, ctx, out, visited)
    case 'animAnimNode_ParentTransform':
      return sampleParentTransform(node, ctx, out, visited)

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
    // Transition: Update recorded active then target output.
    const rt = ctx.runtimes?.get(node.HandleId)
    const alpha = rt?.transitionProgress ?? 0
    sampleByHandleId(kids[0], ctx, ctx.scratchA, new Set(visited))
    const aNull = ctx.lastWrittenNull
    sampleByHandleId(kids[1], ctx, ctx.scratchB, new Set(visited))
    const bNull = ctx.lastWrittenNull
    interpolatePose(out, ctx.scratchA, ctx.scratchB, alpha)
    if (ctx.warningsEnabled) {
      noteWrittenNull(ctx, alpha <= 0 ? aNull : alpha >= 1 ? bNull : aNull && bNull)
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
          const temp = out === ctx.scratchA ? ctx.scratchB : ctx.scratchA
          simSampleLogLine(
            ctx.sampleLog,
            `GraphSlot ${node.HandleId} side-sample kids=[${kids.join(',')}]`
          )
          for (const id of kids) {
            sampleByHandleId(id, ctx, temp, new Set())
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
    sampleByHandleId(kids[0], ctx, ctx.scratchA, new Set(visited))
    const aNull = ctx.lastWrittenNull
    sampleByHandleId(kids[1], ctx, ctx.scratchB, new Set(visited))
    const bNull = ctx.lastWrittenNull
    interpolatePose(out, ctx.scratchA, ctx.scratchB, weight)
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
    sampleByHandleId(kids[0], ctx, ctx.scratchA, new Set(visited))
    const aNull = ctx.lastWrittenNull
    sampleByHandleId(kids[1], ctx, ctx.scratchB, new Set(visited))
    const bNull = ctx.lastWrittenNull
    interpolatePose(out, ctx.scratchA, ctx.scratchB, alpha)
    if (ctx.warningsEnabled) {
      noteWrittenNull(ctx, alpha <= 0 ? aNull : alpha >= 1 ? bNull : aNull && bNull)
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
    sampleByHandleId(kids[1], ctx, ctx.scratchA, new Set(visited))
    // Engine: accumulate local deltas only. Additive clips must already be deltas
    // (native buffer / GLB strip on load). Do not subtract ref here.
    const maskName = readCName(d.maskName)
    const mask = maskName ? getRigPartMask(ctx.rig, maskName) : null
    blendAdditiveLocal(out, out, ctx.scratchA, weight, mask)
    // Additive on null base still yields null locals if add is identity-delta.
    if (ctx.warningsEnabled) noteWrittenNull(ctx, baseNull && ctx.lastWrittenNull)
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
  sampleByHandleId(kids[1], ctx, ctx.scratchA, new Set(visited))
  applyBlendOverrideMethods(node, ctx, out, ctx.scratchA, weight)
  if (ctx.warningsEnabled) noteWrittenNull(ctx, baseNull && ctx.lastWrittenNull)
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
    sampleByHandleId(kids[1], ctx, ctx.scratchA, new Set(visited))
    const bNull = ctx.lastWrittenNull
    const maskName = readMaskListEntryName(masks[maskIndex])
    const mask = maskName ? getRigPartMask(ctx.rig, maskName) : null
    // Engine: FindRigPartByName miss → keep base only (no full-body interpolate)
    if (mask) blendByMask(out, out, ctx.scratchA, weight, mask)
    if (ctx.warningsEnabled) {
      noteWrittenNull(ctx, weight <= 0 ? aNull : weight >= 1 ? bNull : aNull && bNull)
    }
  }
  return true
}

function identityFromRig(out: Pose, rig: RigEntry): void {
  out.translation.set(rig.refTranslation.subarray(0, out.boneCount * 3))
  out.rotation.set(rig.refRotation.subarray(0, out.boneCount * 4))
  out.scale.set(rig.refScale.subarray(0, out.boneCount * 3))
  clearStack(out)
}

function unwrapData(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (o.Data && typeof o.Data === 'object') return o.Data as Record<string, unknown>
  return o
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

function trackIndexByName(rig: RigEntry, name: string): number {
  if (!name || name === 'None') return -1
  const key = name.toLowerCase()
  for (let i = 0; i < rig.trackNames.length; i++) {
    if (rig.trackNames[i]!.toLowerCase() === key) return i
  }
  return -1
}

function readDrivenChannel(
  pose: Pose,
  rig: RigEntry,
  channelName: string,
  channelType: DrivenChannelType
): number {
  if (channelType === 'FloatTrack') {
    const ti = trackIndexByName(rig, channelName)
    if (ti < 0 || ti >= pose.trackCount) return 0
    return pose.tracks[ti] ?? 0
  }
  const bi = resolveUnifiedName(pose, rig, channelName)
  if (bi < 0 || bi >= pose.boneCount) return 0
  const t = bi * 3
  const r = bi * 4
  switch (channelType) {
    case 'TransX':
      return pose.translation[t]!
    case 'TransY':
      return pose.translation[t + 1]!
    case 'TransZ':
      return pose.translation[t + 2]!
    case 'ScaleX':
      return pose.scale[t]!
    case 'ScaleY':
      return pose.scale[t + 1]!
    case 'ScaleZ':
      return pose.scale[t + 2]!
    case 'RotQuatX':
      return pose.rotation[r]!
    case 'RotQuatY':
      return pose.rotation[r + 1]!
    case 'RotQuatZ':
      return pose.rotation[r + 2]!
    case 'RotQuatW':
      return pose.rotation[r + 3]!
    case 'RotEulZ_Pitch':
    case 'RotEulX_Roll':
    case 'RotEulY_Yaw': {
      const e = quatToEulerDeg(
        pose.rotation[r]!,
        pose.rotation[r + 1]!,
        pose.rotation[r + 2]!,
        pose.rotation[r + 3]!
      )
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
    const ti = trackIndexByName(rig, channelName)
    if (ti >= 0 && ti < pose.trackCount) pose.tracks[ti] = value
    return
  }
  const bi = resolveUnifiedName(pose, rig, channelName)
  if (bi < 0 || bi >= pose.boneCount) return
  const t = bi * 3
  const r = bi * 4
  switch (channelType) {
    case 'TransX':
      pose.translation[t] = value
      break
    case 'TransY':
      pose.translation[t + 1] = value
      break
    case 'TransZ':
      pose.translation[t + 2] = value
      break
    case 'ScaleX':
      pose.scale[t] = value
      break
    case 'ScaleY':
      pose.scale[t + 1] = value
      break
    case 'ScaleZ':
      pose.scale[t + 2] = value
      break
    case 'RotQuatX':
      pose.rotation[r] = value
      break
    case 'RotQuatY':
      pose.rotation[r + 1] = value
      break
    case 'RotQuatZ':
      pose.rotation[r + 2] = value
      break
    case 'RotQuatW':
      pose.rotation[r + 3] = value
      break
    case 'RotEulZ_Pitch':
    case 'RotEulX_Roll':
    case 'RotEulY_Yaw': {
      const e = quatToEulerDeg(
        pose.rotation[r]!,
        pose.rotation[r + 1]!,
        pose.rotation[r + 2]!,
        pose.rotation[r + 3]!
      )
      if (channelType === 'RotEulZ_Pitch') e.pitch = value
      else if (channelType === 'RotEulX_Roll') e.roll = value
      else e.yaw = value
      const q = eulerDegToQuat(e.pitch, e.roll, e.yaw)
      pose.rotation[r] = q.qx
      pose.rotation[r + 1] = q.qy
      pose.rotation[r + 2] = q.qz
      pose.rotation[r + 3] = q.qw
      break
    }
  }
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

function sampleAdditionalTransform(
  node: AnimgraphNode,
  ctx: SampleCtx,
  out: Pose,
  visited: Set<string>
): boolean {
  const ok = sampleOnePoseChild(node, ctx, out, visited, 'AdditionalTransform')
  const container = unwrapData(node.Data?.additionalTransforms)
  const entries = Array.isArray(container?.entries)
    ? container.entries
    : Array.isArray(node.Data?.additionalTransforms)
      ? (node.Data.additionalTransforms as unknown[])
      : []
  for (const raw of entries) {
    const e = unwrapData(raw)
    if (!e) continue
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
    writeBoneLs(out, toIdx, fromQs)
  }
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

/**
 * Offline Sample walk — uses Update weights/clocks; fills pooled Pose.
 */

import type { AnimgraphNode } from '../graph/animgraphTypes'
import {
  blend2FirstInputActive,
  blend2SecondInputActive,
  blend2WeightFromInput,
  blendByMaskDynamicBlendActive,
  blendMultipleFirstInputActive,
  blendMultipleSecondInputActive,
  buildBlendMultipleSlots,
  selectBlendMultipleInputs,
} from './engineParity'
import { checkRuntimeCondition } from './checkCondition'
import type { ClipPoseLibrary } from './clipPoseLibrary'
import type { ClipClockState } from './clipClock'
import type { ClipLibrary } from './clipLibrary'
import {
  blendAdditiveLocal,
  blendByMask,
  clearStack,
  copyPose,
  createPose,
  DEFAULT_STACK_CAPACITY,
  identityPose,
  interpolatePose,
  pushStackSlot,
  shrinkStack,
  type Pose,
} from './pose'
import {
  offsetBoneInSpace,
  parseSnapMethod,
  readQsTransform,
  snapBoneToTarget,
  type SnapMethod,
} from './poseFk'
import { getRigPartMask, type RigEntry } from './rigResource'
import type { SimInputBoard } from './SimInputBoard'
import { findStateOutput, type SimStateMachineRuntime } from './SimStateMachine'
import { handleType, readBool, readCName, readNumber, resolveHandle } from './simDataUtils'
import type { SimNodeState } from './simTypes'

/**
 * Sample support (partial): SkAnim, Blend2/Multiple/Additive/ByMask, Switch,
 * Static/RuntimeSwitch, StateMachine, GraphSlot(+Input),
 * StackTransformsExtender / Shrinker. Other OnePoseInput → passthrough.
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
}

export type SampleResult = {
  ok: boolean
  reason?: 'no-rig' | 'no-root' | 'empty'
  sampleMs: number
  bonesSampled: number
  missingGlb?: string[]
}

function isActive(nodes: Record<string, SimNodeState>, id: string): boolean {
  return nodes[id]?.active === true
}

function noteMissingGlb(ctx: SampleCtx, animName: string): void {
  if (!ctx.missingGlb) return
  if (ctx.missingGlb.includes(animName)) return
  ctx.missingGlb.push(animName)
}

function isGraphSlotType(t: string | null | undefined): boolean {
  return (
    t === 'animAnimNode_GraphSlot' ||
    t === 'animAnimNode_GraphSlot_Test' ||
    t === 'animAnimNode_GraphSlotConditions'
  )
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
  if (!root) {
    identityPose(out)
    return {
      ok: false,
      reason: 'no-root',
      sampleMs: 0,
      bonesSampled: out.boneCount,
      missingGlb: ctx.missingGlb,
    }
  }
  const visited = new Set<string>()
  const ok = sampleNode(root, ctx, out, visited)
  const t1 =
    typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()
  return {
    ok,
    reason: ok ? undefined : 'empty',
    sampleMs: t1 - t0,
    bonesSampled: out.boneCount,
    missingGlb: ctx.missingGlb.length ? ctx.missingGlb : undefined,
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
    identityPose(out)
    return false
  }
  if (visited.has(node.HandleId)) {
    // Cycle — leave out as-is (already captured on first visit)
    return true
  }
  visited.add(node.HandleId)

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
  const d = node.Data ?? {}
  const { handles } = ctx

  if (t === 'animAnimNode_Root') {
    const child =
      resolveHandle(handles, d.outputNode) ??
      (Array.isArray(d.nodes) ? resolveHandle(handles, d.nodes[0]) : null)
    return sampleNode(child, ctx, out, visited)
  }

  if (t === 'animAnimNode_Output') {
    return sampleNode(
      resolveHandle(handles, d.inputNode ?? d.input ?? d.node),
      ctx,
      out,
      visited
    )
  }

  if (t === 'animAnimNode_State' || t === 'animAnimNode_StateFrozen') {
    return sampleNode(findStateOutput(node, handles), ctx, out, visited)
  }

  if (t === 'animAnimNode_StateMachine') {
    return sampleStateMachine(node, ctx, out, visited)
  }

  if (t === 'animAnimNode_GraphSlotInput') {
    if (ctx.parentPoseSample) {
      return ctx.parentPoseSample(out)
    }
    identityFromRig(out, ctx.rig)
    return false
  }

  if (isGraphSlotType(t)) {
    return sampleGraphSlot(node, ctx, out, visited)
  }

  if (
    t === 'animAnimNode_SkDurationAnim' ||
    t === 'animAnimNode_SkAnim' ||
    (t != null && t.startsWith('animAnimNode_Sk') && t.includes('Anim'))
  ) {
    return sampleSkAnim(node, ctx, out)
  }

  if (t === 'animAnimNode_Blend2') {
    return sampleBlend2(node, ctx, out, visited)
  }

  if (t === 'animAnimNode_BlendMultiple') {
    return sampleBlendMultiple(node, ctx, out, visited)
  }

  if (t === 'animAnimNode_Switch') {
    return sampleSwitch(node, ctx, out, visited)
  }

  if (t === 'animAnimNode_StaticSwitch' || t === 'animAnimNode_RuntimeSwitch') {
    return sampleBoolSwitch(node, ctx, out, visited, t === 'animAnimNode_StaticSwitch')
  }

  if (t === 'animAnimNode_BlendAdditive') {
    return sampleBlendAdditive(node, ctx, out, visited)
  }

  if (t === 'animAnimNode_BlendByMaskDynamic') {
    return sampleBlendByMaskDynamic(node, ctx, out, visited)
  }

  if (t === 'animAnimNode_StackTransformsExtender') {
    return sampleStackTransformsExtender(node, ctx, out, visited)
  }

  if (t === 'animAnimNode_StackTransformsShrinker') {
    return sampleStackTransformsShrinker(node, ctx, out, visited)
  }

  // Generic: first pose input
  const input =
    resolveHandle(handles, d.inputNode) ??
    resolveHandle(handles, d.input) ??
    resolveHandle(handles, d.inputLink) ??
    resolveHandle(handles, d.node)
  if (input) return sampleNode(input, ctx, out, visited)

  // Identity fallback (reference pose already in out if caller set it)
  identityFromRig(out, ctx.rig)
  return true
}

function sampleStateMachine(
  node: AnimgraphNode,
  ctx: SampleCtx,
  out: Pose,
  visited: Set<string>
): boolean {
  const d = node.Data ?? {}
  const states = Array.isArray(d.states) ? d.states : []
  const rt = ctx.runtimes?.get(node.HandleId)
  if (!rt || !states.length) {
    identityFromRig(out, ctx.rig)
    return false
  }
  const activeState = resolveHandle(ctx.handles, states[rt.activeStateIndex])
  const activeOut = activeState ? findStateOutput(activeState, ctx.handles) : null

  const inTransition =
    rt.isInTransition &&
    rt.targetStateIndex != null &&
    rt.transitionProgress > 0 &&
    rt.transitionProgress < 1

  if (inTransition) {
    const targetState = resolveHandle(ctx.handles, states[rt.targetStateIndex!])
    const targetOut = targetState ? findStateOutput(targetState, ctx.handles) : null
    if (activeOut && targetOut) {
      sampleNode(activeOut, ctx, ctx.scratchA, new Set(visited))
      sampleNode(targetOut, ctx, ctx.scratchB, new Set(visited))
      interpolatePose(out, ctx.scratchA, ctx.scratchB, rt.transitionProgress)
      return true
    }
  }

  if (!activeOut) {
    identityFromRig(out, ctx.rig)
    return false
  }
  return sampleNode(activeOut, ctx, out, visited)
}

function sampleGraphSlot(
  node: AnimgraphNode,
  ctx: SampleCtx,
  out: Pose,
  visited: Set<string>
): boolean {
  const d = node.Data ?? {}
  const slotName = readCName(d.name)
  const inputLink = resolveHandle(ctx.handles, d.inputLink)
  if (slotName && ctx.sampleNested) {
    const nested = ctx.sampleNested(slotName)
    if (nested && nested.boneCount === out.boneCount) {
      copyPose(out, nested)
      return true
    }
  }
  // No attached graph — passthrough inputLink (engine fallback)
  return sampleNode(inputLink, ctx, out, visited)
}

function sampleSkAnim(node: AnimgraphNode, ctx: SampleCtx, out: Pose): boolean {
  const clock = ctx.clipClocks.get(node.HandleId)
  const animName =
    clock?.animName ||
    readCName(node.Data?.animation) ||
    readCName(node.Data?.animationName) ||
    ''
  const time = clock?.currTime ?? 0
  if (!animName || animName === 'None') {
    identityFromRig(out, ctx.rig)
    return false
  }
  // Same gating as Update clip resolve: active setup entry by wrappers + priority
  const isWrap = (n: string) => ctx.board.isWrapperActive(n)
  const winner = ctx.clipLibrary?.resolveClipEntry(animName, isWrap)
  if (!winner) {
    identityFromRig(out, ctx.rig)
    return false
  }
  const ok = ctx.clipPoseLibrary.sample(animName, time, ctx.rig, out, winner.entryId)
  if (!ok) noteMissingGlb(ctx, animName)
  return ok
}

function sampleBlend2(
  node: AnimgraphNode,
  ctx: SampleCtx,
  out: Pose,
  visited: Set<string>
): boolean {
  const d = node.Data ?? {}
  const first = resolveHandle(ctx.handles, d.firstInputNode)
  const second = resolveHandle(ctx.handles, d.secondInputNode)
  const minV = readNumber(d.minInputValue, 0)
  const maxV = readNumber(d.maxInputValue, 1)
  const wNode = resolveHandle(ctx.handles, d.weightNode)
  let inputW = 0
  if (wNode && isActive(ctx.nodes, wNode.HandleId)) {
    inputW = ctx.nodes[wNode.HandleId]?.weight ?? 0
  } else if (wNode) {
    inputW = ctx.nodes[wNode.HandleId]?.weight ?? 0
  }
  // Prefer node overlay weight from Update
  const nodeW = ctx.nodes[node.HandleId]?.weight
  const weight =
    typeof nodeW === 'number' && Number.isFinite(nodeW)
      ? nodeW
      : blend2WeightFromInput(inputW, minV, maxV)

  const aOk = blend2FirstInputActive(weight)
  const bOk = blend2SecondInputActive(weight)
  if (aOk && !bOk) return sampleNode(first, ctx, out, visited)
  if (!aOk && bOk) return sampleNode(second, ctx, out, visited)
  if (!aOk && !bOk) {
    identityFromRig(out, ctx.rig)
    return false
  }
  sampleNode(first, ctx, ctx.scratchA, new Set(visited))
  sampleNode(second, ctx, ctx.scratchB, new Set(visited))
  interpolatePose(out, ctx.scratchA, ctx.scratchB, weight)
  return true
}

function sampleBlendMultiple(
  node: AnimgraphNode,
  ctx: SampleCtx,
  out: Pose,
  visited: Set<string>
): boolean {
  const d = node.Data ?? {}
  const inputNodes = Array.isArray(d.inputNodes) ? d.inputNodes : []
  const slots = buildBlendMultipleSlots(d.inputValues, d.sortedInputValues, inputNodes)
  const wNode = resolveHandle(ctx.handles, d.weightNode)
  let inputWeight = ctx.nodes[node.HandleId]?.weight ?? 0
  if (wNode && typeof ctx.nodes[wNode.HandleId]?.weight === 'number') {
    inputWeight = ctx.nodes[wNode.HandleId]!.weight!
  }
  const minW = readNumber(d.minWeight, slots.values[0] ?? 0)
  const maxW = readNumber(d.maxWeight, slots.values[slots.values.length - 1] ?? 1)
  const radial = readBool(d.radialBlending)
  const select = selectBlendMultipleInputs(
    inputWeight,
    slots.values,
    minW,
    maxW,
    radial
  )
  const firstRef = slots.refs[select.firstIndex]
  const secondRef = slots.refs[select.secondIndex]
  const first = resolveHandle(ctx.handles, firstRef)
  const second = resolveHandle(ctx.handles, secondRef)
  const aOk = blendMultipleFirstInputActive(select.alpha)
  const bOk = blendMultipleSecondInputActive(select.alpha)
  if (aOk && !bOk) return sampleNode(first, ctx, out, visited)
  if (!aOk && bOk) return sampleNode(second, ctx, out, visited)
  sampleNode(first, ctx, ctx.scratchA, new Set(visited))
  sampleNode(second, ctx, ctx.scratchB, new Set(visited))
  interpolatePose(out, ctx.scratchA, ctx.scratchB, select.alpha)
  return true
}

function sampleSwitch(
  node: AnimgraphNode,
  ctx: SampleCtx,
  out: Pose,
  visited: Set<string>
): boolean {
  // Reuse BlendMultiple-style select stored on node weight/alpha from Update
  const d = node.Data ?? {}
  const inputs = Array.isArray(d.inputs) ? d.inputs : Array.isArray(d.inputNodes) ? d.inputNodes : []
  const alpha = ctx.nodes[node.HandleId]?.alpha ?? 0
  const weight = ctx.nodes[node.HandleId]?.weight ?? 0
  // weight often encodes selected index blend; prefer Update's marked active children
  let chosen: AnimgraphNode | null = null
  for (const ref of inputs) {
    const h = resolveHandle(ctx.handles, ref)
    if (h && isActive(ctx.nodes, h.HandleId)) {
      chosen = h
      break
    }
  }
  if (!chosen && inputs.length) {
    const idx = Math.max(0, Math.min(inputs.length - 1, Math.round(weight)))
    chosen = resolveHandle(ctx.handles, inputs[idx])
  }
  if (!chosen) {
    identityFromRig(out, ctx.rig)
    return false
  }
  // If two neighbors active, blend by alpha
  const i0 = inputs.findIndex((ref: unknown) => {
    const h = resolveHandle(ctx.handles, ref)
    return h && isActive(ctx.nodes, h.HandleId)
  })
  if (i0 >= 0 && i0 + 1 < inputs.length) {
    const a = resolveHandle(ctx.handles, inputs[i0])
    const b = resolveHandle(ctx.handles, inputs[i0 + 1])
    if (a && b && isActive(ctx.nodes, b.HandleId) && alpha > 0 && alpha < 1) {
      sampleNode(a, ctx, ctx.scratchA, new Set(visited))
      sampleNode(b, ctx, ctx.scratchB, new Set(visited))
      interpolatePose(out, ctx.scratchA, ctx.scratchB, alpha)
      return true
    }
  }
  return sampleNode(chosen, ctx, out, visited)
}

function sampleBoolSwitch(
  node: AnimgraphNode,
  ctx: SampleCtx,
  out: Pose,
  visited: Set<string>,
  isStatic: boolean
): boolean {
  const d = node.Data ?? {}
  let useTrue: boolean
  if (isStatic) {
    useTrue =
      ctx.staticSwitchResults?.get(node.HandleId) ??
      (ctx.nodes[node.HandleId]?.weight ?? 1) >= 0.5
  } else {
    const cond = resolveHandle(ctx.handles, d.condition)
    useTrue = checkRuntimeCondition(cond, ctx.board, {
      clipLibrary: ctx.clipLibrary,
      isWrapperActive: (n) => ctx.board.isWrapperActive(n),
    })
  }
  const branch = useTrue
    ? resolveHandle(ctx.handles, d.True ?? d.true)
    : resolveHandle(ctx.handles, d.False ?? d.false)
  return sampleNode(branch, ctx, out, visited)
}

function sampleBlendAdditive(
  node: AnimgraphNode,
  ctx: SampleCtx,
  out: Pose,
  visited: Set<string>
): boolean {
  const d = node.Data ?? {}
  const base = resolveHandle(ctx.handles, d.inputNode)
  const add = resolveHandle(ctx.handles, d.addedInputNode)
  const weight = ctx.nodes[node.HandleId]?.weight ?? 0
  sampleNode(base, ctx, out, visited)
  if (!(weight > 0.01) || !add || !isActive(ctx.nodes, add.HandleId)) return true
  sampleNode(add, ctx, ctx.scratchA, new Set(visited))
  const maskName = readCName(d.maskName)
  const mask = maskName ? getRigPartMask(ctx.rig, maskName) : null
  blendAdditiveLocal(out, out, ctx.scratchA, weight, mask)
  return true
}

function sampleBlendByMaskDynamic(
  node: AnimgraphNode,
  ctx: SampleCtx,
  out: Pose,
  visited: Set<string>
): boolean {
  const d = node.Data ?? {}
  const base = resolveHandle(ctx.handles, d.base)
  const blend = resolveHandle(ctx.handles, d.blend)
  const weight = ctx.nodes[node.HandleId]?.weight ?? 0
  const maskIndex = Math.trunc(ctx.nodes[node.HandleId]?.alpha ?? -1)
  sampleNode(base, ctx, out, visited)
  const masks = Array.isArray(d.masks) ? d.masks : []
  if (!blendByMaskDynamicBlendActive(weight, maskIndex, masks.length)) return true
  if (!blend || !isActive(ctx.nodes, blend.HandleId)) return true
  sampleNode(blend, ctx, ctx.scratchA, new Set(visited))
  const maskEntry = masks[maskIndex]
  const maskName =
    readCName(maskEntry) ||
    (maskEntry && typeof maskEntry === 'object'
      ? readCName((maskEntry as { name?: unknown }).name)
      : '')
  const mask = maskName ? getRigPartMask(ctx.rig, maskName) : null
  if (mask) blendByMask(out, out, ctx.scratchA, weight, mask)
  else interpolatePose(out, out, ctx.scratchA, weight)
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

function resolveUnifiedName(pose: Pose, rig: RigEntry, name: string): number {
  if (!name || name === 'None') return -1
  const key = name.toLowerCase()
  const bi = rig.boneIndexByName.get(key)
  if (bi !== undefined) return bi
  for (let i = 0; i < pose.stackCount; i++) {
    if ((pose.stackNames[i] ?? '').toLowerCase() === key) return pose.boneCount + i
  }
  return -1
}

function sampleStackTransformsExtender(
  node: AnimgraphNode,
  ctx: SampleCtx,
  out: Pose,
  visited: Set<string>
): boolean {
  const d = node.Data ?? {}
  const input =
    resolveHandle(ctx.handles, d.inputLink) ??
    resolveHandle(ctx.handles, d.inputNode) ??
    resolveHandle(ctx.handles, d.input)
  const ok = sampleNode(input, ctx, out, visited)
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
  const d = node.Data ?? {}
  const input =
    resolveHandle(ctx.handles, d.inputLink) ??
    resolveHandle(ctx.handles, d.inputNode) ??
    resolveHandle(ctx.handles, d.input)
  const ok = sampleNode(input, ctx, out, visited)
  const remove = ctx.shrinkRemoveCountByHandleId?.get(node.HandleId) ?? 0
  if (remove > 0) shrinkStack(out, remove)
  return ok
}

function maybeCapturePose(node: AnimgraphNode, ctx: SampleCtx, out: Pose): void {
  if (!ctx.stackCaptureHandleIds?.has(node.HandleId)) return
  ctx.captureStack?.(node.HandleId, out)
}

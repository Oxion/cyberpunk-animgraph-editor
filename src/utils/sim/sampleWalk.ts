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
  createPose,
  identityPose,
  interpolatePose,
  type Pose,
} from './pose'
import { getRigPartMask, type RigEntry } from './rigResource'
import type { SimInputBoard } from './SimInputBoard'
import { handleType, readBool, readCName, readNumber, resolveHandle } from './simDataUtils'
import type { SimNodeState } from './simTypes'

export type SampleCtx = {
  handles: Map<string, AnimgraphNode>
  board: SimInputBoard
  nodes: Record<string, SimNodeState>
  clipClocks: Map<string, ClipClockState>
  clipPoseLibrary: ClipPoseLibrary
  clipLibrary: ClipLibrary | null
  rig: RigEntry
  staticSwitchResults?: Map<string, boolean>
  /** Scratch poses for blend temps */
  scratchA: Pose
  scratchB: Pose
}

export type SampleResult = {
  ok: boolean
  reason?: 'no-rig' | 'no-root' | 'empty'
  sampleMs: number
  bonesSampled: number
}

function isActive(nodes: Record<string, SimNodeState>, id: string): boolean {
  return nodes[id]?.active === true
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
  if (!root) {
    identityPose(out)
    return { ok: false, reason: 'no-root', sampleMs: 0, bonesSampled: out.boneCount }
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
  }
}

export function allocSampleScratch(rig: RigEntry): { scratchA: Pose; scratchB: Pose; out: Pose } {
  const n = rig.boneNames.length
  const t = rig.trackNames.length
  return {
    out: createPose(n, t),
    scratchA: createPose(n, t),
    scratchB: createPose(n, t),
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
    // Cycle — leave out as-is
    return true
  }
  visited.add(node.HandleId)

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

  // Generic: first pose input
  const input =
    resolveHandle(handles, d.inputNode) ??
    resolveHandle(handles, d.input) ??
    resolveHandle(handles, d.inputLink) ??
    resolveHandle(handles, d.node)
  if (input) return sampleNode(input, ctx, out, visited)

  // Identity fallback (reference pose already in out if caller set it)
  out.translation.set(ctx.rig.refTranslation.subarray(0, out.boneCount * 3))
  out.rotation.set(ctx.rig.refRotation.subarray(0, out.boneCount * 4))
  out.scale.set(ctx.rig.refScale.subarray(0, out.boneCount * 3))
  return true
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
    out.translation.set(ctx.rig.refTranslation.subarray(0, out.boneCount * 3))
    out.rotation.set(ctx.rig.refRotation.subarray(0, out.boneCount * 4))
    out.scale.set(ctx.rig.refScale.subarray(0, out.boneCount * 3))
    return false
  }
  // Same gating as Update clip resolve: active setup entry by wrappers + priority
  const isWrap = (n: string) => ctx.board.isWrapperActive(n)
  const winner = ctx.clipLibrary?.resolveClipEntry(animName, isWrap)
  if (!winner) {
    out.translation.set(ctx.rig.refTranslation.subarray(0, out.boneCount * 3))
    out.rotation.set(ctx.rig.refRotation.subarray(0, out.boneCount * 4))
    out.scale.set(ctx.rig.refScale.subarray(0, out.boneCount * 3))
    return false
  }
  return ctx.clipPoseLibrary.sample(animName, time, ctx.rig, out, winner.entryId)
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
}
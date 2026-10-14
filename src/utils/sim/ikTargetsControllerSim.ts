/**
 * anim::IKTargetsController — shared by GenerateIkAnimFeatureData + HumanIk.
 * Mutable SM/GraphInput state lives on the class instance (AnimInstanceVar stand-in).
 */

import { InstanceStateDef } from '../InstanceStore'
import type { InstanceStore } from '../InstanceStore'
import type { AnimgraphNode } from '../graph/animgraphTypes'
import type { Pose } from './pose'
import { readTrackValue, resolveTrackUnified } from './pose'
import type { RigEntry } from './rigResource'
import type { SimInputBoard } from './SimInputBoard'
import type { SimVec4 } from './evalAnimMathExpressionVector'
import {
  IDENTITY_SPHERE_XF,
  convertPointWsToMs,
  invertXf,
  type LookAtSphereXf,
} from './lookAtMath'
import { IDENTITY_QS, slerpQs } from './poseFk'
import type { SimCompileCtx } from './simCompile'
import { readCName, readNumber, readVector4 } from './simDataUtils'
import {
  IK_PRIORITY_ANIM_GRAPH,
  defaultIkTargetRequest,
  type IKTargetParamsUpdateInfo,
  type SimIkTargetRef,
  type SimIkTargetRequest,
  type SimServiceEvent,
} from './simServiceEvents'

/** anim::IKChainSettings */
export type IKChainSettings = {
  chainName: string
  enableFloatTrack: string
  ikEndPointOffset: { x: number; y: number; z: number }
  ikEndRotationOffset: { x: number; y: number; z: number; w: number }
}

const DEFAULT_STATE_ID = 0
/** Engine StaticArray capacity for i_states (includes default). */
const MAX_EXTERNAL_STATES = 3
/** Engine StaticArray capacity for i_statesFromGraph. */
const MAX_GRAPH_STATES = 2
/** Stable negative id for AddIkRequest / SnapToTerrain graph snaps. */
export const IK_GRAPH_REQUEST_ID = -1

export type IkGraphRequestSnap = {
  chain: string
  /** Negative id; default IK_GRAPH_REQUEST_ID. */
  id?: number
  posMs: { x: number; y: number; z: number }
  rotMs: { x: number; y: number; z: number; w: number }
  weightPosition: number
  weightRotation: number
  priority: number
  poleMs?: { x: number; y: number; z: number }
  poleOverrideWeight?: number
  transitionIn?: number
  transitionOut?: number
}

type Vec3 = { x: number; y: number; z: number }
type Quat = { x: number; y: number; z: number; w: number }

type IkStateData = {
  request: SimIkTargetRequest
  externalTargetPositionWs: Vec3
  externalTargetPositionMs: Vec3
  externalTargetOrientationWs: Quat
  externalTargetOrientationMs: Quat
  externalPoleVectorMs: Vec3
  id: number
  validPosition: boolean
  validOrientation: boolean
}

type IkTransitionData = {
  newId: number
  transitionWeight: number
  transitionTime: number
  duration: number
  inProgress: boolean
}

type IkSmOutput = {
  isEnabled: boolean
  targetPositionMs: Vec3
  targetOrientationMs: Quat
  poleVectorMs: Vec3
  weightPosition: number
  weightOrientation: number
  poleVectorOverrideWeight: number
}

function zeroVec(): Vec3 {
  return { x: 0, y: 0, z: 0 }
}

function identQuat(): Quat {
  return { x: 0, y: 0, z: 0, w: 1 }
}

function copyVec(v: Vec3): Vec3 {
  return { x: v.x, y: v.y, z: v.z }
}

function copyQuat(q: Quat): Quat {
  return { x: q.x, y: q.y, z: q.z, w: q.w }
}

function clearOutput(o: IkSmOutput): void {
  o.isEnabled = false
  o.targetPositionMs = zeroVec()
  o.targetOrientationMs = identQuat()
  o.poleVectorMs = zeroVec()
  o.weightPosition = 0
  o.weightOrientation = 0
  o.poleVectorOverrideWeight = 0
}

function emptyOutput(): IkSmOutput {
  const o = {
    isEnabled: false,
    targetPositionMs: zeroVec(),
    targetOrientationMs: identQuat(),
    poleVectorMs: zeroVec(),
    weightPosition: 0,
    weightOrientation: 0,
    poleVectorOverrideWeight: 0,
  }
  return o
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t
}

function quatMul(a: Quat, b: Quat): Quat {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  }
}

function quatConjugate(q: Quat): Quat {
  return { x: -q.x, y: -q.y, z: -q.z, w: q.w }
}

function quatRotate(q: Quat, v: Vec3): Vec3 {
  const ix = q.w * v.x + q.y * v.z - q.z * v.y
  const iy = q.w * v.y + q.z * v.x - q.x * v.z
  const iz = q.w * v.z + q.x * v.y - q.y * v.x
  const iw = -q.x * v.x - q.y * v.y - q.z * v.z
  return {
    x: ix * q.w + iw * -q.x + iy * -q.z - iz * -q.y,
    y: iy * q.w + iw * -q.y + iz * -q.x - ix * -q.z,
    z: iz * q.w + iw * -q.z + ix * -q.y - iy * -q.x,
  }
}

/** Engine CalculateWeightModifiedAlpha. */
function weightModifiedAlpha(
  alpha: number,
  weightFirst: number,
  weightSecond: number
): number {
  const weightTotal = weightFirst + weightSecond
  if (weightTotal < 1e-8) return alpha
  const alphaFirst = 1 - (1 - alpha) * weightFirst
  const alphaSecond = alpha * weightSecond
  return clamp01(
    alphaFirst * (weightSecond / weightTotal) +
      alphaSecond * (weightFirst / weightTotal)
  )
}

function interpolateWeightedPositions(
  first: Vec3,
  weightFirst: number,
  second: Vec3,
  weightSecond: number,
  alpha: number
): { out: Vec3; weightedAlpha: number } {
  const wa = weightModifiedAlpha(alpha, weightFirst, weightSecond)
  return {
    out: {
      x: lerp(first.x, second.x, wa),
      y: lerp(first.y, second.y, wa),
      z: lerp(first.z, second.z, wa),
    },
    weightedAlpha: wa,
  }
}

function interpolateWeightedRotations(
  first: Quat,
  weightFirst: number,
  second: Quat,
  weightSecond: number,
  alpha: number
): { out: Quat; weightedAlpha: number } {
  const wa = weightModifiedAlpha(alpha, weightFirst, weightSecond)
  const a = { ...IDENTITY_QS, qx: first.x, qy: first.y, qz: first.z, qw: first.w }
  const b = {
    ...IDENTITY_QS,
    qx: second.x,
    qy: second.y,
    qz: second.z,
    qw: second.w,
  }
  const r = slerpQs(a, b, wa)
  return {
    out: { x: r.qx, y: r.qy, z: r.qz, w: r.qw },
    weightedAlpha: wa,
  }
}

function createStateMachineOutputFromState(state: IkStateData): IkSmOutput {
  return {
    isEnabled: false,
    targetPositionMs: copyVec(state.externalTargetPositionMs),
    targetOrientationMs: copyQuat(state.externalTargetOrientationMs),
    poleVectorMs: copyVec(state.externalPoleVectorMs),
    weightPosition: state.validPosition ? state.request.weightPosition : 0,
    weightOrientation: state.validOrientation
      ? state.request.weightOrientation
      : 0,
    poleVectorOverrideWeight: state.request.poleVectorOverrideWeight,
  }
}

function combineOutput(
  base: IkSmOutput,
  added: IkSmOutput,
  transitionWeight: number
): void {
  const pos = interpolateWeightedPositions(
    base.targetPositionMs,
    base.weightPosition,
    added.targetPositionMs,
    added.weightPosition,
    transitionWeight
  )
  base.targetPositionMs = pos.out

  const rot = interpolateWeightedRotations(
    base.targetOrientationMs,
    base.weightOrientation,
    added.targetOrientationMs,
    added.weightOrientation,
    transitionWeight
  )
  base.targetOrientationMs = rot.out

  const pole = interpolateWeightedPositions(
    base.poleVectorMs,
    base.poleVectorOverrideWeight,
    added.poleVectorMs,
    added.poleVectorOverrideWeight,
    transitionWeight
  )
  base.poleVectorMs = pole.out

  base.weightPosition = lerp(
    base.weightPosition,
    added.weightPosition,
    transitionWeight
  )
  base.weightOrientation = lerp(
    base.weightOrientation,
    added.weightOrientation,
    transitionWeight
  )
  base.poleVectorOverrideWeight = lerp(
    base.poleVectorOverrideWeight,
    added.poleVectorOverrideWeight,
    (rot.weightedAlpha + pos.weightedAlpha) * 0.5
  )
}

class IKTargetsStateMachine {
  readonly chainName: string
  readonly enableFloatTrack: string
  ikEndPointOffset: Vec3
  ikEndRotationOffset: Quat
  states: IkStateData[] = []
  statesFromGraph: IkStateData[] = []
  transition: IkTransitionData = {
    newId: DEFAULT_STATE_ID,
    transitionWeight: 1,
    transitionTime: 0,
    duration: 0,
    inProgress: false,
  }
  preTransitionStatus: IkSmOutput = emptyOutput()
  enableFloatTrackValue = 1
  /** Last GraphInput publish snapshot. */
  published: IkSmOutput = emptyOutput()

  constructor(settings: IKChainSettings) {
    this.chainName = settings.chainName
    this.enableFloatTrack = settings.enableFloatTrack
    this.ikEndPointOffset = { ...settings.ikEndPointOffset }
    this.ikEndRotationOffset = { ...settings.ikEndRotationOffset }
  }

  init(): void {
    this.enableFloatTrackValue = 1
    this.states = []
    this.statesFromGraph = []
    const defaultState: IkStateData = {
      request: defaultIkTargetRequest({
        priority: Number.MAX_SAFE_INTEGER - 1,
        weightPosition: 0,
        weightOrientation: 0,
        poleVectorOverrideWeight: 0,
      }),
      externalTargetPositionWs: zeroVec(),
      externalTargetPositionMs: zeroVec(),
      externalTargetOrientationWs: identQuat(),
      externalTargetOrientationMs: identQuat(),
      externalPoleVectorMs: zeroVec(),
      id: DEFAULT_STATE_ID,
      validPosition: false,
      validOrientation: false,
    }
    this.states.push(defaultState)
    this.transition = {
      newId: DEFAULT_STATE_ID,
      transitionWeight: 1,
      transitionTime: defaultState.request.transitionIn,
      duration: defaultState.request.transitionIn,
      inProgress: false,
    }
    clearOutput(this.preTransitionStatus)
  }

  private belonging(id: number): IkStateData[] {
    return id >= 0 ? this.states : this.statesFromGraph
  }

  private capacity(id: number): number {
    return id >= 0 ? MAX_EXTERNAL_STATES : MAX_GRAPH_STATES
  }

  getStatePtr(id: number): IkStateData | undefined {
    return this.belonging(id).find((s) => s.id === id)
  }

  getState(id: number): IkStateData {
    const s = this.getStatePtr(id)
    if (!s) throw new Error(`IK state ${id} missing on ${this.chainName}`)
    return s
  }

  addIKTargetState(id: number, request: SimIkTargetRequest): void {
    const arr = this.belonging(id)
    if (arr.length >= this.capacity(id)) return
    arr.push({
      request: { ...request },
      externalTargetPositionWs: zeroVec(),
      externalTargetPositionMs: zeroVec(),
      externalTargetOrientationWs: identQuat(),
      externalTargetOrientationMs: identQuat(),
      externalPoleVectorMs: zeroVec(),
      id,
      validPosition: false,
      validOrientation: false,
    })
  }

  removeIKTargetState(id: number): void {
    if (id === DEFAULT_STATE_ID) return
    if (id === this.transition.newId) {
      const best = this.findPriorityState(this.getStatePtr(id))
      this.startTransitionTo(best)
    }
    const arr = this.belonging(id)
    const i = arr.findIndex((s) => s.id === id)
    if (i >= 0) arr.splice(i, 1)
  }

  updateIKTarget(info: IKTargetParamsUpdateInfo): void {
    if (info.ref.id === DEFAULT_STATE_ID) return
    const state = this.getStatePtr(info.ref.id)
    if (!state) return
    state.validPosition = info.hasValidPosition
    if (state.validPosition) {
      state.externalTargetPositionWs = {
        x: info.externalTargetPositionWs.x,
        y: info.externalTargetPositionWs.y,
        z: info.externalTargetPositionWs.z,
      }
    } else {
      state.externalTargetPositionWs = zeroVec()
    }
    const o = info.externalTargetOrientationWs
    const ok =
      Number.isFinite(o.x) &&
      Number.isFinite(o.y) &&
      Number.isFinite(o.z) &&
      Number.isFinite(o.w) &&
      Math.hypot(o.x, o.y, o.z, o.w) > 1e-8
    state.validOrientation = ok
    if (ok) {
      state.externalTargetOrientationWs = {
        x: o.x,
        y: o.y,
        z: o.z,
        w: o.w,
      }
    } else {
      state.externalTargetOrientationWs = identQuat()
    }
  }

  private updateTargetMs(
    state: IkStateData,
    entityL2W: LookAtSphereXf
  ): void {
    const inv = invertXf(entityL2W)
    const posMs = convertPointWsToMs(
      {
        x: state.externalTargetPositionWs.x,
        y: state.externalTargetPositionWs.y,
        z: state.externalTargetPositionWs.z,
        w: 0,
      },
      entityL2W
    )
    const orientMs = quatMul(
      { x: inv.qx, y: inv.qy, z: inv.qz, w: inv.qw },
      state.externalTargetOrientationWs
    )
    state.externalTargetPositionMs = { x: posMs.x, y: posMs.y, z: posMs.z }
    state.externalTargetOrientationMs = orientMs

    const offsetMs = quatRotate(orientMs, this.ikEndPointOffset)
    state.externalTargetPositionMs.x -= offsetMs.x
    state.externalTargetPositionMs.y -= offsetMs.y
    state.externalTargetPositionMs.z -= offsetMs.z
    state.externalTargetOrientationMs = quatMul(
      orientMs,
      quatConjugate(this.ikEndRotationOffset)
    )
  }

  private findPriorityState(excluded?: IkStateData): number {
    let bestPriority = this.states[0]!.request.priority
    let bestId = this.states[0]!.id
    const scan = (arr: IkStateData[]) => {
      for (let i = arr.length - 1; i >= 0; --i) {
        const s = arr[i]!
        if (excluded && excluded === s) continue
        if (s.request.priority < bestPriority) {
          bestPriority = s.request.priority
          bestId = s.id
        }
      }
    }
    scan(this.states)
    scan(this.statesFromGraph)
    return bestId
  }

  private startTransitionTo(id: number): void {
    const current = this.getState(this.transition.newId)
    if (this.transition.transitionWeight < 1) {
      combineOutput(
        this.preTransitionStatus,
        createStateMachineOutputFromState(current),
        this.transition.transitionWeight
      )
    } else {
      this.preTransitionStatus = createStateMachineOutputFromState(current)
    }
    this.transition.newId = id
    this.transition.transitionWeight = 0
    this.transition.transitionTime = 0
    this.transition.inProgress = true
    const next = this.getState(id)
    this.transition.duration =
      current.request.priority < next.request.priority
        ? current.request.transitionOut
        : next.request.transitionIn
  }

  private updateTransition(dt: number): void {
    const t = this.transition
    if (t.transitionTime <= t.duration) {
      t.transitionTime += dt
      if (t.transitionTime < t.duration) {
        const u = t.transitionTime / t.duration
        t.transitionWeight = clamp01(u * u * (3 - 2 * u))
      } else {
        t.transitionTime = Number.POSITIVE_INFINITY
        t.transitionWeight = 1
      }
    } else if (t.inProgress) {
      t.inProgress = false
      clearOutput(this.preTransitionStatus)
    }
  }

  private updateAnimGraphRequests(
    ikTargets: Map<string, IkGraphRequestSnap> | undefined
  ): void {
    let found = false
    const snap = ikTargets?.get(this.chainName)
    if (snap && (snap.weightPosition > 0 || snap.weightRotation > 0)) {
      found = true
      const id = snap.id ?? IK_GRAPH_REQUEST_ID
      const req = defaultIkTargetRequest({
        weightPosition: snap.weightPosition,
        weightOrientation: snap.weightRotation,
        poleVectorOverrideWeight: snap.poleOverrideWeight ?? 0,
        transitionIn: snap.transitionIn ?? 0,
        transitionOut: snap.transitionOut ?? 0,
        priority: snap.priority ?? IK_PRIORITY_ANIM_GRAPH,
      })
      if (this.statesFromGraph.length > 0) {
        const currentId = this.statesFromGraph[this.statesFromGraph.length - 1]!.id
        if (id !== currentId) {
          this.addIKTargetState(id, req)
          this.removeIKTargetState(currentId)
        }
      } else {
        this.addIKTargetState(id, req)
      }
      const state = this.statesFromGraph[this.statesFromGraph.length - 1]
      if (state && state.id === id) {
        state.request.priority = req.priority
        state.externalTargetOrientationMs = { ...snap.rotMs }
        state.externalTargetPositionMs = { ...snap.posMs }
        state.request.weightPosition = req.weightPosition
        state.request.weightOrientation = req.weightOrientation
        state.validPosition = req.weightPosition > 0
        state.validOrientation = req.weightOrientation > 0
        state.externalPoleVectorMs = snap.poleMs
          ? { ...snap.poleMs }
          : zeroVec()
        state.request.poleVectorOverrideWeight = req.poleVectorOverrideWeight
      }
    }
    if (!found && this.statesFromGraph.length > 0) {
      this.removeIKTargetState(this.statesFromGraph[0]!.id)
    }
  }

  getOutput(): IkSmOutput {
    const newState = createStateMachineOutputFromState(
      this.getState(this.transition.newId)
    )
    let output: IkSmOutput
    if (this.transition.inProgress) {
      output = {
        isEnabled: this.preTransitionStatus.isEnabled,
        targetPositionMs: copyVec(this.preTransitionStatus.targetPositionMs),
        targetOrientationMs: copyQuat(
          this.preTransitionStatus.targetOrientationMs
        ),
        poleVectorMs: copyVec(this.preTransitionStatus.poleVectorMs),
        weightPosition: this.preTransitionStatus.weightPosition,
        weightOrientation: this.preTransitionStatus.weightOrientation,
        poleVectorOverrideWeight:
          this.preTransitionStatus.poleVectorOverrideWeight,
      }
      combineOutput(output, newState, this.transition.transitionWeight)
    } else {
      output = newState
    }
    output.weightPosition *= this.enableFloatTrackValue
    output.weightOrientation *= this.enableFloatTrackValue
    output.isEnabled =
      output.weightPosition > 0 || output.weightOrientation > 0
    return output
  }

  update(
    pose: Pose | undefined,
    rig: RigEntry | undefined,
    entityL2W: LookAtSphereXf,
    ikTargets: Map<string, IkGraphRequestSnap> | undefined,
    dt: number
  ): void {
    this.updateAnimGraphRequests(ikTargets)

    if (pose && rig && this.enableFloatTrack && this.enableFloatTrack !== 'None') {
      const ti = resolveTrackUnified(pose, rig, this.enableFloatTrack)
      if (ti >= 0) this.enableFloatTrackValue = readTrackValue(pose, ti)
    }

    for (let i = 1; i < this.states.length; ++i) {
      this.updateTargetMs(this.states[i]!, entityL2W)
    }

    const bestId = this.findPriorityState()
    if (this.transition.newId !== bestId) {
      this.startTransitionTo(bestId)
    }
    this.updateTransition(dt)
    this.published = this.getOutput()
  }
}

export type IkTargetsControllerUpdateCtx = {
  pose?: Pose
  rig?: RigEntry
  entityLocalToWorld?: LookAtSphereXf
  ikTargets?: Map<string, IkGraphRequestSnap>
}

/**
 * Engine IKTargetsController — one instance per GenerateIk / HumanIk node.
 */
export class IKTargetsController {
  private readonly machines: IKTargetsStateMachine[]
  /** Stashed on Update, consumed on Sample (engine i_timeDelta). */
  lastDt = 0

  constructor(chainSettings: readonly IKChainSettings[]) {
    this.machines = chainSettings
      .filter((s) => s.chainName && s.chainName !== 'None')
      .map((s) => new IKTargetsStateMachine(s))
  }

  init(): void {
    for (const m of this.machines) m.init()
    this.lastDt = 0
  }

  private findMachine(chain: string): IKTargetsStateMachine | undefined {
    return this.machines.find((m) => m.chainName === chain)
  }

  addIKTargetState(ref: SimIkTargetRef, request: SimIkTargetRequest): void {
    const m = this.findMachine(ref.part)
    if (!m) return
    m.addIKTargetState(ref.id, request)
  }

  removeIKTargetState(ref: SimIkTargetRef): void {
    this.findMachine(ref.part)?.removeIKTargetState(ref.id)
  }

  updateIKTarget(info: IKTargetParamsUpdateInfo): void {
    this.findMachine(info.ref.part)?.updateIKTarget(info)
  }

  applyServiceEvents(events: readonly SimServiceEvent[]): void {
    for (const e of events) {
      if (e.kind === 'IKTargetParams_Add') {
        this.addIKTargetState(e.ref, e.request)
      } else if (e.kind === 'IKTargetParams_Remove') {
        this.removeIKTargetState(e.ref)
      } else if (e.kind === 'IKTargetParams_Update') {
        for (const info of e.infos) this.updateIKTarget(info)
      }
    }
  }

  update(_nodeId: string, ctx: IkTargetsControllerUpdateCtx, dt: number): void {
    const entityL2W = ctx.entityLocalToWorld ?? IDENTITY_SPHERE_XF
    for (const m of this.machines) {
      m.update(ctx.pose, ctx.rig, entityL2W, ctx.ikTargets, dt)
    }
  }

  publish(board: SimInputBoard): void {
    for (const m of this.machines) {
      const o = m.published
      const g = m.chainName
      board.setBoolFeature(g, 'isEnabled', o.isEnabled)
      board.setVectorFeature(g, 'position', {
        x: o.targetPositionMs.x,
        y: o.targetPositionMs.y,
        z: o.targetPositionMs.z,
        w: 0,
      } as SimVec4)
      board.setQuatFeature(g, 'rotation', {
        x: o.targetOrientationMs.x,
        y: o.targetOrientationMs.y,
        z: o.targetOrientationMs.z,
        w: o.targetOrientationMs.w,
      })
      board.setFeature(g, 'weightPosition', o.weightPosition)
      board.setFeature(g, 'weightRotation', o.weightOrientation)
      board.setVectorFeature(g, 'poleVector', {
        x: o.poleVectorMs.x,
        y: o.poleVectorMs.y,
        z: o.poleVectorMs.z,
        w: 0,
      } as SimVec4)
      // Engine GraphInput typo
      board.setFeature(g, 'poleVectorOverideWeight', o.poleVectorOverrideWeight)
      board.setFeature(g, 'poleVectorOverrideWeight', o.poleVectorOverrideWeight)
      board.setBoolFeature(g, 'setPosition', o.weightPosition > 1e-7)
      board.setBoolFeature(g, 'setRotation', o.weightOrientation > 1e-7)
    }
  }

  /**
   * Engine HasAnyActiveIK — GraphInput isEnabled (published) or pending states
   * (Add before Sample / graph requests).
   */
  hasAnyActiveIK(): boolean {
    for (const m of this.machines) {
      if (m.published.isEnabled) return true
      if (m.states.length > 1) return true
      if (m.statesFromGraph.length > 0) return true
    }
    return false
  }

  /** Mark chain enabled immediately on Add (engine GraphInput::SetIsEnabled). */
  setChainEnabledOnBoard(board: SimInputBoard, chain: string, on: boolean): void {
    if (!chain || chain === 'None') return
    board.setBoolFeature(chain, 'isEnabled', on)
  }
}

/**
 * Engine poseUtil::InterpolateIKTargets — merge two SampleOutput.m_ikTargets by chain.
 * Alpha = blend toward `second` (Blend2 weight).
 */
export function interpolateIkTargetsMaps(
  first: ReadonlyMap<string, IkGraphRequestSnap>,
  second: ReadonlyMap<string, IkGraphRequestSnap>,
  alpha: number
): Map<string, IkGraphRequestSnap> {
  const out = new Map<string, IkGraphRequestSnap>()
  const a = Number.isFinite(alpha) ? alpha : 0

  for (const [chain, t1] of first) {
    const t2 = second.get(chain)
    if (!t2) {
      out.set(chain, {
        ...t1,
        posMs: { ...t1.posMs },
        rotMs: { ...t1.rotMs },
        poleMs: t1.poleMs ? { ...t1.poleMs } : undefined,
        weightPosition: t1.weightPosition * (1 - a),
        weightRotation: t1.weightRotation * (1 - a),
      })
      continue
    }
    const wPos1 = t1.weightPosition
    const wPos2 = t2.weightPosition
    const wRot1 = t1.weightRotation
    const wRot2 = t2.weightRotation
    const poleW1 = t1.poleOverrideWeight ?? 0
    const poleW2 = t2.poleOverrideWeight ?? 0
    const pole1 = t1.poleMs ?? { x: 0, y: 0, z: 0 }
    const pole2 = t2.poleMs ?? { x: 0, y: 0, z: 0 }
    const pos = interpolateWeightedPositions(
      t1.posMs,
      wPos1,
      t2.posMs,
      wPos2,
      a
    )
    const rot = interpolateWeightedRotations(
      t1.rotMs,
      wRot1,
      t2.rotMs,
      wRot2,
      a
    )
    const pole = interpolateWeightedPositions(pole1, poleW1, pole2, poleW2, a)
    const id1 = t1.id ?? IK_GRAPH_REQUEST_ID
    const id2 = t2.id ?? IK_GRAPH_REQUEST_ID
    out.set(chain, {
      chain,
      id: Math.max(id1, id2),
      posMs: pos.out,
      rotMs: rot.out,
      poleMs: pole.out,
      weightPosition: wPos1 * (1 - a) + wPos2 * a,
      weightRotation: wRot1 * (1 - a) + wRot2 * a,
      poleOverrideWeight: poleW1 * (1 - a) + poleW2 * a,
      priority: Math.min(t1.priority, t2.priority),
      transitionIn: lerp(t1.transitionIn ?? 0, t2.transitionIn ?? 0, a),
      transitionOut: lerp(t1.transitionOut ?? 0, t2.transitionOut ?? 0, a),
    })
  }

  for (const [chain, t2] of second) {
    if (out.has(chain)) continue
    out.set(chain, {
      ...t2,
      posMs: { ...t2.posMs },
      rotMs: { ...t2.rotMs },
      poleMs: t2.poleMs ? { ...t2.poleMs } : undefined,
      weightPosition: t2.weightPosition * a,
      weightRotation: t2.weightRotation * a,
    })
  }

  return out
}

export const IkTargetsControllerDef = new InstanceStateDef<
  IKTargetsController,
  IKChainSettings[]
>('ikTargetsController', (settings) => {
  const c = new IKTargetsController(settings)
  c.init()
  return c
})

export function ensureIkTargetsController(
  store: InstanceStore,
  handleId: string,
  settings: IKChainSettings[]
): IKTargetsController {
  return store.ensure(IkTargetsControllerDef, handleId, settings)
}

export function parseIkChainSettings(raw: unknown): IKChainSettings[] {
  if (!Array.isArray(raw)) return []
  const out: IKChainSettings[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const chainName = readCName(o.chainName)
    if (!chainName || chainName === 'None') continue
    const off = readVector4(o.ikEndPointOffset, { x: 0, y: 0, z: 0, w: 0 })
    const rot = readVector4(o.ikEndRotationOffset, {
      x: 0,
      y: 0,
      z: 0,
      w: 1,
    })
    // Quaternion may use i/j/k/r
    const rotRaw =
      o.ikEndRotationOffset && typeof o.ikEndRotationOffset === 'object'
        ? (o.ikEndRotationOffset as Record<string, unknown>)
        : null
    const quat: Quat = rotRaw
      ? {
          x: readNumber(rotRaw.i ?? rotRaw.X ?? rotRaw.x, 0),
          y: readNumber(rotRaw.j ?? rotRaw.Y ?? rotRaw.y, 0),
          z: readNumber(rotRaw.k ?? rotRaw.Z ?? rotRaw.z, 0),
          w: readNumber(rotRaw.r ?? rotRaw.W ?? rotRaw.w, 1),
        }
      : { x: rot.x, y: rot.y, z: rot.z, w: rot.w }
    out.push({
      chainName,
      enableFloatTrack: readCName(o.enableFloatTrack),
      ikEndPointOffset: { x: off.x, y: off.y, z: off.z },
      ikEndRotationOffset: quat,
    })
  }
  return out
}

export function resolveGenerateIkChainSettings(
  node: AnimgraphNode
): IKChainSettings[] {
  return parseIkChainSettings(node.Data?.ikChainSettings)
}

/** HumanIk: match genderTag+bodyTypeTag on board.entityTags; else first entry. */
export function resolveHumanIkChainSettings(
  node: AnimgraphNode,
  board: SimInputBoard
): IKChainSettings[] {
  const list = node.Data?.ikTargetsControllers
  if (!Array.isArray(list) || list.length === 0) return []
  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue
    const e = entry as Record<string, unknown>
    const gender = readCName(e.genderTag)
    const body = readCName(e.bodyTypeTag)
    const gWild = !gender || gender === 'None'
    const bWild = !body || body === 'None'
    const genderOk = gWild || board.hasEntityTag(gender)
    const bodyOk = bWild || board.hasEntityTag(body)
    if (genderOk && bodyOk) {
      const settings = parseIkChainSettings(e.ikChainSettings)
      if (settings.length) return settings
    }
  }
  const first = list[0] as Record<string, unknown> | undefined
  return first ? parseIkChainSettings(first.ikChainSettings) : []
}

export function compileIkTargetsControllerNode(
  node: AnimgraphNode,
  ctx: SimCompileCtx,
  settings: IKChainSettings[]
): void {
  ensureIkTargetsController(ctx.instanceStore, node.HandleId, settings)
  ctx.addEventListener(
    ['IKTargetParams_Add', 'IKTargetParams_Remove', 'IKTargetParams_Update'],
    (events, rt) => {
      const c = ensureIkTargetsController(
        rt.instanceStore,
        node.HandleId,
        settings
      )
      c.applyServiceEvents(events)
      for (const e of events) {
        if (e.kind === 'IKTargetParams_Add') {
          c.setChainEnabledOnBoard(rt.board, e.ref.part, true)
        }
      }
    }
  )
}

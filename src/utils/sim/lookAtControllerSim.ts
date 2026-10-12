/**
 * animAnimNode_LookAtController — events + LookAtStateMachine transitions + followers.
 *
 * Update: publish masters + enable dependents; accumulate substep time (+ dilatation factor).
 * Sample: spheres; SM LookAtQuat follow / back-behind / soft cone / transitions / float tracks;
 *   follower V/H + inner chase in substeps × dilatation.
 */

import type { AnimgraphNode } from '../graph/animgraphTypes'
import type { InstanceStore } from '../InstanceStore'
import type { Pose } from './pose'
import type { RigEntry } from './rigResource'
import { getTransformMs, resolveUnifiedName } from './poseFk'
import type { SimInputBoard } from './SimInputBoard'
import type { SimVec4 } from './evalAnimMathExpressionVector'
import { evalCurveFloatData } from './floatDyn'
import {
  LookAtControllerDynDef,
  createLookAtControllerDyn,
  createLookAtFollowerDyn,
  createLookAtMasterSmDyn,
  createLookAtSmStateDyn,
  defaultPartSphere,
  emptyLookAtPartOutput,
  lookAtRequestKey,
  type LookAtControllerDyn,
  type LookAtFollowerDyn,
  type LookAtMasterSmDyn,
  type LookAtMasterSphereOut,
  type LookAtPartOutput,
  type LookAtPartSphere,
  type LookAtSmStateDyn,
} from './lookAtControllerDyn'
import {
  IDENTITY_SPHERE_XF,
  applySoftConeLimit,
  castPointMsToSphere,
  chaseSphereTowardTarget,
  convertPointMsToWs,
  convertPointSphereSpaceToMs,
  convertPointWsToMs,
  easeInEaseOut,
  eulerDegToSpherePoint,
  eyesLookAtDirectionFromTargetMs,
  followWithLookAtQuaternion,
  followTargetOnSphere,
  interpolatePointsInSphereSpace,
  invertXf,
  isHardLimitReached,
  shortestRotationPitchYawDeg,
  sphereAngleRad,
  sphereDirDistanceToMs,
  spherePointToEulerDeg,
  transformPointByXf,
  type LookAtSphereXf,
} from './lookAtMath'

/** World / facial context for LookAtController Update+Sample. */
export type LookAtSpaceCtx = {
  entityLocalToWorld: LookAtSphereXf
  parentObjectLocalToWorld: LookAtSphereXf
  isFacial: boolean
  eyesLookAtEnabled: number
  setEyesLookAtEnabled?: (v: number) => void
}

export const DEFAULT_LOOKAT_SPACE_CTX: LookAtSpaceCtx = {
  entityLocalToWorld: IDENTITY_SPHERE_XF,
  parentObjectLocalToWorld: IDENTITY_SPHERE_XF,
  isFacial: false,
  eyesLookAtEnabled: 0,
}
import {
  defaultLookAtLimits,
  defaultLookAtPartRequest,
  LOOKAT_MAX_ADDITIONAL_PARTS,
  LOOKAT_UNLIMITED_ADDITIONAL_WEIGHT,
  type SimLookAtPartRequest,
  type SimLookAtRequest,
} from './simServiceEvents'
import type { SimCompileCtx } from './simCompile'
import type { SimServiceEvent } from './simServiceEvents'
import { readCName, readNumber } from './simDataUtils'
import { readTrackValue, resolveTrackUnified, writeTrackValue } from './pose'

/** LookAtStatus bitflags (anim::LookAtStatus). */
const LOOKAT_STATUS_ACTIVE = 1
const LOOKAT_STATUS_LIMIT_REACHED = 2
const LOOKAT_STATUS_TRANSITION = 4
const LOOKAT_BACK_THRESHOLD_DEG = 270
const LOOKAT_BEHIND_BACK_DELAY = 5

/** Engine Config::cvMaxIterationsCount default. */
const LOOKAT_MAX_SUBSTEPS = 3
/** StartTransitionTo min angular span (degrees). */
const LOOKAT_MIN_TRANSITION_DEGREES = 30

function copyVec(v: SimVec4): SimVec4 {
  return { x: v.x, y: v.y, z: v.z, w: v.w ?? 0 }
}

type PartSmSettings = {
  partName: string
  partAlias: string
  sphereBone: string
  sphereRadius: number
  followingSpeedFactor: number
  followingSpeedByAngleCurve: unknown
  transitionSpeedMultiplier: number
  blendWeightPowFactor: number
  enableFloatTrack: string
  eyesOverrideFloatTrack: string
  coneLimitReached: string
}

function readNamedTrackName(raw: unknown): string {
  if (raw == null) return ''
  if (typeof raw === 'string') return raw
  if (typeof raw !== 'object') return ''
  const o = raw as Record<string, unknown>
  const inner =
    o.Data && typeof o.Data === 'object' ? (o.Data as Record<string, unknown>) : o
  return readCName(inner.name) || readCName(raw)
}

function readArray(raw: unknown): unknown[] {
  return Array.isArray(raw) ? raw : []
}

function parseSmSettings(node: AnimgraphNode): PartSmSettings[] {
  const out: PartSmSettings[] = []
  for (const item of readArray(node.Data?.stateMachinesSettings)) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const partName = readCName(o.partName)
    if (!partName || partName === 'None') continue
    out.push({
      partName,
      partAlias: readCName(o.partAlias),
      sphereBone: readCName(o.sphereAttachmentBone),
      sphereRadius: readNumber(o.sphereRadius, 1),
      followingSpeedFactor: readNumber(o.followingSpeedFactor, 1),
      followingSpeedByAngleCurve: o.followingSpeedByAngleCurve,
      transitionSpeedMultiplier: readNumber(o.transitionSpeedMultiplier, 1),
      blendWeightPowFactor: readNumber(o.blendWeightPowFactor, 1),
      enableFloatTrack: readNamedTrackName(o.enableFloatTrack),
      eyesOverrideFloatTrack: readNamedTrackName(o.eyesOverrideFloatTrack),
      coneLimitReached: readNamedTrackName(o.coneLimitReached),
    })
  }
  return out
}

/** Slave parts from bodyPartsDependencies — no SM; skip request ownership. */
function parseSlaveParts(node: AnimgraphNode): Set<string> {
  const slaves = new Set<string>()
  for (const item of readArray(node.Data?.bodyPartsDependencies)) {
    if (!item || typeof item !== 'object') continue
    const slave = readCName((item as Record<string, unknown>).slavePart)
    if (slave && slave !== 'None') slaves.add(slave)
  }
  return slaves
}

type PartDependency = {
  master: string
  slave: string
  /** Degrees in graph data (engine DEG2RAD on Build). */
  angle: number
  speedToTargetFactor: number
  speedToTargetByAngleCurve: unknown
  verticalPullSpeedFactor: number
  verticalPullSpeedByAngleCurve: unknown
  horizontalPullSpeedFactor: number
  horizontalPullSpeedByAngleCurve: unknown
  pullScaleBySquareSizeFactor: number
  pullScaleBySquareSizeCurve: unknown
  innerSquareScale: number
}

/** Flat dependency list (master → slave with follower params). */
function parseDependencies(node: AnimgraphNode): PartDependency[] {
  const out: PartDependency[] = []
  for (const item of readArray(node.Data?.bodyPartsDependencies)) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const master = readCName(o.masterPart)
    const slave = readCName(o.slavePart)
    if (!master || master === 'None' || !slave || slave === 'None') continue
    out.push({
      master,
      slave,
      angle: readNumber(o.angle, 0),
      speedToTargetFactor: readNumber(o.speedToTargetFactor, 1),
      speedToTargetByAngleCurve: o.speedToTargetByAngleCurve,
      verticalPullSpeedFactor: readNumber(o.verticalPullSpeedFactor, 0),
      verticalPullSpeedByAngleCurve: o.verticalPullSpeedByAngleCurve,
      horizontalPullSpeedFactor: readNumber(o.horizontalPullSpeedFactor, 0),
      horizontalPullSpeedByAngleCurve: o.horizontalPullSpeedByAngleCurve,
      pullScaleBySquareSizeFactor: readNumber(o.pullScaleBySquareSizeFactor, 1),
      pullScaleBySquareSizeCurve: o.pullScaleBySquareSizeCurve,
      innerSquareScale: readNumber(o.innerSquareScale, 1),
    })
  }
  return out
}

/** Direct master → slave[] from bodyPartsDependencies. */
function parseDependentPartsMap(node: AnimgraphNode): Map<string, string[]> {
  const map = new Map<string, string[]>()
  for (const d of parseDependencies(node)) {
    let arr = map.get(d.master)
    if (!arr) {
      arr = []
      map.set(d.master, arr)
    }
    arr.push(d.slave)
  }
  return map
}

/**
 * Engine GetRecursiveDependentParts — BFS of dependency tree, capped at
 * LOOKAT_MAX_ADDITIONAL_PARTS (StaticArray size).
 */
function recursiveDependentParts(
  node: AnimgraphNode,
  rootPart: string
): string[] {
  const deps = parseDependentPartsMap(node)
  const result: string[] = []
  const visit = (part: string) => {
    for (const child of deps.get(part) ?? []) {
      if (result.includes(child)) continue
      if (result.length >= LOOKAT_MAX_ADDITIONAL_PARTS) return
      result.push(child)
      visit(child)
      if (result.length >= LOOKAT_MAX_ADDITIONAL_PARTS) return
    }
  }
  visit(rootPart)
  return result
}

/** Align request additionalParts to SM names (engine AddLookAt resize + fill). */
function alignAdditionalParts(
  names: string[],
  fromRequest: SimLookAtPartRequest[] | undefined
): SimLookAtPartRequest[] {
  const src = fromRequest ?? []
  return names.map((name) => {
    const found = src.find((p) => p.partName === name)
    return found
      ? { ...found, partName: name }
      : defaultLookAtPartRequest(name)
  })
}

function blendAdditionalParts(
  alpha: number,
  a: SimLookAtPartRequest[],
  b: SimLookAtPartRequest[]
): SimLookAtPartRequest[] {
  const n = Math.min(a.length, b.length)
  const out: SimLookAtPartRequest[] = []
  for (let i = 0; i < n; i++) {
    const p1 = a[i]!
    const p2 = b[i]!
    out.push({
      partName: p1.partName,
      weight: p1.weight + (p2.weight - p1.weight) * alpha,
      suppress: p1.suppress + (p2.suppress - p1.suppress) * alpha,
      mode: alpha < 0.5 ? p1.mode : p2.mode,
    })
  }
  return out
}

function copyAdditionalParts(
  parts: SimLookAtPartRequest[]
): SimLookAtPartRequest[] {
  return parts.map((p) => ({ ...p }))
}

function parseDefaultBones(node: AnimgraphNode): Map<string, string> {
  const map = new Map<string, string>()
  for (const item of readArray(node.Data?.orderedBodyParts)) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const part = readCName(o.partName)
    const bone = readCName(o.defaultPositionBoneName)
    if (part && part !== 'None' && bone && bone !== 'None') map.set(part, bone)
  }
  return map
}

function boneTranslationMs(
  pose: Pose,
  rig: RigEntry,
  boneName: string
): SimVec4 | null {
  const idx = resolveUnifiedName(pose, rig, boneName)
  if (idx < 0) return null
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
  if (!getTransformMs(pose, rig, idx, ms)) return null
  return { x: ms.tx, y: ms.ty, z: ms.tz, w: 0 }
}

/** Enable slaves from master outputs (Update — Switch isEnabled before Sample chase). */
function enableDependentOutputs(
  outputs: Map<string, LookAtPartOutput>,
  deps: PartDependency[]
): void {
  for (const d of deps) {
    const master = outputs.get(d.master)
    if (!master?.isEnabled || outputs.has(d.slave)) continue
    outputs.set(d.slave, {
      isEnabled: true,
      target: copyVec(master.target),
      rawTarget: { x: 0, y: 0, z: 0, w: 0 },
      distance: master.distance,
      suppress: master.suppress,
      mode: master.mode,
      blendWeight: 0,
    })
  }
}

function ensureFollower(
  dyn: LookAtControllerDyn,
  slave: string
): LookAtFollowerDyn {
  let f = dyn.followers.get(slave)
  if (!f) {
    f = createLookAtFollowerDyn()
    dyn.followers.set(slave, f)
  }
  return f
}

/** Engine LookAtFollower::Set from master SM sphere out (not weight/suppress/mode). */
function setFollowerFromMaster(
  f: LookAtFollowerDyn,
  master: LookAtMasterSphereOut
): void {
  f.isEnabled = f.isEnabled || master.isEnabled
  f.isParentEnabled = master.isEnabled
  f.followTargetSphere = copyVec(master.spherePt)
  f.distance = master.distance
  f.sphereXf = { ...master.xf }
  f.sphereRadius = master.radius > 1e-8 ? master.radius : 1
}

/** Engine LookAtFollower::Set(LookAtPartRequest) — square weight / suppress / mode. */
function setFollowerFromAdditionalPart(
  f: LookAtFollowerDyn,
  part: SimLookAtPartRequest
): void {
  f.weight = part.weight
  f.suppress = part.suppress
  f.mode = part.mode
}

/** Apply SM published additionalParts onto follower dyn (before follower Update). */
function applyPublishedAdditionalParts(
  dyn: LookAtControllerDyn,
  sm: LookAtMasterSmDyn
): void {
  for (const ap of sm.publishedAdditionalParts) {
    if (!ap.partName || ap.partName === 'None') continue
    setFollowerFromAdditionalPart(ensureFollower(dyn, ap.partName), ap)
  }
}

/**
 * LookAtFollower::Update — V/H default pulls then inner-square chase; publish.
 * Outer-square step left disabled (engine TODO).
 */
function updateAndPublishFollowers(
  dyn: LookAtControllerDyn,
  node: AnimgraphNode,
  pose: Pose | null,
  rig: RigEntry | null,
  dt: number
): void {
  const deps = parseDependencies(node)
  const defaultBones = parseDefaultBones(node)
  const activeSlaves = new Set<string>()

  for (const d of deps) {
    const master = dyn.masterSphere.get(d.master)
    if (!master?.isEnabled) continue
    activeSlaves.add(d.slave)
    const f = ensureFollower(dyn, d.slave)
    setFollowerFromMaster(f, master)

    // defaultTargetMs (slave bone) + offsetMs = slave − master (engine SetOffset)
    if (pose && rig) {
      const masterBone = defaultBones.get(d.master)
      const slaveBone = defaultBones.get(d.slave)
      const mPos = masterBone ? boneTranslationMs(pose, rig, masterBone) : null
      const sPos = slaveBone ? boneTranslationMs(pose, rig, slaveBone) : null
      if (sPos) f.defaultTargetMs = copyVec(sPos)
      if (mPos && sPos) {
        f.offsetMs = {
          x: sPos.x - mPos.x,
          y: sPos.y - mPos.y,
          z: sPos.z - mPos.z,
          w: 0,
        }
      }
    }

    if (!f.firstUpdateDone) {
      if (f.isEnabled) {
        f.centerSphere = copyVec(f.followTargetSphere)
        f.firstUpdateDone = true
      } else {
        continue
      }
    }

    // Graph angle is degrees; engine stores m_angle = DEG2RAD(angle).
    // outer = m_angle * i_weight (additionalParts).
    const outerAngleRad = ((d.angle * f.weight) * Math.PI) / 180
    const innerAngleRad = d.innerSquareScale * outerAngleRad
    const innerAngleDeg = (innerAngleRad * 180) / Math.PI

    // GetDefaultTargetPositionSphereSpace = Cast(defaultTargetMs − offsetMs)
    const defaultMsMinusOffset = {
      x: f.defaultTargetMs.x - f.offsetMs.x,
      y: f.defaultTargetMs.y - f.offsetMs.y,
      z: f.defaultTargetMs.z - f.offsetMs.z,
      w: 0,
    }
    const defaultTargetSphere = castPointMsToSphere(
      defaultMsMinusOffset,
      f.sphereXf,
      f.sphereRadius
    )
    const defaultEuler = spherePointToEulerDeg(defaultTargetSphere)

    const pullScale =
      d.pullScaleBySquareSizeFactor *
      (d.pullScaleBySquareSizeCurve != null
        ? evalCurveFloatData(d.pullScaleBySquareSizeCurve, innerAngleDeg)
        : innerAngleDeg)

    const prev = copyVec(f.centerSphere)

    // 1st: vertical pull toward default pitch
    if (d.verticalPullSpeedFactor > 0) {
      const c = spherePointToEulerDeg(f.centerSphere)
      const vertTarget = eulerDegToSpherePoint(
        defaultEuler.pitch,
        c.yaw,
        f.sphereRadius
      )
      f.centerSphere = followTargetOnSphere(
        f.centerSphere,
        vertTarget,
        f.sphereRadius,
        pullScale * d.verticalPullSpeedFactor,
        d.verticalPullSpeedByAngleCurve ?? null,
        dt,
        evalCurveFloatData
      )
    }

    // 2nd: horizontal pull toward default yaw
    if (d.horizontalPullSpeedFactor > 0) {
      const c = spherePointToEulerDeg(f.centerSphere)
      const horizTarget = eulerDegToSpherePoint(
        c.pitch,
        defaultEuler.yaw,
        f.sphereRadius
      )
      f.centerSphere = followTargetOnSphere(
        f.centerSphere,
        horizTarget,
        f.sphereRadius,
        pullScale * d.horizontalPullSpeedFactor,
        d.horizontalPullSpeedByAngleCurve ?? null,
        dt,
        evalCurveFloatData
      )
    }

    // 4th: chase toward follow target beyond inner square (geodesic stand-in)
    const angDeg =
      (sphereAngleRad(f.centerSphere, f.followTargetSphere) * 180) / Math.PI
    const curveVal = d.speedToTargetByAngleCurve
      ? evalCurveFloatData(d.speedToTargetByAngleCurve, angDeg)
      : angDeg
    const speedRad = ((d.speedToTargetFactor * curveVal) * Math.PI) / 180
    f.centerSphere = chaseSphereTowardTarget(
      f.centerSphere,
      f.followTargetSphere,
      f.sphereRadius,
      innerAngleRad,
      Math.max(0, speedRad * dt)
    )

    const moved =
      Math.hypot(
        f.centerSphere.x - prev.x,
        f.centerSphere.y - prev.y,
        f.centerSphere.z - prev.z
      ) > 1e-3
    f.isEnabled = f.isParentEnabled || moved

    const centerMs = convertPointSphereSpaceToMs(f.centerSphere, f.sphereXf)
    const targetMs = {
      x: centerMs.x + f.offsetMs.x,
      y: centerMs.y + f.offsetMs.y,
      z: centerMs.z + f.offsetMs.z,
      w: 0,
    }
    dyn.outputs.set(d.slave, {
      isEnabled: f.isEnabled,
      target: targetMs,
      rawTarget: { x: 0, y: 0, z: 0, w: 0 },
      distance: f.distance,
      // suppress/mode from additionalParts Set (not master SM)
      suppress: f.suppress,
      mode: f.mode,
      blendWeight: 0,
    })
  }

  for (const slave of [...dyn.followers.keys()]) {
    if (!activeSlaves.has(slave)) {
      dyn.followers.delete(slave)
      dyn.outputs.delete(slave)
    }
  }
}

function resolvePartAlias(
  partOrAlias: string,
  settings: PartSmSettings[]
): string {
  for (const s of settings) {
    if (s.partName === partOrAlias) return s.partName
    if (s.partAlias && s.partAlias === partOrAlias) return s.partName
  }
  return partOrAlias
}

export function ensureLookAtControllerDyn(
  store: InstanceStore,
  handleId: string
): LookAtControllerDyn {
  let s = store.get(LookAtControllerDynDef, handleId)
  if (!s) s = store.set(LookAtControllerDynDef, handleId, createLookAtControllerDyn())
  return s
}

/** Apply a frame's look-at service events into dyn (fan-out safe — shared event list). */
export function applyLookAtServiceEvents(
  dyn: LookAtControllerDyn,
  events: readonly SimServiceEvent[]
): void {
  for (const e of events) {
    if (e.kind === 'LookAtParams_Add') {
      dyn.requests.set(lookAtRequestKey(e.ref), {
        ref: { id: e.ref.id, part: e.ref.part },
        request: {
          ...e.request,
          followingSpeedFactorOverride:
            e.request.followingSpeedFactorOverride ?? -1,
          limits: defaultLookAtLimits(e.request.limits),
          calculatePositionInParentSpace:
            e.request.calculatePositionInParentSpace ?? false,
        },
        targetWs: { x: 0, y: 0, z: 0, w: 0 },
      })
    } else if (e.kind === 'LookAtParams_Remove') {
      dyn.requests.delete(lookAtRequestKey(e.ref))
      // Mirror LookAtStateMachine::RemoveLookAt when SM already exists.
      for (const sm of dyn.masterSm.values()) {
        if (!sm.states.has(e.ref.id) || e.ref.id === 0) continue
        const removingActive = sm.transition.newId === e.ref.id
        if (removingActive) {
          stopSmTransition(sm, e.hasOutTransition, e.outTransitionSpeed)
        }
        sm.states.delete(e.ref.id)
        if (removingActive) {
          startSmTransitionTo(sm, findPrioritySmState(sm), 1)
        }
      }
    } else if (e.kind === 'LookAtParams_UpdatePositions') {
      for (const info of e.infos) {
        const key = lookAtRequestKey(info.ref)
        const req = dyn.requests.get(key)
        if (req) req.targetWs = copyVec(info.targetWs)
      }
    }
  }
}

function sphereForPart(
  dyn: LookAtControllerDyn,
  part: string,
  settingsByPart: Map<string, PartSmSettings>
): LookAtPartSphere {
  const cached = dyn.spheres.get(part)
  if (cached) return cached
  const sm = settingsByPart.get(part)
  return defaultPartSphere(sm?.sphereRadius ?? 1)
}

function stateEffectivePriority(state: LookAtSmStateDyn): number {
  return state.hardLimitReached
    ? Number.MAX_SAFE_INTEGER
    : state.request.priority
}

function findPrioritySmState(sm: LookAtMasterSmDyn): number {
  let bestId = 0
  let bestPri = Number.MAX_SAFE_INTEGER
  // Prefer lastly-added on ties (engine scans backwards).
  const ids = [...sm.states.keys()].sort((a, b) => a - b)
  for (let i = ids.length - 1; i >= 0; i--) {
    const id = ids[i]!
    const st = sm.states.get(id)!
    const pri = stateEffectivePriority(st)
    if (pri < bestPri) {
      bestPri = pri
      bestId = id
    }
  }
  return bestId
}

function appendSmPre(
  sm: LookAtMasterSmDyn,
  spherePt: SimVec4,
  distance: number,
  weight: number,
  isDefault: boolean,
  suppress: number,
  mode: number,
  additionalParts: SimLookAtPartRequest[],
  radius: number
): void {
  if (sm.pre.empty) {
    sm.pre.spherePt = copyVec(spherePt)
    sm.pre.distance = distance
    sm.pre.isDefaultState = isDefault ? 1 : 0
    sm.pre.suppress = suppress
    sm.pre.mode = mode
    sm.pre.additionalParts = copyAdditionalParts(additionalParts)
    sm.pre.empty = false
    return
  }
  sm.pre.spherePt = interpolatePointsInSphereSpace(
    weight,
    sm.pre.spherePt,
    spherePt,
    radius
  )
  sm.pre.distance = sm.pre.distance + (distance - sm.pre.distance) * weight
  sm.pre.isDefaultState =
    sm.pre.isDefaultState + ((isDefault ? 1 : 0) - sm.pre.isDefaultState) * weight
  sm.pre.suppress = sm.pre.suppress + (suppress - sm.pre.suppress) * weight
  sm.pre.mode = weight < 0.5 ? sm.pre.mode : mode
  sm.pre.additionalParts = blendAdditionalParts(
    weight,
    sm.pre.additionalParts,
    additionalParts
  )
}

function stopSmTransition(
  sm: LookAtMasterSmDyn,
  hasOutTransition: boolean,
  outTransitionSpeed: number
): void {
  const cur = sm.states.get(sm.transition.newId)
  if (!cur) return
  if (sm.transition.weight > 0) {
    appendSmPre(
      sm,
      cur.lastLimitedSphere,
      cur.distance,
      sm.transition.weight,
      cur.id === 0,
      cur.request.suppress,
      cur.request.mode,
      cur.request.additionalParts,
      1
    )
  }
  const def = sm.states.get(0)
  if (!def) return
  if (cur.id !== 0) {
    if (hasOutTransition) def.request.transitionSpeed = outTransitionSpeed
    else if (cur.request.hasOutTransition)
      def.request.transitionSpeed = cur.request.outTransitionSpeed
    else def.request.transitionSpeed = cur.request.transitionSpeed
    def.request.mode = cur.request.mode
    def.request.calculatePositionInParentSpace =
      cur.request.calculatePositionInParentSpace
    const n = Math.min(
      def.request.additionalParts.length,
      cur.request.additionalParts.length
    )
    for (let i = 0; i < n; i++) {
      def.request.additionalParts[i]!.mode = cur.request.additionalParts[i]!.mode
    }
  } else {
    def.request.transitionSpeed = 60
    def.request.mode = 0
    def.request.calculatePositionInParentSpace = false
    for (const ap of def.request.additionalParts) ap.mode = 0
  }
}

function startSmTransitionTo(
  sm: LookAtMasterSmDyn,
  id: number,
  transitionSpeedMultiplier: number
): void {
  sm.transition.newId = id
  sm.transition.weight = 0
  sm.transition.time = 0
  sm.transition.duration = 0
  const next = sm.states.get(id)
  if (!next) return
  const prevPt = sm.pre.empty ? next.lastLimitedSphere : sm.pre.spherePt
  const angDeg =
    (sphereAngleRad(prevPt, next.lastLimitedSphere) * 180) / Math.PI
  const speed = Math.max(
    1e-4,
    next.request.transitionSpeed * transitionSpeedMultiplier
  )
  sm.transition.duration =
    Math.max(angDeg, LOOKAT_MIN_TRANSITION_DEGREES) / speed
}

function updateSmTransition(sm: LookAtMasterSmDyn, dt: number): void {
  const tr = sm.transition
  if (tr.time + dt < tr.duration) {
    tr.time += dt
    tr.weight = easeInEaseOut(tr.time / Math.max(1e-8, tr.duration))
  } else {
    tr.time = tr.duration
    tr.weight = 1
    sm.pre.empty = true
  }
}

function refreshSmBlendedOutput(
  sm: LookAtMasterSmDyn,
  radius: number,
  blendWeightPowFactor: number,
  defaultSphere: SimVec4
): void {
  const cur = sm.states.get(sm.transition.newId)
  if (!cur) return
  // GetRawOutput = pre.Append(current, weight)
  let spherePt: SimVec4
  let distance: number
  let isDefault: number
  let suppress: number
  let mode: number
  let additionalParts: SimLookAtPartRequest[]
  if (sm.pre.empty) {
    spherePt = copyVec(cur.lastLimitedSphere)
    distance = cur.distance
    isDefault = cur.id === 0 ? 1 : 0
    suppress = cur.request.suppress
    mode = cur.request.mode
    additionalParts = copyAdditionalParts(cur.request.additionalParts)
  } else {
    const w = sm.transition.weight
    spherePt = interpolatePointsInSphereSpace(
      w,
      sm.pre.spherePt,
      cur.lastLimitedSphere,
      radius
    )
    distance = sm.pre.distance + (cur.distance - sm.pre.distance) * w
    isDefault =
      sm.pre.isDefaultState + ((cur.id === 0 ? 1 : 0) - sm.pre.isDefaultState) * w
    suppress = sm.pre.suppress + (cur.request.suppress - sm.pre.suppress) * w
    mode = w < 0.5 ? sm.pre.mode : cur.request.mode
    additionalParts = blendAdditionalParts(
      w,
      sm.pre.additionalParts,
      cur.request.additionalParts
    )
  }

  // GetOutput: blend toward default by enableFloatTrackValue
  const enable = sm.enableFloatTrackValue
  spherePt = interpolatePointsInSphereSpace(
    enable,
    defaultSphere,
    spherePt,
    radius
  )
  suppress *= enable
  additionalParts = additionalParts.map((p) => ({
    ...p,
    suppress: p.suppress * enable,
  }))

  sm.publishedSphere = spherePt
  sm.publishedDistance = distance
  sm.publishedSuppress = suppress
  sm.publishedMode = mode
  sm.publishedIsDefault = isDefault
  sm.publishedAdditionalParts = additionalParts
  sm.softLimitReached = cur.softLimitReached
  sm.hardLimitReached = cur.hardLimitReached
  // blendWeight = (1 - isDefault) * enable; ease-out pow
  let bw = (1 - isDefault) * enable
  const p = blendWeightPowFactor
  bw = -Math.pow(-(bw - 1), p) + 1
  sm.blendWeight = bw
  const onlyDefaultDone =
    sm.transition.newId === 0 &&
    sm.transition.weight >= 1 - 1e-6 &&
    sm.states.size <= 1
  sm.isEnabled = sm.states.size > 1 || !onlyDefaultDone
}

function stepSmStateFollow(
  state: LookAtSmStateDyn,
  desiredSphereIn: SimVec4,
  distance: number,
  radius: number,
  sphereXf: LookAtSphereXf,
  followingSpeedFactor: number,
  followingSpeedByAngleCurve: unknown,
  dt: number,
  space: LookAtSpaceCtx
): void {
  let desiredSphere = copyVec(desiredSphereIn)
  state.distance = distance
  const limits = defaultLookAtLimits(state.request.limits)
  state.hardLimitReached = isHardLimitReached(
    desiredSphere,
    distance,
    limits.hardLimitDegrees,
    limits.hardLimitDistance
  )

  if (!state.firstUpdateDone) {
    state.lastTargetSphere = copyVec(desiredSphere)
    if (state.request.calculatePositionInParentSpace) {
      // parentSpace ← inv(parent) · targetWs
      state.lastTargetParentSpace = transformPointByXf(
        invertXf(space.parentObjectLocalToWorld),
        state.targetWs
      )
    }
    state.isTargetMovingBehindBack = false
    state.firstUpdateDone = true
  } else if (state.id === 0) {
    state.lastTargetSphere = copyVec(desiredSphere)
  } else {
    // Parent-space: lastMs = inv(L2W) · parent · lastParent → cast to sphere
    if (state.request.calculatePositionInParentSpace) {
      const lastWs = transformPointByXf(
        space.parentObjectLocalToWorld,
        state.lastTargetParentSpace
      )
      const lastMs = convertPointWsToMs(lastWs, space.entityLocalToWorld)
      state.lastTargetSphere = castPointMsToSphere(lastMs, sphereXf, radius)
    }

    if (dt > 0) {
      let rot = shortestRotationPitchYawDeg(
        state.lastTargetSphere,
        desiredSphere
      )
      const prevBehind = state.isTargetMovingBehindBack
      state.isTargetMovingBehindBack =
        (rot.angleRad * 180) / Math.PI > LOOKAT_BACK_THRESHOLD_DEG
      if (prevBehind && !state.isTargetMovingBehindBack) {
        state.moveBehindBackTimer = LOOKAT_BEHIND_BACK_DELAY
      }
      if (state.isTargetMovingBehindBack && state.moveBehindBackTimer > 0) {
        const lastE = spherePointToEulerDeg(state.lastTargetSphere)
        const curE = spherePointToEulerDeg(desiredSphere)
        desiredSphere = eulerDegToSpherePoint(curE.pitch, lastE.yaw, radius)
        rot = shortestRotationPitchYawDeg(state.lastTargetSphere, desiredSphere)
      }

      const override = state.request.followingSpeedFactorOverride
      const factor = override >= 0 ? override : followingSpeedFactor
      const angDeg = (rot.angleRad * 180) / Math.PI
      const curveVal =
        followingSpeedByAngleCurve != null
          ? evalCurveFloatData(followingSpeedByAngleCurve, angDeg)
          : angDeg
      const followingSpeedRad = ((factor * curveVal) * Math.PI) / 180
      state.lastTargetSphere = followWithLookAtQuaternion(
        state.lastTargetSphere,
        desiredSphere,
        radius,
        Math.max(0, followingSpeedRad * dt)
      )
    }

    if (state.request.calculatePositionInParentSpace) {
      // parentSpace ← inv(parent) · L2W · ConvertSphereToMs(last)
      const ms = convertPointSphereSpaceToMs(state.lastTargetSphere, sphereXf)
      const ws = convertPointMsToWs(ms, space.entityLocalToWorld)
      state.lastTargetParentSpace = transformPointByXf(
        invertXf(space.parentObjectLocalToWorld),
        ws
      )
    }
  }

  state.moveBehindBackTimer = Math.max(
    0,
    state.moveBehindBackTimer - Math.max(0, dt)
  )

  const soft = applySoftConeLimit(
    state.lastTargetSphere,
    radius,
    limits.softLimitDegrees
  )
  state.lastLimitedSphere = soft.limited
  state.softLimitReached = soft.softLimitReached
}

function writeMasterOutput(
  dyn: LookAtControllerDyn,
  part: string,
  sm: LookAtMasterSmDyn,
  xf: LookAtSphereXf,
  radius: number
): void {
  if (!sm.isEnabled) return
  const published = sphereDirDistanceToMs(
    sm.publishedSphere,
    sm.publishedDistance,
    xf
  )
  dyn.outputs.set(part, {
    isEnabled: true,
    target: published,
    rawTarget: copyVec(published),
    distance: sm.publishedDistance,
    suppress: sm.publishedSuppress,
    mode: sm.publishedMode,
    blendWeight: sm.blendWeight,
  })
  dyn.masterSphere.set(part, {
    spherePt: copyVec(sm.publishedSphere),
    distance: sm.publishedDistance,
    xf: { ...xf },
    radius,
    suppress: sm.publishedSuppress,
    mode: sm.publishedMode,
    isEnabled: true,
  })
}

function orderedMasterParts(
  dyn: LookAtControllerDyn,
  node: AnimgraphNode
): string[] {
  const settings = parseSmSettings(node)
  const settingsByPart = new Map(settings.map((s) => [s.partName, s]))
  const slaves = parseSlaveParts(node)
  const parts = new Set<string>()
  for (const req of dyn.requests.values()) {
    const part = resolvePartAlias(req.ref.part, settings)
    if (!part || part === 'None' || slaves.has(part)) continue
    if (settings.length > 0 && !settingsByPart.has(part)) continue
    parts.add(part)
  }
  for (const part of dyn.masterSm.keys()) {
    const sm = dyn.masterSm.get(part)!
    if (sm.states.size > 1 || sm.isEnabled) parts.add(part)
  }
  // orderedBodyParts order = engine m_stateMachines build order (main first)
  const ordered: string[] = []
  for (const item of readArray(node.Data?.orderedBodyParts)) {
    if (!item || typeof item !== 'object') continue
    const part = readCName((item as Record<string, unknown>).partName)
    if (!part || part === 'None' || slaves.has(part) || !parts.has(part)) continue
    ordered.push(part)
    parts.delete(part)
  }
  for (const p of parts) ordered.push(p)
  return ordered
}

/**
 * Sync request ids → SM states; update positions; optional transition step; publish.
 */
function updateMasterStateMachines(
  dyn: LookAtControllerDyn,
  node: AnimgraphNode,
  pose: Pose | null,
  rig: RigEntry | null,
  dt: number,
  advanceTransition: boolean,
  space: LookAtSpaceCtx
): void {
  const settings = parseSmSettings(node)
  const settingsByPart = new Map(settings.map((s) => [s.partName, s]))
  const defaultBones = parseDefaultBones(node)
  const parts = orderedMasterParts(dyn, node)

  for (const part of [...dyn.masterSm.keys()]) {
    if (!parts.includes(part) && dyn.masterSm.get(part)!.states.size <= 1) {
      dyn.masterSm.delete(part)
    }
  }

  // First SM is main; later SMs gated by main default blend (documented engine intent).
  let mainInDefault = 0

  for (let partIndex = 0; partIndex < parts.length; partIndex++) {
    const part = parts[partIndex]!
    const isMainSm = partIndex === 0
    let sm = dyn.masterSm.get(part)
    if (!sm) {
      sm = createLookAtMasterSmDyn()
      dyn.masterSm.set(part, sm)
    }
    const smSettings = settingsByPart.get(part)
    const sphere = sphereForPart(dyn, part, settingsByPart)
    const radius = sphere.radius
    const mult = smSettings?.transitionSpeedMultiplier ?? 1
    const pow = smSettings?.blendWeightPowFactor ?? 1
    const followFactor = smSettings?.followingSpeedFactor ?? 1
    const followCurve = smSettings?.followingSpeedByAngleCurve

    // SM additionalPartsNames = recursive dependents (engine SetAdditionalPartsNames)
    const addPartNames = recursiveDependentParts(node, part)

    // Sync states from requests for this part
    const activeIds = new Set<number>([0])
    for (const req of dyn.requests.values()) {
      const p = resolvePartAlias(req.ref.part, settings)
      if (p !== part) continue
      activeIds.add(req.ref.id)
      const alignedReq: SimLookAtRequest = {
        ...req.request,
        limits: defaultLookAtLimits(req.request.limits),
        additionalParts: alignAdditionalParts(
          addPartNames,
          req.request.additionalParts
        ),
      }
      let st = sm.states.get(req.ref.id)
      if (!st) {
        st = createLookAtSmStateDyn(req.ref.id, alignedReq)
        sm.states.set(req.ref.id, st)
      } else {
        st.request = alignedReq
      }
      st.targetWs = copyVec(req.targetWs)
    }
    for (const id of [...sm.states.keys()]) {
      if (!activeIds.has(id)) {
        if (id === 0) continue
        const removingActive = sm.transition.newId === id
        if (removingActive) stopSmTransition(sm, false, 60)
        sm.states.delete(id)
        if (removingActive) startSmTransitionTo(sm, findPrioritySmState(sm), mult)
      }
    }

    // Default bone → default state target
    const def = sm.states.get(0)!
    // Default state additionalParts: weight=2, keep mode from stop transition
    def.request.additionalParts = addPartNames.map((name) => {
      const prev = def.request.additionalParts.find((p) => p.partName === name)
      return defaultLookAtPartRequest(name, {
        weight: LOOKAT_UNLIMITED_ADDITIONAL_WEIGHT,
        suppress: 0,
        mode: prev?.mode ?? 0,
      })
    })
    let defaultMs: SimVec4 = { x: 0, y: 0, z: 1, w: 0 }
    if (pose && rig) {
      const bone = defaultBones.get(part)
      const pos = bone ? boneTranslationMs(pose, rig, bone) : null
      if (pos) defaultMs = pos
      else {
        // Fall back: sphere forward in MS
        defaultMs = convertPointSphereSpaceToMs(
          { x: 0, y: radius, z: 0, w: 0 },
          sphere.xf
        )
      }
    } else {
      defaultMs = convertPointSphereSpaceToMs(
        { x: 0, y: radius, z: 0, w: 0 },
        sphere.xf
      )
    }
    const defDist = Math.hypot(
      defaultMs.x - sphere.xf.tx,
      defaultMs.y - sphere.xf.ty,
      defaultMs.z - sphere.xf.tz
    )
    const defSphere = castPointMsToSphere(defaultMs, sphere.xf, radius)
    stepSmStateFollow(
      def,
      defSphere,
      defDist,
      radius,
      sphere.xf,
      followFactor,
      followCurve,
      dt,
      space
    )

    // Custom states follow their WS targets
    for (const st of sm.states.values()) {
      if (st.id === 0) continue
      const targetMs = convertPointWsToMs(
        st.targetWs,
        space.entityLocalToWorld
      )
      const dist = Math.hypot(
        targetMs.x - sphere.xf.tx,
        targetMs.y - sphere.xf.ty,
        targetMs.z - sphere.xf.tz
      )
      const desired = castPointMsToSphere(targetMs, sphere.xf, radius)
      stepSmStateFollow(
        st,
        desired,
        dist,
        radius,
        sphere.xf,
        followFactor,
        followCurve,
        dt,
        space
      )
    }

    // Float tracks (enable / Eyes override) — engine facial vs body coupling
    let enableTrack = 1
    let overrideTrack = 0
    if (pose && rig && smSettings?.enableFloatTrack) {
      const ti = resolveTrackUnified(pose, rig, smSettings.enableFloatTrack)
      if (ti >= 0) enableTrack = readTrackValue(pose, ti)
    }
    if (pose && rig && part === 'Eyes' && smSettings?.eyesOverrideFloatTrack) {
      const oi = resolveTrackUnified(
        pose,
        rig,
        smSettings.eyesOverrideFloatTrack
      )
      if (oi >= 0) overrideTrack = readTrackValue(pose, oi)
    }
    if (part === 'Eyes') {
      if (space.isFacial) {
        enableTrack = Math.min(
          space.eyesLookAtEnabled,
          1 - overrideTrack
        )
      } else {
        const enabled = Math.max(enableTrack, overrideTrack)
        space.setEyesLookAtEnabled?.(enabled)
        space.eyesLookAtEnabled = enabled
        // Body: enableFloatTrackValue stays as track (not Max)
      }
    }
    // Main-SM gate: secondary masters fade when main is in default
    if (!isMainSm) {
      enableTrack *= Math.max(0, 1 - mainInDefault)
    }
    sm.enableFloatTrackValue = enableTrack

    if (advanceTransition) {
      const bestId = findPrioritySmState(sm)
      if (sm.transition.newId !== bestId) {
        stopSmTransition(sm, false, 0)
        startSmTransitionTo(sm, bestId, mult)
      }
      if (dt > 0 || sm.transition.weight < 1) {
        updateSmTransition(sm, Math.max(0, dt))
      }
    }

    refreshSmBlendedOutput(sm, radius, pow, defSphere)
    writeMasterOutput(dyn, part, sm, sphere.xf, radius)
    applyPublishedAdditionalParts(dyn, sm)

    if (isMainSm) mainInDefault = sm.publishedIsDefault

    // coneLimitReached status track (UpdateMinimal)
    if (pose && rig && smSettings?.coneLimitReached && sm.isEnabled) {
      const ci = resolveTrackUnified(pose, rig, smSettings.coneLimitReached)
      if (ci >= 0) {
        let status = LOOKAT_STATUS_ACTIVE
        if (sm.softLimitReached) status |= LOOKAT_STATUS_LIMIT_REACHED
        if (sm.transition.weight < 1) status |= LOOKAT_STATUS_TRANSITION
        writeTrackValue(pose, ci, status)
      }
    }
  }
}

/** Publish master outputs from SM (Update/Dispatch — no transition advance). */
function publishMastersFromSm(
  dyn: LookAtControllerDyn,
  node: AnimgraphNode,
  enableDependents: boolean,
  pose: Pose | null = null,
  rig: RigEntry | null = null,
  space: LookAtSpaceCtx = DEFAULT_LOOKAT_SPACE_CTX
): void {
  dyn.outputs.clear()
  dyn.masterSphere.clear()
  updateMasterStateMachines(dyn, node, pose, rig, 0, false, space)

  // Before Sample starts a transition, still mark enabled when requests exist
  // (engine SetIsEnabled on Add).
  for (const part of orderedMasterParts(dyn, node)) {
    const sm = dyn.masterSm.get(part)
    if (!sm || sm.states.size <= 1) continue
    sm.isEnabled = true
    const sphere = sphereForPart(
      dyn,
      part,
      new Map(parseSmSettings(node).map((s) => [s.partName, s]))
    )
    if (!dyn.outputs.has(part)) {
      const defSphere = castPointMsToSphere(
        convertPointSphereSpaceToMs(
          { x: 0, y: sphere.radius, z: 0, w: 0 },
          sphere.xf
        ),
        sphere.xf,
        sphere.radius
      )
      refreshSmBlendedOutput(
        sm,
        sphere.radius,
        settingsBlendPow(node, part),
        defSphere
      )
      writeMasterOutput(dyn, part, sm, sphere.xf, sphere.radius)
      applyPublishedAdditionalParts(dyn, sm)
    }
  }

  if (enableDependents) {
    enableDependentOutputs(dyn.outputs, parseDependencies(node))
  }

  const eyes = dyn.outputs.get('Eyes')
  dyn.eyesLookAtDirectionEnabled = !!eyes?.isEnabled
  dyn.eyesLookAtDirection = eyes
    ? eyesLookAtDirectionFromTargetMs(eyes.target)
    : 0
}

function settingsBlendPow(node: AnimgraphNode, part: string): number {
  for (const s of parseSmSettings(node)) {
    if (s.partName === part) return s.blendWeightPowFactor
  }
  return 1
}

/**
 * Rebuild master outputs for Switch / Dispatch (no follow/transition step).
 */
export function rebuildLookAtOutputs(
  dyn: LookAtControllerDyn,
  node: AnimgraphNode,
  enableDependents = true,
  space: LookAtSpaceCtx = DEFAULT_LOOKAT_SPACE_CTX
): void {
  publishMastersFromSm(dyn, node, enableDependents, null, null, space)
}

/** One LookAtController::Update substep: masters then followers. */
function stepLookAtController(
  dyn: LookAtControllerDyn,
  node: AnimgraphNode,
  pose: Pose | null,
  rig: RigEntry | null,
  dt: number,
  space: LookAtSpaceCtx
): void {
  dyn.outputs.clear()
  dyn.masterSphere.clear()
  updateMasterStateMachines(dyn, node, pose, rig, dt, true, space)
  updateAndPublishFollowers(dyn, node, pose, rig, dt)

  const eyes = dyn.outputs.get('Eyes')
  dyn.eyesLookAtDirectionEnabled = !!eyes?.isEnabled
  dyn.eyesLookAtDirection = eyes
    ? eyesLookAtDirectionFromTargetMs(eyes.target)
    : 0
}

/**
 * Publish LookAtGraphInput channels onto the board (group=part, name=property).
 *
 * TODO(sim/GraphSlot inputs): Engine writes TAnimInstanceInput on that graph's
 * AnimInstanceBuffer only. Nested GraphSlot instances do not copy inputs back
 * to the parent (CopyAnimInputs is parent→slot on attach; ApplyFeature fans
 * out parent-driven). Sim shares one SimInputBoard across root + nested
 * runners, so a writer inside a slot can overwrite Eyes.* (etc.) seen by the
 * main graph — fix with per-runner instance-input storage (or equivalent).
 * LookAt is not special here; it only surfaces the gap because it publishes
 * graph inputs.
 */
export function publishLookAtGraphInputs(
  board: SimInputBoard,
  dyn: LookAtControllerDyn,
  previousParts: Set<string>
): void {
  for (const part of previousParts) {
    if (!dyn.outputs.has(part)) {
      board.setBoolFeature(part, 'isEnabled', false)
      board.setFeature(part, 'blendWeight', 0)
    }
  }
  previousParts.clear()
  for (const [part, out] of dyn.outputs) {
    previousParts.add(part)
    board.setBoolFeature(part, 'isEnabled', out.isEnabled)
    board.setVectorFeature(part, 'target', out.target)
    board.setVectorFeature(part, 'rawTarget', out.rawTarget)
    board.setFeature(part, 'distance', out.distance)
    board.setFeature(part, 'suppress', out.suppress)
    board.setFeature(part, 'mode', out.mode)
    board.setFeature(part, 'blendWeight', out.blendWeight)
  }
}

function qsToSphereXf(qs: {
  tx: number
  ty: number
  tz: number
  qx: number
  qy: number
  qz: number
  qw: number
}): LookAtSphereXf {
  return {
    tx: qs.tx,
    ty: qs.ty,
    tz: qs.tz,
    qx: qs.qx,
    qy: qs.qy,
    qz: qs.qz,
    qw: qs.qw,
  }
}

/** Refresh sphereAttachmentBone MS from pose into dyn.spheres. */
export function refreshLookAtSpheresFromPose(
  dyn: LookAtControllerDyn,
  node: AnimgraphNode,
  pose: Pose,
  rig: RigEntry
): void {
  const settings = parseSmSettings(node)
  for (const s of settings) {
    const radius = s.sphereRadius > 1e-8 ? s.sphereRadius : 1
    if (!s.sphereBone || s.sphereBone === 'None') {
      dyn.spheres.set(s.partName, defaultPartSphere(radius))
      continue
    }
    const idx = resolveUnifiedName(pose, rig, s.sphereBone)
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
    if (idx >= 0 && getTransformMs(pose, rig, idx, ms)) {
      dyn.spheres.set(s.partName, {
        xf: qsToSphereXf(ms),
        radius,
        bone: s.sphereBone,
      })
    } else {
      dyn.spheres.set(s.partName, {
        ...defaultPartSphere(radius),
        bone: s.sphereBone,
      })
    }
  }
}

/** Bind compile: create dyn + register LookAtParams_* ServiceEvent listeners. */
export function compileLookAtControllerNode(
  node: AnimgraphNode,
  ctx: SimCompileCtx
): void {
  ensureLookAtControllerDyn(ctx.instanceStore, node.HandleId)
  ctx.addEventListener(
    ['LookAtParams_Add', 'LookAtParams_Remove', 'LookAtParams_UpdatePositions'],
    (n, events, rt) => {
      const dyn = ensureLookAtControllerDyn(rt.instanceStore, n.HandleId)
      applyLookAtServiceEvents(dyn, events)
      rebuildLookAtOutputs(dyn, n)
      publishLookAtGraphInputs(rt.board, dyn, dyn.publishedParts)
      if (dyn.eyesLookAtDirectionEnabled) {
        rt.eyesLookAtDirection = dyn.eyesLookAtDirection
        rt.eyesLookAtDirectionEnabled = true
      }
    }
  )
}

export type LookAtUpdateOpts = {
  /** Undilated dt (engine rawTimeDelta). Defaults to dt → factor 1. */
  rawDt?: number
  isFacial?: boolean
  eyesLookAtEnabled?: number
  entityLocalToWorld?: LookAtSphereXf
  parentObjectLocalToWorld?: LookAtSphereXf
  setEyesLookAtEnabled?: (v: number) => void
}

function resolveLookAtSpace(
  node: AnimgraphNode,
  opts?: LookAtUpdateOpts
): LookAtSpaceCtx {
  const nodeFacial = !!(node.Data as { isFacial?: boolean } | undefined)?.isFacial
  return {
    entityLocalToWorld:
      opts?.entityLocalToWorld ?? DEFAULT_LOOKAT_SPACE_CTX.entityLocalToWorld,
    parentObjectLocalToWorld:
      opts?.parentObjectLocalToWorld ??
      DEFAULT_LOOKAT_SPACE_CTX.parentObjectLocalToWorld,
    isFacial: !!(opts?.isFacial || nodeFacial),
    eyesLookAtEnabled: opts?.eyesLookAtEnabled ?? 0,
    setEyesLookAtEnabled: opts?.setEyesLookAtEnabled,
  }
}

/** Update path — ServiceEvents already applied by DispatchEvent; rebuild + substep clock. */
export function updateLookAtController(
  node: AnimgraphNode,
  store: InstanceStore,
  board: SimInputBoard,
  dt: number,
  eyesOut?: {
    eyesLookAtDirection: number
    eyesLookAtDirectionEnabled: boolean
  },
  opts?: LookAtUpdateOpts
): { enabled: boolean; substepTime: number } {
  const dyn = ensureLookAtControllerDyn(store, node.HandleId)
  const rawDt = opts?.rawDt ?? dt
  dyn.lastDt = dt
  // Engine: i_timeDilatationFactor = timeDelta / rawTimeDelta
  dyn.timeDilatationFactor =
    rawDt > 1e-6 ? dt / rawDt : 0
  const space = resolveLookAtSpace(node, opts)
  rebuildLookAtOutputs(dyn, node, true, space)

  const enabled =
    dyn.outputs.size > 0 ||
    [...dyn.masterSm.values()].some((s) => s.isEnabled)
  const substepTime = readNumber(node.Data?.substepTime, 0.01)
  if (enabled) {
    // Engine accumulates rawTimeDelta; Sample consumes remainder / substepTime.
    dyn.timeRemainder += Math.max(0, rawDt)
  } else {
    dyn.timeRemainder = 0
  }
  publishLookAtGraphInputs(board, dyn, dyn.publishedParts)
  if (eyesOut) {
    eyesOut.eyesLookAtDirection = dyn.eyesLookAtDirection
    eyesOut.eyesLookAtDirectionEnabled = dyn.eyesLookAtDirectionEnabled
  }
  return { enabled, substepTime }
}

/**
 * Engine OnSample: spheres from pose, master follow + follower chase in substeps.
 */
export function sampleLookAtController(
  node: AnimgraphNode,
  store: InstanceStore,
  board: SimInputBoard,
  pose: Pose,
  rig: RigEntry,
  space: LookAtSpaceCtx = DEFAULT_LOOKAT_SPACE_CTX
): void {
  const dyn = ensureLookAtControllerDyn(store, node.HandleId)
  refreshLookAtSpheresFromPose(dyn, node, pose, rig)

  const smActive = [...dyn.masterSm.values()].some(
    (s) => s.isEnabled || s.states.size > 1 || s.transition.weight < 1 - 1e-6
  )
  const active = dyn.requests.size > 0 || smActive
  const substepTime = readNumber(node.Data?.substepTime, 0.01)
  // Node flag ORs with runner facial context (FacialMixer sets context.m_isFacial).
  const nodeFacial = !!(node.Data as { isFacial?: boolean } | undefined)?.isFacial
  const spaceResolved: LookAtSpaceCtx = {
    ...space,
    isFacial: space.isFacial || nodeFacial,
  }

  if (active) {
    // First enable: Update(0) so masters snap last←desired before substeps.
    if (!dyn.wasEnabledPreviousFrame) {
      stepLookAtController(dyn, node, pose, rig, 0, spaceResolved)
    }

    const rawIters =
      substepTime > 1e-8
        ? Math.floor(dyn.timeRemainder / substepTime)
        : 0
    dyn.timeRemainder -= rawIters * substepTime
    const iters = Math.min(rawIters, LOOKAT_MAX_SUBSTEPS)
    const stepDt = substepTime * dyn.timeDilatationFactor
    for (let i = 0; i < iters; i++) {
      stepLookAtController(dyn, node, pose, rig, stepDt, spaceResolved)
    }

    // No substeps this frame but already following — republish from last.
    if (dyn.wasEnabledPreviousFrame && iters === 0) {
      publishMastersFromSm(dyn, node, false, pose, rig, spaceResolved)
      updateAndPublishFollowers(dyn, node, pose, rig, 0)
    }
  } else {
    dyn.outputs.clear()
    dyn.masterSphere.clear()
    dyn.masterSm.clear()
    dyn.followers.clear()
    dyn.eyesLookAtDirectionEnabled = false
    dyn.eyesLookAtDirection = 0
  }

  dyn.wasEnabledPreviousFrame = [...dyn.masterSm.values()].some((s) => s.isEnabled)
  publishLookAtGraphInputs(board, dyn, dyn.publishedParts)
}

export function readLookAtControllerDyn(
  store: InstanceStore,
  handleId: string
): LookAtControllerDyn | undefined {
  return store.get(LookAtControllerDynDef, handleId)
}

export { emptyLookAtPartOutput }

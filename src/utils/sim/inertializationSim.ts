/**
 * animAnimNode_Inertialization — request latch (Update) + quintic error decay (Sample).
 * Parity: animNode_Inertialization
 */

import type { AnimgraphNode } from '../graph/animgraphTypes'
import type { InstanceStore } from '../InstanceStore'
import {
  copyPose,
  createPose,
  type Pose,
} from './pose'
import type { RigEntry } from './rigResource'
import { trackIndexByName } from './rigResource'
import { readBool, readCName, readNumber } from './simDataUtils'
import type { InertializationRequestSink } from './engineParity'
import {
  InertializationDynDef,
  createInertializationDyn,
  resetInertializationDyn,
  type InertializationDyn,
} from './inertializationDyn'
import { applyTrajectory, extractTrajectory } from './poseTrajectory'
import { IDENTITY_QS, type Qs } from './poseFk'

const EPS = 1e-6

/** SnapToTerrain float tracks excluded from inertia (engine hard-coded list). */
const EXCLUDED_TRACK_NAMES = [
  'leftFootPhase',
  'rightFootPhase',
  'footPlantOffsetFoot',
  'footPlantOffsetX',
  'footPlantOffsetY',
  'footPlantOffsetZ',
]

function almostZero(v: number): boolean {
  return Math.abs(v) < EPS
}

function ensureDyn(
  store: InstanceStore,
  handleId: string,
  d: Record<string, unknown>
): InertializationDyn {
  let s = store.get(InertializationDynDef, handleId)
  if (!s) {
    s = store.set(
      InertializationDynDef,
      handleId,
      createInertializationDyn({
        transformsCountUpperBound: readNumber(d.transformsCountUpperBound, 94),
        tracksCountUpperBound: readNumber(d.tracksCountUpperBound, 37),
      })
    )
  }
  return s
}

function lastPose(s: InertializationDyn): Pose | null {
  return s.pose1IsLast ? s.pose1 : s.pose2
}

function preLastPose(s: InertializationDyn): Pose | null {
  return s.pose1IsLast ? s.pose2 : s.pose1
}

function ensureCacheSlot(
  s: InertializationDyn,
  which: 1 | 2,
  src: Pose
): Pose {
  const cur = which === 1 ? s.pose1 : s.pose2
  if (
    !cur ||
    cur.boneCount !== src.boneCount ||
    cur.trackCount !== src.trackCount ||
    cur.stackCapacity !== src.stackCapacity ||
    cur.trackStackCapacity !== src.trackStackCapacity ||
    cur.extraTrackCapacity !== src.extraTrackCapacity
  ) {
    const p = createPose(
      src.boneCount,
      src.trackCount,
      src.stackCapacity,
      src.trackStackCapacity,
      src.extraTrackCapacity
    )
    if (which === 1) s.pose1 = p
    else s.pose2 = p
    return p
  }
  return cur
}

function cachePose(s: InertializationDyn, out: Pose): void {
  s.pose1IsLast = !s.pose1IsLast
  const slot = ensureCacheSlot(s, s.pose1IsLast ? 1 : 2, out)
  copyPose(slot, out)
  s.cachedCount = Math.min(s.cachedCount + 1, 2)
}

function normalizeQuatInPlace(r: Float32Array, i: number): void {
  const x = r[i]!,
    y = r[i + 1]!,
    z = r[i + 2]!,
    w = r[i + 3]!
  const len = Math.hypot(x, y, z, w)
  if (len < EPS) {
    r[i] = 0
    r[i + 1] = 0
    r[i + 2] = 0
    r[i + 3] = 1
    return
  }
  r[i] = x / len
  r[i + 1] = y / len
  r[i + 2] = z / len
  r[i + 3] = w / len
}

function quatAlmostEqual(
  a: Float32Array,
  ai: number,
  b: Float32Array,
  bi: number
): boolean {
  // Same orientation if |dot| ≈ 1
  const dot =
    a[ai]! * b[bi]! +
    a[ai + 1]! * b[bi + 1]! +
    a[ai + 2]! * b[bi + 2]! +
    a[ai + 3]! * b[bi + 3]!
  return Math.abs(Math.abs(dot) - 1) < 1e-5
}

function quatMul(
  ox: number,
  oy: number,
  oz: number,
  ow: number,
  bx: number,
  by: number,
  bz: number,
  bw: number
): [number, number, number, number] {
  return [
    ow * bx + ox * bw + oy * bz - oz * by,
    ow * by - ox * bz + oy * bw + oz * bx,
    ow * bz + ox * by - oy * bx + oz * bw,
    ow * bw - ox * bx - oy * by - oz * bz,
  ]
}

/** Axis-angle from unit quat (engine GetAxis3 / GetAngle). */
function quatAxisAngle(
  x: number,
  y: number,
  z: number,
  w: number
): { ax: number; ay: number; az: number; angle: number } {
  // Prefer shortest arc: flip if w < 0
  let qx = x,
    qy = y,
    qz = z,
    qw = w
  if (qw < 0) {
    qx = -qx
    qy = -qy
    qz = -qz
    qw = -qw
  }
  const angle = 2 * Math.acos(Math.min(1, Math.max(-1, qw)))
  const s = Math.sin(angle * 0.5)
  if (Math.abs(s) < EPS) return { ax: 1, ay: 0, az: 0, angle: 0 }
  return { ax: qx / s, ay: qy / s, az: qz / s, angle }
}

function calculateErrorVelocity(
  preError: number,
  error: number,
  lastDt: number,
  safeMode: boolean
): number {
  if (!(lastDt > EPS)) return 0
  let vel = (error - preError) / lastDt
  // Safe: velocity must pull toward zero (opposite sign of error).
  if (safeMode && vel * error >= 0) vel = 0
  return vel
}

function calculateErrorBlendDuration(
  duration: number,
  error: number,
  vel: number,
  safeMode: boolean
): number {
  let d = duration
  if (safeMode && !almostZero(vel)) {
    const limit = (-5 * error) / vel
    if (limit > 0) d = Math.min(d, limit)
  }
  return d
}

/**
 * Engine CalculateCurrentError — quintic with x(0)=x0, x'(0)=v0, x=x'=x''=0 at t1.
 */
export function calculateCurrentError(
  errorValue: number,
  errorVelocity: number,
  blendDuration: number,
  currentTime: number,
  safeMode: boolean
): number {
  const x0 = errorValue
  const v0 = errorVelocity
  const t1 = blendDuration
  if (!(t1 > EPS)) return 0

  const t1_2 = t1 * t1
  const t1_3 = t1_2 * t1
  const t1_4 = t1_3 * t1
  const t1_5 = t1_4 * t1

  let a0 = (-8 * v0 * t1 - 20 * x0) / t1_2
  if (safeMode && a0 * x0 <= 0) a0 = 0

  const A = -(a0 * t1_2 + 6 * v0 * t1 + 12 * x0) / (2 * t1_5)
  const B = (3 * a0 * t1_2 + 16 * v0 * t1 + 30 * x0) / (2 * t1_4)
  const C = -(3 * a0 * t1_2 + 12 * v0 * t1 + 20 * x0) / (2 * t1_3)

  const t = currentTime
  return ((((A * t + B) * t + C) * t + 0.5 * a0) * t + v0) * t + x0
}

function calculateInitialData(
  s: InertializationDyn,
  out: Pose,
  safeMode: boolean,
  excludedTracks: Set<number>
): void {
  const pre = preLastPose(s)
  const last = lastPose(s)
  if (!pre || !last) return

  const n = Math.min(
    pre.boneCount,
    last.boneCount,
    out.boneCount,
    s.transformCap
  )
  const tn = Math.min(
    pre.trackCount,
    last.trackCount,
    out.trackCount,
    s.trackCap
  )
  const lastDt = s.lastTimeDelta > EPS ? s.lastTimeDelta : s.currentTimeDelta

  for (let i = 0; i < n; i++) {
    const ti = i * 3
    const ri = i * 4

    // Translation
    const dxL = last.translation[ti]! - out.translation[ti]!
    const dyL = last.translation[ti + 1]! - out.translation[ti + 1]!
    const dzL = last.translation[ti + 2]! - out.translation[ti + 2]!
    const mag = Math.hypot(dxL, dyL, dzL)
    let preMag = 0
    if (almostZero(mag)) {
      s.errTMag[i] = 0
      s.errTDir[ti] = 0
      s.errTDir[ti + 1] = 0
      s.errTDir[ti + 2] = 0
    } else {
      s.errTMag[i] = mag
      s.errTDir[ti] = dxL / mag
      s.errTDir[ti + 1] = dyL / mag
      s.errTDir[ti + 2] = dzL / mag
      const dxP = pre.translation[ti]! - out.translation[ti]!
      const dyP = pre.translation[ti + 1]! - out.translation[ti + 1]!
      const dzP = pre.translation[ti + 2]! - out.translation[ti + 2]!
      if (!almostZero(Math.hypot(dxP, dyP, dzP))) {
        preMag =
          dxP * s.errTDir[ti]! +
          dyP * s.errTDir[ti + 1]! +
          dzP * s.errTDir[ti + 2]!
      }
    }
    s.errTVel[i] = calculateErrorVelocity(preMag, s.errTMag[i]!, lastDt, safeMode)

    // Rotation: diff = last * conj(current)
    const samePre = quatAlmostEqual(pre.rotation, ri, out.rotation, ri)
    const sameLast = quatAlmostEqual(last.rotation, ri, out.rotation, ri)
    const cx = out.rotation[ri]!
    const cy = out.rotation[ri + 1]!
    const cz = out.rotation[ri + 2]!
    const cw = out.rotation[ri + 3]!
    // conj
    const icx = -cx,
      icy = -cy,
      icz = -cz,
      icw = cw

    let dLx = 0,
      dLy = 0,
      dLz = 0,
      dLw = 1
    if (!sameLast) {
      ;[dLx, dLy, dLz, dLw] = quatMul(
        last.rotation[ri]!,
        last.rotation[ri + 1]!,
        last.rotation[ri + 2]!,
        last.rotation[ri + 3]!,
        icx,
        icy,
        icz,
        icw
      )
    }
    let dPx = 0,
      dPy = 0,
      dPz = 0,
      dPw = 1
    if (!samePre) {
      ;[dPx, dPy, dPz, dPw] = quatMul(
        pre.rotation[ri]!,
        pre.rotation[ri + 1]!,
        pre.rotation[ri + 2]!,
        pre.rotation[ri + 3]!,
        icx,
        icy,
        icz,
        icw
      )
    }

    const aa = quatAxisAngle(dLx, dLy, dLz, dLw)
    s.errRAxis[ti] = aa.ax
    s.errRAxis[ti + 1] = aa.ay
    s.errRAxis[ti + 2] = aa.az
    s.errRAng[i] = aa.angle
    // Twist of pre-diff around error axis: 2*atan(dot(xyz,axis)/w)
    let preAng = 0
    if (!samePre) {
      const den = dPw
      if (Math.abs(den) > EPS) {
        preAng =
          2 *
          Math.atan(
            (dPx * aa.ax + dPy * aa.ay + dPz * aa.az) / den
          )
        if (!Number.isFinite(preAng)) preAng = 0
      }
    }
    s.errRVel[i] = calculateErrorVelocity(preAng, aa.angle, lastDt, safeMode)
  }

  for (let i = 0; i < tn; i++) {
    if (excludedTracks.has(i)) {
      s.errTrack[i] = 0
      s.errTrackVel[i] = 0
      continue
    }
    const diffLast = last.tracks[i]! - out.tracks[i]!
    const diffPre = pre.tracks[i]! - out.tracks[i]!
    let preErr = 0
    if (almostZero(diffLast)) {
      s.errTrack[i] = 0
    } else {
      s.errTrack[i] = diffLast
      if (!almostZero(diffPre)) preErr = diffPre
    }
    s.errTrackVel[i] = calculateErrorVelocity(
      preErr,
      s.errTrack[i]!,
      lastDt,
      safeMode
    )
  }
}

function applyInertia(
  s: InertializationDyn,
  out: Pose,
  safeMode: boolean
): void {
  const t = s.elapsedTime
  const n = Math.min(out.boneCount, s.transformCap)
  const tn = Math.min(out.trackCount, s.trackCap)

  for (let i = 0; i < n; i++) {
    const ti = i * 3
    const ri = i * 4

    const eT = s.errTMag[i]!
    const vT = s.errTVel[i]!
    const dT = calculateErrorBlendDuration(s.duration, eT, vT, safeMode)
    if (t < dT) {
      const cur = calculateCurrentError(eT, vT, dT, t, safeMode)
      out.translation[ti] = (out.translation[ti] ?? 0) + s.errTDir[ti]! * cur
      out.translation[ti + 1] =
        (out.translation[ti + 1] ?? 0) + s.errTDir[ti + 1]! * cur
      out.translation[ti + 2] =
        (out.translation[ti + 2] ?? 0) + s.errTDir[ti + 2]! * cur
    }

    const eR = s.errRAng[i]!
    const vR = s.errRVel[i]!
    const dR = calculateErrorBlendDuration(s.duration, eR, vR, safeMode)
    if (t < dR) {
      const cur = calculateCurrentError(eR, vR, dR, t, safeMode)
      const half = cur * 0.5
      const sh = Math.sin(half)
      const ax = s.errRAxis[ti]!
      const ay = s.errRAxis[ti + 1]!
      const az = s.errRAxis[ti + 2]!
      const [nx, ny, nz, nw] = quatMul(
        ax * sh,
        ay * sh,
        az * sh,
        Math.cos(half),
        out.rotation[ri]!,
        out.rotation[ri + 1]!,
        out.rotation[ri + 2]!,
        out.rotation[ri + 3]!
      )
      out.rotation[ri] = nx
      out.rotation[ri + 1] = ny
      out.rotation[ri + 2] = nz
      out.rotation[ri + 3] = nw
      normalizeQuatInPlace(out.rotation, ri)
    }
  }

  for (let i = 0; i < tn; i++) {
    const e = s.errTrack[i]!
    const v = s.errTrackVel[i]!
    const d = calculateErrorBlendDuration(s.duration, e, v, safeMode)
    if (t < d) {
      out.tracks[i] =
        (out.tracks[i] ?? 0) + calculateCurrentError(e, v, d, t, safeMode)
    }
  }
}

/** Euler clamp for optional rotationLimits entries. */
function applyRotationLimits(
  node: AnimgraphNode,
  out: Pose,
  rig: RigEntry
): void {
  const limits = node.Data?.rotationLimits
  if (!Array.isArray(limits)) return
  for (const raw of limits) {
    if (!raw || typeof raw !== 'object') continue
    const lim = raw as Record<string, unknown>
    const name = readCName(
      (lim.constrainedTransform as Record<string, unknown> | undefined)?.name ??
        lim.constrainedTransform
    )
    if (!name || name === 'None') continue
    const idx = rig.boneIndexByName.get(name.toLowerCase())
    if (idx == null || idx < 0 || idx >= out.boneCount) continue

    const ri = idx * 4
    // Quat → approximate Euler (ZYX) for clamp; same axes as engine Pitch/Roll/Yaw on X/Y/Z limits.
    const x = out.rotation[ri]!
    const y = out.rotation[ri + 1]!
    const z = out.rotation[ri + 2]!
    const w = out.rotation[ri + 3]!
    const sinr = 2 * (w * x + y * z)
    const cosr = 1 - 2 * (x * x + y * y)
    let roll = Math.atan2(sinr, cosr)
    const sinp = 2 * (w * y - z * x)
    let pitch = Math.abs(sinp) >= 1 ? (Math.sign(sinp) * Math.PI) / 2 : Math.asin(sinp)
    const siny = 2 * (w * z + x * y)
    const cosy = 1 - 2 * (y * y + z * z)
    let yaw = Math.atan2(siny, cosy)

    const clampAxis = (
      field: unknown,
      value: number
    ): number => {
      if (!field || typeof field !== 'object') return value
      const c = field as Record<string, unknown>
      if (!readBool(c.isActive)) return value
      const min = readNumber(c.min, -1)
      const max = readNumber(c.max, 1)
      return Math.min(max, Math.max(min, value))
    }
    // Engine: Pitch=X, Roll=Y, Yaw=Z; limits in radians matching ToEulerAngles.
    pitch = clampAxis(lim.limitOnX, pitch)
    roll = clampAxis(lim.limitOnY, roll)
    yaw = clampAxis(lim.limitOnZ, yaw)

    const cy = Math.cos(yaw * 0.5)
    const sy = Math.sin(yaw * 0.5)
    const cp = Math.cos(pitch * 0.5)
    const sp = Math.sin(pitch * 0.5)
    const cr = Math.cos(roll * 0.5)
    const sr = Math.sin(roll * 0.5)
    out.rotation[ri] = sr * cp * cy - cr * sp * sy
    out.rotation[ri + 1] = cr * sp * cy + sr * cp * sy
    out.rotation[ri + 2] = cr * cp * sy - sr * sp * cy
    out.rotation[ri + 3] = cr * cp * cy + sr * sp * sy
    normalizeQuatInPlace(out.rotation, ri)
  }
}

/**
 * Update: latch request into instance; reset on activation.
 *
 * TODO(sim): engine also resets on DangleTeleportationStatus::TeleportAndResetSimulation;
 * skips request when ragdoll applyToAnimPose; skips Update/Sample when far LOD /
 * distance cull — omitted offline.
 */
export function updateInertialization(
  node: AnimgraphNode,
  store: InstanceStore,
  sink: InertializationRequestSink,
  dt: number,
  justActivated: boolean
): void {
  const d = (node.Data ?? {}) as Record<string, unknown>
  const s = ensureDyn(store, node.HandleId, d)
  if (justActivated) resetInertializationDyn(s)

  s.lastTimeDelta = s.cachedCount > 0 ? s.currentTimeDelta : dt
  s.currentTimeDelta = dt

  if (sink.isInertializationRequested) {
    // Default override mode (engine cvInertiaBlendOverrideMode == 0).
    s.duration = sink.inertializationDuration
    s.requested = true
  } else {
    s.requested = false
  }
}

/**
 * Sample: ExtractTrajectory → inertia → CachePose → ApplyTrajectory.
 *
 * TODO(sim): engine skips Sample when far LOD / distance / performance cull —
 * omitted offline.
 */
export function sampleInertialization(
  node: AnimgraphNode,
  store: InstanceStore,
  out: Pose,
  rig: RigEntry | null
): void {
  const d = (node.Data ?? {}) as Record<string, unknown>
  const s = ensureDyn(store, node.HandleId, d)
  const safeMode = d.safeMode === undefined ? true : readBool(d.safeMode)

  // Normalize quats (engine OnSample).
  for (let i = 0; i < out.boneCount; i++) {
    normalizeQuatInPlace(out.rotation, i * 4)
  }

  const traj: Qs = { ...IDENTITY_QS }
  const trajBone = rig?.boneIndexByName.get('trajectory') ?? -1
  if (rig && trajBone >= 0) {
    extractTrajectory(out, rig, trajBone, traj)
  }

  // Warm caches with current pose until we have 2 frames.
  while (s.cachedCount < 2) {
    cachePose(s, out)
  }

  const excluded = new Set<number>()
  if (rig) {
    for (const name of EXCLUDED_TRACK_NAMES) {
      const idx = trackIndexByName(rig, name)
      if (idx >= 0) excluded.add(idx)
    }
  }

  if (s.requested) {
    s.elapsedTime = 0
    s.inProgress = true
    calculateInitialData(s, out, safeMode, excluded)
  }

  if (s.inProgress) {
    s.elapsedTime += s.currentTimeDelta
    if (s.elapsedTime >= s.duration) {
      s.inProgress = false
    } else {
      applyInertia(s, out, safeMode)
      if (rig) applyRotationLimits(node, out, rig)
    }
  }

  // Engine caches in trajectory-stripped space, then restores traj.
  cachePose(s, out)
  if (rig && trajBone >= 0) {
    applyTrajectory(out, rig, traj)
  }
}

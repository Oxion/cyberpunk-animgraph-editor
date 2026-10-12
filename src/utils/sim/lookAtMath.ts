/**
 * Look-at space helpers (lookAtMath / LookAtStateData::ConvertPointWsToMs).
 * Entity / parent L2W default to identity; runners may set non-identity xforms.
 */

import type { SimVec4 } from './evalAnimMathExpressionVector'

/** Sphere attachment: translation + rotation only (engine Transform). */
export type LookAtSphereXf = {
  tx: number
  ty: number
  tz: number
  qx: number
  qy: number
  qz: number
  qw: number
}

export const IDENTITY_SPHERE_XF: LookAtSphereXf = {
  tx: 0,
  ty: 0,
  tz: 0,
  qx: 0,
  qy: 0,
  qz: 0,
  qw: 1,
}

function quatRotate(
  qx: number,
  qy: number,
  qz: number,
  qw: number,
  vx: number,
  vy: number,
  vz: number
): { x: number; y: number; z: number } {
  const ix = qw * vx + qy * vz - qz * vy
  const iy = qw * vy + qz * vx - qx * vz
  const iz = qw * vz + qx * vy - qy * vx
  const iw = -qx * vx - qy * vy - qz * vz
  return {
    x: ix * qw + iw * -qx + iy * -qz - iz * -qy,
    y: iy * qw + iw * -qy + iz * -qx - ix * -qz,
    z: iz * qw + iw * -qz + ix * -qy - iy * -qx,
  }
}

function invertSphereXf(xf: LookAtSphereXf): LookAtSphereXf {
  const n = xf.qx * xf.qx + xf.qy * xf.qy + xf.qz * xf.qz + xf.qw * xf.qw || 1
  const qx = -xf.qx / n
  const qy = -xf.qy / n
  const qz = -xf.qz / n
  const qw = xf.qw / n
  const r = quatRotate(qx, qy, qz, qw, -xf.tx, -xf.ty, -xf.tz)
  return { tx: r.x, ty: r.y, tz: r.z, qx, qy, qz, qw }
}

function transformPoint(xf: LookAtSphereXf, p: SimVec4): SimVec4 {
  const r = quatRotate(xf.qx, xf.qy, xf.qz, xf.qw, p.x, p.y, p.z)
  return { x: r.x + xf.tx, y: r.y + xf.ty, z: r.z + xf.tz, w: p.w ?? 0 }
}

/** inv(entity L2W) · WS. */
export function convertPointWsToMs(
  pointWs: SimVec4,
  entityL2W: LookAtSphereXf = IDENTITY_SPHERE_XF
): SimVec4 {
  return transformPoint(invertSphereXf(entityL2W), pointWs)
}

/** entity L2W · MS. */
export function convertPointMsToWs(
  pointMs: SimVec4,
  entityL2W: LookAtSphereXf = IDENTITY_SPHERE_XF
): SimVec4 {
  return transformPoint(entityL2W, pointMs)
}

/** Apply Transform (translation + rotation) to a point. */
export function transformPointByXf(xf: LookAtSphereXf, p: SimVec4): SimVec4 {
  return transformPoint(xf, p)
}

export function invertXf(xf: LookAtSphereXf): LookAtSphereXf {
  return invertSphereXf(xf)
}

/** CastPointMsToSphere — inv(sphere) · point, normalize × radius. */
export function castPointMsToSphere(
  pointMs: SimVec4,
  sphereMs: LookAtSphereXf,
  sphereRadius: number
): SimVec4 {
  const local = transformPoint(invertSphereXf(sphereMs), pointMs)
  const len = Math.hypot(local.x, local.y, local.z)
  const r = sphereRadius > 1e-8 ? sphereRadius : 1
  if (len < 1e-8) return { x: 0, y: r, z: 0, w: 0 }
  const s = r / len
  return { x: local.x * s, y: local.y * s, z: local.z * s, w: 0 }
}

/** ConvertPointSphereSpaceToMs — sphere · point. */
export function convertPointSphereSpaceToMs(
  pointSphere: SimVec4,
  sphereMs: LookAtSphereXf
): SimVec4 {
  return transformPoint(sphereMs, pointSphere)
}

/**
 * Engine Sample publish path:
 *   Convert(normalized(spherePoint) * distanceFromSphere, sphereMs)
 */
export function sphereDirDistanceToMs(
  pointSphere: SimVec4,
  distanceFromSphere: number,
  sphereMs: LookAtSphereXf
): SimVec4 {
  const len = Math.hypot(pointSphere.x, pointSphere.y, pointSphere.z)
  if (len < 1e-8) {
    return convertPointSphereSpaceToMs(
      { x: 0, y: distanceFromSphere, z: 0, w: 0 },
      sphereMs
    )
  }
  const s = distanceFromSphere / len
  return convertPointSphereSpaceToMs(
    { x: pointSphere.x * s, y: pointSphere.y * s, z: pointSphere.z * s, w: 0 },
    sphereMs
  )
}

/** acos(dir.x) * sign(dir.y) on XY of Eyes target MS (LookAtController::OnUpdate). */
export function eyesLookAtDirectionFromTargetMs(targetMs: SimVec4): number {
  const len = Math.hypot(targetMs.x, targetMs.y)
  if (len < 1e-8) return 0
  const nx = Math.max(-1, Math.min(1, targetMs.x / len))
  return Math.acos(nx) * Math.sign(targetMs.y || 0)
}

function normalize3(v: SimVec4, radius: number): SimVec4 {
  const len = Math.hypot(v.x, v.y, v.z)
  const r = radius > 1e-8 ? radius : 1
  if (len < 1e-8) return { x: 0, y: r, z: 0, w: 0 }
  const s = r / len
  return { x: v.x * s, y: v.y * s, z: v.z * s, w: 0 }
}

function angleBetweenOnSphere(a: SimVec4, b: SimVec4): number {
  const la = Math.hypot(a.x, a.y, a.z) || 1
  const lb = Math.hypot(b.x, b.y, b.z) || 1
  const dot = Math.max(
    -1,
    Math.min(1, (a.x * b.x + a.y * b.y + a.z * b.z) / (la * lb))
  )
  return Math.acos(dot)
}

/** Slerp unit directions on sphere, return at `radius`. */
function slerpSphere(
  from: SimVec4,
  to: SimVec4,
  t: number,
  radius: number
): SimVec4 {
  const la = Math.hypot(from.x, from.y, from.z) || 1
  const lb = Math.hypot(to.x, to.y, to.z) || 1
  const ax = from.x / la
  const ay = from.y / la
  const az = from.z / la
  const bx = to.x / lb
  const by = to.y / lb
  const bz = to.z / lb
  let dot = ax * bx + ay * by + az * bz
  let bx2 = bx
  let by2 = by
  let bz2 = bz
  if (dot < 0) {
    dot = -dot
    bx2 = -bx
    by2 = -by
    bz2 = -bz
  }
  if (dot > 0.9995) {
    return normalize3(
      {
        x: ax + (bx2 - ax) * t,
        y: ay + (by2 - ay) * t,
        z: az + (bz2 - az) * t,
        w: 0,
      },
      radius
    )
  }
  const th0 = Math.acos(Math.max(-1, Math.min(1, dot)))
  const th = th0 * t
  const s0 = Math.cos(th)
  const s1 = Math.sin(th) / Math.sin(th0)
  return normalize3(
    {
      x: ax * s0 + (bx2 - ax * dot) * s1,
      y: ay * s0 + (by2 - ay * dot) * s1,
      z: az * s0 + (bz2 - az * dot) * s1,
      w: 0,
    },
    radius
  )
}

/**
 * Follower step 4 (simplified): chase followTarget beyond innerAngle,
 * max travel = speedRad * dt (engine speedToTarget × curve).
 */
export function chaseSphereTowardTarget(
  centerSphere: SimVec4,
  followTargetSphere: SimVec4,
  sphereRadius: number,
  innerAngleRad: number,
  maxTravelRad: number
): SimVec4 {
  const ang = angleBetweenOnSphere(centerSphere, followTargetSphere)
  const excess = ang - Math.max(0, innerAngleRad)
  if (excess <= 1e-6 || maxTravelRad <= 0) {
    return normalize3(centerSphere, sphereRadius)
  }
  const travel = Math.min(excess, maxTravelRad)
  const t = ang > 1e-8 ? travel / ang : 1
  return slerpSphere(centerSphere, followTargetSphere, t, sphereRadius)
}

/** Angle (radians) between two sphere points. */
export function sphereAngleRad(a: SimVec4, b: SimVec4): number {
  return angleBetweenOnSphere(a, b)
}

/**
 * GetShortestRotationInSphereSpace → pitch/yaw deg + LookAtQuaternion angle rad.
 * Yaw diff is NOT re-wrapped (engine); hypot can exceed 180° (back-behind uses >270°).
 */
export function shortestRotationPitchYawDeg(
  from: SimVec4,
  to: SimVec4
): { pitch: number; yaw: number; angleRad: number } {
  const a = spherePointToEulerDeg(from)
  const b = spherePointToEulerDeg(to)
  const pitch = b.pitch - a.pitch
  const yaw = normalizeAngle180(b.yaw) - normalizeAngle180(a.yaw)
  const angleRad = (Math.hypot(pitch, yaw) * Math.PI) / 180
  return { pitch, yaw, angleRad }
}

/**
 * LookAtStateData follow via LookAtQuaternion (not geodesic slerp).
 */
export function followWithLookAtQuaternion(
  lastSphere: SimVec4,
  desiredSphere: SimVec4,
  sphereRadius: number,
  maxTravelRad: number
): SimVec4 {
  const { pitch, yaw, angleRad } = shortestRotationPitchYawDeg(
    lastSphere,
    desiredSphere
  )
  if (angleRad <= 1e-8 || maxTravelRad <= 0) {
    return normalize3(lastSphere, sphereRadius)
  }
  if (maxTravelRad >= angleRad) {
    return normalize3(desiredSphere, sphereRadius)
  }
  const t = maxTravelRad / angleRad
  return normalize3(
    lookAtQuatTransform(pitch * t, yaw * t, lastSphere),
    sphereRadius
  )
}

/** Alias — master SM follow uses LookAtQuaternion path. */
export function followSphereTowardDesired(
  lastSphere: SimVec4,
  desiredSphere: SimVec4,
  sphereRadius: number,
  maxTravelRad: number
): SimVec4 {
  return followWithLookAtQuaternion(
    lastSphere,
    desiredSphere,
    sphereRadius,
    maxTravelRad
  )
}

/** Engine EulerAngles::NormalizeAngle180. */
export function normalizeAngle180(deg: number): number {
  let a = deg % 360
  if (a < 0) a += 360
  return a > 180 ? a - 360 : a
}

/** Wrap degrees into [0, 360). */
export function normalizeAngle360(deg: number): number {
  let x = deg % 360
  if (x < 0) x += 360
  return x
}

/** Vector4::ToEulerAngles — pitch/yaw deg, Y-forward sphere. */
export function spherePointToEulerDeg(p: SimVec4): { pitch: number; yaw: number } {
  const xy = p.x * p.x + p.y * p.y
  if (xy < 1e-12) {
    return { pitch: p.z > 0 ? 90 : -90, yaw: 0 }
  }
  const x = p.x === 0 ? 0 : p.x
  return {
    yaw: (-Math.atan2(x, p.y) * 180) / Math.PI,
    pitch: (Math.atan(p.z / Math.sqrt(xy)) * 180) / Math.PI,
  }
}

/**
 * EulerAngles(0, pitch, yaw).TransformVector(EY * radius) —
 * inverse of spherePointToEulerDeg.
 */
export function eulerDegToSpherePoint(
  pitchDeg: number,
  yawDeg: number,
  radius: number
): SimVec4 {
  const pitch = (pitchDeg * Math.PI) / 180
  const yaw = (yawDeg * Math.PI) / 180
  const cp = Math.cos(pitch)
  const sp = Math.sin(pitch)
  const cy = Math.cos(yaw)
  const sy = Math.sin(yaw)
  const r = radius > 1e-8 ? radius : 1
  return {
    x: -cp * sy * r,
    y: cp * cy * r,
    z: sp * r,
    w: 0,
  }
}

/**
 * LookAtFollower::FollowTarget — angular speed deg/s from factor×curve,
 * travel = DEG2RAD(speedDeg) * dt toward target on sphere.
 */
export function followTargetOnSphere(
  centerSphere: SimVec4,
  targetSphere: SimVec4,
  sphereRadius: number,
  pullSpeedFactor: number,
  pullSpeedByAngleCurve: unknown | null,
  dt: number,
  evalCurve: (curve: unknown, t: number) => number
): SimVec4 {
  if (pullSpeedFactor <= 0 || dt <= 0) {
    return normalize3(centerSphere, sphereRadius)
  }
  const angRad = angleBetweenOnSphere(centerSphere, targetSphere)
  if (angRad <= 1e-8) return normalize3(targetSphere, sphereRadius)
  const angDeg = (angRad * 180) / Math.PI
  const curveVal =
    pullSpeedByAngleCurve != null
      ? evalCurve(pullSpeedByAngleCurve, angDeg)
      : angDeg
  const travelledRad = ((pullSpeedFactor * curveVal) * Math.PI) / 180 * dt
  return followSphereTowardDesired(
    centerSphere,
    targetSphere,
    sphereRadius,
    Math.max(0, travelledRad)
  )
}

/**
 * LookAtQuaternion(pitch,yaw).Transform(v) — engine lookAtMath.cpp.
 * Used for soft-cone clamp from forward (EY).
 */
export function lookAtQuatTransform(
  pitchDeg: number,
  yawDeg: number,
  v: SimVec4
): SimVec4 {
  const attitude = (yawDeg * Math.PI) / 180
  const bank = (pitchDeg * Math.PI) / 180
  const c2 = Math.cos(attitude / 2)
  const s2 = Math.sin(attitude / 2)
  const c3 = Math.cos(bank / 2)
  const s3 = Math.sin(bank / 2)
  const w = c2 * c3
  const angle = 2 * Math.acos(Math.max(-1, Math.min(1, w)))
  let ax = c2 * s3
  let ay = s2 * s3
  let az = s2 * c3
  const alen = Math.hypot(ax, ay, az)
  if (alen < 1e-8 || Math.abs(angle) < 1e-8) {
    return { x: v.x, y: v.y, z: v.z, w: v.w ?? 0 }
  }
  ax /= alen
  ay /= alen
  az /= alen
  // EulerAngles(0,0,v.Yaw).TransformVector(axis)
  const vYaw = (spherePointToEulerDeg(v).yaw * Math.PI) / 180
  const cy = Math.cos(vYaw)
  const sy = Math.sin(vYaw)
  const rx = cy * ax + -sy * ay
  const ry = sy * ax + cy * ay
  const rz = az
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  const dot = rx * v.x + ry * v.y + rz * v.z
  const cx = ry * v.z - rz * v.y
  const cy2 = rz * v.x - rx * v.z
  const cz = rx * v.y - ry * v.x
  return {
    x: v.x * c + cx * s + rx * (dot * (1 - c)),
    y: v.y * c + cy2 * s + ry * (dot * (1 - c)),
    z: v.z * c + cz * s + rz * (dot * (1 - c)),
    w: 0,
  }
}

/** Engine GetLookAtLimitDegreesValue(None) — full cone, no soft clamp. */
export const LOOKAT_LIMIT_DEGREES_NONE = 360

/** anim::EaseInEaseOut — f(t)=6t^5−15t^4+10t^3 */
export function easeInEaseOut(t: number): number {
  const x = Math.max(0, Math.min(1, t))
  return x * x * x * (10 + x * (-15 + x * 6))
}

/**
 * InterpolatePointsInSphereSpace — LookAtQuaternion scale of shortest rotation.
 */
export function interpolatePointsInSphereSpace(
  alpha: number,
  a: SimVec4,
  b: SimVec4,
  sphereRadius: number
): SimVec4 {
  if (alpha <= 0) return normalize3(a, sphereRadius)
  if (alpha >= 1) return normalize3(b, sphereRadius)
  const ea = spherePointToEulerDeg(a)
  const eb = spherePointToEulerDeg(b)
  const pitchDiff = eb.pitch - ea.pitch
  const yawDiff = normalizeAngle180(eb.yaw) - normalizeAngle180(ea.yaw)
  const moved = lookAtQuatTransform(pitchDiff * alpha, yawDiff * alpha, a)
  return normalize3(moved, sphereRadius)
}

/**
 * LookAtStateData soft cone: clamp lastTarget vs forward (EY) into
 * lastLimited. halfSoft = 0.5 * softLimitDegrees (pitch & yaw independently).
 */
export function applySoftConeLimit(
  lastTargetSphere: SimVec4,
  sphereRadius: number,
  softLimitDegrees: number
): { limited: SimVec4; softLimitReached: boolean } {
  const r = sphereRadius > 1e-8 ? sphereRadius : 1
  const forward: SimVec4 = { x: 0, y: r, z: 0, w: 0 }
  const half = 0.5 * softLimitDegrees
  // GetShortestRotation(forward, last) ≡ euler(last) when forward is EY
  const e = spherePointToEulerDeg(lastTargetSphere)
  let pitch = e.pitch
  let yaw = normalizeAngle180(e.yaw)
  let reached = false
  if (Math.abs(pitch) > half) {
    reached = true
    pitch = Math.sign(pitch) * half
  }
  if (Math.abs(yaw) > half) {
    reached = true
    yaw = Math.sign(yaw) * half
  }
  if (!reached) {
    return {
      limited: normalize3(lastTargetSphere, r),
      softLimitReached: false,
    }
  }
  const limited = lookAtQuatTransform(pitch, yaw, forward)
  return { limited: normalize3(limited, r), softLimitReached: true }
}

/**
 * Hard cone / distance check for GetPriority demotion.
 * Engine flag exists but UpdatePositions in this dump never sets it; we evaluate
 * desired vs forward + distance so multi-request priority still matches intent.
 */
export function isHardLimitReached(
  desiredSphere: SimVec4,
  distance: number,
  hardLimitDegrees: number,
  hardLimitDistance: number
): boolean {
  if (distance > hardLimitDistance) return true
  const half = 0.5 * hardLimitDegrees
  const e = spherePointToEulerDeg(desiredSphere)
  const yaw = normalizeAngle180(e.yaw)
  return Math.abs(e.pitch) > half || Math.abs(yaw) > half
}

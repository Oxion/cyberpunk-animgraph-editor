/**
 * Offline port of engine anim::Ik2Solver::Solve (ik2Solver).
 */

import type { Pose } from './pose'
import {
  getTransformMs,
  IDENTITY_QS,
  parentUnifiedOf,
  readBoneLs,
  resolveUnifiedName,
  writeBoneLs,
  type Qs,
} from './poseFk'
import type { RigEntry } from './rigResource'

export type Vec3 = { x: number; y: number; z: number }
export type Quat = { x: number; y: number; z: number; w: number }

export type Ik2SolverInput = {
  firstBoneParentMS: Qs
  firstBoneLS: Qs
  secondBoneLS: Qs
  endBoneLS: Qs
  hingeAxisLS: Vec3
  usePoleVector: boolean
  poleVectorMS: Vec3
  cosineMinHingeAngle: number
  cosineMaxHingeAngle: number
  firstBoneIkGain: number
  secondBoneIkGain: number
  endBoneIkGain: number
  enforceEndPosition: boolean
  enforceEndOrientation: boolean
  endBoneOffsetPositionLS: Vec3
  weight: number
  twistDeg: number
  endTargetPositionMS: Vec3
  endTargetRotationMS: Quat
}

export type Ik2SolverOutput = {
  firstBoneMS: Qs
  secondBoneMS: Qs
  endBoneMS: Qs
  firstBoneLS: Qs
  secondBoneLS: Qs
  endBoneLS: Qs
}

const IDENTITY_QUAT: Quat = { x: 0, y: 0, z: 0, w: 1 }

/** anim::AxisToVector */
export function animAxisToVector(raw: unknown): Vec3 {
  const s = String(raw ?? 'Y')
  if (s.includes('NegativeX') || s === '-X') return { x: -1, y: 0, z: 0 }
  if (s.includes('NegativeY') || s === '-Y') return { x: 0, y: -1, z: 0 }
  if (s.includes('NegativeZ') || s === '-Z') return { x: 0, y: 0, z: -1 }
  if (s.includes('X') && !s.includes('Y') && !s.includes('Z')) return { x: 1, y: 0, z: 0 }
  if (s.includes('Z') && !s.includes('Y')) return { x: 0, y: 0, z: 1 }
  return { x: 0, y: 1, z: 0 }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

function dot3(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z
}

function sub3(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }
}

function mul3(a: Vec3, s: number): Vec3 {
  return { x: a.x * s, y: a.y * s, z: a.z * s }
}

function cross3(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  }
}

function lenSq3(v: Vec3): number {
  return v.x * v.x + v.y * v.y + v.z * v.z
}

function normalize3(v: Vec3): Vec3 {
  const l = Math.sqrt(lenSq3(v))
  if (l < 1e-12) return { x: 0, y: 0, z: 0 }
  return { x: v.x / l, y: v.y / l, z: v.z / l }
}

function projectNormal(
  normal: Vec3,
  vector: Vec3
): { inPlane: Vec3; outOfPlane: Vec3 } {
  const outOfPlane = mul3(normal, dot3(vector, normal))
  return { inPlane: sub3(vector, outOfPlane), outOfPlane }
}

function isParallel(aN: Vec3, bN: Vec3, tolerance = 0.001): boolean {
  return Math.abs(Math.abs(dot3(aN, bN)) - 1) <= tolerance
}

function normalizeQuat(q: Quat): Quat {
  const l = Math.hypot(q.x, q.y, q.z, q.w) || 1
  return { x: q.x / l, y: q.y / l, z: q.z / l, w: q.w / l }
}

function mulQuat(a: Quat, b: Quat): Quat {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  }
}

function rotateDirection(q: Quat, v: Vec3): Vec3 {
  const qx = q.x
  const qy = q.y
  const qz = q.z
  const qw = q.w
  const ix = qw * v.x + qy * v.z - qz * v.y
  const iy = qw * v.y + qz * v.x - qx * v.z
  const iz = qw * v.z + qx * v.y - qy * v.x
  const iw = -qx * v.x - qy * v.y - qz * v.z
  return {
    x: ix * qw + iw * -qx + iy * -qz - iz * -qy,
    y: iy * qw + iw * -qy + iz * -qx - ix * -qz,
    z: iz * qw + iw * -qz + ix * -qy - iy * -qx,
  }
}

/** Axis-angle quaternion (angle in radians). */
function quatFromAxisAngle(axis: Vec3, angleRad: number): Quat {
  const n = normalize3(axis)
  const half = angleRad * 0.5
  const s = Math.sin(half)
  return normalizeQuat({ x: n.x * s, y: n.y * s, z: n.z * s, w: Math.cos(half) })
}

function setShortestRotation(fromN: Vec3, toN: Vec3): Quat {
  const d = clamp(dot3(fromN, toN), -1, 1)
  if (d > 0.999999) return { ...IDENTITY_QUAT }
  if (d < -0.999999) {
    let ortho = cross3({ x: 1, y: 0, z: 0 }, fromN)
    if (lenSq3(ortho) < 1e-8) ortho = cross3({ x: 0, y: 1, z: 0 }, fromN)
    return quatFromAxisAngle(normalize3(ortho), Math.PI)
  }
  const axis = cross3(fromN, toN)
  return normalizeQuat({
    x: axis.x,
    y: axis.y,
    z: axis.z,
    w: 1 + d,
  })
}

function slerpQuat(a: Quat, b: Quat, t: number): Quat {
  let bx = b.x
  let by = b.y
  let bz = b.z
  let bw = b.w
  let dot = a.x * bx + a.y * by + a.z * bz + a.w * bw
  if (dot < 0) {
    bx = -bx
    by = -by
    bz = -bz
    bw = -bw
    dot = -dot
  }
  if (dot > 0.9995) {
    return normalizeQuat({
      x: a.x + (bx - a.x) * t,
      y: a.y + (by - a.y) * t,
      z: a.z + (bz - a.z) * t,
      w: a.w + (bw - a.w) * t,
    })
  }
  const theta0 = Math.acos(clamp(dot, -1, 1))
  const theta = theta0 * t
  const s0 = Math.sin(theta0)
  const s1 = Math.sin(theta)
  const s2 = Math.sin(theta0 - theta)
  const inv = s0 > 1e-12 ? 1 / s0 : 0
  return {
    x: (a.x * s2 + bx * s1) * inv,
    y: (a.y * s2 + by * s1) * inv,
    z: (a.z * s2 + bz * s1) * inv,
    w: (a.w * s2 + bw * s1) * inv,
  }
}

function copyQs(src: Qs, out: Qs): void {
  out.tx = src.tx
  out.ty = src.ty
  out.tz = src.tz
  out.qx = src.qx
  out.qy = src.qy
  out.qz = src.qz
  out.qw = src.qw
  out.sx = src.sx
  out.sy = src.sy
  out.sz = src.sz
}

function mulQs(parent: Qs, local: Qs, out: Qs): void {
  const qx = parent.qx
  const qy = parent.qy
  const qz = parent.qz
  const qw = parent.qw
  const lx = local.tx * parent.sx
  const ly = local.ty * parent.sy
  const lz = local.tz * parent.sz
  const ix = qw * lx + qy * lz - qz * ly
  const iy = qw * ly + qz * lx - qx * lz
  const iz = qw * lz + qx * ly - qy * lx
  const iw = -qx * lx - qy * ly - qz * lz
  out.tx = parent.tx + (ix * qw + iw * -qx + iy * -qz - iz * -qy)
  out.ty = parent.ty + (iy * qw + iw * -qy + iz * -qx - ix * -qz)
  out.tz = parent.tz + (iz * qw + iw * -qz + ix * -qy - iy * -qx)
  const rq = mulQuat(
    { x: qx, y: qy, z: qz, w: qw },
    { x: local.qx, y: local.qy, z: local.qz, w: local.qw }
  )
  out.qx = rq.x
  out.qy = rq.y
  out.qz = rq.z
  out.qw = rq.w
  out.sx = parent.sx * local.sx
  out.sy = parent.sy * local.sy
  out.sz = parent.sz * local.sz
}

function invertQs(m: Qs, out: Qs): void {
  const qx = -m.qx
  const qy = -m.qy
  const qz = -m.qz
  const qw = m.qw
  const sx = m.sx !== 0 ? 1 / m.sx : 1
  const sy = m.sy !== 0 ? 1 / m.sy : 1
  const sz = m.sz !== 0 ? 1 / m.sz : 1
  const lx = -m.tx
  const ly = -m.ty
  const lz = -m.tz
  const ix = qw * lx + qy * lz - qz * ly
  const iy = qw * ly + qz * lx - qx * lz
  const iz = qw * lz + qx * ly - qy * lx
  const iw = -qx * lx - qy * ly - qz * lz
  out.tx = (ix * qw + iw * -qx + iy * -qz - iz * -qy) * sx
  out.ty = (iy * qw + iw * -qy + iz * -qx - ix * -qz) * sy
  out.tz = (iz * qw + iw * -qz + ix * -qy - iy * -qx) * sz
  out.qx = qx
  out.qy = qy
  out.qz = qz
  out.qw = qw
  out.sx = sx
  out.sy = sy
  out.sz = sz
}

function mulInverseMul(parentMs: Qs, childMs: Qs, out: Qs, invScratch: Qs): void {
  invertQs(parentMs, invScratch)
  mulQs(invScratch, childMs, out)
}

function qsTranslation(q: Qs): Vec3 {
  return { x: q.tx, y: q.ty, z: q.tz }
}

function qsRotation(q: Qs): Quat {
  return { x: q.qx, y: q.qy, z: q.qz, w: q.qw }
}

function setQsRotation(q: Qs, r: Quat): void {
  q.qx = r.x
  q.qy = r.y
  q.qz = r.z
  q.qw = r.w
}

const scratchInv = { ...IDENTITY_QS }
const scratchSecondLs = { ...IDENTITY_QS }
const scratchOffset = { ...IDENTITY_QS }

/**
 * Engine Ik2Solver::Solve — returns false when both enforce flags are off.
 */
export function solveIk2(input: Ik2SolverInput, output: Ik2SolverOutput): boolean {
  if (!input.enforceEndPosition && !input.enforceEndOrientation) return false

  const firstBoneMS = { ...IDENTITY_QS }
  const secondBoneMS = { ...IDENTITY_QS }
  const endBoneMS = { ...IDENTITY_QS }

  mulQs(input.firstBoneParentMS, input.firstBoneLS, firstBoneMS)
  mulQs(firstBoneMS, input.secondBoneLS, secondBoneMS)
  mulQs(secondBoneMS, input.endBoneLS, endBoneMS)

  Object.assign(scratchOffset, IDENTITY_QS)
  scratchOffset.tx = input.endBoneOffsetPositionLS.x
  scratchOffset.ty = input.endBoneOffsetPositionLS.y
  scratchOffset.tz = input.endBoneOffsetPositionLS.z
  const endWithOffset = { ...IDENTITY_QS }
  mulQs(endBoneMS, scratchOffset, endWithOffset)
  copyQs(endWithOffset, endBoneMS)

  if (input.enforceEndPosition) {
    const firstBonePositionMS = qsTranslation(firstBoneMS)
    const secondBonePositionMS = qsTranslation(secondBoneMS)
    let endBonePositionMS = qsTranslation(endBoneMS)
    const targetPositionMS = input.endTargetPositionMS

    const firstToSecondVector = sub3(secondBonePositionMS, firstBonePositionMS)
    const secondToEndVector = sub3(endBonePositionMS, secondBonePositionMS)
    const firstToTargetVector = sub3(targetPositionMS, firstBonePositionMS)

    let hingeRot = normalizeQuat(qsRotation(secondBoneMS))
    let hingeAxisMS = normalize3(rotateDirection(hingeRot, input.hingeAxisLS))

    const f2s = projectNormal(hingeAxisMS, firstToSecondVector)
    const s2e = projectNormal(hingeAxisMS, secondToEndVector)

    const diffVectorOutOfPlane = sub3(f2s.outOfPlane, s2e.outOfPlane)
    const diffVectorOutOfPlaneSquaredLength = lenSq3(diffVectorOutOfPlane)

    const firstToTargetDistanceSquared = lenSq3(firstToTargetVector)
    const firstToTargetDistanceInPlaneSquared =
      firstToTargetDistanceSquared - diffVectorOutOfPlaneSquaredLength

    const firstToSecondDistanceInPlaneSquared = lenSq3(f2s.inPlane)
    const secondToEndDistanceInPlaneSquared = lenSq3(s2e.inPlane)
    const firstToSecondDistanceInPlane = Math.sqrt(
      Math.max(0, firstToSecondDistanceInPlaneSquared)
    )
    const secondToEndDistanceInPlane = Math.sqrt(
      Math.max(0, secondToEndDistanceInPlaneSquared)
    )

    const denom = -2 * firstToSecondDistanceInPlane * secondToEndDistanceInPlane
    let cosAngle =
      Math.abs(denom) < 1e-12
        ? input.cosineMaxHingeAngle
        : (firstToTargetDistanceInPlaneSquared -
            firstToSecondDistanceInPlaneSquared -
            secondToEndDistanceInPlaneSquared) /
          denom
    cosAngle = Math.max(
      input.cosineMaxHingeAngle,
      Math.min(input.cosineMinHingeAngle, cosAngle)
    )

    const desiredHingeAngle = Math.acos(clamp(cosAngle, -1, 1))

    let firstToSecondInPlane = normalize3(mul3(f2s.inPlane, -1))
    let secondToEndInPlane = normalize3(s2e.inPlane)
    const currentHingeAngle = Math.acos(
      clamp(dot3(firstToSecondInPlane, secondToEndInPlane), -1, 1)
    )
    const diffAngle = desiredHingeAngle - currentHingeAngle

    {
      const extraRotation = quatFromAxisAngle(
        hingeAxisMS,
        diffAngle * input.secondBoneIkGain * input.weight
      )
      setQsRotation(secondBoneMS, normalizeQuat(mulQuat(extraRotation, qsRotation(secondBoneMS))))
      mulInverseMul(firstBoneMS, secondBoneMS, scratchSecondLs, scratchInv)
      setQsRotation(scratchSecondLs, normalizeQuat(qsRotation(scratchSecondLs)))

      mulQs(secondBoneMS, input.endBoneLS, endBoneMS)
      mulQs(endBoneMS, scratchOffset, endWithOffset)
      copyQs(endWithOffset, endBoneMS)
    }

    {
      endBonePositionMS = qsTranslation(endBoneMS)
      const firstToEndVectorNormalized = normalize3(
        sub3(endBonePositionMS, firstBonePositionMS)
      )
      const firstToTargetVectorNormalized = normalize3(
        sub3(targetPositionMS, firstBonePositionMS)
      )

      let extraRotation = setShortestRotation(
        firstToEndVectorNormalized,
        firstToTargetVectorNormalized
      )
      const extraRotationWeight = input.firstBoneIkGain * input.weight
      if (extraRotationWeight < 1) {
        extraRotation = slerpQuat(IDENTITY_QUAT, extraRotation, extraRotationWeight)
      }

      setQsRotation(firstBoneMS, normalizeQuat(mulQuat(extraRotation, qsRotation(firstBoneMS))))
      mulQs(firstBoneMS, scratchSecondLs, secondBoneMS)

      if (input.usePoleVector) {
        const poleVectorNormalized = normalize3(
          sub3(input.poleVectorMS, firstBonePositionMS)
        )
        if (!isParallel(firstToTargetVectorNormalized, poleVectorNormalized)) {
          const firstToSecondVectorNormalized = normalize3(
            sub3(qsTranslation(secondBoneMS), qsTranslation(firstBoneMS))
          )
          let vecA: Vec3
          if (!isParallel(firstToTargetVectorNormalized, firstToSecondVectorNormalized)) {
            const proj = projectNormal(
              firstToTargetVectorNormalized,
              firstToSecondVectorNormalized
            )
            vecA = proj.inPlane
          } else {
            hingeRot = normalizeQuat(qsRotation(secondBoneMS))
            hingeAxisMS = normalize3(rotateDirection(hingeRot, input.hingeAxisLS))
            vecA = cross3(hingeAxisMS, firstToTargetVectorNormalized)
          }
          const poleProj = projectNormal(
            firstToTargetVectorNormalized,
            poleVectorNormalized
          )
          let vecB = poleProj.inPlane
          vecA = normalize3(vecA)
          vecB = normalize3(vecB)

          let qPole = setShortestRotation(vecA, vecB)
          if (input.weight < 1) {
            qPole = slerpQuat(IDENTITY_QUAT, qPole, input.weight)
          }
          setQsRotation(firstBoneMS, mulQuat(qPole, qsRotation(firstBoneMS)))
        }
      }

      if (Math.abs(input.twistDeg) > 0) {
        const qTwist = quatFromAxisAngle(
          firstToTargetVectorNormalized,
          (input.twistDeg * Math.PI) / 180
        )
        setQsRotation(firstBoneMS, mulQuat(qTwist, qsRotation(firstBoneMS)))
      }

      setQsRotation(firstBoneMS, normalizeQuat(qsRotation(firstBoneMS)))
      mulQs(firstBoneMS, scratchSecondLs, secondBoneMS)
      mulQs(secondBoneMS, input.endBoneLS, endBoneMS)
    }
  }

  if (input.enforceEndOrientation) {
    const blended = slerpQuat(
      qsRotation(endBoneMS),
      input.endTargetRotationMS,
      input.endBoneIkGain * input.weight
    )
    setQsRotation(endBoneMS, blended)
  }

  mulInverseMul(input.firstBoneParentMS, firstBoneMS, output.firstBoneLS, scratchInv)
  mulInverseMul(firstBoneMS, secondBoneMS, output.secondBoneLS, scratchInv)
  mulInverseMul(secondBoneMS, endBoneMS, output.endBoneLS, scratchInv)
  copyQs(firstBoneMS, output.firstBoneMS)
  copyQs(secondBoneMS, output.secondBoneMS)
  copyQs(endBoneMS, output.endBoneMS)
  return true
}

export type ApplyIk2Params = {
  firstBoneName: string
  secondBoneName: string
  endBoneName: string
  hingeAxis: unknown
  minHingeAngleDegrees: number
  maxHingeAngleDegrees: number
  firstBoneIkGain: number
  secondBoneIkGain: number
  endBoneIkGain: number
  enforceEndPosition: boolean
  enforceEndOrientation: boolean
  endBoneOffsetPositionLS: Vec3
  weight: number
  twistDeg: number
  usePoleVector: boolean
  poleVectorMS: Vec3
  endTargetPositionMS: Vec3
  endTargetRotationMS: Quat
  /** Override cosine max (Ik2Constraint); undefined → cos(maxHingeAngleDegrees) */
  cosineMaxHingeAngle?: number
  cosineMinHingeAngle?: number
}

const outScratch: Ik2SolverOutput = {
  firstBoneMS: { ...IDENTITY_QS },
  secondBoneMS: { ...IDENTITY_QS },
  endBoneMS: { ...IDENTITY_QS },
  firstBoneLS: { ...IDENTITY_QS },
  secondBoneLS: { ...IDENTITY_QS },
  endBoneLS: { ...IDENTITY_QS },
}

/** Resolve bones, run solver, write LS. */
export function applyIk2(
  pose: Pose,
  rig: RigEntry,
  params: ApplyIk2Params
): boolean {
  if (!(params.weight > 0)) return false
  if (!params.enforceEndPosition && !params.enforceEndOrientation) return false

  const firstIdx = resolveUnifiedName(pose, rig, params.firstBoneName)
  const secondIdx = resolveUnifiedName(pose, rig, params.secondBoneName)
  const endIdx = resolveUnifiedName(pose, rig, params.endBoneName)
  if (firstIdx < 0 || secondIdx < 0 || endIdx < 0) return false

  const parentIdx = parentUnifiedOf(pose, rig, firstIdx)
  if (parentIdx < 0) return false

  const parentMS = { ...IDENTITY_QS }
  if (!getTransformMs(pose, rig, parentIdx, parentMS)) return false

  const firstLS = { ...IDENTITY_QS }
  const secondLS = { ...IDENTITY_QS }
  const endLS = { ...IDENTITY_QS }
  if (!readBoneLs(pose, firstIdx, firstLS)) return false
  if (!readBoneLs(pose, secondIdx, secondLS)) return false
  if (!readBoneLs(pose, endIdx, endLS)) return false

  const deg2rad = Math.PI / 180
  const cosineMin =
    params.cosineMinHingeAngle ?? Math.cos(params.minHingeAngleDegrees * deg2rad)
  const cosineMax =
    params.cosineMaxHingeAngle ?? Math.cos(params.maxHingeAngleDegrees * deg2rad)

  const input: Ik2SolverInput = {
    firstBoneParentMS: parentMS,
    firstBoneLS: firstLS,
    secondBoneLS: secondLS,
    endBoneLS: endLS,
    hingeAxisLS: animAxisToVector(params.hingeAxis),
    usePoleVector: params.usePoleVector,
    poleVectorMS: params.poleVectorMS,
    cosineMinHingeAngle: cosineMin,
    cosineMaxHingeAngle: cosineMax,
    firstBoneIkGain: params.firstBoneIkGain,
    secondBoneIkGain: params.secondBoneIkGain,
    endBoneIkGain: params.endBoneIkGain,
    enforceEndPosition: params.enforceEndPosition,
    enforceEndOrientation: params.enforceEndOrientation,
    endBoneOffsetPositionLS: params.endBoneOffsetPositionLS,
    weight: params.weight,
    twistDeg: params.twistDeg,
    endTargetPositionMS: params.endTargetPositionMS,
    endTargetRotationMS: params.endTargetRotationMS,
  }

  if (!solveIk2(input, outScratch)) return false
  writeBoneLs(pose, firstIdx, outScratch.firstBoneLS)
  writeBoneLs(pose, secondIdx, outScratch.secondBoneLS)
  writeBoneLs(pose, endIdx, outScratch.endBoneLS)
  return true
}

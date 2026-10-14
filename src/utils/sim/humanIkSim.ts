/**
 * animAnimNode_HumanIk — 4-limb Ik2 from board (ikLeftLeg/…).
 *
 * Engine: IKTargetsController publishes chain inputs; ProcessLimb → SolveLimbIK.
 * Offline: controller publishes board; this solves limbs from board only.
 */

import { applyIk2 } from './ik2Solver'
import type { Pose } from './pose'
import {
  getTransformMs,
  IDENTITY_QS,
  resolveUnifiedName,
  setBoneRotationMs,
  slerpQs,
  type Qs,
} from './poseFk'
import type { RigEntry } from './rigResource'
import type { SimInputBoard } from './SimInputBoard'

type LimbDef = {
  group: string
  begin: string
  mid: string
  end: string
  /** Legs snap pole to mid bone MS; arms use override only. */
  poleSnapMid: boolean
}

const LIMBS: LimbDef[] = [
  {
    group: 'ikLeftLeg',
    begin: 'LeftUpLeg',
    mid: 'LeftLeg',
    end: 'LeftFoot',
    poleSnapMid: true,
  },
  {
    group: 'ikRightLeg',
    begin: 'RightUpLeg',
    mid: 'RightLeg',
    end: 'RightFoot',
    poleSnapMid: true,
  },
  {
    group: 'ikLeftArm',
    begin: 'LeftArm',
    mid: 'LeftForeArm',
    end: 'LeftHand',
    poleSnapMid: false,
  },
  {
    group: 'ikRightArm',
    begin: 'RightArm',
    mid: 'RightForeArm',
    end: 'RightHand',
    poleSnapMid: false,
  },
]

type LimbInput = {
  enabled: boolean
  position: { x: number; y: number; z: number }
  rotation: { x: number; y: number; z: number; w: number }
  weightPosition: number
  weightRotation: number
  poleVector: { x: number; y: number; z: number }
  poleOverrideWeight: number
}

function readLimbFromBoard(
  board: SimInputBoard | undefined,
  group: string
): LimbInput | null {
  if (!board) return null
  const enabled = board.getBoolFeature(group, 'isEnabled') === true
  const weightPosition = board.getFeature(group, 'weightPosition') ?? 0
  const weightRotation =
    board.getFeature(group, 'weightRotation') ??
    board.getFeature(group, 'weightOrientation') ??
    0
  if (!enabled && !(weightPosition > 0) && !(weightRotation > 0)) return null

  const pos =
    board.getVectorFeature(group, 'position') ??
    board.getVectorFeature(group, 'targetPosition')
  const rot =
    board.getQuatFeature(group, 'rotation') ??
    board.getQuatFeature(group, 'targetOrientation')
  const pole = board.getVectorFeature(group, 'poleVector')
  // Engine GraphInput typo: "poleVectorOverideWeight"
  const poleOverride =
    board.getFeature(group, 'poleVectorOverrideWeight') ??
    board.getFeature(group, 'poleVectorOverideWeight') ??
    0

  return {
    enabled: enabled || weightPosition > 0 || weightRotation > 0,
    position: pos ? { x: pos.x, y: pos.y, z: pos.z } : { x: 0, y: 0, z: 0 },
    rotation: rot
      ? { x: rot.x, y: rot.y, z: rot.z, w: rot.w }
      : { x: 0, y: 0, z: 0, w: 1 },
    weightPosition: enabled && !(weightPosition > 0) ? 1 : weightPosition,
    weightRotation,
    poleVector: pole
      ? { x: pole.x, y: pole.y, z: pole.z }
      : { x: 0, y: 0, z: 0 },
    poleOverrideWeight: poleOverride,
  }
}

function poleIsZero(p: { x: number; y: number; z: number }): boolean {
  return Math.hypot(p.x, p.y, p.z) < 1e-8
}

/**
 * Engine HumanIk::OnSample limb pass (lodWeightFactor = 1 offline).
 * Expects IKTargetsController.publish to have written board groups.
 */
export function applyHumanIk(
  pose: Pose,
  rig: RigEntry,
  board: SimInputBoard | undefined,
  lodWeightFactor = 1
): number {
  if (!(lodWeightFactor > 0.001)) return 0
  let solved = 0
  const midMs = { ...IDENTITY_QS }

  for (const limb of LIMBS) {
    const input = readLimbFromBoard(board, limb.group)
    if (!input?.enabled) continue

    const weight = input.weightPosition * lodWeightFactor
    if (!(weight > 0)) continue

    let pole = { x: 0, y: 0, z: 0 }
    if (limb.poleSnapMid) {
      const midIdx = resolveUnifiedName(pose, rig, limb.mid)
      if (midIdx >= 0 && getTransformMs(pose, rig, midIdx, midMs)) {
        pole = { x: midMs.tx, y: midMs.ty, z: midMs.tz }
      }
    }

    const ow = input.poleOverrideWeight
    if (ow > 0) {
      pole = {
        x: pole.x * (1 - ow) + input.poleVector.x * ow,
        y: pole.y * (1 - ow) + input.poleVector.y * ow,
        z: pole.z * (1 - ow) + input.poleVector.z * ow,
      }
    }

    const usePole = !poleIsZero(pole)
    const ok = applyIk2(pose, rig, {
      firstBoneName: limb.begin,
      secondBoneName: limb.mid,
      endBoneName: limb.end,
      hingeAxis: 'AxisZ',
      minHingeAngleDegrees: 0,
      maxHingeAngleDegrees: 180,
      firstBoneIkGain: 1,
      secondBoneIkGain: 1,
      endBoneIkGain: 1,
      enforceEndPosition: true,
      enforceEndOrientation: false,
      endBoneOffsetPositionLS: { x: 0, y: 0, z: 0 },
      weight,
      twistDeg: 0,
      usePoleVector: usePole,
      poleVectorMS: pole,
      endTargetPositionMS: input.position,
      endTargetRotationMS: input.rotation,
      cosineMinHingeAngle: 1,
      cosineMaxHingeAngle: -1,
    })
    if (!ok) continue
    solved++

    const rotW = input.weightRotation
    if (rotW > 0) {
      const endIdx = resolveUnifiedName(pose, rig, limb.end)
      if (endIdx >= 0) {
        const cur = { ...IDENTITY_QS }
        if (getTransformMs(pose, rig, endIdx, cur)) {
          const target: Qs = {
            ...cur,
            qx: input.rotation.x,
            qy: input.rotation.y,
            qz: input.rotation.z,
            qw: input.rotation.w,
          }
          const blended =
            rotW >= 1 - 1e-6 ? target : slerpQs(cur, target, rotW)
          setBoneRotationMs(
            pose,
            rig,
            endIdx,
            blended.qx,
            blended.qy,
            blended.qz,
            blended.qw
          )
        }
      }
    }
  }

  return solved
}

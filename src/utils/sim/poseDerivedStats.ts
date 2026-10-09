/**
 * Pure builders for pose-derived HUD (stack / track stack / rig bones).
 * Pose resolve + caching live in the sim store layer.
 */
import type { RigEntry } from './rigResource'
import {
  readBoneTrs,
  readStackBoneTrs,
  type BoneTrs,
  type Pose,
} from './pose'

export type PoseStackNamesStats = {
  count: number
  names: string[]
}

export type PoseStackBonesStats = {
  bones: Record<string, BoneTrs>
}

export type PoseTrackStackStats = {
  count: number
  names: string[]
  values: Record<string, number>
}

/** Rig bone TRS sampled from a single pose. Names live on `DerivedPoseStats.rig`. */
export type PoseRigBonesStats = {
  bones: Record<string, BoneTrs>
}

export type DerivedPoseStatsNeed = {
  stackNames?: boolean
  stackBones?: boolean
  trackStack?: boolean
  rigBones?: boolean
}

export type DerivedPoseStats = {
  /** Active rig for the resolved pose (stable across frames). */
  rig?: RigEntry | null
  stackNames?: PoseStackNamesStats
  stackBones?: PoseStackBonesStats
  trackStack?: PoseTrackStackStats
  rigBones?: PoseRigBonesStats
}

export type DerivedPoseRef = 'sample' | { capture: string }

export function poseRefKey(pose: DerivedPoseRef): string {
  return typeof pose === 'string' ? 'sample' : `capture:${pose.capture}`
}

export function buildStackNamesStats(pose: Pose): PoseStackNamesStats | undefined {
  if (pose.stackCount <= 0) return undefined
  const names: string[] = []
  for (let i = 0; i < pose.stackCount; i++) {
    names.push(pose.stackNames[i] || `stack_${i}`)
  }
  return { count: pose.stackCount, names }
}

export function buildStackBonesStats(pose: Pose): PoseStackBonesStats | undefined {
  if (pose.stackCount <= 0) return undefined
  const bones: Record<string, BoneTrs> = {}
  for (let i = 0; i < pose.stackCount; i++) {
    const n = pose.stackNames[i] || `stack_${i}`
    const trs = readStackBoneTrs(pose, i)
    if (trs) bones[n] = trs
  }
  return { bones }
}

export function buildTrackStackStats(pose: Pose): PoseTrackStackStats | undefined {
  if (pose.trackStackCount <= 0) return undefined
  const names: string[] = []
  const values: Record<string, number> = {}
  for (let i = 0; i < pose.trackStackCount; i++) {
    const n = pose.trackStackNames[i] || `track_stack_${i}`
    names.push(n)
    values[n] = pose.trackStackValues[i] ?? 0
  }
  return { count: pose.trackStackCount, names, values }
}

/** Map every rig bone TRS from the given pose (no capture/sample dual). */
export function buildRigBonesStats(
  pose: Pose,
  rig: RigEntry
): PoseRigBonesStats | undefined {
  const names = rig.boneNames
  if (!names.length) return undefined
  const bones: Record<string, BoneTrs> = {}
  for (let i = 0; i < names.length; i++) {
    const n = names[i]!
    const trs = readBoneTrs(pose, i)
    if (trs) bones[n] = trs
  }
  return { bones }
}

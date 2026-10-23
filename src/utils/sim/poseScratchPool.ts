import { createPose, DEFAULT_STACK_CAPACITY, Pose } from "./pose"

const DEFAULT_POSE_SCRATCH_SLOTS = 2

/** Growable LIFO pool of pose temps (reuse across frames). */
export type PoseScratchPool = {
  stack: Pose[]
  depth: number
  boneCount: number
  trackCount: number
  stackCapacity: number
  trackStackCapacity: number
  extraTrackCapacity: number
}

export function createPoseScratchPool(
  boneCount: number,
  trackCount: number,
  stackCapacity = DEFAULT_STACK_CAPACITY,
  trackStackCapacity = DEFAULT_STACK_CAPACITY,
  extraTrackCapacity = 0,
  initialSlots = DEFAULT_POSE_SCRATCH_SLOTS
): PoseScratchPool {
  const n = Math.max(0, boneCount | 0)
  const t = Math.max(0, trackCount | 0)
  const sc = Math.max(0, stackCapacity | 0)
  const tsc = Math.max(0, trackStackCapacity | 0)
  const etc = Math.max(0, extraTrackCapacity | 0)
  const slots = Math.max(1, initialSlots | 0)
  return {
    stack: Array.from({ length: slots }, () => createPose(n, t, sc, tsc, etc)),
    depth: 0,
    boneCount: n,
    trackCount: t,
    stackCapacity: sc,
    trackStackCapacity: tsc,
    extraTrackCapacity: etc,
  }
}
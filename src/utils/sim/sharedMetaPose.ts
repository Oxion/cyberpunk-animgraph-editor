import { Qs } from "./poseFk"

/**
 * Offline stand-in for engine SharedMetaPoseContext (inject bag).
 * Keys are part-local bone / track names (easy variant); engine uses meta-mapped indices.
 */
export type SharedMetaPoseCtx = {
  /** Shared bone LS from MetaPose (name → Qs). */
  parentTransforms: Map<string, Qs>
  /** Shared float tracks from MetaPose. */
  parentTracks: Map<string, number>
  /** A-pose LS for SharedMetaPoseAdditive (convertParentPoseToAdditive). */
  aTransforms?: Map<string, Qs>
  /** Reference tracks for SharedMetaPoseAdditive. */
  referenceTracks?: Map<string, number>
  /** TrajectoryFromMetaPose / facial trajectory LS. */
  trajectoryLs?: Qs
}

export function createEmptySharedMetaPose(): SharedMetaPoseCtx {
  return {
    parentTransforms: new Map(),
    parentTracks: new Map(),
  }
}
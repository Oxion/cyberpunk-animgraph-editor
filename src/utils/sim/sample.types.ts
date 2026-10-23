import { Pose } from "./pose";
import { SimSampleWarning } from "./simTypes";

/** AnimNode_BlendFromPose instance buffer. */
export type BlendFromPoseDynState = {
  timer: number
  poseSet: boolean
  isBlendRequested: boolean
  cached: Pose | null
}

/** SM frozen pose slot (AnimNode_StateFrozen i_cachedPose). */
export type SmFrozenPoseSlot = {
  pose: Pose
  valid: boolean
}

/** Offline IK request snap (AddIkRequest → ReadIkRequest / controller graph ingest). */
export type IkTargetSnap = {
  chain: string
  /** Negative graph id; default IK_GRAPH_REQUEST_ID. */
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

export type SampleResult = {
  ok: boolean
  reason?: 'no-rig' | 'no-root' | 'empty'
  sampleMs: number
  bonesSampled: number
  missingGlb?: string[]
  warnings?: SimSampleWarning[]
}
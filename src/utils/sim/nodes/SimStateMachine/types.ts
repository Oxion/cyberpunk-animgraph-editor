import { AnimgraphNode } from "@/utils/graph/animgraphTypes"

/** Engine animAnimStateInterpolationType. */
export type AnimStateInterpolationType = 'Linear' | 'EaseIn' | 'EaseOut' | 'EaseInOut'

export type TransitionCandidate = {
  desc: AnimgraphNode
  index: number
  priority: number
  isForcedToTrue: boolean
  isGlobal: boolean
  targetStateIndex: number
  /** SM blend duration (0 when canRequestInertialization). */
  duration: number
  /** Original transition duration used for inertialization request. */
  inertializationDuration: number
  canRequestInertialization: boolean
}
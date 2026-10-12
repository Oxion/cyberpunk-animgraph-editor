/**
 * animAnimNode_Inertialization instance buffer.
 */

import { InstanceStateDef } from '../InstanceStore'
import type { Pose } from './pose'

export type InertializationDyn = {
  /** Alternating pose caches (engine i_cachedPose1/2). */
  pose1: Pose | null
  pose2: Pose | null
  /** True when pose1 holds the most recent Sample. */
  pose1IsLast: boolean
  /** 0..2 cached poses filled. */
  cachedCount: number
  lastTimeDelta: number
  currentTimeDelta: number
  elapsedTime: number
  inProgress: boolean
  /** Latched from UpdateContext this frame. */
  requested: boolean
  duration: number
  // Per-channel error (sized to transformsCountUpperBound / tracksCountUpperBound)
  errTDir: Float32Array
  errTMag: Float32Array
  errTVel: Float32Array
  errRAxis: Float32Array
  errRAng: Float32Array
  errRVel: Float32Array
  errTrack: Float32Array
  errTrackVel: Float32Array
  transformCap: number
  trackCap: number
}

export type InertializationDynProps = {
  transformsCountUpperBound: number
  tracksCountUpperBound: number
}

function allocChannels(s: InertializationDyn, tCap: number, trCap: number): void {
  s.transformCap = tCap
  s.trackCap = trCap
  s.errTDir = new Float32Array(tCap * 3)
  s.errTMag = new Float32Array(tCap)
  s.errTVel = new Float32Array(tCap)
  s.errRAxis = new Float32Array(tCap * 3)
  s.errRAng = new Float32Array(tCap)
  s.errRVel = new Float32Array(tCap)
  s.errTrack = new Float32Array(trCap)
  s.errTrackVel = new Float32Array(trCap)
}

export function createInertializationDyn(
  props: InertializationDynProps
): InertializationDyn {
  const tCap = Math.max(1, props.transformsCountUpperBound | 0)
  const trCap = Math.max(1, props.tracksCountUpperBound | 0)
  const s: InertializationDyn = {
    pose1: null,
    pose2: null,
    pose1IsLast: false,
    cachedCount: 0,
    lastTimeDelta: 0,
    currentTimeDelta: 0,
    elapsedTime: 0,
    inProgress: false,
    requested: false,
    duration: 0,
    errTDir: new Float32Array(0),
    errTMag: new Float32Array(0),
    errTVel: new Float32Array(0),
    errRAxis: new Float32Array(0),
    errRAng: new Float32Array(0),
    errRVel: new Float32Array(0),
    errTrack: new Float32Array(0),
    errTrackVel: new Float32Array(0),
    transformCap: 0,
    trackCap: 0,
  }
  allocChannels(s, tCap, trCap)
  return s
}

export function resetInertializationDyn(s: InertializationDyn): void {
  s.pose1IsLast = false
  s.cachedCount = 0
  s.lastTimeDelta = 0
  s.currentTimeDelta = 0
  s.elapsedTime = 0
  s.inProgress = false
  s.requested = false
  s.duration = 0
}

export const InertializationDynDef = new InstanceStateDef(
  'inertialization',
  createInertializationDyn
)

/**
 * Per-node WorkspotHub instance state (engine AnimNode_WorkspotHub buffers).
 */

import { InstanceStateDef } from '../InstanceStore'

export type WorkspotHubRecord = {
  entryId: number
  animName: string
  currTime: number
  prevTime: number
  loops: number
  blendTime: number
  playbackCounter: number
  timeScale: number
  animationStartTime: number
  animationLastLocalTime: number
  isLooped: boolean
  isExitAnim: boolean
  enableMotion: boolean
  /** Clip resolved at activate (or parallel socket active). */
  hasClip: boolean
}

export type WorkspotHubFacialRecord = {
  idleAnimName: string
  keyAnimName: string
  currTime: number
  blendTime: number
  keyWeight: number
  animationStartTime: number
}

export type WorkspotHubFacialSync = {
  animName: string
  animationStartTime: number
  animationEndTime: number
  currentTime: number
}

export type WorkspotHubDyn = {
  curr: WorkspotHubRecord
  next: WorkspotHubRecord
  /** −1 = not blending; [0,1) blending; ≥1 finishes this frame. */
  blendWeight: number
  globalBlendTime: number
  playbackCounterEventReset: number

  facialCurr: WorkspotHubFacialRecord
  facialNext: WorkspotHubFacialRecord
  facialBlendWeight: number
  facialSync: WorkspotHubFacialSync
  useFemaleFacial: boolean
}

const INVALID_ENTRY = -1

export function emptyWorkspotHubRecord(
  patch?: Partial<WorkspotHubRecord>
): WorkspotHubRecord {
  return {
    entryId: INVALID_ENTRY,
    animName: '',
    currTime: 0,
    prevTime: 0,
    loops: 0,
    blendTime: 0,
    playbackCounter: -1,
    timeScale: 1,
    animationStartTime: 0,
    animationLastLocalTime: 0,
    isLooped: false,
    isExitAnim: false,
    enableMotion: false,
    hasClip: false,
    ...patch,
  }
}

export function emptyWorkspotHubFacial(
  patch?: Partial<WorkspotHubFacialRecord>
): WorkspotHubFacialRecord {
  return {
    idleAnimName: '',
    keyAnimName: '',
    currTime: 0,
    blendTime: 0,
    keyWeight: 0,
    animationStartTime: 0,
    ...patch,
  }
}

export function emptyWorkspotHubFacialSync(
  patch?: Partial<WorkspotHubFacialSync>
): WorkspotHubFacialSync {
  return {
    animName: '',
    animationStartTime: 0,
    animationEndTime: 0,
    currentTime: 0,
    ...patch,
  }
}

export function createWorkspotHubDyn(): WorkspotHubDyn {
  return {
    curr: emptyWorkspotHubRecord(),
    next: emptyWorkspotHubRecord(),
    blendWeight: -1,
    globalBlendTime: 0,
    playbackCounterEventReset: -1,
    facialCurr: emptyWorkspotHubFacial(),
    facialNext: emptyWorkspotHubFacial(),
    facialBlendWeight: -1,
    facialSync: emptyWorkspotHubFacialSync(),
    useFemaleFacial: false,
  }
}

export function isWorkspotHubBlending(blendWeight: number): boolean {
  return blendWeight >= 0 && blendWeight < 1
}

export const WorkspotHubDynDef = new InstanceStateDef<WorkspotHubDyn>(
  'WorkspotHub',
  () => createWorkspotHubDyn()
)

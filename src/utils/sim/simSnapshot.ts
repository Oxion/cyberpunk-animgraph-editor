import { ClipClockState } from './clipClock'
import { ClipLibrary } from './clipLibrary'
import type { SimActiveClip, SimClipResolve, SimNodeDelta, SimNodeState, SimSnapshot } from './simTypes'

/** Cap per Sample frame to keep HUD bounded. */
export const SIM_SAMPLE_WARNINGS_MAX = 64

/** Cap per Update frame to keep HUD bounded. */
export const SIM_UPDATE_WARNINGS_MAX = 64

export function emptySimSnapshot(): SimSnapshot {
  return {
    time: 0,
    poseGen: 0,
    update: {
      rootHandleId: undefined,
      clips: [],
      simSmStateByHandleId: {},
      simNodeStateByHandleId: {},
      nodeDelta: undefined,
      warnings: [],
    },
  }
}

const WEIGHT_EPS = 1e-4

export function simNodeStateEqual(a: SimNodeState, b: SimNodeState): boolean {
  if (a.active !== b.active) return false
  if (a.conditionTruth !== b.conditionTruth) return false
  if (a.alpha !== b.alpha) return false
  const aw = a.weight
  const bw = b.weight
  if (aw === bw) return true
  if (typeof aw === 'number' && typeof bw === 'number') {
    return Math.abs(aw - bw) <= WEIGHT_EPS
  }
  return aw === undefined && bw === undefined
}

export function diffSimNodeStates(
  next: Readonly<Record<string, SimNodeState>>,
  prev?: Readonly<Record<string, SimNodeState>>,
): SimNodeDelta | undefined {
  if (!prev) return

  const changes: Record<string, SimNodeState> = {}
  const removed: string[] = []
  for (const id of Object.keys(next)) {
    const n = next[id]!
    const p = prev[id]
    if (!p || !simNodeStateEqual(p, n)) changes[id] = n
  }
  for (const id of Object.keys(prev)) {
    if (!(id in next)) removed.push(id)
  }
  return { changes, removed }
}

/** Classify SkAnim clip lookup for HUD (ok / empty / no-lib / missing / gated). */
export function classifyClipResolve(
  animName: string,
  isWrapperActive: (name: string) => boolean,
  clipLibrary?: ClipLibrary | null,
): SimClipResolve {
  if (!animName || animName === 'None') return 'empty'
  if (!clipLibrary || clipLibrary.entryCount === 0) return 'no-lib'
  if (clipLibrary.resolveClip(animName, isWrapperActive)) return 'ok'
  if (clipLibrary.hasClipAnywhere(animName)) return 'gated'
  return 'missing'
}

export function resolveSimActiveClips(
   clipClocks: ReadonlyMap<string, ClipClockState>,
   handleIdToSimNodeState: Readonly<Record<string, SimNodeState>>,
   isWrapperActive: (name: string) => boolean,
   clipLibrary?: ClipLibrary | null,
): SimActiveClip[] {
  const clips: SimActiveClip[] = []
  for (const [handleId, clipClock] of clipClocks) {
    if (!clipClock.stepped) continue

    const simNodeStateWeight = handleIdToSimNodeState[handleId]?.weight
    const progress = typeof simNodeStateWeight === 'number' && Number.isFinite(simNodeStateWeight)
      ? simNodeStateWeight
      : 0

    const animName = clipClock.animName || 'None'
    const simClipResolveResult = clipClock.resolveHint 
      ?? classifyClipResolve(animName, isWrapperActive, clipLibrary)
    
    clips.push({
      handleId: handleId,
      animName,
      time: simClipResolveResult === 'ok' ? clipClock.currTime : 0,
      progress: simClipResolveResult === 'ok' ? progress : 0,
      resolve: simClipResolveResult,
    })
  }

  return clips
}

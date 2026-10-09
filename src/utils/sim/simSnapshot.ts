import type { SimNodeDelta, SimNodeState, SimSnapshot, SimStatus } from './simTypes'

/** Cap per Sample frame to keep HUD bounded. */
export const SIM_SAMPLE_WARNINGS_MAX = 64

/** Cap per Update frame to keep HUD bounded. */
export const SIM_UPDATE_WARNINGS_MAX = 64

export function emptySimStatus(): SimStatus {
  return { rootHandleId: null, clips: [] }
}

export function emptySimSnapshot(): SimSnapshot {
  return {
    time: 0,
    playing: false,
    speed: 1,
    poseGen: 0,
    sms: {},
    nodes: {},
    nodeDelta: null,
    status: emptySimStatus(),
    poseStats: null,
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
  prev: Record<string, SimNodeState>,
  next: Record<string, SimNodeState>
): SimNodeDelta {
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

export type SimCompareFunc =
  | 'Equal'
  | 'NotEqual'
  | 'Less'
  | 'LessEqual'
  | 'Greater'
  | 'GreaterEqual'
  | string

export type SimConditionTruth = boolean | 'unknown'

export interface SimSmState {
  smHandleId: string
  activeStateIndex: number
  isInTransition: boolean
  transitionProgress: number
  transitionDuration: number
  /** Local transition index, or globalIndex + localCount for globals */
  firingTransitionIndex: number | null
  firingTransitionHandleId: string | null
  targetStateIndex: number | null
  /** Transition handle ids whose conditions currently pass (eligible) */
  eligibleTransitionIds: string[]
  /** Last completed / fired transition handle */
  lastFiredTransitionId: string | null
  /** Debug: instant chain length this frame */
  instantChainLength: number
  checkEntryConditions: boolean
}

export interface SimNodeState {
  active: boolean
  weight?: number
  alpha?: number
  conditionTruth?: SimConditionTruth
}

/** Per-frame node overlay diff vs previous step (null = force full apply). */
export interface SimNodeDelta {
  changes: Record<string, SimNodeState>
  removed: string[]
}

/** Why an active SkAnim failed / succeeded clip resolve. */
export type SimClipResolve =
  | 'ok'
  /** animation CName empty / None */
  | 'empty'
  /** no ClipLibrary loaded */
  | 'no-lib'
  /** name not in any loaded set */
  | 'missing'
  /** in a set, but no active setup entry (wrappers) */
  | 'gated'
  /** AnimDatabase node but CSV / .csv.json not loaded */
  | 'no-db'

/** Sample-path diagnostic (append-only collector when warningsEnabled). */
export type SimSampleWarning = {
  code:
    | 'blend2-null-input'
    | 'blend-mask-oob'
    | 'blend-mask-missing'
    | 'blend-mask-empty'
    | 'bone-op-missing'
    | 'additional-transform-entry'
    | 'additional-float-track-entry'
    | 'math-expr-pose'
  handleId: string
  message: string
  weight?: number
  /** Which Blend2 input(s) were null */
  side?: 'first' | 'second' | 'both'
  maskIndex?: number
  maskName?: string
}

/** Cap per Sample frame to keep HUD bounded. */
export const SIM_SAMPLE_WARNINGS_MAX = 64

/** Update-path diagnostic (clip clocks / speed / AnimEnd). */
export type SimUpdateWarning = {
  code: 'clip-zero-speed'
  handleId: string
  message: string
  /** Effective playback speed when code is clip-zero-speed */
  speed?: number
}

/** Cap per Update frame to keep HUD bounded. */
export const SIM_UPDATE_WARNINGS_MAX = 64

/** Active SkAnim clip clock sample (all stepped clocks this frame). */
export interface SimActiveClip {
  handleId: string
  animName: string
  /** Seconds within clip window */
  time: number
  /** 0..1 playback progress when known */
  progress: number
  resolve: SimClipResolve
}

/**
 * Structured sim HUD — prefer this over string formatting.
 * Arrays are short (runner caps); safe to bind in Vue without heavy work.
 */
export interface SimStatus {
  rootHandleId: string | null
  /** Stepped SkAnim clocks this frame */
  clips: SimActiveClip[]
}

/** Dual inspect: pose at selected node vs final root Sample. */
export type SimBoneInspect = {
  atNode?: import('./pose').BoneTrs
  result?: import('./pose').BoneTrs
}

export interface SimPoseStats {
  ok: boolean
  reason?: string
  boneCount: number
  trackCount: number
  sampleMs: number
  /** Selected bone TRS for HUD inspect (sparse); atNode from capture, result from root */
  inspect?: Record<string, SimBoneInspect>
  /** Procedural transform stack after Sample (prefer capture at selected node) */
  stack?: {
    count: number
    names: string[]
    bones: Record<string, import('./pose').BoneTrs>
  }
  /** Procedural track stack after Sample (StackTracksExtender; same pose source as stack) */
  trackStack?: {
    count: number
    names: string[]
    values: Record<string, number>
  }
  /** HandleId of pose capture used for HUD (null/omit = final root pose) */
  stackSourceHandleId?: string
  /** Anim names on sample that resolved clip meta but had no glb in winning set */
  missingGlb?: string[]
  /** Sample warnings this frame (only when detect enabled) */
  warnings?: SimSampleWarning[]
  /** Update warnings this frame (only when detect enabled) */
  updateWarnings?: SimUpdateWarning[]
}

export interface SimSnapshot {
  time: number
  playing: boolean
  speed: number
  sms: Record<string, SimSmState>
  nodes: Record<string, SimNodeState>
  /** null on first step after bind/reset — consumers should full-apply `nodes`. */
  nodeDelta: SimNodeDelta | null
  status: SimStatus
  /** Sample-phase HUD (pooled pose stays on runner) */
  poseStats?: SimPoseStats | null
}

export function emptySimStatus(): SimStatus {
  return { rootHandleId: null, clips: [] }
}

export function emptySimSnapshot(): SimSnapshot {
  return {
    time: 0,
    playing: false,
    speed: 1,
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

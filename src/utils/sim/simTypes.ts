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

/** Update-path diagnostic (clip clocks / speed / AnimEnd). */
export type SimUpdateWarning = {
  code: 'clip-zero-speed'
  handleId: string
  message: string
  /** Effective playback speed when code is clip-zero-speed */
  speed?: number
}

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

/** Lightweight sample diagnostics in the snapshot (no stack/inspect mapping). */
export interface SimPoseStats {
  ok: boolean
  reason?: string
  boneCount: number
  trackCount: number
  sampleMs: number
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
  /**
   * Monotonic generation bumped each publish/sample.
   * Use for derived pose-stats cache keys and Vue frame ticks (not display `f=`).
   */
  poseGen: number
  sms: Record<string, SimSmState>
  nodes: Record<string, SimNodeState>
  /** null on first step after bind/reset — consumers should full-apply `nodes`. */
  nodeDelta: SimNodeDelta | null
  status: SimStatus
  /** Sample-phase diagnostics (pooled pose stays on runner; stack/inspect via getDerivedPoseStats) */
  poseStats?: SimPoseStats | null
}

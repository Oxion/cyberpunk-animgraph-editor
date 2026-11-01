/**
 * Mock runtime inputs for offline condition evaluation.
 * Mirrors pieces of CheckConditionContext (events, vars, features).
 *
 * AnimFeature group/property names are matched case-insensitively (RED CNames
 * often differ in casing between IntInput.name and condition featurePropertyName).
 *
 * Event channels (engine parity):
 * - AnimEvent conditions read lastFrameAnimEvents
 * - AnimEnd / AnyAnimEnd read animEndEvents produced this frame (after SkAnim Update)
 * - EventValue reads lastFrameAnimEventValues (valued timeline events)
 *
 * Vector4 AnimFeatures (VectorInput) live in a separate map — not split into scalars.
 * Quaternion AnimFeatures (QuaternionInput) live in a separate map (xyzw).
 * Bool AnimFeatures (BoolInput / BoolFeature) live in a separate map — not as float 0/1.
 *
 * TODO(parity): set*Feature always stores any (group, name). Engine ApplyFeature
 * no-ops unless the group is in the graph's m_animFeatures (+ matching input
 * layout entry). Not critical for offline UI; gate later if needed.
 */

import type { SimVec4 } from './evalAnimMathExpressionVector'

/** FiredEvent phase for timeline events (animNode_Signal DurStart/DurEnd split). */
export type SimAnimEventPhase = 'tick' | 'durStart' | 'durEnd'

export type SimInputBoardOptions = {
  /** Invoked at the end of `clearAll` (after maps are emptied). */
  onCleared?: () => void
  /** Invoked after `valuesRevision` bumps. */
  onValuesRevision?: (revision: number) => void
}

export class SimInputBoard {
  private readonly onCleared: (() => void) | undefined
  private readonly onValuesRevision: ((revision: number) => void) | undefined
  /** Bumps when persisted inputs change (features / vars / wrappers / tags). */
  private _valuesRevision = 0

  /** lowercase featureName -> lowercase propertyName -> number */
  private features = new Map<string, Map<string, number>>()
  /** Snapshot of features at previous endFrame — IntEdge conditions */
  private prevFeatures = new Map<string, Map<string, number>>()
  /** lowercase featureName -> lowercase propertyName -> Vector4 (VectorInput) */
  private vectorFeatures = new Map<string, Map<string, SimVec4>>()
  /** lowercase featureName -> lowercase propertyName -> Quaternion xyzw (QuaternionInput) */
  private quatFeatures = new Map<string, Map<string, SimVec4>>()
  /** lowercase featureName -> lowercase propertyName -> bool (BoolInput) */
  private boolFeatures = new Map<string, Map<string, boolean>>()
  /** Snapshot of bool features at previous endFrame — BoolEdge conditions */
  private prevBoolFeatures = new Map<string, Map<string, boolean>>()
  /** lowercase featureName -> lowercase propertyName -> string (CName AnimFeatures) */
  private stringFeatures = new Map<string, Map<string, string>>()
  /** variableName -> number (float vars / float variable conditions) */
  floatVars = new Map<string, number>()
  /** variableName -> Vector4 (AnimNode_VectorVariable) */
  vectorVars = new Map<string, SimVec4>()
  /** variableName -> Quaternion xyzw (AnimNode_QuaternionVariable) */
  quatVars = new Map<string, SimVec4>()
  /**
   * variableName -> Qs transform (AnimNode_TransformVariable).
   * Stored as flat tx/ty/tz/qx/qy/qz/qw/sx/sy/sz — see poseFk.Qs.
   */
  transformVars = new Map<
    string,
    {
      tx: number
      ty: number
      tz: number
      qx: number
      qy: number
      qz: number
      qw: number
      sx: number
      sy: number
      sz: number
    }
  >()
  boolVars = new Map<string, boolean>()
  intVars = new Map<string, number>()
  /**
   * Data-flow tags for AnimNode_TagValue (AnimDataFlowContext::Get).
   * Distinct from anim-set tags used by AnimSetTagValue.
   */
  tagValues = new Map<string, number>()
  /**
   * Offline mock for StaticSwitch ComponentTag / VisualTag / RigTag
   * (engine parentTags / visualTags / rig tags at Init).
   */
  entityTags = new Set<string>()
  /**
   * Anim wrapper weights (SetAnimWrapperWeight).
   * Engine treats weight >= 0.5 as active for WrapperValue / conditions.
   */
  wrapperWeights = new Map<string, number>()
  /** External events fired this frame (consumed after tick) */
  externalEvents = new Set<string>()
  /** Timeline anim events collected this frame (SkAnim CollectEvents) */
  animEvents = new Set<string>()
  /** Per-name FiredEvent phases this frame (tick / DurStart / DurEnd) */
  animEventPhases = new Map<string, Set<SimAnimEventPhase>>()
  /** Valued timeline events this frame (name → last value if multiple) */
  animEventValues = new Map<string, number>()
  /** FootPhase timeline events this frame */
  footPhases = new Set<string>()
  /**
   * Previous frame's timeline events — AnimEvent conditions read this
   * (animStateTransitionCondition_AnimEvent → m_lastFrameFiredEvents).
   */
  lastFrameAnimEvents = new Set<string>()
  /** Previous frame phases — Signal start/end DurStart/DurEnd filter */
  lastFrameAnimEventPhases = new Map<string, Set<SimAnimEventPhase>>()
  /** Previous frame valued events — AnimNode_EventValue */
  lastFrameAnimEventValues = new Map<string, number>()
  /** Previous frame FootPhase events */
  lastFrameFootPhases = new Set<string>()
  /**
   * Previous frame's anim-end names — Signal / TriggerBranch read these
   * (animNode_Signal → m_lastFrameAnimEndEvents).
   */
  lastFrameAnimEndEvents = new Set<string>()
  /** Anim-end names this frame (SkAnim PushAnimEndEvent) */
  animEndEvents = new Set<string>()
  anyAnimEnd = false

  /** Same threshold as AnimWrapperManager::UpdateSingleVariableEntry */
  static readonly WRAPPER_ACTIVE_THRESHOLD = 0.5

  /** AnimNode_SkAnim::m_anyAnimationEnd */
  static readonly ANY_ANIMATION_ENDED = 'At least one animation ended'

  constructor(options?: SimInputBoardOptions) {
    this.onCleared = options?.onCleared
    this.onValuesRevision = options?.onValuesRevision
  }

  get valuesRevision(): number {
    return this._valuesRevision
  }

  /** Explicit bump for callers that mutate maps directly (draft var channels). */
  bumpValuesRevision(): void {
    this._valuesRevision++
    this.onValuesRevision?.(this._valuesRevision)
  }

  private static norm(s: string): string {
    return s.trim().toLowerCase()
  }

  private static featKey(featureName: string, propertyName: string): [string, string] | null {
    const f = SimInputBoard.norm(featureName)
    const p = SimInputBoard.norm(propertyName)
    if (!f || !p) return null
    return [f, p]
  }

  private static vecEq(a: SimVec4, b: SimVec4): boolean {
    return a.x === b.x && a.y === b.y && a.z === b.z && a.w === b.w
  }

  resetDynamics(): void {
    this.externalEvents.clear()
    this.animEvents.clear()
    this.animEventPhases.clear()
    this.animEventValues.clear()
    this.footPhases.clear()
    this.lastFrameAnimEvents.clear()
    this.lastFrameAnimEventPhases.clear()
    this.lastFrameAnimEventValues.clear()
    this.lastFrameFootPhases.clear()
    this.animEndEvents.clear()
    this.lastFrameAnimEndEvents.clear()
    this.anyAnimEnd = false
    this.prevFeatures.clear()
    this.prevBoolFeatures.clear()
  }

  clearAll(): void {
    this.features.clear()
    this.vectorFeatures.clear()
    this.quatFeatures.clear()
    this.boolFeatures.clear()
    this.stringFeatures.clear()
    this.floatVars.clear()
    this.vectorVars.clear()
    this.quatVars.clear()
    this.transformVars.clear()
    this.boolVars.clear()
    this.intVars.clear()
    this.tagValues.clear()
    this.entityTags.clear()
    this.wrapperWeights.clear()
    this.resetDynamics()
    this.bumpValuesRevision()
    this.onCleared?.()
  }

  setEntityTag(name: string, present = true): void {
    if (!name || name === 'None') return
    if (present) {
      if (this.entityTags.has(name)) return
      this.entityTags.add(name)
      this.bumpValuesRevision()
      return
    }
    if (!this.entityTags.delete(name)) {
      const lower = name.toLowerCase()
      let removed = false
      for (const t of this.entityTags) {
        if (t.toLowerCase() === lower) {
          this.entityTags.delete(t)
          removed = true
          break
        }
      }
      if (!removed) return
    }
    this.bumpValuesRevision()
  }

  hasEntityTag(name: string): boolean {
    if (!name || name === 'None') return false
    if (this.entityTags.has(name)) return true
    const lower = name.toLowerCase()
    for (const t of this.entityTags) {
      if (t.toLowerCase() === lower) return true
    }
    return false
  }

  setWrapperWeight(name: string, value: number): void {
    if (!name || name === 'None' || !Number.isFinite(value)) return
    if (this.wrapperWeights.get(name) === value) return
    this.wrapperWeights.set(name, value)
    this.bumpValuesRevision()
  }

  clearWrapperWeight(name: string): void {
    if (!name || name === 'None') return
    if (!this.wrapperWeights.delete(name)) return
    this.bumpValuesRevision()
  }

  /** FindVariableValue parity: active bit only (weight >= 0.5). */
  isWrapperActive(name: string): boolean {
    if (!name || name === 'None') return false
    const w = this.wrapperWeights.get(name)
    return w !== undefined && w >= SimInputBoard.WRAPPER_ACTIVE_THRESHOLD
  }

  private static clearFeatMapProp<T>(
    map: Map<string, Map<string, T>>,
    featureName: string,
    propertyName: string,
  ): boolean {
    const key = SimInputBoard.featKey(featureName, propertyName)
    if (!key) return false
    const [f, p] = key
    const props = map.get(f)
    if (!props?.has(p)) return false
    props.delete(p)
    if (props.size === 0) map.delete(f)
    return true
  }

  setFeature(featureName: string, propertyName: string, value: number): void {
    const key = SimInputBoard.featKey(featureName, propertyName)
    if (!key) return
    const [f, p] = key
    let props = this.features.get(f)
    if (!props) {
      props = new Map()
      this.features.set(f, props)
    } else if (props.get(p) === value) {
      return
    }
    props.set(p, value)
    this.bumpValuesRevision()
  }

  clearFeature(featureName: string, propertyName: string): void {
    if (SimInputBoard.clearFeatMapProp(this.features, featureName, propertyName)) {
      this.bumpValuesRevision()
    }
  }

  getFeature(featureName: string, propertyName: string): number | undefined {
    const key = SimInputBoard.featKey(featureName, propertyName)
    if (!key) return undefined
    return this.features.get(key[0])?.get(key[1])
  }

  setVectorFeature(featureName: string, propertyName: string, value: SimVec4): void {
    const key = SimInputBoard.featKey(featureName, propertyName)
    if (!key) return
    const [f, p] = key
    const next = {
      x: Number.isFinite(value.x) ? value.x : 0,
      y: Number.isFinite(value.y) ? value.y : 0,
      z: Number.isFinite(value.z) ? value.z : 0,
      w: Number.isFinite(value.w) ? value.w : 0,
    }
    let props = this.vectorFeatures.get(f)
    if (!props) {
      props = new Map()
      this.vectorFeatures.set(f, props)
    } else {
      const prev = props.get(p)
      if (prev && SimInputBoard.vecEq(prev, next)) return
    }
    props.set(p, next)
    this.bumpValuesRevision()
  }

  clearVectorFeature(featureName: string, propertyName: string): void {
    if (SimInputBoard.clearFeatMapProp(this.vectorFeatures, featureName, propertyName)) {
      this.bumpValuesRevision()
    }
  }

  getVectorFeature(featureName: string, propertyName: string): SimVec4 | undefined {
    const key = SimInputBoard.featKey(featureName, propertyName)
    if (!key) return undefined
    const v = this.vectorFeatures.get(key[0])?.get(key[1])
    return v ? { ...v } : undefined
  }

  setQuatFeature(featureName: string, propertyName: string, value: SimVec4): void {
    const key = SimInputBoard.featKey(featureName, propertyName)
    if (!key) return
    const [f, p] = key
    const next = {
      x: Number.isFinite(value.x) ? value.x : 0,
      y: Number.isFinite(value.y) ? value.y : 0,
      z: Number.isFinite(value.z) ? value.z : 0,
      w: Number.isFinite(value.w) ? value.w : 1,
    }
    let props = this.quatFeatures.get(f)
    if (!props) {
      props = new Map()
      this.quatFeatures.set(f, props)
    } else {
      const prev = props.get(p)
      if (prev && SimInputBoard.vecEq(prev, next)) return
    }
    props.set(p, next)
    this.bumpValuesRevision()
  }

  clearQuatFeature(featureName: string, propertyName: string): void {
    if (SimInputBoard.clearFeatMapProp(this.quatFeatures, featureName, propertyName)) {
      this.bumpValuesRevision()
    }
  }

  getQuatFeature(featureName: string, propertyName: string): SimVec4 | undefined {
    const key = SimInputBoard.featKey(featureName, propertyName)
    if (!key) return undefined
    const v = this.quatFeatures.get(key[0])?.get(key[1])
    return v ? { ...v } : undefined
  }

  setBoolFeature(featureName: string, propertyName: string, value: boolean): void {
    const key = SimInputBoard.featKey(featureName, propertyName)
    if (!key) return
    const [f, p] = key
    const next = value === true
    let props = this.boolFeatures.get(f)
    if (!props) {
      props = new Map()
      this.boolFeatures.set(f, props)
    } else if (props.get(p) === next) {
      return
    }
    props.set(p, next)
    this.bumpValuesRevision()
  }

  clearBoolFeature(featureName: string, propertyName: string): void {
    if (SimInputBoard.clearFeatMapProp(this.boolFeatures, featureName, propertyName)) {
      this.bumpValuesRevision()
    }
  }

  getBoolFeature(featureName: string, propertyName: string): boolean | undefined {
    const key = SimInputBoard.featKey(featureName, propertyName)
    if (!key) return undefined
    return this.boolFeatures.get(key[0])?.get(key[1])
  }

  setStringFeature(featureName: string, propertyName: string, value: string): void {
    const key = SimInputBoard.featKey(featureName, propertyName)
    if (!key) return
    const [f, p] = key
    const next = value ?? ''
    let props = this.stringFeatures.get(f)
    if (!props) {
      props = new Map()
      this.stringFeatures.set(f, props)
    } else if (props.get(p) === next) {
      return
    }
    props.set(p, next)
    this.bumpValuesRevision()
  }

  clearStringFeature(featureName: string, propertyName: string): void {
    if (SimInputBoard.clearFeatMapProp(this.stringFeatures, featureName, propertyName)) {
      this.bumpValuesRevision()
    }
  }

  getStringFeature(featureName: string, propertyName: string): string | undefined {
    const key = SimInputBoard.featKey(featureName, propertyName)
    if (!key) return undefined
    return this.stringFeatures.get(key[0])?.get(key[1])
  }

  /** Previous-frame feature sample for edge conditions. */
  getPrevFeature(featureName: string, propertyName: string): number | undefined {
    const key = SimInputBoard.featKey(featureName, propertyName)
    if (!key) return undefined
    return this.prevFeatures.get(key[0])?.get(key[1])
  }

  /** Previous-frame bool feature sample for BoolEdge conditions. */
  getPrevBoolFeature(featureName: string, propertyName: string): boolean | undefined {
    const key = SimInputBoard.featKey(featureName, propertyName)
    if (!key) return undefined
    return this.prevBoolFeatures.get(key[0])?.get(key[1])
  }

  fireExternalEvent(name: string): void {
    if (name) this.externalEvents.add(name)
  }

  fireAnimEvent(
    name: string,
    value?: number,
    phase: SimAnimEventPhase = 'tick',
    footPhase?: string
  ): void {
    if (!name || name === 'None') return
    this.animEvents.add(name)
    let phases = this.animEventPhases.get(name)
    if (!phases) {
      phases = new Set()
      this.animEventPhases.set(name, phases)
    }
    phases.add(phase)
    if (value !== undefined && Number.isFinite(value)) {
      this.animEventValues.set(name, value)
    }
    if (footPhase && footPhase !== 'None') {
      this.footPhases.add(footPhase)
    }
  }

  fireFootPhase(phase: string): void {
    if (!phase || phase === 'None') return
    this.footPhases.add(phase)
  }

  /** FootPhaseEvent condition: last-frame foot phase events. */
  hasFootPhase(phase: string): boolean {
    if (!phase || phase === 'None') return false
    if (this.lastFrameFootPhases.has(phase)) return true
    const lower = phase.toLowerCase()
    for (const p of this.lastFrameFootPhases) {
      if (p.toLowerCase() === lower) return true
    }
    return false
  }

  /**
   * Manual SimPanel inject: make event visible to AnimEvent conditions this step
   * (engine normally exposes timeline events only as last-frame).
   * Injected as Tick (instant pulse), not DurStart/DurEnd.
   */
  injectAnimEventNow(name: string, value?: number): void {
    if (!name || name === 'None') return
    this.fireAnimEvent(name, value, 'tick')
    this.lastFrameAnimEvents.add(name)
    let phases = this.lastFrameAnimEventPhases.get(name)
    if (!phases) {
      phases = new Set()
      this.lastFrameAnimEventPhases.set(name, phases)
    }
    phases.add('tick')
    if (value !== undefined && Number.isFinite(value)) {
      this.lastFrameAnimEventValues.set(name, value)
    }
  }

  /**
   * PushAnimEndEvent parity: always ensure the global sentinel is present,
   * then optional animLoopEventName.
   */
  fireAnimEnd(extraName?: string): void {
    this.anyAnimEnd = true
    if (this.animEndEvents.size === 0) {
      this.animEndEvents.add(SimInputBoard.ANY_ANIMATION_ENDED)
    }
    if (extraName && extraName !== 'None') {
      this.animEndEvents.add(extraName)
    }
  }

  /** AnimEvent condition: last-frame timeline events (any phase). */
  hasAnimEvent(name: string): boolean {
    if (!name || name === 'None') return false
    return this.lastFrameAnimEvents.has(name)
  }

  /** Last-frame FiredEvent phases for Signal DurStart/DurEnd filter. */
  getLastFrameAnimEventPhases(name: string): ReadonlySet<SimAnimEventPhase> | undefined {
    if (!name || name === 'None') return undefined
    return this.lastFrameAnimEventPhases.get(name)
  }

  getLastFrameAnimEventValue(name: string): number | undefined {
    if (!name || name === 'None') return undefined
    return this.lastFrameAnimEventValues.get(name)
  }

  setFloatVar(name: string, value: number): void {
    if (!name || name === 'None' || !Number.isFinite(value)) return
    if (this.floatVars.get(name) === value) return
    this.floatVars.set(name, value)
    this.bumpValuesRevision()
  }

  clearFloatVar(name: string): void {
    if (!name || name === 'None') return
    if (!this.floatVars.delete(name)) return
    this.bumpValuesRevision()
  }

  setIntVar(name: string, value: number): void {
    if (!name || name === 'None' || !Number.isFinite(value)) return
    if (this.intVars.get(name) === value) return
    this.intVars.set(name, value)
    this.bumpValuesRevision()
  }

  clearIntVar(name: string): void {
    if (!name || name === 'None') return
    if (!this.intVars.delete(name)) return
    this.bumpValuesRevision()
  }

  setBoolVar(name: string, value: boolean): void {
    if (!name || name === 'None') return
    const next = value === true
    if (this.boolVars.get(name) === next) return
    this.boolVars.set(name, next)
    this.bumpValuesRevision()
  }

  clearBoolVar(name: string): void {
    if (!name || name === 'None') return
    if (!this.boolVars.delete(name)) return
    this.bumpValuesRevision()
  }

  setVectorVar(name: string, value: SimVec4): void {
    if (!name || name === 'None') return
    const next = {
      x: Number.isFinite(value.x) ? value.x : 0,
      y: Number.isFinite(value.y) ? value.y : 0,
      z: Number.isFinite(value.z) ? value.z : 0,
      w: Number.isFinite(value.w) ? value.w : 0,
    }
    const prev = this.vectorVars.get(name)
    if (prev && SimInputBoard.vecEq(prev, next)) return
    this.vectorVars.set(name, next)
    this.bumpValuesRevision()
  }

  clearVectorVar(name: string): void {
    if (!name || name === 'None') return
    if (!this.vectorVars.delete(name)) return
    this.bumpValuesRevision()
  }

  setQuatVar(name: string, value: SimVec4): void {
    if (!name || name === 'None') return
    const next = {
      x: Number.isFinite(value.x) ? value.x : 0,
      y: Number.isFinite(value.y) ? value.y : 0,
      z: Number.isFinite(value.z) ? value.z : 0,
      w: Number.isFinite(value.w) ? value.w : 1,
    }
    const prev = this.quatVars.get(name)
    if (prev && SimInputBoard.vecEq(prev, next)) return
    this.quatVars.set(name, next)
    this.bumpValuesRevision()
  }

  clearQuatVar(name: string): void {
    if (!name || name === 'None') return
    if (!this.quatVars.delete(name)) return
    this.bumpValuesRevision()
  }

  setTagValue(name: string, value: number): void {
    if (!name || name === 'None' || !Number.isFinite(value)) return
    if (this.tagValues.get(name) === value) return
    this.tagValues.set(name, value)
    this.bumpValuesRevision()
  }

  clearTagValue(name: string): void {
    if (!name || name === 'None') return
    if (this.tagValues.delete(name)) {
      this.bumpValuesRevision()
      return
    }
    const lower = name.toLowerCase()
    for (const k of this.tagValues.keys()) {
      if (k.toLowerCase() === lower) {
        this.tagValues.delete(k)
        this.bumpValuesRevision()
        return
      }
    }
  }

  getTagValue(name: string): number | undefined {
    if (!name || name === 'None') return undefined
    if (this.tagValues.has(name)) return this.tagValues.get(name)
    const lower = name.toLowerCase()
    for (const [k, v] of this.tagValues) {
      if (k.toLowerCase() === lower) return v
    }
    return undefined
  }

  /**
   * End of Update: promote this-frame timeline / anim-end → last frame,
   * snapshot features for next-frame edge conditions.
   */
  endFrame(): void {
    this.lastFrameAnimEvents = new Set(this.animEvents)
    this.animEvents.clear()
    const phaseSnap = new Map<string, Set<SimAnimEventPhase>>()
    for (const [name, phases] of this.animEventPhases) {
      phaseSnap.set(name, new Set(phases))
    }
    this.lastFrameAnimEventPhases = phaseSnap
    this.animEventPhases.clear()
    this.lastFrameAnimEventValues = new Map(this.animEventValues)
    this.animEventValues.clear()
    this.lastFrameFootPhases = new Set(this.footPhases)
    this.footPhases.clear()
    this.lastFrameAnimEndEvents = new Set(this.animEndEvents)
    this.animEndEvents.clear()
    this.anyAnimEnd = false
    this.externalEvents.clear()

    // Deep-copy feature maps for edge prev/curr
    const snap = new Map<string, Map<string, number>>()
    for (const [f, props] of this.features) {
      snap.set(f, new Map(props))
    }
    this.prevFeatures = snap

    const boolSnap = new Map<string, Map<string, boolean>>()
    for (const [f, props] of this.boolFeatures) {
      boolSnap.set(f, new Map(props))
    }
    this.prevBoolFeatures = boolSnap
  }
}

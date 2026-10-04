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
 * Bool AnimFeatures (BoolInput / BoolFeature) live in a separate map — not as float 0/1.
 */

import type { SimVec4 } from './evalAnimMathExpressionVector'

export type { SimVec4 }

export class SimInputBoard {
  /** lowercase featureName -> lowercase propertyName -> number */
  private features = new Map<string, Map<string, number>>()
  /** Snapshot of features at previous endFrame — IntEdge conditions */
  private prevFeatures = new Map<string, Map<string, number>>()
  /** lowercase featureName -> lowercase propertyName -> Vector4 (VectorInput) */
  private vectorFeatures = new Map<string, Map<string, SimVec4>>()
  /** lowercase featureName -> lowercase propertyName -> bool (BoolInput) */
  private boolFeatures = new Map<string, Map<string, boolean>>()
  /** Snapshot of bool features at previous endFrame — BoolEdge conditions */
  private prevBoolFeatures = new Map<string, Map<string, boolean>>()
  /** variableName -> number (float vars / float variable conditions) */
  floatVars = new Map<string, number>()
  boolVars = new Map<string, boolean>()
  intVars = new Map<string, number>()
  /**
   * Data-flow tags for AnimNode_TagValue (AnimDataFlowContext::Get).
   * Distinct from anim-set tags used by AnimSetTagValue.
   */
  tagValues = new Map<string, number>()
  /**
   * Anim wrapper weights (SetAnimWrapperWeight).
   * Engine treats weight >= 0.5 as active for WrapperValue / conditions.
   */
  wrapperWeights = new Map<string, number>()
  /** External events fired this frame (consumed after tick) */
  externalEvents = new Set<string>()
  /** Timeline anim events collected this frame (SkAnim CollectEvents) */
  animEvents = new Set<string>()
  /** Valued timeline events this frame (name → last value if multiple) */
  animEventValues = new Map<string, number>()
  /**
   * Previous frame's timeline events — AnimEvent conditions read this
   * (animStateTransitionCondition_AnimEvent.cpp → m_lastFrameFiredEvents).
   */
  lastFrameAnimEvents = new Set<string>()
  /** Previous frame valued events — AnimNode_EventValue */
  lastFrameAnimEventValues = new Map<string, number>()
  /**
   * Previous frame's anim-end names — Signal / TriggerBranch read these
   * (animNode_Signal.cpp → m_lastFrameAnimEndEvents).
   */
  lastFrameAnimEndEvents = new Set<string>()
  /** Anim-end names this frame (SkAnim PushAnimEndEvent) */
  animEndEvents = new Set<string>()
  anyAnimEnd = false

  /** Same threshold as AnimWrapperManager::UpdateSingleVariableEntry */
  static readonly WRAPPER_ACTIVE_THRESHOLD = 0.5

  /** AnimNode_SkAnim::m_anyAnimationEnd */
  static readonly ANY_ANIMATION_ENDED = 'At least one animation ended'

  private static norm(s: string): string {
    return s.trim().toLowerCase()
  }

  private static featKey(featureName: string, propertyName: string): [string, string] | null {
    const f = SimInputBoard.norm(featureName)
    const p = SimInputBoard.norm(propertyName)
    if (!f || !p) return null
    return [f, p]
  }

  resetDynamics(): void {
    this.externalEvents.clear()
    this.animEvents.clear()
    this.animEventValues.clear()
    this.lastFrameAnimEvents.clear()
    this.lastFrameAnimEventValues.clear()
    this.animEndEvents.clear()
    this.lastFrameAnimEndEvents.clear()
    this.anyAnimEnd = false
    this.prevFeatures.clear()
    this.prevBoolFeatures.clear()
  }

  clearAll(): void {
    this.features.clear()
    this.vectorFeatures.clear()
    this.boolFeatures.clear()
    this.floatVars.clear()
    this.boolVars.clear()
    this.intVars.clear()
    this.tagValues.clear()
    this.wrapperWeights.clear()
    this.resetDynamics()
  }

  setWrapperWeight(name: string, value: number): void {
    if (!name || name === 'None' || !Number.isFinite(value)) return
    this.wrapperWeights.set(name, value)
  }

  /** FindVariableValue parity: active bit only (weight >= 0.5). */
  isWrapperActive(name: string): boolean {
    if (!name || name === 'None') return false
    const w = this.wrapperWeights.get(name)
    return w !== undefined && w >= SimInputBoard.WRAPPER_ACTIVE_THRESHOLD
  }

  setFeature(featureName: string, propertyName: string, value: number): void {
    const key = SimInputBoard.featKey(featureName, propertyName)
    if (!key) return
    const [f, p] = key
    let props = this.features.get(f)
    if (!props) {
      props = new Map()
      this.features.set(f, props)
    }
    props.set(p, value)
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
    let props = this.vectorFeatures.get(f)
    if (!props) {
      props = new Map()
      this.vectorFeatures.set(f, props)
    }
    props.set(p, {
      x: Number.isFinite(value.x) ? value.x : 0,
      y: Number.isFinite(value.y) ? value.y : 0,
      z: Number.isFinite(value.z) ? value.z : 0,
      w: Number.isFinite(value.w) ? value.w : 0,
    })
  }

  getVectorFeature(featureName: string, propertyName: string): SimVec4 | undefined {
    const key = SimInputBoard.featKey(featureName, propertyName)
    if (!key) return undefined
    const v = this.vectorFeatures.get(key[0])?.get(key[1])
    return v ? { ...v } : undefined
  }

  setBoolFeature(featureName: string, propertyName: string, value: boolean): void {
    const key = SimInputBoard.featKey(featureName, propertyName)
    if (!key) return
    const [f, p] = key
    let props = this.boolFeatures.get(f)
    if (!props) {
      props = new Map()
      this.boolFeatures.set(f, props)
    }
    props.set(p, value === true)
  }

  getBoolFeature(featureName: string, propertyName: string): boolean | undefined {
    const key = SimInputBoard.featKey(featureName, propertyName)
    if (!key) return undefined
    return this.boolFeatures.get(key[0])?.get(key[1])
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

  fireAnimEvent(name: string, value?: number): void {
    if (!name || name === 'None') return
    this.animEvents.add(name)
    if (value !== undefined && Number.isFinite(value)) {
      this.animEventValues.set(name, value)
    }
  }

  /**
   * Manual SimPanel inject: make event visible to AnimEvent conditions this step
   * (engine normally exposes timeline events only as last-frame).
   */
  injectAnimEventNow(name: string, value?: number): void {
    if (!name || name === 'None') return
    this.animEvents.add(name)
    this.lastFrameAnimEvents.add(name)
    if (value !== undefined && Number.isFinite(value)) {
      this.animEventValues.set(name, value)
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

  /** AnimEvent condition: last-frame timeline events. */
  hasAnimEvent(name: string): boolean {
    if (!name || name === 'None') return false
    return this.lastFrameAnimEvents.has(name)
  }

  getLastFrameAnimEventValue(name: string): number | undefined {
    if (!name || name === 'None') return undefined
    return this.lastFrameAnimEventValues.get(name)
  }

  setTagValue(name: string, value: number): void {
    if (!name || name === 'None' || !Number.isFinite(value)) return
    this.tagValues.set(name, value)
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
    this.lastFrameAnimEventValues = new Map(this.animEventValues)
    this.animEventValues.clear()
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

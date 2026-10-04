/**
 * Per-graph instance state for transition conditions that own dyn buffers
 * in the engine (Timed::i_timeLeftToFire, ModifiedFloatVariable latch).
 * Lives on SimGraphRunner — not SimInputBoard — so nested GraphSlot graphs
 * with colliding HandleIds stay isolated while sharing one input board.
 */

export type ModifiedFloatState = {
  value: number
  initialized: boolean
  changed: boolean
}

export class SimConditionDyn {
  private timedLeft = new Map<string, number>()
  private timedStepped = new Set<string>()
  private modifiedFloat = new Map<string, ModifiedFloatState>()
  private modifiedFloatStepped = new Set<string>()

  /** Start of runner step — allow each condition to tick once. */
  beginStep(): void {
    this.timedStepped.clear()
    this.modifiedFloatStepped.clear()
  }

  /** Full clear (rebind / reset). */
  clear(): void {
    this.timedLeft.clear()
    this.timedStepped.clear()
    this.modifiedFloat.clear()
    this.modifiedFloatStepped.clear()
  }

  /**
   * Timed::ResetCondition — call when entering a state that owns this condition.
   */
  resetTimed(id: string, timeToFire: number): void {
    this.timedLeft.set(id, timeToFire)
    this.timedStepped.delete(id)
  }

  /**
   * Timed::Update + CheckCondition — countdown once per frame, fire when left < 0.
   */
  tickTimed(id: string, timeToFire: number, dt: number): boolean {
    if (!this.timedLeft.has(id)) this.timedLeft.set(id, timeToFire)
    if (!this.timedStepped.has(id)) {
      this.timedStepped.add(id)
      const left = (this.timedLeft.get(id) ?? timeToFire) - Math.max(0, dt)
      this.timedLeft.set(id, left)
    }
    return (this.timedLeft.get(id) ?? 0) < 0
  }

  /**
   * ModifiedFloatVariable::Update + CheckCondition — fires when float var
   * changes this frame (incl. first sample) AND compareFunc matches.
   */
  tickModifiedFloat(
    id: string,
    variableName: string,
    compareValue: number,
    compareFunc: unknown,
    floatVars: Map<string, number>
  ): boolean {
    if (!this.modifiedFloatStepped.has(id)) {
      this.modifiedFloatStepped.add(id)
      const newValue =
        variableName && floatVars.has(variableName) ? floatVars.get(variableName)! : 0
      let state = this.modifiedFloat.get(id)
      if (!state) {
        state = { value: newValue, initialized: true, changed: true }
        this.modifiedFloat.set(id, state)
      } else if (state.value !== newValue) {
        state.value = newValue
        state.changed = true
      } else {
        state.changed = false
      }
    }
    const state = this.modifiedFloat.get(id)
    if (!state?.changed) return false
    const eps = Number.EPSILON * 8
    const fn = String(compareFunc ?? 'equal')
      .replace(/^AGCF_/i, '')
      .toLowerCase()
    switch (fn) {
      case 'notequal':
        return Math.abs(state.value - compareValue) > eps
      case 'less':
        return state.value < compareValue
      case 'lessequal':
        return state.value <= compareValue
      case 'greater':
        return state.value > compareValue
      case 'greaterequal':
        return state.value >= compareValue
      case 'equal':
      default:
        return Math.abs(state.value - compareValue) <= eps
    }
  }
}

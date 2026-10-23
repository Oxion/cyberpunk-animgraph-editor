import { SimSmState } from "../../simTypes"

export class SimStateMachineRuntime {
  readonly smHandleId: string
  activeStateIndex = 0
  isInTransition = false
  transitionProgress = 0
  transitionDuration = 0
  firingTransitionIndex: number | null = null
  firingTransitionHandleId: string | null = null
  targetStateIndex: number | null = null
  lastFiredTransitionId: string | null = null
  eligibleTransitionIds: string[] = []
  instantChainLength = 0
  checkEntryConditions = true
  /**
   * Engine i_transitionsOneFrameDelay — skip CheckTransitions the frame a state
   * is entered when that state has preventTransitionsInActivationFrame.
   */
  transitionsOneFrameDelay = false
  /** State index whose Timed conditions were last reset (enter). */
  timedArmedStateIndex: number | null = null

  constructor(smHandleId: string, defaultStateIndex: number) {
    this.smHandleId = smHandleId
    this.activeStateIndex = defaultStateIndex
  }

  reset(defaultStateIndex: number): void {
    this.activeStateIndex = defaultStateIndex
    this.isInTransition = false
    this.transitionProgress = 0
    this.transitionDuration = 0
    this.firingTransitionIndex = null
    this.firingTransitionHandleId = null
    this.targetStateIndex = null
    this.lastFiredTransitionId = null
    this.eligibleTransitionIds = []
    this.instantChainLength = 0
    this.checkEntryConditions = true
    this.transitionsOneFrameDelay = false
    this.timedArmedStateIndex = null
  }

  toState(): SimSmState {
    return {
      smHandleId: this.smHandleId,
      activeStateIndex: this.activeStateIndex,
      isInTransition: this.isInTransition,
      transitionProgress: this.transitionProgress,
      transitionDuration: this.transitionDuration,
      firingTransitionIndex: this.firingTransitionIndex,
      firingTransitionHandleId: this.firingTransitionHandleId,
      targetStateIndex: this.targetStateIndex,
      eligibleTransitionIds: [...this.eligibleTransitionIds],
      lastFiredTransitionId: this.lastFiredTransitionId,
      instantChainLength: this.instantChainLength,
      checkEntryConditions: this.checkEntryConditions,
    }
  }
}
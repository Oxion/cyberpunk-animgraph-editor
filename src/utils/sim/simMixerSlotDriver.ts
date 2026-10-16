/**
 * Scene-system stand-in — preSample hook pushes MixerSlotParams each tick
 * (array clip times are driven externally in engine).
 */

import type { SimDriver, SimDriverAttachCtx } from './simDriver'
import type { SimGraphRunner } from './SimGraphRunner'
import type {
  MixerSlotIdleParams,
  SimMixerSlotAnimParams,
  SimPreSampleHook,
  SimServiceEvent,
} from './simServiceEvents'

export type DrivenMixerSlotEntry = SimMixerSlotAnimParams & {
  /** When true, driver advances currentTime by dt each frame. */
  autoAdvance?: boolean
  /** Cached duration for wrap (0 = unknown / no wrap). */
  duration?: number
}

export type SimMixerSlotParamsState = {
  cacheParams: boolean
  paramsActive: boolean
  enableInertiaBlend?: boolean
  normal: DrivenMixerSlotEntry[]
  additive: DrivenMixerSlotEntry[]
  override: DrivenMixerSlotEntry[]
}

function cloneEntry(e: DrivenMixerSlotEntry): DrivenMixerSlotEntry {
  return {
    animationName: e.animationName,
    previousTime: e.previousTime ?? 0,
    currentTime: e.currentTime ?? 0,
    loops: e.loops ?? 0,
    weight: e.weight ?? 1,
    bodyPartMask: e.bodyPartMask,
    convertToAdditive: e.convertToAdditive,
    extractTrajectoryForBlend: e.extractTrajectoryForBlend,
    useDynamicAnimSets: e.useDynamicAnimSets,
    muteAnimEvents: e.muteAnimEvents,
    autoAdvance: e.autoAdvance !== false,
    duration: e.duration ?? 0,
  }
}

function advanceEntry(e: DrivenMixerSlotEntry, dt: number): void {
  if (!e.autoAdvance) return
  const prev = e.currentTime ?? 0
  e.previousTime = prev
  let next = prev + dt
  const dur = e.duration ?? 0
  if (dur > 0) {
    e.loops = Math.floor(next / dur) - Math.floor(prev / dur)
    next = ((next % dur) + dur) % dur
  }
  e.currentTime = next
}

function toAnimParams(e: DrivenMixerSlotEntry): SimMixerSlotAnimParams {
  return {
    animationName: e.animationName,
    previousTime: e.previousTime,
    currentTime: e.currentTime,
    loops: e.loops,
    weight: e.weight,
    bodyPartMask: e.bodyPartMask,
    convertToAdditive: e.convertToAdditive,
    extractTrajectoryForBlend: e.extractTrajectoryForBlend,
    useDynamicAnimSets: e.useDynamicAnimSets,
    muteAnimEvents: e.muteAnimEvents,
  }
}

function emptyParamsEvent(): SimServiceEvent {
  return {
    kind: 'MixerSlotParams',
    normalAnimParamsList: [],
    additiveAnimParamsList: [],
    overrideAnimParamsList: [],
  }
}

export class SimMixerSlotDriver implements SimDriver {
  private readonly pending: SimServiceEvent[] = []
  private normals: DrivenMixerSlotEntry[] = []
  private additives: DrivenMixerSlotEntry[] = []
  private overrides: DrivenMixerSlotEntry[] = []
  private enableInertiaBlend = false
  private paramsActive = false
  private _cacheParams = false
  private paramsTouched = false
  private missFrames = 0
  private unsub: (() => void) | null = null

  readonly hook: SimPreSampleHook = (ctx) => {
    for (let i = 0; i < this.pending.length; i++) ctx.push(this.pending[i]!)
    this.pending.length = 0

    if (!this.paramsActive) {
      this.paramsTouched = false
      return
    }

    if (!this._cacheParams) {
      if (!this.paramsTouched) {
        this.missFrames++
        if (this.missFrames > 1) {
          this.normals = []
          this.additives = []
          this.overrides = []
          this.paramsActive = false
          this.missFrames = 0
          this.paramsTouched = false
          ctx.push(emptyParamsEvent())
          return
        }
      } else {
        this.missFrames = 0
      }
    }

    for (const e of this.normals) advanceEntry(e, ctx.dt)
    for (const e of this.additives) advanceEntry(e, ctx.dt)
    for (const e of this.overrides) advanceEntry(e, ctx.dt)
    ctx.push({
      kind: 'MixerSlotParams',
      enableInertiaBlend: this.enableInertiaBlend,
      normalAnimParamsList: this.normals.map(toAnimParams),
      additiveAnimParamsList: this.additives.map(toAnimParams),
      overrideAnimParamsList: this.overrides.map(toAnimParams),
    })
    this.enableInertiaBlend = false
    this.paramsTouched = false
  }

  get cacheParams(): boolean {
    return this._cacheParams
  }

  setCacheParams(cache: boolean): void {
    this._cacheParams = !!cache
    if (cache) this.missFrames = 0
  }

  setIdle(params: Omit<MixerSlotIdleParams, 'kind'> & { weight?: number }): void {
    this.pending.push({
      kind: 'MixerSlotIdleParams',
      isFacial: params.isFacial,
      blendWeight: params.blendWeight ?? params.weight ?? 1,
      firstWeight: params.firstWeight ?? 1,
      secondWeight: params.secondWeight ?? 1,
      firstAnimation: params.firstAnimation,
      secondAnimation: params.secondAnimation,
      firstAddAnimation: params.firstAddAnimation,
      secondAddAnimation: params.secondAddAnimation,
      muteAnimEvents: params.muteAnimEvents,
    })
  }

  setAddIdleWeight(weight: number): void {
    this.pending.push({ kind: 'MixerSlotAddIdleParams', weight })
  }

  setParams(params: {
    enableInertiaBlend?: boolean
    normal?: DrivenMixerSlotEntry[]
    additive?: DrivenMixerSlotEntry[]
    override?: DrivenMixerSlotEntry[]
  }): void {
    this.normals = (params.normal ?? []).map(cloneEntry)
    this.additives = (params.additive ?? []).map(cloneEntry)
    this.overrides = (params.override ?? []).map(cloneEntry)
    this.enableInertiaBlend = !!params.enableInertiaBlend
    this.paramsActive = true
    this.paramsTouched = true
    this.missFrames = 0
  }

  clearParams(): void {
    this.normals = []
    this.additives = []
    this.overrides = []
    this.paramsActive = false
    this.paramsTouched = false
    this.missFrames = 0
    this.pending.push(emptyParamsEvent())
  }

  clearIdle(): void {
    this.pending.push({
      kind: 'MixerSlotIdleParams',
      blendWeight: 0,
      firstWeight: 0,
      secondWeight: 0,
      firstAnimation: '',
      secondAnimation: '',
    })
  }

  getParams(): SimMixerSlotParamsState {
    return {
      cacheParams: this._cacheParams,
      paramsActive: this.paramsActive,
      enableInertiaBlend: this.enableInertiaBlend,
      normal: this.normals.map(cloneEntry),
      additive: this.additives.map(cloneEntry),
      override: this.overrides.map(cloneEntry),
    }
  }

  applyParams(state: SimMixerSlotParamsState): void {
    this._cacheParams = !!state.cacheParams
    if (this._cacheParams) this.missFrames = 0
    if (!state.paramsActive) {
      this.normals = []
      this.additives = []
      this.overrides = []
      this.paramsActive = false
      this.paramsTouched = false
      this.missFrames = 0
      this.pending.push(emptyParamsEvent())
      return
    }
    this.normals = (state.normal ?? []).map(cloneEntry)
    this.additives = (state.additive ?? []).map(cloneEntry)
    this.overrides = (state.override ?? []).map(cloneEntry)
    this.enableInertiaBlend = !!state.enableInertiaBlend
    this.paramsActive = true
    this.paramsTouched = true
    this.missFrames = 0
  }

  attach(ctx: SimDriverAttachCtx): void {
    if (!ctx.runner) return
    this.unsub = ctx.runner.addPreSampleHook(this.hook)
  }

  detach(): void {
    this.unsub?.()
    this.unsub = null
  }
}

export function createSimMixerSlotDriver(): SimMixerSlotDriver {
  return new SimMixerSlotDriver()
}

export type SimMixerSlotConsoleApi = {
  driver: SimMixerSlotDriver
  attach: (runner?: SimGraphRunner) => void
  detach: () => void
  setIdle: SimMixerSlotDriver['setIdle']
  setAddIdleWeight: SimMixerSlotDriver['setAddIdleWeight']
  setParams: SimMixerSlotDriver['setParams']
  clearParams: SimMixerSlotDriver['clearParams']
  clearIdle: SimMixerSlotDriver['clearIdle']
  setCacheParams: SimMixerSlotDriver['setCacheParams']
}

export type SimMixerSlotConsoleHost = {
  getDriver: () => SimMixerSlotDriver
  attach: (runner?: SimGraphRunner) => void
  detach: () => void
}

/**
 * Browser console:
 *   __simMixerSlot.attach()
 *   __simMixerSlot.setCacheParams(true) // sticky multi-frame play
 *   __simMixerSlot.setParams({ normal: [{ animationName: 'foo', weight: 1 }] })
 *   __simMixerSlot.setIdle({ firstAnimation: 'idle', firstWeight: 1, blendWeight: 1 })
 *   __simMixerSlot.clearParams()
 */
export function installSimMixerSlotConsole(
  host: SimMixerSlotConsoleHost
): SimMixerSlotConsoleApi {
  const api: SimMixerSlotConsoleApi = {
    get driver() {
      return host.getDriver()
    },
    attach(runner) {
      host.attach(runner)
      console.log('[__simMixerSlot] attached')
    },
    detach() {
      host.detach()
      console.log('[__simMixerSlot] detached')
    },
    setIdle: (p) => host.getDriver().setIdle(p),
    setAddIdleWeight: (w) => host.getDriver().setAddIdleWeight(w),
    setParams: (p) => host.getDriver().setParams(p),
    clearParams: () => host.getDriver().clearParams(),
    clearIdle: () => host.getDriver().clearIdle(),
    setCacheParams: (c) => host.getDriver().setCacheParams(c),
  }

  ;(globalThis as unknown as { __simMixerSlot: SimMixerSlotConsoleApi }).__simMixerSlot =
    api
  return api
}

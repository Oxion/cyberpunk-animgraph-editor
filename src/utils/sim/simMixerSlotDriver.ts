/**
 * Scene-system stand-in — preSample hook pushes MixerSlotParams each tick
 * (array clip times are driven externally in engine).
 */

import type {
  MixerSlotIdleParams,
  SimMixerSlotAnimParams,
  SimPreSampleHook,
  SimServiceEvent,
} from './simServiceEvents'
import type { SimGraphRunner } from './SimGraphRunner'

type DrivenEntry = SimMixerSlotAnimParams & {
  /** When true, driver advances currentTime by dt each frame. */
  autoAdvance?: boolean
  /** Cached duration for wrap (0 = unknown / no wrap). */
  duration?: number
}

export type SimMixerSlotDriver = {
  /** Discrete idle set (one-shot push). */
  setIdle: (
    params: Omit<MixerSlotIdleParams, 'kind'> & { weight?: number }
  ) => void
  setAddIdleWeight: (weight: number) => void
  /** Replace normal/additive/override lists; hook re-pushes every frame. */
  setParams: (params: {
    enableInertiaBlend?: boolean
    normal?: DrivenEntry[]
    additive?: DrivenEntry[]
    override?: DrivenEntry[]
  }) => void
  /** Clear array slots (empty MixerSlotParams). */
  clearParams: () => void
  clearIdle: () => void
  /**
   * Scene gatherer parity: when false, 1 frame without setParams → empty clear.
   * When true (scrubbing), sticky until clearParams.
   */
  setCacheParams: (cache: boolean) => void
  readonly cacheParams: boolean
  readonly hook: SimPreSampleHook
  attach: (runner: SimGraphRunner) => () => void
}

function cloneEntry(e: DrivenEntry): DrivenEntry {
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

function advanceEntry(e: DrivenEntry, dt: number): void {
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

function toAnimParams(e: DrivenEntry): SimMixerSlotAnimParams {
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

export function createSimMixerSlotDriver(): SimMixerSlotDriver {
  const pending: SimServiceEvent[] = []
  let normals: DrivenEntry[] = []
  let additives: DrivenEntry[] = []
  let overrides: DrivenEntry[] = []
  let enableInertiaBlend = false
  let paramsActive = false
  let cacheParams = false
  let paramsTouched = false
  let missFrames = 0

  const hook: SimPreSampleHook = (ctx) => {
    for (let i = 0; i < pending.length; i++) ctx.push(pending[i]!)
    pending.length = 0

    if (!paramsActive) {
      paramsTouched = false
      return
    }

    if (!cacheParams) {
      if (!paramsTouched) {
        missFrames++
        if (missFrames > 1) {
          normals = []
          additives = []
          overrides = []
          paramsActive = false
          missFrames = 0
          paramsTouched = false
          ctx.push(emptyParamsEvent())
          return
        }
      } else {
        missFrames = 0
      }
    }

    for (const e of normals) advanceEntry(e, ctx.dt)
    for (const e of additives) advanceEntry(e, ctx.dt)
    for (const e of overrides) advanceEntry(e, ctx.dt)
    ctx.push({
      kind: 'MixerSlotParams',
      enableInertiaBlend,
      normalAnimParamsList: normals.map(toAnimParams),
      additiveAnimParamsList: additives.map(toAnimParams),
      overrideAnimParamsList: overrides.map(toAnimParams),
    })
    enableInertiaBlend = false
    paramsTouched = false
  }

  return {
    hook,
    get cacheParams() {
      return cacheParams
    },
    setCacheParams(cache) {
      cacheParams = !!cache
      if (cache) missFrames = 0
    },
    setIdle(params) {
      pending.push({
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
    },
    setAddIdleWeight(weight) {
      pending.push({ kind: 'MixerSlotAddIdleParams', weight })
    },
    setParams(params) {
      normals = (params.normal ?? []).map(cloneEntry)
      additives = (params.additive ?? []).map(cloneEntry)
      overrides = (params.override ?? []).map(cloneEntry)
      enableInertiaBlend = !!params.enableInertiaBlend
      paramsActive = true
      paramsTouched = true
      missFrames = 0
    },
    clearParams() {
      normals = []
      additives = []
      overrides = []
      paramsActive = false
      paramsTouched = false
      missFrames = 0
      pending.push(emptyParamsEvent())
    },
    clearIdle() {
      pending.push({
        kind: 'MixerSlotIdleParams',
        blendWeight: 0,
        firstWeight: 0,
        secondWeight: 0,
        firstAnimation: '',
        secondAnimation: '',
      })
    },
    attach(runner) {
      return runner.addPreSampleHook(hook)
    },
  }
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

/**
 * Browser console:
 *   __simMixerSlot.attach()
 *   __simMixerSlot.setCacheParams(true) // sticky multi-frame play
 *   __simMixerSlot.setParams({ normal: [{ animationName: 'foo', weight: 1 }] })
 *   __simMixerSlot.setIdle({ firstAnimation: 'idle', firstWeight: 1, blendWeight: 1 })
 *   __simMixerSlot.clearParams()
 */
export function installSimMixerSlotConsole(
  getPrimaryRunner: () => SimGraphRunner | undefined | null
): SimMixerSlotConsoleApi {
  const driver = createSimMixerSlotDriver()
  let unsub: (() => void) | null = null

  const api: SimMixerSlotConsoleApi = {
    driver,
    attach(runner) {
      unsub?.()
      unsub = null
      const r = runner ?? getPrimaryRunner() ?? undefined
      if (!r) {
        console.warn('[__simMixerSlot] no runner — open/play a sim diagram first')
        return
      }
      unsub = driver.attach(r)
      console.log(`[__simMixerSlot] attached diagramId=${r.diagramId || '?'}`)
    },
    detach() {
      unsub?.()
      unsub = null
      console.log('[__simMixerSlot] detached')
    },
    setIdle: (p) => driver.setIdle(p),
    setAddIdleWeight: (w) => driver.setAddIdleWeight(w),
    setParams: (p) => driver.setParams(p),
    clearParams: () => driver.clearParams(),
    clearIdle: () => driver.clearIdle(),
    setCacheParams: (c) => driver.setCacheParams(c),
  }

  ;(globalThis as unknown as { __simMixerSlot: SimMixerSlotConsoleApi }).__simMixerSlot =
    api
  return api
}

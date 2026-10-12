/**
 * ent::LookAtController stand-in — lives outside SimGraphRunner as a preSample hook.
 * Pushes LookAtParams_* onto the runner service-event bus each tick.
 */

import type { SimVec4 } from './evalAnimMathExpressionVector'
import {
  defaultLookAtRequest,
  type SimLookAtRef,
  type SimLookAtRequest,
  type SimPreSampleHook,
  type SimServiceEvent,
} from './simServiceEvents'
import type { SimGraphRunner } from './SimGraphRunner'

type ActiveLookAt = {
  ref: SimLookAtRef
  targetWs: SimVec4
  request: SimLookAtRequest
}

export type SimLookAtDriver = {
  add: (
    part: string,
    targetWs: SimVec4,
    request?: Partial<SimLookAtRequest>
  ) => SimLookAtRef
  remove: (
    ref: SimLookAtRef,
    hasOutTransition?: boolean,
    outTransitionSpeed?: number
  ) => void
  setTarget: (ref: SimLookAtRef, targetWs: SimVec4) => void
  /** Register on a runner; returns unsubscribe. */
  attach: (runner: SimGraphRunner) => () => void
  readonly hook: SimPreSampleHook
}

export function createSimLookAtDriver(): SimLookAtDriver {
  let nextId = 0
  const active = new Map<string, ActiveLookAt>()
  const pending: SimServiceEvent[] = []

  const keyOf = (ref: SimLookAtRef) => `${ref.part}:${ref.id}`

  const hook: SimPreSampleHook = (ctx) => {
    for (let i = 0; i < pending.length; i++) ctx.push(pending[i]!)
    pending.length = 0
    if (active.size === 0) return
    const infos: Array<{ ref: SimLookAtRef; targetWs: SimVec4 }> = []
    for (const a of active.values()) {
      infos.push({ ref: a.ref, targetWs: a.targetWs })
    }
    ctx.push({ kind: 'LookAtParams_UpdatePositions', infos })
  }

  return {
    hook,
    add(part, targetWs, request) {
      const id = ++nextId
      const ref: SimLookAtRef = { id, part }
      const req = defaultLookAtRequest(request)
      active.set(keyOf(ref), {
        ref,
        targetWs: {
          x: targetWs.x,
          y: targetWs.y,
          z: targetWs.z,
          w: targetWs.w ?? 0,
        },
        request: req,
      })
      pending.push({ kind: 'LookAtParams_Add', ref, request: req })
      return ref
    },
    remove(ref, hasOutTransition = false, outTransitionSpeed = 1) {
      active.delete(keyOf(ref))
      pending.push({
        kind: 'LookAtParams_Remove',
        ref,
        hasOutTransition,
        outTransitionSpeed,
      })
    },
    setTarget(ref, targetWs) {
      const a = active.get(keyOf(ref))
      if (!a) return
      a.targetWs = {
        x: targetWs.x,
        y: targetWs.y,
        z: targetWs.z,
        w: targetWs.w ?? 0,
      }
    },
    attach(runner) {
      return runner.addPreSampleHook(hook)
    },
  }
}

export type SimLookAtConsoleApi = {
  driver: SimLookAtDriver
  /** Attach to runner (or primary from host). */
  attach: (runner?: SimGraphRunner) => void
  detach: () => void
  add: SimLookAtDriver['add']
  remove: SimLookAtDriver['remove']
  setTarget: SimLookAtDriver['setTarget']
  /** Push LookAtVehicleRestrictionParams onto attached runner. */
  setVehicleRestrictions: (params: {
    maxYawDegrees: number
    centerYawThresholdDegrees: number
    maxUpDegrees: number
    maxDownDegrees: number
    maxRotationSpeed: number
  }) => void
}

/**
 * Expose `__simLookAt` on globalThis for browser console tests.
 *
 *   __simLookAt.attach()
 *   const r = __simLookAt.add('Eyes', { x: 0, y: 2, z: 1, w: 0 })
 *   __simLookAt.setTarget(r, { x: 1, y: 2, z: 0, w: 0 })
 *   __simLookAt.remove(r)
 */
export function installSimLookAtConsole(
  getPrimaryRunner: () => SimGraphRunner | undefined | null
): SimLookAtConsoleApi {
  const driver = createSimLookAtDriver()
  let unsub: (() => void) | null = null
  let attached: SimGraphRunner | null = null

  const api: SimLookAtConsoleApi = {
    driver,
    attach(runner) {
      unsub?.()
      unsub = null
      attached = null
      const r = runner ?? getPrimaryRunner() ?? undefined
      if (!r) {
        console.warn('[__simLookAt] no runner — open/play a sim diagram first')
        return
      }
      unsub = driver.attach(r)
      attached = r
      console.log(`[__simLookAt] attached diagramId=${r.diagramId || '?'}`)
    },
    detach() {
      unsub?.()
      unsub = null
      attached = null
      console.log('[__simLookAt] detached')
    },
    add: (part, targetWs, request) => driver.add(part, targetWs, request),
    remove: (ref, hasOutTransition, outTransitionSpeed) =>
      driver.remove(ref, hasOutTransition, outTransitionSpeed),
    setTarget: (ref, targetWs) => driver.setTarget(ref, targetWs),
    setVehicleRestrictions(params) {
      const r = attached ?? getPrimaryRunner() ?? undefined
      if (!r) {
        console.warn('[__simLookAt] no runner for setVehicleRestrictions')
        return
      }
      r.pushServiceEvent({ kind: 'LookAtVehicleRestrictionParams', ...params })
    },
  }

  ;(globalThis as unknown as { __simLookAt: SimLookAtConsoleApi }).__simLookAt =
    api
  return api
}

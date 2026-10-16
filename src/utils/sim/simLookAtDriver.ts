/**
 * ent::LookAtController stand-in — lives outside SimGraphRunner as a preSample hook.
 * Pushes LookAtParams_* onto the runner service-event bus each tick.
 *
 * Identity is numeric `id`. `part` is immutable after add; wire events still carry SimLookAtRef.
 */

import type { SimVec4 } from './evalAnimMathExpressionVector'
import type { SimDriver, SimDriverAttachCtx } from './simDriver'
import type { SimGraphRunner } from './SimGraphRunner'
import {
  defaultLookAtRequest,
  type SimLookAtRef,
  type SimLookAtRequest,
  type SimPreSampleHook,
  type SimServiceEvent,
} from './simServiceEvents'

type ActiveLookAt = {
  id: number
  part: string
  targetWs: SimVec4
  request: SimLookAtRequest
}

export type SimLookAtActiveEntry = {
  id: number
  part: string
  targetWs: SimVec4
  request: SimLookAtRequest
}

function toWireRef(entry: { id: number; part: string }): SimLookAtRef {
  return { id: entry.id, part: entry.part }
}

function copyTarget(targetWs: SimVec4): SimVec4 {
  return {
    x: targetWs.x,
    y: targetWs.y,
    z: targetWs.z,
    w: targetWs.w ?? 0,
  }
}

export function normalizeLookAtActiveEntry(
  raw: unknown
): SimLookAtActiveEntry | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (typeof o.id !== 'number' || typeof o.part !== 'string') return null
  const tw = o.targetWs
  if (!tw || typeof tw !== 'object') return null
  const t = tw as Record<string, unknown>
  if (
    typeof t.x !== 'number' ||
    typeof t.y !== 'number' ||
    typeof t.z !== 'number'
  ) {
    return null
  }
  return {
    id: o.id,
    part: o.part,
    targetWs: {
      x: t.x,
      y: t.y,
      z: t.z,
      w: typeof t.w === 'number' ? t.w : 0,
    },
    request: defaultLookAtRequest(
      o.request && typeof o.request === 'object'
        ? (o.request as Partial<SimLookAtRequest>)
        : undefined
    ),
  }
}

export class SimLookAtDriver implements SimDriver {
  private _nextId = 0
  private readonly _active = new Map<number, ActiveLookAt>()
  private readonly _pending: SimServiceEvent[] = []
  private unsub: (() => void) | null = null

  readonly hook: SimPreSampleHook = (ctx) => {
    for (let i = 0; i < this._pending.length; i++) ctx.push(this._pending[i]!)
    this._pending.length = 0
    if (this._active.size === 0) return
    const infos: Array<{ ref: SimLookAtRef; targetWs: SimVec4 }> = []
    for (const a of this._active.values()) {
      infos.push({ ref: toWireRef(a), targetWs: a.targetWs })
    }
    ctx.push({ kind: 'LookAtParams_UpdatePositions', infos })
  }

  add(
    part: string,
    targetWs: SimVec4,
    request?: Partial<SimLookAtRequest>
  ): number {
    const id = ++this._nextId
    const req = defaultLookAtRequest(request)
    const entry: ActiveLookAt = {
      id,
      part,
      targetWs: copyTarget(targetWs),
      request: req,
    }
    this._active.set(id, entry)
    this._pending.push({
      kind: 'LookAtParams_Add',
      ref: toWireRef(entry),
      request: req,
    })
    return id
  }

  remove(id: number, hasOutTransition = false, outTransitionSpeed = 1): void {
    const a = this._active.get(id)
    if (!a) return
    this._active.delete(id)
    this._pending.push({
      kind: 'LookAtParams_Remove',
      ref: toWireRef(a),
      hasOutTransition,
      outTransitionSpeed,
    })
  }

  setTarget(id: number, targetWs: SimVec4): void {
    const a = this._active.get(id)
    if (!a) return
    a.targetWs = copyTarget(targetWs)
  }

  listActive(): SimLookAtActiveEntry[] {
    const out: SimLookAtActiveEntry[] = []
    for (const a of this._active.values()) {
      out.push({
        id: a.id,
        part: a.part,
        targetWs: copyTarget(a.targetWs),
        request: { ...a.request },
      })
    }
    out.sort((a, b) => a.id - b.id)
    return out
  }

  clear(): void {
    for (const a of this._active.values()) {
      this._pending.push({
        kind: 'LookAtParams_Remove',
        ref: toWireRef(a),
        hasOutTransition: false,
        outTransitionSpeed: 1,
      })
    }
    this._active.clear()
  }

  applyActive(entries: readonly unknown[]): void {
    for (const a of this._active.values()) {
      this._pending.push({
        kind: 'LookAtParams_Remove',
        ref: toWireRef(a),
        hasOutTransition: false,
        outTransitionSpeed: 1,
      })
    }
    this._active.clear()
    let maxId = 0
    for (const raw of entries) {
      const e = normalizeLookAtActiveEntry(raw)
      if (!e) continue
      if (e.id > maxId) maxId = e.id
      const req = defaultLookAtRequest(e.request)
      const entry: ActiveLookAt = {
        id: e.id,
        part: e.part,
        targetWs: copyTarget(e.targetWs),
        request: req,
      }
      this._active.set(e.id, entry)
      this._pending.push({
        kind: 'LookAtParams_Add',
        ref: toWireRef(entry),
        request: req,
      })
    }
    this._nextId = Math.max(this._nextId, maxId)
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

export type SimLookAtConsoleApi = {
  driver: SimLookAtDriver
  attach: (runner?: SimGraphRunner) => void
  detach: () => void
  add: SimLookAtDriver['add']
  remove: SimLookAtDriver['remove']
  setTarget: SimLookAtDriver['setTarget']
  setVehicleRestrictions: (params: {
    maxYawDegrees: number
    centerYawThresholdDegrees: number
    maxUpDegrees: number
    maxDownDegrees: number
    maxRotationSpeed: number
  }) => void
}

export type SimLookAtConsoleHost = {
  getDriver: () => SimLookAtDriver
  attach: (runner?: SimGraphRunner) => void
  detach: () => void
  getAttachedRunner: () => SimGraphRunner | null
  getPrimaryRunner: () => SimGraphRunner | undefined | null
}

/**
 * Expose `__simLookAt` on globalThis for browser console tests.
 *
 *   __simLookAt.attach()
 *   const id = __simLookAt.add('Eyes', { x: 0, y: 2, z: 1, w: 0 })
 *   __simLookAt.setTarget(id, { x: 1, y: 2, z: 0, w: 0 })
 *   __simLookAt.remove(id)
 */
export function installSimLookAtConsole(host: SimLookAtConsoleHost): SimLookAtConsoleApi {
  const api: SimLookAtConsoleApi = {
    get driver() {
      return host.getDriver()
    },
    attach(runner) {
      host.attach(runner)
      const r = host.getAttachedRunner() ?? host.getPrimaryRunner() ?? undefined
      if (r) console.log(`[__simLookAt] attached diagramId=${r.diagramId || '?'}`)
    },
    detach() {
      host.detach()
      console.log('[__simLookAt] detached')
    },
    add: (part, targetWs, request) => host.getDriver().add(part, targetWs, request),
    remove: (id, hasOutTransition, outTransitionSpeed) =>
      host.getDriver().remove(id, hasOutTransition, outTransitionSpeed),
    setTarget: (id, targetWs) => host.getDriver().setTarget(id, targetWs),
    setVehicleRestrictions(params) {
      const r = host.getAttachedRunner() ?? host.getPrimaryRunner() ?? undefined
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

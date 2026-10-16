/**
 * Workspot system stand-in — writes AnimFeature UpdateWorkspot via SimAnimFeatureApi
 * (engine ApplyFeature sets isAnimValid / slotNameHash / bumps updateCounter).
 */

import { calcSlotNameHash } from '../cnameHash'
import type { SimAnimFeatureApi } from './simAnimFeatureApi'
import type { SimDriver, SimDriverAttachCtx } from './simDriver'
import {
  UPDATE_WORKSPOT_FEATURE as GROUP,
  UpdateWorkspotProp as P,
  WORKSPOT_SLOT_NAME,
} from './workspotHubKeys'

export type WorkspotHubPlayParams = {
  animName: string
  /** WorkspotTree::m_animGraphSlotName; default WORKSPOT. */
  slotName?: string
  recordID?: number
  isLooped?: boolean
  isPaused?: boolean
  isExitAnim?: boolean
  enableMotion?: boolean
  animBlendTime?: number
  forcedBlendIn?: number
  forceAnimTime?: number
  timeScale?: number
  animationStartTime?: number
  facialKeyWeight?: number
  globalBlendDuration?: number
  globalBlendIn?: boolean
  facialIdleAnimation?: string
  facialIdleKeyAnimation?: string
  isActive?: boolean
  /** When false, skip updateCounter bump (rare). Default true. */
  bump?: boolean
}

/** Persistable play snapshot (board is not in project JSON). */
export type WorkspotHubSnapshot = WorkspotHubPlayParams & {
  /** When false, restore as stopped/cleared. Default true if animName set. */
  hasAnim?: boolean
}

function nextCounter(api: SimAnimFeatureApi): number {
  const cur = api.getFeature(GROUP, P.updateCounter)
  const n = typeof cur === 'number' && Number.isFinite(cur) ? cur : 0
  return (Math.round(n) + 1) | 0
}

function applySlot(api: SimAnimFeatureApi, slotName: string): void {
  api.setFeature(GROUP, P.slotNameHash, calcSlotNameHash(slotName))
}

function bumpCounter(api: SimAnimFeatureApi): void {
  api.setFeature(GROUP, P.updateCounter, nextCounter(api))
}

function writePlayFields(
  api: SimAnimFeatureApi,
  params: WorkspotHubPlayParams,
  slot: string,
  anim: string
): void {
  api.setBoolFeature(GROUP, P.isActive, true)
  api.setBoolFeature(GROUP, P.isAnimValid, !!anim && anim !== 'None')
  applySlot(api, slot)
  if (params.recordID !== undefined) api.setFeature(GROUP, P.recordID, params.recordID)
  if (params.isLooped !== undefined) {
    api.setBoolFeature(GROUP, P.isLooped, !!params.isLooped)
  }
  if (params.isPaused !== undefined) {
    api.setBoolFeature(GROUP, P.isPaused, !!params.isPaused)
  }
  if (params.isExitAnim !== undefined) {
    api.setBoolFeature(GROUP, P.isExitAnim, !!params.isExitAnim)
  }
  if (params.enableMotion !== undefined) {
    api.setBoolFeature(GROUP, P.enableMotion, !!params.enableMotion)
  }
  if (params.animBlendTime !== undefined) {
    api.setFeature(GROUP, P.animBlendTime, params.animBlendTime)
  }
  if (params.forcedBlendIn !== undefined) {
    api.setFeature(GROUP, P.forcedBlendIn, params.forcedBlendIn)
  }
  if (params.forceAnimTime !== undefined) {
    api.setFeature(GROUP, P.forceAnimTime, params.forceAnimTime)
  }
  if (params.timeScale !== undefined) api.setFeature(GROUP, P.timeScale, params.timeScale)
  if (params.animationStartTime !== undefined) {
    api.setFeature(GROUP, P.animationStartTime, params.animationStartTime)
  }
  if (params.facialKeyWeight !== undefined) {
    api.setFeature(GROUP, P.facialKeyWeight, params.facialKeyWeight)
  }
  if (params.globalBlendDuration !== undefined) {
    api.setFeature(GROUP, P.globalBlendDuration, params.globalBlendDuration)
  }
  if (params.globalBlendIn !== undefined) {
    api.setBoolFeature(GROUP, P.globalBlendIn, !!params.globalBlendIn)
  }
  if (params.facialIdleAnimation !== undefined) {
    api.setStringFeature(GROUP, P.facialIdleAnimation, params.facialIdleAnimation)
  }
  if (params.facialIdleKeyAnimation !== undefined) {
    api.setStringFeature(GROUP, P.facialIdleKeyAnimation, params.facialIdleKeyAnimation)
  }
  if (params.bump !== false) bumpCounter(api)
  api.setStringFeature(GROUP, P.animName, anim)
}

export class SimWorkspotHubDriver implements SimDriver {
  private last: WorkspotHubSnapshot | null = null

  constructor(
    private readonly getApi: () => SimAnimFeatureApi | null | undefined
  ) {}

  attach(_ctx: SimDriverAttachCtx): void {}

  detach(): void {}

  private requireApi(): SimAnimFeatureApi | null {
    const api = this.getApi()
    if (!api) {
      console.warn('[__simWorkspotHub] no animFeatureApi')
      return null
    }
    return api
  }

  private mergeLast(
    patch: Partial<WorkspotHubPlayParams>,
    hasAnim?: boolean
  ): void {
    this.last = {
      ...(this.last ?? { animName: '' }),
      ...patch,
      hasAnim: hasAnim ?? this.last?.hasAnim ?? !!patch.animName,
    }
  }

  play(params: WorkspotHubPlayParams): void {
    const api = this.requireApi()
    if (!api) return
    const slot = params.slotName?.trim() || WORKSPOT_SLOT_NAME
    const anim = params.animName ?? ''
    api.withBatch(() => writePlayFields(api, params, slot, anim))
    this.mergeLast(
      { ...params, slotName: slot, animName: anim, isActive: true },
      !!anim && anim !== 'None'
    )
    console.log(
      `[__simWorkspotHub] play animName=${anim} slot=${slot} hash=${calcSlotNameHash(slot)}`
    )
  }

  set(params: Partial<WorkspotHubPlayParams> & { bump?: boolean }): void {
    const api = this.requireApi()
    if (!api) return
    api.withBatch(() => {
      if (params.slotName !== undefined) {
        applySlot(api, params.slotName.trim() || WORKSPOT_SLOT_NAME)
      }
      if (params.recordID !== undefined) {
        api.setFeature(GROUP, P.recordID, params.recordID)
      }
      if (params.isLooped !== undefined) {
        api.setBoolFeature(GROUP, P.isLooped, !!params.isLooped)
      }
      if (params.isPaused !== undefined) {
        api.setBoolFeature(GROUP, P.isPaused, !!params.isPaused)
      }
      if (params.isExitAnim !== undefined) {
        api.setBoolFeature(GROUP, P.isExitAnim, !!params.isExitAnim)
      }
      if (params.enableMotion !== undefined) {
        api.setBoolFeature(GROUP, P.enableMotion, !!params.enableMotion)
      }
      if (params.isActive !== undefined) {
        api.setBoolFeature(GROUP, P.isActive, !!params.isActive)
      }
      if (params.animBlendTime !== undefined) {
        api.setFeature(GROUP, P.animBlendTime, params.animBlendTime)
      }
      if (params.forcedBlendIn !== undefined) {
        api.setFeature(GROUP, P.forcedBlendIn, params.forcedBlendIn)
      }
      if (params.forceAnimTime !== undefined) {
        api.setFeature(GROUP, P.forceAnimTime, params.forceAnimTime)
      }
      if (params.timeScale !== undefined) {
        api.setFeature(GROUP, P.timeScale, params.timeScale)
      }
      if (params.animationStartTime !== undefined) {
        api.setFeature(GROUP, P.animationStartTime, params.animationStartTime)
      }
      if (params.facialKeyWeight !== undefined) {
        api.setFeature(GROUP, P.facialKeyWeight, params.facialKeyWeight)
      }
      if (params.globalBlendDuration !== undefined) {
        api.setFeature(GROUP, P.globalBlendDuration, params.globalBlendDuration)
      }
      if (params.globalBlendIn !== undefined) {
        api.setBoolFeature(GROUP, P.globalBlendIn, !!params.globalBlendIn)
      }
      if (params.facialIdleAnimation !== undefined) {
        api.setStringFeature(GROUP, P.facialIdleAnimation, params.facialIdleAnimation)
      }
      if (params.facialIdleKeyAnimation !== undefined) {
        api.setStringFeature(
          GROUP,
          P.facialIdleKeyAnimation,
          params.facialIdleKeyAnimation
        )
      }
      if (params.animName !== undefined) {
        const anim = params.animName
        api.setBoolFeature(GROUP, P.isAnimValid, !!anim && anim !== 'None')
        api.setStringFeature(GROUP, P.animName, anim)
      }
      if (params.bump !== false) bumpCounter(api)
    })
    const { bump: _b, ...rest } = params
    if (params.animName !== undefined) {
      this.mergeLast(rest, !!params.animName && params.animName !== 'None')
    } else {
      this.mergeLast(rest)
    }
  }

  clear(): void {
    const api = this.requireApi()
    if (!api) return
    api.withBatch(() => {
      api.setStringFeature(GROUP, P.animName, '')
      api.setBoolFeature(GROUP, P.isAnimValid, false)
      bumpCounter(api)
    })
    this.mergeLast({ animName: '' }, false)
    console.log('[__simWorkspotHub] clear')
  }

  stop(): void {
    const api = this.requireApi()
    if (!api) return
    api.withBatch(() => {
      api.setBoolFeature(GROUP, P.isActive, false)
      api.setStringFeature(GROUP, P.animName, '')
      api.setBoolFeature(GROUP, P.isAnimValid, false)
      bumpCounter(api)
    })
    this.mergeLast({ animName: '', isActive: false }, false)
    console.log('[__simWorkspotHub] stop')
  }

  bump(): void {
    const api = this.requireApi()
    if (!api) return
    api.withBatch(() => bumpCounter(api))
  }

  counter(): number {
    const api = this.getApi()
    const cur = api?.getFeature(GROUP, P.updateCounter)
    return typeof cur === 'number' && Number.isFinite(cur) ? Math.round(cur) : 0
  }

  /** Driver-session active flag (board seeds isActive=true; badge must not follow that). */
  isActive(): boolean {
    return this.last?.isActive === true
  }

  hash(slotName?: string): number {
    return calcSlotNameHash(slotName?.trim() || WORKSPOT_SLOT_NAME)
  }

  getSnapshot(): WorkspotHubSnapshot | null {
    if (!this.last) return null
    return { ...this.last }
  }

  applySnapshot(snap: WorkspotHubSnapshot | null | undefined): void {
    if (!snap || snap.hasAnim === false || !snap.animName) {
      const api = this.requireApi()
      if (!api) {
        this.last = snap ? { ...snap, hasAnim: false } : null
        return
      }
      api.withBatch(() => {
        api.setBoolFeature(GROUP, P.isActive, false)
        api.setStringFeature(GROUP, P.animName, '')
        api.setBoolFeature(GROUP, P.isAnimValid, false)
        bumpCounter(api)
      })
      this.last = snap ? { ...snap, animName: '', hasAnim: false } : null
      return
    }
    const { hasAnim: _h, bump: _b, ...play } = snap
    const api = this.requireApi()
    if (!api) {
      this.last = { ...snap }
      return
    }
    const slot = play.slotName?.trim() || WORKSPOT_SLOT_NAME
    const anim = play.animName ?? ''
    api.withBatch(() => writePlayFields(api, play, slot, anim))
    this.last = { ...play, slotName: slot, animName: anim, hasAnim: true }
  }
}

export function createSimWorkspotHubDriver(
  getApi: () => SimAnimFeatureApi | null | undefined
): SimWorkspotHubDriver {
  return new SimWorkspotHubDriver(getApi)
}

export type SimWorkspotHubConsoleApi = {
  driver: SimWorkspotHubDriver
  play: SimWorkspotHubDriver['play']
  set: SimWorkspotHubDriver['set']
  clear: SimWorkspotHubDriver['clear']
  stop: SimWorkspotHubDriver['stop']
  bump: SimWorkspotHubDriver['bump']
  counter: SimWorkspotHubDriver['counter']
  hash: SimWorkspotHubDriver['hash']
  playWorkspot: (animName: string, opts?: Omit<WorkspotHubPlayParams, 'animName'>) => void
}

export type SimWorkspotHubConsoleHost = {
  getDriver: () => SimWorkspotHubDriver
}

/**
 * Browser console:
 *   __simWorkspotHub.play({ animName: 'foo', isLooped: true })
 */
export function installSimWorkspotHubConsole(
  host: SimWorkspotHubConsoleHost
): SimWorkspotHubConsoleApi {
  const api: SimWorkspotHubConsoleApi = {
    get driver() {
      return host.getDriver()
    },
    play: (p) => host.getDriver().play(p),
    set: (p) => host.getDriver().set(p),
    clear: () => host.getDriver().clear(),
    stop: () => host.getDriver().stop(),
    bump: () => host.getDriver().bump(),
    counter: () => host.getDriver().counter(),
    hash: (s) => host.getDriver().hash(s),
    playWorkspot(animName, opts) {
      host.getDriver().play({ animName, slotName: WORKSPOT_SLOT_NAME, ...opts })
    },
  }
  ;(globalThis as unknown as { __simWorkspotHub: SimWorkspotHubConsoleApi }).__simWorkspotHub =
    api
  return api
}

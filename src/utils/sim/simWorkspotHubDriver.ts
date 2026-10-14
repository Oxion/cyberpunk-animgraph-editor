/**
 * Workspot system stand-in — writes AnimFeature UpdateWorkspot via SimAnimFeatureApi
 * (engine ApplyFeature sets isAnimValid / slotNameHash / bumps updateCounter).
 */

import { calcSlotNameHash } from '../cnameHash'
import type { SimAnimFeatureApi } from './simAnimFeatureApi'
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

export type SimWorkspotHubDriver = {
  play: (params: WorkspotHubPlayParams) => void
  /** Partial field update; bumps updateCounter by default. */
  set: (params: Partial<WorkspotHubPlayParams> & { bump?: boolean }) => void
  /** Clear anim (isAnimValid=false, animName empty); bumps counter. */
  clear: () => void
  /** isActive=false + clear. */
  stop: () => void
  bump: () => void
  /** Read current updateCounter from board (via getFeature). */
  counter: () => number
  hash: (slotName?: string) => number
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

export function createSimWorkspotHubDriver(
  getApi: () => SimAnimFeatureApi | null | undefined
): SimWorkspotHubDriver {
  const requireApi = (): SimAnimFeatureApi | null => {
    const api = getApi()
    if (!api) {
      console.warn('[__simWorkspotHub] no animFeatureApi')
      return null
    }
    return api
  }

  return {
    play(params) {
      const api = requireApi()
      if (!api) return
      const slot = params.slotName?.trim() || WORKSPOT_SLOT_NAME
      const anim = params.animName ?? ''
      api.withBatch(() => writePlayFields(api, params, slot, anim))
      console.log(
        `[__simWorkspotHub] play animName=${anim} slot=${slot} hash=${calcSlotNameHash(slot)}`
      )
    },
    set(params) {
      const api = requireApi()
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
    },
    clear() {
      const api = requireApi()
      if (!api) return
      api.withBatch(() => {
        api.setStringFeature(GROUP, P.animName, '')
        api.setBoolFeature(GROUP, P.isAnimValid, false)
        bumpCounter(api)
      })
      console.log('[__simWorkspotHub] clear')
    },
    stop() {
      const api = requireApi()
      if (!api) return
      api.withBatch(() => {
        api.setBoolFeature(GROUP, P.isActive, false)
        api.setStringFeature(GROUP, P.animName, '')
        api.setBoolFeature(GROUP, P.isAnimValid, false)
        bumpCounter(api)
      })
      console.log('[__simWorkspotHub] stop')
    },
    bump() {
      const api = requireApi()
      if (!api) return
      api.withBatch(() => bumpCounter(api))
    },
    counter() {
      const api = getApi()
      const cur = api?.getFeature(GROUP, P.updateCounter)
      return typeof cur === 'number' && Number.isFinite(cur) ? Math.round(cur) : 0
    },
    hash(slotName) {
      return calcSlotNameHash(slotName?.trim() || WORKSPOT_SLOT_NAME)
    },
  }
}

export type SimWorkspotHubConsoleApi = SimWorkspotHubDriver & {
  driver: SimWorkspotHubDriver
  playWorkspot: (animName: string, opts?: Omit<WorkspotHubPlayParams, 'animName'>) => void
}

/**
 * Browser console:
 *   __simWorkspotHub.play({ animName: 'foo', isLooped: true })
 */
export function installSimWorkspotHubConsole(
  driver: SimWorkspotHubDriver
): SimWorkspotHubConsoleApi {
  const api: SimWorkspotHubConsoleApi = {
    driver,
    play: (p) => driver.play(p),
    set: (p) => driver.set(p),
    clear: () => driver.clear(),
    stop: () => driver.stop(),
    bump: () => driver.bump(),
    counter: () => driver.counter(),
    hash: (s) => driver.hash(s),
    playWorkspot(animName, opts) {
      driver.play({ animName, slotName: WORKSPOT_SLOT_NAME, ...opts })
    },
  }
  ;(globalThis as unknown as { __simWorkspotHub: SimWorkspotHubConsoleApi }).__simWorkspotHub =
    api
  return api
}

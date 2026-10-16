import { computed, reactive, type Ref } from 'vue'
import type { SimDriverHandle } from '../../utils/sim/simDriver'
import type {
  DrivenMixerSlotEntry,
  SimMixerSlotDriver,
} from '../../utils/sim/simMixerSlotDriver'
export type MixerSlotDrafts = {
  cacheParams: boolean
  enableInertiaBlend: boolean
  normalAnim: string
  normalWeight: number
  idleFirst: string
  idleBlendWeight: number
}

export function useSimMixerSlotDriverUi(
  handle: Ref<SimDriverHandle<SimMixerSlotDriver> | null | undefined>
) {
  const drafts = reactive<MixerSlotDrafts>({
    cacheParams: true,
    enableInertiaBlend: false,
    normalAnim: '',
    normalWeight: 1,
    idleFirst: '',
    idleBlendWeight: 1,
  })

  const params = computed(() => {
    void handle.value?.rev.value
    return (
      handle.value?.driver.getParams() ?? {
        cacheParams: false,
        paramsActive: false,
        normal: [] as DrivenMixerSlotEntry[],
        additive: [] as DrivenMixerSlotEntry[],
        override: [] as DrivenMixerSlotEntry[],
      }
    )
  })

  const touch = () => handle.value?.touch()

  const applyNormalFromDrafts = () => {
    const h = handle.value
    if (!h) return
    const name = drafts.normalAnim.trim()
    h.driver.setCacheParams(drafts.cacheParams)
    if (!name) {
      h.driver.clearParams()
      touch()
      return
    }
    h.driver.setParams({
      enableInertiaBlend: drafts.enableInertiaBlend,
      normal: [
        {
          animationName: name,
          weight: drafts.normalWeight,
          currentTime: 0,
          previousTime: 0,
        },
      ],
    })
    touch()
  }

  const setCacheParams = (cache: boolean) => {
    drafts.cacheParams = cache
    handle.value?.driver.setCacheParams(cache)
    touch()
  }

  const setIdleFromDrafts = () => {
    const h = handle.value
    if (!h) return
    h.driver.setIdle({
      firstAnimation: drafts.idleFirst,
      firstWeight: 1,
      blendWeight: drafts.idleBlendWeight,
    })
    touch()
  }

  const clearParams = () => {
    handle.value?.driver.clearParams()
    touch()
  }

  const clearIdle = () => {
    handle.value?.driver.clearIdle()
    touch()
  }

  const syncFromDriver = () => {
    const p = params.value
    drafts.cacheParams = p.cacheParams
    drafts.enableInertiaBlend = !!p.enableInertiaBlend
    const n0 = p.normal[0]
    if (n0) {
      drafts.normalAnim = n0.animationName ?? ''
      drafts.normalWeight = n0.weight ?? 1
    }
  }

  return {
    drafts,
    params,
    applyNormalFromDrafts,
    setCacheParams,
    setIdleFromDrafts,
    clearParams,
    clearIdle,
    syncFromDriver,
  }
}

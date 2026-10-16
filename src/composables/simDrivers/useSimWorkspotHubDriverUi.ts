import { computed, reactive, type Ref } from 'vue'
import type { SimDriverHandle } from '../../utils/sim/simDriver'
import type { SimWorkspotHubDriver } from '../../utils/sim/simWorkspotHubDriver'
import { WORKSPOT_SLOT_NAME } from '../../utils/sim/workspotHubKeys'
import { simSnapshot } from '../../stores/animgraphSim'

export type WorkspotHubDrafts = {
  animName: string
  slotName: string
  isLooped: boolean
  isPaused: boolean
  enableMotion: boolean
  timeScale: number
}

export function useSimWorkspotHubDriverUi(
  handle: Ref<SimDriverHandle<SimWorkspotHubDriver> | null | undefined>
) {
  const drafts = reactive<WorkspotHubDrafts>({
    animName: '',
    slotName: WORKSPOT_SLOT_NAME,
    isLooped: true,
    isPaused: false,
    enableMotion: true,
    timeScale: 1,
  })

  const snapshot = computed(() => {
    void handle.value?.rev.value
    void simSnapshot.value
    return handle.value?.driver.getSnapshot() ?? null
  })

  const counter = computed(() => {
    void handle.value?.rev.value
    void simSnapshot.value
    return handle.value?.driver.counter() ?? 0
  })

  const isActive = computed(() => {
    void handle.value?.rev.value
    void simSnapshot.value
    return handle.value?.driver.isActive() ?? false
  })

  const touch = () => handle.value?.touch()

  const playFromDrafts = () => {
    const h = handle.value
    if (!h) return
    h.driver.play({
      animName: drafts.animName,
      slotName: drafts.slotName || WORKSPOT_SLOT_NAME,
      isLooped: drafts.isLooped,
      isPaused: drafts.isPaused,
      enableMotion: drafts.enableMotion,
      timeScale: drafts.timeScale,
    })
    touch()
  }

  const clear = () => {
    handle.value?.driver.clear()
    touch()
  }

  const stop = () => {
    handle.value?.driver.stop()
    touch()
  }

  const syncFromDriver = () => {
    const s = snapshot.value
    if (!s) return
    drafts.animName = s.animName ?? ''
    drafts.slotName = s.slotName ?? WORKSPOT_SLOT_NAME
    drafts.isLooped = !!s.isLooped
    drafts.isPaused = !!s.isPaused
    drafts.enableMotion = s.enableMotion !== false
    drafts.timeScale = s.timeScale ?? 1
  }

  return {
    drafts,
    snapshot,
    counter,
    isActive,
    playFromDrafts,
    clear,
    stop,
    syncFromDriver,
  }
}

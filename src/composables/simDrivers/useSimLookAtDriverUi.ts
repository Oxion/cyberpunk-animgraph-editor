import { computed, reactive, watch, type Ref } from 'vue'
import type { SimDriverHandle } from '../../utils/sim/simDriver'
import type {
  SimLookAtActiveEntry,
  SimLookAtDriver,
} from '../../utils/sim/simLookAtDriver'
import type { SimLookAtRequest } from '../../utils/sim/simServiceEvents'
import type { SimVec4 } from '../../utils/sim/evalAnimMathExpressionVector'

export type LookAtCreateDrafts = {
  part: string
  targetX: number
  targetY: number
  targetZ: number
  targetW: number
}

export type LookAtEntryDraft = {
  targetX: number
  targetY: number
  targetZ: number
  targetW: number
}

function draftFromTarget(t: SimVec4): LookAtEntryDraft {
  return {
    targetX: t.x,
    targetY: t.y,
    targetZ: t.z,
    targetW: t.w ?? 0,
  }
}

function targetFromDraft(d: LookAtEntryDraft): SimVec4 {
  return {
    x: d.targetX,
    y: d.targetY,
    z: d.targetZ,
    w: d.targetW,
  }
}

export function useSimLookAtDriverUi(
  handle: Ref<SimDriverHandle<SimLookAtDriver> | null | undefined>
) {
  const createDrafts = reactive<LookAtCreateDrafts>({
    part: 'Eyes',
    targetX: 0,
    targetY: 2,
    targetZ: 1,
    targetW: 0,
  })

  const entryDrafts = reactive<Record<number, LookAtEntryDraft>>({})
  const expanded = reactive<Record<number, boolean>>({})

  const active = computed((): SimLookAtActiveEntry[] => {
    void handle.value?.rev.value
    return handle.value?.driver.listActive() ?? []
  })

  watch(
    active,
    (entries) => {
      const live = new Set(entries.map((e) => e.id))
      for (const id of Object.keys(entryDrafts).map(Number)) {
        if (!live.has(id)) delete entryDrafts[id]
      }
      for (const id of Object.keys(expanded).map(Number)) {
        if (!live.has(id)) delete expanded[id]
      }
      for (const e of entries) {
        if (!entryDrafts[e.id]) entryDrafts[e.id] = draftFromTarget(e.targetWs)
        if (expanded[e.id] === undefined) expanded[e.id] = false
      }
    },
    { immediate: true }
  )

  const touch = () => handle.value?.touch()

  const addFromDrafts = (request?: Partial<SimLookAtRequest>) => {
    const h = handle.value
    if (!h) return null
    const id = h.driver.add(
      createDrafts.part,
      targetFromDraft(createDrafts),
      request
    )
    entryDrafts[id] = draftFromTarget(targetFromDraft(createDrafts))
    expanded[id] = true
    touch()
    return id
  }

  const setTarget = (id: number) => {
    const h = handle.value
    const d = entryDrafts[id]
    if (!h || !d) return
    h.driver.setTarget(id, targetFromDraft(d))
    touch()
  }

  const remove = (id: number) => {
    const h = handle.value
    if (!h) return
    h.driver.remove(id)
    delete entryDrafts[id]
    delete expanded[id]
    touch()
  }

  const clear = () => {
    handle.value?.driver.clear()
    for (const id of Object.keys(entryDrafts).map(Number)) delete entryDrafts[id]
    for (const id of Object.keys(expanded).map(Number)) delete expanded[id]
    touch()
  }

  return {
    createDrafts,
    entryDrafts,
    expanded,
    active,
    addFromDrafts,
    setTarget,
    remove,
    clear,
  }
}

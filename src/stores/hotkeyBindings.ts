import { computed, ref } from 'vue'
import type { AppCommandId } from '@/core/commands'
import {
  cloneHotkeyBindings,
  HotkeyRegistry,
  type HotkeyBindingConfig,
  type KeyChord,
} from '@/core/hotkeys'
import { loadMergedHotkeyBindings, saveHotkeyBindingsDiff, saveHotkeyChordOverrides } from '@/app/hotkeys/storage'
import { defaultHotkeyBindings } from '@/app/hotkeys/defaultBindings'
import { resolveAppPredicateContext } from '@/app/when/context'

const hotkeyRegistry = new HotkeyRegistry()

export const hotkeyBindingsRef = ref<Readonly<HotkeyBindingConfig[]>>([])

export const hotkeyBindingByIdComputed = computed<Readonly<Partial<Record<AppCommandId, HotkeyBindingConfig>>>>(() => {
  return hotkeyBindingsRef.value.reduce((acc, binding) => {
    acc[binding.id] = binding
    return acc
  }, {} as Partial<Record<AppCommandId, HotkeyBindingConfig>>)
})

export function initializeHotkeyBindings(): void {
  hotkeyBindingsRef.value = loadMergedHotkeyBindings()
  hotkeyRegistry.setBindings(hotkeyBindingsRef.value)
}

export function hasHotkeyBinding(id: AppCommandId): boolean {
  return !!hotkeyBindingByIdComputed.value[id]
}

export function getHotkeyBinding(id: AppCommandId): HotkeyBindingConfig | undefined {
  return hotkeyBindingByIdComputed.value[id]
}

export function getHotkeyChords(id: AppCommandId): KeyChord[] {
  return getHotkeyBinding(id)?.chords ?? []
}

export function getFirstHotkeyChord(id: AppCommandId): KeyChord | undefined {
  return getHotkeyChords(id)[0]
}

export function applyHotkeyBindings(bindings: HotkeyBindingConfig[]): void {
  hotkeyBindingsRef.value = bindings
  hotkeyRegistry.setBindings(bindings)
  saveHotkeyBindingsDiff(bindings)
}

export function setHotkeyChords(payload: { id: string; chords: KeyChord[] }): void {
  const next = cloneHotkeyBindings(hotkeyBindingsRef.value).map((binding) =>
    binding.id === payload.id
      ? { ...binding, chords: payload.chords.map((chord) => ({ ...chord })) }
      : binding
  )
  applyHotkeyBindings(next)
}

export function resetHotkeyBinding(id: string): void {
  const fallback = defaultHotkeyBindings.find((binding) => binding.id === id)
  if (!fallback) return
  setHotkeyChords({ id, chords: fallback.chords })
}

export function resetAllHotkeyBindings(): void {
  applyHotkeyBindings(cloneHotkeyBindings(defaultHotkeyBindings))
  saveHotkeyChordOverrides({})
}

export function handleHotkeyKeyDown(event: KeyboardEvent): void {
  hotkeyRegistry.handleKeydown(event, resolveAppPredicateContext())
}
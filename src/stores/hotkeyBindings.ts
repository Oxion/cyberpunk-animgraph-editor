import { ref } from 'vue'
import type { AppCommandId } from '../commands'
import {
  cloneHotkeyBindings,
  defaultHotkeyBindings,
  formatCommandShortcut,
  HotkeyRegistry,
  loadMergedHotkeyBindings,
  resolveHotkeyBindings,
  saveHotkeyBindingsDiff,
  saveHotkeyChordOverrides,
  type HotkeyBindingConfig,
  type KeyChord,
} from '../utils/hotkeys'

export const hotkeyBindings = ref<HotkeyBindingConfig[]>(loadMergedHotkeyBindings())

export const hotkeyRegistry = new HotkeyRegistry()
hotkeyRegistry.setBindings(resolveHotkeyBindings(hotkeyBindings.value))

export function commandShortcut(id: AppCommandId): string {
  return formatCommandShortcut(hotkeyBindings.value, id)
}

export function applyHotkeyBindings(bindings: HotkeyBindingConfig[]): void {
  hotkeyBindings.value = bindings
  hotkeyRegistry.setBindings(resolveHotkeyBindings(bindings))
  saveHotkeyBindingsDiff(bindings)
}

export function setHotkeyChords(payload: { id: string; chords: KeyChord[] }): void {
  const next = cloneHotkeyBindings(hotkeyBindings.value).map((binding) =>
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

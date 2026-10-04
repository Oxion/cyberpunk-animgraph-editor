import type { HotkeyBindingConfig, KeyChord } from './types'
import { defaultHotkeyBindings } from './defaultBindings'

const STORAGE_KEY = 'animgraph-editor.hotkeys.v1'

export type HotkeyChordOverrides = Record<string, KeyChord[]>

function cloneChords(chords: KeyChord[]): KeyChord[] {
  return chords.map((chord) => ({ ...chord }))
}

export function cloneHotkeyBindings(bindings: HotkeyBindingConfig[]): HotkeyBindingConfig[] {
  return bindings.map((binding) => ({
    ...binding,
    chords: cloneChords(binding.chords),
  }))
}

export function applyHotkeyOverrides(
  defaults: HotkeyBindingConfig[],
  overrides: HotkeyChordOverrides
): HotkeyBindingConfig[] {
  return defaults.map((binding) => {
    const override = overrides[binding.id]
    return {
      ...binding,
      chords: override ? cloneChords(override) : cloneChords(binding.chords),
    }
  })
}

export function loadHotkeyChordOverrides(): HotkeyChordOverrides {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const result: HotkeyChordOverrides = {}
    for (const [id, chords] of Object.entries(parsed as Record<string, unknown>)) {
      if (!Array.isArray(chords)) continue
      const valid = chords.filter(
        (chord): chord is KeyChord =>
          Boolean(chord) &&
          typeof chord === 'object' &&
          typeof (chord as KeyChord).key === 'string'
      )
      // Empty array is a valid explicit unbind (distinct from missing key).
      if (chords.length === 0 || valid.length > 0) result[id] = cloneChords(valid)
    }
    return result
  } catch {
    return {}
  }
}

export function saveHotkeyChordOverrides(overrides: HotkeyChordOverrides): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides))
  } catch {
    // ignore quota / private mode
  }
}

/** Persist only chords that differ from defaults. */
export function saveHotkeyBindingsDiff(bindings: HotkeyBindingConfig[]): void {
  const overrides: HotkeyChordOverrides = {}
  for (const binding of bindings) {
    const fallback = defaultHotkeyBindings.find((item) => item.id === binding.id)
    if (!fallback) continue
    const same =
      fallback.chords.length === binding.chords.length &&
      fallback.chords.every((chord, index) => {
        const other = binding.chords[index]
        if (!other) return false
        return (
          chord.key === other.key &&
          Boolean(chord.mod || chord.ctrl || chord.meta) ===
            Boolean(other.mod || other.ctrl || other.meta) &&
          Boolean(chord.shift) === Boolean(other.shift) &&
          Boolean(chord.alt) === Boolean(other.alt)
        )
      })
    if (!same) overrides[binding.id] = cloneChords(binding.chords)
  }
  saveHotkeyChordOverrides(overrides)
}

export function loadMergedHotkeyBindings(): HotkeyBindingConfig[] {
  return applyHotkeyOverrides(defaultHotkeyBindings, loadHotkeyChordOverrides())
}

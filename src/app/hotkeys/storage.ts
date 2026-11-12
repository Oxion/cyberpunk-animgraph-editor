import { HotkeyBindingConfig } from "@/core/hotkeys"
import { applyHotkeyOverrides, cloneChords, sameKeyChords } from "@/core/hotkeys/data"
import { HotkeyChordOverrides, KeyChord } from "@/core/hotkeys/types"
import { defaultHotkeyBindings } from "./defaultBindings"

const STORAGE_KEY = 'animgraph-editor.hotkeys.v1'

export function loadHotkeyChordOverrides(): HotkeyChordOverrides {
  try {
    const rawHotkeyChordOverrides = localStorage.getItem(STORAGE_KEY)
    if (!rawHotkeyChordOverrides) return {}

    const parsedHotkeyChordOverrides = JSON.parse(rawHotkeyChordOverrides) as unknown
    if (!parsedHotkeyChordOverrides || 
      typeof parsedHotkeyChordOverrides !== 'object' || 
      Array.isArray(parsedHotkeyChordOverrides)
    ) {
      return {}
    }

    const result: HotkeyChordOverrides = {}
    for (const [hotkeyBindingId, parsedChords] of Object.entries(parsedHotkeyChordOverrides)) {
      if (!Array.isArray(parsedChords)) continue

      const validChords = parsedChords.filter((chord): chord is KeyChord => {
        return Boolean(chord) &&
          typeof chord === 'object' &&
          typeof (chord as KeyChord).key === 'string'
      })

      // Empty array is a valid explicit unbind (distinct from missing key).
      if (!validChords.length) continue

      result[hotkeyBindingId] = cloneChords(validChords)
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
    if (sameKeyChords(fallback.chords, binding.chords)) continue
     overrides[binding.id] = cloneChords(binding.chords)
  }
  saveHotkeyChordOverrides(overrides)
}

export function loadMergedHotkeyBindings(): HotkeyBindingConfig[] {
  return applyHotkeyOverrides(defaultHotkeyBindings, loadHotkeyChordOverrides())
}
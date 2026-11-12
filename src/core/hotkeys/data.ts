import type { HotkeyBindingConfig, HotkeyChordOverrides, KeyChord } from './types'

export function normalizeHotkeyKey(key: string): string {
  if (key === ' ') return 'space'
  if (key.length === 1) return key.toLowerCase()
  return key
}

export function cloneChords(chords: Readonly<KeyChord[]>): KeyChord[] {
  return chords.map((chord) => ({ ...chord }))
}

export function cloneHotkeyBindings(bindings: Readonly<HotkeyBindingConfig[]>): HotkeyBindingConfig[] {
  return bindings.map((binding) => ({
    ...binding,
    chords: cloneChords(binding.chords),
  }))
}

export function chordsEqual(a: KeyChord, b: KeyChord): boolean {
  const aMod = Boolean(a.mod || a.ctrl || a.meta)
  const bMod = Boolean(b.mod || b.ctrl || b.meta)
  return (
    normalizeHotkeyKey(a.key) === normalizeHotkeyKey(b.key) &&
    aMod === bMod &&
    Boolean(a.shift) === Boolean(b.shift) &&
    Boolean(a.alt) === Boolean(b.alt)
  )
}

export function sameKeyChords(chords1: KeyChord[], chords2: KeyChord[]): boolean {
  return chords1.length === chords2.length && chords1.every((chord, index) => {
    const other = chords2[index]
    if (!other) return false

    return chordsEqual(chord, other)
  })
}

/** Replace chord at index, or append. Skips if an equal chord already exists elsewhere. */
export function upsertChord(
  chords: KeyChord[],
  chord: KeyChord,
  index: number | 'append'
): KeyChord[] {
  const next = chords.map((c) => ({ ...c }))
  const dupIndex = next.findIndex((c) => chordsEqual(c, chord))
  if (index === 'append') {
    if (dupIndex >= 0) return next
    next.push({ ...chord })
    return next
  }
  if (dupIndex >= 0 && dupIndex !== index) return next
  if (index < 0 || index >= next.length) {
    if (dupIndex >= 0) return next
    next.push({ ...chord })
    return next
  }
  next[index] = { ...chord }
  return next
}

export function removeChordAt(chords: KeyChord[], index: number): KeyChord[] {
  if (index < 0 || index >= chords.length) return chords.map((c) => ({ ...c }))
  return chords.filter((_, i) => i !== index).map((c) => ({ ...c }))
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
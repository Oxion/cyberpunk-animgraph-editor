import type { KeyChord } from './types'

export function normalizeHotkeyKey(key: string): string {
  if (key === ' ') return 'space'
  if (key.length === 1) return key.toLowerCase()
  return key
}

export function chordMatchesEvent(chord: KeyChord, event: KeyboardEvent): boolean {
  const eventKey = normalizeHotkeyKey(event.key)
  if (eventKey !== normalizeHotkeyKey(chord.key)) return false

  const wantMod = Boolean(chord.mod)
  const wantCtrl = Boolean(chord.ctrl) || wantMod
  const wantMeta = Boolean(chord.meta) || wantMod
  const wantShift = Boolean(chord.shift)
  const wantAlt = Boolean(chord.alt)

  if (wantMod) {
    if (!(event.ctrlKey || event.metaKey)) return false
  } else {
    if (event.ctrlKey !== wantCtrl) return false
    if (event.metaKey !== wantMeta) return false
  }

  if (event.shiftKey !== wantShift) return false
  if (event.altKey !== wantAlt) return false
  return true
}

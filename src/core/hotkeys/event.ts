import { normalizeHotkeyKey } from "./data"
import { KeyChord } from "./types"

const MODIFIER_KEYS = new Set(['control', 'shift', 'alt', 'meta', 'ctrl', 'os', 'hyper', 'altgraph'])

function isModifierKeyEvent(event: KeyboardEvent): boolean {
  const key = event.key.toLowerCase()
  if (MODIFIER_KEYS.has(key)) return true
  const code = event.code
  return (
    code.startsWith('Control') ||
    code.startsWith('Shift') ||
    code.startsWith('Alt') ||
    code.startsWith('Meta') ||
    code === 'OSLeft' ||
    code === 'OSRight'
  )
}

export function chordFromKeyboardEvent(event: KeyboardEvent): KeyChord | undefined {
  if (isModifierKeyEvent(event)) return

  const chord: KeyChord = { 
    key: normalizeHotkeyKey(event.key),
    mod: event.ctrlKey || event.metaKey,
    shift: event.shiftKey,
    alt: event.altKey,
  }

  return chord
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
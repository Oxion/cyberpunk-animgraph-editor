import { codeToShortKey } from "./data"
import { KeyChord } from "./types"

function isModifierKeyEvent(event: KeyboardEvent): boolean {
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

  const key = codeToShortKey(event.code)
  if (!key) return

  const chord: KeyChord = {
    key,
    mod: event.ctrlKey || event.metaKey,
    shift: event.shiftKey,
    alt: event.altKey,
  }

  return chord
}

/** Registry chords use KeyboardEvent.code; compare against event.code. */
export function chordMatchesEvent(chord: KeyChord, event: KeyboardEvent): boolean {
  if (event.code !== chord.key) return false

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

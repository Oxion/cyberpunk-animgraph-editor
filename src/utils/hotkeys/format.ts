import { getAppCommand, getAppCommandLabel, isAppCommandId, type AppCommandId } from '../../commands'
import { whenTrue, type AppContext, type AppFocus, type WhenPredicateMap } from '../../when'
import type { HotkeyBindingConfig, KeyChord } from './types'
import { normalizeHotkeyKey } from './match'

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

const SAMPLE_FOCUSES: AppFocus[] = ['graph', 'graphReadonly', 'ui', 'textInput', 'none']
const SAMPLE_TOOLS = ['move', 'resize', 'addNode', 'pasteNode', 'addConnection']
const SAMPLE_IN_PROGRESS = ['', 'move', 'resize', 'connectionDrag'] as const

export function formatChord(chord: KeyChord): string {
  const parts: string[] = []
  if (chord.mod || chord.ctrl || chord.meta) parts.push('Ctrl')
  if (chord.alt) parts.push('Alt')
  if (chord.shift) parts.push('Shift')
  const key = chord.key.length === 1 ? chord.key.toUpperCase() : chord.key
  parts.push(key === ' ' || key === 'space' ? 'Space' : key)
  return parts.join('+')
}

export function formatChords(chords: KeyChord[]): string {
  return chords.map(formatChord).join(' / ')
}

export function formatCommandShortcut(
  bindings: HotkeyBindingConfig[],
  id: AppCommandId
): string {
  const binding = bindings.find((item) => item.id === id)
  if (!binding?.chords[0]) return ''
  return formatChord(binding.chords[0])
}

export function chordFromKeyboardEvent(event: KeyboardEvent): KeyChord | null {
  if (isModifierKeyEvent(event)) return null

  const key = normalizeHotkeyKey(event.key)
  const chord: KeyChord = { key }
  if (event.ctrlKey || event.metaKey) chord.mod = true
  if (event.shiftKey) chord.shift = true
  if (event.altKey) chord.alt = true
  return chord
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

/** Representative runtime contexts used to test whether two `when` predicates can both fire. */
function* sampleAppContexts(): Generator<AppContext> {
  for (const focus of SAMPLE_FOCUSES) {
    for (const diagramEditable of [false, true]) {
      for (const focusedTool of SAMPLE_TOOLS) {
        for (const inProgressTool of SAMPLE_IN_PROGRESS) {
          for (const hasSelection of [false, true]) {
            for (const hasGraph of [false, true]) {
              for (const extraTools of [0, 1] as const) {
                yield {
                  focus,
                  diagramEditable,
                  focusedTool,
                  activeToolCount: (focusedTool ? 1 : 0) + extraTools,
                  inProgressTool,
                  hasSelection,
                  hasGraph,
                }
              }
            }
          }
        }
      }
    }
  }
}

function bindingActiveInContext(
  binding: Pick<HotkeyBindingConfig, 'id' | 'when' | 'allowInTextInput'>,
  ctx: AppContext,
  predicates: WhenPredicateMap
): boolean {
  if (ctx.focus === 'textInput' && !binding.allowInTextInput) return false
  const commandWhen = isAppCommandId(binding.id) ? getAppCommand(binding.id).when : undefined
  if (!whenTrue(commandWhen, ctx, predicates)) return false
  return whenTrue(binding.when, ctx, predicates)
}

/** True if there exists a realistic context where both bindings would be eligible. */
export function hotkeyContextsOverlap(
  a: Pick<HotkeyBindingConfig, 'id' | 'when' | 'allowInTextInput'>,
  b: Pick<HotkeyBindingConfig, 'id' | 'when' | 'allowInTextInput'>,
  predicates: WhenPredicateMap
): boolean {
  for (const ctx of sampleAppContexts()) {
    if (bindingActiveInContext(a, ctx, predicates) && bindingActiveInContext(b, ctx, predicates)) {
      return true
    }
  }
  return false
}

export function findChordConflicts(
  bindings: HotkeyBindingConfig[],
  bindingId: string,
  chords: KeyChord[],
  predicates: WhenPredicateMap
): string[] {
  const self = bindings.find((binding) => binding.id === bindingId)
  if (!self) return []

  const conflicts: string[] = []
  for (const other of bindings) {
    if (other.id === bindingId) continue
    const sharesChord = chords.some((chord) =>
      other.chords.some((otherChord) => chordsEqual(otherChord, chord))
    )
    if (!sharesChord) continue
    if (!hotkeyContextsOverlap(self, other, predicates)) continue
    conflicts.push(getAppCommandLabel(other.id))
  }
  return conflicts
}

import type { KeyChord } from './types'

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
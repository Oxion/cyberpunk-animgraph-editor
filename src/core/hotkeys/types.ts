import { WhenPredicate } from '@/core/when'
import type { AppCommandId } from '@/core/commands'

/** Serializable key chord for configs / future remapping UI. */
export interface KeyChord {
  /** Normalized key: lowercase letter, or platform key like ArrowUp / Escape / Enter */
  readonly key: string
  readonly ctrl?: boolean
  readonly shift?: boolean
  readonly alt?: boolean
  /** macOS Command; treat as interchangeable with ctrl in matcher when either is set as "mod". */
  readonly meta?: boolean
  /** If true, ctrl OR meta matches (Blender/VSCode-style mod). */
  readonly mod?: boolean
}

/**
 * Keybinding entry (VS Code `contributes.keybindings`).
 * `id` references a command in AppCommandMap.
 * `when` is extra on top of the command precondition (e.g. `graphFocused`).
 */
export interface HotkeyBindingConfig {
  /** Command id this binding triggers. */
  readonly id: AppCommandId
  readonly chords: KeyChord[]
  /** Named when-predicate; omit = command precondition only. */
  readonly when?: string
  readonly preventDefault?: boolean
  /**
   * If true, stop after this binding (even if action is a no-op).
   * Useful for in-progress tools that swallow keys.
   */
  readonly exclusive?: boolean
  /** If false, binding may run while focus is textInput. Default false. */
  readonly allowInTextInput?: boolean
}

export interface ResolvedHotkeyBinding extends HotkeyBindingConfig {
  readonly whenFn?: WhenPredicate
}

export type HotkeyChordOverrides = Record<string, KeyChord[]>

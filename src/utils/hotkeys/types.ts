import type { AppCommandId } from '../../commands'
import type { WhenPredicate } from '../../when'

/** Serializable key chord for configs / future remapping UI. */
export interface KeyChord {
  /** Normalized key: lowercase letter, or platform key like ArrowUp / Escape / Enter */
  key: string
  ctrl?: boolean
  shift?: boolean
  alt?: boolean
  /** macOS Command; treat as interchangeable with ctrl in matcher when either is set as "mod". */
  meta?: boolean
  /** If true, ctrl OR meta matches (Blender/VSCode-style mod). */
  mod?: boolean
}

/**
 * Keybinding entry (VS Code `contributes.keybindings`).
 * `id` references a command in AppCommandMap.
 * `when` is extra on top of the command precondition (e.g. `graphFocused`).
 */
export interface HotkeyBindingConfig {
  /** Command id this binding triggers. */
  id: AppCommandId
  chords: KeyChord[]
  /** Named when-predicate; omit = command precondition only. */
  when?: string
  preventDefault?: boolean
  /**
   * If true, stop after this binding (even if action is a no-op).
   * Useful for in-progress tools that swallow keys.
   */
  exclusive?: boolean
  /** If false, binding may run while focus is textInput. Default false. */
  allowInTextInput?: boolean
}

export interface ResolvedHotkeyBinding extends HotkeyBindingConfig {
  whenFn?: WhenPredicate
}

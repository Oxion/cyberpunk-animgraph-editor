import { getPredicate, PredicateContext } from '@/core/when'
import { executeCommand, type AppCommandArgs, type AppCommandId } from '@/core/commands'
import { shortKeyToCode } from './data'
import { chordMatchesEvent } from './event'
import type { HotkeyBindingConfig, ResolvedHotkeyBinding } from './types'

/** Command ids with no typed args — all current hotkey bindings. */
type ZeroArgCommandId = {
  [K in AppCommandId]: AppCommandArgs<K> extends undefined ? K : never
}[AppCommandId]

export class HotkeyRegistry {
  private _bindings: ResolvedHotkeyBinding[] = []

  setBindings(configs: Readonly<HotkeyBindingConfig[]>): void {
    this._bindings = HotkeyRegistry._resolvedBindings(configs)
  }

  /** Returns true if a binding handled the event. Command precondition AND binding when must pass. */
  handleKeydown(event: KeyboardEvent, ctx: PredicateContext): boolean {
    for (const binding of this._bindings) {
      if (ctx.focus === 'textInput' && !binding.allowInTextInput) continue
      
      if (binding.whenFn && !binding.whenFn(ctx)) continue

      if (!binding.chords.some((chord) => chordMatchesEvent(chord, event))) continue

      if (binding.preventDefault !== false) {
        event.preventDefault()
      }

      if (!executeCommand(binding.id as ZeroArgCommandId, ctx, event)) continue

      return true
    }
    return false
  }

  private static _resolvedBindings(
    configs: Readonly<HotkeyBindingConfig[]>,
  ): ResolvedHotkeyBinding[] {
    return configs.map((config) => {
      const whenFn = config.when 
        ? getPredicate(config.when)
        : undefined
      if (config.when && !whenFn) {
        console.warn(`[hotkeys] Unknown predicate "${config.when}" for binding "${config.id}"`)
      }
      return {
        ...config,
        chords: config.chords.map((chord) => ({
          ...chord,
          key: shortKeyToCode(chord.key),
        })),
        whenFn,
      }
    })
  }
}

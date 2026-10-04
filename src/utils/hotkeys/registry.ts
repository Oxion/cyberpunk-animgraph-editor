import { getAppCommand, getAppCommandHandler } from '../../commands'
import { defaultWhenPredicates, whenTrue, type AppContext, type WhenPredicateMap } from '../../when'
import type { HotkeyBindingConfig, ResolvedHotkeyBinding } from './types'
import { chordMatchesEvent } from './match'

export function resolveHotkeyBindings(
  configs: HotkeyBindingConfig[],
  predicates: WhenPredicateMap = defaultWhenPredicates
): ResolvedHotkeyBinding[] {
  return configs.map((config) => {
    const whenFn = config.when ? predicates[config.when] : undefined
    if (config.when && !whenFn) {
      console.warn(`[hotkeys] Unknown predicate "${config.when}" for binding "${config.id}"`)
    }
    return { ...config, whenFn }
  })
}

export class HotkeyRegistry {
  private bindings: ResolvedHotkeyBinding[] = []

  setBindings(bindings: ResolvedHotkeyBinding[]): void {
    this.bindings = bindings
  }

  /** Returns true if a binding handled the event. Command precondition AND binding when must pass. */
  handleKeydown(event: KeyboardEvent, ctx: AppContext): boolean {
    for (const binding of this.bindings) {
      if (ctx.focus === 'textInput' && !binding.allowInTextInput) continue
      const command = getAppCommand(binding.id)
      if (!whenTrue(command.when, ctx)) continue
      if (binding.whenFn && !binding.whenFn(ctx)) continue
      if (!binding.chords.some((chord) => chordMatchesEvent(chord, event))) continue

      if (binding.preventDefault !== false) {
        event.preventDefault()
      }

      const handler = getAppCommandHandler(binding.id)
      if (handler) {
        handler(event)
      } else if (!command.hidden) {
        console.warn(`[hotkeys] No handler registered for "${binding.id}"`)
      }

      return true
    }
    return false
  }
}

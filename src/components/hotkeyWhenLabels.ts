import type { HotkeyBindingConfig } from '../core/hotkeys'
import { getAppCommand, isAppCommandId } from '../core/commands'
import { APP_PREDICATE_LABELS } from '@/app/when/labels'

export function formatHotkeyWhenLabel(
  binding: Pick<HotkeyBindingConfig, 'id' | 'when' | 'allowInTextInput'>
): string {
  const bindingCommandWhen = isAppCommandId(binding.id) 
    ? getAppCommand(binding.id).when 
    : undefined

  const labelParts = []
  if (bindingCommandWhen) {
    labelParts.push(APP_PREDICATE_LABELS[bindingCommandWhen] ?? bindingCommandWhen)
  }
  if (binding.when && binding.when !== bindingCommandWhen) {
    labelParts.push(APP_PREDICATE_LABELS[binding.when] ?? binding.when)
  }
  if (binding.allowInTextInput) {
    labelParts.push('works in text fields')
  }

  return labelParts.join(' · ')
}

import type { HotkeyBindingConfig } from '../utils/hotkeys'
import { getAppCommand, isAppCommandId } from '../commands'
import { WHEN_LABELS } from '../when'

export function formatHotkeyWhenLabel(
  binding: Pick<HotkeyBindingConfig, 'id' | 'when' | 'allowInTextInput'>
): string {
  const commandWhen = isAppCommandId(binding.id) ? getAppCommand(binding.id).when : undefined
  const ids = [...new Set([commandWhen, binding.when].filter((id): id is string => Boolean(id)))]
  const base = ids.length
    ? ids.map((id) => WHEN_LABELS[id] ?? id).join(' · ')
    : WHEN_LABELS.always
  return binding.allowInTextInput ? `${base} · works in text fields` : base
}

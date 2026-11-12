import { getAppCommand } from "@/core/commands"
import { HotkeyBindingConfig } from "./types"
import { chordsEqual } from "./data"

export function findHotkeyBindingConflicts(
  bindings: HotkeyBindingConfig[],
  binding: HotkeyBindingConfig,
): HotkeyBindingConfig[] {
  const bindingId = binding.id
  const bindingWhen = binding.when
  const bindingChords = binding.chords
  const bindingCommandWhen = getAppCommand(bindingId).when

  const conflicts: HotkeyBindingConfig[] = []
  for (const other of bindings) {
    if (other.id === bindingId) continue

    if (other.when !== bindingWhen) continue

    const otherCommand = getAppCommand(other.id)
    if (otherCommand.when !== bindingCommandWhen) continue

    const sharesChord = bindingChords.some((chord) =>
      other.chords.some((otherChord) => chordsEqual(otherChord, chord))
    )
    if (!sharesChord) continue

    conflicts.push(other)
  }
  
  return conflicts
}
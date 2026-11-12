import { AppCommandDef } from "@/core/commands"

export const SelectionNudgeLeftCommandId = 'selection.nudgeLeft'

export interface SelectionNudgeLeftCommandDef extends AppCommandDef {
  id: typeof SelectionNudgeLeftCommandId
}

declare module '@/core/commands/types' {
  interface AppCommandMap {
    [SelectionNudgeLeftCommandId]: SelectionNudgeLeftCommandDef
  }
}

export const selectionNudgeLeftCommandDef: SelectionNudgeLeftCommandDef = {
  id: SelectionNudgeLeftCommandId,
  label: 'Nudge Selection Left',
  group: 'Nudge',
  when: 'canNudgeSelection',
}
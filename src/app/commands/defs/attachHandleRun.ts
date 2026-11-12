import { AppCommandDef } from "@/core/commands"

export const AttachHandleRunCommandId = 'attachHandle.run'

export interface AttachHandleRunCommandDef extends AppCommandDef {
  id: typeof AttachHandleRunCommandId
}

declare module '@/core/commands/types' {
  interface AppCommandMap {
    [AttachHandleRunCommandId]: AttachHandleRunCommandDef
  }
}

export const attachHandleRunCommandDef: AttachHandleRunCommandDef = {
  id: AttachHandleRunCommandId,
  label: 'Run Attach Handle',
  group: 'Add',
  when: 'graphEditable',
}
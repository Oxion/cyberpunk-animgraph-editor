import { AppCommandDef } from "@/core/commands"

export const AttachHandleDataFromSelectedCommandId = 'attachHandle.dataFromSelected'

export interface AttachHandleDataFromSelectedCommandDef extends AppCommandDef {
  id: typeof AttachHandleDataFromSelectedCommandId
}

declare module '@/core/commands/types' {
  interface AppCommandMap {
    [AttachHandleDataFromSelectedCommandId]: AttachHandleDataFromSelectedCommandDef
  }
}

export const attachHandleDataFromSelectedCommandDef: AttachHandleDataFromSelectedCommandDef = {
  id: AttachHandleDataFromSelectedCommandId,
  label: 'Attach Data From Selected',
  group: 'Add',
  when: 'graphEditable',
}
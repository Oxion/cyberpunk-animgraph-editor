import { AppCommandDef } from "@/core/commands"

export const AttachHandleClearCommandId = 'attachHandle.clear'

export interface AttachHandleClearCommandDef extends AppCommandDef {
  id: typeof AttachHandleClearCommandId
}

declare module '@/core/commands/types' {
  interface AppCommandMap {
    [AttachHandleClearCommandId]: AttachHandleClearCommandDef
  }
}

export const attachHandleClearCommandDef: AttachHandleClearCommandDef = {
  id: AttachHandleClearCommandId,
  label: 'Clear Attach Handle',
  group: 'Add',
}
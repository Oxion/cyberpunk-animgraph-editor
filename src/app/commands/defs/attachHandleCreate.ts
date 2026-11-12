import { AppCommandDef } from "@/core/commands"

export const AttachHandleCreateCommandId = 'attachHandle.create'

export interface AttachHandleCreateCommandDef extends AppCommandDef {
  id: typeof AttachHandleCreateCommandId
}

declare module '@/core/commands/types' {
  interface AppCommandMap {
    [AttachHandleCreateCommandId]: AttachHandleCreateCommandDef
  }
}

export const attachHandleCreateCommandDef: AttachHandleCreateCommandDef = {
  id: AttachHandleCreateCommandId,
  label: 'Create Attach Handle',
  group: 'Add',
}
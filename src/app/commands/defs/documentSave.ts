import { AppCommandDef } from "@/core/commands"

export const DocumentSaveCommandId = 'document.save'

export interface DocumentSaveCommandDef extends AppCommandDef {
  id: typeof DocumentSaveCommandId
}

declare module '@/core/commands/types' {
  interface AppCommandMap {
    [DocumentSaveCommandId]: DocumentSaveCommandDef
  }
}

export const documentSaveCommandDef: DocumentSaveCommandDef = {
  id: DocumentSaveCommandId,
  label: 'Save',
  group: 'File',
  when: 'canSaveProject',
}
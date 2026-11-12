import { AppCommandDef } from "@/core/commands"

export const DocumentSaveAsCommandId = 'document.saveAs'

export interface DocumentSaveAsCommandDef extends AppCommandDef {
  id: typeof DocumentSaveAsCommandId
}

declare module '@/core/commands/types' {
  interface AppCommandMap {
    [DocumentSaveAsCommandId]: DocumentSaveAsCommandDef
  }
}

export const documentSaveAsCommandDef: DocumentSaveAsCommandDef = {
  id: DocumentSaveAsCommandId,
  label: 'Save As',
  group: 'File',
  when: 'canSaveProject',
}
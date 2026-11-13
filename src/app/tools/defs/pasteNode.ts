export const pasteNodeToolId = 'pasteNode' as const

declare module '@/core/tools/types' {
  interface AppToolMap {
    [pasteNodeToolId]: {
      id: typeof pasteNodeToolId
      label: string
      when?: string
      hidden?: boolean
    }
  }
}

export const pasteNodeToolDef = {
  id: pasteNodeToolId,
  label: 'Paste Node',
  when: 'graphEditable',
} as const

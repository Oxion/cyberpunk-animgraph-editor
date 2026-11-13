export const attachHandleToolId = 'attachHandle' as const

declare module '@/core/tools/types' {
  interface AppToolMap {
    [attachHandleToolId]: {
      id: typeof attachHandleToolId
      label: string
      when?: string
      hidden?: boolean
    }
  }
}

export const attachHandleToolDef = {
  id: attachHandleToolId,
  label: 'Attach Handle',
  when: 'graphEditable',
} as const

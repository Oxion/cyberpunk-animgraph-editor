export const moveToolId = 'move' as const

declare module '@/core/tools/types' {
  interface AppToolMap {
    [moveToolId]: {
      id: typeof moveToolId
      label: string
      when?: string
      hidden?: boolean
    }
  }
}

export const moveToolDef = {
  id: moveToolId,
  label: 'Move',
  when: 'graphEditable',
} as const

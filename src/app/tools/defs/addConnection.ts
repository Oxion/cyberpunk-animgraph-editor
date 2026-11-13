export const addConnectionToolId = 'addConnection' as const

declare module '@/core/tools/types' {
  interface AppToolMap {
    [addConnectionToolId]: {
      id: typeof addConnectionToolId
      label: string
      when?: string
      hidden?: boolean
    }
  }
}

export const addConnectionToolDef = {
  id: addConnectionToolId,
  label: 'Add Connection',
  when: 'graphEditable',
} as const

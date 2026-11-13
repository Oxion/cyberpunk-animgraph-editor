export const addNodeToolId = 'addNode' as const

declare module '@/core/tools/types' {
  interface AppToolMap {
    [addNodeToolId]: {
      id: typeof addNodeToolId
      label: string
      when?: string
      hidden?: boolean
    }
  }
}

export const addNodeToolDef = {
  id: addNodeToolId,
  label: 'Add Node',
  when: 'graphEditable',
} as const

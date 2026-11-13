export const resizeToolId = 'resize' as const

declare module '@/core/tools/types' {
  interface AppToolMap {
    [resizeToolId]: {
      id: typeof resizeToolId
      label: string
      when?: string
      hidden?: boolean
    }
  }
}

export const resizeToolDef = {
  id: resizeToolId,
  label: 'Resize',
  when: 'graphEditable',
} as const

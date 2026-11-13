export const connectionDragToolId = 'connectionDrag' as const

declare module '@/core/tools/types' {
  interface AppToolMap {
    [connectionDragToolId]: {
      id: typeof connectionDragToolId
      label: string
      when?: string
      hidden?: boolean
    }
  }
}

/** Hidden modal gesture tool — no menu / panel body. */
export const connectionDragToolDef = {
  id: connectionDragToolId,
  label: 'Connection Drag',
  when: 'graphEditable',
  hidden: true,
} as const

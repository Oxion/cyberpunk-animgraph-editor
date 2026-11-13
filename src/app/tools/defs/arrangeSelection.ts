export const arrangeSelectionToolId = 'arrangeSelection' as const

declare module '@/core/tools/types' {
  interface AppToolMap {
    [arrangeSelectionToolId]: {
      id: typeof arrangeSelectionToolId
      label: string
      when?: string
      hidden?: boolean
    }
  }
}

export const arrangeSelectionToolDef = {
  id: arrangeSelectionToolId,
  label: 'Arrange Selection',
  when: 'graphEditable',
} as const

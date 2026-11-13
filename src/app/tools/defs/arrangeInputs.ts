export const arrangeInputsToolId = 'arrangeInputs' as const

declare module '@/core/tools/types' {
  interface AppToolMap {
    [arrangeInputsToolId]: {
      id: typeof arrangeInputsToolId
      label: string
      when?: string
      hidden?: boolean
    }
  }
}

export const arrangeInputsToolDef = {
  id: arrangeInputsToolId,
  label: 'Arrange Inputs',
  when: 'graphEditable',
} as const

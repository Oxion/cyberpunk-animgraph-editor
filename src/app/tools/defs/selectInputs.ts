export const selectInputsToolId = 'selectInputs' as const

declare module '@/core/tools/types' {
  interface AppToolMap {
    [selectInputsToolId]: {
      id: typeof selectInputsToolId
      label: string
      when?: string
      hidden?: boolean
    }
  }
}

export const selectInputsToolDef = {
  id: selectInputsToolId,
  label: 'Select Inputs',
  when: 'graphEditable',
} as const

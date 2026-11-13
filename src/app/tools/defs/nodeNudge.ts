export const nodeNudgeToolId = 'nodeNudge' as const

declare module '@/core/tools/types' {
  interface AppToolMap {
    [nodeNudgeToolId]: {
      id: typeof nodeNudgeToolId
      label: string
      when?: string
      hidden?: boolean
    }
  }
}

/** Hidden hold-to-nudge gesture — no menu / panel body. */
export const nodeNudgeToolDef = {
  id: nodeNudgeToolId,
  label: 'Node Nudge',
  when: 'graphEditable',
  hidden: true,
} as const

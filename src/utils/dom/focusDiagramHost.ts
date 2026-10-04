export const DIAGRAM_FOCUS_HOST_ATTR = 'data-diagram-focus-host'

export function focusDiagramHost(from: HTMLElement | null | undefined) {
  from?.closest<HTMLElement>(`[${DIAGRAM_FOCUS_HOST_ATTR}]`)?.focus({ preventScroll: true })
}

export function isFocusLeavingHost(event: FocusEvent, host: EventTarget | null | undefined): boolean {
  if (!(host instanceof Node)) return true
  const next = event.relatedTarget
  return !(next instanceof Node && host.contains(next))
}

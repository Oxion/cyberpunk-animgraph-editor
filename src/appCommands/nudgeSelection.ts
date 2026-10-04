import { nudgeSelection } from '../composables/tools/grabMove'

export function nudgeSelectionUp(event: KeyboardEvent) {
  nudgeSelection('up', event)
}

export function nudgeSelectionDown(event: KeyboardEvent) {
  nudgeSelection('down', event)
}

export function nudgeSelectionLeft(event: KeyboardEvent) {
  nudgeSelection('left', event)
}

export function nudgeSelectionRight(event: KeyboardEvent) {
  nudgeSelection('right', event)
}

import { Commands } from '../commands/ids'
import type { HotkeyBindingConfig } from '../../core/hotkeys/types'

/**
 * Default keymap as data. Remapping later = swap chords / when ids, keep command ids.
 * `when` here is extra on the command precondition (VS Code keybinding when).
 * Order = priority (first match wins).
 */
export const defaultHotkeyBindings: HotkeyBindingConfig[] = [
  {
    id: Commands.history.undo,
    chords: [{ key: 'z', mod: true }],
  },
  {
    id: Commands.history.redo,
    chords: [
      { key: 'y', mod: true },
      { key: 'z', mod: true, shift: true },
    ],
  },
  {
    id: Commands.document.save,
    chords: [{ key: 's', mod: true }],
    allowInTextInput: true,
  },
  {
    id: Commands.document.saveAs,
    chords: [{ key: 's', mod: true, shift: true }],
    allowInTextInput: true,
  },

  {
    id: Commands.connectionDrag.cancel,
    chords: [{ key: 'Escape' }],
  },

  {
    id: Commands.grabMove.cancel,
    chords: [{ key: 'Escape' }],
  },
  {
    id: Commands.grabMove.confirm,
    chords: [{ key: 'Enter' }],
  },
  {
    id: Commands.grabMove.lockX,
    chords: [{ key: 'x' }],
  },
  {
    id: Commands.grabMove.lockY,
    chords: [{ key: 'y' }],
  },

  {
    id: Commands.resize.cancel,
    chords: [{ key: 'Escape' }],
  },
  {
    id: Commands.resize.confirm,
    chords: [{ key: 'Enter' }],
  },
  {
    id: Commands.resize.lockTop,
    chords: [{ key: 'w' }],
  },
  {
    id: Commands.resize.lockLeft,
    chords: [{ key: 'a' }],
  },
  {
    id: Commands.resize.lockBottom,
    chords: [{ key: 's' }],
  },
  {
    id: Commands.resize.lockRight,
    chords: [{ key: 'd' }],
  },

  {
    id: Commands.grabMove.begin,
    chords: [{ key: 'g' }],
    when: 'graphFocused',
  },
  {
    id: Commands.resize.begin,
    chords: [{ key: 's' }],
    when: 'graphFocused',
  },

  {
    id: Commands.addNode.focus,
    chords: [{ key: 'a' }],
  },
  {
    id: Commands.addConnection.focus,
    chords: [{ key: 'c' }],
  },

  {
    id: Commands.selection.nudgeUp,
    chords: [{ key: 'ArrowUp' }],
    when: 'graphFocused',
  },
  {
    id: Commands.selection.nudgeDown,
    chords: [{ key: 'ArrowDown' }],
    when: 'graphFocused',
  },
  {
    id: Commands.selection.nudgeLeft,
    chords: [{ key: 'ArrowLeft' }],
    when: 'graphFocused',
  },
  {
    id: Commands.selection.nudgeRight,
    chords: [{ key: 'ArrowRight' }],
    when: 'graphFocused',
  },

  {
    id: Commands.selection.delete,
    chords: [{ key: 'Delete' }, { key: 'X' }],
    when: 'graphFocused',
  },

  {
    id: Commands.addConnection.pickFrom,
    chords: [{ key: 'q' }],
  },
  {
    id: Commands.addConnection.pickTo,
    chords: [{ key: 'e' }],
  },

  {
    id: Commands.selection.copy,
    chords: [{ key: 'c', mod: true }],
    when: 'graphFocused',
  },
  {
    id: Commands.nodes.paste,
    chords: [{ key: 'v', mod: true }],
    when: 'graphFocused',
  },
]

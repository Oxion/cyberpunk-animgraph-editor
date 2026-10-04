import type { HotkeyBindingConfig } from './types'

/**
 * Default keymap as data. Remapping later = swap chords / when ids, keep command ids.
 * `when` here is extra on the command precondition (VS Code keybinding when).
 * Order = priority (first match wins).
 */
export const defaultHotkeyBindings: HotkeyBindingConfig[] = [
  {
    id: 'history.undo',
    chords: [{ key: 'z', mod: true }],
  },
  {
    id: 'history.redo',
    chords: [
      { key: 'y', mod: true },
      { key: 'z', mod: true, shift: true },
    ],
  },
  {
    id: 'document.save',
    chords: [{ key: 's', mod: true }],
    allowInTextInput: true,
  },
  {
    id: 'document.saveAs',
    chords: [{ key: 's', mod: true, shift: true }],
    allowInTextInput: true,
  },

  {
    id: 'connectionDrag.cancel',
    chords: [{ key: 'Escape' }],
  },

  {
    id: 'grabMove.cancel',
    chords: [{ key: 'Escape' }],
  },
  {
    id: 'grabMove.confirm',
    chords: [{ key: 'Enter' }],
  },
  {
    id: 'grabMove.lockX',
    chords: [{ key: 'x' }],
  },
  {
    id: 'grabMove.lockY',
    chords: [{ key: 'y' }],
  },
  {
    id: 'grabMove.swallow',
    chords: [{ key: 'g' }],
    exclusive: true,
  },

  {
    id: 'resize.cancel',
    chords: [{ key: 'Escape' }],
  },
  {
    id: 'resize.confirm',
    chords: [{ key: 'Enter' }],
  },
  {
    id: 'resize.lockTop',
    chords: [{ key: 'w' }],
  },
  {
    id: 'resize.lockLeft',
    chords: [{ key: 'a' }],
  },
  {
    id: 'resize.lockBottom',
    chords: [{ key: 's' }],
  },
  {
    id: 'resize.lockRight',
    chords: [{ key: 'd' }],
  },
  {
    id: 'resize.swallow',
    chords: [{ key: 'g' }],
    exclusive: true,
  },

  {
    id: 'grabMove.begin',
    chords: [{ key: 'g' }],
    when: 'graphFocused',
  },
  {
    id: 'resize.begin',
    chords: [{ key: 's' }],
    when: 'graphFocused',
  },

  {
    id: 'addNode.focus',
    chords: [{ key: 'a' }],
  },
  {
    id: 'addConnection.focus',
    chords: [{ key: 'c' }],
  },

  {
    id: 'selection.nudgeUp',
    chords: [{ key: 'ArrowUp' }],
    when: 'graphFocused',
  },
  {
    id: 'selection.nudgeDown',
    chords: [{ key: 'ArrowDown' }],
    when: 'graphFocused',
  },
  {
    id: 'selection.nudgeLeft',
    chords: [{ key: 'ArrowLeft' }],
    when: 'graphFocused',
  },
  {
    id: 'selection.nudgeRight',
    chords: [{ key: 'ArrowRight' }],
    when: 'graphFocused',
  },

  {
    id: 'selection.delete',
    chords: [{ key: 'Delete' }, { key: 'X' }],
    when: 'graphFocused',
  },

  {
    id: 'addConnection.pickFrom',
    chords: [{ key: 'q' }],
  },
  {
    id: 'addConnection.pickTo',
    chords: [{ key: 'e' }],
  },

  {
    id: 'selection.copy',
    chords: [{ key: 'c', mod: true }],
    when: 'graphFocused',
  },
  {
    id: 'nodes.paste',
    chords: [{ key: 'v', mod: true }],
    when: 'graphFocused',
  },
]

// Shortcuts are stored as text such as `"alt+super+left"`: modifiers first (ctrl, alt, shift,
// super, in that order), then one key. `super` is the Windows key on Windows and the Super
// (logo) key on Linux; it stands where the macOS app uses ⌘.

import { Action } from './actions.ts'

/** The macOS defaults from `SplitDefaultShortcutHelpers.m` with ⌘ turned into `super`. */
export const DEFAULT_SHORTCUTS: readonly (readonly [Action, string])[] = [
  [Action.MoveToCenter, 'alt+super+c'],
  [Action.MoveToFullscreen, 'alt+super+f'],
  [Action.MoveToLeftHalf, 'alt+super+left'],
  [Action.MoveToRightHalf, 'alt+super+right'],
  [Action.MoveToTopHalf, 'alt+super+up'],
  [Action.MoveToBottomHalf, 'alt+super+down'],
  [Action.MoveToUpperLeft, 'ctrl+super+left'],
  [Action.MoveToLowerLeft, 'ctrl+shift+super+left'],
  [Action.MoveToUpperRight, 'ctrl+super+right'],
  [Action.MoveToLowerRight, 'ctrl+shift+super+right'],
  [Action.MoveToNextDisplay, 'ctrl+alt+super+right'],
  [Action.MoveToPreviousDisplay, 'ctrl+alt+super+left'],
  [Action.MoveToNextThird, 'ctrl+alt+right'],
  [Action.MoveToPreviousThird, 'ctrl+alt+left'],
  [Action.MakeLarger, 'ctrl+alt+shift+right'],
  [Action.MakeSmaller, 'ctrl+alt+shift+left'],
  [Action.UndoLastMove, 'alt+super+z'],
  [Action.RedoLastMove, 'alt+shift+super+z'],
  [Action.ArrangeWindows, 'alt+super+a']
]

export function defaultShortcut(action: Action): string | null {
  return DEFAULT_SHORTCUTS.find(([a]) => a === action)?.[1] ?? null
}

export type Modifiers = {
  ctrl: boolean
  alt: boolean
  shift: boolean
  logo: boolean
}

export function defaultModifiers(): Modifiers {
  return { ctrl: false, alt: false, shift: false, logo: false }
}

const NAMED_KEYS: readonly string[] = [
  'left',
  'right',
  'up',
  'down',
  'space',
  'enter',
  'tab',
  'backspace',
  'delete',
  'insert',
  'home',
  'end',
  'pageup',
  'pagedown',
  'minus',
  'equal',
  'bracketleft',
  'bracketright',
  'semicolon',
  'quote',
  'comma',
  'period',
  'slash',
  'backslash',
  'grave'
]

export function isKnownKey(key: string): boolean {
  const single = key.length === 1 && /^[a-z0-9]$/.test(key)
  const digits = key.startsWith('f') ? key.slice(1) : null
  const n = digits !== null && /^[0-9]+$/.test(digits) ? Number(digits) : null
  const fn = n !== null && n >= 1 && n <= 24
  return single || fn || NAMED_KEYS.includes(key)
}

function toAsciiLowercase(text: string): string {
  return text.replace(/[A-Z]/g, (c) => c.toLowerCase())
}

/**
 * One parsed shortcut. `key` is lower case: `a`–`z`, `0`–`9`, `f1`–`f24`, `left`, `right`,
 * `up`, `down`, `space`, `enter`, `tab`, `backspace`, `delete`, `insert`, `home`, `end`,
 * `pageup`, `pagedown`, `minus`, `equal`, `bracketleft`, `bracketright`, `semicolon`,
 * `quote`, `comma`, `period`, `slash`, `backslash`, `grave`.
 */
export class KeyCombo {
  modifiers: Modifiers
  key: string

  constructor(modifiers: Modifiers, key: string) {
    this.modifiers = modifiers
    this.key = key
  }

  static parse(text: string): KeyCombo | null {
    const modifiers = defaultModifiers()
    let key: string | null = null
    for (const part of text.split('+').map((p) => toAsciiLowercase(p.trim()))) {
      switch (part) {
        case 'ctrl':
        case 'control':
          modifiers.ctrl = true
          break
        case 'alt':
        case 'option':
          modifiers.alt = true
          break
        case 'shift':
          modifiers.shift = true
          break
        case 'super':
        case 'win':
        case 'meta':
        case 'cmd':
          modifiers.logo = true
          break
        default:
          if (key === null && isKnownKey(part)) {
            key = part
          } else {
            return null
          }
      }
    }
    if (key === null) {
      return null
    }
    // A shortcut without any modifier other than shift would swallow normal typing.
    if (!(modifiers.ctrl || modifiers.alt || modifiers.logo)) {
      return null
    }
    return new KeyCombo(modifiers, key)
  }

  /** The stored form, with modifiers in a fixed order so equal shortcuts compare equal. */
  toText(): string {
    const parts: string[] = []
    if (this.modifiers.ctrl) {
      parts.push('ctrl')
    }
    if (this.modifiers.alt) {
      parts.push('alt')
    }
    if (this.modifiers.shift) {
      parts.push('shift')
    }
    if (this.modifiers.logo) {
      parts.push('super')
    }
    parts.push(this.key)
    return parts.join('+')
  }

  /** The accelerator text GNOME Shell understands, for example `<Control><Super>Left`. */
  toGtkAccelerator(): string {
    let text = ''
    if (this.modifiers.ctrl) {
      text += '<Control>'
    }
    if (this.modifiers.alt) {
      text += '<Alt>'
    }
    if (this.modifiers.shift) {
      text += '<Shift>'
    }
    if (this.modifiers.logo) {
      text += '<Super>'
    }
    text += x11KeysymName(this.key)
    return text
  }
}

const X11_KEYSYM_NAMES: Readonly<Record<string, string>> = {
  left: 'Left',
  right: 'Right',
  up: 'Up',
  down: 'Down',
  space: 'space',
  enter: 'Return',
  tab: 'Tab',
  backspace: 'BackSpace',
  delete: 'Delete',
  insert: 'Insert',
  home: 'Home',
  end: 'End',
  pageup: 'Page_Up',
  pagedown: 'Page_Down',
  minus: 'minus',
  equal: 'equal',
  bracketleft: 'bracketleft',
  bracketright: 'bracketright',
  semicolon: 'semicolon',
  quote: 'apostrophe',
  comma: 'comma',
  period: 'period',
  slash: 'slash',
  backslash: 'backslash',
  grave: 'grave'
}

/** The X11 / GTK key name for one of our key names. */
export function x11KeysymName(key: string): string {
  if (Object.hasOwn(X11_KEYSYM_NAMES, key)) {
    return X11_KEYSYM_NAMES[key]!
  }
  if (key.startsWith('f') && key.length > 1) {
    return key.toUpperCase()
  }
  return key
}

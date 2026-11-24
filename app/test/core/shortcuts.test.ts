import assert from 'node:assert/strict'
import { test } from 'vitest'

import { ALL, Action } from '../../src/core/actions.ts'
import {
  DEFAULT_SHORTCUTS,
  defaultShortcut,
  KeyCombo,
  OTHER_SHORTCUTS
} from '../../src/core/shortcuts.ts'

test('every default parses and round trips', () => {
  for (const [action, text] of DEFAULT_SHORTCUTS) {
    const combo = KeyCombo.parse(text)
    assert.ok(combo !== null, action)
    assert.equal(combo.toText(), text)
  }
  assert.equal(new Set(DEFAULT_SHORTCUTS.map(([action]) => action)).size, DEFAULT_SHORTCUTS.length)
})

test('newer actions start without keys', () => {
  // Why: the person picks keys for these in Settings or runs them from the menu, so a new version never takes keys someone already uses.
  const unbound = [
    Action.MaximizeHeight,
    Action.MoveLeft,
    Action.MoveRight,
    Action.MoveUp,
    Action.MoveDown,
    Action.FirstTwoThirds,
    Action.LastTwoThirds
  ]
  for (const platform of ['darwin', 'win32', 'linux']) {
    for (const action of unbound) {
      assert.equal(defaultShortcut(action, platform), null, `${platform} ${action}`)
    }
  }
})

test('no two actions share a default on any system', () => {
  for (const platform of ['darwin', 'win32', 'linux']) {
    const texts = ALL.map((action) => defaultShortcut(action, platform)).filter(
      (text) => text !== null
    )
    assert.equal(new Set(texts).size, texts.length, platform)
  }
})

test('Windows and Linux defaults avoid the keys the system uses', () => {
  for (const text of Object.values(OTHER_SHORTCUTS)) {
    assert.equal(KeyCombo.parse(text)?.toText(), text)
  }
  // Ctrl+Win+←/→ switch desktops on Windows and KDE; Ctrl+Alt+←/→ switch workspaces on GNOME.
  const taken = ['ctrl+super+left', 'ctrl+super+right', 'ctrl+alt+left', 'ctrl+alt+right']
  for (const platform of ['win32', 'linux']) {
    for (const action of ALL) {
      assert.ok(!taken.includes(defaultShortcut(action, platform)!), `${platform} ${action}`)
    }
  }
  assert.equal(defaultShortcut('MoveToUpperLeft', 'darwin'), 'ctrl+super+left')
})

test('plain letters are refused', () => {
  assert.equal(KeyCombo.parse('a'), null)
  assert.equal(KeyCombo.parse('shift+a'), null)
  assert.equal(KeyCombo.parse('ctrl+nonsense'), null)
})

test('gnome accelerators', () => {
  const combo = KeyCombo.parse('ctrl+shift+super+left')
  assert.ok(combo !== null)
  assert.equal(combo.toGtkAccelerator(), '<Control><Shift><Super>Left')
})

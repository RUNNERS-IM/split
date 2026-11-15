import assert from 'node:assert/strict'
import { test } from 'vitest'

import { displayShortcut, shortcutKeys } from '../src/renderer/settings/keys.ts'

test('a shortcut splits into one name per key, modifiers first', () => {
  assert.deepEqual(shortcutKeys('ctrl+cmd+left', 'darwin'), ['⌃', '⌘', '←'])
  assert.deepEqual(shortcutKeys('alt+cmd+left', 'darwin'), ['⌥', '⌘', '←'])
  assert.deepEqual(shortcutKeys('ctrl+alt+left', 'win32'), ['Ctrl', 'Alt', 'Left'])
})

test('no shortcut gives no keys', () => {
  assert.deepEqual(shortcutKeys(null, 'darwin'), [])
  assert.deepEqual(shortcutKeys('', 'linux'), [])
})

test('the keys read the same as the one-line text', () => {
  for (const platform of ['darwin', 'win32', 'linux'] as const) {
    for (const text of ['ctrl+cmd+left', 'shift+alt+super+up', 'ctrl+alt+f']) {
      const keys = shortcutKeys(text, platform)
      const joined = platform === 'darwin' ? keys.join('') : keys.join('+')
      assert.equal(joined, displayShortcut(text, platform))
    }
  }
})

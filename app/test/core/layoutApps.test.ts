import assert from 'node:assert/strict'
import { test } from 'vitest'
import { closedApps } from '../../src/core/layoutApps.ts'

const saved = (bundle: string, display = 'A') => ({ bundle, display })

test('only apps with no open window are started, each once', () => {
  const windows = [saved('com.code'), saved('com.chrome'), saved('com.chrome'), saved('com.term')]
  assert.deepEqual(closedApps(windows, ['com.chrome'], ['A']), ['com.code', 'com.term'])
})

test('an app known by its name counts as open', () => {
  assert.deepEqual(
    closedApps([saved('Google Chrome')], ['com.google.Chrome', 'Google Chrome'], ['A']),
    []
  )
})

test('windows on a monitor that is not connected start nothing', () => {
  assert.deepEqual(closedApps([saved('com.code', 'B')], [], ['A']), [])
})

test('a window saved without an app starts nothing', () => {
  assert.deepEqual(closedApps([saved('')], [], ['A']), [])
})

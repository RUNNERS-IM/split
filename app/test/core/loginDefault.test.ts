import assert from 'node:assert/strict'
import { test } from 'vitest'

import { shouldTurnOnAtLogin } from '../../src/core/loginDefault.ts'

const base = { applied: false, store: false, wanted: true, on: false }

test('a new install turns open at login on', () => {
  assert.equal(shouldTurnOnAtLogin(base), true)
})

test('someone who came from the macOS app and was left off gets it on once', () => {
  // Their settings file already exists (moved over), but they never chose off.
  assert.equal(shouldTurnOnAtLogin({ ...base, wanted: true, on: false }), true)
})

test('a person who turned it off keeps it off', () => {
  assert.equal(shouldTurnOnAtLogin({ ...base, wanted: false }), false)
})

test('it is applied only once', () => {
  assert.equal(shouldTurnOnAtLogin({ ...base, applied: true }), false)
})

test('nothing to do when it is already on', () => {
  assert.equal(shouldTurnOnAtLogin({ ...base, on: true }), false)
})

test('the App Store build never turns it on by itself', () => {
  assert.equal(shouldTurnOnAtLogin({ ...base, store: true }), false)
})

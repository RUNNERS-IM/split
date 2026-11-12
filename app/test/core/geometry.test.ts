import assert from 'node:assert/strict'
import { test } from 'vitest'

import { Rect, rectWithGap, withoutHiddenDock } from '../../src/core/geometry.ts'

test('gap keeps screen edges flush', () => {
  const screen = new Rect(0, 0, 1920, 1040)
  const left = rectWithGap(new Rect(0, 0, 960, 1040), screen, 16)
  assert.deepEqual(left, new Rect(0, 0, 952, 1040))
  const right = rectWithGap(new Rect(960, 0, 960, 1040), screen, 16)
  assert.deepEqual(right, new Rect(968, 0, 952, 1040))
})

test('flipping twice is identity', () => {
  const r = new Rect(10, 20, 300, 400)
  assert.deepEqual(r.flipped().flipped(), r)
})

test('a hidden Dock gives its edge back, the menu bar stays out', () => {
  const frame = new Rect(0, 0, 1728, 1117)
  // m3-pro-1, 2026-11-12: 33 pt menu bar at the top, 76 pt of a hidden Dock at the bottom.
  const area = new Rect(0, 33, 1728, 1008)
  assert.deepEqual(withoutHiddenDock(frame, area, { hides: true, edge: 'bottom' }), new Rect(0, 33, 1728, 1084))
  assert.deepEqual(withoutHiddenDock(frame, area, { hides: false, edge: 'bottom' }), area)
  const leftDock = new Rect(70, 33, 1658, 1084)
  assert.deepEqual(withoutHiddenDock(frame, leftDock, { hides: true, edge: 'left' }), new Rect(0, 33, 1728, 1084))
  const rightDock = new Rect(0, 33, 1658, 1084)
  assert.deepEqual(withoutHiddenDock(frame, rightDock, { hides: true, edge: 'right' }), new Rect(0, 33, 1728, 1084))
})

test('a second monitor right of the main one keeps its own edges', () => {
  const frame = new Rect(1728, 0, 1920, 1080)
  const area = new Rect(1728, 25, 1920, 1055)
  assert.deepEqual(withoutHiddenDock(frame, area, { hides: true, edge: 'bottom' }), area)
})

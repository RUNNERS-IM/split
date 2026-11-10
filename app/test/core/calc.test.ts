import assert from 'node:assert/strict'
import { test } from 'vitest'

import { Action } from '../../src/core/actions.ts'
import { calculate } from '../../src/core/calc.ts'
import { Rect } from '../../src/core/geometry.ts'

const SCREEN = new Rect(0, 0, 1920, 1040)

function calc(action: Action, window: Rect): Rect {
  const rect = calculate(action, window, SCREEN, SCREEN)
  assert.ok(rect !== null)
  return rect
}

test('halves cycle through two thirds and one third', () => {
  const half = calc(Action.MoveToLeftHalf, new Rect(100, 100, 800, 600))
  assert.deepEqual(half, new Rect(0, 0, 960, 1040))
  const twoThirds = calc(Action.MoveToLeftHalf, half)
  assert.deepEqual(twoThirds, new Rect(0, 0, 1280, 1040))
  const oneThird = calc(Action.MoveToLeftHalf, twoThirds)
  assert.deepEqual(oneThird, new Rect(0, 0, 640, 1040))
  assert.deepEqual(calc(Action.MoveToLeftHalf, oneThird), half)
  const right = calc(Action.MoveToRightHalf, half)
  assert.deepEqual(calc(Action.MoveToRightHalf, right), new Rect(640, 0, 1280, 1040))
  assert.deepEqual(
    calc(Action.MoveToRightHalf, new Rect(640, 0, 1280, 1040)),
    new Rect(1280, 0, 640, 1040)
  )
})

test('top and bottom follow a downward y axis', () => {
  const top = calc(Action.MoveToTopHalf, new Rect(100, 100, 800, 600))
  assert.deepEqual(top, new Rect(0, 0, 1920, 520))
  const bottom = calc(Action.MoveToBottomHalf, new Rect(100, 100, 800, 600))
  assert.deepEqual(bottom, new Rect(0, 520, 1920, 520))
  const upperRight = calc(Action.MoveToUpperRight, new Rect(100, 100, 800, 600))
  assert.deepEqual(upperRight, new Rect(960, 0, 960, 520))
  const lowerLeft = calc(Action.MoveToLowerLeft, new Rect(100, 100, 800, 600))
  assert.deepEqual(lowerLeft, new Rect(0, 520, 960, 520))
})

test('center and fullscreen', () => {
  const centered = calc(Action.MoveToCenter, new Rect(0, 0, 800, 600))
  assert.deepEqual(centered, new Rect(560, 220, 800, 600))
  assert.deepEqual(calc(Action.MoveToFullscreen, new Rect(0, 0, 800, 600)), SCREEN)
})

test('thirds go left to right then top to bottom', () => {
  const first = calc(Action.MoveToNextThird, new Rect(100, 100, 800, 600))
  assert.deepEqual(first, new Rect(0, 0, 640, 1040))
  const second = calc(Action.MoveToNextThird, first)
  assert.deepEqual(second, new Rect(640, 0, 640, 1040))
  const third = calc(Action.MoveToNextThird, second)
  assert.deepEqual(third, new Rect(1280, 0, 640, 1040))
  const topRow = calc(Action.MoveToNextThird, third)
  assert.deepEqual(topRow, new Rect(0, 0, 1920, 346))
})

test('next display centers a window that fits', () => {
  const other = new Rect(1920, 0, 1280, 1000)
  const moved = calculate(Action.MoveToNextDisplay, new Rect(0, 0, 800, 600), SCREEN, other)
  assert.deepEqual(moved, new Rect(2160, 200, 800, 600))
})

test('larger grows by thirty points', () => {
  const larger = calc(Action.MakeLarger, new Rect(500, 200, 800, 600))
  assert.deepEqual(larger, new Rect(485, 185, 830, 630))
})

test('undo has no calculation', () => {
  assert.equal(calculate(Action.UndoLastMove, SCREEN, SCREEN, SCREEN), null)
})

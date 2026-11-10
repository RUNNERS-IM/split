// Auto-arrange layout. Port of `SplitArrangeLayoutRects` in
// `SplitWindowArranger.m`:
//
// 1 full · 2 halves · 3 left half + right column of two · 4 a 2×2 grid ·
// 5 a 2×2 grid with the front window floating in the middle at 60% ·
// 6 a 3×2 grid · 7 to 9 a 3×2 grid with the rest stacked in the middle at 60%, 30 px apart.

import { Rect, round } from './geometry.ts'

/** The most windows auto-arrange places. Windows after this stay where they are. */
export const MAXIMUM_WINDOW_COUNT = 9
/** Windows narrower or shorter than this are not arranged (tool palettes, tiny popups). */
export const MINIMUM_WINDOW_SIDE = 80

const FLOATING_SCALE = 0.6
const STACK_OFFSET = 30

function gridCell(frame: Rect, columns: number, rows: number, column: number, row: number): Rect {
  let width = Math.floor(frame.width / columns)
  let height = Math.floor(frame.height / rows)
  const x = frame.x + width * column
  const y = frame.y + height * row
  // The last column and row take what rounding left over so the grid fills the screen.
  if (column === columns - 1) {
    width = frame.maxX() - x
  }
  if (row === rows - 1) {
    height = frame.maxY() - y
  }
  return new Rect(x, y, width, height)
}

function floatingRect(frame: Rect, stackIndex: number): Rect {
  const width = round(frame.width * FLOATING_SCALE)
  const height = round(frame.height * FLOATING_SCALE)
  const x = round(frame.midX() - width / 2) + STACK_OFFSET * stackIndex
  const y = round(frame.midY() - height / 2) + STACK_OFFSET * stackIndex
  return new Rect(x, y, width, height)
}

/**
 * Where each window goes when `count` windows are arranged inside `frame` (top-left based).
 * The first rect is for the most recently used window.
 */
export function layoutRects(count: number, frame: Rect): Rect[] {
  count = Math.min(count, MAXIMUM_WINDOW_COUNT)
  const rects: Rect[] = []
  switch (count) {
    case 0:
      break
    case 1:
      rects.push(frame)
      break
    case 2:
      rects.push(gridCell(frame, 2, 1, 0, 0))
      rects.push(gridCell(frame, 2, 1, 1, 0))
      break
    case 3:
      rects.push(gridCell(frame, 2, 1, 0, 0))
      rects.push(gridCell(frame, 2, 2, 1, 0))
      rects.push(gridCell(frame, 2, 2, 1, 1))
      break
    case 4:
    case 5:
      if (count === 5) {
        rects.push(floatingRect(frame, 0))
      }
      for (let row = 0; row < 2; row++) {
        for (let column = 0; column < 2; column++) {
          rects.push(gridCell(frame, 2, 2, column, row))
        }
      }
      break
    default:
      for (let row = 0; row < 2; row++) {
        for (let column = 0; column < 3; column++) {
          rects.push(gridCell(frame, 3, 2, column, row))
        }
      }
      for (let index = 6; index < count; index++) {
        rects.push(floatingRect(frame, index - 6))
      }
  }
  return rects
}

import assert from "node:assert/strict";
import { test } from "node:test";

import { Action } from "../../src/core/actions.ts";
import { calculate } from "../../src/core/calc.ts";
import { Rect } from "../../src/core/geometry.ts";

const SCREEN = new Rect(0.0, 0.0, 1920.0, 1040.0);

function calc(action: Action, window: Rect): Rect {
  const rect = calculate(action, window, SCREEN, SCREEN);
  assert.ok(rect !== null);
  return rect;
}

test("halves cycle through two thirds and one third", () => {
  const half = calc(Action.MoveToLeftHalf, new Rect(100.0, 100.0, 800.0, 600.0));
  assert.deepEqual(half, new Rect(0.0, 0.0, 960.0, 1040.0));
  const twoThirds = calc(Action.MoveToLeftHalf, half);
  assert.deepEqual(twoThirds, new Rect(0.0, 0.0, 1280.0, 1040.0));
  const oneThird = calc(Action.MoveToLeftHalf, twoThirds);
  assert.deepEqual(oneThird, new Rect(0.0, 0.0, 640.0, 1040.0));
  assert.deepEqual(calc(Action.MoveToLeftHalf, oneThird), half);
  const right = calc(Action.MoveToRightHalf, half);
  assert.deepEqual(calc(Action.MoveToRightHalf, right), new Rect(640.0, 0.0, 1280.0, 1040.0));
  assert.deepEqual(calc(Action.MoveToRightHalf, new Rect(640.0, 0.0, 1280.0, 1040.0)), new Rect(1280.0, 0.0, 640.0, 1040.0));
});

test("top and bottom follow a downward y axis", () => {
  const top = calc(Action.MoveToTopHalf, new Rect(100.0, 100.0, 800.0, 600.0));
  assert.deepEqual(top, new Rect(0.0, 0.0, 1920.0, 520.0));
  const bottom = calc(Action.MoveToBottomHalf, new Rect(100.0, 100.0, 800.0, 600.0));
  assert.deepEqual(bottom, new Rect(0.0, 520.0, 1920.0, 520.0));
  const upperRight = calc(Action.MoveToUpperRight, new Rect(100.0, 100.0, 800.0, 600.0));
  assert.deepEqual(upperRight, new Rect(960.0, 0.0, 960.0, 520.0));
  const lowerLeft = calc(Action.MoveToLowerLeft, new Rect(100.0, 100.0, 800.0, 600.0));
  assert.deepEqual(lowerLeft, new Rect(0.0, 520.0, 960.0, 520.0));
});

test("center and fullscreen", () => {
  const centered = calc(Action.MoveToCenter, new Rect(0.0, 0.0, 800.0, 600.0));
  assert.deepEqual(centered, new Rect(560.0, 220.0, 800.0, 600.0));
  assert.deepEqual(calc(Action.MoveToFullscreen, new Rect(0.0, 0.0, 800.0, 600.0)), SCREEN);
});

test("thirds go left to right then top to bottom", () => {
  const first = calc(Action.MoveToNextThird, new Rect(100.0, 100.0, 800.0, 600.0));
  assert.deepEqual(first, new Rect(0.0, 0.0, 640.0, 1040.0));
  const second = calc(Action.MoveToNextThird, first);
  assert.deepEqual(second, new Rect(640.0, 0.0, 640.0, 1040.0));
  const third = calc(Action.MoveToNextThird, second);
  assert.deepEqual(third, new Rect(1280.0, 0.0, 640.0, 1040.0));
  const topRow = calc(Action.MoveToNextThird, third);
  assert.deepEqual(topRow, new Rect(0.0, 0.0, 1920.0, 346.0));
});

test("next display centers a window that fits", () => {
  const other = new Rect(1920.0, 0.0, 1280.0, 1000.0);
  const moved = calculate(Action.MoveToNextDisplay, new Rect(0.0, 0.0, 800.0, 600.0), SCREEN, other);
  assert.deepEqual(moved, new Rect(2160.0, 200.0, 800.0, 600.0));
});

test("larger grows by thirty points", () => {
  const larger = calc(Action.MakeLarger, new Rect(500.0, 200.0, 800.0, 600.0));
  assert.deepEqual(larger, new Rect(485.0, 185.0, 830.0, 630.0));
});

test("undo has no calculation", () => {
  assert.equal(calculate(Action.UndoLastMove, SCREEN, SCREEN, SCREEN), null);
});

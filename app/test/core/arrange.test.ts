import assert from "node:assert/strict";
import { test } from "vitest";

import { layoutRects, MAXIMUM_WINDOW_COUNT } from "../../src/core/arrange.ts";
import { Rect } from "../../src/core/geometry.ts";

const FRAME = new Rect(0.0, 0.0, 1921.0, 1041.0);

test("counts match the mac layouts", () => {
  for (let count = 0; count <= 12; count++) {
    assert.equal(layoutRects(count, FRAME).length, Math.min(count, MAXIMUM_WINDOW_COUNT));
  }
});

test("three windows are one big and two stacked", () => {
  const rects = layoutRects(3, FRAME);
  assert.deepEqual(rects[0], new Rect(0.0, 0.0, 960.0, 1041.0));
  assert.deepEqual(rects[1], new Rect(960.0, 0.0, 961.0, 520.0));
  assert.deepEqual(rects[2], new Rect(960.0, 520.0, 961.0, 521.0));
});

test("five windows float the front one", () => {
  const rects = layoutRects(5, FRAME);
  assert.deepEqual(rects[0], new Rect(384.0, 208.0, 1153.0, 625.0));
  assert.deepEqual(rects[4], new Rect(960.0, 520.0, 961.0, 521.0));
});
